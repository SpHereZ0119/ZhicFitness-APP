import { upsert, localDate } from './domain.mjs';

let selectedProjectId = null;
const projectStatuses = { active: '进行中', paused: '暂停', done: '已完成' };
const workStatuses = { pending: '待开始', doing: '进行中', done: '已完成' };
export function openProject(id) { selectedProjectId = id || null; }

export function renderDevelopment(ctx) {
  const { state, esc, button, empty, dateLabel } = ctx;
  const attr = id => `data-id="${esc(id)}"`;
  const project = state.projects.find(record => record.id === selectedProjectId);
  if (!project) {
    selectedProjectId = null;
    const projects = [...state.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return `<div class="toolbar"><p class="muted">把目标拆成工作项，留下每一天的进展。</p><span class="spacer"></span>${button('新建项目', 'dev-project', '', 'primary')}</div>
      <section class="panel"><div class="section-head"><h2>我的项目</h2><span class="muted small">${projects.length} 个项目</span></div>
      ${projects.length ? `<div class="list">${projects.map(record => {
        const items = state.workItems.filter(item => item.projectId === record.id);
        return `<article class="row" data-project-id="${esc(record.id)}"><div class="row-main"><strong class="row-title">${esc(record.name)}</strong><div class="row-meta"><span class="badge ${record.status === 'done' ? 'teal' : ''}">${projectStatuses[record.status]}</span><span>工作项 ${items.filter(item => item.status === 'done').length} / ${items.length}</span><span>目标 ${esc(dateLabel(record.targetDate))}</span></div>${record.description ? `<p class="summary-text">${esc(record.description)}</p>` : ''}</div><div class="actions">${button('打开项目', 'dev-open', attr(record.id), 'small')}${button('编辑项目', 'dev-project', attr(record.id), 'ghost small')}${button('删除项目', 'dev-delete-project', attr(record.id), 'ghost small')}</div></article>`;
      }).join('')}</div>` : empty('还没有项目。先确定一个想推进的目标。', '新建项目', 'dev-project')}</section>`;
  }
  const items = state.workItems.filter(record => record.projectId === project.id);
  const milestones = state.milestones.filter(record => record.projectId === project.id).sort((a, b) => a.date.localeCompare(b.date));
  const logs = state.devLogs.filter(record => record.projectId === project.id).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const completed = items.filter(record => record.status === 'done').length;
  return `<div class="toolbar">${button('← 返回项目列表', 'dev-back', '', 'ghost')}<span class="spacer"></span>${button('编辑项目', 'dev-project', attr(project.id))}${button('删除项目', 'dev-delete-project', attr(project.id), 'ghost')}</div>
    <section class="panel" data-project-detail="${esc(project.id)}"><div class="section-head"><h2>${esc(project.name)}</h2><span class="badge ${project.status === 'done' ? 'teal' : ''}">${projectStatuses[project.status]}</span></div><p class="log-body">${esc(project.description || '还没有项目说明。可以补充目标或当前思路。')}</p><div class="row-meta"><span>目标日期：${esc(dateLabel(project.targetDate))}</span><span>工作项完成：${completed} / ${items.length}</span><span>开发日志：${logs.length} 条</span></div></section>
    <section class="panel"><div class="section-head"><h2>工作项</h2>${button('新增工作项', 'dev-item', `data-project-id="${esc(project.id)}"`, 'small')}</div>
    ${items.length ? `<div class="list">${items.map(item => {
      const plans = state.plans.filter(plan => plan.link?.type === 'workItem' && plan.link.id === item.id);
      return `<article class="row ${item.status === 'done' ? 'done' : ''}" data-work-item-id="${esc(item.id)}"><div class="row-main"><strong class="row-title">${esc(item.title)}</strong><div class="row-meta"><span class="badge ${item.status === 'done' ? 'teal' : ''}">${workStatuses[item.status]}</span>${plans.map(plan => `<span>计划 ${esc(dateLabel(plan.date))}${plan.time ? ' ' + esc(plan.time) : ''} · ${plan.status === 'done' ? '已完成' : '待完成'}</span>`).join('')}</div></div><div class="actions">${button('安排到计划', 'dev-plan', attr(item.id), 'small')}${button('编辑工作项', 'dev-item', attr(item.id), 'ghost small')}${button('删除工作项', 'dev-delete-item', attr(item.id), 'ghost small')}</div></article>`;
    }).join('')}</div>` : empty('把项目拆成可以动手做的工作项。', '新增工作项', 'dev-item', `data-project-id="${esc(project.id)}"`)}</section>
    <div class="equal-columns"><section class="panel"><div class="section-head"><h2>里程碑</h2>${button('新增里程碑', 'dev-milestone', `data-project-id="${esc(project.id)}"`, 'small')}</div>
    ${milestones.length ? `<div class="list">${milestones.map(record => `<article class="row ${record.done ? 'done' : ''}" data-milestone-id="${esc(record.id)}"><div class="row-main"><strong class="row-title">${esc(record.title)}</strong><div class="row-meta">${esc(dateLabel(record.date))}<span class="badge">${record.done ? '已完成' : '待完成'}</span></div></div><div class="actions">${button(record.done ? '撤销完成' : '完成里程碑', 'dev-milestone-done', attr(record.id), 'small')}${button('编辑里程碑', 'dev-milestone', attr(record.id), 'ghost small')}${button('删除里程碑', 'dev-delete-milestone', attr(record.id), 'ghost small')}</div></article>`).join('')}</div>` : empty('标出项目中值得检查的重要节点。', '新增里程碑', 'dev-milestone', `data-project-id="${esc(project.id)}"`)}</section>
    <section class="panel"><div class="section-head"><h2>开发日志</h2>${button('新增开发日志', 'dev-log', `data-project-id="${esc(project.id)}"`, 'small')}</div>
    ${logs.length ? `<div class="list">${logs.map(record => `<article class="row" data-log-id="${esc(record.id)}"><div class="row-main"><h3>${esc(dateLabel(record.date))}</h3><p class="log-body">${esc(record.content)}</p></div><div class="actions">${button('编辑日志', 'dev-log', attr(record.id), 'ghost small')}${button('删除日志', 'dev-delete-log', attr(record.id), 'ghost small')}</div></article>`).join('')}</div>` : empty('记下今天完成了什么，以及下一步的思路。', '新增开发日志', 'dev-log', `data-project-id="${esc(project.id)}"`)}</section></div>`;
}

export async function handleDevelopment(ctx, action, target) {
  const id = target.dataset.id;
  const projectId = target.dataset.projectId || selectedProjectId;
  if (action === 'dev-open') { openProject(id); ctx.render(); return true; }
  if (action === 'dev-back') { openProject(null); ctx.render(); return true; }
  if (action === 'dev-project' || action === 'project') {
    const project = ctx.state.projects.find(record => record.id === id);
    ctx.formDialog(project ? '编辑项目' : '新建项目',
      ctx.field('项目名称', 'name', project?.name, 'text', 'required maxlength="300"')
      + ctx.selectField('项目状态', 'status', projectStatuses, project?.status || 'active')
      + ctx.field('目标日期（可选）', 'targetDate', project?.targetDate, 'date')
      + ctx.field('项目说明（可选）', 'description', project?.description, 'textarea', 'maxlength="10000"'),
      async data => {
        const saved = await ctx.commit(state => upsert(state, 'projects', {
          name: data.get('name').trim(), status: data.get('status'), targetDate: data.get('targetDate'), description: data.get('description').trim(),
        }, id), '项目已保存');
        if (saved && !id) { selectedProjectId = ctx.state.projects.at(-1).id; ctx.render(); }
        return saved;
      });
    return true;
  }
  if (action === 'dev-item') {
    const item = ctx.state.workItems.find(record => record.id === id);
    ctx.formDialog(item ? '编辑工作项' : '新增工作项',
      ctx.field('工作项标题', 'title', item?.title, 'text', 'required maxlength="300"')
      + ctx.selectField('工作状态', 'status', workStatuses, item?.status || 'pending'),
      data => ctx.commit(state => upsert(state, 'workItems', {
        projectId: item?.projectId || projectId, title: data.get('title').trim(), status: data.get('status'),
      }, id), '工作项已保存'));
    return true;
  }
  if (action === 'dev-plan') { ctx.planDialog(undefined, { type: 'workItem', id }); return true; }
  if (action === 'dev-milestone') {
    const record = ctx.state.milestones.find(item => item.id === id);
    ctx.formDialog(record ? '编辑里程碑' : '新增里程碑',
      ctx.field('里程碑名称', 'title', record?.title, 'text', 'required maxlength="300"')
      + ctx.field('目标日期', 'date', record?.date || ctx.selectedDate, 'date', 'required'),
      data => ctx.commit(state => upsert(state, 'milestones', {
        projectId: record?.projectId || projectId, title: data.get('title').trim(), date: data.get('date'),
      }, id), '里程碑已保存'));
    return true;
  }
  if (action === 'dev-milestone-done') {
    await ctx.commit(state => upsert(state, 'milestones', {
      done: !state.milestones.find(record => record.id === id).done,
    }, id), '里程碑状态已更新');
    return true;
  }
  if (action === 'dev-log') {
    const record = ctx.state.devLogs.find(item => item.id === id);
    ctx.formDialog(record ? '编辑开发日志' : '新增开发日志',
      ctx.field('日志日期', 'date', record?.date || localDate(), 'date', 'required')
      + ctx.field('开发记录', 'content', record?.content, 'textarea', 'required maxlength="20000"'),
      data => ctx.commit(state => upsert(state, 'devLogs', {
        projectId: record?.projectId || projectId, date: data.get('date'), content: data.get('content').trim(),
      }, id), '开发日志已保存'));
    return true;
  }
  const deleteCollections = {
    'dev-delete-project': 'projects', 'dev-delete-item': 'workItems',
    'dev-delete-milestone': 'milestones', 'dev-delete-log': 'devLogs',
  };
  if (deleteCollections[action]) { ctx.deleteDialog(deleteCollections[action], id); return true; }
  return false;
}
