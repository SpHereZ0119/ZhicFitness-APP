import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';

async function addExercise(page, name) {
  await page.getByRole('button', { name: '新增动作', exact: true }).first().click();
  await page.getByLabel('动作名称', { exact: true }).fill(name);
  await submit(page);
}

test('动作库选择模式支持批量删除二次确认和加入今日训练', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await p.getByRole('tab', { name: '动作库', exact: true }).click();
    await addExercise(p, '批量深蹲');
    await addExercise(p, '批量卧推');

    await p.getByRole('button', { name: '选择动作', exact: true }).click();
    await p.getByLabel('选择动作：批量深蹲', { exact: true }).check();
    await p.getByLabel('选择动作：批量卧推', { exact: true }).check();
    assert.match(await p.locator('.exercise-selection-toolbar').textContent(), /已选择 2 个动作/);

    await p.getByRole('button', { name: '批量删除', exact: true }).click();
    assert.equal(await p.getByRole('dialog', { name: '批量删除动作' }).isVisible(), true);
    await p.getByRole('button', { name: '取消', exact: true }).click();
    await p.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await stateOf(p)).exercises.length, 2);

    await p.getByRole('button', { name: '批量删除', exact: true }).click();
    await submit(p, '确认删除');
    assert.equal((await stateOf(p)).exercises.length, 0);

    await addExercise(p, '今日训练动作一');
    await addExercise(p, '今日训练动作二');
    await p.getByRole('button', { name: '选择动作', exact: true }).click();
    await p.getByLabel('选择动作：今日训练动作一', { exact: true }).check();
    await p.getByLabel('选择动作：今日训练动作二', { exact: true }).check();
    await p.getByRole('button', { name: '加入今日训练', exact: true }).click();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    const state = await stateOf(p);
    assert.equal(state.routines.length, 1);
    assert.equal(state.routines[0].date, new Date().toISOString().slice(0, 10));
    assert.equal(state.routines[0].exerciseIds.length, 2);
    assert.equal(state.routines[0].exerciseTargets.length, 2);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
