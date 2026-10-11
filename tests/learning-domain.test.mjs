import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, upsert, remove, titleForPlan, migrateState, validateState, makeBackup, parseBackup } from '../domain.mjs';

const day = '2026-10-10';
const nextDay = '2026-10-11';
const last = (state, key) => state[key].at(-1);

function legacyState() {
  let state = upsert(createState(), 'memos', { content: '迁移前的备忘' });
  state = upsert(state, 'projects', { name: '旧项目' });
  const project = last(state, 'projects');
  state = upsert(state, 'workItems', { projectId: project.id, title: '旧工作项' });
  const item = last(state, 'workItems');
  state = upsert(state, 'plans', { date: day, link: { type: 'workItem', id: item.id } });
  delete state.studyTopics;
  delete state.studyEntries;
  state.version = 1;
  return state;
}

test('v1 data and JSON backup migrate without changing any existing record', () => {
  const legacy = legacyState();
  const snapshot = structuredClone(legacy);
  const migrated = migrateState(legacy);
  assert.equal(migrated.version, 8);
  assert.deepEqual(migrated.studyTopics, []);
  assert.deepEqual(migrated.studyEntries, []);
  for (const [key, value] of Object.entries(legacy)) if (key !== 'version') assert.deepEqual(migrated[key], value);
  assert.deepEqual(legacy, snapshot);
  const backup = { app: 'zhic-life', version: 1, exportedAt: new Date().toISOString(), data: legacy };
  assert.deepEqual(parseBackup(JSON.stringify(backup)), migrated);
});

test('v2 study entries migrate with an empty teaching video link', () => {
  let state = upsert(createState(), 'studyTopics', { name: '历史', goal: '完成课程' });
  const topic = last(state, 'studyTopics');
  state = upsert(state, 'studyEntries', { topicId: topic.id, date: day, title: '第一课' });
  delete state.studyEntries[0].videoUrl;
  state.version = 2;
  const migrated = migrateState(state);
  assert.equal(migrated.version, 8);
  assert.equal(migrated.studyEntries[0].videoUrl, '');
  assert.deepEqual(migrated.studyEntries[0].title, state.studyEntries[0].title);
});

test('migration validates the entire v1 schema before adding study fields', () => {
  const corruptions = [
    state => { state.memos[0].content = 1; },
    state => { state.plans[0].link.id = 'missing'; },
    state => { state.plans[0].module = 'study'; },
    state => { state.studyTopics = []; },
    state => { state.projects[0].unexpected = true; },
  ];
  for (const corrupt of corruptions) {
    const legacy = legacyState(); corrupt(legacy);
    assert.throws(() => migrateState(legacy));
    assert.throws(() => parseBackup(JSON.stringify({ app: 'zhic-life', version: 1, exportedAt: new Date().toISOString(), data: legacy })));
  }
});

test('study topic, dated entry, completion, notes and plan association retain IDs across updates', () => {
  let state = upsert(createState(), 'studyTopics', { name: '英语', goal: '年底完成一本原著' });
  const topic = last(state, 'studyTopics');
  state = upsert(state, 'studyEntries', { topicId: topic.id, date: day, title: '阅读第一章', plannedMinutes: 30, videoUrl: 'https://example.com/lesson-1' });
  const entry = last(state, 'studyEntries');
  state = upsert(state, 'plans', { date: day, link: { type: 'studyEntry', id: entry.id } });
  const plan = last(state, 'plans');
  assert.equal(plan.module, 'study');
  assert.equal(titleForPlan(state, plan), '阅读第一章');
  const updated = upsert(state, 'studyEntries', { date: nextDay, title: '阅读第二章', actualMinutes: 42, notes: '记住十个生词', status: 'done' }, entry.id);
  assert.equal(updated.studyEntries[0].id, entry.id);
  assert.equal(updated.studyEntries[0].createdAt, entry.createdAt);
  assert.equal(updated.studyEntries[0].date, nextDay);
  assert.equal(updated.studyEntries[0].actualMinutes, 42);
  assert.equal(updated.studyEntries[0].notes, '记住十个生词');
  assert.equal(updated.studyEntries[0].videoUrl, 'https://example.com/lesson-1');
  assert.equal(titleForPlan(updated, updated.plans[0]), '阅读第二章');
  assert.equal(state.studyEntries[0].date, day);
  const restored = parseBackup(JSON.stringify(makeBackup(updated)));
  assert.deepEqual(restored, updated);
});

test('deleting an entry or its topic preserves linked daily plans as titled snapshots', () => {
  let state = upsert(createState(), 'studyTopics', { name: '数学', goal: '复习微积分' });
  const topic = last(state, 'studyTopics');
  state = upsert(state, 'studyEntries', { topicId: topic.id, date: day, title: '导数练习' });
  const entry = last(state, 'studyEntries');
  state = upsert(state, 'plans', { date: day, link: { type: 'studyEntry', id: entry.id } });
  const removedEntry = remove(state, 'studyEntries', entry.id);
  assert.equal(removedEntry.plans[0].link, null);
  assert.equal(removedEntry.plans[0].title, '导数练习');
  const removedTopic = remove(state, 'studyTopics', topic.id);
  assert.deepEqual(removedTopic.studyEntries, []);
  assert.equal(removedTopic.plans[0].link, null);
  assert.equal(removedTopic.plans[0].title, '导数练习');
});

test('study validation rejects invalid dates, durations, references, status and mismatched plan module', () => {
  let state = upsert(createState(), 'studyTopics', { name: '编程', goal: '完成课程' });
  const topic = last(state, 'studyTopics');
  const invalid = [
    { topicId: 'missing', title: '第一课' },
    { topicId: topic.id, date: '2026-02-29', title: '第一课' },
    { topicId: topic.id, title: '第一课', plannedMinutes: -1 },
    { topicId: topic.id, title: '第一课', actualMinutes: 1.5 },
    { topicId: topic.id, title: '第一课', status: 'unknown' },
    { topicId: topic.id, title: '第一课', videoUrl: 'javascript:alert(1)' },
  ];
  for (const values of invalid) assert.throws(() => upsert(state, 'studyEntries', values));
  state = upsert(state, 'studyEntries', { topicId: topic.id, date: day, title: '第一课' });
  const entry = last(state, 'studyEntries');
  assert.throws(() => upsert(state, 'plans', { date: day, module: 'fitness', link: { type: 'studyEntry', id: entry.id } }));
  const bad = structuredClone(state); bad.studyEntries[0].notes = null;
  assert.throws(() => validateState(bad));
});
