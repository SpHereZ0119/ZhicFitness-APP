import { upsert, localDate } from './domain.mjs';

let selectedTopicId = null;
export function openStudy(id) { selectedTopicId = id || null; }

const statuses = { pending: '未完成', done: '已完成' };
const attr = (ctx, id) => `data-id="${ctx.esc(id)}"`;

function topicDialog(ctx, id) {
  const topic = ctx.state.studyTopics.find(record => record.id === id);
  ctx.formDialog(topic ? '编辑学习主题' : '添加学习主题',
    ctx.field('学习主题', 'name', topic?.name, 'text', 'required maxlength="300"')
    + ctx.field('学习目标', 'goal', topic?.goal, 'textarea', 'required maxlength="10000"'),
    data => ctx.commit(state => upsert(state, 'studyTopics', {
      name: data.get('name').trim(), goal: data.get('goal').trim(),
    }, id), '学习主题已保存'));
}

function entryDialog(ctx, id, topicId = selectedTopicId) {
  const entry = ctx.state.studyEntries.find(record => record.id === id);
  const topics = Object.fromEntries(ctx.state.studyTopics.map(topic => [topic.id, topic.name]));
  const initialTopic = entry?.topicId || topicId || ctx.state.studyTopics[0]?.id || '';
  ctx.formDialog(entry ? '编辑学习安排' : '添加学习安排',
    ctx.selectField('学习主题', 'topicId', topics, initialTopic)
    + ctx.field('安排日期', 'date', entry?.date || ctx.selectedDate || localDate(), 'date', 'required')
    + ctx.field('安排内容', 'title', entry?.title, 'text', 'required maxlength="300"')
    + ctx.field('计划时长（分钟）', 'plannedMinutes', entry?.plannedMinutes ?? 0, 'number', 'min="0" step="1" required')
    + ctx.field('实际学习时长（分钟）', 'actualMinutes', entry?.actualMinutes ?? 0, 'number', 'min="0" step="1" required')
    + ctx.field('笔记 / 完成记录', 'notes', entry?.notes, 'textarea', 'maxlength="20000"')
    + ctx.field('教学视频链接（可选）', 'videoUrl', entry?.videoUrl, 'url', 'maxlength="2000" placeholder="https://…"')
    + ctx.selectField('完成状态', 'status', statuses, entry?.status || 'pending'),
    data => ctx.commit(state => upsert(state, 'studyEntries', {
      topicId: data.get('topicId'), date: data.get('date'), title: data.get('title').trim(),
      plannedMinutes: Number(data.get('plannedMinutes')), actualMinutes: Number(data.get('actualMinutes')),
      notes: data.get('notes').trim(), videoUrl: data.get('videoUrl').trim(), status: data.get('status'),
    }, id), '学习安排已保存'));
}

function entryRow(ctx, entry) {
  const topic = ctx.state.studyTopics.find(record => record.id === entry.topicId);
  return `<article class="row ${entry.status === 'done' ? 'done' : ''}" data-study-entry="${ctx.esc(entry.id)}">
    <div class="row-main"><strong class="row-title">${ctx.esc(entry.title)}</strong>
      <div class="row-meta"><span class="badge ${entry.status === 'done' ? 'teal' : ''}">${statuses[entry.status]}</span><span>${ctx.esc(topic?.name || '未知主题')}</span><span>计划 ${entry.plannedMinutes} 分钟</span><span>实际 ${entry.actualMinutes} 分钟</span></div>
      ${entry.notes ? `<p class="note-body">${ctx.esc(entry.notes)}</p>` : ''}
    </div><div class="actions">${entry.videoUrl ? `<a class="button small video-link" href="${ctx.esc(entry.videoUrl)}" target="_blank" rel="noopener noreferrer">观看教学视频</a>` : ''}${ctx.button('加入今日计划', 'study-plan', attr(ctx, entry.id), 'small')}${ctx.button('编辑安排', 'study-entry', attr(ctx, entry.id), 'ghost small')}${ctx.button('删除安排', 'study-delete-entry', attr(ctx, entry.id), 'ghost small')}</div>
  </article>`;
}

export function renderLearning(ctx) {
  const { state, esc, button, empty, dateLabel } = ctx;
  if (selectedTopicId && !state.studyTopics.some(topic => topic.id === selectedTopicId)) selectedTopicId = null;
  const topics = [...state.studyTopics].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const date = ctx.selectedDate || localDate();
  const dayEntries = state.studyEntries.filter(entry => entry.date === date).sort((a, b) => a.title.localeCompare(b.title));
  const selected = state.studyTopics.find(topic => topic.id === selectedTopicId);
  const visibleEntries = selected ? dayEntries.filter(entry => entry.topicId === selected.id) : dayEntries;
  return `<div class="toolbar">${button('今天', 'today')}${selected ? button('查看全部主题', 'study-open') : ''}<label>查看日期 <input type="date" id="selected-date" aria-label="查看日期" value="${esc(date)}"></label><span class="spacer"></span>${button('添加学习主题', 'study-topic', '', 'primary')}${topics.length ? button('添加学习安排', 'study-entry', '', 'secondary') : ''}</div>
    <div class="two-column"><section class="panel"><div class="section-head"><h2>学习主题</h2><span class="muted small">${topics.length} 个主题</span></div>
      ${topics.length ? `<div class="list">${topics.map(topic => { const count = state.studyEntries.filter(entry => entry.topicId === topic.id).length; return `<article class="row ${selected?.id === topic.id ? 'selected' : ''}" data-study-topic="${esc(topic.id)}"><div class="row-main"><strong class="row-title">${esc(topic.name)}</strong><p class="summary-text">${esc(topic.goal)}</p><div class="row-meta"><span>${count} 条学习安排</span></div></div><div class="actions">${button('查看主题', 'study-open', attr(ctx, topic.id), 'small')}${button('添加安排', 'study-entry', attr(ctx, topic.id), 'ghost small')}${button('编辑主题', 'study-topic', attr(ctx, topic.id), 'ghost small')}${button('删除主题', 'study-delete-topic', attr(ctx, topic.id), 'ghost small')}</div></article>`; }).join('')}</div>` : empty('还没有学习主题，先确定一个想持续推进的方向。', '添加学习主题', 'study-topic')}</section>
      <section class="panel"><div class="section-head"><div><h2>${dateLabel(date)} 的学习安排</h2>${selected ? `<p class="muted">主题：${esc(selected.name)}</p>` : ''}</div><span class="muted small">${visibleEntries.length} 条安排</span></div>
        ${visibleEntries.length ? `<div class="list">${visibleEntries.map(entry => entryRow(ctx, entry)).join('')}</div>` : empty(selected ? '这一天暂无该主题的安排。' : '这一天暂无学习安排。', topics.length ? '添加学习安排' : '添加学习主题', topics.length ? 'study-entry' : 'study-topic')}</section></div>`;
}

export async function handleLearning(ctx, action, target) {
  const id = target.dataset.id;
  if (action === 'study-topic') { topicDialog(ctx, id); return true; }
  if (action === 'study-open') { openStudy(id); ctx.render(); return true; }
  if (action === 'study-entry') {
    if (!ctx.state.studyTopics.length) { ctx.toast('请先添加学习主题。'); return true; }
    const entry = ctx.state.studyEntries.find(record => record.id === id);
    entryDialog(ctx, entry ? id : undefined, entry ? undefined : (id || selectedTopicId)); return true;
  }
  if (action === 'study-plan') { ctx.planDialog(undefined, { type: 'studyEntry', id }); return true; }
  if (action === 'study-delete-entry') { ctx.deleteDialog('studyEntries', id); return true; }
  if (action === 'study-delete-topic') { ctx.deleteDialog('studyTopics', id); return true; }
  return false;
}

