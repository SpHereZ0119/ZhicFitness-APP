import { upsert, nutritionSummary, waterTotal, fromMl, toMl, localDate } from './domain.mjs';

let selectedMealPlanId = null;
const meals = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };
const nutrientNames = { calories: '热量', protein: '蛋白质', carbs: '碳水', fat: '脂肪' };
export function openMealPlan(id) { selectedMealPlanId = id || null; }

function imageField(ctx, record) {
  return `<div class="field full"><label for="field-image">餐食图片（可选）</label><input id="field-image" name="image" type="file" accept="image/jpeg,image/png,image/webp">${record?.imageData ? `<div class="image-edit-preview"><img class="food-image" src="${ctx.esc(record.imageData)}" alt="当前餐食图片"><label class="inline"><input type="checkbox" name="removeImage">移除当前图片</label></div>` : '<p class="muted small">支持 JPEG、PNG 或 WebP，单张不超过 2 MB。</p>'}</div>`;
}

function readImage(file) {
  if (!file || !file.size) return Promise.resolve('');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('餐食图片必须是 JPEG、PNG 或 WebP 格式');
  if (file.size > 2 * 1024 * 1024) throw new Error('餐食图片不能超过 2 MB');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('餐食图片读取失败，请重新选择。'));
    reader.readAsDataURL(file);
  });
}

export function renderDiet(ctx) {
  const { state, selectedDate, esc, button, empty, dateLabel, fmt } = ctx;
  const summary = nutritionSummary(state, selectedDate);
  const foods = state.foods.filter(record => record.date === selectedDate);
  const waters = state.waters.filter(record => record.date === selectedDate);
  const unit = state.settings.waterUnit;
  const attr = id => `data-id="${esc(id)}"`;
  const foodNutrition = record => Object.keys(nutrientNames).map(key => `${nutrientNames[key]} ${record[key] === null ? '未填写' : `${fmt(record[key])} ${key === 'calories' ? 'kcal' : 'g'}`}`).join(' · ');
  return `<div class="toolbar">${button('今天', 'diet-today')}<label>查看日期 <input type="date" id="selected-date" aria-label="查看日期" value="${esc(selectedDate)}"></label><span class="spacer"></span>${button('记录饮水', 'diet-water')}${button('记录餐食', 'diet-food', '', 'primary')}</div>
    <section class="panel"><div class="section-head"><h2>${esc(dateLabel(selectedDate))} · 已记录值合计</h2><span class="muted small">仅统计实际记录</span></div><div class="stat-row">${Object.entries(nutrientNames).map(([key, label]) => `<div class="stat"><small>${label}</small><strong data-testid="nutrition-${key}">${fmt(summary[key])} <small>${key === 'calories' ? 'kcal' : 'g'}</small></strong></div>`).join('')}</div><p class="${summary.partial ? 'notice' : 'muted small'}" data-testid="nutrition-completeness">${summary.partial ? '部分营养值未填写，仅累计已填写的数值。这些合计不代表全天完整摄入量。' : foods.length ? '合计来自手动填写的实际饮食记录，计划餐食不计入；未记录的摄入量不会自动估算。' : '尚无实际饮食记录。计划餐食不会计入已记录值合计。'}</p></section>
    <div class="equal-columns">${Object.entries(meals).map(([meal, label]) => {
      const plans = state.mealPlans.filter(record => record.date === selectedDate && record.meal === meal);
      const actual = foods.filter(record => record.meal === meal);
      const mealAttr = `data-meal="${meal}"`;
      return `<section class="panel" data-meal="${meal}"><div class="section-head"><h2>${label}</h2><span class="muted small">安排与实际分开记录</span></div><div class="section-head"><h3>餐食安排</h3>${button('安排餐食', 'diet-meal-plan', mealAttr, 'small')}</div>${plans.length
        ? `<div class="list">${plans.map(record => `<article class="row" data-meal-plan-id="${esc(record.id)}" ${record.id === selectedMealPlanId ? 'data-selected-meal-plan="true"' : ''}><div class="row-main"><strong class="row-title">${esc(record.title)}</strong><div class="row-meta"><span class="badge">计划</span>${state.plans.filter(plan => plan.link?.type === 'mealPlan' && plan.link.id === record.id).map(plan => `<span>已安排 ${esc(dateLabel(plan.date))}</span>`).join('')}</div></div><div class="actions">${button('安排到计划', 'diet-plan', attr(record.id), 'small')}${button('编辑餐食安排', 'diet-meal-plan', attr(record.id), 'ghost small')}${button('删除餐食安排', 'diet-delete-meal-plan', attr(record.id), 'ghost small')}</div></article>`).join('')}</div>`
        : `<p class="muted small">还没有${label}安排。可以先记下想吃什么。</p>`}<div class="section-divider"></div><div class="section-head"><h3>实际饮食记录</h3>${button('记录餐食', 'diet-food', mealAttr, 'small')}</div>${actual.length
          ? `<div class="list">${actual.map(record => `<article class="row" data-food-id="${esc(record.id)}">${record.imageData ? `<img class="food-image" src="${esc(record.imageData)}" alt="${esc(record.name)}">` : ''}<div class="row-main"><strong class="row-title">${esc(record.name)}</strong><p class="muted small">${esc(record.portion)}</p><p class="row-meta">${esc(foodNutrition(record))}</p></div><div class="actions">${button('编辑饮食记录', 'diet-food', attr(record.id), 'ghost small')}${button('删除饮食记录', 'diet-delete-food', attr(record.id), 'ghost small')}</div></article>`).join('')}</div>`
        : `<p class="muted small">还没有实际${label}记录，记录后才会计入营养合计。</p>`}</section>`;
    }).join('')}</div>
    <section class="panel"><div class="section-head"><h2>饮水记录</h2>${button('记录饮水', 'diet-water', '', 'small')}</div><div class="toolbar"><strong data-testid="water-total">${fmt(fromMl(waterTotal(state, selectedDate), unit))} ${unit}</strong><span class="muted small">当天已记录饮水量</span></div>${waters.length
      ? `<div class="list">${waters.map(record => `<article class="row" data-water-id="${esc(record.id)}"><div class="row-main"><strong class="row-title">${fmt(fromMl(record.amountMl, unit))} ${unit}</strong><div class="row-meta">${esc(dateLabel(record.date))}</div></div><div class="actions">${button('编辑饮水记录', 'diet-water', attr(record.id), 'ghost small')}${button('删除饮水记录', 'diet-delete-water', attr(record.id), 'ghost small')}</div></article>`).join('')}</div>`
      : empty('每次喝水后，记下实际饮水量。', '记录饮水', 'diet-water')}</section>`;
}

export async function handleDiet(ctx, action, target) {
  const { id, meal } = target.dataset;
  if (action === 'diet-today') { ctx.setDate(localDate()); return true; }
  if (action === 'diet-meal-plan' || action === 'meal-plan') {
    const record = ctx.state.mealPlans.find(item => item.id === id);
    ctx.formDialog(record ? '编辑餐食安排' : '安排餐食',
      ctx.field('餐食日期', 'date', record?.date || (action === 'meal-plan' ? localDate() : ctx.selectedDate), 'date', 'required')
      + ctx.selectField('餐次', 'meal', ctx.mealNames || meals, record?.meal || meal || 'breakfast')
      + ctx.field('计划餐食', 'title', record?.title, 'text', 'required maxlength="1000"'),
      data => ctx.commit(state => upsert(state, 'mealPlans', { date: data.get('date'), meal: data.get('meal'), title: data.get('title').trim() }, id), '餐食安排已保存'),
      '这是餐食安排。只有另外新增实际饮食记录，才会计入已记录营养值合计。');
    return true;
  }
  if (action === 'diet-plan') { ctx.planDialog(undefined, { type: 'mealPlan', id }); return true; }
  if (action === 'diet-food' || action === 'food') {
    const record = ctx.state.foods.find(item => item.id === id);
    const numberField = (key, label) => ctx.field(label, key, record?.[key] ?? '', 'number', 'min="0" step="any"');
    ctx.formDialog(record ? '编辑实际饮食记录' : '记录实际餐食',
      ctx.field('记录日期', 'date', record?.date || (action === 'food' ? localDate() : ctx.selectedDate), 'date', 'required')
      + ctx.selectField('餐次', 'meal', ctx.mealNames || meals, record?.meal || meal || 'breakfast')
      + ctx.field('食物名称', 'name', record?.name, 'text', 'required maxlength="300"')
      + ctx.field('实际份量', 'portion', record?.portion, 'text', 'required maxlength="300" placeholder="例如：一碗 / 150 g"')
      + imageField(ctx, record)
      + numberField('calories', '热量（kcal，可选）') + numberField('protein', '蛋白质（g，可选）')
      + numberField('carbs', '碳水（g，可选）') + numberField('fat', '脂肪（g，可选）'),
      async data => {
        const image = await readImage(data.get('image'));
        const removeImage = data.get('removeImage') === 'on';
        return ctx.commit(state => upsert(state, 'foods', {
          date: data.get('date'), meal: data.get('meal'), name: data.get('name').trim(), portion: data.get('portion').trim(),
          imageData: removeImage ? '' : image || record?.imageData || '',
          ...Object.fromEntries(Object.keys(nutrientNames).map(key => [key, data.get(key).trim() === '' ? null : Number(data.get(key))])),
        }, id), '实际饮食记录已保存');
      }, '营养值可留空；按你填写的实际数值累计，不自动估算。');
    return true;
  }
  if (action === 'diet-water' || action === 'water') {
    const record = ctx.state.waters.find(item => item.id === id);
    const unit = ctx.state.settings.waterUnit;
    ctx.formDialog(record ? '编辑饮水记录' : '记录饮水',
      ctx.field('饮水日期', 'date', record?.date || (action === 'water' ? localDate() : ctx.selectedDate), 'date', 'required')
      + ctx.field(`实际饮水量（${unit}）`, 'amount', record ? Number(fromMl(record.amountMl, unit).toFixed(8)) : '', 'number', 'required min="0.00000001" step="any"'),
      data => ctx.commit(state => upsert(state, 'waters', { date: data.get('date'), amountMl: toMl(Number(data.get('amount')), unit) }, id), '饮水记录已保存'),
      '填写这次实际喝水的量。切换单位会换算显示，实际饮水量保持一致。');
    return true;
  }
  const deleteCollections = { 'diet-delete-meal-plan': 'mealPlans', 'diet-delete-food': 'foods', 'diet-delete-water': 'waters' };
  if (deleteCollections[action]) { ctx.deleteDialog(deleteCollections[action], id); return true; }
  return false;
}
