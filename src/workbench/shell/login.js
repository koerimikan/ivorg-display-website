import { identity, request } from '/client.js';

const host = document.createElement('section');
host.className = 'account-panel';
host.setAttribute('aria-label', '本地账户');
document.querySelector('header').after(host);
const state = await identity();
if (state.legacy) {
  host.textContent = 'P1 只读检视模式';
} else if (!state.authenticated) {
  const form = document.createElement('form');
  const label = document.createElement('p');
  label.textContent = '登录本地工作台。首次 owner 凭据保存在本机 .companion/auth/bootstrap-owner.txt。';
  const user = document.createElement('input');
  user.name = 'userId'; user.placeholder = 'userId'; user.autocomplete = 'username'; user.required = true;
  const password = document.createElement('input');
  password.name = 'password'; password.type = 'password'; password.placeholder = '密码'; password.autocomplete = 'current-password'; password.required = true;
  const login = document.createElement('button'); login.textContent = '登录 / 重新认证';
  const result = document.createElement('output'); result.setAttribute('aria-live', 'polite');
  form.append(label, user, password, login, result); host.append(form);
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
  const status = document.createElement('span'); status.textContent = `${state.actor.userId} / ${state.actor.role} / ${state.actor.projectId}`;
  const logout = document.createElement('button'); logout.textContent = '退出 / 切换身份（须重新登录）';
  logout.addEventListener('click', async () => { await request('/api/auth/logout', {}); location.reload(); });
  host.append(status, logout);
  if (state.actor.role === 'owner') {
    const form = document.createElement('form');
    const user = document.createElement('input'); user.placeholder = '新成员 userId'; user.required = true; user.autocomplete = 'off';
    const password = document.createElement('input'); password.type = 'password'; password.placeholder = '新成员密码（至少 12 位）'; password.minLength = 12; password.required = true; password.autocomplete = 'new-password';
    const role = document.createElement('select');
    for (const value of ['viewer', 'reviewer', 'editor', 'owner']) { const option = document.createElement('option'); option.value = value; option.textContent = value; role.append(option); }
    const add = document.createElement('button'); add.textContent = '创建本地成员';
    const output = document.createElement('output');
    form.append(user, password, role, add, output); host.append(form);
    form.addEventListener('submit', async event => {
      event.preventDefault(); add.disabled = true;
      try { await request('/api/auth/users', { userId: user.value, password: password.value, role: role.value }); password.value = ''; output.textContent = '成员已创建'; }
      catch (error) { output.textContent = error.message; }
      finally { add.disabled = false; }
    });
  }
}
window.addEventListener('companion:session-expired', () => { host.textContent = '会话已失效，请刷新页面重新登录。'; });
