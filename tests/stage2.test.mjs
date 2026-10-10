import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, submit, nav } from './browser-helpers.mjs';

test('阶段2：首页备忘增改删、计划步骤、完成进度和改期',async()=>{
 const app=await setup();try{
  const p=app.page;
  await p.getByRole('button',{name:'新增备忘',exact:true}).click();await p.getByLabel('备忘内容').fill('第一条想法');await submit(p);
  await p.locator('.row').filter({hasText:'第一条想法'}).getByRole('button',{name:'编辑',exact:true}).click();await p.getByLabel('备忘内容').fill('修改后的想法');await submit(p);
  assert.match(await p.locator('#page-body').textContent(),/修改后的想法/);
  await p.getByRole('button',{name:'＋ 新增计划',exact:true}).click();
  await p.getByLabel('计划名称').fill('学习离线开发');await p.getByLabel('开始时间').fill('09:00');await p.getByLabel('小步骤').fill('阅读资料\n整理笔记');await submit(p);
  await p.getByLabel('完成计划：学习离线开发').check();await p.locator('#save-status').filter({hasText:'已保存'}).waitFor();
  assert.equal(await p.getByTestId('today-progress').textContent(),'1 / 1');
  await p.getByLabel('阅读资料',{exact:true}).check();await p.locator('#save-status').filter({hasText:'已保存'}).waitFor();
  await p.getByRole('button',{name:'编辑 / 改期',exact:true}).click();await p.getByLabel('日期',{exact:true}).fill('2026-12-31');await submit(p);
  await nav(p,'今日计划');await p.getByLabel('查看日期').fill('2026-12-31');
  await p.getByLabel('完成计划：学习离线开发').waitFor();
  const state=await stateOf(p);assert.equal(state.plans[0].steps.length,2);assert.equal(state.plans[0].steps[0].done,true);assert.equal(state.plans[0].date,'2026-12-31');assert.equal(state.sessions.length+state.devLogs.length+state.foods.length+state.plays.length,0);
  await p.reload();await p.locator('#save-status').filter({hasText:'已保存'}).waitFor();assert.equal((await stateOf(p)).plans[0].status,'done');
  await nav(p,'首页预览');await p.locator('.row').filter({hasText:'修改后的想法'}).getByRole('button',{name:'删除',exact:true}).click();await submit(p,'确认删除');assert.equal((await stateOf(p)).memos.length,0);
  assert.deepEqual(app.errors,[]);
 }finally{await app.close();}
});

test('阶段2：取消校验失败的输入后仍可正常新增，键盘焦点保留',async()=>{
 const app=await setup();try{
  const p=app.page;await p.getByRole('button',{name:'新增备忘',exact:true}).click();await p.getByLabel('备忘内容').fill('   ');
  await p.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();await p.locator('#save-status').filter({hasText:'保存失败'}).waitFor();assert.match(await p.getByRole('dialog').locator('.form-error').textContent(),/不能为空/);
  await p.getByRole('button',{name:'取消',exact:true}).click();await p.getByRole('button',{name:'新增备忘',exact:true}).click();await p.getByLabel('备忘内容').fill('正常备忘');await submit(p);assert.equal((await stateOf(p)).memos[0].content,'正常备忘');
  await nav(p,'今日计划');await p.getByRole('button',{name:'新增计划',exact:true}).first().click();await p.getByLabel('计划名称').fill('键盘计划');await submit(p);
  await p.getByLabel('完成计划：键盘计划').focus();await p.keyboard.press('Space');await p.locator('#save-status').filter({hasText:'已保存'}).waitFor();
  assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('aria-label')),'完成计划：键盘计划');assert.equal((await stateOf(p)).plans[0].status,'done');
 }finally{await app.close();}
});

test('阶段2：失败操作不能被另一条成功写入掩盖',async()=>{
 const app=await setup();try{
  const p=app.page;await nav(p,'今日计划');
  for(const title of ['第一项','第二项']){await p.getByRole('button',{name:'新增计划',exact:true}).first().click();await p.getByLabel('计划名称').fill(title);await submit(p);}
  await p.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new Error('写入失败');};window.restorePut=()=>IDBObjectStore.prototype.put=original;});
  await p.getByLabel('完成计划：第一项').click();await p.locator('#save-status').filter({hasText:'保存失败'}).waitFor();assert.equal(await p.getByLabel('完成计划：第一项').isChecked(),false);await p.evaluate(()=>window.restorePut());
  await p.getByLabel('完成计划：第二项').click();await p.locator('#save-status').filter({hasText:'保存失败'}).waitFor();
  assert.equal(await p.getByLabel('完成计划：第二项').isChecked(),false);
  assert.deepEqual((await stateOf(p)).plans.map(v=>v.status),['pending','pending']);
  await p.getByRole('button',{name:'重试保存',exact:true}).click();await p.locator('#save-status').filter({hasText:'已保存'}).waitFor();
  assert.deepEqual((await stateOf(p)).plans.map(v=>v.status),['done','pending']);
 }finally{await app.close();}
});

test('阶段2：旧弹窗异步保存不会关闭新弹窗或丢失新输入',async()=>{
 const app=await setup();try{
  const p=app.page;
  await p.evaluate(()=>{const original=navigator.locks.request.bind(navigator.locks);navigator.locks.request=(name,cb)=>original(name,async()=>{await new Promise(resolve=>setTimeout(resolve,400));return cb();});});
  await p.getByRole('button',{name:'新增备忘',exact:true}).click();await p.getByLabel('备忘内容').fill('保存中的第一笔');await p.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
  await p.getByRole('button',{name:'关闭',exact:true}).click();await p.getByRole('button',{name:'新增备忘',exact:true}).click();await p.getByLabel('备忘内容').fill('还未提交的第二笔');
  await p.locator('#save-status').filter({hasText:'已保存'}).waitFor();
  assert.equal(await p.getByLabel('备忘内容').inputValue(),'还未提交的第二笔');assert.equal((await stateOf(p)).memos[0].content,'保存中的第一笔');
  await submit(p);assert.equal((await stateOf(p)).memos.length,2);
 }finally{await app.close();}
});

test('阶段2：计划按时间排序、无时间末尾、保存失败后保留输入可重试',async()=>{
 const app=await setup();try{
  const p=app.page;await nav(p,'今日计划');
  for(const [title,time]of[['晚间','20:00'],['随时',''],['上午','08:00']]){
   await p.getByRole('button',{name:'新增计划',exact:true}).first().click();await p.getByLabel('计划名称').fill(title);if(time)await p.getByLabel('开始时间').fill(time);await submit(p);
  }
  assert.deepEqual(await p.locator('.row-title').allTextContents(),['上午','晚间','随时']);
  await p.getByRole('button',{name:'新增计划',exact:true}).first().click();await p.getByLabel('计划名称').fill('失败保留');
  await p.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('注入保存失败','QuotaExceededError');};window.restorePut=()=>IDBObjectStore.prototype.put=original;});
  await p.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();await p.locator('#save-status').filter({hasText:'保存失败'}).waitFor();
  assert.equal(await p.getByLabel('计划名称').inputValue(),'失败保留');assert.equal((await stateOf(p)).plans.length,3);
  await p.evaluate(()=>window.restorePut());await submit(p);assert.equal((await stateOf(p)).plans.length,4);
 }finally{await app.close();}
});

test('阶段2：备份数据中的特殊标识只能成为数据，不能插入页面元素',async()=>{
 const app=await setup();try{
  const p=app.page;
  const ids=await p.evaluate(async()=>{
   const {openDatabase,saveState}=await import('/storage.mjs');const {createState,upsert}=await import('/domain.mjs');
   let s=upsert(createState(),'memos',{content:'安全备忘'});s=upsert(s,'plans',{title:'安全计划',steps:[{title:'安全步骤',done:false}]});
   const suffix='\"><div id="injected">伪造</div><input value="';s.memos[0].id='memo'+suffix;s.plans[0].id='plan'+suffix;s.plans[0].steps[0].id='step'+suffix;
   const db=await openDatabase();await saveState(db,s);db.close();return s.plans[0].id;
  });
  await p.reload();await p.locator('#save-status').filter({hasText:'已保存'}).waitFor();assert.equal(await p.locator('#injected').count(),0);
  await p.getByLabel('完成计划：安全计划').check();await p.locator('#save-status').filter({hasText:'已保存'}).waitFor();
  assert.equal((await stateOf(p)).plans[0].id,ids);assert.equal((await stateOf(p)).plans[0].status,'done');assert.deepEqual(app.errors,[]);
 }finally{await app.close();}
});
