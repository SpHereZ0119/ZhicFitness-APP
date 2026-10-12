import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, nav } from './browser-helpers.mjs';

test('悬停日期采用整周扩散，其他日期不被遮挡且布局不横向溢出', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await p.getByRole('button', { name: '展开日历', exact: true }).click();
    const calendar = p.locator('[data-calendar="fitness"]');
    const day = calendar.locator('.calendar-day[data-date="2026-10-14"]');
    const row = day.locator('..');
    const rowIndex = Number(await row.getAttribute('data-calendar-row'));
    const otherRow = calendar.locator('.calendar-week-row').nth(Math.min(rowIndex + 1, await calendar.locator('.calendar-week-row').count() - 1));
    const before = await row.boundingBox();
    const beforeOther = await otherRow.boundingBox();
    await day.hover();
    await p.waitForTimeout(320);
    const expanded = await row.boundingBox();
    const afterOther = await otherRow.boundingBox();
    assert.ok(expanded.height > before.height * 2, '倍率为默认2.08时悬停周应扩散超过两倍');
    assert.ok(afterOther.y !== beforeOther.y || expanded.y !== before.y, '扩散布局应重新分配周空间');
    const boxes = await calendar.locator('.calendar-day').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }; }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      assert.equal(overlap, 0, `日期格子 ${i}/${j} 不得相互遮挡`);
    }
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await p.mouse.move(1200, 80);
    await p.waitForTimeout(360);
    assert.equal((await row.boundingBox()).height, before.height);
    await nav(p, '饮食计划');
    const diet = p.locator('[data-calendar="diet"]');
    await diet.locator('.calendar-day[data-date="2026-10-14"]').hover();
    await p.waitForTimeout(320);
    assert.ok((await diet.locator('.calendar-day[data-date="2026-10-14"]').locator('..').boundingBox()).height > 58 * 2);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('倍率设置同时控制日期格子的宽高，3倍时仍为整周让位布局', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await p.evaluate(async () => {
      const { openDatabase, loadState, saveState } = await import('/storage.mjs');
      const { setSettings } = await import('/domain.mjs');
      const db = await openDatabase();
      try { await saveState(db, setSettings(await loadState(db), { calendarHoverScale: 3 })); }
      finally { db.close(); }
    });
    await p.reload();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    await nav(p, '健身计划');
    const calendar = p.locator('[data-calendar="fitness"]');
    await p.getByRole('button', { name: '展开日历', exact: true }).click();
    const day = calendar.locator('.calendar-day[data-date="2026-10-14"]');
    const before = await day.boundingBox();
    await day.hover();
    await p.waitForTimeout(330);
    const expanded = await day.boundingBox();
    assert.ok(expanded.height > before.height * 2.8, '3倍设置应把日期格子高度扩展到接近3倍');
    assert.ok(expanded.width > before.width * 2.8, '3倍设置应把日期格子宽度扩展到接近3倍');
    const boxes = await calendar.locator('.calendar-day').evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      assert.equal(overlap, 0, `3倍布局中的日期格子 ${i}/${j} 不得相互遮挡`);
    }
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await p.setViewportSize({ width: 520, height: 800 });
    await p.reload();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    await nav(p, '健身计划');
    await p.getByRole('button', { name: '展开日历', exact: true }).click();
    const mobileDay = p.locator('[data-calendar="fitness"] .calendar-day[data-date="2026-10-14"]');
    const mobileBefore = await mobileDay.boundingBox();
    await mobileDay.hover();
    await p.waitForTimeout(100);
    const mobileAfter = await mobileDay.boundingBox();
    assert.ok(Math.abs(mobileAfter.width - mobileBefore.width) < 2, '窄屏不通过放大挤压触摸目标');
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
