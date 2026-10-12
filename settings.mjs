import { COLLECTIONS, setSettings, makeBackup, parseBackup, previewBackup, localDate, validateState } from './domain.mjs';
import { exportBackupFile } from './runtime.mjs';

const collectionNames = {
  memos: '备忘', plans: '今日计划', studyTopics: '学习主题', studyEntries: '学习安排', projects: '开发项目', workItems: '开发工作项',
  milestones: '里程碑', devLogs: '开发日志', exerciseGroups: '动作组', exercises: '健身动作', routines: '训练安排',
  sessions: '实际训练', mealPlans: '餐食安排', foods: '实际饮食', waters: '饮水记录',
  games: '游戏', plays: '游玩记录',
};
const dateFormats = { 'YYYY-MM-DD': '年-月-日（2026-10-10）', 'YYYY/MM/DD': '年/月/日（2026/10/10）', 'MM/DD/YYYY': '月/日/年（10/10/2026）' };
const weekStarts = { 1: '周一', 0: '周日' };
const weightUnits = { kg: '公斤（kg）', lb: '磅（lb）' };
const waterUnits = { ml: '毫升（ml）', L: '升（L）' };

function preferenceSelect(ctx, label, name, choices, value) {
  const id = `preference-${name}`;
  const options = Object.entries(choices).map(([key, text]) =>
    `<option value="${ctx.esc(key)}" ${String(value) === key ? 'selected' : ''}>${ctx.esc(text)}</option>`).join('');
  return `<div class="field"><label for="${id}">${ctx.esc(label)}</label><select id="${id}" name="${name}">${options}</select></div>`;
}

function calendarScaleControl(scale) {
  return `<div class="field full calendar-scale-control"><div class="section-head"><div><label for="preference-calendarHoverScale">日历悬停放大倍率</label><p class="muted small">拖动选择大小，也可用方向键微调。</p></div><output id="calendar-scale-value" for="preference-calendarHoverScale">${scale.toFixed(2)}×</output></div><input id="preference-calendarHoverScale" type="range" name="calendarHoverScale" min="1" max="3" step="0.04" value="${scale}" aria-describedby="calendar-scale-help"><div class="scale-labels" aria-hidden="true"><span>1× · 原尺寸</span><span>2×</span><span>3× · 大预览</span></div><div class="calendar-scale-preview" aria-hidden="true"><span>11</span><span class="scale-preview-day">12<small>当天安排</small></span><span>13</span></div><p id="calendar-scale-help" class="muted small">每格 0.04×，应用到健身与饮食日历。点击日期可查看完整安排。</p></div>`;
}

export function handleSettingsInput(event) {
  if (event.target.id !== 'preference-calendarHoverScale') return;
  const scale = Number(event.target.value);
  document.querySelector('#calendar-scale-value').textContent = `${scale.toFixed(2)}×`;
  event.target.closest('.calendar-scale-control').style.setProperty('--preview-scale', scale);
}

function countsHtml(ctx, state) {
  const counts = previewBackup(state);
  return `<div class="table-wrap full"><table><thead><tr><th>数据类别</th><th>记录数量</th></tr></thead><tbody>${COLLECTIONS.map(key => `<tr><td>${collectionNames[key]}</td><td data-backup-count="${key}">${counts[key]}</td></tr>`).join('')}</tbody></table></div>`;
}
function timestampLabel(value) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}
async function downloadBackup(state, suffix = '') {
  const backup = makeBackup(state);
  const time = new Date();
  const stamp = [time.getHours(), time.getMinutes(), time.getSeconds()].map(value => String(value).padStart(2, '0')).join('');
  return exportBackupFile(JSON.stringify(backup, null, 2), `zhic-life-${localDate(time)}-${stamp}${suffix}.json`);
}

export function renderSettings(ctx) {
  const { state, esc, button } = ctx;
  return `<section class="panel"><div class="section-head"><h2>个人偏好</h2>${button('修改偏好', 'settings-preferences', '', 'small')}</div><div class="metric-grid"><div class="metric"><small>日期格式</small><p>${esc(dateFormats[state.settings.dateFormat])}</p></div><div class="metric"><small>每周起始日</small><p>${weekStarts[state.settings.weekStartsOn]}</p></div><div class="metric"><small>重量与饮水单位</small><p>${esc(weightUnits[state.settings.weightUnit])} · ${esc(waterUnits[state.settings.waterUnit])}</p></div></div><p class="muted small">更改单位会换算显示，历史记录的实际重量和饮水量保持不变。</p></section>
    <section class="panel"><div class="section-head"><h2>本机数据</h2><span class="badge teal">仅保存在本地</span></div><p class="log-body">数据保存在当前设备的应用或浏览器中。各设备独立保存；刷新、关闭或重新打开后，已保存的记录会保留。换设备时，请先导出备份，再在新设备导入。</p><p class="notice">卸载应用或清除网站数据会删除本地记录。请定期导出备份，将文件另存到妥善的位置。</p><p class="muted small">备份格式版本：${state.version}。完整备份包含所有模块、个人偏好和关联关系。</p><div class="section-divider"></div>${countsHtml(ctx, state)}<div class="toolbar">${button('导出完整备份', 'settings-export', '', 'primary')}</div></section>
    <section class="panel"><div class="section-head"><h2>从文件恢复</h2></div><p class="muted">先检查文件，再预览备份内容。确认后整体替换当前数据，恢复前会在本机保存一份安全备份。</p><div class="field"><label>选择备份文件<input id="backup-file" type="file" accept=".json,application/json" aria-label="选择备份文件"></label></div></section>
    <section class="panel"><div class="section-head"><h2>上次恢复前的安全备份</h2></div><p class="muted">恢复文件时，替换前的数据会保留为一份本地安全备份。可以预览、找回或导出这份数据；下一次恢复会用当前数据更新安全备份。</p><div class="toolbar">${button('预览安全备份', 'settings-preview-safety')}${button('导出安全备份', 'settings-export-safety')}</div></section>`;
}

export async function handleSettings(ctx, action) {
  if (action === 'settings-preferences') {
    const settings = ctx.state.settings;
    ctx.formDialog('修改偏好',
      preferenceSelect(ctx, '日期格式', 'dateFormat', dateFormats, settings.dateFormat)
      + preferenceSelect(ctx, '每周起始日', 'weekStartsOn', weekStarts, String(settings.weekStartsOn))
      + preferenceSelect(ctx, '重量单位', 'weightUnit', weightUnits, settings.weightUnit)
      + preferenceSelect(ctx, '饮水单位', 'waterUnit', waterUnits, settings.waterUnit)
      + calendarScaleControl(settings.calendarHoverScale),
      data => ctx.commit(state => setSettings(state, {
        dateFormat: data.get('dateFormat'), weekStartsOn: Number(data.get('weekStartsOn')),
        weightUnit: data.get('weightUnit'), waterUnit: data.get('waterUnit'),
        calendarHoverScale: Number(data.get('calendarHoverScale')),
      }), '个人偏好已保存'), '单位变化只换算显示，不改变已有记录的实际数量。');
    return true;
  }
  if (action === 'settings-export') {
    try { const result = await downloadBackup(ctx.state); ctx.toast(result === 'shared' ? '备份分享已完成，请确认文件已保存。' : '完整备份已生成，请保存文件。'); }
    catch (error) { ctx.toast(`导出失败：${error.message}`, true); }
    return true;
  }
  if (action === 'settings-preview-safety' || action === 'settings-export-safety') {
    try {
      const safety = await ctx.getSafety();
      if (!safety) { ctx.toast('尚无安全备份。首次恢复文件后会保留替换前的数据。'); return true; }
      validateState(safety.data);
      if (action === 'settings-export-safety') { await downloadBackup(safety.data, '-safety'); ctx.toast('安全备份已生成。'); return true; }
      ctx.formDialog('安全备份预览', `<p class="full">保存时间：${ctx.esc(timestampLabel(safety.savedAt))}</p>${countsHtml(ctx, safety.data)}`,
        () => ctx.replace(safety.data), '恢复安全备份会整体替换当前数据，同时把当前数据保存成新的安全备份。', '恢复安全备份');
    } catch (error) { ctx.toast(`无法读取安全备份：${error.message}`, true); }
    return true;
  }
  return false;
}

export async function handleSettingsChange(ctx, event) {
  if (event.target.id !== 'backup-file') return false;
  const input = event.target;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return true;
  try {
    const text = await file.text();
    const next = parseBackup(text);
    const exportedAt = JSON.parse(text).exportedAt;
    ctx.formDialog('备份内容预览', `<p class="full">备份生成时间：${ctx.esc(timestampLabel(exportedAt))}</p>${countsHtml(ctx, next)}`,
      () => ctx.replace(next), '确认后将整体替换当前所有记录和偏好，不合并数据。替换前会在本机保存当前数据的安全备份。', '确认替换恢复');
  } catch (error) { ctx.toast(`无法恢复此备份：${error.message}`, true); }
  return true;
}
