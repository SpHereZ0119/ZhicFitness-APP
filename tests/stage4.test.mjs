import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';
import { localDate } from '../domain.mjs';

async function saved(page) { await page.locator('#save-status').filter({ hasText: '已保存' }).waitFor(); }
async function openTab(page, name) { await page.getByRole('tab', { name, exact: true }).click(); }
async function createExercise(page, name) {
  await openTab(page, '动作库');
  await page.getByRole('button', { name: '新增动作', exact: true }).first().click();
  await page.getByLabel('动作名称', { exact: true }).fill(name);
  await submit(page);
}
async function createRoutine(page, name, exerciseName) {
  await openTab(page, '每周训练安排');
  await page.getByRole('button', { name: '新增训练安排', exact: true }).first().click();
  await page.getByLabel('安排名称').fill(name);
  await page.getByLabel('训练星期').selectOption('6');
  await page.getByRole('dialog').getByLabel(exerciseName, { exact: true }).check();
  await submit(page);
}
async function startRoutine(page) {
  await page.getByRole('button', { name: '开始这次训练', exact: true }).click();
  await submit(page, '开始训练');
  await page.locator('[data-session-detail]').waitFor();
}
async function addSet(page, reps, weight) {
  await page.getByRole('button', { name: '新增一组', exact: true }).first().click();
  await page.getByLabel('实际次数').fill(String(reps));
  await page.getByLabel('实际重量').fill(String(weight));
  await submit(page);
}

test('阶段4：开始实际训练默认当天；另一窗口删除组后旧编辑不会误报成功',async()=>{
 const app=await setup();try{
  const p=app.page;await nav(p,'今日计划');await p.getByLabel('查看日期').fill('2028-12-31');await nav(p,'健身计划');await createExercise(p,'并发动作');
  await openTab(p,'每周训练安排');await p.getByRole('button',{name:'开始训练',exact:true}).click();assert.equal(await p.getByLabel('训练日期').inputValue(),localDate());await p.getByRole('dialog').getByLabel('并发动作',{exact:true}).check();await submit(p,'开始训练');await addSet(p,8,10);
  await p.getByRole('button',{name:'编辑组',exact:true}).click();await p.getByLabel('实际次数').fill('10');
  const other=await app.context.newPage();await other.goto(app.url+'/#fitness');await other.locator('#save-status').filter({hasText:'已保存'}).waitFor();await openTab(other,'训练记录');await other.getByRole('button',{name:'继续训练',exact:true}).click();await other.getByRole('button',{name:'删除组',exact:true}).click();await submit(other,'确认删除');
  await p.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();await p.locator('#save-status').filter({hasText:'保存失败'}).waitFor();assert.match(await p.getByRole('dialog').locator('.form-error').textContent(),/已在其他窗口删除/);assert.equal(await p.getByLabel('实际次数').inputValue(),'10');assert.equal((await stateOf(p)).sessions[0].entries[0].sets.length,0);
  await p.getByRole('button',{name:'取消',exact:true}).click();await p.locator('#save-status').filter({hasText:'已保存'}).waitFor();assert.deepEqual(app.errors,[]);
 }finally{await app.close();}
});

test('阶段4：动作和安排 CRUD、真实两组训练、训练中刷新后继续与完成历史', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await p.getByRole('button', { name: '开始训练', exact: true }).click();
    assert.equal(await p.getByRole('tab', { name: '动作库', exact: true }).getAttribute('aria-selected'), 'true');
    await createExercise(p, '杠铃深蹲');
    await p.locator('.exercise-row').first().hover();
    await p.getByRole('button', { name: '编辑动作', exact: true }).click();
    await p.getByLabel('动作说明（可选）').fill('稳定控制动作');
    await submit(p);
    await createRoutine(p, '周六下肢训练', '杠铃深蹲');
    await p.getByRole('button', { name: '编辑安排', exact: true }).click();
    await p.getByLabel('安排名称').fill('周六腿部训练');
    await p.getByLabel('训练星期').selectOption('0');
    await submit(p);
    await startRoutine(p);
    assert.equal((await stateOf(p)).sessions[0].status, 'active');
    assert.equal((await stateOf(p)).sessions[0].entries[0].sets.length, 0);
    assert.equal(await p.getByRole('button', { name: '结束训练', exact: true }).isDisabled(), true);
    await addSet(p, 8, 60);
    await p.reload();
    await saved(p);
    await openTab(p, '训练记录');
    await p.getByRole('button', { name: '继续训练', exact: true }).click();
    assert.deepEqual(await p.getByTestId('set-reps').allTextContents(), ['8 次']);
    await addSet(p, 6, 65);
    assert.deepEqual(await p.getByTestId('set-weight').allTextContents(), ['60 kg', '65 kg']);
    await p.getByRole('button', { name: '结束训练', exact: true }).click();
    await saved(p);
    assert.match(await p.locator('[data-session-detail]').textContent(), /已完成/);
    const state = await stateOf(p);
    assert.equal(state.sessions[0].status, 'done');
    assert.equal(state.sessions[0].entries[0].sets.length, 2);
    assert.deepEqual(state.sessions[0].entries[0].sets.map(({ reps, weightKg }) => [reps, weightKg]), [[8, 60], [6, 65]]);
    await p.getByRole('button', { name: '← 返回训练记录', exact: true }).click();
    await p.getByRole('button', { name: '查看训练', exact: true }).click();
    assert.equal(await p.getByTestId('set-weight').count(), 2);
    await p.reload();
    await saved(p);
    assert.deepEqual(await stateOf(p), state);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段4：计划完成不制造训练，动作和安排改名删除后仍保留历史快照', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await createExercise(p, '俯卧撑');
    await createRoutine(p, '上肢训练', '俯卧撑');
    await p.getByRole('button', { name: '安排到计划', exact: true }).click();
    await submit(p);
    await nav(p, '今日计划');
    await p.getByLabel('完成计划：上肢训练').check();
    await saved(p);
    assert.equal((await stateOf(p)).sessions.length, 0);
    await p.getByRole('button', { name: '打开来源', exact: true }).click();
    await p.locator('[data-routine-id]').first().waitFor();
    await startRoutine(p);
    await addSet(p, 12, 0);
    await p.getByRole('button', { name: '结束训练', exact: true }).click();
    await saved(p);
    await p.getByRole('button', { name: '← 返回训练记录', exact: true }).click();
    await openTab(p, '动作库');
    await p.locator('.exercise-row').first().hover();
    await p.getByRole('button', { name: '编辑动作', exact: true }).click();
    await p.getByLabel('动作名称', { exact: true }).fill('标准俯卧撑');
    await submit(p);
    await openTab(p, '每周训练安排');
    await p.getByRole('button', { name: '编辑安排', exact: true }).click();
    await p.getByLabel('安排名称').fill('新的上肢安排名称');
    await submit(p);
    await nav(p, '今日计划');
    assert.equal(await p.getByLabel('完成计划：新的上肢安排名称').isChecked(), true);
    await nav(p, '健身计划');
    await openTab(p, '动作库');
    await p.locator('.exercise-row').first().hover();
    await p.getByRole('button', { name: '删除动作', exact: true }).click();
    await submit(p, '确认删除');
    await openTab(p, '每周训练安排');
    await p.getByRole('button', { name: '删除安排', exact: true }).click();
    await submit(p, '确认删除');
    const state = await stateOf(p);
    assert.equal(state.exercises.length, 0);
    assert.equal(state.routines.length, 0);
    assert.equal(state.sessions[0].routineId, null);
    assert.equal(state.sessions[0].name, '上肢训练');
    assert.equal(state.sessions[0].entries[0].exerciseId, null);
    assert.equal(state.sessions[0].entries[0].name, '俯卧撑');
    assert.equal(state.sessions[0].entries[0].sets[0].reps, 12);
    assert.equal(state.plans[0].link, null);
    assert.equal(state.plans[0].title, '新的上肢安排名称');
    await openTab(p, '训练记录');
    await p.getByRole('button', { name: '查看训练', exact: true }).click();
    assert.match(await p.locator('#page-body').textContent(), /俯卧撑/);
    assert.equal(await p.getByTestId('set-weight').textContent(), '0 kg');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段4：重量设置真实换算，磅输入保存公斤且刷新后物理量不变', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await createExercise(p, '卧推');
    await createRoutine(p, '胸部训练', '卧推');
    await startRoutine(p);
    await addSet(p, 8, 60);
    await p.evaluate(async () => {
      const { openDatabase, loadState, saveState } = await import('/storage.mjs');
      const { setSettings } = await import('/domain.mjs');
      const db = await openDatabase();
      try { await saveState(db, setSettings(await loadState(db), { weightUnit: 'lb' })); } finally { db.close(); }
    });
    await p.reload();
    await saved(p);
    await openTab(p, '训练记录');
    await p.getByRole('button', { name: '继续训练', exact: true }).click();
    assert.equal(await p.getByTestId('set-weight').textContent(), '132.28 lb');
    await addSet(p, 6, 100);
    let state = await stateOf(p);
    assert.equal(state.sessions[0].entries[0].sets[0].weightKg, 60);
    assert.equal(state.sessions[0].entries[0].sets[1].weightKg, 45.359237);
    assert.equal(await p.getByTestId('set-weight').nth(1).textContent(), '100 lb');
    await p.reload();
    await saved(p);
    state = await stateOf(p);
    assert.equal(state.settings.weightUnit, 'lb');
    assert.equal(state.sessions[0].entries[0].sets[1].weightKg, 45.359237);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段4：无安排训练、添加动作、编辑组和日期、删除最后一组不会伪造完成记录', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    const literal = '<img src=x onerror="window.fitXss=true">';
    await createExercise(p, literal);
    await createExercise(p, '划船');
    assert.equal(await p.locator('#page-body img').count(), 0);
    await openTab(p, '训练记录');
    await p.getByRole('button', { name: '开始训练', exact: true }).first().click();
    await p.getByLabel('训练名称').fill('自主训练');
    await p.getByRole('dialog').getByLabel(literal, { exact: true }).check();
    await submit(p, '开始训练');
    await addSet(p, 5, 20);
    await p.getByRole('button', { name: '添加训练动作', exact: true }).click();
    await p.getByRole('dialog').getByLabel('划船', { exact: true }).check();
    await submit(p);
    assert.equal((await stateOf(p)).sessions[0].entries.length, 2);
    await p.locator('section[data-entry-id]').first().getByRole('button', { name: '编辑组', exact: true }).click();
    await p.getByLabel('实际次数').fill('2.5');
    await p.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await p.getByRole('dialog').isVisible(), true);
    assert.equal((await stateOf(p)).sessions[0].entries[0].sets[0].reps, 5);
    await p.getByLabel('实际次数').fill('10');
    await p.getByLabel('实际重量').fill('25');
    await submit(p);
    await p.getByRole('button', { name: '编辑训练', exact: true }).click();
    await p.getByLabel('训练名称').fill('修正后的自主训练');
    await p.getByLabel('训练日期').fill('2026-10-09');
    await submit(p);
    await p.getByRole('button', { name: '结束训练', exact: true }).click();
    await saved(p);
    await p.locator('section[data-entry-id]').first().getByRole('button', { name: '删除组', exact: true }).click();
    await submit(p, '确认删除');
    let state = await stateOf(p);
    assert.equal(state.sessions[0].status, 'active');
    assert.equal(state.sessions[0].entries[0].sets.length, 0);
    assert.equal(state.sessions[0].name, '修正后的自主训练');
    assert.equal(state.sessions[0].date, '2026-10-09');
    assert.equal(await p.getByRole('button', { name: '结束训练', exact: true }).isDisabled(), true);
    await p.locator('section[data-entry-id]').nth(1).getByRole('button', { name: '移除训练动作', exact: true }).click();
    await submit(p, '确认移除');
    state = await stateOf(p);
    assert.equal(state.sessions[0].entries.length, 1);
    assert.equal(state.sessions[0].routineId, null);
    assert.equal(await p.evaluate(() => window.fitXss), undefined);
    await p.getByRole('button', { name: '删除训练', exact: true }).click();
    await submit(p, '确认删除');
    assert.equal((await stateOf(p)).sessions.length, 0);
    assert.equal((await stateOf(p)).exercises.length, 2);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
