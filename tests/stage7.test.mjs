import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createState, makeBackup } from '../domain.mjs';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';

async function saved(page) { await page.locator('#save-status').filter({ hasText: '已保存' }).waitFor(); }
async function safetyOf(page) {
  return page.evaluate(async () => {
    const { openDatabase, readSafety } = await import('/storage.mjs');
    const db = await openDatabase();
    try { return await readSafety(db); } finally { db.close(); }
  });
}
async function putState(page, state) {
  await page.evaluate(async state => {
    const { openDatabase, saveState } = await import('/storage.mjs');
    const db = await openDatabase();
    try { await saveState(db, state); } finally { db.close(); }
  }, state);
  await page.reload();
  await saved(page);
}
async function fixture(page) {
  const state = await page.evaluate(async () => {
    const { createState, upsert, localDate } = await import('/domain.mjs');
    const { openDatabase, saveState } = await import('/storage.mjs');
    const date = localDate();
    let state = createState();
    const add = (collection, values) => { state = upsert(state, collection, values); return state[collection].at(-1); };
    add('memos', { content: '保留完整备忘与各模块数据' });
    const project = add('projects', { name: '完整备份项目', description: '验证关联完整恢复', targetDate: '2026-12-31' });
    const workItem = add('workItems', { projectId: project.id, title: '备份恢复测试', status: 'doing' });
    add('milestones', { projectId: project.id, title: '完成验收', date: '2026-12-31' });
    add('devLogs', { projectId: project.id, date, content: '记录保存与恢复的验证结果' });
    const exercise = add('exercises', { name: '深蹲', notes: '训练快照' });
    const routine = add('routines', { name: '每日训练安排', weekday: new Date().getDay(), exerciseIds: [exercise.id] });
    add('sessions', { routineId: routine.id, date, status: 'done', entries: [{ exerciseId: exercise.id, sets: [{ reps: 8, weightKg: 60 }, { reps: 6, weightKg: 65 }] }] });
    const mealPlan = add('mealPlans', { date, meal: 'lunch', title: '米饭与鸡肉' });
    add('foods', { date, meal: 'lunch', name: '鸡肉', portion: '150 g', calories: 200, protein: 30, carbs: null, fat: 5 });
    add('waters', { date, amountMl: 500 });
    const game = add('games', { name: '正在玩的游戏', status: 'playing', progress: '第三章' });
    add('plays', { gameId: game.id, date, minutes: 45.5 });
    for (const [type, id] of [['workItem', workItem.id], ['routine', routine.id], ['mealPlan', mealPlan.id], ['game', game.id]]) {
      add('plans', { date, link: { type, id }, steps: [{ title: '保留步骤' }] });
    }
    const db = await openDatabase();
    try { await saveState(db, state); } finally { db.close(); }
    return state;
  });
  await page.reload();
  await saved(page);
  return state;
}
async function chooseBackup(page, backup) {
  const text = typeof backup === 'string' ? backup : JSON.stringify(backup);
  await page.getByLabel('选择备份文件').setInputFiles({ name: 'test-backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
}
async function downloadJson(page, label) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  assert.match(download.suggestedFilename(), /^zhic-life-\d{4}-\d{2}-\d{2}-\d{6}(?:-safety)?\.json$/);
  return JSON.parse(await readFile(path, 'utf8'));
}

test('阶段7：偏好设置改变日期、周起始日和真实单位显示，刷新后保留', async () => {
  const app = await setup();
  try {
    const p = app.page;
    const original = await fixture(p);
    await nav(p, '数据与设置');
    await p.getByRole('button', { name: '修改偏好', exact: true }).click();
    await p.getByLabel('日期格式', { exact: true }).selectOption('MM/DD/YYYY');
    await p.getByLabel('每周起始日', { exact: true }).selectOption('0');
    await p.getByLabel('重量单位', { exact: true }).selectOption('lb');
    await p.getByLabel('饮水单位', { exact: true }).selectOption('L');
    await submit(p);
    const updated = await stateOf(p);
    assert.deepEqual(updated.settings, { dateFormat: 'MM/DD/YYYY', weekStartsOn: 0, weightUnit: 'lb', waterUnit: 'L' });
    assert.deepEqual(updated.sessions, original.sessions);
    assert.deepEqual(updated.waters, original.waters);
    await nav(p, '健身计划');
    assert.equal(await p.locator('.day-card h3').first().textContent(), '周日');
    await p.getByRole('tab', { name: '训练记录', exact: true }).click();
    await p.getByRole('button', { name: '查看训练', exact: true }).click();
    assert.equal(await p.getByTestId('set-weight').first().textContent(), '132.28 lb');
    const [y, m, d] = original.sessions[0].date.split('-');
    assert.match(await p.locator('[data-session-detail]').textContent(), new RegExp(`${m}/${d}/${y}`));
    await nav(p, '饮食计划');
    assert.equal(await p.getByTestId('water-total').textContent(), '0.5 L');
    await nav(p, '数据与设置');
    await p.reload();
    await saved(p);
    assert.deepEqual(await stateOf(p), updated);
    assert.match(await p.locator('#page-body').textContent(), /周日/);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段7：导出完整 JSON 后恢复空库，所有模块、ID、设置和关联完全一致', async () => {
  const app = await setup();
  try {
    const p = app.page;
    const expected = await fixture(p);
    await nav(p, '数据与设置');
    const backup = await downloadJson(p, '导出完整备份');
    assert.equal(backup.app, 'zhic-life');
    assert.equal(backup.version, 6);
    assert.equal(new Date(backup.exportedAt).toISOString(), backup.exportedAt);
    assert.deepEqual(backup.data, expected);
    await putState(p, createState());
    await chooseBackup(p, backup);
    await p.getByRole('dialog', { name: '备份内容预览' }).waitFor();
    assert.match(await p.getByRole('dialog').textContent(), /整体替换当前所有记录和偏好/);
    assert.equal(await p.getByRole('dialog').locator('[data-backup-count="plans"]').textContent(), '4');
    for (const collection of ['memos', 'projects', 'workItems', 'milestones', 'devLogs', 'exercises', 'routines', 'sessions', 'mealPlans', 'foods', 'waters', 'games', 'plays']) {
      assert.equal(await p.getByRole('dialog').locator(`[data-backup-count="${collection}"]`).textContent(), '1');
    }
    await submit(p, '确认替换恢复');
    assert.deepEqual(await stateOf(p), expected);
    const safety = await safetyOf(p);
    assert.deepEqual(safety.data, createState());
    assert.ok(Number.isFinite(Date.parse(safety.savedAt)));
    await p.reload();
    await saved(p);
    assert.deepEqual(await stateOf(p), expected);
    await nav(p, '首页预览');
    assert.match(await p.locator('.module-grid').textContent(), /完整备份项目/);
    assert.match(await p.locator('.module-grid').textContent(), /第三章/);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段7：预览取消不改数据，损坏、版本、负数和父引用错误备份全被拒绝', async () => {
  const app = await setup();
  try {
    const p = app.page;
    const expected = await fixture(p);
    await nav(p, '数据与设置');
    await chooseBackup(p, makeBackup(expected));
    await p.getByRole('dialog', { name: '备份内容预览' }).waitFor();
    await p.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    await p.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.deepEqual(await stateOf(p), expected);
    assert.equal(await safetyOf(p), null);
    const badVersion = makeBackup(expected); badVersion.version = 99;
    const badTimestamp = makeBackup(expected); badTimestamp.exportedAt = 'not-a-date';
    const negative = makeBackup(expected); negative.data.foods[0].calories = -1;
    const missingParent = makeBackup(expected); missingParent.data.workItems[0].projectId = 'missing-project';
    const duplicate = makeBackup(expected); duplicate.data.plans[0].steps[0].id = duplicate.data.games[0].id;
    for (const invalid of ['{broken', '{}', badVersion, badTimestamp, negative, missingParent, duplicate]) {
      await chooseBackup(p, invalid);
      await p.locator('#toast.error').waitFor();
      assert.match(await p.locator('#toast.error').textContent(), /无法恢复此备份/);
      assert.equal(await p.getByRole('dialog').isVisible(), false);
      assert.deepEqual(await stateOf(p), expected);
      assert.equal(await safetyOf(p), null);
    }
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段7：整体恢复保留可用安全备份，UI找回和再次回退完整数据', async () => {
  const app = await setup();
  try {
    const p = app.page;
    const original = await fixture(p);
    await nav(p, '数据与设置');
    const replacement = createState();
    replacement.settings.waterUnit = 'L';
    await chooseBackup(p, makeBackup(replacement));
    await p.getByRole('dialog', { name: '备份内容预览' }).waitFor();
    await submit(p, '确认替换恢复');
    assert.deepEqual(await stateOf(p), replacement);
    assert.deepEqual((await safetyOf(p)).data, original);
    const exportedSafety = await downloadJson(p, '导出安全备份');
    assert.deepEqual(exportedSafety.data, original);
    await p.getByRole('button', { name: '预览安全备份', exact: true }).click();
    await p.getByRole('dialog', { name: '安全备份预览' }).waitFor();
    assert.equal(await p.getByRole('dialog').locator('[data-backup-count="plans"]').textContent(), '4');
    await submit(p, '恢复安全备份');
    assert.deepEqual(await stateOf(p), original);
    assert.deepEqual((await safetyOf(p)).data, replacement);
    await p.getByRole('button', { name: '预览安全备份', exact: true }).click();
    await p.getByRole('dialog', { name: '安全备份预览' }).waitFor();
    await submit(p, '恢复安全备份');
    assert.deepEqual(await stateOf(p), replacement);
    assert.deepEqual((await safetyOf(p)).data, original);
    await p.reload();
    await saved(p);
    assert.deepEqual(await stateOf(p), replacement);
    assert.deepEqual((await safetyOf(p)).data, original);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段7：恢复时第二次数据库写入失败会回滚当前数据与安全备份，修复后可重新恢复', async () => {
  const app = await setup();
  try {
    const p = app.page;
    const original = await fixture(p);
    await nav(p, '数据与设置');
    const current = createState(); current.settings.weightUnit = 'lb';
    await chooseBackup(p, makeBackup(current));
    await p.getByRole('dialog', { name: '备份内容预览' }).waitFor();
    await submit(p, '确认替换恢复');
    const safetyBefore = await safetyOf(p);
    assert.deepEqual(safetyBefore.data, original);
    const next = createState(); next.settings.waterUnit = 'L';
    await chooseBackup(p, makeBackup(next));
    await p.getByRole('dialog', { name: '备份内容预览' }).waitFor();
    await p.evaluate(() => {
      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        if (key === 'current') throw new DOMException('注入恢复事务失败', 'QuotaExceededError');
        return originalPut.call(this, value, key);
      };
      window.restorePut = () => { IDBObjectStore.prototype.put = originalPut; };
    });
    await p.getByRole('dialog').getByRole('button', { name: '确认替换恢复', exact: true }).click();
    await p.locator('#save-status').filter({ hasText: '保存失败' }).waitFor();
    assert.equal(await p.getByRole('dialog').isVisible(), true);
    assert.equal(await p.getByRole('dialog').locator('.form-error').isVisible(), true);
    assert.deepEqual(await stateOf(p), current);
    assert.deepEqual(await safetyOf(p), safetyBefore);
    await p.evaluate(() => window.restorePut());
    await submit(p, '确认替换恢复');
    assert.deepEqual(await stateOf(p), next);
    assert.deepEqual((await safetyOf(p)).data, current);
    await p.reload();
    await saved(p);
    assert.deepEqual(await stateOf(p), next);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
