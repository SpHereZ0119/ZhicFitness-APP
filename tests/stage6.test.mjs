import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';

async function saved(page) { await page.locator('#save-status').filter({ hasText: '已保存' }).waitFor(); }
async function addGame(page, name, status = 'playing', progress = '') {
  await page.getByRole('button', { name: '添加游戏', exact: true }).first().click();
  await page.getByLabel('游戏名称', { exact: true }).fill(name);
  await page.getByRole('dialog').getByLabel('游戏状态').selectOption(status);
  await page.getByLabel('进度描述（可选）').fill(progress);
  await submit(page);
  await page.locator('[data-game-detail]').waitFor();
}
async function addPlay(page, minutes, date) {
  await page.getByRole('button', { name: '记录游玩', exact: true }).first().click();
  if (date) await page.getByLabel('游玩日期').fill(date);
  await page.getByLabel('实际游玩时长（分钟）').fill(String(minutes));
  await submit(page);
}

test('阶段6：游戏和手动游玩记录 CRUD、不同日期排序、合计与刷新持久化', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '游戏娱乐');
    await addGame(p, '星露谷物语', 'playing', '第一年春天');
    await p.getByRole('button', { name: '编辑游戏', exact: true }).click();
    await p.getByLabel('游戏名称', { exact: true }).fill('我的星露谷');
    await p.getByLabel('进度描述（可选）').fill('第一年夏天');
    await submit(p);
    await addPlay(p, 45, '2026-10-10');
    await addPlay(p, 30, '2026-10-09');
    assert.equal(await p.getByTestId('game-total-minutes').textContent(), '75 分钟');
    assert.deepEqual(await p.locator('[data-play-id] .row-title').allTextContents(), ['2026-10-10', '2026-10-09']);
    let state = await stateOf(p);
    const second = state.plays[1].id;
    await p.locator(`[data-play-id="${second}"]`).getByRole('button', { name: '编辑游玩记录', exact: true }).click();
    await p.getByLabel('实际游玩时长（分钟）').fill('35.5');
    await submit(p);
    assert.equal(await p.getByTestId('game-total-minutes').textContent(), '80.5 分钟');
    await p.locator(`[data-play-id="${second}"]`).getByRole('button', { name: '删除游玩记录', exact: true }).click();
    await submit(p, '确认删除');
    assert.equal(await p.getByTestId('game-total-minutes').textContent(), '45 分钟');
    assert.equal(await p.getByTestId('game-play-count').textContent(), '1 条实际游玩记录');
    state = await stateOf(p);
    await p.reload();
    await saved(p);
    await p.getByRole('button', { name: '打开游戏', exact: true }).click();
    assert.deepEqual(await stateOf(p), state);
    assert.equal(await p.getByTestId('game-total-minutes').textContent(), '45 分钟');
    await nav(p, '首页预览');
    const summary = p.locator('.module-grid .panel').filter({ hasText: '游戏娱乐' });
    assert.match(await summary.textContent(), /我的星露谷 · 第一年夏天/);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段6：游戏库按四种状态准确筛选，改变状态后重新归类', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '游戏娱乐');
    for (const [name, status] of [['待玩的游戏', 'want'], ['当前玩的游戏', 'playing'], ['通关的游戏', 'finished'], ['暂停的游戏', 'paused']]) {
      await addGame(p, name, status);
      await p.getByRole('button', { name: '← 返回游戏库', exact: true }).click();
    }
    assert.equal(await p.locator('article[data-game-id]').count(), 4);
    for (const [label, name] of [['想玩', '待玩的游戏'], ['正在玩', '当前玩的游戏'], ['已通关', '通关的游戏'], ['暂停', '暂停的游戏']]) {
      await p.getByRole('button', { name: label, exact: true }).click();
      assert.deepEqual(await p.locator('article[data-game-id] .row-title').allTextContents(), [name]);
    }
    await p.getByRole('button', { name: '正在玩', exact: true }).click();
    await p.getByRole('button', { name: '打开游戏', exact: true }).click();
    await p.getByRole('button', { name: '编辑游戏', exact: true }).click();
    await p.getByRole('dialog').getByLabel('游戏状态').selectOption('finished');
    await submit(p);
    await p.getByRole('button', { name: '← 返回游戏库', exact: true }).click();
    assert.equal(await p.locator('article[data-game-id]').count(), 0);
    await p.getByRole('button', { name: '已通关', exact: true }).click();
    assert.deepEqual((await p.locator('article[data-game-id] .row-title').allTextContents()).sort(), ['当前玩的游戏', '通关的游戏'].sort());
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段6：完成游戏计划不生成游玩记录，来源改名跳转和删除级联保留其他游戏', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '游戏娱乐');
    await addGame(p, '来源游戏');
    const gameId = (await stateOf(p)).games[0].id;
    await p.getByRole('button', { name: '安排到计划', exact: true }).click();
    assert.equal(await p.getByLabel('计划名称').isDisabled(), true);
    await p.getByLabel('小步骤').fill('先完成一章');
    await submit(p);
    await p.getByRole('button', { name: '编辑游戏', exact: true }).click();
    await p.getByLabel('游戏名称', { exact: true }).fill('新名称游戏');
    await submit(p);
    await nav(p, '今日计划');
    await p.getByLabel('完成计划：新名称游戏').check();
    await saved(p);
    assert.equal((await stateOf(p)).plays.length, 0);
    await p.getByRole('button', { name: '打开来源', exact: true }).click();
    await p.locator('[data-game-detail]').waitFor();
    assert.match(await p.locator('[data-game-detail]').textContent(), /新名称游戏/);
    await addPlay(p, 25, '2026-10-10');
    await p.getByRole('button', { name: '← 返回游戏库', exact: true }).click();
    await addGame(p, '需要保留的游戏');
    await addPlay(p, 10, '2026-10-09');
    const otherId = (await stateOf(p)).games[1].id;
    await p.getByRole('button', { name: '← 返回游戏库', exact: true }).click();
    await p.locator(`article[data-game-id="${gameId}"]`).getByRole('button', { name: '删除游戏', exact: true }).click();
    await submit(p, '确认删除');
    const state = await stateOf(p);
    assert.equal(state.games.length, 1);
    assert.equal(state.games[0].id, otherId);
    assert.equal(state.plays.length, 1);
    assert.equal(state.plays[0].gameId, otherId);
    assert.equal(state.plans.length, 1);
    assert.equal(state.plans[0].title, '新名称游戏');
    assert.equal(state.plans[0].link, null);
    assert.equal(state.plans[0].status, 'done');
    assert.equal(state.plans[0].steps[0].title, '先完成一章');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段6：空名称、空零负分钟不能保存，文字安全显示且游玩默认本地今天', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '今日计划');
    const today = await p.getByLabel('查看日期').inputValue();
    await p.getByLabel('查看日期').fill('2026-12-31');
    await p.getByLabel('查看日期').press('Tab');
    await nav(p, '游戏娱乐');
    await p.getByRole('button', { name: '添加游戏', exact: true }).first().click();
    await p.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await p.getByRole('dialog').isVisible(), true);
    assert.equal((await stateOf(p)).games.length, 0);
    const literal = '<img src=x onerror="window.gameXss=true">';
    await p.getByLabel('游戏名称', { exact: true }).fill(literal);
    await p.getByLabel('进度描述（可选）').fill('<script>window.gameXss=true</script>');
    await submit(p);
    assert.equal(await p.locator('#page-body img, #page-body script').count(), 0);
    assert.equal(await p.locator('[data-game-detail] h2').textContent(), literal);
    await p.getByRole('button', { name: '记录游玩', exact: true }).first().click();
    assert.equal(await p.getByLabel('游玩日期').inputValue(), today);
    for (const minutes of ['', '0', '-5']) {
      await p.getByLabel('实际游玩时长（分钟）').fill(minutes);
      await p.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
      assert.equal(await p.getByRole('dialog').isVisible(), true);
      assert.equal((await stateOf(p)).plays.length, 0);
    }
    await p.getByLabel('实际游玩时长（分钟）').fill('0.5');
    await submit(p);
    assert.equal((await stateOf(p)).plays[0].minutes, 0.5);
    assert.equal((await stateOf(p)).plays[0].date, today);
    assert.equal(await p.getByTestId('game-total-minutes').textContent(), '0.5 分钟');
    assert.equal(await p.evaluate(() => window.gameXss), undefined);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
