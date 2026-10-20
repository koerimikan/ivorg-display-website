import { identity, request } from '/client.js';

const host = document.createElement('details');
host.className = 'account-panel';
host.setAttribute('aria-label', '本地账户');
document.getElementById('account-mount').append(host);
const state = await identity();
if (state.legacy) {
  const badge = document.createElement('summary'); badge.textContent = '[ OP // OBSERVER ]'; host.append(badge);
} else if (!state.authenticated) {
  host.hidden = true;
  const screen = document.createElement('section'); screen.className = 'login-screen';
  screen.setAttribute('aria-label','登录观测工作台'); document.body.append(screen);
  const form = document.createElement('form');
  const title = document.createElement('h1'); title.textContent = '进入你的世界线';
  const eyebrow = document.createElement('span'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'IVORG / LOCAL OBSERVATORY';
  const label = document.createElement('p');
  label.textContent = '登录本地工作台。首次 owner 凭据保存在本机 .companion/auth/bootstrap-owner.txt。';
  const user = document.createElement('input');
  user.name = 'userId'; user.placeholder = 'userId'; user.autocomplete = 'username'; user.required = true;
  const password = document.createElement('input');
  password.name = 'password'; password.type = 'password'; password.placeholder = '密码'; password.autocomplete = 'current-password'; password.required = true;
  const login = document.createElement('button'); login.textContent = '连接观测仪 ↗'; login.className = 'primary';
  const result = document.createElement('output'); result.setAttribute('aria-live', 'polite');
  user.setAttribute('aria-label','用户身份'); password.setAttribute('aria-label','密码');
  form.append(eyebrow,title,label, user, password, login, result); screen.append(form);
  form.addEventListener('submit', async event => {
    event.preventDefault(); login.disabled = true;
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.value, password: password.value }) });
      const value = await response.json();
      password.value = '';
      if (!response.ok) throw Error(value.error);
      location.reload();
    } catch (error) { result.textContent = error.message; login.disabled = false; }
  });
} else {
  const badge = document.createElement('summary'); badge.textContent = `[ OP // ${state.actor.role.toUpperCase()} ]`; host.append(badge);
  const content = document.createElement('div'); content.className = 'account-content'; host.append(content);
  const utilities = document.createElement('div'); utilities.id = 'account-utilities';
  const status = document.createElement('span'); status.textContent = `${state.actor.userId} / ${state.actor.role} / ${state.actor.projectId}`;
  const logout = document.createElement('button'); logout.textContent = '退出 / 切换身份（须重新登录）';
  logout.addEventListener('click', async () => { await request('/api/auth/logout', {}); location.reload(); });
  content.append(status, logout);
  if (state.actor.role === 'owner') {
    const form = document.createElement('form');
    const user = document.createElement('input'); user.placeholder = '新成员 userId'; user.required = true; user.autocomplete = 'off';
    const password = document.createElement('input'); password.type = 'password'; password.placeholder = '新成员密码（至少 12 位）'; password.minLength = 12; password.required = true; password.autocomplete = 'new-password';
    const role = document.createElement('select');
    for (const value of ['viewer', 'reviewer', 'editor', 'owner']) { const option = document.createElement('option'); option.value = value; option.textContent = value; role.append(option); }
    const add = document.createElement('button'); add.textContent = '创建本地成员';
    const output = document.createElement('output');
    form.append(user, password, role, add, output); content.append(form);
    form.addEventListener('submit', async event => {
      event.preventDefault(); add.disabled = true;
      try { await request('/api/auth/users', { userId: user.value, password: password.value, role: role.value }); password.value = ''; output.textContent = '成员已创建'; }
      catch (error) { output.textContent = error.message; }
      finally { add.disabled = false; }
    });
  }
  content.append(utilities); window.dispatchEvent(new CustomEvent('companion:account-ready'));
}
window.addEventListener('companion:session-expired', () => { host.textContent = '会话已失效，请刷新页面重新登录。'; });
