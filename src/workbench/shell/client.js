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

export function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
export function technicalData(value,label='原始契约数据'){
 const details=element('details'),summary=element('summary',label);details.append(summary,element('pre',JSON.stringify(value,null,2)));return details;
}
export function presentResult(host,value,{title='观测结果'}={}){
 host.replaceChildren(element('h3',title));
 const message=typeof value==='string'?value:value.explanation||value.summary||value.notice||value.message;
 if(message)host.append(element('p',typeof message==='string'?message:JSON.stringify(message),'result-message'));
 if(value.status||value.state||value.verdict)host.append(element('p',`状态 / ${value.status||value.state||value.verdict}`));
 if(value.proposal?.verdict)host.append(element('p',`结构同步 / ${value.proposal.verdict}`));
 const questions=value.clarifications||value.proposal?.clarifications;
 if(questions?.length){host.append(element('h3','需要你的说明'));for(const q of questions)host.append(element('p',typeof q==='string'?q:q.question||JSON.stringify(q)));}
 const blockers=value.blockers||value.proposal?.blockers;
 if(blockers?.length){host.append(element('h3','需解决的约束'));for(const blocker of blockers)host.append(element('p',typeof blocker==='string'?blocker:JSON.stringify(blocker),'status-error'));}
 const changes=value.changes||value.writePlan?.changes;
 if(changes?.length){for(const change of changes){const file=element('section',undefined,'diff-file');file.append(element('h3',change.file));const columns=element('div',undefined,'diff-columns'),before=element('div'),after=element('div');before.append(element('small','BEFORE'),element('pre',change.before));after.append(element('small','AFTER'),element('pre',change.after));columns.append(before,after);file.append(columns);host.append(file);}}
 if(value.diff?.length)for(const diff of value.diff){const file=element('section',undefined,'diff-file');file.append(element('h3',diff.file),element('pre',diff.unified));host.append(file);}
 if(value.structuralDiff?.length)for(const diff of value.structuralDiff){host.append(element('p',`${diff.file} / ${diff.before.length} → ${diff.after.length} 个结构记录`));}
 if(value.ops?.length){const list=element('ol');for(const op of value.ops)list.append(element('li',`${op.type} · ${op.file||op.objectId||'当前对象'}`));host.append(list);}
 if(!message&&!changes?.length&&!value.diff?.length&&!value.ops?.length&&!value.status&&!value.state&&!value.verdict)host.append(element('p',Array.isArray(value)?`${value.length} 条记录；展开契约数据查看详情。`:'数据已读取；展开契约数据查看详情。'));
 host.append(technicalData(value));
}
