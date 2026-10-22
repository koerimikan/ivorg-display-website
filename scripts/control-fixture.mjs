import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { projectFixture } from './project-fixture.mjs';
import { createControlServer } from '../packages/atelier/src/workbench-server/server.js';

export async function authenticatedControl(t) {
  const cleanup = [];
  const root = await projectFixture({ after: callback => cleanup.push(callback) });
  const control = await createControlServer({ root, port: 0, enableWrites: true });
  t.after(async () => { await control.stop(); for (const callback of cleanup.reverse()) await callback(); });
  const origin = `http://127.0.0.1:${control.server.address().port}`;
  const bootstrap = await readFile(path.join(root, '.companion/auth/bootstrap-owner.txt'), 'utf8');
  const password = /password=(.+)/.exec(bootstrap)[1];
  async function login(userId, password) {
    const response = await fetch(origin + '/api/auth/login', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, password })
    });
    const value = await response.json();
    if (!response.ok) return { status: response.status, value };
    return { status: response.status, cookie: response.headers.get('set-cookie').split(';')[0], token: value.csrfToken, actor: value.actor };
  }
  async function request(session, route, data, headers = {}) {
    const response = await fetch(origin + route, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, ...(session ? { Cookie: session.cookie, 'X-Companion-Token': session.token } : {}), 'Content-Type': 'application/json', ...headers },
      ...(data === undefined ? {} : { body: JSON.stringify(data) })
    });
    return { status: response.status, value: await response.json(), headers: response.headers };
  }
  const owner = await login('owner', password);
  if (owner.status !== 200) throw Error('Owner bootstrap login failed');
  return { root, origin, control, owner, request, login, password };
}
