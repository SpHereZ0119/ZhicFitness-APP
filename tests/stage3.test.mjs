import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';
import { localDate } from '../domain.mjs';

test('阶段3：浏览过其他日期后开发日志仍默认当天，关联计划清楚显示来源名称',async()=>{
 const app=await setup();try{
  const p=app.page;await nav(p,'今日计划');await p.getByLabel('查看日期').fill('2028-12-31');await nav(p,'开发工作');
  await p.getByRole('button',{name:'新建项目',exact:true}).first().click();await p.getByLabel('项目名称').fill('默认日期检查');await submit(p);
  await p.getByRole('button',{name:'新增开发日志',exact:true}).first().click();assert.equal(await p.getByLabel('日志日期').inputValue(),localDate());await p.getByRole('button',{name:'取消',exact:true}).click();
  await p.getByRole('button',{name:'新增工作项',exact:true}).first().click();await p.getByLabel('工作项标题').fill('显示来源');await submit(p);await p.getByRole('button',{name:'安排到计划',exact:true}).click();
  assert.equal(await p.getByLabel('计划名称').inputValue(),'显示来源');assert.equal(await p.getByLabel('所属模块').isDisabled(),true);
 }finally{await app.close();}
});

async function createProject(page, name) {
  await page.getByRole('button', { name: '新建项目', exact: true }).first().click();
  await page.getByLabel('项目名称', { exact: true }).fill(name);
  await submit(page);
  await page.locator('[data-project-detail]').waitFor();
}
async function createItem(page, title) {
  await page.getByRole('button', { name: '新增工作项', exact: true }).first().click();
  await page.getByLabel('工作项标题').fill(title);
  await submit(page);
}
async function createMilestone(page, title, date = '2026-12-01') {
  await page.getByRole('button', { name: '新增里程碑', exact: true }).first().click();
  await page.getByLabel('里程碑名称').fill(title);
  await page.getByLabel('目标日期', { exact: true }).fill(date);
  await submit(page);
}
async function createLog(page, content, date = '2026-10-10') {
  await page.getByRole('button', { name: '新增开发日志', exact: true }).first().click();
  await page.getByLabel('日志日期').fill(date);
  await page.getByLabel('开发记录').fill(content);
  await submit(page);
}
async function saved(page) {
  await page.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
}

test('阶段3：开发项目、工作项、里程碑和日期日志支持真实新增编辑与保存', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '开发工作');
    await createProject(p, '学习管理应用');
    await p.getByRole('button', { name: '编辑项目', exact: true }).click();
    await p.getByLabel('项目名称', { exact: true }).fill('个人学习管理应用');
    await p.getByLabel('项目状态').selectOption('paused');
    await p.getByLabel('目标日期（可选）').fill('2026-12-31');
    await p.getByLabel('项目说明（可选）').fill('先实现本地数据，再完善生活记录。');
    await submit(p);
    assert.match(await p.locator('[data-project-detail]').textContent(), /暂停/);
    await createItem(p, '实现存储层');
    await p.getByRole('button', { name: '编辑工作项', exact: true }).click();
    await p.getByLabel('工作项标题').fill('完成可靠的本地存储');
    await p.getByLabel('工作状态').selectOption('doing');
    await submit(p);
    await createMilestone(p, '可用第一版');
    await p.getByRole('button', { name: '编辑里程碑', exact: true }).click();
    await p.getByLabel('里程碑名称').fill('完成第一版验收');
    await p.getByLabel('目标日期', { exact: true }).fill('2026-12-20');
    await submit(p);
    await p.getByRole('button', { name: '完成里程碑', exact: true }).click();
    await saved(p);
    await createLog(p, '修复自动保存的问题', '2026-10-09');
    await p.getByRole('button', { name: '编辑日志', exact: true }).click();
    await p.getByLabel('开发记录').fill('已验证刷新后仍能读取数据');
    await submit(p);
    await createLog(p, '新增日期顺序检查', '2026-10-10');
    assert.deepEqual(await p.locator('[data-log-id] h3').allTextContents(), ['2026-10-10', '2026-10-09']);
    const state = await stateOf(p);
    assert.equal(state.projects[0].name, '个人学习管理应用');
    assert.equal(state.projects[0].targetDate, '2026-12-31');
    assert.equal(state.workItems[0].status, 'doing');
    assert.equal(state.milestones[0].done, true);
    assert.equal(state.milestones[0].date, '2026-12-20');
    assert.equal(state.devLogs[0].content, '已验证刷新后仍能读取数据');
    await p.reload();
    await saved(p);
    assert.deepEqual(await stateOf(p), state);
    await nav(p, '首页预览');
    assert.equal((await stateOf(p)).projects[0].status, 'paused');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段3：关联计划读取最新工作项标题，完成计划不创建日志，删除来源保留独立计划', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '开发工作');
    await createProject(p, '关联规则项目');
    await createItem(p, '原始工作项');
    await p.getByRole('button', { name: '安排到计划', exact: true }).click();
    await p.getByLabel('开始时间').fill('10:30');
    await p.getByLabel('小步骤').fill('检查数据\n确认保存');
    await submit(p);
    const first = await stateOf(p);
    assert.equal(first.plans.length, 1);
    assert.equal(first.workItems.length, 1);
    assert.equal(first.plans[0].link.id, first.workItems[0].id);
    await p.getByRole('button', { name: '编辑工作项', exact: true }).click();
    await p.getByLabel('工作项标题').fill('重命名后的工作项');
    await submit(p);
    await nav(p, '今日计划');
    await p.getByLabel('完成计划：重命名后的工作项').check();
    await saved(p);
    const completed = await stateOf(p);
    assert.equal(completed.plans[0].status, 'done');
    assert.equal(completed.workItems[0].status, 'pending');
    assert.equal(completed.devLogs.length, 0);
    assert.equal(completed.sessions.length + completed.foods.length + completed.plays.length, 0);
    await p.getByRole('button', { name: '打开来源', exact: true }).click();
    await p.locator('[data-project-detail]').waitFor();
    await p.getByRole('button', { name: '删除工作项', exact: true }).click();
    await submit(p, '确认删除');
    const detached = await stateOf(p);
    assert.equal(detached.workItems.length, 0);
    assert.equal(detached.plans.length, 1);
    assert.equal(detached.plans[0].title, '重命名后的工作项');
    assert.equal(detached.plans[0].link, null);
    assert.equal(detached.plans[0].status, 'done');
    assert.equal(detached.plans[0].time, '10:30');
    assert.equal(detached.plans[0].steps.length, 2);
    await nav(p, '今日计划');
    assert.equal(await p.getByLabel('完成计划：重命名后的工作项').isChecked(), true);
    await p.getByRole('button', { name: '删除', exact: true }).click();
    await submit(p, '确认删除');
    assert.equal((await stateOf(p)).projects.length, 1);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段3：删除项目级联其子记录并保留其他项目、来源解绑计划与步骤', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '开发工作');
    await createProject(p, '准备删除的项目');
    await createItem(p, '准备删除的工作项');
    await createMilestone(p, '待删里程碑');
    await createLog(p, '待删开发日志');
    await p.getByRole('button', { name: '安排到计划', exact: true }).click();
    await p.getByLabel('小步骤').fill('保留计划步骤');
    await submit(p);
    const deletedProjectId = (await stateOf(p)).projects[0].id;
    await p.getByRole('button', { name: '← 返回项目列表', exact: true }).click();
    await createProject(p, '需要保留的项目');
    await createItem(p, '需要保留的工作项');
    await createMilestone(p, '需要保留的里程碑');
    await createLog(p, '需要保留的日志');
    await p.getByRole('button', { name: '← 返回项目列表', exact: true }).click();
    await p.locator(`[data-project-id="${deletedProjectId}"]`).getByRole('button', { name: '删除项目', exact: true }).click();
    await submit(p, '确认删除');
    const state = await stateOf(p);
    assert.deepEqual(state.projects.map(record => record.name), ['需要保留的项目']);
    assert.deepEqual(state.workItems.map(record => record.title), ['需要保留的工作项']);
    assert.deepEqual(state.milestones.map(record => record.title), ['需要保留的里程碑']);
    assert.deepEqual(state.devLogs.map(record => record.content), ['需要保留的日志']);
    assert.equal(state.plans.length, 1);
    assert.equal(state.plans[0].title, '准备删除的工作项');
    assert.equal(state.plans[0].link, null);
    assert.equal(state.plans[0].steps[0].title, '保留计划步骤');
    await p.reload();
    await saved(p);
    assert.deepEqual(await stateOf(p), state);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('阶段3：开发工作用户文字安全显示，子记录删除不损伤项目', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '开发工作');
    const literal = '<img src=x onerror="window.devXss=true">';
    await createProject(p, literal);
    assert.equal(await p.locator('[data-project-detail] h2').textContent(), literal);
    assert.equal(await p.locator('#page-body img').count(), 0);
    await createItem(p, '<script>window.devXss=true</script>');
    await createMilestone(p, '删除的里程碑');
    await createLog(p, literal);
    assert.equal(await p.locator('#page-body img, #page-body script').count(), 0);
    assert.equal(await p.evaluate(() => window.devXss), undefined);
    await p.getByRole('button', { name: '删除里程碑', exact: true }).click();
    await submit(p, '确认删除');
    await p.getByRole('button', { name: '删除日志', exact: true }).click();
    await submit(p, '确认删除');
    const state = await stateOf(p);
    assert.equal(state.milestones.length, 0);
    assert.equal(state.devLogs.length, 0);
    assert.equal(state.projects.length, 1);
    assert.equal(state.workItems.length, 1);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
