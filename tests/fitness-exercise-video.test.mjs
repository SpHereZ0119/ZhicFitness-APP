import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';
import { createState, migrateState, upsert } from '../domain.mjs';

test('v3动作库数据迁移后保留动作说明并补齐视频字段', () => {
  let state = upsert(createState(), 'exercises', { name: '旧动作', notes: '旧说明' });
  delete state.exercises[0].videoUrl;
  delete state.exercises[0].groupId;
  delete state.exerciseGroups;
  state.version = 3;
  const migrated = migrateState(state);
  assert.equal(migrated.version, 9);
  assert.deepEqual(migrated.exercises[0], { ...state.exercises[0], videoUrl: '', groupId: null });
});

test('动作库支持教学视频按钮和可展开的动作详情', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await p.getByRole('tab', { name: '动作库', exact: true }).click();
    await p.getByRole('button', { name: '新增动作', exact: true }).first().click();
    await p.getByLabel('动作名称', { exact: true }).fill('哑铃划船');
    await p.getByLabel('动作说明（可选）', { exact: true }).fill('保持背部稳定，肘部向后拉。');
    await p.getByLabel('教学视频链接（可选）', { exact: true }).fill('https://video.example.test/row');
    await submit(p);
    const row = p.locator('[data-exercise-id]');
    const video = row.locator('a.video-link');
    assert.equal(await video.getAttribute('href'), 'https://video.example.test/row');
    assert.equal(await video.getAttribute('target'), '_blank');
    assert.equal(await video.getAttribute('rel'), 'noopener noreferrer');
    await row.getByRole('button', { name: '哑铃划船', exact: true }).click();
    const detail = p.getByRole('dialog', { name: '动作详情 · 哑铃划船' });
    assert.match(await detail.textContent(), /保持背部稳定/);
    assert.equal(await detail.locator('a.video-link').getAttribute('href'), 'https://video.example.test/row');
    await detail.getByRole('button', { name: '关闭', exact: true }).first().click();
    await row.getByRole('button', { name: '编辑动作', exact: true }).click();
    await p.getByLabel('教学视频链接（可选）', { exact: true }).fill('javascript:alert(1)');
    await p.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await p.getByRole('dialog').isVisible(), true);
    assert.match(await p.getByRole('dialog').locator('.form-error').textContent(), /http 或 https/);
    assert.equal((await stateOf(p)).exercises[0].videoUrl, 'https://video.example.test/row');
    await p.getByLabel('教学视频链接（可选）', { exact: true }).fill('https://video.example.test/updated');
    await submit(p);
    await p.reload();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    await p.getByRole('tab', { name: '动作库', exact: true }).click();
    assert.equal(await p.locator('[data-exercise-id] a.video-link').getAttribute('href'), 'https://video.example.test/updated');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('动作库编辑删除收纳到滑动操作区，删除需要二次确认', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await p.getByRole('tab', { name: '动作库', exact: true }).click();
    await p.getByRole('button', { name: '新增动作', exact: true }).first().click();
    await p.getByLabel('动作名称', { exact: true }).fill('杠铃深蹲');
    await p.getByLabel('教学视频链接（可选）', { exact: true }).fill('https://video.example.test/squat');
    await submit(p);

    const row = p.locator('[data-exercise-id]').first();
    assert.equal(await row.locator('button').filter({ hasText: '编辑动作' }).count(), 0);
    assert.equal(await row.locator('button').filter({ hasText: '删除动作' }).count(), 0);
    assert.equal(await row.locator('a.video-link').getAttribute('href'), 'https://video.example.test/squat');
    assert.equal(await row.locator('.exercise-edit-action').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(228, 173, 39)');
    assert.equal(await row.locator('.exercise-delete-action').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(182, 67, 62)');

    await row.locator('.row-title').focus();
    assert.equal(await row.locator('.exercise-delete-action').isVisible(), true);
    await row.locator('.exercise-delete-action').focus();
    await row.locator('.exercise-delete-action').click();
    assert.equal(await p.getByRole('dialog', { name: '删除记录' }).isVisible(), true);
    assert.match(await p.getByRole('dialog').textContent(), /动作将从动作库/);
    await p.getByRole('button', { name: '取消', exact: true }).click();
    await p.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await stateOf(p)).exercises.length, 1);

    await row.locator('.exercise-delete-action').focus();
    await row.locator('.exercise-delete-action').click();
    await submit(p, '确认删除');
    assert.equal((await stateOf(p)).exercises.length, 0);
    assert.equal(await p.locator('[data-exercise-id]').count(), 0);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('动作库支持动作组和拖放归类', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '健身计划');
    await p.getByRole('tab', { name: '动作库', exact: true }).click();
    await p.getByRole('button', { name: '新增动作组', exact: true }).click();
    await p.getByLabel('动作组名称', { exact: true }).fill('下肢训练');
    await submit(p);
    await p.getByRole('button', { name: '新增动作', exact: true }).first().click();
    await p.getByLabel('动作名称', { exact: true }).fill('杠铃深蹲');
    await submit(p);
    const row = p.locator('[data-exercise-id]').first();
    const group = p.locator('[data-group-drop]').first();
    await row.evaluate((node, groupId) => {
      const data = new DataTransfer();
      data.setData('text/plain', node.dataset.exerciseId);
      document.querySelector(`[data-exercise-group-id="${groupId}"]`).dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: data }));
    }, await group.getAttribute('data-exercise-group-id'));
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    assert.equal((await stateOf(p)).exercises[0].groupId, await group.getAttribute('data-exercise-group-id'));
    assert.match(await row.textContent(), /下肢训练/);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
