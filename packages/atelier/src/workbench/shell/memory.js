import { identity, request, capabilities, guardButton } from '/client.js';
const account = await identity();
if (account.authenticated && !account.legacy) {
  const status = await capabilities();
  const section = document.createElement('section'); section.className = 'memory-panel';
  const heading = document.createElement('h2'); heading.textContent = '作用域记忆 / 事件审计 / CodeAct'; section.append(heading);
  const output = document.createElement('pre');
  const query = document.createElement('input'); query.placeholder = 'FTS5 查询'; query.setAttribute('aria-label', '记忆全文搜索');
  const search = document.createElement('button'); search.textContent = '搜索自己的记忆及项目共享记忆'; guardButton(search, 'memory.read', status);
  search.addEventListener('click', async () => { try { output.textContent = JSON.stringify(await request('/api/memory/search', { query: query.value }), null, 2); } catch (error) { output.textContent = error.message; } });
  const events = document.createElement('button'); events.textContent = '查看操作与对话事件'; guardButton(events, 'memory.read', status);
  events.addEventListener('click', async () => { output.textContent = JSON.stringify((await request('/api/memory/events')).slice(-100), null, 2); });
  const slots = document.createElement('button'); slots.textContent = '查看确定性参数槽'; guardButton(slots, 'memory.read', status);
  slots.addEventListener('click', async () => { output.textContent = JSON.stringify(await request('/api/memory/slots'), null, 2); });
  const font = document.createElement('input'); font.placeholder = '个人字体偏好';
  const saveFont = document.createElement('button'); saveFont.textContent = '保存个人字体槽'; guardButton(saveFont, 'slot.write', status);
  saveFont.addEventListener('click', async () => { try { output.textContent = JSON.stringify(await request('/api/memory/slot', { scope: 'user', scopeId: account.actor.userId, key: 'font.family', value: font.value }), null, 2); } catch (error) { output.textContent = error.message; } });
  const note = document.createElement('textarea'); note.placeholder = '需要明确记住的个人事实（不用于授权）';
  const remember = document.createElement('button'); remember.textContent = '记录个人事实'; guardButton(remember, 'memory.write', status);
  remember.addEventListener('click', async () => { try { output.textContent = JSON.stringify(await request('/api/memory/remember', { id: crypto.randomUUID(), content: note.value, scope: 'user' }), null, 2); } catch (error) { output.textContent = error.message; } });
  const backend = await request('/api/memory/sandbox');
  const sandboxStatus = document.createElement('p'); sandboxStatus.textContent = backend.available ? '已验证 Linux 容器后端可用' : `CodeAct 已关闭：${backend.code} / ${backend.reason}`;
  const script = document.createElement('textarea'); script.value = 'import fs from "node:fs";\nconst context = JSON.parse(fs.readFileSync("/in/memory/users/' + account.actor.userId + '/context.json", "utf8"));\nfs.writeFileSync("/out/summary.json", JSON.stringify(context.parameters.values));'; script.setAttribute('aria-label', 'CodeAct 记忆脚本');
  const run = document.createElement('button'); run.textContent = '在已验证的沙箱中运行脚本'; guardButton(run, 'codeact.run', status); run.disabled ||= !backend.available; if (!backend.available) run.title = 'SANDBOX_UNAVAILABLE：禁止在宿主机执行';
  run.addEventListener('click', async () => { run.disabled = true; try { const bytes = new TextEncoder().encode(script.value), scriptSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join(''); output.textContent = JSON.stringify(await request('/api/memory/codeact', { language: 'node', script: script.value, scriptSha256, taskScope: { network: false, secrets: false, sourceWrite: false }, timeoutMs: 5000, maxOutputBytes: 16384, inputFiles: [`memory/users/${account.actor.userId}/context.json`] }), null, 2); } catch (error) { output.textContent = error.message; } finally { run.disabled = !backend.available; } });
  const advanced = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = '记忆 · 偏好 · 隔离沙箱'; advanced.append(summary,section);
  section.append(query, search, events, slots, font, saveFont, note, remember, sandboxStatus, script, run, output);
  const mount=()=>{const target=document.getElementById('account-utilities');if(target)target.append(advanced);};mount();window.addEventListener('companion:account-ready',mount,{once:true});
}
