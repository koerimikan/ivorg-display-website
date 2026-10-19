let identityPromise;
export function identity() {
  identityPromise ??= fetch('/api/auth/session', { cache: 'no-store' }).then(async response => {
    if (response.status === 404) return { authenticated: true, legacy: true };
    if (!response.ok) throw Error('会话状态读取失败');
    return response.json();
  });
  return identityPromise;
}

export async function request(path, data, method = data === undefined ? 'GET' : 'POST') {
  const session = await identity();
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session.csrfToken ? { 'X-Companion-Token': session.csrfToken } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  const result = await response.json();
  if (!response.ok) {
    const error = Object.assign(Error(result.error + (result.detail ? ': ' + result.detail : '')), { code: result.error });
    if (response.status === 401) window.dispatchEvent(new CustomEvent('companion:session-expired'));
    throw error;
  }
  return result;
}

let permissions;
export async function capabilities() {
  permissions ??= await request('/api/change/session');
  return permissions;
}

export async function refreshCapabilities() {
  permissions = await request('/api/change/session');
  window.dispatchEvent(new CustomEvent('companion:capabilities', { detail: permissions }));
  return permissions;
}

export function guardButton(button, action, status) {
  const allowed = status.capabilities.includes(action);
  button.dataset.action = action;
  button.disabled = !allowed;
  button.title = allowed ? '' : `${status.recoveryRequired ? 'RECOVERY_REQUIRED：工作区只读' : `当前角色 ${status.actor.role} 无 ${action} 权限`}`;
  button.setAttribute('aria-disabled', String(!allowed));
}
