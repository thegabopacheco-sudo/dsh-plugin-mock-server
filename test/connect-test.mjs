// Test end-to-end de mock-server.
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
mkdirSync(home, { recursive: true });

function makeClient(extraEnv = {}) {
  const entry = process.env.MOCKSERVER_SERVER ? path.resolve(process.env.MOCKSERVER_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home, ...extraEnv }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'mockserver-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
console.log('--- status ---'); console.log(textOf(await client.callTool({ name: 'status', arguments: {} })));
const noConfirm = await client.callTool({ name: 'start', arguments: { routes: [{ path: '/health' }] } });
console.log('start sin confirm isError:', noConfirm.isError === true);
const started = await client.callTool({ name: 'start', arguments: { routes: [
  { path: '/health', status: 200, body: '{"ok":true}' },
  { method: 'POST', path: '/users', status: 201, body: '{"created":true}' },
  { path: '/error', status: 500, body: 'boom' },
], port: 0, confirm: true } });
const startedText = textOf(started);
console.log('--- start ---'); console.log(startedText);
const port = Number((startedText.match(/127\.0\.0\.1:(\d+)/) || [])[1]);
console.log('puerto asignado:', port > 0);
const health = await fetch(`http://127.0.0.1:${port}/health`);
console.log('GET /health:', health.status, await health.text());
const created = await fetch(`http://127.0.0.1:${port}/users`, { method: 'POST', body: 'x' });
console.log('POST /users:', created.status);
const error = await fetch(`http://127.0.0.1:${port}/error`);
console.log('GET /error:', error.status);
const notFound = await fetch(`http://127.0.0.1:${port}/nada`);
console.log('ruta desconocida 404:', notFound.status === 404);
const status = textOf(await client.callTool({ name: 'status', arguments: {} }));
console.log('status activo:', status.includes('activo'));
const stopped = await client.callTool({ name: 'stop', arguments: { confirm: true } });
console.log('--- stop ---'); console.log(textOf(stopped));
await client.close(); try { await transport.close?.(); } catch {}
console.log('OK');
