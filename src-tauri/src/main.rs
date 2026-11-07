#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{fs, net::{SocketAddr, TcpStream}, path::{Path, PathBuf}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, thread, time::{Duration, Instant}};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri::webview::cookie::{Cookie, SameSite};
use tauri_plugin_shell::{ShellExt, process::{CommandChild, CommandEvent}};

const CONTROL: &str = "http://127.0.0.1:4323";
const ENTRY: &str = "http://127.0.0.1:4323/?study=rhine";
#[derive(Default)]
struct DesktopState { child: Mutex<Option<CommandChild>>, marker: Mutex<Option<PathBuf>>, stopping: AtomicBool, ready: AtomicBool }
impl DesktopState {
    fn stop(&self) {
        if self.stopping.swap(true, Ordering::SeqCst) { return; }
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.write(b"shutdown\n");
            thread::sleep(Duration::from_millis(1200));
            // shell 2.5 process-group mode kills the complete Windows Job / POSIX group.
            let _ = child.kill();
        }
        if let Some(marker) = self.marker.lock().unwrap().take() { let _=fs::remove_file(marker); }
    }
}
fn failure(message: &str) {
    eprintln!("Desktop startup failed: {message}");
    if std::env::var("COMPANION_DESKTOP_SMOKE").as_deref()==Ok("1") { return; }
    #[cfg(windows)] {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
        let text: Vec<u16> = message.encode_utf16().chain(Some(0)).collect();
        let title: Vec<u16> = "IVORG / Atelier Lab".encode_utf16().chain(Some(0)).collect();
        unsafe { MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), MB_OK | MB_ICONERROR); }
    }
    #[cfg(not(windows))] eprintln!("{message}");
}
fn copy_tree(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|_| "Cannot create desktop project directory")?;
    for item in fs::read_dir(from).map_err(|_| "Bundled project is missing")? {
        let item = item.map_err(|_| "Cannot read bundled project")?;
        let kind = item.file_type().map_err(|_| "Cannot inspect bundled resource")?;
        if kind.is_symlink() { return Err("Symlink in bundled project is not permitted".into()); }
        let target = to.join(item.file_name());
        if kind.is_dir() { copy_tree(&item.path(), &target)?; }
        else { fs::copy(item.path(), target).map_err(|_| "Cannot copy bundled project")?; }
    }
    Ok(())
}
fn project_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("apps/ivorg-website"));
    }
    let data = app.path().app_local_data_dir().map_err(|_| "App data directory unavailable")?;
    let root = data.join("projects/workspace-v1");
    if root.join(".desktop-project-ready").is_file() { return Ok(root); }
    let template = app.path().resource_dir().map_err(|_| "Resource directory unavailable")?.join("project");
    let staging = data.join(format!("projects/initializing-{}", uuid::Uuid::new_v4()));
    copy_tree(&template, &staging)?;
    fs::write(staging.join(".desktop-project-ready"), b"1\n").map_err(|_| "Cannot finalize project")?;
    if root.exists() { return Err("An incomplete desktop project exists; preserve and repair it before retrying".into()); }
    fs::rename(&staging, &root).map_err(|_| "Cannot activate desktop project")?;
    Ok(root)
}
fn bootstrap_cookie(root: &Path) -> Result<Cookie<'static>, String> {
    let content = fs::read_to_string(root.join(".companion/auth/bootstrap-owner.txt"))
        .map_err(|_| "Bootstrap credentials are unavailable. Restart the app: the launcher regenerates .companion/auth/bootstrap-owner.txt (rotating the local owner password) when it is missing")?;
    let mut user = None; let mut password = None;
    for line in content.lines() {
        if let Some(value) = line.strip_prefix("userId=") { user = Some(value.to_owned()); }
        if let Some(value) = line.strip_prefix("password=") { password = Some(value.to_owned()); }
    }
    let client = reqwest::blocking::Client::builder().no_proxy().timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none()).build().map_err(|_| "Cannot initialize loopback client")?;
    let response = client.post(format!("{CONTROL}/api/auth/login")).header("Origin", CONTROL)
        .json(&serde_json::json!({"userId":user.ok_or("Missing bootstrap userId")?,"password":password.ok_or("Missing bootstrap password")?}))
        .send().map_err(|_| "Local bootstrap login request failed")?;
    if !response.status().is_success() { return Err("Local bootstrap login was rejected; no credentials were injected".into()); }
    let header = response.headers().get(reqwest::header::SET_COOKIE).and_then(|value| value.to_str().ok()).ok_or("Missing authenticated session cookie")?;
    let token = header.strip_prefix("cw_session=").and_then(|value| value.split(';').next()).ok_or("Unexpected session cookie")?;
    if token.len()!=64 || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) { return Err("Invalid session token shape".into()); }
    Ok(Cookie::build(("cw_session", token.to_owned())).domain("127.0.0.1").path("/api")
        .http_only(true).same_site(SameSite::Strict).max_age(tauri::webview::cookie::time::Duration::hours(8)).build())
}
fn start(app: tauri::AppHandle, state: Arc<DesktopState>) -> Result<(), String> {
    for port in [4321, 4323] {
        let address: SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
        if TcpStream::connect_timeout(&address, Duration::from_millis(100)).is_ok() {
            return Err(format!("Port {port} is already in use. Close the existing Web workbench first. Its process has NOT been terminated."));
        }
    }
    let root = project_root(&app)?;
    let launch_id = uuid::Uuid::new_v4().to_string();
    let (mut events, child) = app.shell().sidecar("node-runtime").map_err(|_| "Bundled node-runtime missing")?
        .arg(root.join("scripts/tauri-runner.cjs")).arg("--root").arg(&root).current_dir(&root)
        .env("COMPANION_DESKTOP_LAUNCH", &launch_id).env("NODE_OPTIONS", "").env("NODE_PATH", "").set_process_group(true).spawn().map_err(|_| "Cannot spawn bundled runtime")?;
    let manager_pid=child.pid();
    let marker=root.join(".companion/desktop").join(format!("ready-{launch_id}.json"));
    *state.marker.lock().unwrap()=Some(marker.clone());
    *state.child.lock().unwrap() = Some(child);
    let launch_id_for_file=launch_id.clone();
    let event_state = state.clone(); let event_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    if let Some(value) = line.trim().strip_prefix("COMPANION_DESKTOP_READY ") {
                        if serde_json::from_str::<serde_json::Value>(value).ok().and_then(|value| value["launchId"].as_str().map(str::to_owned)).as_deref()==Some(launch_id.as_str()) {
                            event_state.ready.store(true, Ordering::SeqCst);
                        }
                    }
                }
                CommandEvent::Terminated(_) | CommandEvent::Error(_) => {
                    if !event_state.stopping.load(Ordering::SeqCst) {
                        event_state.stop(); failure("The local workbench stopped unexpectedly. Its owned process tree has been terminated."); event_app.exit(1);
                    }
                    break;
                }
                _ => {} // Drain all output; never forward cookies, credentials or raw child logs to JS.
            }
        }
    });
    let deadline = Instant::now()+Duration::from_secs(30);
    loop {
        if state.stopping.load(Ordering::SeqCst) { return Err("Desktop startup cancelled".into()); }
        let listening = [4321,4323].into_iter().all(|port| TcpStream::connect_timeout(&format!("127.0.0.1:{port}").parse().unwrap(), Duration::from_millis(80)).is_ok());
        let file_ready=fs::read(&marker).ok().and_then(|bytes|serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            .is_some_and(|proof|proof["launchId"].as_str()==Some(launch_id_for_file.as_str()) && proof["pid"].as_u64()==Some(manager_pid as u64) && proof["controlPort"]==4323 && proof["previewPort"]==4321);
        if listening && (file_ready || state.ready.load(Ordering::SeqCst)) { break; }
        if Instant::now()>=deadline { return Err(format!("Local servers were not ready within 30 seconds (tcp={listening}, marker={file_ready}, stream={})",state.ready.load(Ordering::SeqCst))); }
        thread::sleep(Duration::from_millis(500));
    }
    let cookie = bootstrap_cookie(&root)?;
    let window = WebviewWindowBuilder::new(&app,"main",WebviewUrl::External("about:blank".parse().unwrap()))
        .title("IVORG / ATELIER LAB").inner_size(1440.0,900.0).min_inner_size(1280.0,800.0)
        .theme(Some(tauri::Theme::Dark)).decorations(true).visible(false)
        .data_directory(app.path().app_local_data_dir().map_err(|_| "Missing Webview data directory")?.join("webview"))
        .on_navigation(|url| url.as_str()=="about:blank" || url.scheme()=="http" && url.host_str()==Some("127.0.0.1") && matches!(url.port(),Some(4321)|Some(4323)))
        .on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny)
        .build().map_err(|_| "Cannot create native WebView2 window")?;
    // Native HttpOnly cookie injection happens before navigation; no password/token in JavaScript.
    let expected_token=cookie.value().to_owned();
    window.set_cookie(cookie).map_err(|_| "Native session cookie injection failed")?;
    let stored=window.cookies_for_url(format!("{CONTROL}/api/auth/session").parse().unwrap()).map_err(|_| "Cannot verify native session cookie")?;
    if !stored.iter().any(|cookie| cookie.name()=="cw_session" && cookie.value()==expected_token && cookie.http_only()==Some(true)) {return Err("Native cookie read-back failed; no unauthenticated workbench was shown".into());}
    window.navigate(ENTRY.parse().unwrap()).map_err(|_| "Cannot navigate to control plane")?;
    window.show().map_err(|_| "Cannot show desktop window")?;
    if std::env::var("COMPANION_DESKTOP_SMOKE").as_deref()==Ok("1") {
        if let Ok(data)=app.path().app_local_data_dir(){let _=fs::create_dir_all(&data);let _=fs::write(data.join("desktop-smoke.json"),b"{\"cookieVerified\":true,\"entry\":\"http://127.0.0.1:4323/?study=rhine\",\"windowCloseRequested\":true}");}
        thread::sleep(Duration::from_secs(5));window.close().map_err(|_| "Smoke-test window close failed")?;
    }
    Ok(())
}
fn main() {
    let state=Arc::new(DesktopState::default());let setup_state=state.clone();
    let app=tauri::Builder::default().plugin(tauri_plugin_shell::init()).manage(state.clone())
        .setup(move |app| {
            let handle=app.handle().clone();let state=setup_state.clone();
            thread::spawn(move || {if let Err(error)=start(handle.clone(),state.clone()){let already_stopping=state.stopping.load(Ordering::SeqCst);state.stop();if !already_stopping{failure(&error);handle.exit(1);}}});
            Ok(())
        })
        .on_window_event(|window,event| {if window.label()=="main" && matches!(event,WindowEvent::Destroyed){window.state::<Arc<DesktopState>>().stop();}})
        .build(tauri::generate_context!()).expect("Native desktop initialization failed");
    app.run(move |_,event| {if matches!(event,RunEvent::ExitRequested{..}|RunEvent::Exit){state.stop();}});
}
