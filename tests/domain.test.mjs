import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECTIONS, createState, upsert, remove, titleForPlan, nutritionSummary, migrateState,
  waterTotal, toKg, fromKg, toMl, fromMl, setSettings, validateState,
  makeBackup, parseBackup, previewBackup, localDate, weekStart,
} from '../domain.mjs';

const DAY = '2026-10-10';
const copy = value => structuredClone(value);
const last = (state, collection) => state[collection].at(-1);
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
function projectFixture() {
  let state = upsert(createState(), 'projects', { name: '个人应用', targetDate: '2026-11-01' });
  const project = last(state, 'projects');
  state = upsert(state, 'workItems', { projectId: project.id, title: '实现本地保存' });
  const item = last(state, 'workItems');
  state = upsert(state, 'plans', { date: DAY, link: { type: 'workItem', id: item.id }, steps: [{ title: '先写测试' }, { title: '检查重开' }] });
  return { state, project, item, plan: last(state, 'plans') };
}
function trainingFixture() {
  let state = upsert(createState(), 'exercises', { name: '杠铃深蹲', notes: '保持稳定' });
  const exercise = last(state, 'exercises');
  state = upsert(state, 'routines', { name: '周六腿部训练', weekday: 6, exerciseIds: [exercise.id] });
  const routine = last(state, 'routines');
  state = upsert(state, 'sessions', { routineId: routine.id, date: DAY,
    entries: [{ exerciseId: exercise.id, sets: [{ reps: 8, weightKg: 60 }, { reps: 6, weightKg: 65 }] }] });
  return { state, exercise, routine, session: last(state, 'sessions') };
}
function fullFixture() {
  let { state, project, item } = projectFixture();
  state = upsert(state, 'memos', { content: '明天整理资料' });
  state = upsert(state, 'milestones', { projectId: project.id, title: '第一版完成', date: '2026-10-31' });
  state = upsert(state, 'devLogs', { projectId: project.id, date: DAY, content: '实现存储测试' });
  state = upsert(state, 'exercises', { name: '卧推' });
  const exercise = last(state, 'exercises');
  state = upsert(state, 'routines', { name: '上肢训练', weekday: 6, exerciseIds: [exercise.id] });
  const routine = last(state, 'routines');
  state = upsert(state, 'sessions', { routineId: routine.id, date: DAY, status: 'done',
    entries: [{ exerciseId: exercise.id, sets: [{ reps: 10, weightKg: 20 }, { reps: 8, weightKg: 25 }] }] });
  state = upsert(state, 'mealPlans', { date: DAY, title: '米饭和蔬菜', meal: 'lunch' });
  state = upsert(state, 'foods', { date: DAY, meal: 'lunch', name: '米饭', portion: '一碗', calories: 200, protein: 4, carbs: 40, fat: 1 });
  state = upsert(state, 'waters', { date: DAY, amountMl: 300 });
  state = upsert(state, 'games', { name: '星露谷物语', status: 'playing', progress: '第一年春天' });
  state = upsert(state, 'plays', { gameId: last(state, 'games').id, date: DAY, minutes: 35 });
  state = setSettings(state, { dateFormat: 'YYYY/MM/DD', weightUnit: 'lb', waterUnit: 'L', weekStartsOn: 0 });
  return { state, project, item };
}

test('new state is empty, has the fixed version/settings, and every expected collection', () => {
  const state = createState();
  assert.equal(validateState(state), state);
  assert.equal(COLLECTIONS.length, 17);
  assert.deepEqual(state.settings, { dateFormat: 'YYYY-MM-DD', weekStartsOn: 1, weightUnit: 'kg', waterUnit: 'ml' });
  for (const collection of COLLECTIONS) assert.deepEqual(state[collection], []);
  assert.deepEqual(Object.keys(state).sort(), ['version', 'settings', ...COLLECTIONS].sort());
  assert.equal(Object.hasOwn(state, 'consultations'), false);
});

test('upsert adds UUID and timestamps without mutating or sharing the prior state', () => {
  const before = freeze(createState());
  const after = upsert(before, 'memos', { content: '第一条备忘' });
  const memo = last(after, 'memos');
  assert.match(memo.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(new Date(memo.createdAt).toISOString(), memo.createdAt);
  assert.equal(memo.updatedAt, memo.createdAt);
  assert.equal(before.memos.length, 0);
  after.settings.weightUnit = 'lb';
  assert.equal(before.settings.weightUnit, 'kg');
});

test('partial updates preserve ID, creation time and omitted record fields', () => {
  const { state, project, item } = projectFixture();
  const original = copy(state);
  const after = upsert(freeze(state), 'workItems', { status: 'doing' }, item.id);
  assert.deepEqual(state, original);
  assert.equal(after.workItems[0].id, item.id);
  assert.equal(after.workItems[0].createdAt, item.createdAt);
  assert.equal(after.workItems[0].projectId, project.id);
  assert.equal(after.workItems[0].title, item.title);
  assert.equal(after.workItems[0].status, 'doing');
  assert.notEqual(after.workItems[0], state.workItems[0]);
});

test('missing update/delete targets are rejected instead of silently creating or ignoring', () => {
  const state = createState();
  assert.throws(() => upsert(state, 'memos', { content: 'test' }, 'missing'), /不存在/);
  assert.throws(() => remove(state, 'memos', 'missing'), /不存在/);
  assert.throws(() => upsert(state, 'consultations', {}), /不支持/);
  assert.throws(() => remove(state, 'unknown', 'missing'), /不支持/);
  assert.throws(() => upsert(state, 'memos', { content: 'test', id: 'manual' }), /字段/);
});

test('all required text is validated, with empty optional text allowed', () => {
  assert.throws(() => upsert(createState(), 'memos', { content: '  ' }), /不能为空/);
  assert.throws(() => upsert(createState(), 'projects', { name: 123 }), /不能为空/);
  assert.throws(() => upsert(createState(), 'foods', { name: '米饭' }), /份量/);
  const state = upsert(createState(), 'projects', { name: 'APP', description: '', targetDate: '' });
  assert.equal(state.projects[0].description, '');
});

test('plan defaults, unique steps and immutable completion are persisted separately', () => {
  let state = upsert(createState(), 'plans', { title: '阅读', date: DAY, steps: [{ title: '第一章' }, { title: '记笔记' }] });
  const plan = state.plans[0];
  assert.deepEqual([plan.time, plan.module, plan.priority, plan.status, plan.link], ['', 'personal', 'normal', 'pending', null]);
  assert.notEqual(plan.steps[0].id, plan.steps[1].id);
  assert.equal(plan.steps[0].done, false);
  const initial = copy(state);
  state = upsert(state, 'plans', { status: 'done', steps: plan.steps.map((step, i) => ({ ...step, done: i === 0 })) }, plan.id);
  assert.equal(state.plans[0].steps[0].done, true);
  assert.equal(initial.plans[0].steps[0].done, false);
  for (const collection of ['devLogs', 'sessions', 'foods', 'plays']) assert.deepEqual(state[collection], []);
});

test('plan date/time/enums reject invalid calendar values and illegal types', () => {
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '2026-1-01', 'not-a-date']) {
    assert.throws(() => upsert(createState(), 'plans', { title: '阅读', date }));
  }
  for (const values of [{ time: '24:00' }, { time: '9:00' }, { module: 'consultation' }, { priority: 'urgent' }, { status: true }]) {
    assert.throws(() => upsert(createState(), 'plans', { title: '阅读', date: DAY, ...values }));
  }
  const state = upsert(createState(), 'plans', { title: '闰日', date: '2024-02-29', time: '23:59' });
  assert.equal(state.plans[0].time, '23:59');
});

test('invalid step structure, done type and duplicate nested IDs are rejected', () => {
  for (const steps of [null, [{ title: '' }], [{ title: 'A', done: 'true' }], [{ title: 'A', other: 1 }], [{ id: 'dup', title: 'A' }, { id: 'dup', title: 'B' }]]) {
    assert.throws(() => upsert(createState(), 'plans', { title: '计划', steps }));
  }
});

test('live source title updates without changing plan date, priority or independent status', () => {
  const { state, item, plan } = projectFixture();
  const after = upsert(state, 'workItems', { title: '修复本地保存', status: 'done' }, item.id);
  assert.equal(titleForPlan(after, after.plans[0]), '修复本地保存');
  assert.equal(after.plans[0].status, 'pending');
  assert.equal(after.plans[0].date, DAY);
  assert.equal(after.plans[0].priority, 'normal');
  assert.equal(plan.module, 'development');
  const moved = upsert(after, 'plans', { date: '2026-10-11', status: 'done' }, plan.id);
  assert.equal(moved.workItems[0].status, 'done');
  assert.equal(moved.plans.filter(record => record.date === DAY).length, 0);
  assert.equal(moved.workItems.length, 1);
  assert.equal(moved.devLogs.length, 0);
});

test('deleting a plan removes only its steps/link and keeps all domain data intact', () => {
  const { state, plan } = projectFixture();
  const expected = copy(state.workItems);
  const after = remove(state, 'plans', plan.id);
  assert.deepEqual(after.plans, []);
  assert.deepEqual(after.workItems, expected);
  assert.equal(state.plans[0].steps.length, 2);
});

test('deleting a source detaches the plan with its current source title and retains scheduling fields', () => {
  const fixture = projectFixture();
  let state = upsert(fixture.state, 'workItems', { title: '最新标题' }, fixture.item.id);
  state = upsert(state, 'plans', { status: 'done', time: '08:00', priority: 'high' }, fixture.plan.id);
  const after = remove(state, 'workItems', fixture.item.id);
  assert.deepEqual(after.workItems, []);
  assert.equal(after.plans[0].title, '最新标题');
  assert.equal(after.plans[0].link, null);
  assert.equal(after.plans[0].date, DAY);
  assert.equal(after.plans[0].time, '08:00');
  assert.equal(after.plans[0].status, 'done');
  assert.equal(after.plans[0].priority, 'high');
  assert.equal(after.plans[0].steps.length, 2);
});

test('project deletion cascades own children, detaches plans and leaves other projects intact', () => {
  const fixture = projectFixture();
  let state = upsert(fixture.state, 'milestones', { projectId: fixture.project.id, title: '完成', date: DAY });
  state = upsert(state, 'devLogs', { projectId: fixture.project.id, content: '进展', date: DAY });
  state = upsert(state, 'projects', { name: '另一个项目' });
  const other = last(state, 'projects');
  state = upsert(state, 'workItems', { projectId: other.id, title: '保留项' });
  const after = remove(freeze(state), 'projects', fixture.project.id);
  assert.equal(after.projects.length, 1);
  assert.equal(after.projects[0].id, other.id);
  assert.deepEqual(after.workItems.map(record => record.title), ['保留项']);
  assert.deepEqual(after.milestones, []);
  assert.deepEqual(after.devLogs, []);
  assert.equal(after.plans[0].link, null);
  assert.equal(after.plans[0].title, fixture.item.title);
});

test('new training sessions capture names and two independent sets with unique IDs', () => {
  const { state, exercise, routine, session } = trainingFixture();
  assert.equal(session.name, routine.name);
  assert.equal(session.entries[0].name, exercise.name);
  assert.equal(session.entries[0].sets.length, 2);
  const ids = [session.id, session.entries[0].id, ...session.entries[0].sets.map(set => set.id)];
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(session.entries[0].sets.map(({ reps, weightKg }) => [reps, weightKg]), [[8, 60], [6, 65]]);
  assert.equal(state.sessions[0].status, 'active');
});

test('training history snapshots survive library renames and exercise deletion', () => {
  const fixture = trainingFixture();
  let state = upsert(fixture.state, 'exercises', { name: '改名后的深蹲' }, fixture.exercise.id);
  assert.equal(state.sessions[0].entries[0].name, '杠铃深蹲');
  state = remove(state, 'exercises', fixture.exercise.id);
  assert.deepEqual(state.routines[0].exerciseIds, []);
  assert.equal(state.sessions[0].entries[0].exerciseId, null);
  assert.equal(state.sessions[0].entries[0].name, '杠铃深蹲');
  assert.equal(state.sessions[0].entries[0].sets[1].weightKg, 65);
});

test('deleting a training arrangement keeps actual history and detaches its plan', () => {
  const fixture = trainingFixture();
  const state = upsert(fixture.state, 'plans', { date: DAY, link: { type: 'routine', id: fixture.routine.id } });
  const after = remove(state, 'routines', fixture.routine.id);
  assert.equal(after.sessions.length, 1);
  assert.equal(after.sessions[0].routineId, null);
  assert.equal(after.sessions[0].name, fixture.routine.name);
  assert.equal(after.sessions[0].entries[0].sets.length, 2);
  assert.equal(after.plans[0].link, null);
});

test('training numeric validation rejects zero/fractional reps, negative weight and unfinished empty completion', () => {
  const fixture = trainingFixture();
  for (const values of [{ reps: 0, weightKg: 5 }, { reps: 2.5, weightKg: 5 }, { reps: 5, weightKg: -1 }, { reps: 5, weightKg: Infinity }]) {
    assert.throws(() => upsert(fixture.state, 'sessions', { name: '训练', date: DAY, entries: [{ name: '动作', sets: [values] }] }));
  }
  assert.throws(() => upsert(fixture.state, 'sessions', { name: '训练', status: 'done', entries: [] }), /至少记录一组/);
  const state = upsert(fixture.state, 'sessions', { name: '自重训练', entries: [{ name: '俯卧撑', sets: [{ reps: 10, weightKg: 0 }] }] });
  assert.equal(last(state, 'sessions').entries[0].sets[0].weightKg, 0);
});

test('dated arrangements validate dates while preserving weekly compatibility', () => {
  const { state, exercise } = trainingFixture();
  for (const values of [{ weekday: -1 }, { weekday: 7 }, { weekday: 0.5 }, { exerciseIds: ['missing'] }, { exerciseIds: [exercise.id, exercise.id] }]) {
    assert.throws(() => upsert(state, 'routines', { name: '训练安排', ...values }));
  }
  const dated = upsert(state, 'routines', { name: '指定日期训练', date: DAY, weekday: 0, exerciseIds: [exercise.id] });
  assert.equal(dated.routines.at(-1).date, DAY);
  assert.throws(() => upsert(state, 'routines', { name: '无效日期训练', date: '2026-02-29', exerciseIds: [exercise.id] }));
  const weekly = upsert(state, 'routines', { name: '星期训练', weekday: 6, exerciseIds: [exercise.id] });
  assert.equal(weekly.routines[0].date, '');
});

test('exercise groups classify actions, support reassignment, and deleting a group keeps actions ungrouped', () => {
  let state = upsert(createState(), 'exerciseGroups', { name: '腿部训练' });
  const group = last(state, 'exerciseGroups');
  state = upsert(state, 'exercises', { name: '杠铃深蹲', groupId: group.id });
  const exercise = last(state, 'exercises');
  assert.equal(exercise.groupId, group.id);
  state = upsert(state, 'exerciseGroups', { name: '力量训练' }, group.id);
  assert.equal(state.exerciseGroups[0].name, '力量训练');
  state = remove(state, 'exerciseGroups', group.id);
  assert.equal(state.exercises[0].groupId, null);
  assert.equal(state.exerciseGroups.length, 0);
});

test('version 6 routine data migrates with an empty date field', () => {
  const { state } = trainingFixture();
  const legacy = structuredClone(state);
  legacy.version = 6;
  delete legacy.exerciseGroups;
  for (const exercise of legacy.exercises) delete exercise.groupId;
  delete legacy.routines[0].date;
  const migrated = migrateState(legacy);
  assert.equal(migrated.version, 8);
  assert.equal(migrated.routines[0].date, '');
});

test('nutrition totals include only actual foods for the chosen date and preserve missing-versus-zero semantics', () => {
  let state = upsert(createState(), 'mealPlans', { date: DAY, title: '计划餐食' });
  assert.deepEqual(nutritionSummary(state, DAY), { calories: 0, protein: 0, carbs: 0, fat: 0, partial: false });
  state = upsert(state, 'foods', { date: DAY, name: '米饭', portion: '一碗', calories: 200, carbs: 20, fat: 0 });
  state = upsert(state, 'foods', { date: DAY, name: '鸡肉', portion: '一块', calories: 100, protein: 10, fat: 5 });
  state = upsert(state, 'foods', { date: '2026-10-11', name: '次日食物', portion: '一份', calories: 999 });
  assert.deepEqual(nutritionSummary(state, DAY), { calories: 300, protein: 10, carbs: 20, fat: 5, partial: true });
  assert.equal(nutritionSummary(state, '2026-10-11').calories, 999);
});

test('complete numeric zero nutrient records are complete and fractional sums stay exact to display precision', () => {
  let state = upsert(createState(), 'foods', { date: DAY, name: '茶', portion: '一杯', calories: 0, protein: 0, carbs: 0, fat: 0 });
  assert.deepEqual(nutritionSummary(state, DAY), { calories: 0, protein: 0, carbs: 0, fat: 0, partial: false });
  state = upsert(state, 'foods', { date: DAY, name: '第一份', portion: '少量', calories: 0.1, protein: 0, carbs: 0, fat: 0 });
  state = upsert(state, 'foods', { date: DAY, name: '第二份', portion: '少量', calories: 0.2, protein: 0, carbs: 0, fat: 0 });
  assert.equal(nutritionSummary(state, DAY).calories, 0.3);
});

test('editing or removing actual foods immediately changes derived nutrition totals', () => {
  let state = upsert(createState(), 'foods', { date: DAY, name: '鸡蛋', portion: '一只', calories: 80 });
  const id = state.foods[0].id;
  state = upsert(state, 'foods', { calories: 90 }, id);
  assert.equal(nutritionSummary(state, DAY).calories, 90);
  state = remove(state, 'foods', id);
  assert.equal(nutritionSummary(state, DAY).calories, 0);
});

test('planned meals and their plans are isolated from actual intake records', () => {
  let state = upsert(createState(), 'mealPlans', { date: DAY, title: '计划早餐' });
  const meal = last(state, 'mealPlans');
  state = upsert(state, 'plans', { date: DAY, link: { type: 'mealPlan', id: meal.id }, status: 'done' });
  assert.equal(state.foods.length, 0);
  assert.equal(nutritionSummary(state, DAY).calories, 0);
  state = upsert(state, 'foods', { date: DAY, name: '实际早餐', portion: '一份', calories: 250 });
  state = remove(state, 'mealPlans', meal.id);
  assert.equal(state.plans[0].title, '计划早餐');
  assert.equal(state.plans[0].link, null);
  assert.equal(state.foods.length, 1);
  assert.equal(nutritionSummary(state, DAY).calories, 250);
});

test('water totals use actual dated amounts only and validate positive finite amounts', () => {
  let state = upsert(createState(), 'waters', { date: DAY, amountMl: 250 });
  state = upsert(state, 'waters', { date: DAY, amountMl: toMl(0.5, 'L') });
  state = upsert(state, 'waters', { date: '2026-10-11', amountMl: 1000 });
  assert.equal(waterTotal(state, DAY), 750);
  assert.equal(waterTotal(state, '2026-10-11'), 1000);
  assert.equal(Object.hasOwn(state.settings, 'waterGoal'), false);
  for (const amountMl of [0, -1, '500', NaN, Infinity]) assert.throws(() => upsert(state, 'waters', { date: DAY, amountMl }));
});

test('game status/progress updates do not create actual plays; removal cascades plays and detaches plans', () => {
  let state = upsert(createState(), 'games', { name: '游戏一', status: 'playing' });
  const game = last(state, 'games');
  state = upsert(state, 'plans', { date: DAY, link: { type: 'game', id: game.id }, status: 'done' });
  assert.equal(state.plays.length, 0);
  state = upsert(state, 'plays', { gameId: game.id, date: DAY, minutes: 45 });
  state = upsert(state, 'plays', { gameId: game.id, date: '2026-10-11', minutes: 30 });
  state = upsert(state, 'games', { name: '游戏二' });
  const other = last(state, 'games');
  state = upsert(state, 'plays', { gameId: other.id, date: DAY, minutes: 10 });
  state = upsert(state, 'games', { name: '游戏一的新名', progress: '第二章' }, game.id);
  assert.equal(titleForPlan(state, state.plans[0]), '游戏一的新名');
  const after = remove(state, 'games', game.id);
  assert.equal(after.games.length, 1);
  assert.equal(after.plays.length, 1);
  assert.equal(after.plays[0].gameId, other.id);
  assert.equal(after.plans[0].title, '游戏一的新名');
  assert.equal(after.plans[0].link, null);
});

test('game minutes, nutrition and enum inputs reject wrong types and nonfinite/negative values', () => {
  const state = upsert(createState(), 'games', { name: '游戏' });
  for (const minutes of [0, -10, '30', Infinity, NaN]) assert.throws(() => upsert(state, 'plays', { gameId: state.games[0].id, minutes }));
  for (const calories of [-1, '100', Infinity, NaN, undefined]) assert.throws(() => upsert(state, 'foods', { name: '食物', portion: '一份', calories }));
  assert.throws(() => upsert(state, 'games', { name: '游戏', status: 'unknown' }));
  assert.throws(() => upsert(state, 'foods', { name: '食物', portion: '一份', meal: 'unknown' }));
});

test('unit conversions preserve physical weight and drinking volume rather than just changing labels', () => {
  assert.equal(toKg(100, 'lb'), 45.359237);
  assert.ok(Math.abs(fromKg(toKg(123.45, 'lb'), 'lb') - 123.45) < 1e-10);
  assert.equal(toKg(60, 'kg'), 60);
  assert.ok(Math.abs(fromKg(60, 'lb') - 132.27735731092653) < 1e-10);
  assert.equal(toMl(1.25, 'L'), 1250);
  assert.equal(fromMl(1250, 'L'), 1.25);
  assert.equal(fromMl(250, 'ml'), 250);
  assert.equal(toKg(0, 'kg'), 0);
  for (const fn of [toKg, fromKg]) {
    assert.throws(() => fn(1, 'stone'));
    assert.throws(() => fn(-1, 'kg'));
    assert.throws(() => fn('1', 'kg'));
  }
  for (const fn of [toMl, fromMl]) assert.throws(() => fn(1, 'cup'));
});

test('settings are immutable and changing units does not reinterpret stored training or water', () => {
  let { state } = trainingFixture();
  state = upsert(state, 'waters', { date: DAY, amountMl: 500 });
  const before = copy(state);
  const after = setSettings(freeze(state), { weightUnit: 'lb', waterUnit: 'L', weekStartsOn: 0, dateFormat: 'MM/DD/YYYY' });
  assert.deepEqual(state, before);
  assert.deepEqual(after.sessions, before.sessions);
  assert.equal(after.waters[0].amountMl, 500);
  assert.equal(fromMl(waterTotal(after, DAY), after.settings.waterUnit), 0.5);
  assert.throws(() => setSettings(after, { weightUnit: 'lbs' }));
  assert.throws(() => setSettings(after, { weekStartsOn: '1' }));
  assert.throws(() => setSettings(after, { waterGoal: 2000 }));
});

test('backup round-trip contains every module, settings, stable IDs and associations', () => {
  const { state } = fullFixture();
  const backup = makeBackup(freeze(state));
  assert.equal(backup.app, 'zhic-life');
  assert.equal(backup.version, 8);
  assert.equal(new Date(backup.exportedAt).toISOString(), backup.exportedAt);
  const restored = parseBackup(JSON.stringify(backup));
  assert.deepEqual(restored, state);
  assert.equal(restored.plans[0].link.id, restored.workItems[0].id);
  assert.equal(restored.sessions[0].entries[0].sets.length, 2);
  assert.equal(restored.settings.weightUnit, 'lb');
  backup.data.memos[0].content = 'changed';
  assert.equal(state.memos[0].content, '明天整理资料');
});

test('backup previews enumerate all record counts without inventing or mutating data', () => {
  const { state } = fullFixture();
  const counts = previewBackup(freeze(state));
  assert.deepEqual(Object.keys(counts), COLLECTIONS);
  for (const collection of COLLECTIONS) assert.equal(counts[collection], ['studyTopics', 'studyEntries', 'exerciseGroups'].includes(collection) ? 0 : 1);
});

test('corrupt JSON, wrong app, unsupported versions and missing envelope fields are rejected', () => {
  const { state } = fullFixture();
  const original = copy(state);
  for (const text of ['{', 'null', '[]', 'false', '"string"', '{}']) assert.throws(() => parseBackup(text));
  const changes = [
    backup => { backup.app = 'other'; },
    backup => { backup.version = 9; },
    backup => { backup.data.version = 1; },
    backup => { delete backup.exportedAt; },
    backup => { backup.exportedAt = '2026-02-30'; },
    backup => { backup.unknown = true; },
  ];
  for (const change of changes) {
    const backup = makeBackup(state);
    change(backup);
    assert.throws(() => parseBackup(JSON.stringify(backup)));
  }
  assert.deepEqual(state, original);
});

test('backup validation rejects structural corruption instead of accepting parseable JSON', () => {
  const { state } = fullFixture();
  const corruptions = [
    data => { delete data.games; },
    data => { data.memos = {}; },
    data => { data.memos[0] = null; },
    data => { data.memos[0].content = 1; },
    data => { data.settings.weightUnit = 'unknown'; },
    data => { data.consultations = []; },
    data => { data.projects[0].unexpected = true; },
    data => { delete data.foods[0].protein; },
    data => { data.foods[0].calories = '200'; },
    data => { data.plays[0].minutes = 0; },
    data => { data.mealPlans[0].date = '2026-02-29'; },
    data => { data.games[0].createdAt = 'yesterday'; },
    data => { data.games[0].updatedAt = '2020-01-01T00:00:00.000Z'; },
    data => { data.plans[0].steps[0].done = 'true'; },
    data => { data.sessions[0].entries[0].sets[0].reps = 1.5; },
  ];
  for (const change of corruptions) {
    const backup = makeBackup(state);
    change(backup.data);
    assert.throws(() => parseBackup(JSON.stringify(backup)));
  }
});

test('backup validation rejects duplicate top-level or nested identifiers', () => {
  const { state } = fullFixture();
  const corruptions = [
    data => { data.memos.push(copy(data.memos[0])); },
    data => { data.games[0].id = data.memos[0].id; },
    data => { data.plans[0].steps[1].id = data.plans[0].steps[0].id; },
    data => { data.sessions[0].entries[0].sets[1].id = data.sessions[0].entries[0].sets[0].id; },
    data => { data.sessions[0].entries[0].id = data.plans[0].id; },
  ];
  for (const change of corruptions) {
    const backup = makeBackup(state);
    change(backup.data);
    assert.throws(() => parseBackup(JSON.stringify(backup)), /重复/);
  }
});

test('backup validation rejects missing parents and stale or mismatched source links', () => {
  const { state } = fullFixture();
  const corruptions = [
    data => { data.workItems[0].projectId = 'missing'; },
    data => { data.milestones[0].projectId = 'missing'; },
    data => { data.devLogs[0].projectId = 'missing'; },
    data => { data.routines[0].exerciseIds = ['missing']; },
    data => { data.sessions[0].routineId = 'missing'; },
    data => { data.sessions[0].entries[0].exerciseId = 'missing'; },
    data => { data.plays[0].gameId = 'missing'; },
    data => { data.plans[0].link.id = 'missing'; },
    data => { data.plans[0].link.type = 'project'; },
    data => { data.plans[0].module = 'fitness'; },
  ];
  for (const change of corruptions) {
    const backup = makeBackup(state);
    change(backup.data);
    assert.throws(() => parseBackup(JSON.stringify(backup)));
  }
});

test('local date formatting uses local calendar components including year/month boundaries', () => {
  const date = new Date(2026, 0, 1, 0, 1);
  assert.equal(localDate(date), '2026-01-01');
  assert.equal(localDate(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  assert.equal(localDate(new Date(2024, 1, 29, 12)), '2024-02-29');
  assert.throws(() => localDate(new Date(NaN)), /日期无效/);
});

test('week start handles Monday/Sunday preferences, month/year rollover and leap days', () => {
  assert.equal(weekStart('2026-10-10', 1), '2026-10-05');
  assert.equal(weekStart('2026-10-10', 0), '2026-10-04');
  assert.equal(weekStart('2026-10-11', 0), '2026-10-11');
  assert.equal(weekStart('2026-01-01', 1), '2025-12-29');
  assert.equal(weekStart('2024-03-01', 1), '2024-02-26');
  assert.throws(() => weekStart('2026-02-29', 1));
  assert.throws(() => weekStart(DAY, 2));
});
