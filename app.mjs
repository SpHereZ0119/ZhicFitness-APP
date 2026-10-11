import { createState, localDate, upsert, remove, titleForPlan, nutritionSummary, waterTotal, fromMl, fromKg, toKg, toMl, weekStart, setSettings, makeBackup, parseBackup, previewBackup } from './domain.mjs';
import { openDatabase, loadState, Repository, readSafety } from './storage.mjs';
import { renderDevelopment, handleDevelopment, openProject } from './development.mjs';
import { renderFitness, handleFitness, openRoutine } from './fitness.mjs';
import { renderDiet, handleDiet, openMealPlan } from './diet.mjs';
import { renderGaming, handleGaming, openGame } from './gaming.mjs';
import { renderLearning, handleLearning, openStudy } from './learning.mjs';
import { renderSettings, handleSettings, handleSettingsChange } from './settings.mjs';

const pages = [ ['home','首页预览','⌂'], ['plans','今日计划','◷'], ['learning','学习计划','▣'], ['development','开发工作','⌘'], ['fitness','健身计划','↗'], ['diet','饮食计划','◒'], ['gaming','游戏娱乐','◇'], ['settings','数据与设置','⚙'] ];
let state = createState(), repo, saving = '正在读取', page = location.hash.slice(1) || 'home';
let selectedDate = localDate();
let failedMutation = null, pendingWrites = 0, dialogGeneration = 0, lastError = '';
let dialogReturnFocus = null, dialogCloseTimer = null;
let routeTransition = false;
const moduleNames = {personal:'个人事项',study:'学习计划',development:'开发工作',fitness:'健身计划',diet:'饮食计划',gaming:'游戏娱乐'};
const priorityNames = {high:'高优先级',normal:'普通',low:'低优先级'};
const mealNames = {breakfast:'早餐',lunch:'午餐',dinner:'晚餐',snack:'加餐'};
const app = document.querySelector('#app');
const editor = document.querySelector('#editor');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const button = (label, action, data = '', cls = '') => `<button type="button" class="${cls}" data-action="${action}" ${data}>${label}</button>`;
const empty = (text, label = '', action = '', data = '') => `<div class="empty"><span class="empty-mark">＋</span><p>${esc(text)}</p>${label ? button(label,action,data,'primary') : ''}</div>`;
function toast(message, error = false) {
  const node = document.querySelector('#toast'); node.textContent = message; node.className = error ? 'visible error toast-enter' : 'visible toast-enter';
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.className = '', 4500);
}
function saveStatus(value) { saving = value; const node = document.querySelector('#save-status'); if (node) { node.textContent = value; node.classList.toggle('error', value.includes('失败')); } const saveButton=document.querySelector('[data-action="manual-save"]');if(saveButton){saveButton.classList.toggle('is-saving',value==='保存中');saveButton.setAttribute('aria-busy',String(value==='保存中'));} const discard=document.querySelector('[data-action="discard-failed"]');if(discard)discard.hidden=!failedMutation;const retry=document.querySelector('[data-action="retry"]');if(retry)retry.hidden=!value.includes('失败'); }
async function commit(mutation, message = '', retry = false) {
  if (!repo) { toast('尚未读取本地数据，请先重试。',true); return false; }
  const source = editor.open ? dialogGeneration : null;
  const failureAtStart = failedMutation;
  if(failedMutation && !retry && !(source && source===failedMutation.source)){toast('请先重试尚未保存的操作，再继续修改。',true);render();return false;}
  pendingWrites++; saveStatus('保存中');
  try {
    state = await repo.run(mutation);
    lastError='';
    if(retry || (failureAtStart && failedMutation===failureAtStart && source===failureAtStart.source)) failedMutation=null;
    window.lifeChannel?.postMessage('updated');
    render(); if(message)toast(message); return true;
  } catch(error) { lastError=error.message;failedMutation = {mutation,source}; render();toast(error.message,true); return false; }
  finally { pendingWrites--; saveStatus(failedMutation ? '保存失败，请重试' : pendingWrites ? '保存中' : '已保存'); }
}
async function replace(next) {
  if(!repo || failedMutation || pendingWrites){lastError='请先处理未完成的保存，再恢复数据。';toast(lastError,true);return false;}
  lastError='';pendingWrites++;saveStatus('保存中');
  try{state=await repo.replace(next);window.lifeChannel?.postMessage('updated');render();toast('数据已恢复');return true;}
  catch(error){lastError=error.message;toast(error.message,true);return false;}
  finally{pendingWrites--;saveStatus(lastError?'保存失败：恢复失败，请重试':'已保存');}
}
async function manualSave() {
  if (!repo || failedMutation || pendingWrites) { toast('请先处理未完成的保存，再手动保存。', true); return false; }
  pendingWrites++; saveStatus('保存中');
  let succeeded = false;
  try {
    state = await repo.run(current => current);
    window.lifeChannel?.postMessage('updated');
    toast('数据已手动保存');
    succeeded = true;
    return true;
  } catch (error) {
    toast(error.message, true);
    return false;
  } finally {
    pendingWrites--;
    saveStatus(succeeded ? (pendingWrites ? '保存中' : '已保存') : '保存失败，请重试');
  }
}
const opts = (items,value) => Object.entries(items).map(([id,label])=>`<option value="${esc(id)}" ${String(value)===id?'selected':''}>${esc(label)}</option>`).join('');
function field(label,name,value='',type='text',extra='') {
  const id = `field-${name}`;
  const control = type==='textarea' ? `<textarea id="${id}" name="${name}" ${extra}>${esc(value)}</textarea>` : `<input id="${id}" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
  return `<div class="field ${type==='textarea'?'full':''}"><label for="${id}">${esc(label)}</label>${control}</div>`;
}
const selectField = (label,name,items,value) => { const id = `field-${name}`; return `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}" name="${name}">${opts(items,value)}</select></div>`; };
function formDialog(title,fields,onSubmit,description='',submitLabel='保存') {
  clearTimeout(dialogCloseTimer);
  dialogReturnFocus=focusKey(document.activeElement)||dialogReturnFocus;
  const token=++dialogGeneration;
  editor.innerHTML = `<form><div class="section-head"><h2 id="dialog-title">${esc(title)}</h2>${button('关闭','close','','ghost')}</div>${description?`<p class="dialog-description">${esc(description)}</p>`:''}<div class="form-grid">${fields}</div><p class="form-error" role="alert" hidden></p><div class="form-actions">${button('取消','close')}<button type="submit">${esc(submitLabel)}</button></div></form>`;
  editor.setAttribute('aria-labelledby','dialog-title');editor.classList.remove('dialog-exiting');editor.showModal();editor.classList.remove('dialog-entered');requestAnimationFrame(() => editor.classList.add('dialog-entered'));
  const form=editor.querySelector('form');
  form.onsubmit = async event => {
    event.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try { const result=await onSubmit(new FormData(event.target));if(result!==false && token===dialogGeneration)closeDialog();else if(result===false){const node=form.querySelector('.form-error');node.hidden=false;node.textContent=lastError||'尚未保存，请修正后重试。';} }
    catch(error){const node=form.querySelector('.form-error');node.hidden=false;node.textContent=error.message;}
    finally{submit.disabled=false;}
  };
}
function focusKey(node) {
  if(!node || !app.contains(node))return null;
  if(node.id)return {domId:node.id};
  if(node.dataset.action||node.dataset.change)return {...node.dataset};
  return node.matches('nav a')?{href:node.getAttribute('href')}:null;
}
function restoreFocus(key) {
  if(!key || editor.open)return;
  const node=key.domId?document.getElementById(key.domId):[...app.querySelectorAll('[data-action],[data-change],nav a')].find(node=>Object.entries(key).every(([name,value])=>name==='href'?node.getAttribute('href')===value:node.dataset[name]===value));
  node?.focus({preventScroll:true});
}
function closeDialog() {
  if(failedMutation?.source===dialogGeneration){failedMutation=null;lastError='';saveStatus(pendingWrites?'保存中':'已保存');}
  if (!editor.open) return;
  editor.classList.remove('dialog-entered');
  editor.classList.add('dialog-exiting');
  clearTimeout(dialogCloseTimer);
  dialogCloseTimer = setTimeout(() => { editor.classList.remove('dialog-exiting'); editor.close(); }, 210);
}
editor.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
editor.addEventListener('close',()=>{queueMicrotask(()=>restoreFocus(dialogReturnFocus));});
const dateLabel = value => {if(!value)return '未设日期';const [y,m,d]=value.split('-');return state.settings.dateFormat==='YYYY/MM/DD'?`${y}/${m}/${d}`:state.settings.dateFormat==='MM/DD/YYYY'?`${m}/${d}/${y}`:value;};
const fmt = value => Number(value.toFixed(2)).toLocaleString('zh-CN');
function deleteDialog(collection,id) {
  const messages={studyTopics:'学习主题及其全部学习安排将被删除，关联计划保留为独立事项。',studyEntries:'这条学习安排将被删除，关联计划保留为独立事项。',projects:'项目、工作项、里程碑和开发日志将被删除，关联计划保留为独立事项。',games:'游戏及其游玩记录将被删除，关联计划保留为独立事项。',plans:'计划及其小步骤将被删除，模块中的原始记录会保留。',routines:'训练安排将被删除，实际训练历史会保留。',exercises:'动作将从动作库和安排中移除，训练历史的动作名称和数据会保留。'};
  formDialog('删除记录',`<p class="full">${messages[collection]||'这条记录将被删除。请确认后继续。'}</p>`,()=>commit(s=>remove(s,collection,id),'记录已删除'),'','确认删除');
}
function memoDialog(id) {
  const record = state.memos.find(item=>item.id===id);
  formDialog(record?'编辑备忘':'新增备忘',field('备忘内容','content',record?.content,'textarea','required maxlength="10000"'),data=>commit(s=>upsert(s,'memos',{content:data.get('content').trim()},id),'备忘已保存'));
}
function planDialog(id,link=null) {
  const plan=state.plans.find(item=>item.id===id);
  const title=plan?titleForPlan(state,plan):link?titleForPlan(state,{title:'',link}):'';
  const initialModule = plan?.module || ({studyEntry:'study',workItem:'development',routine:'fitness',mealPlan:'diet',game:'gaming'}[link?.type] || 'personal');
  const currentLink=plan?.link||link;
  const sourceDate=currentLink?.type==='mealPlan'?state.mealPlans.find(m=>m.id===currentLink.id)?.date:currentLink?.type==='studyEntry'?state.studyEntries.find(entry=>entry.id===currentLink.id)?.date:null;
  formDialog(plan?'编辑计划':'新增计划',
    field('计划名称','title',title,'text',currentLink?'disabled':'required maxlength="300"')+
    field('日期','date',plan?.date||sourceDate||selectedDate,'date','required')+field('开始时间（可选）','time',plan?.time||'','time')+
    (currentLink?field('所属模块','module',moduleNames[initialModule],'text','disabled'):selectField('所属模块','module',moduleNames,initialModule))+selectField('优先级','priority',priorityNames,plan?.priority||'normal')+
    field('小步骤（每行一项）','steps',plan?.steps.map(step=>step.title).join('\n')||'','textarea','placeholder="例如：阅读资料\n整理笔记"'),
    data=>commit(s=>{
      const titles=data.get('steps').split('\n').map(v=>v.trim()).filter(Boolean);
      const used=new Set();
      const steps=titles.map(title=>{const old=plan?.steps.find(v=>v.title===title&&!used.has(v.id));if(old)used.add(old.id);return old||{id:crypto.randomUUID(),title,done:false};});
      return upsert(s,'plans',{title:currentLink?(plan?.title||'关联事项'):data.get('title').trim(),date:data.get('date'),time:data.get('time'),module:currentLink?initialModule:data.get('module'),priority:data.get('priority'),steps,link:currentLink},id);
    },'计划已保存'),currentLink?'名称跟随来源记录，日期、步骤与完成状态独立保存。':'按自己的节奏安排，时间可以稍后再定。');
}
function planRows(date) {
  const plans=state.plans.filter(p=>p.date===date).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')||a.createdAt.localeCompare(b.createdAt));
  return plans.length?`<div class="list">${plans.map(plan=>`<article class="plan-item" data-plan-id="${esc(plan.id)}"><div class="row ${plan.status==='done'?'done':''}"><input type="checkbox" aria-label="完成计划：${esc(titleForPlan(state,plan))}" data-change="plan-done" data-id="${esc(plan.id)}" ${plan.status==='done'?'checked':''}><span class="row-time">${plan.time||'待安排'}</span><div class="row-main"><strong class="row-title">${esc(titleForPlan(state,plan))}</strong><div class="row-meta"><span class="badge">${moduleNames[plan.module]}</span><span class="badge ${plan.priority==='high'?'orange':''}">${priorityNames[plan.priority]}</span>${plan.link?button('打开来源','source',`data-id="${esc(plan.id)}"`,'ghost small'):''}</div></div><div class="actions">${button('编辑 / 改期','plan',`data-id="${esc(plan.id)}"`,'small')}${button('删除','delete',`data-collection="plans" data-id="${esc(plan.id)}"`,'ghost small')}</div></div>${plan.steps.length?`<div class="steps">${plan.steps.map(step=>`<label><input type="checkbox" data-change="step-done" data-id="${esc(plan.id)}" data-step-id="${esc(step.id)}" ${step.done?'checked':''}>${esc(step.title)}</label>`).join('')}</div>`:''}</article>`).join('')}</div>`:empty('今天还没有安排。给重要的事留一点时间。','新增计划','plan');
}
function dateToolbar() {return `<div class="toolbar">${button('今天','today')}<label>查看日期 <input type="date" id="selected-date" aria-label="查看日期" value="${selectedDate}"></label><span class="spacer"></span>${button('新增计划','plan','','primary')}</div>`;}
function homePage() {
  const today=localDate(),plans=state.plans.filter(p=>p.date===today),done=plans.filter(p=>p.status==='done').length;
  const water=fromMl(waterTotal(state,today),state.settings.waterUnit);
  const activeProjects=state.projects.filter(p=>p.status==='active'),games=state.games.filter(g=>g.status==='playing');
  const studyEntries=state.studyEntries.filter(entry=>entry.date===today);
  const weekday=new Date(`${today}T12:00:00`).getDay();const routines=state.routines.filter(r=>r.weekday===weekday);
  const week=weekStart(today,state.settings.weekStartsOn),count=state.sessions.filter(s=>s.status==='done'&&s.date>=week&&s.date<=today).length;
  return `<div class="toolbar"><span class="pill">${dateLabel(today)} · 我的今天</span><span class="spacer"></span>${button('＋ 新增计划','plan','','primary')}</div><div class="stat-row"><div class="stat accent"><small>今日计划</small><strong data-testid="today-progress">${done} / ${plans.length}</strong><p>${plans.length?'留出时间，一件件完成':'今天，从一个小计划开始'}</p><progress value="${done}" max="${plans.length||1}" aria-label="今日计划进度"></progress></div><div class="stat"><small>进行中的项目</small><strong>${activeProjects.length}</strong><p>专注当前的开发目标</p></div><div class="stat"><small>本周已完成训练</small><strong>${count}<small> 次</small></strong><p>保持自己的训练节奏</p></div><div class="stat teal"><small>今日已记录饮水</small><strong>${fmt(water)}<small> ${state.settings.waterUnit}</small></strong><p>按实际饮水记录</p></div></div><div class="dashboard-grid"><section class="panel"><div class="section-head"><h2>今日计划</h2><a href="#plans">查看全部 →</a></div>${planRows(today)}</section><section class="panel"><div class="section-head"><h2>快速备忘</h2>${button('＋ 记一笔','memo','','small')}</div>${state.memos.length?`<div class="list">${[...state.memos].reverse().map(m=>`<div class="row"><div class="row-main"><p class="memo-content">${esc(m.content)}</p><small class="muted">${dateLabel(localDate(new Date(m.updatedAt)))}</small></div><div class="actions">${button('编辑','memo',`data-id="${esc(m.id)}"`,'ghost small')}${button('删除','delete',`data-collection="memos" data-id="${esc(m.id)}"`,'ghost small')}</div></div>`).join('')}</div>`:empty('灵感、想法、临时小事，随手记在这里。','新增备忘','memo')}</section></div><div class="section-head module-heading"><h2>日常的不同切面</h2><span class="muted small">五个空间，同一个你</span></div><div class="module-grid">${summaryPanel('学习计划','#learning',studyEntries.length?studyEntries.map(entry=>entry.title).join(' · '):'今天没有学习安排。',state.studyTopics.length?'添加学习安排':'添加学习主题',state.studyTopics.length?'study-entry':'study-topic')}${summaryPanel('开发工作','#development',activeProjects.map(p=>p.name).join(' · ')||'还没有进行中的项目。','新建项目','project')}${summaryPanel('健身计划','#fitness',routines.map(r=>r.name).join(' · ')||'今天没有训练安排。','添加训练安排','routine')}${summaryPanel('饮食计划','#diet',`今日 ${state.foods.filter(f=>f.date===today).length} 条实际饮食记录 · 已记录热量 ${fmt(nutritionSummary(state,today).calories)} kcal`,'记录餐食','food')}${summaryPanel('游戏娱乐','#gaming',games.map(g=>`${g.name}${g.progress?' · '+g.progress:''}`).join('；')||'还没有正在玩的游戏。','添加游戏','game')}</div>`;
}
function summaryPanel(title,href,text,label,action) {return `<section class="panel"><div class="section-head"><h2>${title}</h2><a href="${href}" aria-label="打开${title}">进入 →</a></div><p class="summary-text">${esc(text)}</p>${button(label,action,'','small')}</section>`;}
function render() {
  const previousProgress = document.querySelector('[data-testid="today-progress-ring"]')?.getAttribute('aria-valuenow');
  const focus=focusKey(document.activeElement);
  if (!pages.some(item => item[0] === page)) page = 'home';
  const item = pages.find(item => item[0] === page);
  app.innerHTML = `<div class="app-shell"><aside class="sidebar"><a class="brand" href="#home"><span class="brand-icon">Z</span><span>ZHIC <small>PERSONAL SPACE</small></span></a><div class="nav-label">我的工作台</div><nav aria-label="主导航">${pages.map(([id,name,icon])=>`<a href="#${id}" ${id===page?'aria-current="page"':''}><span aria-hidden="true">${icon}</span>${name}</a>`).join('')}</nav><div class="sidebar-bottom"><span class="local-dot"></span> 本机空间 <small>专注自己的节奏</small></div></aside><main class="main"><div class="topbar"><span>我的空间 <span class="breadcrumb">/ ${item[1]}</span></span><div class="save-area"><span id="save-status" role="status">${esc(saving)}</span>${button('手动保存','manual-save','','subtle')}${button('重试保存','retry','','subtle')}<span class="avatar">Z</span></div></div><div class="page-content"><header class="page-header"><div><p class="eyebrow">${page==='home'?'TODAY, AT YOUR PACE':'MY PERSONAL WORKSPACE'}</p><h1>${page==='home'?'把今天，过成自己的节奏。':item[1]}</h1><p class="subtitle">${page==='home'?'计划、记录、慢慢前进。你的日常都在这里。':'记录当下，让每一步都有迹可循。'}</p></div></header><div id="page-body" class="${routeTransition ? 'page-enter' : ''}">${empty('此处尚无记录')}</div></div></main></div>`;
  renderPage();
  animateProgressRing(previousProgress);
  const discard=document.createElement('button');discard.type='button';discard.dataset.action='discard-failed';discard.className='ghost small';discard.textContent='放弃未保存修改';discard.hidden=!failedMutation;document.querySelector('.save-area').append(discard);
  saveStatus(saving);
  restoreFocus(focus);
}
function enhanceTodayProgress(body) {
  const progress = body.querySelector('progress[aria-label="今日计划进度"]');
  if (!progress) return;
  const metric = body.querySelector('[data-testid="today-progress"]')?.textContent || '0 / 0';
  const [value, max] = metric.split('/').map(part => Number(part.trim()) || 0);
  const circumference = 2 * Math.PI * 42;
  const ratio = max ? Math.min(1, value / max) : 0;
  const ring = document.createElement('div');
  ring.className = 'progress-ring';
  ring.dataset.testid = 'today-progress-ring';
  ring.setAttribute('role', 'progressbar');
  ring.setAttribute('aria-label', '今日计划完成进度');
  ring.setAttribute('aria-valuemin', '0');
  ring.setAttribute('aria-valuemax', String(max));
  ring.setAttribute('aria-valuenow', String(value));
  ring.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="progress-ring-track" cx="50" cy="50" r="42"></circle><circle class="progress-ring-value" cx="50" cy="50" r="42" pathLength="${circumference}" stroke-dasharray="${circumference * ratio} ${circumference * (1 - ratio)}"></circle></svg><strong>${value} / ${max}</strong>`;
  progress.replaceWith(ring);
}
function animateProgressRing(previousValue) {
  const body = document.querySelector('#page-body');
  if (body && page === 'home') enhanceTodayProgress(body);
  const ring = body?.querySelector('[data-testid="today-progress-ring"]');
  if (!ring || previousValue === null || previousValue === undefined) return;
  const value = Number(ring.getAttribute('aria-valuenow')) || 0;
  const max = Number(ring.getAttribute('aria-valuemax')) || 0;
  const circumference = 2 * Math.PI * 42;
  const start = max ? Math.min(1, Number(previousValue) / max) : 0;
  const end = max ? Math.min(1, value / max) : 0;
  const path = ring.querySelector('.progress-ring-value');
  path.style.transition = 'none';
  path.style.strokeDasharray = `${circumference * start} ${circumference * (1 - start)}`;
  requestAnimationFrame(() => { path.style.transition = 'stroke-dasharray 520ms cubic-bezier(.22,.8,.28,1)'; path.style.strokeDasharray = `${circumference * end} ${circumference * (1 - end)}`; });
}
function renderPage() {
  const body = document.querySelector('#page-body');
  if(page==='home'){body.innerHTML=homePage();return;}
  if(page==='plans'){body.innerHTML=dateToolbar()+`<section class="panel"><div class="section-head"><h2>${dateLabel(selectedDate)} 的安排</h2><span class="muted small">有时间的优先排列 · 随时可以改期</span></div>${planRows(selectedDate)}</section>`;return;}
  if(page==='learning'){body.innerHTML=renderLearning(context);return;}
  if(page==='development'){body.innerHTML=renderDevelopment(context);return;}
  if(page==='fitness'){body.innerHTML=renderFitness(context);return;}
  if(page==='diet'){body.innerHTML=renderDiet(context);return;}
  if(page==='gaming'){body.innerHTML=renderGaming(context);return;}
  if(page==='settings'){body.innerHTML=renderSettings(context);return;}
  body.innerHTML = `<section class="panel"><div class="section-head"><h2>${pages.find(item=>item[0]===page)[1]}</h2></div>${empty('还没有记录，从自己的第一步开始。')}</section>`;
}
window.addEventListener('hashchange', () => { const next=location.hash.slice(1)||'home';if(page==='home' && next==='plans')selectedDate=localDate();routeTransition = next !== page;page=next;render();routeTransition=false; });
const eventControl = event => event.target && typeof event.target.closest === 'function' ? event.target.closest('button, a, [role="button"]') : null;
document.addEventListener('pointerdown', event => { const control = eventControl(event); if (control && !control.disabled && !control.getAttribute('aria-disabled')) control.classList.add('is-pressed'); });
document.addEventListener('pointerup', event => { eventControl(event)?.classList.remove('is-pressed'); });
document.addEventListener('pointercancel', event => { eventControl(event)?.classList.remove('is-pressed'); });
document.addEventListener('pointerleave', event => { eventControl(event)?.classList.remove('is-pressed'); }, true);
document.addEventListener('keydown', event => { const control = event.target.closest('button, a, [role="button"]'); if (control && (event.key === 'Enter' || event.key === ' ' ) && !control.disabled) control.classList.add('is-pressed'); });
document.addEventListener('keyup', event => { const control = event.target.closest('button, a, [role="button"]'); if (control && (event.key === 'Enter' || event.key === ' ')) control.classList.remove('is-pressed'); });
window.addEventListener('blur', () => document.querySelectorAll('.is-pressed').forEach(node => node.classList.remove('is-pressed')));
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const {action,id,collection}=target.dataset;
  if(action==='close'){closeDialog();return;}
  if(action==='retry'){if(failedMutation){const source=failedMutation.source;if(await commit(failedMutation.mutation,'保存已重试',true) && editor.open && source===dialogGeneration)editor.close();}else location.reload();return;}
  if(action==='manual-save'){await manualSave();return;}
  if(action==='discard-failed'){failedMutation=null;lastError='';saveStatus(pendingWrites?'保存中':'已保存');render();toast('已保留上次成功保存的数据');return;}
  if(action==='memo')memoDialog(id);
  if(action==='plan'){if(page==='home'&&!id)selectedDate=localDate();planDialog(id);}
  if(action==='delete')deleteDialog(collection,id);
  if(action==='today'){selectedDate=localDate();render();}
  if(action==='project'){await handleDevelopment(context,'project',target);return;}
  if(action.startsWith('dev-')){await handleDevelopment(context,action,target);return;}
  if(action==='study-entry'||action==='study-topic'||action==='study-open'||action.startsWith('study-')){if(page==='home')selectedDate=localDate();await handleLearning(context,action,target);return;}
  if(action==='routine'||action==='exercise'||action.startsWith('fit-')){await handleFitness(context,action,target);return;}
  if(action==='food'||action==='meal-plan'||action==='water'||action.startsWith('diet-')){if(page==='home')selectedDate=localDate();await handleDiet(context,action,target);return;}
  if(action==='game'||action.startsWith('game-')){await handleGaming(context,action,target);return;}
  if(action.startsWith('settings-')){await handleSettings(context,action);return;}
  if(action==='source'){
    const link=state.plans.find(p=>p.id===id)?.link;
    if(!link){toast('来源已移除');return;}
    if(link.type==='workItem'){openProject(state.workItems.find(w=>w.id===link.id).projectId);location.hash='development';page='development';render();}
    if(link.type==='studyEntry'){const entry=state.studyEntries.find(item=>item.id===link.id);openStudy(entry?.topicId);selectedDate=entry?.date || selectedDate;location.hash='learning';page='learning';render();}
    if(link.type==='routine'){openRoutine(link.id);location.hash='fitness';page='fitness';render();}
    if(link.type==='mealPlan'){selectedDate=state.mealPlans.find(m=>m.id===link.id).date;openMealPlan(link.id);location.hash='diet';page='diet';render();}
    if(link.type==='game'){openGame(link.id);location.hash='gaming';page='gaming';render();}
  }
});
document.addEventListener('change',async event=>{
  const node=event.target;
  if(node.id==='selected-date'){selectedDate=node.value||localDate();render();return;}
  if(node.id==='fitness-date'){await handleFitness(context,'fit-date',node);return;}
  if(node.dataset.change==='fit-exercise-select'){
    await handleFitness(context,'fit-exercise-select',node);
    return;
  }
  if(await handleSettingsChange(context,event))return;
  if(node.dataset.change==='plan-done')await commit(s=>upsert(s,'plans',{status:node.checked?'done':'pending'},node.dataset.id));
  if(node.dataset.change==='step-done')await commit(s=>upsert(s,'plans',{steps:s.plans.find(p=>p.id===node.dataset.id).steps.map(step=>step.id===node.dataset.stepId?{...step,done:node.checked}:step)},node.dataset.id));
});
document.addEventListener('input', event => {
  const search = event.target.closest('.routine-exercise-search');
  if (!search) return;
  const query = search.value.trim().toLocaleLowerCase();
  search.closest('.field')?.querySelectorAll('.routine-exercise').forEach(row => {
    const label = row.querySelector('label')?.textContent?.toLocaleLowerCase() || '';
    row.hidden = Boolean(query) && !label.includes(query);
  });
});
let exercisePress = null;
document.addEventListener('pointerdown', event => {
  const row = event.target.closest('.exercise-row');
  if (!row || event.button !== 0 || event.target.closest('button,a,input')) return;
  const startX = event.clientX;
  const startY = event.clientY;
  const timer = setTimeout(() => { row.dataset.longPressReady = 'true'; }, 350);
  exercisePress = { row, startX, startY, timer };
  row.setPointerCapture?.(event.pointerId);
});
document.addEventListener('pointermove', event => {
  if (!exercisePress || event.target.closest('.exercise-swipe-actions')) return;
  const { row, startX, startY } = exercisePress;
  const dx = event.clientX - startX;
  const dy = event.clientY - startY;
  if (Math.abs(dy) > 24 || (dx > -24 && Math.abs(dx) > 10)) {
    clearTimeout(exercisePress.timer);
    exercisePress = null;
    delete row.dataset.longPressReady;
    return;
  }
  if (row.dataset.longPressReady === 'true' && dx < -28) row.dataset.actionsRevealed = 'true';
});
function clearExercisePress() {
  if (!exercisePress) return;
  clearTimeout(exercisePress.timer);
  delete exercisePress.row.dataset.longPressReady;
  exercisePress = null;
}
document.addEventListener('pointerup', clearExercisePress);
document.addEventListener('pointercancel', clearExercisePress);
document.addEventListener('dragstart', event => {
  const row = event.target.closest('[data-exercise-id]');
  if (row && event.dataTransfer) event.dataTransfer.setData('text/plain', row.dataset.exerciseId);
});
document.addEventListener('dragover', event => {
  if (event.target.closest('[data-group-drop]')) event.preventDefault();
});
document.addEventListener('drop', async event => {
  const group = event.target.closest('[data-group-drop]');
  if (!group || !event.dataTransfer) return;
  event.preventDefault();
  const exerciseId = event.dataTransfer.getData('text/plain');
  if (!exerciseId) return;
  await handleFitness(context, 'fit-assign-exercise-group', { dataset: { id: exerciseId, groupId: group.dataset.exerciseGroupId } });
});
async function init() {
  render();
  try {
    const db = await openDatabase(); state = await loadState(db); repo = new Repository(db,state);
    saveStatus('已保存'); render();
    const channel = new BroadcastChannel('zhic-life-changes');
    channel.onmessage = async () => {try{ await repo.tail.catch(()=>{}); state = await loadState(db); repo.state = state; render(); }catch(error){saveStatus('读取失败');toast(error.message,true);}};
    window.lifeChannel = channel;
  } catch (error) { saveStatus('读取失败'); toast(error.message,true); }
}
const context = {get state(){return state;},get selectedDate(){return selectedDate;},setDate(value){selectedDate=value;render();},getSafety(){return readSafety(repo.db);},replace,esc,button,empty,field,selectField,formDialog,commit,deleteDialog,planDialog,dateLabel,fmt,render,toast,mealNames};
init();
