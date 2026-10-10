import { upsert, localDate } from './domain.mjs';

let selectedGameId = null;
let statusFilter = 'all';
const statuses = { want: '想玩', playing: '正在玩', finished: '已通关', paused: '暂停' };
export function openGame(id) { selectedGameId = id || null; }

export function renderGaming(ctx) {
  const { state, esc, button, empty, fmt, dateLabel } = ctx;
  const game = state.games.find(record => record.id === selectedGameId);
  const attr = id => `data-id="${esc(id)}"`;
  if (!game) {
    selectedGameId = null;
    const visible = state.games.filter(record => statusFilter === 'all' || record.status === statusFilter)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return `<div class="toolbar"><p class="muted">整理自己的游戏，记录进度和实际游玩时间。</p><span class="spacer"></span>${button('添加游戏', 'game-edit', '', 'primary')}</div><div class="tabs" aria-label="按游戏状态筛选">${Object.entries({ all: '全部', ...statuses }).map(([key, label]) => button(label, 'game-filter', `data-status="${key}" aria-pressed="${statusFilter === key}"`, statusFilter === key ? 'active' : '')).join('')}</div>
      <section class="panel"><div class="section-head"><h2>我的游戏库</h2><span class="muted small">${visible.length} / ${state.games.length} 个游戏</span></div>${visible.length
        ? `<div class="list">${visible.map(record => {
          const records = state.plays.filter(play => play.gameId === record.id);
          const minutes = records.reduce((total, play) => total + play.minutes, 0);
          return `<article class="row" data-game-id="${esc(record.id)}"><div class="row-main"><strong class="row-title">${esc(record.name)}</strong><div class="row-meta"><span class="badge ${record.status === 'playing' ? 'teal' : ''}">${statuses[record.status]}</span><span>${fmt(minutes)} 分钟 · ${records.length} 次游玩记录</span></div>${record.progress ? `<p class="log-body muted">${esc(record.progress)}</p>` : ''}</div><div class="actions">${button('打开游戏', 'game-open', attr(record.id), 'small')}${button('记录游玩', 'game-play', `data-game-id="${esc(record.id)}"`, 'small')}${button('编辑游戏', 'game-edit', attr(record.id), 'ghost small')}${button('删除游戏', 'game-delete', attr(record.id), 'ghost small')}</div></article>`;
        }).join('')}</div>`
        : empty(state.games.length ? '这个状态下还没有游戏。可以切换其他状态查看。' : '先添加一个想玩或正在玩的游戏。', '添加游戏', 'game-edit')}</section>`;
  }
  const plays = state.plays.filter(record => record.gameId === game.id).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const total = Number(plays.reduce((sum, record) => sum + record.minutes, 0).toFixed(8));
  const plans = state.plans.filter(plan => plan.link?.type === 'game' && plan.link.id === game.id);
  return `<div class="toolbar">${button('← 返回游戏库', 'game-back', '', 'ghost')}<span class="spacer"></span>${button('编辑游戏', 'game-edit', attr(game.id))}${button('删除游戏', 'game-delete', attr(game.id), 'ghost')}</div>
    <section class="panel" data-game-detail="${esc(game.id)}"><div class="section-head"><h2>${esc(game.name)}</h2><span class="badge ${game.status === 'playing' ? 'teal' : ''}">${statuses[game.status]}</span></div><p class="log-body">${esc(game.progress || '还没有进度描述，可以记下当前章节或接下来想做的事。')}</p><div class="row-meta">${plans.map(plan => `<span>计划 ${esc(dateLabel(plan.date))} · ${plan.status === 'done' ? '已完成' : '待完成'}</span>`).join('')}</div><div class="section-divider"></div><div class="toolbar">${button('安排到计划', 'game-plan', attr(game.id))}<span class="spacer"></span><strong data-testid="game-total-minutes">${fmt(total)} 分钟</strong><span class="muted small" data-testid="game-play-count">${plays.length} 条实际游玩记录</span></div></section>
    <section class="panel"><div class="section-head"><h2>游玩历史</h2>${button('记录游玩', 'game-play', `data-game-id="${esc(game.id)}"`, 'small')}</div>${plays.length
      ? `<div class="list">${plays.map(record => `<article class="row" data-play-id="${esc(record.id)}"><div class="row-main"><strong class="row-title">${esc(dateLabel(record.date))}</strong><div class="row-meta">${fmt(record.minutes)} 分钟</div></div><div class="actions">${button('编辑游玩记录', 'game-play', attr(record.id), 'ghost small')}${button('删除游玩记录', 'game-delete-play', attr(record.id), 'ghost small')}</div></article>`).join('')}</div>`
      : empty('尚无实际游玩记录。玩过之后，手动记下日期和分钟数。', '记录游玩', 'game-play', `data-game-id="${esc(game.id)}"`)}</section>`;
}

export async function handleGaming(ctx, action, target) {
  const { id, gameId, status } = target.dataset;
  if (action === 'game-filter') { statusFilter = status; selectedGameId = null; ctx.render(); return true; }
  if (action === 'game-back') { openGame(null); ctx.render(); return true; }
  if (action === 'game-open') { openGame(id); ctx.render(); return true; }
  if (action === 'game-edit' || action === 'game') {
    const game = ctx.state.games.find(record => record.id === id);
    ctx.formDialog(game ? '编辑游戏' : '添加游戏',
      ctx.field('游戏名称', 'name', game?.name, 'text', 'required maxlength="300"')
      + ctx.selectField('游戏状态', 'status', statuses, game?.status || 'want')
      + ctx.field('进度描述（可选）', 'progress', game?.progress, 'textarea', 'maxlength="10000"'),
      async data => {
        const name = data.get('name').trim();
        if (!name) throw new Error('请填写游戏名称。');
        const saved = await ctx.commit(state => upsert(state, 'games', { name, status: data.get('status'), progress: data.get('progress').trim() }, id), '游戏已保存');
        if (saved && !id) { openGame(ctx.state.games.at(-1).id); ctx.render(); }
        return saved;
      });
    return true;
  }
  if (action === 'game-play') {
    const record = ctx.state.plays.find(item => item.id === id);
    const sourceId = record?.gameId || gameId || selectedGameId;
    const game = ctx.state.games.find(item => item.id === sourceId);
    ctx.formDialog(record ? '编辑游玩记录' : '记录游玩',
      ctx.field('游玩日期', 'date', record?.date || localDate(), 'date', 'required')
      + ctx.field('实际游玩时长（分钟）', 'minutes', record?.minutes ?? '', 'number', 'required min="0.1" step="any"'),
      data => {
        const minutes = Number(data.get('minutes'));
        if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('游玩分钟数必须大于零。');
        return ctx.commit(state => upsert(state, 'plays', { gameId: sourceId, date: data.get('date'), minutes }, id), '游玩记录已保存');
      }, `${game?.name || '当前游戏'} · 填写实际游玩时长，不自动计时。`);
    return true;
  }
  if (action === 'game-plan') { ctx.planDialog(undefined, { type: 'game', id }); return true; }
  if (action === 'game-delete') { ctx.deleteDialog('games', id); return true; }
  if (action === 'game-delete-play') { ctx.deleteDialog('plays', id); return true; }
  return false;
}
