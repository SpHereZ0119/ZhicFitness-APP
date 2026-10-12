import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, upsert, setSettings, migrateState, makeBackup, parseBackup } from '../domain.mjs';
import { setup, nav, submit, stateOf } from './browser-helpers.mjs';

test('日历倍率验证所有刻度，旧备份补默认值且记录不变', () => {
  let state = upsert(createState(), 'memos', { content: '倍率升级保留的记录' });
  assert.equal(state.settings.calendarHoverScale, 2.08);
  for (let tick = 0; tick <= 50; tick++) {
    const scale = Number((1 + tick * .04).toFixed(2));
    const next = setSettings(state, { calendarHoverScale: scale });
    assert.equal(parseBackup(JSON.stringify(makeBackup(next))).settings.calendarHoverScale, scale);
  }
  for (const bad of [0, .96, 3.04, 2.01, NaN, Infinity, '2.08', null]) assert.throws(() => setSettings(state, { calendarHoverScale: bad }));
  state.version = 9;
  delete state.settings.calendarHoverScale;
  const snapshot = structuredClone(state);
  const migrated = migrateState(state);
  assert.equal(migrated.version, 10);
  assert.equal(migrated.settings.calendarHoverScale, 2.08);
  assert.deepEqual(migrated.memos, state.memos);
  assert.deepEqual(state, snapshot);
  assert.deepEqual(parseBackup(JSON.stringify({ app: 'zhic-life', version: 9, exportedAt: new Date().toISOString(), data: state })), migrated);
});

test('偏好滑杆每步0.04，预览与键盘同步，取消不保存，保存刷新后应用所有日历', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '数据与设置');
    await p.getByRole('button', { name: '修改偏好', exact: true }).click();
    const slider = p.getByRole('slider', { name: '日历悬停放大倍率', exact: true });
    assert.equal(await slider.getAttribute('min'), '1');
    assert.equal(await slider.getAttribute('max'), '3');
    assert.equal(await slider.getAttribute('step'), '0.04');
    await slider.fill('2.6');
    assert.equal(await p.locator('#calendar-scale-value').textContent(), '2.60×');
    await slider.press('ArrowRight');
    assert.equal(await slider.inputValue(), '2.64');
    assert.equal(await p.locator('#calendar-scale-value').textContent(), '2.64×');
    await p.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    await p.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await stateOf(p)).settings.calendarHoverScale, 2.08);
    await p.getByRole('button', { name: '修改偏好', exact: true }).click();
    await slider.fill('2.6');
    await submit(p);
    await p.reload();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    assert.equal((await stateOf(p)).settings.calendarHoverScale, 2.6);
    for (const name of ['健身计划', '饮食计划']) {
      await nav(p, name);
      if (name === '健身计划') await p.getByRole('button', { name: '展开日历', exact: true }).click();
      assert.equal(await p.locator('.calendar-grid').evaluate(node => getComputedStyle(node).getPropertyValue('--calendar-hover-scale').trim()), '2.6');
    }
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
