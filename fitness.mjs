import { upsert, remove, fromKg, toKg, localDate } from './domain.mjs';

let tab = 'routines';
let selectedRoutineId = null;
let selectedSessionId = null;
let selectedFitnessDate = localDate();
let fitnessCalendarOpen = false;
let exerciseSelectionMode = false;
let selectedExerciseIds = new Set();
const weekdays = { 0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六' };
const tabs = { routines: '每周训练安排', exercises: '动作库', history: '训练记录' };
const routineMatchesDate = (routine, date) => routine.date ? routine.date === date : routine.weekday === new Date(`${date}T12:00:00`).getDay();
export function openRoutine(id) { selectedRoutineId = id || null; selectedSessionId = null; tab = 'routines'; }
export function openSession(id) {
  selectedSessionId = id || null;
  tab = 'history';
}

function dateToolbar(ctx) {
  return `<div class="toolbar"><button type="button" data-action="fit-today">今天</button><label>健身日期 <input id="fitness-date" data-change="fitness-date" type="date" aria-label="健身日期" value="${ctx.esc(selectedFitnessDate)}"></label><span class="spacer"></span><span class="muted small">查看这一天的训练安排与实际记录</span></div>`;
}

function shiftMonth(date, delta) {
  const current = new Date(`${date}T12:00:00`);
  const day = current.getDate();
  current.setDate(1);
  current.setMonth(current.getMonth() + delta);
  current.setDate(Math.min(day, new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()));
  return localDate(current);
}

function fitnessCalendar(ctx, state) {
  const { esc, dateLabel } = ctx;
  const [year, month] = selectedFitnessDate.split('-').map(Number);
  const first = new Date(`${selectedFitnessDate.slice(0, 7)}-01T12:00:00`);
  const offset = (first.getDay() - state.settings.weekStartsOn + 7) % 7;
  const days = new Date(year, month, 0).getDate();
  const weekdayLabels = state.settings.weekStartsOn === 1 ? ['一', '二', '三', '四', '五', '六', '日'] : ['日', '一', '二', '三', '四', '五', '六'];
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<span class="calendar-empty" aria-hidden="true"></span>');
  for (let day = 1; day <= days; day++) {
    const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const routines = state.routines.filter(routine => routineMatchesDate(routine, value));
    const sessions = state.sessions.filter(session => session.date === value);
    const details = [
      ...routines.map(routine => {
        const names = (routine.exerciseIds || []).map(id => state.exercises.find(exercise => exercise.id === id)?.name).filter(Boolean);
        return `安排：${routine.name}${names.length ? ` · ${names.join('、')}` : ''}`;
      }),
      ...sessions.map(session => {
        const entries = (session.entries || []).map(entry => `${entry.name} ${entry.sets.length}组`).join('、');
        return `记录：${session.name}${entries ? ` · ${entries}` : ''}`;
      })
    ];
    const detailText = details.length ? details.join('；') : '暂无训练安排或记录';
    const classes = ['calendar-day', value === localDate() ? 'today' : '', value === selectedFitnessDate ? 'selected' : '', details.length ? 'has-records' : ''].filter(Boolean).join(' ');
    cells.push(`<button type="button" class="${classes}" data-action="fit-date" data-date="${value}" aria-label="${esc(`${dateLabel(value)}：${detailText}`)}" ${value === selectedFitnessDate ? 'aria-current="date"' : ''}><strong>${day}</strong><small class="calendar-detail" data-calendar-detail>${esc(detailText)}</small></button>`);
  }
  const rows = Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => `<div class="calendar-week-row" data-calendar-row="${row}">${cells.slice(row * 7, row * 7 + 7).join('')}</div>`).join('');
  return `<section class="panel calendar-panel fitness-calendar-row" data-calendar="fitness" data-layout="full-row"><div class="section-head"><h2>训练日历</h2><button type="button" class="small" data-action="fit-calendar-toggle" aria-expanded="${fitnessCalendarOpen}">${fitnessCalendarOpen ? '收起日历' : '展开日历'}</button></div>${fitnessCalendarOpen ? `<div class="section-head"><h3>${year}年${month}月</h3><div class="actions"><button type="button" class="small" data-action="fit-month-prev" aria-label="上个月">‹</button><button type="button" class="small" data-action="fit-month-next" aria-label="下个月">›</button></div></div><div class="calendar-weekdays">${weekdayLabels.map(label => `<span>${label}</span>`).join('')}</div><div class="calendar-grid">${rows}</div><p class="muted small">${dateLabel(selectedFitnessDate)} 已选中；带标记的日期有安排或实际训练。</p>` : `<p class="muted small">日历已隐藏。点击“展开日历”查看训练安排和记录。</p>`}</section>`;
}

function exerciseDetails(ctx, exercise) {
  ctx.formDialog(`动作详情 · ${exercise.name}`, `<p class="full note-body">${ctx.esc(exercise.notes || '暂无动作说明。')}</p>${exercise.videoUrl ? `<p class="full"><a class="button video-link" href="${ctx.esc(exercise.videoUrl)}" target="_blank" rel="noopener noreferrer">观看教学视频</a></p>` : '<p class="full muted">尚未添加教学视频链接。</p>'}`, () => true, '', '关闭');
}

function exerciseGroupName(ctx, groupId) {
  return ctx.state.exerciseGroups.find(group => group.id === groupId)?.name || '未分组';
}

function exerciseGroupPanel(ctx) {
  const groups = ctx.state.exerciseGroups;
  return `<section class="panel exercise-groups-panel"><div class="section-head"><div><h2>动作组</h2><p class="muted">把动作拖到动作组中，训练安排时更容易找到。</p></div><button type="button" class="small primary" data-action="fit-exercise-group">新增动作组</button></div>${groups.length ? `<div class="exercise-group-list">${groups.map(group => `<div class="exercise-group-drop" data-exercise-group-id="${ctx.esc(group.id)}" data-group-drop="true"><div class="section-head"><strong>${ctx.esc(group.name)}</strong><span class="muted small">${ctx.state.exercises.filter(exercise => exercise.groupId === group.id).length} 个动作</span><div class="actions"><button type="button" class="small ghost" data-action="fit-exercise-group" data-id="${ctx.esc(group.id)}" aria-label="编辑动作组">编辑</button><button type="button" class="small ghost" data-action="fit-delete-exercise-group" data-id="${ctx.esc(group.id)}" aria-label="删除动作组">删除</button></div></div></div>`).join('')}</div>` : '<p class="muted">还没有动作组。新增动作组后可拖放动作归类。</p>'}</section>`;
}

function exerciseSelectionToolbar(ctx) {
  if (!exerciseSelectionMode) return `<div class="toolbar exercise-selection-entry"><span class="spacer"></span>${ctx.button('选择动作', 'fit-bulk-toggle', '', 'ghost small')}</div>`;
  const count = selectedExerciseIds.size;
  return `<div class="toolbar exercise-selection-toolbar" role="toolbar" aria-label="批量动作操作"><span class="muted small">已选择 ${count} 个动作</span><span class="spacer"></span>${ctx.button('加入今日训练', 'fit-bulk-add-today', count ? '' : 'disabled', 'small')}${ctx.button('批量删除', 'fit-bulk-delete', count ? '' : 'disabled', 'danger small')}${ctx.button('完成选择', 'fit-bulk-toggle', '', 'ghost small')}</div>`;
}

function daySummary(ctx, date, routines, sessions) {
  const { esc, dateLabel } = ctx;
  const weekday = weekdays[new Date(`${date}T12:00:00`).getDay()];
  const routineText = routines.length ? routines.map(routine => {
    const names = (routine.exerciseIds || []).map(id => ctx.state.exercises.find(exercise => exercise.id === id)?.name).filter(Boolean);
    return `${esc(routine.name)}${names.length ? `（${names.map(name => esc(name)).join('、')}）` : ''}`;
  }).join(' · ') : '没有安排训练';
  const sessionText = sessions.length ? sessions.map(session => `${esc(session.name)}（${session.status === 'done' ? '已完成' : '进行中'}，${session.entries.reduce((count, entry) => count + entry.sets.length, 0)} 组：${session.entries.map(entry => `${esc(entry.name)} ${entry.sets.length} 组`).join('、')}）`).join(' · ') : '没有实际训练记录';
  return `<section class="panel" data-fitness-day="${esc(date)}"><div class="section-head"><div><h2>${esc(dateLabel(date))} · 当天训练</h2><p class="muted">${weekday} · 训练安排与实际记录分开保存</p></div><span class="badge ${date === localDate() ? 'teal' : ''}">${date === localDate() ? '今天' : '历史日期'}</span></div><div class="metric-grid"><div class="metric"><small>训练安排</small><p>${routineText}</p></div><div class="metric"><small>实际训练</small><p>${sessionText}</p></div><div class="metric"><small>训练次数</small><strong>${sessions.length}</strong></div></div></section>`;
}

function exerciseChoices(ctx, chosen = [], available = ctx.state.exercises) {
  return `<div class="field full"><span>选择训练动作</span>${available.length
    ? `<div class="stack">${available.map(exercise => `<label class="actions"><input type="checkbox" name="exerciseIds" value="${ctx.esc(exercise.id)}" ${chosen.includes(exercise.id) ? 'checked' : ''}>${ctx.esc(exercise.name)}</label>`).join('')}</div>`
    : '<p class="muted">动作库为空，请先在动作库新增动作。</p>'}</div>`;
}

function routineExerciseChoices(ctx, routine, preferredGroupId = '') {
  const chosen = routine?.exerciseIds || [];
  const targets = new Map((routine?.exerciseTargets || []).map(target => [target.exerciseId, target]));
  const unit = ctx.state.settings.weightUnit;
  const exercises = [...ctx.state.exercises].sort((a, b) => {
    const aPriority = preferredGroupId && a.groupId === preferredGroupId ? 0 : 1;
    const bPriority = preferredGroupId && b.groupId === preferredGroupId ? 0 : 1;
    return aPriority - bPriority;
  });
  return `<div class="field full"><span>选择训练动作与计划目标</span>${ctx.state.exercises.length
    ? `<input class="routine-exercise-search" type="search" aria-label="搜索训练动作" placeholder="搜索动作名称"> <div class="routine-exercise-list">${exercises.map(exercise => {
      const target = targets.get(exercise.id);
      const field = (kind, label, value, extra = '') => `<label>${label}<input aria-label="${ctx.esc(`${label}：${exercise.name}`)}" name="target-${kind}-${ctx.esc(exercise.id)}" type="number" value="${ctx.esc(value)}" ${extra}></label>`;
      return `<div class="routine-exercise" data-routine-exercise="${ctx.esc(exercise.id)}"><label class="actions"><input type="checkbox" name="exerciseIds" value="${ctx.esc(exercise.id)}" ${chosen.includes(exercise.id) ? 'checked' : ''}>${ctx.esc(exercise.name)}</label><div class="exercise-targets">${field('sets', '计划组数', target?.sets ?? 3, 'min="1" step="1" required')}${field('reps', '计划次数', target?.reps ?? 8, 'min="1" step="1" required')}${field('weight', `计划重量（${unit}）`, target ? Number(fromKg(target.weightKg, unit).toFixed(8)) : 0, 'min="0" step="any" required')}</div></div>`;
    }).join('')}</div>`
    : '<p class="muted">动作库为空，请先在动作库新增动作。</p>'}</div>`;
}

export function renderFitness(ctx) {
  const { state, esc, button, empty, fmt, dateLabel } = ctx;
  const attr = id => `data-id="${esc(id)}"`;
  const session = state.sessions.find(record => record.id === selectedSessionId);
  if (session) return renderSession(ctx, session);
  selectedSessionId = null;
  const toolbar = `<div class="tabs" role="tablist" aria-label="健身分区">${Object.entries(tabs).map(([key, label]) => button(label, 'fit-tab', `data-tab="${key}" role="tab" aria-selected="${tab === key}"`, tab === key ? 'active' : '')).join('')}</div>`;
  if (tab === 'exercises') {
    return toolbar + dateToolbar(ctx) + exerciseGroupPanel(ctx) + `<div class="toolbar"><p class="muted">保存常练动作，训练时记录实际组数与重量。拖动动作条可归类。</p><span class="spacer"></span>${button('新增动作', 'fit-exercise', '', 'primary')}</div>${exerciseSelectionToolbar(ctx)}<section class="panel"><div class="section-head"><h2>我的动作库</h2><span class="muted small">${state.exercises.length} 个动作</span></div>${state.exercises.length
      ? `<div class="list">${state.exercises.map(exercise => `<article class="row exercise-row ${selectedExerciseIds.has(exercise.id) ? 'exercise-selected' : ''}" draggable="true" data-exercise-id="${esc(exercise.id)}">${exerciseSelectionMode ? `<label class="exercise-select-control"><input type="checkbox" data-change="fit-exercise-select" data-id="${esc(exercise.id)}" aria-label="选择动作：${esc(exercise.name)}" ${selectedExerciseIds.has(exercise.id) ? 'checked' : ''}></label>` : ''}<div class="row-main"><button type="button" class="link-button row-title" data-action="fit-exercise-details" ${attr(exercise.id)}>${esc(exercise.name)}</button>${exercise.notes ? `<p class="log-body muted">${esc(exercise.notes)}</p>` : ''}<div class="row-meta"><span class="badge">${esc(exerciseGroupName(ctx, exercise.groupId))}</span>${exercise.videoUrl ? '<span class="badge teal">有教学视频</span>' : '<span class="muted">未添加教学视频</span>'}</div></div><div class="exercise-actions" aria-label="动作操作">${exercise.videoUrl ? `<a class="button small video-link" href="${esc(exercise.videoUrl)}" target="_blank" rel="noopener noreferrer">教学视频</a>` : ''}<div class="exercise-swipe-actions"><button type="button" class="exercise-add-action" title="加入今日训练" data-action="fit-add-to-today" ${attr(exercise.id)} aria-label="加入今日训练">＋</button><button type="button" class="exercise-edit-action" title="编辑动作" data-action="fit-exercise" ${attr(exercise.id)} aria-label="编辑动作">✎</button><button type="button" class="exercise-delete-action" title="删除动作" data-action="fit-delete-exercise" ${attr(exercise.id)} aria-label="删除动作">⌫</button></div></div></article>`).join('')}</div>`
      : empty('先添加一个常练动作，例如深蹲或俯卧撑。', '新增动作', 'fit-exercise')}</section>`;
  }
  if (tab === 'history') {
    const sessions = [...state.sessions].filter(record => record.date === selectedFitnessDate).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return toolbar + dateToolbar(ctx) + `<div class="toolbar"><p class="muted">每一组实际训练，都留下自己的记录。</p><span class="spacer"></span>${button('开始训练', 'fit-start', '', 'primary')}</div><section class="panel"><div class="section-head"><h2>${esc(dateLabel(selectedFitnessDate))} 的训练记录</h2><span class="muted small">${sessions.length} 次训练</span></div>${sessions.length
      ? `<div class="list">${sessions.map(record => {
        const sets = record.entries.reduce((count, entry) => count + entry.sets.length, 0);
        return `<article class="row" data-session-id="${esc(record.id)}"><div class="row-main"><strong class="row-title">${esc(record.name)}</strong><div class="row-meta"><span>${esc(dateLabel(record.date))}</span><span class="badge ${record.status === 'done' ? 'teal' : 'orange'}">${record.status === 'done' ? '已完成' : '进行中'}</span><span>${record.entries.length} 个动作 · ${sets} 组</span></div><p class="muted small">${esc(record.entries.map(entry => entry.name).join(' · '))}</p></div><div class="actions">${button(record.status === 'done' ? '查看训练' : '继续训练', 'fit-open-session', attr(record.id), 'small')}${button('编辑训练', 'fit-session', attr(record.id), 'ghost small')}${button('删除训练', 'fit-delete-session', attr(record.id), 'ghost small')}</div></article>`;
      }).join('')}</div>`
      : empty('尚无实际训练记录。开始一次训练，再逐组记录。', '开始训练', 'fit-start')}</section>`;
  }
  const today = new Date(`${localDate()}T12:00:00`).getDay();
  const days = Array.from({ length: 7 }, (_, i) => (state.settings.weekStartsOn + i) % 7);
  const dayRoutines = state.routines.filter(routine => routineMatchesDate(routine, selectedFitnessDate));
  const daySessions = state.sessions.filter(session => session.date === selectedFitnessDate);
  return toolbar + dateToolbar(ctx) + fitnessCalendar(ctx, state) + daySummary(ctx, selectedFitnessDate, dayRoutines, daySessions) + `<div class="toolbar"><p class="muted">每周安排用于规划，实际训练单独记录。</p><span class="spacer"></span>${button('开始训练', 'fit-start')}${button('新增训练安排', 'fit-routine', '', 'primary')}</div>
    <section class="panel"><div class="section-head"><h2>我的一周</h2><span class="muted small">按星期安排训练；指定日期的安排显示在对应日期</span></div><div class="week-grid">${days.map(day => `<div class="day-card ${day === today ? 'today' : ''}"><h3>${weekdays[day]}</h3>${state.routines.filter(routine => !routine.date && routine.weekday === day).map(routine => `<p>${esc(routine.name)}</p>`).join('') || '<span class="muted">休息 / 未安排</span>'}</div>`).join('')}</div></section>
    <section class="panel"><div class="section-head"><h2>训练安排</h2><span class="muted small">${state.routines.length} 项安排</span></div>${state.routines.length
      ? `<div class="list">${state.routines.map(routine => {
        const names = routine.exerciseIds.map(id => state.exercises.find(exercise => exercise.id === id)?.name).filter(Boolean);
        const targets = new Map((routine.exerciseTargets || []).map(target => [target.exerciseId, target]));
        const targetText = routine.exerciseIds.map(id => {
          const exercise = state.exercises.find(record => record.id === id);
          const target = targets.get(id);
          return exercise && target ? `${exercise.name} · ${target.sets} 组 × ${target.reps} 次 · ${fmt(fromKg(target.weightKg, state.settings.weightUnit))} ${state.settings.weightUnit}` : exercise?.name;
        }).filter(Boolean);
        const plans = state.plans.filter(plan => plan.link?.type === 'routine' && plan.link.id === routine.id);
        const schedule = routine.date ? `指定日期 ${dateLabel(routine.date)}` : weekdays[routine.weekday];
        return `<article class="row" data-routine-id="${esc(routine.id)}" ${routine.id === selectedRoutineId ? 'data-selected-routine="true"' : ''}><div class="row-main"><strong class="row-title">${esc(routine.name)}</strong><div class="row-meta"><span class="badge">${esc(schedule)}</span><span>${names.length} 个动作</span>${plans.map(plan => `<span>计划 ${esc(dateLabel(plan.date))} · ${plan.status === 'done' ? '已完成' : '待完成'}</span>`).join('')}</div><p class="muted small">${esc(targetText.join(' · ') || '尚未选择动作')}</p></div><div class="actions">${button('开始这次训练', 'fit-start', `data-routine-id="${esc(routine.id)}"`, 'small')}${button('安排到计划', 'fit-plan', attr(routine.id), 'small')}${button('编辑安排', 'fit-routine', attr(routine.id), 'ghost small')}${button('删除安排', 'fit-delete-routine', attr(routine.id), 'ghost small')}</div></article>`;
      }).join('')}</div>`
      : empty('按自己的节奏，为一周安排训练。', '新增训练安排', 'fit-routine')}</section>`;
}

function renderSession(ctx, session) {
  const { state, esc, button, empty, dateLabel, fmt } = ctx;
  const unit = state.settings.weightUnit;
  const attr = `data-session-id="${esc(session.id)}"`;
  const setCount = session.entries.reduce((count, entry) => count + entry.sets.length, 0);
  return `<div class="toolbar">${button('← 返回训练记录', 'fit-back', '', 'ghost')}<span class="spacer"></span>${button('编辑训练', 'fit-session', `data-id="${esc(session.id)}"`)}${button('删除训练', 'fit-delete-session', `data-id="${esc(session.id)}"`, 'ghost')}</div>
    <section class="panel" data-session-detail="${esc(session.id)}"><div class="section-head"><h2>${esc(session.name)}</h2><span class="badge ${session.status === 'done' ? 'teal' : 'orange'}">${session.status === 'done' ? '已完成' : '进行中'}</span></div><div class="row-meta"><span>${esc(dateLabel(session.date))}</span><span>${setCount} 组实际训练</span><span>重量单位 ${unit}</span></div><p class="muted small">每次保存一组后，都会保存在本机。可以稍后从训练记录继续。</p></section>
    ${session.entries.map(entry => {
      const entryAttr = `${attr} data-entry-id="${esc(entry.id)}"`;
      const target = state.routines.find(routine => routine.id === session.routineId)?.exerciseTargets?.find(item => item.exerciseId === entry.exerciseId);
      const targetText = target ? `<p class="muted small">计划：${target.sets} 组 × ${target.reps} 次 · ${fmt(fromKg(target.weightKg, unit))} ${unit}</p>` : '';
      return `<section class="panel" data-entry-id="${esc(entry.id)}"><div class="section-head"><h2>${esc(entry.name)}</h2><div class="actions">${button('新增一组', 'fit-set', entryAttr, 'small')}${button('移除训练动作', 'fit-delete-entry', entryAttr, 'ghost small')}</div></div>${entry.sets.length
        ? `<div class="table-wrap"><table><thead><tr><th>组次</th><th>次数</th><th>重量（${unit}）</th><th>操作</th></tr></thead><tbody>${entry.sets.map((set, index) => `<tr data-set-id="${esc(set.id)}"><td>第 ${index + 1} 组</td><td data-testid="set-reps">${set.reps} 次</td><td data-testid="set-weight">${fmt(fromKg(set.weightKg, unit))} ${unit}</td><td><div class="actions">${button('编辑组', 'fit-set', `${entryAttr} data-set-id="${esc(set.id)}"`, 'ghost small')}${button('删除组', 'fit-delete-set', `${entryAttr} data-set-id="${esc(set.id)}"`, 'ghost small')}</div></td></tr>`).join('')}</tbody></table></div>`
        : empty('还没有记录组数。填写实际完成的次数与重量。', '新增一组', 'fit-set', entryAttr)}${targetText}</section>`;
    }).join('')}
    <section class="panel"><div class="toolbar">${button('添加训练动作', 'fit-add-entry', attr)}<span class="spacer"></span>${session.status === 'active'
      ? button('结束训练', 'fit-finish', `${attr}${setCount ? '' : ' disabled'}`, 'primary')
      : button('继续记录', 'fit-reopen', attr)}</div><p class="muted small">${setCount ? '已保存的组数可以继续编辑，训练历史保留当时的动作名称。' : '至少保存一组实际训练后，才可以结束训练。'}</p></section>`;
}

export async function handleFitness(ctx, action, target) {
  const { id, routineId, sessionId, entryId, setId } = target.dataset;
  if (action === 'fit-today') { selectedFitnessDate = localDate(); selectedSessionId = null; ctx.render(); return true; }
  if (action === 'fit-calendar-toggle') { fitnessCalendarOpen = !fitnessCalendarOpen; ctx.render(); return true; }
  if (action === 'fit-date') { selectedFitnessDate = target.dataset.date || target.value || localDate(); selectedSessionId = null; ctx.render(); return true; }
  if (action === 'fit-month-prev' || action === 'fit-month-next') { selectedFitnessDate = shiftMonth(selectedFitnessDate, action === 'fit-month-prev' ? -1 : 1); selectedSessionId = null; ctx.render(); return true; }
  if (action === 'fit-tab') { tab = target.dataset.tab; selectedSessionId = null; ctx.render(); return true; }
  if (action === 'fit-bulk-toggle') {
    exerciseSelectionMode = !exerciseSelectionMode;
    if (!exerciseSelectionMode) selectedExerciseIds = new Set();
    ctx.render();
    return true;
  }
  if (action === 'fit-bulk-delete') {
    const ids = [...selectedExerciseIds];
    if (!ids.length) return true;
    ctx.formDialog('批量删除动作', `<p class="full">将从动作库删除 ${ids.length} 个动作，并从训练安排中移除。训练历史会保留动作名称和数据。</p>`, async () => {
      const saved = await ctx.commit(state => ids.reduce((next, exerciseId) => remove(next, 'exercises', exerciseId), state), '已删除所选动作');
      if (saved) { exerciseSelectionMode = false; selectedExerciseIds = new Set(); ctx.render(); }
      return saved;
    }, '', '确认删除');
    return true;
  }
  if (action === 'fit-bulk-add-today') {
    const ids = [...selectedExerciseIds];
    if (!ids.length) return true;
    const date = localDate();
    const names = ids.map(exerciseId => ctx.state.exercises.find(exercise => exercise.id === exerciseId)?.name).filter(Boolean);
    const saved = await ctx.commit(state => upsert(state, 'routines', {
      name: `今日训练 · ${names.join('、')}`, date, weekday: new Date(`${date}T12:00:00`).getDay(), exerciseIds: ids,
      exerciseTargets: ids.map(exerciseId => ({ exerciseId, sets: 3, reps: 8, weightKg: 0 })),
    }), '已加入今日训练');
    if (saved) { exerciseSelectionMode = false; selectedExerciseIds = new Set(); ctx.render(); }
    return true;
  }
  if (action === 'fit-add-to-today') {
    const exercise = ctx.state.exercises.find(record => record.id === id);
    if (!exercise) return true;
    const date = localDate();
    const existing = ctx.state.routines.find(routine => routine.date === date && routine.exerciseIds.includes(id));
    if (existing) { ctx.toast('该动作已在今日训练中'); return true; }
    await ctx.commit(state => {
      const sameDay = state.routines.find(routine => routine.date === date);
      if (sameDay) return upsert(state, 'routines', {
        exerciseIds: [...sameDay.exerciseIds, id],
        exerciseTargets: [...sameDay.exerciseTargets, { exerciseId: id, sets: 3, reps: 8, weightKg: 0 }],
      }, sameDay.id);
      return upsert(state, 'routines', { name: `今日训练 · ${exercise.name}`, date, weekday: new Date(`${date}T12:00:00`).getDay(), exerciseIds: [id], exerciseTargets: [{ exerciseId: id, sets: 3, reps: 8, weightKg: 0 }] });
    }, '已加入今日训练');
    return true;
  }
  if (action === 'fit-exercise-select') {
    const next = new Set(selectedExerciseIds);
    if (target.checked) next.add(id); else next.delete(id);
    selectedExerciseIds = next;
    ctx.render();
    return true;
  }
  if (action === 'fit-back') { openSession(null); ctx.render(); return true; }
  if (action === 'fit-open-session') { selectedFitnessDate = ctx.state.sessions.find(record => record.id === id)?.date || selectedFitnessDate; openSession(id); ctx.render(); return true; }
  if (action === 'fit-exercise' || action === 'exercise') {
    const exercise = ctx.state.exercises.find(record => record.id === id);
    ctx.formDialog(exercise ? '编辑动作' : '新增动作',
      ctx.field('动作名称', 'name', exercise?.name, 'text', 'required maxlength="300"')
      + ctx.field('动作说明（可选）', 'notes', exercise?.notes, 'textarea', 'maxlength="10000"')
      + ctx.field('教学视频链接（可选）', 'videoUrl', exercise?.videoUrl, 'url', 'maxlength="2000" placeholder="https://…"')
      + ctx.selectField('动作组（可选）', 'groupId', { '': '未分组', ...Object.fromEntries(ctx.state.exerciseGroups.map(group => [group.id, group.name])) }, exercise?.groupId || ''),
      data => ctx.commit(state => upsert(state, 'exercises', { name: data.get('name').trim(), notes: data.get('notes').trim(), videoUrl: data.get('videoUrl').trim(), groupId: data.get('groupId') || null }, id), '动作已保存'),
      '动作库名称变更不会改写已经保存的训练历史。');
    return true;
  }
  if (action === 'fit-exercise-group') {
    const group = ctx.state.exerciseGroups.find(record => record.id === id);
    ctx.formDialog(group ? '编辑动作组' : '新增动作组', ctx.field('动作组名称', 'name', group?.name, 'text', 'required maxlength="100"'),
      data => ctx.commit(state => upsert(state, 'exerciseGroups', { name: data.get('name').trim() }, id), '动作组已保存'));
    return true;
  }
  if (action === 'fit-assign-exercise-group') {
    const groupId = target.dataset.groupId || null;
    await ctx.commit(state => upsert(state, 'exercises', { groupId }, id), '动作组已更新');
    return true;
  }
  if (action === 'fit-exercise-details') {
    const exercise = ctx.state.exercises.find(record => record.id === id);
    if (exercise) exerciseDetails(ctx, exercise);
    return true;
  }
  if (action === 'fit-routine' || action === 'routine') {
    const routine = ctx.state.routines.find(record => record.id === id);
    ctx.formDialog(routine ? '编辑训练安排' : '新增训练安排',
      ctx.field('安排名称', 'name', routine?.name, 'text', 'required maxlength="300"')
      + ctx.field('具体训练日期（可选）', 'date', routine?.date || '', 'date')
      + ctx.selectField('训练星期', 'weekday', weekdays, String(routine?.weekday ?? new Date().getDay()))
      + ctx.selectField('优先动作组（可选）', 'groupId', { '': '不指定', ...Object.fromEntries(ctx.state.exerciseGroups.map(group => [group.id, group.name])) }, routine?.groupId || '')
      + routineExerciseChoices(ctx, routine, routine?.groupId || ''),
      data => ctx.commit(state => upsert(state, 'routines', {
        name: data.get('name').trim(), date: data.get('date'), weekday: Number(data.get('weekday')), groupId: data.get('groupId') || null, exerciseIds: data.getAll('exerciseIds'),
        exerciseTargets: data.getAll('exerciseIds').map(exerciseId => ({
          exerciseId,
          sets: Number(data.get(`target-sets-${exerciseId}`)),
          reps: Number(data.get(`target-reps-${exerciseId}`)),
          weightKg: toKg(Number(data.get(`target-weight-${exerciseId}`)), state.settings.weightUnit),
        })),
      }, id), '训练安排已保存'), '每周安排用于规划，不自动生成训练记录。');
    return true;
  }
  if (action === 'fit-plan') { ctx.planDialog(undefined, { type: 'routine', id }); return true; }
  if (action === 'fit-start') {
    if (!ctx.state.exercises.length) { tab = 'exercises'; selectedSessionId = null; ctx.render(); return true; }
    const routine = ctx.state.routines.find(record => record.id === routineId);
    ctx.formDialog('开始训练',
      ctx.field('训练名称', 'name', routine?.name || '我的训练', 'text', 'required maxlength="300"')
      + ctx.field('训练日期', 'date', selectedFitnessDate, 'date', 'required')
      + exerciseChoices(ctx, routine?.exerciseIds || []),
      async data => {
        const ids = data.getAll('exerciseIds');
        if (!ids.length) throw new Error('请选择至少一个训练动作。');
        const saved = await ctx.commit(state => upsert(state, 'sessions', {
          routineId: routine?.id || null, name: data.get('name').trim(), date: data.get('date'), status: 'active',
          entries: ids.map(exerciseId => ({ exerciseId, name: state.exercises.find(exercise => exercise.id === exerciseId).name, sets: [] })),
        }), '训练已开始，逐组记录实际数据');
        if (saved) { selectedFitnessDate = data.get('date'); openSession(ctx.state.sessions.at(-1).id); ctx.render(); }
        return saved;
      }, '开始后先保存本次训练。组数、次数与重量由你逐项记录。', '开始训练');
    return true;
  }
  if (action === 'fit-session') {
    const session = ctx.state.sessions.find(record => record.id === id);
    ctx.formDialog('编辑训练', ctx.field('训练名称', 'name', session.name, 'text', 'required maxlength="300"')
      + ctx.field('训练日期', 'date', session.date, 'date', 'required'),
      async data => {
        const saved = await ctx.commit(state => upsert(state, 'sessions', { name: data.get('name').trim(), date: data.get('date') }, id), '训练信息已保存');
        if (saved) { selectedFitnessDate = data.get('date'); ctx.render(); }
        return saved;
      });
    return true;
  }
  if (action === 'fit-set') {
    const session = ctx.state.sessions.find(record => record.id === sessionId);
    const entry = session.entries.find(record => record.id === entryId);
    const set = entry.sets.find(record => record.id === setId);
    const unit = ctx.state.settings.weightUnit;
    ctx.formDialog(set ? '编辑训练组' : '新增训练组',
      ctx.field('实际次数', 'reps', set?.reps ?? 8, 'number', 'required min="1" step="1"')
      + ctx.field(`实际重量（${unit}）`, 'weight', set ? Number(fromKg(set.weightKg, unit).toFixed(8)) : 0, 'number', 'required min="0" step="any"'),
      data => ctx.commit(state => {
        const current = state.sessions.find(record => record.id === sessionId);
        const currentEntry=current?.entries.find(record=>record.id===entryId);
        if(!currentEntry || (setId && !currentEntry.sets.some(record=>record.id===setId)))throw new Error('这组训练数据已在其他窗口删除，请取消编辑并查看最新记录。');
        const values = { id: setId || crypto.randomUUID(), reps: Number(data.get('reps')), weightKg: toKg(Number(data.get('weight')), unit) };
        const entries = current.entries.map(record => record.id !== entryId ? record : {
          ...record, sets: setId ? record.sets.map(saved => saved.id === setId ? values : saved) : [...record.sets, values],
        });
        return upsert(state, 'sessions', { entries }, sessionId);
      }, '训练组已保存'), `${entry.name} · 填写你实际完成的数据。自重动作的重量可以填 0。`);
    return true;
  }
  if (action === 'fit-add-entry') {
    const session = ctx.state.sessions.find(record => record.id === sessionId);
    const available = ctx.state.exercises.filter(exercise => !session.entries.some(entry => entry.exerciseId === exercise.id));
    if (!available.length) {
      ctx.formDialog('添加训练动作', `<p class="full muted">${ctx.state.exercises.length ? '动作库中的动作已全部加入本次训练。可以新增其他动作，再返回添加。' : '动作库为空。请先新增动作，再返回添加到本次训练。'}</p><div class="full">${ctx.button('新增动作', 'fit-exercise')}</div>`, () => true, '', '知道了');
      return true;
    }
    ctx.formDialog('添加训练动作', exerciseChoices(ctx, [], available), data => {
      const ids = data.getAll('exerciseIds');
      if (!ids.length) throw new Error('请选择至少一个动作。');
      return ctx.commit(state => {
        const current = state.sessions.find(record => record.id === sessionId);
        return upsert(state, 'sessions', { entries: [...current.entries, ...ids.map(exerciseId => ({
          id: crypto.randomUUID(), exerciseId, name: state.exercises.find(exercise => exercise.id === exerciseId).name, sets: [],
        }))] }, sessionId);
      }, '训练动作已添加');
    });
    return true;
  }
  if (action === 'fit-delete-set' || action === 'fit-delete-entry') {
    ctx.formDialog(action === 'fit-delete-set' ? '删除训练组' : '移除训练动作', '<p class="full">这项实际训练数据将被删除。删除最后一组后，本次训练会回到进行中状态。</p>',
      () => ctx.commit(state => {
        const current = state.sessions.find(record => record.id === sessionId);
        const entries = action === 'fit-delete-entry'
          ? current.entries.filter(entry => entry.id !== entryId)
          : current.entries.map(entry => entry.id === entryId ? { ...entry, sets: entry.sets.filter(set => set.id !== setId) } : entry);
        const hasSets = entries.some(entry => entry.sets.length);
        return upsert(state, 'sessions', { entries, status: hasSets ? current.status : 'active' }, sessionId);
      }, '训练数据已删除'), '', action === 'fit-delete-set' ? '确认删除' : '确认移除');
    return true;
  }
  if (action === 'fit-finish' || action === 'fit-reopen') {
    await ctx.commit(state => upsert(state, 'sessions', { status: action === 'fit-finish' ? 'done' : 'active' }, sessionId),
      action === 'fit-finish' ? '本次训练已完成' : '可以继续记录训练');
    return true;
  }
  const deleteCollections = { 'fit-delete-exercise': 'exercises', 'fit-delete-routine': 'routines', 'fit-delete-session': 'sessions', 'fit-delete-exercise-group': 'exerciseGroups' };
  if (deleteCollections[action]) { ctx.deleteDialog(deleteCollections[action], id); return true; }
  return false;
}
