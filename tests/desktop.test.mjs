import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildWeb, root } from '../scripts/build-web.mjs';
import { nav, submit } from './browser-helpers.mjs';

const require = createRequire(import.meta.url);
const { _electron } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
test('重复启动独立软件会返回原窗口，不争抢数据库或丢失已保存内容', async () => {
  await buildWeb();
  const profile = await mkdtemp(path.join(os.tmpdir(), 'zhic-single-instance-'));
  const executablePath = process.env.ZHIC_DESKTOP_EXECUTABLE || require('electron');
  const args = process.env.ZHIC_DESKTOP_EXECUTABLE ? [] : [path.join(root, 'electron/main.cjs')];
  const env = { ...process.env, ZHIC_TEST_PROFILE: profile };
  const desktop = await _electron.launch({ executablePath, args, env, timeout: 30000 });
  let duplicate;
  try {
    const p = await desktop.firstWindow();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    await p.getByRole('button', { name: '＋ 记一笔', exact: true }).click();
    await p.getByLabel('备忘内容', { exact: true }).fill('重复启动仍保留已保存的备忘');
    await submit(p);
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
    duplicate = spawn(executablePath, args, { env, windowsHide: true, stdio: 'ignore' });
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => resolve('仍在运行'), 8000);
      duplicate.once('error', error => { clearTimeout(timeout); reject(error); });
      duplicate.once('exit', code => { clearTimeout(timeout); resolve(code); });
    });
    assert.equal(result, 0, '第二次启动必须退出并将用户带回原窗口');
    await p.waitForFunction(() => document.visibilityState === 'visible');
    assert.deepEqual(await desktop.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      return { count: windows.length, visible: windows[0]?.isVisible(), minimized: windows[0]?.isMinimized() };
    }), { count: 1, visible: true, minimized: false });
    assert.equal(await p.locator('#save-status').textContent(), '已保存');
    assert.equal(await p.locator('nav a').count(), 8);
    assert.match(await p.locator('.memo-content').textContent(), /重复启动仍保留已保存的备忘/);
    const saved = await p.evaluate(async () => {
      const { openDatabase, loadState } = await import('./storage.mjs');
      const db = await openDatabase();
      try { return (await loadState(db)).memos[0].content; } finally { db.close(); }
    });
    assert.equal(saved, '重复启动仍保留已保存的备忘');
  } finally {
    if (duplicate && duplicate.exitCode === null) duplicate.kill();
    await desktop.close();
  }
});
test('Windows 程序无需网页服务器，关闭重开保留数据与备份', async () => {
  await buildWeb();
  const profile = await mkdtemp(path.join(os.tmpdir(), 'zhic-desktop-'));
  const executablePath = process.env.ZHIC_DESKTOP_EXECUTABLE || require('electron');
  const args = process.env.ZHIC_DESKTOP_EXECUTABLE ? [] : [path.join(root, 'electron/main.cjs')];
  const launch = () => _electron.launch({ executablePath, args, env: { ...process.env, ZHIC_TEST_PROFILE: profile }, timeout: 30000 });
  let desktop = await launch();
  try {
    let p = await desktop.firstWindow();
    const errors = [];
    p.on('pageerror', error => errors.push(error.message));
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    assert.equal(await p.locator('nav a').count(), 8);
    await p.getByRole('button', { name: '＋ 记一笔', exact: true }).click();
    await p.getByLabel('备忘内容', { exact: true }).fill('独立软件重开保留');
    await submit(p);
    await nav(p, '数据与设置');
    await p.getByRole('button', { name: '导出完整备份', exact: true }).click();
    let files = [];
    for (let attempt = 0; attempt < 30 && !files.length; attempt++) {
      files = (await readdir(profile)).filter(name => name.endsWith('.json') && name.startsWith('zhic-life-'));
      if (!files.length) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(files.length, 1, '独立软件必须实际生成备份文件');
    const backup = JSON.parse(await readFile(path.join(profile, files[0]), 'utf8'));
    assert.equal(backup.data.memos[0].content, '独立软件重开保留');
    assert.deepEqual(errors, []);
    await desktop.close();
    desktop = await launch();
    p = await desktop.firstWindow();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    assert.match(await p.locator('.memo-content').textContent(), /独立软件重开保留/);
    await mkdir(path.join(root, 'test-results'), { recursive: true });
    await p.screenshot({ path: path.join(root, 'test-results/windows-independent.png') });
  } finally { await desktop.close(); }
});
