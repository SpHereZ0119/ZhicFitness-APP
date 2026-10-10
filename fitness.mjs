import { upsert, fromKg, toKg, localDate } from './domain.mjs';

let tab = 'routines';
let selectedRoutineId = null;
let selectedSessionId = null;
const weekdays = { 0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六' };
const tabs = { routines: '每周训练安排', exercises: '动作库', history: '训练记录' };
export function openRoutine(id) { selectedRoutineId = id || null; selectedSessionId = null; tab = 'routines'; }
export function openSession(id) { selectedSessionId = id || null; tab = 'history'; }

function exerciseChoices(ctx, chosen = [], available = ctx.state.exercises) {
  return `<div class="field full"><span>选择训练动作</span>${available.length
    ? `<div class="stack">${available.map(exercise => `<label class="actions"><input type="checkbox" name="exerciseIds" value="${ctx.esc(exercise.id)}" ${chosen.includes(exercise.id) ? 'checked' : ''}>${ctx.esc(exercise.name)}</label>`).join('')}</div>`
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
    return toolbar + `<div class="toolbar"><p class="muted">保存常练动作，训练时记录实际组数与重量。</p><span class="spacer"></span>${button('新增动作', 'fit-exercise', '', 'primary')}</div><section class="panel"><div class="section-head"><h2>我的动作库</h2><span class="muted small">${state.exercises.length} 个动作</span></div>${state.exercises.length
      ? `<div class="list">${state.exercises.map(exercise => `<article class="row" data-exercise-id="${esc(exercise.id)}"><div class="row-main"><strong class="row-title">${esc(exercise.name)}</strong>${exercise.notes ? `<p class="log-body muted">${esc(exercise.notes)}</p>` : ''}</div><div class="actions">${button('编辑动作', 'fit-exercise', attr(exercise.id), 'small')}${button('删除动作', 'fit-delete-exercise', attr(exercise.id), 'ghost small')}</div></article>`).join('')}</div>`
      : empty('先添加一个常练动作，例如深蹲或俯卧撑。', '新增动作', 'fit-exercise')}</section>`;
  }
  if (tab === 'history') {
    const sessions = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
    return toolbar + `<div class="toolbar"><p class="muted">每一组实际训练，都留下自己的记录。</p><span class="spacer"></span>${button('开始训练', 'fit-start', '', 'primary')}</div><section class="panel"><div class="section-head"><h2>训练历史与进行中的训练</h2><span class="muted small">${sessions.length} 次训练</span></div>${sessions.length
      ? `<div class="list">${sessions.map(record => {
        const sets = record.entries.reduce((count, entry) => count + entry.sets.length, 0);
        return `<article class="row" data-session-id="${esc(record.id)}"><div class="row-main"><strong class="row-title">${esc(record.name)}</strong><div class="row-meta"><span>${esc(dateLabel(record.date))}</span><span class="badge ${record.status === 'done' ? 'teal' : 'orange'}">${record.status === 'done' ? '已完成' : '进行中'}</span><span>${record.entries.length} 个动作 · ${sets} 组</span></div><p class="muted small">${esc(record.entries.map(entry => entry.name).join(' · '))}</p></div><div class="actions">${button(record.status === 'done' ? '查看训练' : '继续训练', 'fit-open-session', attr(record.id), 'small')}${button('编辑训练', 'fit-session', attr(record.id), 'ghost small')}${button('删除训练', 'fit-delete-session', attr(record.id), 'ghost small')}</div></article>`;
      }).join('')}</div>`
      : empty('尚无实际训练记录。开始一次训练，再逐组记录。', '开始训练', 'fit-start')}</section>`;
  }
  const today = new Date(`${localDate()}T12:00:00`).getDay();
  const days = Array.from({ length: 7 }, (_, i) => (state.settings.weekStartsOn + i) % 7);
  return toolbar + `<div class="toolbar"><p class="muted">每周安排用于规划，实际训练单独记录。</p><span class="spacer"></span>${button('开始训练', 'fit-start')}${button('新增训练安排', 'fit-routine', '', 'primary')}</div>
    <section class="panel"><div class="section-head"><h2>我的一周</h2><span class="muted small">按星期安排训练</span></div><div class="week-grid">${days.map(day => `<div class="day-card ${day === today ? 'today' : ''}"><h3>${weekdays[day]}</h3>${state.routines.filter(routine => routine.weekday === day).map(routine => `<p>${esc(routine.name)}</p>`).join('') || '<span class="muted">休息 / 未安排</span>'}</div>`).join('')}</div></section>
    <section class="panel"><div class="section-head"><h2>训练安排</h2><span class="muted small">${state.routines.length} 项安排</span></div>${state.routines.length
      ? `<div class="list">${state.routines.map(routine => {
        const names = routine.exerciseIds.map(id => state.exercises.find(exercise => exercise.id === id)?.name).filter(Boolean);
        const plans = state.plans.filter(plan => plan.link?.type === 'routine' && plan.link.id === routine.id);
        return `<article class="row" data-routine-id="${esc(routine.id)}" ${routine.id === selectedRoutineId ? 'data-selected-routine="true"' : ''}><div class="row-main"><strong class="row-title">${esc(routine.name)}</strong><div class="row-meta"><span class="badge">${weekdays[routine.weekday]}</span><span>${names.length} 个动作</span>${plans.map(plan => `<span>计划 ${esc(dateLabel(plan.date))} · ${plan.status === 'done' ? '已完成' : '待完成'}</span>`).join('')}</div><p class="muted small">${esc(names.join(' · ') || '尚未选择动作')}</p></div><div class="actions">${button('开始这次训练', 'fit-start', `data-routine-id="${esc(routine.id)}"`, 'small')}${button('安排到计划', 'fit-plan', attr(routine.id), 'small')}${button('编辑安排', 'fit-routine', attr(routine.id), 'ghost small')}${button('删除安排', 'fit-delete-routine', attr(routine.id), 'ghost small')}</div></article>`;
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
      return `<section class="panel" data-entry-id="${esc(entry.id)}"><div class="section-head"><h2>${esc(entry.name)}</h2><div class="actions">${button('新增一组', 'fit-set', entryAttr, 'small')}${button('移除训练动作', 'fit-delete-entry', entryAttr, 'ghost small')}</div></div>${entry.sets.length
        ? `<div class="table-wrap"><table><thead><tr><th>组次</th><th>次数</th><th>重量（${unit}）</th><th>操作</th></tr></thead><tbody>${entry.sets.map((set, index) => `<tr data-set-id="${esc(set.id)}"><td>第 ${index + 1} 组</td><td data-testid="set-reps">${set.reps} 次</td><td data-testid="set-weight">${fmt(fromKg(set.weightKg, unit))} ${unit}</td><td><div class="actions">${button('编辑组', 'fit-set', `${entryAttr} data-set-id="${esc(set.id)}"`, 'ghost small')}${button('删除组', 'fit-delete-set', `${entryAttr} data-set-id="${esc(set.id)}"`, 'ghost small')}</div></td></tr>`).join('')}</tbody></table></div>`
        : empty('还没有记录组数。填写实际完成的次数与重量。', '新增一组', 'fit-set', entryAttr)}</section>`;
    }).join('')}
    <section class="panel"><div class="toolbar">${button('添加训练动作', 'fit-add-entry', attr)}<span class="spacer"></span>${session.status === 'active'
      ? button('结束训练', 'fit-finish', `${attr}${setCount ? '' : ' disabled'}`, 'primary')
      : button('继续记录', 'fit-reopen', attr)}</div><p class="muted small">${setCount ? '已保存的组数可以继续编辑，训练历史保留当时的动作名称。' : '至少保存一组实际训练后，才可以结束训练。'}</p></section>`;
}

export async function handleFitness(ctx, action, target) {
  const { id, routineId, sessionId, entryId, setId } = target.dataset;
  if (action === 'fit-tab') { tab = target.dataset.tab; selectedSessionId = null; ctx.render(); return true; }
  if (action === 'fit-back') { openSession(null); ctx.render(); return true; }
  if (action === 'fit-open-session') { openSession(id); ctx.render(); return true; }
  if (action === 'fit-exercise' || action === 'exercise') {
    const exercise = ctx.state.exercises.find(record => record.id === id);
    ctx.formDialog(exercise ? '编辑动作' : '新增动作',
      ctx.field('动作名称', 'name', exercise?.name, 'text', 'required maxlength="300"')
      + ctx.field('动作说明（可选）', 'notes', exercise?.notes, 'textarea', 'maxlength="10000"'),
      data => ctx.commit(state => upsert(state, 'exercises', { name: data.get('name').trim(), notes: data.get('notes').trim() }, id), '动作已保存'),
      '动作库名称变更不会改写已经保存的训练历史。');
    return true;
  }
  if (action === 'fit-routine' || action === 'routine') {
    const routine = ctx.state.routines.find(record => record.id === id);
    ctx.formDialog(routine ? '编辑训练安排' : '新增训练安排',
      ctx.field('安排名称', 'name', routine?.name, 'text', 'required maxlength="300"')
      + ctx.selectField('训练星期', 'weekday', weekdays, String(routine?.weekday ?? new Date().getDay()))
      + exerciseChoices(ctx, routine?.exerciseIds || []),
      data => ctx.commit(state => upsert(state, 'routines', {
        name: data.get('name').trim(), weekday: Number(data.get('weekday')), exerciseIds: data.getAll('exerciseIds'),
      }, id), '训练安排已保存'), '每周安排用于规划，不自动生成训练记录。');
    return true;
  }
  if (action === 'fit-plan') { ctx.planDialog(undefined, { type: 'routine', id }); return true; }
  if (action === 'fit-start') {
    if (!ctx.state.exercises.length) { tab = 'exercises'; selectedSessionId = null; ctx.render(); return true; }
    const routine = ctx.state.routines.find(record => record.id === routineId);
    ctx.formDialog('开始训练',
      ctx.field('训练名称', 'name', routine?.name || '我的训练', 'text', 'required maxlength="300"')
      + ctx.field('训练日期', 'date', localDate(), 'date', 'required')
      + exerciseChoices(ctx, routine?.exerciseIds || []),
      async data => {
        const ids = data.getAll('exerciseIds');
        if (!ids.length) throw new Error('请选择至少一个训练动作。');
        const saved = await ctx.commit(state => upsert(state, 'sessions', {
          routineId: routine?.id || null, name: data.get('name').trim(), date: data.get('date'), status: 'active',
          entries: ids.map(exerciseId => ({ exerciseId, name: state.exercises.find(exercise => exercise.id === exerciseId).name, sets: [] })),
        }), '训练已开始，逐组记录实际数据');
        if (saved) { openSession(ctx.state.sessions.at(-1).id); ctx.render(); }
        return saved;
      }, '开始后先保存本次训练。组数、次数与重量由你逐项记录。', '开始训练');
    return true;
  }
  if (action === 'fit-session') {
    const session = ctx.state.sessions.find(record => record.id === id);
    ctx.formDialog('编辑训练', ctx.field('训练名称', 'name', session.name, 'text', 'required maxlength="300"')
      + ctx.field('训练日期', 'date', session.date, 'date', 'required'),
      data => ctx.commit(state => upsert(state, 'sessions', { name: data.get('name').trim(), date: data.get('date') }, id), '训练信息已保存'));
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
  const deleteCollections = { 'fit-delete-exercise': 'exercises', 'fit-delete-routine': 'routines', 'fit-delete-session': 'sessions' };
  if (deleteCollections[action]) { ctx.deleteDialog(deleteCollections[action], id); return true; }
  return false;
}
