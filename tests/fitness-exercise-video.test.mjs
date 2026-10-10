import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';
import { createState, migrateState, upsert } from '../domain.mjs';

test('v3动作库数据迁移后保留动作说明并补齐视频字段', () => {
  let state = upsert(createState(), 'exercises', { name: '旧动作', notes: '旧说明' });
  delete state.exercises[0].videoUrl;
  state.version = 3;
  const migrated = migrateState(state);
  assert.equal(migrated.version, 4);
  assert.deepEqual(migrated.exercises[0], { ...state.exercises[0], videoUrl: '' });
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
