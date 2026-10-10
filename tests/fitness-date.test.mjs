import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, submit, nav } from './browser-helpers.mjs';

async function saved(page) { await page.locator('#save-status').filter({ hasText: '已保存' }).waitFor(); }
async function openTab(page, name) { await page.getByRole('tab', { name, exact: true }).click(); }

test('健身页可选择过去日期查看当天安排与实际训练', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await openTab(p, '动作库');
    await p.getByRole('button', { name: '新增动作', exact: true }).first().click();
    await p.getByLabel('动作名称', { exact: true }).fill('过去日期动作');
    await submit(p);
    await openTab(p, '每周训练安排');
    await p.getByRole('button', { name: '新增训练安排', exact: true }).first().click();
    await p.getByLabel('安排名称', { exact: true }).fill('历史日期安排');
    await p.getByLabel('训练星期', { exact: true }).selectOption('4');
    await p.getByRole('dialog').getByLabel('过去日期动作', { exact: true }).check();
    await submit(p);
    await p.getByRole('button', { name: '开始这次训练', exact: true }).click();
    await submit(p, '开始训练');
    await p.getByRole('button', { name: '新增一组', exact: true }).first().click();
    await p.getByLabel('实际次数', { exact: true }).fill('8');
    await p.getByLabel('实际重量（kg）', { exact: true }).fill('20');
    await submit(p);
    await p.getByRole('button', { name: '编辑训练', exact: true }).click();
    await p.getByLabel('训练日期', { exact: true }).fill('2026-10-08');
    await submit(p);
    await p.getByRole('button', { name: '结束训练', exact: true }).click();
    await saved(p);
    await p.getByRole('button', { name: '← 返回训练记录', exact: true }).click();
    await openTab(p, '每周训练安排');
    assert.equal(await p.getByLabel('健身日期', { exact: true }).inputValue(), '2026-10-08');
    const day = p.locator('[data-fitness-day="2026-10-08"]');
    assert.match(await day.textContent(), /历史日期安排/);
    assert.match(await day.textContent(), /过去日期动作/);
    assert.match(await day.textContent(), /1 组/);
    await p.getByLabel('健身日期', { exact: true }).fill('2026-10-09');
    await p.getByLabel('健身日期', { exact: true }).press('Tab');
    assert.match(await p.locator('[data-fitness-day="2026-10-09"]').textContent(), /没有实际训练记录/);
    await openTab(p, '训练记录');
    assert.match(await p.locator('#page-body').textContent(), /2026-10-09 的训练记录/);
    assert.equal(await p.locator('[data-session-id]').count(), 0);
    await p.getByLabel('健身日期', { exact: true }).fill('2026-10-08');
    await p.getByLabel('健身日期', { exact: true }).press('Tab');
    assert.equal(await p.locator('[data-session-id]').count(), 1);
    assert.match(await p.locator('[data-session-id]').textContent(), /历史日期安排/);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
