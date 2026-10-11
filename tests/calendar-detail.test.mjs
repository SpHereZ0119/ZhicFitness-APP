import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, saveRecord, nav } from './browser-helpers.mjs';

test('日历日期悬停展示详细安排，点击后展示当天内容', async () => {
  const app = await setup();
  try {
    const { page: p } = app;
    const date = '2026-10-08';
    const exerciseId = await saveRecord(p, 'exercises', { name: '日历悬停动作', notes: '' });
    await saveRecord(p, 'routines', { name: '日历详细训练', date, weekday: 4, exerciseIds: [exerciseId] });
    await saveRecord(p, 'mealPlans', { date, meal: 'lunch', title: '日历午餐安排' });
    await saveRecord(p, 'foods', { date, meal: 'lunch', name: '日历午餐记录', portion: '一份' });
    await p.reload();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();

    await nav(p, '健身计划');
    const fitnessCalendar = p.locator('[data-calendar="fitness"]');
    await fitnessCalendar.getByRole('button', { name: '展开日历', exact: true }).click();
    const fitnessDay = fitnessCalendar.locator(`.calendar-day[data-date="${date}"]`);
    await fitnessDay.hover();
    await p.waitForTimeout(360);
    assert.match(await fitnessDay.locator('[data-calendar-detail]').textContent(), /日历详细训练/);
    assert.equal(await fitnessDay.locator('[data-calendar-detail]').isVisible(), true);
    const hoveredScale = await fitnessDay.evaluate(node => Number.parseFloat(getComputedStyle(node).transform.match(/matrix\([^,]+, 0, 0, ([^,]+)/)?.[1] || '1'));
    assert.ok(hoveredScale > 2, `悬停日期应放大到超过两倍，实际为 ${hoveredScale}`);
    const compressedScale = await fitnessCalendar.locator('.calendar-day').nth(1).evaluate(node => Number.parseFloat(getComputedStyle(node).transform.match(/matrix\([^,]+, 0, 0, ([^,]+)/)?.[1] || '1'));
    assert.ok(compressedScale < 1, `其他日期应收缩，实际为 ${compressedScale}`);
    await fitnessDay.click();
    assert.match(await p.locator(`[data-fitness-day="${date}"]`).textContent(), /日历详细训练/);
    assert.match(await p.locator(`[data-fitness-day="${date}"]`).textContent(), /日历悬停动作/);

    await nav(p, '饮食计划');
    const dietDay = p.locator(`[data-calendar="diet"] .calendar-day[data-date="${date}"]`);
    await dietDay.hover();
    assert.match(await dietDay.locator('[data-calendar-detail]').textContent(), /日历午餐安排/);
    assert.equal(await dietDay.locator('[data-calendar-detail]').isVisible(), true);
    await dietDay.click();
    const lunch = p.locator('section.panel[data-meal="lunch"]');
    assert.match(await lunch.textContent(), /日历午餐安排/);
    assert.match(await lunch.textContent(), /日历午餐记录/);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});
