import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';
import { createState, migrateState, upsert } from '../domain.mjs';

test('v5饮食记录迁移后补齐餐食图片字段', () => {
  let state = upsert(createState(), 'foods', { name: '旧餐食', portion: '一份' });
  delete state.foods[0].imageData;
  state.version = 5;
  const migrated = migrateState(state);
  assert.equal(migrated.version, 7);
  assert.deepEqual(migrated.foods[0], { ...state.foods[0], imageData: '' });
});

test('实际饮食记录支持图片预览、刷新保留和无效图片拒绝', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '饮食计划');
    await p.getByRole('button', { name: '记录餐食', exact: true }).first().click();
    await p.getByLabel('食物名称', { exact: true }).fill('彩虹沙拉');
    await p.getByLabel('实际份量', { exact: true }).fill('一盘');
    await p.getByLabel('餐食图片（可选）', { exact: true }).setInputFiles({
      name: 'salad.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    await submit(p);
    const state = await stateOf(p);
    assert.match(state.foods[0].imageData, /^data:image\/png;base64,/);
    const image = p.locator('[data-food-id] img.food-image');
    assert.equal(await image.getAttribute('alt'), '彩虹沙拉');
    assert.match(await image.getAttribute('src'), /^data:image\/png;base64,/);
    await p.reload();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    assert.equal(await p.locator('[data-food-id] img.food-image').count(), 1);
    await p.locator('[data-food-id]').getByRole('button', { name: '编辑饮食记录', exact: true }).click();
    await p.getByLabel('餐食图片（可选）', { exact: true }).setInputFiles({
      name: 'not-image.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image'),
    });
    await p.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await p.getByRole('dialog').isVisible(), true);
    assert.match(await p.getByRole('dialog').locator('.form-error').textContent(), /JPEG、PNG 或 WebP/);
    assert.equal((await stateOf(p)).foods[0].imageData, state.foods[0].imageData);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
