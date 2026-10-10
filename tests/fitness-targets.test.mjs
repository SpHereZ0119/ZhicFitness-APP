import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';

test('训练安排为每个动作保存计划组数次数和重量，并在实际训练中显示目标', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await p.getByRole('tab', { name: '动作库', exact: true }).click();
    await p.getByRole('button', { name: '新增动作', exact: true }).first().click();
    await p.getByLabel('动作名称', { exact: true }).fill('杠铃深蹲');
    await submit(p);
    await p.getByRole('tab', { name: '每周训练安排', exact: true }).click();
    await p.getByRole('button', { name: '新增训练安排', exact: true }).first().click();
    await p.getByLabel('安排名称', { exact: true }).fill('下肢力量计划');
    await p.getByLabel('训练星期', { exact: true }).selectOption('6');
    await p.getByRole('dialog').getByLabel('杠铃深蹲', { exact: true }).check();
    await p.getByLabel('计划组数：杠铃深蹲', { exact: true }).fill('3');
    await p.getByLabel('计划次数：杠铃深蹲', { exact: true }).fill('10');
    await p.getByLabel('计划重量（kg）：杠铃深蹲', { exact: true }).fill('45');
    await submit(p);
    const state = await stateOf(p);
    assert.deepEqual(state.routines[0].exerciseTargets, [{ exerciseId: state.exercises[0].id, sets: 3, reps: 10, weightKg: 45 }]);
    assert.match(await p.locator('article[data-routine-id]').textContent(), /3 组 × 10 次 · 45 kg/);
    await p.getByRole('button', { name: '开始这次训练', exact: true }).click();
    await submit(p, '开始训练');
    assert.match(await p.locator('section[data-entry-id]').first().textContent(), /计划：3 组 × 10 次 · 45 kg/);
    await p.getByRole('button', { name: '新增一组', exact: true }).first().click();
    await p.getByLabel('实际次数', { exact: true }).fill('8');
    await p.getByLabel('实际重量（kg）', { exact: true }).fill('40');
    await submit(p);
    assert.equal(await p.getByTestId('set-reps').textContent(), '8 次');
    assert.equal(await p.getByTestId('set-weight').textContent(), '40 kg');
    assert.deepEqual((await stateOf(p)).sessions[0].entries[0].sets.map(({ reps, weightKg }) => [reps, weightKg]), [[8, 40]]);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
