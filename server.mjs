import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicFiles = new Set(['index.html', 'app.mjs', 'domain.mjs', 'storage.mjs', 'styles.css', 'development.mjs', 'fitness.mjs', 'diet.mjs', 'gaming.mjs', 'settings.mjs']);
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
export function createServer() {
  return http.createServer(async (req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!publicFiles.has(name)) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const data = await readFile(path.join(root, name));
      res.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'", 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    } catch { res.writeHead(500); res.end('Cannot read application file'); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? '端口 4317 已被使用。若应用已经启动，请打开 http://127.0.0.1:4317 。为保留同一份数据，请勿随意更换地址。' : error.message);
    process.exitCode = 1;
  });
  server.listen(4317, '127.0.0.1', () => {
    console.log('本地工作台已启动：http://127.0.0.1:4317（保持此窗口运行）');
    if (process.argv.includes('--open') && process.platform === 'win32') {
      const child = spawn('cmd.exe', ['/c', 'start', '', 'http://127.0.0.1:4317'], {windowsHide:true,stdio:'ignore'});
      child.on('error', () => console.log('请在浏览器打开上面的本机地址。'));
    }
  });
}
