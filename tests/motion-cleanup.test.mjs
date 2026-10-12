import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, nav } from './browser-helpers.mjs';

test('快速切页与日历悬停结束后清理动画层，绘制不会溢出到侧栏', async () => {
  const app = await setup();
  try {
    const p = app.page;
    for (const name of ['健身计划', '饮食计划', '健身计划']) await nav(p, name);
    await p.waitForFunction(() => !document.querySelector('#page-body.page-enter'));
    assert.equal(await p.locator('#page-body').evaluate(node => getComputedStyle(node).transform), 'none');
    await p.getByRole('button', { name: '展开日历', exact: true }).click();
    const panel = p.locator('[data-calendar="fitness"]');
    assert.equal(await panel.evaluate(node => getComputedStyle(node).contain.includes('paint')), true, '日历绘制应限制在自己面板内');
    await p.mouse.move(1200, 70);
    const clip = { x: 0, y: 510, width: 245, height: 280 };
    const sidebarBefore = await p.screenshot({ clip });
    for (const index of [0, 7, 14, 21, 28, 0, 14]) {
      const box = await panel.locator('.calendar-day').nth(index).boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.waitForTimeout(45);
    }
    await p.mouse.move(1200, 70);
    await p.waitForTimeout(400);
    assert.deepEqual(await p.screenshot({ clip }), sidebarBefore, '快速悬停后侧栏不能残留日历边框');
    assert.equal(await panel.locator('.calendar-day').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).transform === 'none')), true);
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await nav(p, '饮食计划');
    await p.waitForFunction(() => !document.querySelector('#page-body.page-enter'));
    await p.locator('[data-calendar="diet"] .calendar-day').first().hover();
    assert.equal(await p.locator('[data-calendar="diet"] .calendar-day').first().evaluate(node => getComputedStyle(node).transform), 'none');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('按钮取消和窗口失焦后不会残留按压状态', async () => {
  const app = await setup();
  try {
    const p = app.page;
    const save = p.getByRole('button', { name: '手动保存', exact: true });
    await save.dispatchEvent('pointerdown', { button: 0, pointerId: 1 });
    await p.locator('body').dispatchEvent('pointercancel', { pointerId: 1 });
    assert.equal(await save.evaluate(node => node.classList.contains('is-pressed')), false);
    await save.dispatchEvent('keydown', { key: ' ' });
    await p.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await save.evaluate(node => node.classList.contains('is-pressed')), false);
  } finally { await app.close(); }
});
