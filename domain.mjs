/**
 * Local application data, version 4. All records have id, createdAt, updatedAt.
 * settings: {dateFormat:'YYYY-MM-DD'|'YYYY/MM/DD'|'MM/DD/YYYY',
 *   weekStartsOn:1|0, weightUnit:'kg'|'lb', waterUnit:'ml'|'L'}.
 * memos:{content}; plans:{title,date,time,module,priority,status,steps,link};
 * studyTopics:{name,goal}; studyEntries:{topicId,date,title,plannedMinutes,
 *   actualMinutes,notes,status,videoUrl}; projects:{name,status,targetDate,description};
 * workItems:{projectId,title,status};
 * milestones:{projectId,title,date,done}; devLogs:{projectId,date,content};
 * exercises:{name,notes,videoUrl}; routines:{name,weekday,exerciseIds};
 * sessions:{routineId,name,date,status,entries:[{id,exerciseId,name,
 *   sets:[{id,reps,weightKg}]}]}; mealPlans:{date,meal,title};
 * foods:{date,meal,name,portion,calories,protein,carbs,fat}; waters:{date,amountMl};
 * games:{name,status,progress}; plays:{gameId,date,minutes}.
 * Plan steps are {id,title,done}; link is null or {type,id}, with type
 * studyEntry|workItem|routine|mealPlan|game. Actual training is stored in kg; water in ml.
 * Historical exercise names are snapshots, not live exercise-library labels.
 */

export const COLLECTIONS = Object.freeze([
  'memos', 'plans', 'studyTopics', 'studyEntries', 'projects', 'workItems', 'milestones', 'devLogs',
  'exercises', 'routines', 'sessions', 'mealPlans', 'foods', 'waters',
  'games', 'plays',
]);
const COLLECTIONS_V1 = Object.freeze(COLLECTIONS.filter(key => !['studyTopics', 'studyEntries'].includes(key)));
const COLLECTIONS_V2 = COLLECTIONS;
const CURRENT_VERSION = 4;

const SETTINGS = Object.freeze({
  dateFormat: 'YYYY-MM-DD', weekStartsOn: 1, weightUnit: 'kg', waterUnit: 'ml',
});
const LINK_TYPES = Object.freeze({
  studyEntry: { collection: 'studyEntries', module: 'study', title: 'title' },
  workItem: { collection: 'workItems', module: 'development', title: 'title' },
  routine: { collection: 'routines', module: 'fitness', title: 'name' },
  mealPlan: { collection: 'mealPlans', module: 'diet', title: 'title' },
  game: { collection: 'games', module: 'gaming', title: 'name' },
});
const META = ['id', 'createdAt', 'updatedAt'];
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const NUTRIENTS = ['calories', 'protein', 'carbs', 'fat'];
const KG_PER_LB = 0.45359237;
const uuid = () => globalThis.crypto.randomUUID();
const clone = value => structuredClone(value);
const fail = message => { throw new Error(message); };
const requireThat = (condition, message) => { if (!condition) fail(message); };
const plainObject = value => value !== null && typeof value === 'object'
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function objectKeys(value, keys, label, { partial = false } = {}) {
  requireThat(plainObject(value), `${label}必须是对象`);
  requireThat(Object.keys(value).every(key => keys.includes(key)), `${label}含有不支持的字段`);
  if (!partial) requireThat(keys.every(key => Object.hasOwn(value, key)), `${label}缺少必要字段`);
}
function textValue(value, label, optional = false) {
  requireThat(typeof value === 'string' && (optional || value.trim().length > 0), `${label}不能为空`);
}
function videoUrlValue(value, label = '教学视频链接') {
  textValue(value, label, true);
  if (!value) return;
  let url;
  try { url = new URL(value); } catch { fail(`${label}必须是有效的 http 或 https 链接`); }
  requireThat(['http:', 'https:'].includes(url.protocol), `${label}必须是有效的 http 或 https 链接`);
}
function oneOf(value, values, label) {
  requireThat(values.includes(value), `${label}不受支持`);
}
function numberValue(value, label, { positive = false, integer = false } = {}) {
  requireThat(typeof value === 'number' && Number.isFinite(value)
    && (positive ? value > 0 : value >= 0) && (!integer || Number.isInteger(value)),
  `${label}必须是${positive ? '大于零的' : '非负的'}${integer ? '整数' : '有效数值'}`);
}
function booleanValue(value, label) {
  requireThat(typeof value === 'boolean', `${label}必须是布尔值`);
}
function arrayValue(value, label) {
  requireThat(Array.isArray(value), `${label}必须是数组`);
}
function isoTimestamp(value, label) {
  requireThat(typeof value === 'string' && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value, `${label}必须是有效 ISO 时间`);
}

export function localDate(date = new Date()) {
  requireThat(date instanceof Date && Number.isFinite(date.getTime()), '日期无效');
  const year = date.getFullYear();
  requireThat(year >= 1 && year <= 9999, '年份超出支持范围');
  return `${String(year).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateValue(value, label = '日期', optional = false) {
  if (optional && value === '') return;
  requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), `${label}格式必须为 YYYY-MM-DD`);
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  requireThat(year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1], `${label}不是有效日历日期`);
}

export function weekStart(dateString, startsOn = 1) {
  dateValue(dateString);
  oneOf(startsOn, [0, 1], '每周起始日');
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - (date.getDay() - startsOn + 7) % 7);
  return localDate(date);
}

function defaults(collection) {
  const date = localDate();
  switch (collection) {
    case 'memos': return { content: '' };
    case 'plans': return { title: '', date, time: '', module: 'personal', priority: 'normal', status: 'pending', steps: [], link: null };
    case 'studyTopics': return { name: '', goal: '' };
    case 'studyEntries': return { topicId: '', date, title: '', plannedMinutes: 0, actualMinutes: 0, notes: '', status: 'pending', videoUrl: '' };
    case 'projects': return { name: '', status: 'active', targetDate: '', description: '' };
    case 'workItems': return { projectId: '', title: '', status: 'pending' };
    case 'milestones': return { projectId: '', title: '', date, done: false };
    case 'devLogs': return { projectId: '', date, content: '' };
    case 'exercises': return { name: '', notes: '', videoUrl: '' };
    case 'routines': return { name: '', weekday: new Date().getDay(), exerciseIds: [] };
    case 'sessions': return { routineId: null, name: '', date, status: 'active', entries: [] };
    case 'mealPlans': return { date, meal: 'breakfast', title: '' };
    case 'foods': return { date, meal: 'breakfast', name: '', portion: '', calories: null, protein: null, carbs: null, fat: null };
    case 'waters': return { date, amountMl: 0 };
    case 'games': return { name: '', status: 'want', progress: '' };
    case 'plays': return { gameId: '', date, minutes: 0 };
    default: fail('不支持的数据集合');
  }
}

export function createState() {
  return { version: CURRENT_VERSION, settings: { ...SETTINGS }, ...Object.fromEntries(COLLECTIONS.map(key => [key, []])) };
}

function validateSettings(settings) {
  objectKeys(settings, Object.keys(SETTINGS), '设置');
  oneOf(settings.dateFormat, ['YYYY-MM-DD', 'YYYY/MM/DD', 'MM/DD/YYYY'], '日期格式');
  oneOf(settings.weekStartsOn, [0, 1], '每周起始日');
  oneOf(settings.weightUnit, ['kg', 'lb'], '重量单位');
  oneOf(settings.waterUnit, ['ml', 'L'], '饮水单位');
}

function validateVersion(state, version) {
  const collections = version === 1 ? COLLECTIONS_V1 : COLLECTIONS_V2;
  const links = version === 1 ? Object.fromEntries(Object.entries(LINK_TYPES).filter(([type]) => type !== 'studyEntry')) : LINK_TYPES;
  objectKeys(state, ['version', 'settings', ...collections], '应用数据');
  requireThat(state.version === version, '不支持的数据版本');
  validateSettings(state.settings);
  const identifiers = new Set();
  const identify = (value, label) => {
    textValue(value, `${label} ID`);
    requireThat(!identifiers.has(value), `${label} ID 重复`);
    identifiers.add(value);
  };
  const refs = Object.fromEntries(collections.map(collection => {
    arrayValue(state[collection], collection);
    return [collection, new Set(state[collection].map(record => record?.id))];
  }));
  const reference = (id, collection, label, nullable = false) => {
    if (nullable && id === null) return;
    textValue(id, label);
    requireThat(refs[collection].has(id), `${label}引用的记录不存在`);
  };
  for (const collection of collections) {
    for (const record of state[collection]) {
      const fields = Object.keys(defaults(collection)).filter(key => !(
        (version <= 2 && collection === 'studyEntries' && key === 'videoUrl')
        || (version <= 3 && collection === 'exercises' && key === 'videoUrl')
      ));
      objectKeys(record, [...META, ...fields], collection);
      identify(record.id, collection);
      isoTimestamp(record.createdAt, '创建时间');
      isoTimestamp(record.updatedAt, '更新时间');
      requireThat(record.createdAt <= record.updatedAt, '更新时间不能早于创建时间');
      switch (collection) {
        case 'memos': textValue(record.content, '备忘内容'); break;
        case 'plans':
          textValue(record.title, '计划标题');
          dateValue(record.date);
          requireThat(typeof record.time === 'string' && (record.time === '' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(record.time)), '时间格式必须为 HH:mm');
          oneOf(record.module, version === 1
            ? ['personal', 'development', 'fitness', 'diet', 'gaming']
            : ['personal', 'study', 'development', 'fitness', 'diet', 'gaming'], '所属模块');
          oneOf(record.priority, ['low', 'normal', 'high'], '优先级');
          oneOf(record.status, ['pending', 'done'], '计划状态');
          arrayValue(record.steps, '计划步骤');
          for (const step of record.steps) {
            objectKeys(step, ['id', 'title', 'done'], '计划步骤');
            identify(step.id, '计划步骤');
            textValue(step.title, '步骤标题');
            booleanValue(step.done, '步骤完成状态');
          }
          if (record.link !== null) {
            objectKeys(record.link, ['type', 'id'], '计划关联');
            oneOf(record.link.type, Object.keys(links), '关联类型');
            const source = links[record.link.type];
            reference(record.link.id, source.collection, '计划关联');
            requireThat(source.module === record.module, '计划所属模块与关联记录不一致');
          }
          break;
        case 'studyTopics':
          textValue(record.name, '学习主题');
          textValue(record.goal, '学习目标');
          break;
        case 'studyEntries':
          reference(record.topicId, 'studyTopics', '学习主题');
          dateValue(record.date);
          textValue(record.title, '学习安排');
          numberValue(record.plannedMinutes, '计划时长', { integer: true });
          numberValue(record.actualMinutes, '实际学习时长', { integer: true });
          textValue(record.notes, '学习笔记', true);
          oneOf(record.status, ['pending', 'done'], '学习状态');
          if (version >= 3) videoUrlValue(record.videoUrl);
          break;
        case 'projects':
          textValue(record.name, '项目名称');
          oneOf(record.status, ['active', 'paused', 'done'], '项目状态');
          dateValue(record.targetDate, '目标日期', true);
          textValue(record.description, '项目说明', true);
          break;
        case 'workItems':
          reference(record.projectId, 'projects', '所属项目');
          textValue(record.title, '工作项标题');
          oneOf(record.status, ['pending', 'doing', 'done'], '工作项状态');
          break;
        case 'milestones':
          reference(record.projectId, 'projects', '所属项目');
          textValue(record.title, '里程碑标题');
          dateValue(record.date);
          booleanValue(record.done, '里程碑完成状态');
          break;
        case 'devLogs':
          reference(record.projectId, 'projects', '所属项目');
          dateValue(record.date);
          textValue(record.content, '开发日志内容');
          break;
        case 'exercises':
          textValue(record.name, '动作名称');
          textValue(record.notes, '动作说明', true);
          if (version >= CURRENT_VERSION) videoUrlValue(record.videoUrl);
          break;
        case 'routines':
          textValue(record.name, '训练安排名称');
          numberValue(record.weekday, '训练星期', { integer: true });
          requireThat(record.weekday <= 6, '训练星期必须在 0 到 6 之间');
          arrayValue(record.exerciseIds, '训练动作');
          requireThat(new Set(record.exerciseIds).size === record.exerciseIds.length, '训练安排含有重复动作');
          for (const id of record.exerciseIds) reference(id, 'exercises', '训练动作');
          break;
        case 'sessions':
          reference(record.routineId, 'routines', '训练安排', true);
          textValue(record.name, '训练名称');
          dateValue(record.date);
          oneOf(record.status, ['active', 'done'], '训练状态');
          arrayValue(record.entries, '训练动作记录');
          for (const entry of record.entries) {
            objectKeys(entry, ['id', 'exerciseId', 'name', 'sets'], '训练动作记录');
            identify(entry.id, '训练动作记录');
            reference(entry.exerciseId, 'exercises', '训练动作', true);
            textValue(entry.name, '历史动作名称');
            arrayValue(entry.sets, '训练组');
            for (const set of entry.sets) {
              objectKeys(set, ['id', 'reps', 'weightKg'], '训练组');
              identify(set.id, '训练组');
              numberValue(set.reps, '训练次数', { positive: true, integer: true });
              numberValue(set.weightKg, '训练重量');
            }
          }
          if (record.status === 'done') requireThat(record.entries.some(entry => entry.sets.length > 0), '完成训练前请至少记录一组');
          break;
        case 'mealPlans':
          dateValue(record.date);
          oneOf(record.meal, MEALS, '餐次');
          textValue(record.title, '计划餐食');
          break;
        case 'foods':
          dateValue(record.date);
          oneOf(record.meal, MEALS, '餐次');
          textValue(record.name, '食物名称');
          textValue(record.portion, '食物份量');
          for (const nutrient of NUTRIENTS) if (record[nutrient] !== null) numberValue(record[nutrient], nutrient);
          break;
        case 'waters':
          dateValue(record.date);
          numberValue(record.amountMl, '饮水量', { positive: true });
          break;
        case 'games':
          textValue(record.name, '游戏名称');
          oneOf(record.status, ['want', 'playing', 'finished', 'paused'], '游戏状态');
          textValue(record.progress, '游戏进度', true);
          break;
        case 'plays':
          reference(record.gameId, 'games', '游戏');
          dateValue(record.date);
          numberValue(record.minutes, '游玩分钟数', { positive: true });
          break;
      }
    }
  }
  return state;
}

export function validateState(state) { return validateVersion(state, CURRENT_VERSION); }

export function migrateState(state) {
  if (state?.version === CURRENT_VERSION) return validateState(state);
  if (state?.version === 3) {
    validateVersion(state, 3);
    return validateState({ ...clone(state), version: CURRENT_VERSION,
      exercises: state.exercises.map(exercise => ({ ...exercise, videoUrl: '' })) });
  }
  if (state?.version === 2) {
    validateVersion(state, 2);
    return migrateState({ ...clone(state), version: 3,
      studyEntries: state.studyEntries.map(entry => ({ ...entry, videoUrl: '' })) });
  }
  validateVersion(state, 1);
  return migrateState({ ...clone(state), version: 2, studyTopics: [], studyEntries: [] });
}

function normalizeNested(state, collection, record) {
  if (collection === 'plans' && Array.isArray(record.steps)) {
    record.steps = record.steps.map(step => plainObject(step)
      ? { id: uuid(), title: '', done: false, ...step } : step);
  }
  if (collection === 'sessions' && Array.isArray(record.entries)) {
    record.entries = record.entries.map(entry => {
      if (!plainObject(entry)) return entry;
      const exerciseName = state.exercises.find(exercise => exercise.id === entry.exerciseId)?.name ?? '';
      const normalized = { id: uuid(), exerciseId: null, name: exerciseName, sets: [], ...entry };
      if (Array.isArray(normalized.sets)) normalized.sets = normalized.sets.map(set => plainObject(set)
        ? { id: uuid(), reps: 0, weightKg: 0, ...set } : set);
      return normalized;
    });
  }
  return record;
}

export function upsert(state, collection, values, id) {
  validateState(state);
  const initial = defaults(collection);
  objectKeys(values, Object.keys(initial), '更新数据', { partial: true });
  const next = clone(state);
  const index = id === undefined ? -1 : next[collection].findIndex(record => record.id === id);
  requireThat(id === undefined || index >= 0, '要更新的记录不存在');
  const now = new Date().toISOString();
  const existing = index >= 0 ? next[collection][index] : null;
  const record = normalizeNested(next, collection, {
    ...initial, ...existing, ...clone(values),
    id: existing?.id ?? uuid(), createdAt: existing?.createdAt ?? now,
    updatedAt: existing && existing.updatedAt > now ? existing.updatedAt : now,
  });
  if (collection === 'plans' && values.link && LINK_TYPES[values.link.type]) {
    if (!Object.hasOwn(values, 'module')) record.module = LINK_TYPES[values.link.type].module;
    if (!Object.hasOwn(values, 'title') && (!existing || !existing.link)) record.title = titleForPlan(next, record);
  }
  if (collection === 'sessions' && !record.name && record.routineId) {
    record.name = next.routines.find(routine => routine.id === record.routineId)?.name ?? '';
  }
  if (index >= 0) next[collection][index] = record;
  else next[collection].push(record);
  return validateState(next);
}

export function titleForPlan(state, plan) {
  const type = plan.link && LINK_TYPES[plan.link.type];
  const source = type && state[type.collection].find(record => record.id === plan.link.id);
  return source ? source[type.title] : plan.title;
}

export function remove(state, collection, id) {
  validateState(state);
  defaults(collection);
  requireThat(state[collection].some(record => record.id === id), '要删除的记录不存在');
  const next = clone(state);
  const removed = new Map([[collection, new Set([id])]]);
  if (collection === 'projects') {
    for (const children of ['workItems', 'milestones', 'devLogs']) {
      removed.set(children, new Set(next[children].filter(record => record.projectId === id).map(record => record.id)));
    }
  }
  if (collection === 'games') removed.set('plays', new Set(next.plays.filter(record => record.gameId === id).map(record => record.id)));
  if (collection === 'studyTopics') removed.set('studyEntries', new Set(next.studyEntries.filter(record => record.topicId === id).map(record => record.id)));
  const now = new Date().toISOString();
  const touch = record => { record.updatedAt = record.updatedAt > now ? record.updatedAt : now; };
  for (const plan of next.plans) {
    const type = plan.link && LINK_TYPES[plan.link.type];
    if (type && removed.get(type.collection)?.has(plan.link.id)) {
      plan.title = titleForPlan(state, plan);
      plan.link = null;
      touch(plan);
    }
  }
  if (collection === 'routines') {
    for (const session of next.sessions) if (session.routineId === id) {
      session.routineId = null;
      touch(session);
    }
  }
  if (collection === 'exercises') {
    for (const routine of next.routines) if (routine.exerciseIds.includes(id)) {
      routine.exerciseIds = routine.exerciseIds.filter(exerciseId => exerciseId !== id);
      touch(routine);
    }
    for (const session of next.sessions) {
      let changed = false;
      for (const entry of session.entries) if (entry.exerciseId === id) {
        entry.exerciseId = null;
        changed = true;
      }
      if (changed) touch(session);
    }
  }
  for (const [key, ids] of removed) next[key] = next[key].filter(record => !ids.has(record.id));
  return validateState(next);
}

export function nutritionSummary(state, date) {
  dateValue(date);
  const records = state.foods.filter(record => record.date === date);
  const result = { calories: 0, protein: 0, carbs: 0, fat: 0, partial: false };
  for (const record of records) for (const nutrient of NUTRIENTS) {
    if (record[nutrient] === null) result.partial = true;
    else result[nutrient] += record[nutrient];
  }
  for (const nutrient of NUTRIENTS) result[nutrient] = Number(result[nutrient].toFixed(8));
  return result;
}

export function waterTotal(state, date) {
  dateValue(date);
  return Number(state.waters.filter(record => record.date === date).reduce((total, record) => total + record.amountMl, 0).toFixed(8));
}

export function toKg(value, unit) {
  numberValue(value, '重量');
  oneOf(unit, ['kg', 'lb'], '重量单位');
  return unit === 'kg' ? value : value * KG_PER_LB;
}
export function fromKg(value, unit) {
  numberValue(value, '重量');
  oneOf(unit, ['kg', 'lb'], '重量单位');
  return unit === 'kg' ? value : value / KG_PER_LB;
}
export function toMl(value, unit) {
  numberValue(value, '饮水量');
  oneOf(unit, ['ml', 'L'], '饮水单位');
  return unit === 'ml' ? value : value * 1000;
}
export function fromMl(value, unit) {
  numberValue(value, '饮水量');
  oneOf(unit, ['ml', 'L'], '饮水单位');
  return unit === 'ml' ? value : value / 1000;
}

export function setSettings(state, values) {
  validateState(state);
  objectKeys(values, Object.keys(SETTINGS), '设置', { partial: true });
  const next = clone(state);
  next.settings = { ...next.settings, ...values };
  return validateState(next);
}

export function makeBackup(state) {
  validateState(state);
  return { app: 'zhic-life', version: CURRENT_VERSION, exportedAt: new Date().toISOString(), data: clone(state) };
}

export function parseBackup(text) {
  requireThat(typeof text === 'string', '备份内容必须是 JSON 文本');
  let backup;
  try { backup = JSON.parse(text); } catch { fail('备份不是有效的 JSON 文件'); }
  objectKeys(backup, ['app', 'version', 'exportedAt', 'data'], '备份');
  requireThat(backup.app === 'zhic-life', '这不是本应用的备份');
  oneOf(backup.version, [1, 2, 3, CURRENT_VERSION], '备份版本');
  isoTimestamp(backup.exportedAt, '备份生成时间');
  requireThat(backup.data?.version === backup.version, '备份版本与数据版本不一致');
  return migrateState(backup.data);
}

export function previewBackup(state) {
  validateState(state);
  return Object.fromEntries(COLLECTIONS.map(collection => [collection, state[collection].length]));
}
