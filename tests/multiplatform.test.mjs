import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildWeb } from '../scripts/build-web.mjs';
import { chromium, browserExecutable, nav, submit } from './browser-helpers.mjs';

test('安装资源支持子目录部署、断网重开、本地写入和完整备份', async () => {
  await buildWeb();
  const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
  const server = http.createServer(async (req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.replace(/^\/ZhicFitness-APP\//, '') || 'index.html';
    try { res.setHeader('Content-Type', types[path.extname(name)] || 'text/plain'); res.end(await readFile(path.resolve('www', name))); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', error => errors.push(error.message));
  try {
    await p.goto(`http://127.0.0.1:${server.address().port}/ZhicFitness-APP/`);
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    await p.waitForFunction(() => !!navigator.serviceWorker.controller);
    for (const [width, height] of [[320, 700], [390, 844], [430, 932], [900, 800], [1440, 1000]]) {
      await p.setViewportSize({ width, height });
      for (const name of ['首页预览', '今日计划', '学习计划', '开发工作', '健身计划', '饮食计划', '游戏娱乐', '数据与设置']) {
        await nav(p, name);
        await p.waitForTimeout(350);
        const overflow = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(node => `${node.tagName}.${node.className}=${node.getBoundingClientRect().right}`));
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px ${name} 横向溢出：${overflow.join(',')}`);
      }
    }
    await context.setOffline(true);
    await p.reload();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    await nav(p, '首页预览');
    await p.getByRole('button', { name: '＋ 记一笔', exact: true }).click();
    await p.getByLabel('备忘内容', { exact: true }).fill('三端离线验收记录');
    await submit(p);
    await p.reload();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    assert.match(await p.locator('.memo-content').textContent(), /三端离线验收记录/);
    await nav(p, '数据与设置');
    const download = p.waitForEvent('download');
    await p.getByRole('button', { name: '导出完整备份', exact: true }).click();
    const backup = JSON.parse(await readFile(await (await download).path(), 'utf8'));
    assert.equal(backup.data.memos[0].content, '三端离线验收记录');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
