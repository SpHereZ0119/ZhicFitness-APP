import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';

test('健身与饮食计划以月历标记重点日期并可切换查看', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await p.getByRole('tab', { name: '动作库', exact: true }).click();
    await p.getByRole('button', { name: '新增动作', exact: true }).first().click();
    await p.getByLabel('动作名称', { exact: true }).fill('日历动作');
    await submit(p);
    await p.getByRole('tab', { name: '每周训练安排', exact: true }).click();
    await p.getByRole('button', { name: '新增训练安排', exact: true }).first().click();
    await p.getByLabel('安排名称', { exact: true }).fill('日历训练安排');
    await p.getByLabel('训练星期', { exact: true }).selectOption('4');
    await p.getByRole('dialog').getByLabel('日历动作', { exact: true }).check();
    await submit(p);
    const fitnessCalendar = p.locator('[data-calendar="fitness"]');
    assert.equal(await fitnessCalendar.locator('.calendar-grid').count(), 0);
    await fitnessCalendar.getByRole('button', { name: '展开日历', exact: true }).click();
    assert.equal(await fitnessCalendar.locator('.calendar-grid').count(), 1);
    const fitnessMarked = p.locator('[data-calendar="fitness"] .calendar-day.has-records');
    assert.ok(await fitnessMarked.count() >= 1);
    await p.locator('[data-calendar="fitness"] .calendar-day[data-date="2026-10-08"]').click();
    assert.equal(await p.getByLabel('健身日期', { exact: true }).inputValue(), '2026-10-08');
    assert.equal(await p.locator('[data-calendar="fitness"] .calendar-day.selected').getAttribute('data-date'), '2026-10-08');
    await p.locator('[data-calendar="fitness"] [data-action="fit-month-next"]').click();
    assert.equal(await p.locator('[data-calendar="fitness"] .calendar-day.selected').getAttribute('data-date'), '2026-11-08');
    await fitnessCalendar.getByRole('button', { name: '收起日历', exact: true }).click();
    assert.equal(await fitnessCalendar.locator('.calendar-grid').count(), 0);
    await nav(p, '饮食计划');
    const foodsDate = await p.getByLabel('查看日期', { exact: true }).inputValue();
    assert.equal(await p.locator('[data-calendar="diet"] .calendar-day.selected').getAttribute('data-date'), foodsDate);
    await p.locator('[data-calendar="diet"] .calendar-day[data-date="2026-10-10"]').click();
    assert.equal(await p.getByLabel('查看日期', { exact: true }).inputValue(), '2026-10-10');
    assert.equal(await p.locator('[data-calendar="diet"] .calendar-day.selected').getAttribute('data-date'), '2026-10-10');
    await p.locator('[data-calendar="diet"] [data-action="diet-month-prev"]').click();
    assert.equal(await p.locator('[data-calendar="diet"] .calendar-day.selected').getAttribute('data-date'), '2026-09-10');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
