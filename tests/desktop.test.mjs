import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildWeb, root } from '../scripts/build-web.mjs';
import { nav, submit } from './browser-helpers.mjs';

const require = createRequire(import.meta.url);
const { _electron } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
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
