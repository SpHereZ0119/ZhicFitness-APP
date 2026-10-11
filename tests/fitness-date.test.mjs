import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';

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

test('健身安排可以绑定具体日期并只在当天显示', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await openTab(p, '动作库');
    await p.getByRole('button', { name: '新增动作', exact: true }).first().click();
    await p.getByLabel('动作名称', { exact: true }).fill('指定日期动作');
    await submit(p);
    await openTab(p, '每周训练安排');
    await p.getByRole('button', { name: '新增训练安排', exact: true }).first().click();
    await p.getByLabel('安排名称', { exact: true }).fill('周三专属安排');
    await p.getByLabel('具体训练日期（可选）', { exact: true }).fill('2026-10-14');
    await p.getByRole('dialog').getByLabel('指定日期动作', { exact: true }).check();
    await submit(p);
    await p.getByLabel('健身日期', { exact: true }).fill('2026-10-14');
    await p.getByLabel('健身日期', { exact: true }).press('Tab');
    assert.match(await p.locator('[data-fitness-day="2026-10-14"]').textContent(), /周三专属安排/);
    await p.getByLabel('健身日期', { exact: true }).fill('2026-10-15');
    await p.getByLabel('健身日期', { exact: true }).press('Tab');
    assert.doesNotMatch(await p.locator('[data-fitness-day="2026-10-15"]').textContent(), /周三专属安排/);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('已有 v6 本地数据库首次打开时会迁移到当前数据版本', async () => {
  const app = await setup();
  try {
    const p = app.page;
    const legacy = await stateOf(p);
    legacy.version = 6;
    await p.evaluate(async state => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase('zhic-life-local-v1');
        request.onsuccess = resolve; request.onerror = reject;
        request.onblocked = () => reject(new Error('旧数据库未关闭'));
      });
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('zhic-life-local-v1', 6);
        request.onupgradeneeded = () => request.result.createObjectStore('documents');
        request.onsuccess = () => resolve(request.result); request.onerror = reject;
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('documents', 'readwrite');
        tx.objectStore('documents').put(state, 'current');
        tx.oncomplete = resolve; tx.onerror = reject;
      });
      db.close();
    }, legacy);
    await p.goto(app.url);
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    assert.equal((await stateOf(p)).version, 9);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('训练安排可选择动作组并将组内动作置顶保存', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await openTab(p, '动作库');
    await p.getByRole('button', { name: '新增动作组', exact: true }).click();
    await p.getByLabel('动作组名称', { exact: true }).fill('腿部力量');
    await submit(p);
    await p.getByRole('button', { name: '新增动作', exact: true }).first().click();
    await p.getByLabel('动作名称', { exact: true }).fill('杠铃深蹲');
    await p.getByLabel('动作组（可选）', { exact: true }).selectOption({ label: '腿部力量' });
    await submit(p);
    await p.getByRole('button', { name: '新增动作', exact: true }).first().click();
    await p.getByLabel('动作名称', { exact: true }).fill('俯卧撑');
    await submit(p);
    await openTab(p, '每周训练安排');
    await p.getByRole('button', { name: '新增训练安排', exact: true }).first().click();
    const dialog = p.getByRole('dialog');
    await dialog.getByLabel('安排名称', { exact: true }).fill('腿部日');
    await dialog.getByLabel('优先动作组（可选）', { exact: true }).selectOption({ label: '腿部力量' });
    const rows = dialog.locator('.routine-exercise');
    assert.equal(await rows.nth(0).getAttribute('data-routine-exercise'), (await stateOf(p)).exercises.find(e => e.name === '杠铃深蹲').id);
    await dialog.getByLabel('杠铃深蹲', { exact: true }).check();
    await submit(p);
    const savedState = await stateOf(p);
    assert.equal(savedState.routines.at(-1).groupId, savedState.exerciseGroups[0].id);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('新增训练安排可搜索动作库并只显示匹配动作', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await openTab(p, '动作库');
    for (const name of ['杠铃深蹲', '杠铃卧推', '俯卧撑']) {
      await p.getByRole('button', { name: '新增动作', exact: true }).first().click();
      await p.getByLabel('动作名称', { exact: true }).fill(name);
      await submit(p);
    }
    await openTab(p, '每周训练安排');
    await p.getByRole('button', { name: '新增训练安排', exact: true }).first().click();
    const dialog = p.getByRole('dialog');
    await dialog.getByLabel('安排名称', { exact: true }).fill('杠铃训练');
    await dialog.getByLabel('搜索训练动作', { exact: true }).fill('杠铃');
    assert.equal(await dialog.locator('.routine-exercise:not([hidden])').count(), 2);
    assert.equal(await dialog.locator('.routine-exercise[hidden]').count(), 1);
    assert.match(await dialog.textContent(), /杠铃深蹲/);
    assert.match(await dialog.textContent(), /杠铃卧推/);
    assert.doesNotMatch(await dialog.locator('.routine-exercise[hidden]').first().textContent(), /杠铃/);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
