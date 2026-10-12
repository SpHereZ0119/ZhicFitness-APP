const { app, BrowserWindow, shell, session, protocol } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const root = path.resolve(__dirname, '..');
let windowRef;
protocol.registerSchemesAsPrivileged([{ scheme: 'zhic', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
if (process.env.ZHIC_TEST_PROFILE) app.setPath('userData', process.env.ZHIC_TEST_PROFILE);

function createWindow() {
  windowRef = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#f6f6f2',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windowRef.loadURL('zhic://app/index.html');
  windowRef.on('closed', () => { windowRef = null; });
}

app.whenReady().then(() => {
  protocol.handle('zhic', async request => {
    const url = new URL(request.url);
    const name = decodeURIComponent(url.pathname).slice(1) || 'index.html';
    if (url.host !== 'app' || !/^[a-z0-9-]+\.(html|mjs|css|js|webmanifest)$|^icons\/icon(-\d+)?\.(png|svg)$/.test(name)) return new Response('Not found', { status: 404 });
    try {
      const data = await fs.readFile(path.join(root, 'www', name));
      const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
      return new Response(data, { headers: { 'Content-Type': types[path.extname(name)], 'X-Content-Type-Options': 'nosniff' } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  if (process.env.ZHIC_TEST_PROFILE) session.defaultSession.on('will-download', (_event, item) => {
    item.setSavePath(path.join(process.env.ZHIC_TEST_PROFILE, path.basename(item.getFilename())));
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (!url.startsWith('zhic://app/')) event.preventDefault();
    });
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
