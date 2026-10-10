import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';

async function saved(page) { await page.locator('#save-status').filter({ hasText: '已保存' }).waitFor(); }
async function viewDate(page, date) {
  await page.getByLabel('查看日期').fill(date);
  await page.getByLabel('查看日期').press('Tab');
  await page.getByLabel('查看日期').waitFor();
}
async function createFood(page, name, portion, nutrients = {}, meal = 'breakfast') {
  await page.locator(`section[data-meal="${meal}"]`).getByRole('button', { name: '记录餐食', exact: true }).click();
  await page.getByLabel('食物名称').fill(name);
  await page.getByLabel('实际份量').fill(portion);
  const labels = { calories: '热量（kcal，可选）', protein: '蛋白质（g，可选）', carbs: '碳水（g，可选）', fat: '脂肪（g，可选）' };
  for (const [key, value] of Object.entries(nutrients)) await page.getByLabel(labels[key], { exact: true }).fill(String(value));
  await submit(page);
}
async function createMealPlan(page, title, meal = 'breakfast') {
  await page.locator(`section[data-meal="${meal}"]`).getByRole('button', { name: '安排餐食', exact: true }).click();
  await page.getByLabel('计划餐食').fill(title);
  await submit(page);
}
async function createWater(page, amount) {
  await page.getByRole('button', { name: '记录饮水', exact: true }).first().click();
  await page.getByLabel('实际饮水量').fill(String(amount));
  await submit(page);
}

test('阶段5：计划不算摄入，两条实际营养记录准确合计，编辑删除立即重算并持久保存', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '饮食计划');
    await createMealPlan(p, '想吃米饭');
    assert.equal(await p.getByTestId('nutrition-calories').textContent(), '0 kcal');
    assert.equal((await stateOf(p)).foods.length, 0);
    await createFood(p, '米饭', '一碗', { calories: 200, carbs: 20, fat: 0 });
    await createFood(p, '鸡肉', '一块', { calories: 100, protein: 10, fat: 5 }, 'lunch');
    assert.equal(await p.getByTestId('nutrition-calories').textContent(), '300 kcal');
    assert.equal(await p.getByTestId('nutrition-protein').textContent(), '10 g');
    assert.equal(await p.getByTestId('nutrition-carbs').textContent(), '20 g');
    assert.equal(await p.getByTestId('nutrition-fat').textContent(), '5 g');
    assert.match(await p.locator('#page-body').textContent(), /已记录值合计/);
    assert.match(await p.getByTestId('nutrition-completeness').textContent(), /部分营养值未填写/);
    let state = await stateOf(p);
    assert.equal(state.foods[0].protein, null);
    assert.equal(state.foods[0].fat, 0);
    assert.equal(state.foods[1].carbs, null);
    const first = state.foods[0].id;
    const second = state.foods[1].id;
    await p.locator(`[data-food-id="${first}"]`).getByRole('button', { name: '编辑饮食记录', exact: true }).click();
    await p.getByLabel('热量（kcal，可选）', { exact: true }).fill('220');
    await submit(p);
    assert.equal(await p.getByTestId('nutrition-calories').textContent(), '320 kcal');
    await p.locator(`[data-food-id="${second}"]`).getByRole('button', { name: '删除饮食记录', exact: true }).click();
    await submit(p, '确认删除');
    assert.equal(await p.getByTestId('nutrition-calories').textContent(), '220 kcal');
    assert.equal(await p.getByTestId('nutrition-protein').textContent(), '0 g');
    state = await stateOf(p);
    await p.reload();
    await saved(p);
    assert.deepEqual(await stateOf(p), state);
    assert.equal(await p.getByTestId('nutrition-calories').textContent(), '220 kcal');
    await nav(p, '首页预览');
    const dietSummary = p.locator('.module-grid .panel').filter({ hasText: '饮食计划' });
    assert.match(await dietSummary.textContent(), /220 kcal/);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段5：不同日期隔离，餐食关联计划默认来源日期，改名同步和删除后保留计划', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '饮食计划');
    const initialDate = await p.getByLabel('查看日期').inputValue();
    await createFood(p, '今天的食物', '一份', { calories: 50, protein: 0, carbs: 0, fat: 0 });
    await viewDate(p, '2026-12-31');
    await createMealPlan(p, '跨年晚餐', 'dinner');
    await createFood(p, '跨年食物', '一份', { calories: 300 }, 'dinner');
    assert.equal(await p.getByTestId('nutrition-calories').textContent(), '300 kcal');
    await p.getByRole('button', { name: '安排到计划', exact: true }).click();
    assert.equal(await p.getByLabel('日期', { exact: true }).inputValue(), '2026-12-31');
    await submit(p);
    await p.getByRole('button', { name: '编辑餐食安排', exact: true }).click();
    await p.getByLabel('计划餐食').fill('新的跨年晚餐');
    await submit(p);
    await nav(p, '今日计划');
    await viewDate(p, '2026-12-31');
    await p.getByLabel('完成计划：新的跨年晚餐').check();
    await saved(p);
    assert.equal((await stateOf(p)).foods.length, 2);
    await p.getByRole('button', { name: '打开来源', exact: true }).click();
    await p.getByRole('button', { name: '删除餐食安排', exact: true }).waitFor();
    assert.equal(await p.getByLabel('查看日期').inputValue(), '2026-12-31');
    await p.getByRole('button', { name: '删除餐食安排', exact: true }).click();
    await submit(p, '确认删除');
    const state = await stateOf(p);
    assert.equal(state.plans[0].title, '新的跨年晚餐');
    assert.equal(state.plans[0].link, null);
    assert.equal(state.plans[0].status, 'done');
    assert.equal(state.foods.length, 2);
    await viewDate(p, initialDate);
    assert.equal(await p.getByTestId('nutrition-calories').textContent(), '50 kcal');
    assert.equal(await p.locator('[data-food-id]').count(), 1);
    assert.match(await p.getByTestId('nutrition-completeness').textContent(), /计划餐食不计入/);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段5：饮水增改删、升输入转换为毫升，换单位与刷新保留同样实际饮水量', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '饮食计划');
    const date = await p.getByLabel('查看日期').inputValue();
    await createWater(p, 250);
    await createWater(p, 500);
    assert.equal(await p.getByTestId('water-total').textContent(), '750 ml');
    await p.evaluate(async () => {
      const { openDatabase, loadState, saveState } = await import('/storage.mjs');
      const { setSettings } = await import('/domain.mjs');
      const db = await openDatabase();
      try { await saveState(db, setSettings(await loadState(db), { waterUnit: 'L' })); } finally { db.close(); }
    });
    await p.reload();
    await saved(p);
    assert.equal(await p.getByTestId('water-total').textContent(), '0.75 L');
    await createWater(p, 0.25);
    let state = await stateOf(p);
    assert.equal(state.waters[2].amountMl, 250);
    assert.equal(await p.getByTestId('water-total').textContent(), '1 L');
    await p.locator(`[data-water-id="${state.waters[0].id}"]`).getByRole('button', { name: '编辑饮水记录', exact: true }).click();
    await p.getByLabel('实际饮水量').fill('0.4');
    await submit(p);
    assert.equal(await p.getByTestId('water-total').textContent(), '1.15 L');
    await p.locator(`[data-water-id="${state.waters[1].id}"]`).getByRole('button', { name: '删除饮水记录', exact: true }).click();
    await submit(p, '确认删除');
    assert.equal(await p.getByTestId('water-total').textContent(), '0.65 L');
    state = await stateOf(p);
    assert.deepEqual(state.waters.map(record => record.amountMl), [400, 250]);
    assert.ok(state.waters.every(record => record.date === date));
    await p.reload();
    await saved(p);
    assert.deepEqual(await stateOf(p), state);
    assert.equal(await p.getByTestId('water-total').textContent(), '0.65 L');
    assert.doesNotMatch(await p.locator('#page-body').textContent(), /饮水目标|完成百分比|\d+%/);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段5：空份量、负营养与负饮水被拒，食品文字安全显示', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '饮食计划');
    await p.getByRole('button', { name: '记录餐食', exact: true }).first().click();
    const literal = '<img src=x onerror="window.dietXss=true">';
    await p.getByLabel('食物名称').fill(literal);
    await p.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await p.getByRole('dialog').isVisible(), true);
    assert.equal((await stateOf(p)).foods.length, 0);
    await p.getByLabel('实际份量').fill('一份');
    await p.getByLabel('热量（kcal，可选）', { exact: true }).fill('-1');
    await p.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await p.getByRole('dialog').isVisible(), true);
    assert.equal((await stateOf(p)).foods.length, 0);
    await p.getByLabel('热量（kcal，可选）', { exact: true }).fill('0');
    await submit(p);
    assert.equal(await p.locator('#page-body img').count(), 0);
    assert.equal(await p.locator('[data-food-id] .row-title').textContent(), literal);
    assert.equal((await stateOf(p)).foods[0].protein, null);
    await p.getByRole('button', { name: '记录饮水', exact: true }).first().click();
    await p.getByLabel('实际饮水量').fill('-1');
    await p.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await p.getByRole('dialog').isVisible(), true);
    assert.equal((await stateOf(p)).waters.length, 0);
    await p.getByLabel('实际饮水量').fill('250');
    await submit(p);
    await createMealPlan(p, '<script>window.dietXss=true</script>');
    assert.equal(await p.locator('#page-body script').count(), 0);
    assert.equal(await p.evaluate(() => window.dietXss), undefined);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
