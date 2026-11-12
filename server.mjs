#!/usr/bin/env node
// dsh-plugin-mock-server — servidor HTTP local de mocks.
// Tools: status, start, stop.

import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const CACHE_DIR = path.join(DSH_HOME, 'cache', 'mock-server');
const READ_ONLY = String(process.env.DSH_MOCKSERVER_MODE || '').toLowerCase() === 'read-only';
const HOST = '127.0.0.1';
const MAX_ROUTES = 30;
const log = (m) => process.stderr.write(`[mockserver] ${m}\n`);

let activeServer = null;
let activePort = null;
let routeCount = 0;

const routeSchema = z.object({ method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(), path: z.string().min(1).max(200), status: z.number().int().min(100).max(599).optional(), body: z.string().max(200000).optional(), contentType: z.string().max(100).optional() });
function normalizeRoutes(routes) {
  if (!Array.isArray(routes) || routes.length === 0) throw new Error('routes vacío');
  if (routes.length > MAX_ROUTES) throw new Error(`máximo ${MAX_ROUTES} rutas`);
  return routes.map((route) => ({ method: (route.method || 'GET').toUpperCase(), path: route.path.startsWith('/') ? route.path : `/${route.path}`, status: route.status ?? 200, body: route.body ?? '', contentType: route.contentType || (route.body && route.body.trim().startsWith('{') ? 'application/json' : 'text/plain') }));
}
function startServer(routes, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const match = routes.find((route) => route.method === request.method && route.path === request.url);
      if (!match) { response.writeHead(404, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: 'ruta no mockeada' })); return; }
      response.writeHead(match.status, { 'content-type': match.contentType });
      response.end(match.body);
    });
    server.once('error', (error) => reject(new Error(`no se pudo escuchar: ${error.message}`)));
    server.listen(port, HOST, () => { activeServer = server; activePort = server.address().port; routeCount = routes.length; resolve(activePort); });
  });
}
function stopServer() {
  return new Promise((resolve) => {
    if (!activeServer) return resolve(false);
    const server = activeServer;
    activeServer = null; activePort = null; routeCount = 0;
    server.close(() => resolve(true));
  });
}
function textResult(text) { return { content: [{ type: 'text', text }] }; }

function buildInstructions() {
  return [
    'Mock Server: servidor HTTP local de mocks para probar integraciones.',
    '',
    `Bind: ${HOST} (solo local)`,
    '',
    'Herramientas: status, start, stop.',
    '',
    'Reglas:',
    '- start requiere confirm:true; define rutas {method, path, status, body, contentType}.',
    '- Escucha solo en 127.0.0.1; usa port 0 para puerto libre.',
    '- stop requiere confirm:true; reporta el puerto real.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-mock-server', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });
  server.registerTool('status', { title: 'Estado', description: 'Servidor activo y rutas.', inputSchema: z.object({}) }, async () => textResult([`Servidor: ${activeServer ? `activo en http://${HOST}:${activePort}` : 'detenido'}`, `Rutas: ${routeCount}`, `Modo: ${READ_ONLY ? 'read-only' : 'normal'}`].join('\n')));
  server.registerTool('start', { title: 'Iniciar mock', description: 'Levanta el servidor con rutas. Requiere confirm:true.', inputSchema: z.object({ routes: z.array(routeSchema).min(1).max(MAX_ROUTES), port: z.number().int().min(0).max(65535).optional(), confirm: z.boolean().optional() }) }, async (args) => {
    if (READ_ONLY) throw new Error('modo read-only: start deshabilitado');
    if (args.confirm !== true) throw new Error('start requiere confirm:true y pedido explícito');
    if (activeServer) await stopServer();
    const routes = normalizeRoutes(args.routes);
    const port = await startServer(routes, args.port ?? 0);
    return textResult([`Mock activo: http://${HOST}:${port}`, `Rutas: ${routes.length}`, ...routes.map((route) => `- ${route.method} ${route.path} → ${route.status}`)].join('\n'));
  });
  server.registerTool('stop', { title: 'Detener mock', description: 'Detiene el servidor. Requiere confirm:true.', inputSchema: z.object({ confirm: z.boolean().optional() }) }, async (args) => {
    if (READ_ONLY) throw new Error('modo read-only: stop deshabilitado');
    if (args.confirm !== true) throw new Error('stop requiere confirm:true');
    const stopped = await stopServer();
    return textResult(stopped ? 'Servidor detenido.' : 'No había servidor activo.');
  });
  return server;
}

try { mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignora */ }
log(`modo: ${READ_ONLY ? 'read-only' : 'normal'}`);
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
