import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, saveRecord, nav, submit } from './browser-helpers.mjs';

test('统一动效覆盖弹窗、按钮、切页与今日计划圆环', async () => {
  const app = await setup();
  try {
    const { page: p } = app;
    await nav(p, '首页预览');
    const saveButton = p.getByRole('button', { name: '手动保存', exact: true });
    await saveButton.dispatchEvent('pointerdown');
    assert.equal(await saveButton.evaluate(node => node.matches('.is-pressed')), true);
    await saveButton.dispatchEvent('pointerup');
    assert.equal(await saveButton.evaluate(node => node.matches('.is-pressed')), false);

    await p.getByRole('button', { name: '＋ 新增计划', exact: true }).click();
    const dialog = p.getByRole('dialog');
    assert.equal(await dialog.evaluate(node => node.matches('.dialog-entered')), true);
    await p.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });

    await nav(p, '今日计划');
    assert.equal(await p.locator('#page-body').evaluate(node => node.matches('.page-enter')), true);
    await nav(p, '首页预览');
    const ring = p.locator('[data-testid="today-progress-ring"]');
    assert.equal(await ring.count(), 1);
    assert.equal(await ring.getAttribute('aria-valuenow'), '0');
    assert.equal(await ring.getAttribute('aria-valuemax'), '0');
    assert.match(await ring.locator('circle.progress-ring-value').getAttribute('stroke-dasharray'), /0/);

    await saveRecord(p, 'plans', { title: '动效计划', date: new Date().toISOString().slice(0, 10), module: 'personal', priority: 'normal', status: 'pending', steps: [], link: null });
    await p.reload();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    const pendingRing = p.locator('[data-testid="today-progress-ring"]');
    assert.equal(await pendingRing.getAttribute('aria-valuenow'), '0');
    assert.equal(await pendingRing.getAttribute('aria-valuemax'), '1');
    await p.getByLabel('完成计划：动效计划').check();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    const completeRing = p.locator('[data-testid="today-progress-ring"]');
    assert.equal(await completeRing.getAttribute('aria-valuenow'), '1');
    assert.equal(await completeRing.getAttribute('aria-valuemax'), '1');
    assert.notEqual(await completeRing.locator('circle.progress-ring-value').getAttribute('stroke-dasharray'), '0 100');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
