import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';
import { createState } from '../domain.mjs';
import { chromium, browserExecutable } from './browser-helpers.mjs';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const TEST_RESULTS = path.join(ROOT, 'test-results');
const PROFILE_ROOT = path.join(ROOT, '.test-tmp');
async function listen(port = 0) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const listeningPort = server.address().port;
  return { server, port: listeningPort, origin: `http://127.0.0.1:${listeningPort}` };
}

async function closeServer(server) {
  if (!server) return;
  await new Promise(resolve => server.close(resolve));
}

async function launch(profile, origin, port) {
  const requests = [];
  const pageErrors = [];
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: browserExecutable,
    args: ['--no-sandbox'],
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  await context.route('**/*', route => {
    const requestUrl = new URL(route.request().url());
    const local = requestUrl.protocol === 'http:' && requestUrl.hostname === '127.0.0.1' && requestUrl.port === String(port);
    return local ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('request', request => requests.push({ url: request.url(), method: request.method() }));
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
  return { context, page, requests, pageErrors };
}

async function saved(page) {
  await page.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
}

async function submit(page, label = '保存') {
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved(page);
}

async function nav(page, name) {
  await page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
}

async function stateOf(page) {
  return page.evaluate(async () => {
    const { openDatabase, loadState } = await import('/storage.mjs');
    const db = await openDatabase();
    try { return await loadState(db); } finally { db.close(); }
  });
}

async function putState(page, state) {
  await page.evaluate(async next => {
    const { openDatabase, saveState } = await import('/storage.mjs');
    const db = await openDatabase();
    try { await saveState(db, next); } finally { db.close(); }
  }, state);
  await page.reload();
  await saved(page);
}

async function addMemo(page) {
  await page.locator('[data-action="memo"]').first().click();
  await page.getByLabel('备忘内容', { exact: true }).fill('阶段八跨模块验收备忘');
  await submit(page);
}

async function addPlan(page) {
  await page.locator('[data-action="plan"]').first().click();
  await page.getByLabel('计划名称', { exact: true }).fill('阶段八综合计划');
  await page.getByLabel('小步骤').fill('检查本地保存\n确认恢复结果');
  await submit(page);
}

async function addDevelopment(page) {
  await nav(page, '开发工作');
  await page.getByRole('button', { name: '新建项目', exact: true }).first().click();
  await page.getByLabel('项目名称', { exact: true }).fill('阶段八项目');
  await submit(page);
  await page.getByRole('button', { name: '新增工作项', exact: true }).first().click();
  await page.getByLabel('工作项标题', { exact: true }).fill('阶段八工作项');
  await submit(page);
}

async function addFitness(page) {
  await nav(page, '健身计划');
  await page.getByRole('tab', { name: '动作库', exact: true }).click();
  await page.getByRole('button', { name: '新增动作', exact: true }).first().click();
  await page.getByLabel('动作名称', { exact: true }).fill('阶段八深蹲');
  await submit(page);
  await page.getByRole('tab', { name: '每周训练安排', exact: true }).click();
  await page.getByRole('button', { name: '新增训练安排', exact: true }).first().click();
  await page.getByLabel('安排名称', { exact: true }).fill('阶段八训练安排');
  await page.getByRole('dialog').getByLabel('阶段八深蹲', { exact: true }).check();
  await submit(page);
}

async function addDiet(page) {
  await nav(page, '饮食计划');
  await page.locator('section[data-meal="breakfast"]').getByRole('button', { name: '安排餐食', exact: true }).click();
  await page.getByLabel('计划餐食').fill('阶段八早餐');
  await submit(page);
  await page.locator('section[data-meal="breakfast"]').getByRole('button', { name: '记录餐食', exact: true }).click();
  await page.getByLabel('食物名称').fill('阶段八燕麦');
  await page.getByLabel('实际份量').fill('一碗');
  await page.getByLabel('热量（kcal，可选）', { exact: true }).fill('320');
  await submit(page);
  await page.getByRole('button', { name: '记录饮水', exact: true }).first().click();
  await page.getByLabel('实际饮水量').fill('400');
  await submit(page);
}

async function addGaming(page) {
  await nav(page, '游戏娱乐');
  await page.getByRole('button', { name: '添加游戏', exact: true }).first().click();
  await page.getByLabel('游戏名称', { exact: true }).fill('阶段八游戏');
  await page.getByRole('dialog').getByLabel('游戏状态').selectOption('playing');
  await page.getByLabel('进度描述（可选）').fill('阶段八第一章');
  await submit(page);
  await page.getByRole('button', { name: '记录游玩', exact: true }).first().click();
  await page.getByLabel('实际游玩时长（分钟）').fill('35');
  await submit(page);
}

async function exportBackup(page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  assert.ok(downloadedPath, '完整备份应产生可读取的下载文件');
  return JSON.parse(await readFile(downloadedPath, 'utf8'));
}

async function chooseBackup(page, backup) {
  await page.getByLabel('选择备份文件').setInputFiles({
    name: 'stage8-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole('dialog', { name: '备份内容预览' }).waitFor();
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
  }));
  assert.ok(metrics.documentWidth <= metrics.documentClientWidth + 1, `${label} 页面存在横向溢出: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.bodyWidth <= metrics.bodyClientWidth + 1, `${label} body 存在横向溢出: ${JSON.stringify(metrics)}`);
}

function assertLocalRequests(requests, port) {
  assert.ok(requests.length > 0, '阶段八应收集到本地应用请求');
  const external = requests.filter(request => {
    const url = new URL(request.url);
    return url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== String(port);
  });
  assert.deepEqual(external, [], `发现外部网络请求: ${JSON.stringify(external)}`);
}

test('阶段8：真实 Edge 完成七导航典型流程、备份恢复和宽窄桌面视觉验收', async () => {
  assert.ok(browserExecutable && /msedge(?:\.exe)?$/i.test(browserExecutable), `阶段八必须使用真实 Edge，当前浏览器路径为：${browserExecutable || '未设置'}`);
  await mkdir(TEST_RESULTS, { recursive: true });
  await mkdir(PROFILE_ROOT, { recursive: true });
  const profile = await mkdtemp(path.join(PROFILE_ROOT, 'stage8-e2e-'));
  let server;
  let context;
  try {
    const listening = await listen();
    ({ server } = listening);
    const launched = await launch(profile, listening.origin, listening.port);
    ({ context } = launched);
    const page = launched.page;
    const requests = launched.requests;
    const navNames = ['首页预览', '今日计划', '学习计划', '开发工作', '健身计划', '饮食计划', '游戏娱乐', '数据与设置'];
    assert.equal(await page.locator('nav a').count(), 8);
    for (const name of navNames) assert.equal(await page.getByRole('navigation').getByRole('link', { name, exact: true }).isVisible(), true);

    await addMemo(page);
    await addPlan(page);
    await nav(page, '今日计划');
    assert.match(await page.locator('#page-body').textContent(), /阶段八综合计划/);
    await addDevelopment(page);
    await addFitness(page);
    await addDiet(page);
    await addGaming(page);
    await nav(page, '数据与设置');
    await page.getByRole('button', { name: '修改偏好', exact: true }).click();
    await page.getByLabel('日期格式', { exact: true }).selectOption('YYYY/MM/DD');
    await submit(page);
    const expected = await stateOf(page);
    assert.equal(expected.memos.length, 1);
    assert.equal(expected.plans.length, 1);
    assert.equal(expected.projects.length, 1);
    assert.equal(expected.workItems.length, 1);
    assert.equal(expected.exercises.length, 1);
    assert.equal(expected.routines.length, 1);
    assert.equal(expected.mealPlans.length, 1);
    assert.equal(expected.foods.length, 1);
    assert.equal(expected.waters.length, 1);
    assert.equal(expected.games.length, 1);
    assert.equal(expected.plays.length, 1);
    assert.equal(expected.settings.dateFormat, 'YYYY/MM/DD');

    const backup = await exportBackup(page);
    assert.deepEqual(backup.data, expected);
    await putState(page, createState());
    await chooseBackup(page, backup);
    await submit(page, '确认替换恢复');
    assert.deepEqual(await stateOf(page), expected);

    await nav(page, '首页预览');
    await page.getByRole('heading', { name: '把今天，过成自己的节奏。', exact: true }).waitFor();
    assert.match(await page.locator('.module-grid').textContent(), /阶段八项目/);
    assert.match(await page.locator('.module-grid').textContent(), /阶段八训练安排/);
    assert.match(await page.locator('.module-grid').textContent(), /阶段八燕麦|320 kcal/);
    assert.match(await page.locator('.module-grid').textContent(), /阶段八游戏/);
    await page.locator('#toast').waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await assertNoHorizontalOverflow(page, '1440x1000');
    assert.equal(await page.evaluate(() => Math.round(document.querySelector('.sidebar').getBoundingClientRect().top)), 0);
    await page.screenshot({ path: path.join(TEST_RESULTS, 'stage8-wide-1440x1000.png'), fullPage: true });
    assert.equal(await page.locator('h1').isVisible(), true);
    await page.setViewportSize({ width: 900, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await assertNoHorizontalOverflow(page, '900x800');
    assert.equal(await page.evaluate(() => Math.round(document.querySelector('.sidebar').getBoundingClientRect().top)), 0);
    await page.screenshot({ path: path.join(TEST_RESULTS, 'stage8-narrow-900x800.png'), fullPage: true });
    assert.equal(await page.locator('h1').isVisible(), true);
    assert.equal(await page.getByRole('navigation').getByRole('link', { name: '数据与设置', exact: true }).isVisible(), true);
    assertLocalRequests(requests, listening.port);
    assert.deepEqual(launched.pageErrors, []);
  } finally {
    if (context) await context.close();
    await closeServer(server);
    await rm(profile, { recursive: true, force: true });
  }
});

test('阶段8：关闭真实 Edge 与本地服务后，用同端口同持久化 profile 重启仍保留数据', async () => {
  assert.ok(browserExecutable && /msedge(?:\.exe)?$/i.test(browserExecutable), `阶段八必须使用真实 Edge，当前浏览器路径为：${browserExecutable || '未设置'}`);
  await mkdir(PROFILE_ROOT, { recursive: true });
  const profile = await mkdtemp(path.join(PROFILE_ROOT, 'stage8-restart-'));
  let server;
  let context;
  const allRequests = [];
  try {
    let listening = await listen();
    ({ server } = listening);
    let launched = await launch(profile, listening.origin, listening.port);
    context = launched.context;
    const page = launched.page;
    await addMemo(page);
    await addPlan(page);
    await addDevelopment(page);
    await addFitness(page);
    await addDiet(page);
    await addGaming(page);
    await nav(page, '数据与设置');
    await page.getByRole('button', { name: '修改偏好', exact: true }).click();
    await page.getByLabel('日期格式', { exact: true }).selectOption('MM/DD/YYYY');
    await submit(page);
    const beforeClose = await stateOf(page);
    assert.equal(beforeClose.memos[0].content, '阶段八跨模块验收备忘');
    for (const collection of ['plans', 'projects', 'workItems', 'exercises', 'routines', 'mealPlans', 'foods', 'waters', 'games', 'plays']) {
      assert.equal(beforeClose[collection].length, 1, `${collection} 应已写入持久化数据库`);
    }
    assert.equal(beforeClose.settings.dateFormat, 'MM/DD/YYYY');
    allRequests.push(...launched.requests);
    await context.close();
    context = null;
    await closeServer(server);
    server = null;

    listening = await listen(listening.port);
    ({ server } = listening);
    launched = await launch(profile, listening.origin, listening.port);
    context = launched.context;
    const reopened = launched.page;
    await nav(reopened, '首页预览');
    assert.deepEqual(await stateOf(reopened), beforeClose);
    assert.match(await reopened.locator('.memo-content').textContent(), /阶段八跨模块验收备忘/);
    assert.match(await reopened.locator('.module-grid').textContent(), /阶段八项目/);
    assert.match(await reopened.locator('.module-grid').textContent(), /阶段八训练安排/);
    assert.match(await reopened.locator('.module-grid').textContent(), /320 kcal/);
    assert.match(await reopened.locator('.module-grid').textContent(), /阶段八游戏/);
    await reopened.setViewportSize({ width: 1440, height: 1000 });
    await assertNoHorizontalOverflow(reopened, '重启后 1440x1000');
    allRequests.push(...launched.requests);
    assertLocalRequests(allRequests, listening.port);
    assert.deepEqual(launched.pageErrors, []);
  } finally {
    if (context) await context.close();
    await closeServer(server);
    await rm(profile, { recursive: true, force: true });
  }
});
