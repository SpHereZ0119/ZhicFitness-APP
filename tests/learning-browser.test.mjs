import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';
import { createState, upsert, makeBackup } from '../domain.mjs';

async function restoreStudyFixture(page, state) {
  await nav(page, '数据与设置');
  await page.getByLabel('选择备份文件').setInputFiles({
    name: 'learning-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(makeBackup(state))),
  });
  await page.getByRole('dialog', { name: '备份内容预览' }).waitFor();
  await submit(page, '确认替换恢复');
  await nav(page, '学习计划');
  await page.getByLabel('查看日期', { exact: true }).fill('2026-10-10');
}

async function seedLegacy(page, state, safety) {
  await page.evaluate(async ({ state, safety }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('zhic-life-local-v1');
      request.onsuccess = resolve; request.onerror = reject; request.onblocked = () => reject(new Error('旧库未关闭'));
    });
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('zhic-life-local-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('documents');
      request.onsuccess = () => resolve(request.result); request.onerror = reject;
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put(state, 'current');
      if (safety) tx.objectStore('documents').put(safety, 'safety');
      tx.oncomplete = resolve; tx.onerror = reject;
    });
    db.close();
  }, { state, safety });
}

function oldState() {
  let state = upsert(createState(), 'memos', { content: '旧版保留的备忘' });
  state = upsert(state, 'projects', { name: '旧版项目' });
  state = upsert(state, 'plans', { title: '旧版安排', date: '2026-10-10' });
  delete state.studyTopics; delete state.studyEntries; state.version = 1;
  return state;
}

test('真实浏览器中学习主题、安排、日历日期、关联计划、编辑删除与重启持久化', async () => {
  const app = await setup();
  try {
    const p = app.page;
    await nav(p, '学习计划');
    assert.match(await p.locator('#page-body').textContent(), /还没有学习主题/);
    await p.getByRole('button', { name: '添加学习主题', exact: true }).first().click();
    await p.getByLabel('学习主题', { exact: true }).fill('英语阅读');
    await p.getByLabel('学习目标', { exact: true }).fill('读完一本英文原著');
    await submit(p);
    await p.getByRole('button', { name: '添加学习安排', exact: true }).first().click();
    await p.getByLabel('安排日期', { exact: true }).fill('2026-10-10');
    await p.getByLabel('安排内容', { exact: true }).fill('阅读第一章');
    await p.getByLabel('计划时长（分钟）', { exact: true }).fill('35');
    await p.getByLabel('实际学习时长（分钟）', { exact: true }).fill('28');
    await p.getByLabel('笔记 / 完成记录', { exact: true }).fill('整理十个生词');
    await p.getByRole('dialog').locator('select[name="status"]').selectOption('done');
    await submit(p);
    await p.getByLabel('查看日期', { exact: true }).fill('2026-10-10');
    assert.match(await p.locator('[data-study-entry]').textContent(), /阅读第一章/);
    assert.match(await p.locator('[data-study-entry]').textContent(), /实际 28 分钟/);
    assert.match(await p.locator('[data-study-entry]').textContent(), /整理十个生词/);
    await p.locator('[data-study-entry]').getByRole('button', { name: '加入今日计划' }).click();
    await submit(p);
    let state = await stateOf(p);
    assert.equal(state.studyTopics.length, 1);
    assert.equal(state.studyEntries.length, 1);
    assert.equal(state.plans[0].module, 'study');
    assert.equal(state.plans[0].link.id, state.studyEntries[0].id);
    await nav(p, '今日计划');
    await p.getByLabel('查看日期', { exact: true }).fill('2026-10-10');
    assert.match(await p.locator('[data-plan-id]').textContent(), /阅读第一章/);
    await p.locator('[data-plan-id]').getByRole('button', { name: '打开来源' }).click();
    assert.equal(await p.getByRole('navigation').getByRole('link', { name: '学习计划' }).getAttribute('aria-current'), 'page');
    assert.match(await p.locator('[data-study-entry]').textContent(), /阅读第一章/);
    await p.locator('[data-study-entry]').getByRole('button', { name: '编辑安排' }).click();
    await p.getByLabel('安排日期', { exact: true }).fill('2026-10-11');
    await p.getByLabel('安排内容', { exact: true }).fill('阅读第二章');
    await p.getByLabel('实际学习时长（分钟）', { exact: true }).fill('42');
    await submit(p);
    assert.equal(await p.locator('[data-study-entry]').count(), 0);
    await p.getByLabel('查看日期', { exact: true }).fill('2026-10-11');
    assert.match(await p.locator('[data-study-entry]').textContent(), /阅读第二章/);
    await p.reload();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    await p.getByLabel('查看日期', { exact: true }).fill('2026-10-11');
    assert.match(await p.locator('[data-study-entry]').textContent(), /阅读第二章/);
    state = await stateOf(p);
    assert.equal(state.studyEntries[0].date, '2026-10-11');
    assert.equal(state.studyEntries[0].actualMinutes, 42);
    await p.locator('[data-study-entry]').getByRole('button', { name: '删除安排' }).click();
    await submit(p, '确认删除');
    state = await stateOf(p);
    assert.equal(state.studyEntries.length, 0);
    assert.equal(state.plans[0].link, null);
    assert.equal(state.plans[0].title, '阅读第二章');
    await p.locator('[data-study-topic]').getByRole('button', { name: '删除主题' }).click();
    await submit(p, '确认删除');
    assert.deepEqual((await stateOf(p)).studyTopics, []);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('学习安排可配置教学视频并安全打开外部链接', async () => {
  const app = await setup();
  try {
    const p = app.page;
    let state = upsert(createState(), 'studyTopics', { name: '公开课', goal: '完成视频课程' });
    const topicId = state.studyTopics[0].id;
    state = upsert(state, 'studyEntries', {
      topicId, date: '2026-10-10', title: '观看第一讲', videoUrl: 'https://video.example.test/lesson-1',
    });
    await restoreStudyFixture(p, state);
    const link = p.locator('[data-study-entry] a.video-link');
    assert.equal(await link.getAttribute('href'), 'https://video.example.test/lesson-1');
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
    await p.locator('[data-study-entry]').getByRole('button', { name: '编辑安排', exact: true }).click();
    await p.getByLabel('教学视频链接（可选）', { exact: true }).fill('http://video.example.test/lesson-2');
    await submit(p);
    assert.equal((await stateOf(p)).studyEntries[0].videoUrl, 'http://video.example.test/lesson-2');
    assert.equal(await p.locator('[data-study-entry] a.video-link').getAttribute('href'), 'http://video.example.test/lesson-2');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('真实浏览器将 v1 IndexedDB 当前数据和安全备份升级，坏旧数据阻止升级', async () => {
  const app = await setup();
  try {
    const p = app.page;
    const legacy = oldState();
    const safety = { savedAt: new Date().toISOString(), data: structuredClone(legacy) };
    await seedLegacy(p, legacy, safety);
    await p.goto(app.url);
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    const migrated = await stateOf(p);
    assert.equal(migrated.version, 9);
    assert.deepEqual(migrated.studyTopics, []);
    assert.deepEqual(migrated.studyEntries, []);
    assert.deepEqual(migrated.memos, legacy.memos);
    assert.deepEqual(migrated.projects, legacy.projects);
    assert.deepEqual(migrated.plans, legacy.plans);
    const migratedSafety = await p.evaluate(async () => {
      const { openDatabase, readSafety } = await import('/storage.mjs');
      const db = await openDatabase(); try { return await readSafety(db); } finally { db.close(); }
    });
    assert.equal(migratedSafety.data.version, 9);
    assert.deepEqual(migratedSafety.data.memos, legacy.memos);
    await nav(p, '数据与设置');
    const legacyBackup = { app: 'zhic-life', version: 1, exportedAt: new Date().toISOString(), data: legacy };
    await p.getByLabel('选择备份文件').setInputFiles({ name: 'legacy-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacyBackup)) });
    await p.getByRole('dialog', { name: '备份内容预览' }).waitFor();
    await submit(p, '确认替换恢复');
    const restoredFromBackup = await stateOf(p);
    assert.equal(restoredFromBackup.version, 9);
    assert.deepEqual(restoredFromBackup.memos, legacy.memos);
    assert.deepEqual(restoredFromBackup.plans, legacy.plans);
    await nav(p, '首页预览');
    assert.match(await p.locator('.memo-content').textContent(), /旧版保留的备忘/);
    const broken = oldState(); broken.memos[0].content = 123;
    await seedLegacy(p, broken, null);
    await p.goto(app.url);
    await p.locator('#save-status').filter({ hasText: '读取失败' }).waitFor();
    const raw = await p.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('zhic-life-local-v1');
        request.onsuccess = () => resolve(request.result); request.onerror = reject;
      });
      const version = db.version;
      const data = await new Promise((resolve, reject) => {
        const request = db.transaction('documents').objectStore('documents').get('current');
        request.onsuccess = () => resolve(request.result); request.onerror = reject;
      });
      db.close(); return { version, data };
    });
    assert.equal(raw.version, 1);
    assert.deepEqual(raw.data, broken);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('导入含引号 ID 的学习备份后，查看、编辑、关联和删除按钮仍定位原始记录', async () => {
  const app = await setup();
  try {
    const p = app.page;
    let state = upsert(createState(), 'studyTopics', { name: '引号主题', goal: '验证恢复后的学习操作' });
    const topicId = 'topic" data-unescaped="topic';
    state.studyTopics[0].id = topicId;
    state = upsert(state, 'studyTopics', { name: '保留主题', goal: '验证主题筛选' });
    const otherTopicId = state.studyTopics.at(-1).id;
    state = upsert(state, 'studyEntries', { topicId, date: '2026-10-10', title: '含引号 ID 的安排' });
    const entryId = 'entry" data-unescaped="entry';
    state.studyEntries[0].id = entryId;
    state = upsert(state, 'studyEntries', { topicId: otherTopicId, date: '2026-10-10', title: '保留的其他主题安排' });
    await restoreStudyFixture(p, state);
    assert.equal(await p.locator('[data-unescaped]').count(), 0);
    assert.equal(await p.locator('[data-study-entry]').count(), 2);

    const topicRow = p.locator('[data-study-topic]').filter({ hasText: '引号主题' });
    assert.equal(await topicRow.getByRole('button', { name: '查看主题', exact: true }).getAttribute('data-id'), topicId);
    await topicRow.getByRole('button', { name: '查看主题', exact: true }).click();
    assert.equal(await p.locator('[data-study-entry]').count(), 1);
    assert.equal(await p.locator('[data-study-entry]').getAttribute('data-study-entry'), entryId);
    await topicRow.getByRole('button', { name: '编辑主题', exact: true }).click();
    await p.getByLabel('学习目标', { exact: true }).fill('引号标识已验证');
    await submit(p);
    assert.equal((await stateOf(p)).studyTopics.find(topic => topic.id === topicId).goal, '引号标识已验证');

    await p.locator('[data-study-entry]').getByRole('button', { name: '编辑安排', exact: true }).click();
    await p.getByLabel('安排内容', { exact: true }).fill('已更新的原始安排');
    await submit(p);
    assert.equal((await stateOf(p)).studyEntries.find(entry => entry.id === entryId).title, '已更新的原始安排');
    assert.equal((await stateOf(p)).studyEntries.length, 2);
    await p.locator('[data-study-entry]').getByRole('button', { name: '加入今日计划', exact: true }).click();
    await submit(p);
    assert.deepEqual((await stateOf(p)).plans[0].link, { type: 'studyEntry', id: entryId });
    await p.locator('[data-study-entry]').getByRole('button', { name: '删除安排', exact: true }).click();
    await submit(p, '确认删除');
    const deleted = await stateOf(p);
    assert.equal(deleted.studyEntries.length, 1);
    assert.equal(deleted.studyEntries[0].topicId, otherTopicId);
    assert.equal(deleted.plans[0].link, null);
    assert.equal(deleted.plans[0].title, '已更新的原始安排');
    await topicRow.getByRole('button', { name: '删除主题', exact: true }).click();
    await submit(p, '确认删除');
    assert.equal((await stateOf(p)).studyTopics.length, 1);
    assert.equal((await stateOf(p)).studyTopics[0].id, otherTopicId);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('删除有学习安排的主题会明确提示，确认后仅级联删除该主题并保留关联计划', async () => {
  const app = await setup();
  try {
    const p = app.page;
    let state = upsert(createState(), 'studyTopics', { name: '待删除主题', goal: '含多日安排' });
    const topicId = state.studyTopics[0].id;
    state = upsert(state, 'studyEntries', { topicId, date: '2026-10-10', title: '当天安排' });
    const firstEntryId = state.studyEntries.at(-1).id;
    state = upsert(state, 'plans', { date: '2026-10-10', link: { type: 'studyEntry', id: firstEntryId }, steps: [{ title: '保留小步骤', done: true }] });
    state = upsert(state, 'studyEntries', { topicId, date: '2026-10-11', title: '次日已完成安排', status: 'done' });
    const nextEntryId = state.studyEntries.at(-1).id;
    state = upsert(state, 'plans', { date: '2026-10-11', status: 'done', link: { type: 'studyEntry', id: nextEntryId } });
    state = upsert(state, 'studyTopics', { name: '其他主题', goal: '需要保留' });
    const retainedTopic = state.studyTopics.at(-1);
    state = upsert(state, 'studyEntries', { topicId: retainedTopic.id, date: '2026-10-10', title: '其他主题安排' });
    const retainedEntry = state.studyEntries.at(-1);
    await restoreStudyFixture(p, state);
    const deleteTopic = p.locator('[data-study-topic]').filter({ hasText: '待删除主题' }).getByRole('button', { name: '删除主题', exact: true });
    await deleteTopic.click();
    assert.match(await p.getByRole('dialog').textContent(), /学习主题.*学习安排.*删除/);
    assert.match(await p.getByRole('dialog').textContent(), /关联计划.*保留/);
    await p.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual(await stateOf(p), state);
    await deleteTopic.click();
    await submit(p, '确认删除');
    const deleted = await stateOf(p);
    assert.deepEqual(deleted.studyTopics, [retainedTopic]);
    assert.deepEqual(deleted.studyEntries, [retainedEntry]);
    assert.equal(deleted.plans.length, 2);
    for (let i = 0; i < state.plans.length; i++) {
      const before = state.plans[i];
      const after = deleted.plans[i];
      assert.equal(after.id, before.id);
      assert.equal(after.link, null);
      assert.equal(after.title, state.studyEntries.find(entry => entry.id === before.link.id).title);
      assert.equal(after.date, before.date);
      assert.equal(after.status, before.status);
      assert.deepEqual(after.steps, before.steps);
    }
    await p.reload();
    await p.locator('#save-status').filter({ hasText: '已保存' }).waitFor();
    assert.deepEqual(await stateOf(p), deleted);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
