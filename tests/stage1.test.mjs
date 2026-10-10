import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, stateOf, saveRecord, nav, chromium, browserExecutable } from './browser-helpers.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('阶段1：七项导航、干净空状态、真实数据库刷新读取及离线资源',async()=>{
  const app=await setup();
  try {
    const {page,errors}=app;
    assert.deepEqual(await page.locator('nav a').allTextContents(),['⌂首页预览','◷今日计划','▣学习计划','⌘开发工作','↗健身计划','◒饮食计划','◇游戏娱乐','⚙数据与设置']);
    assert.equal((await stateOf(page)).memos.length,0);
    for(const name of ['首页预览','今日计划','开发工作','健身计划','饮食计划','游戏娱乐','数据与设置']) await nav(page,name);
    assert.equal(await page.locator('body').getByText(/咨询|客户|跟进/).count(),0);
    await saveRecord(page,'memos',{content:'持久化标记'});await page.reload();
    assert.equal((await stateOf(page)).memos[0].content,'持久化标记');
    assert.deepEqual(errors,[]);
  } finally {await app.close();}
});

test('阶段1：排队连续写入、失败不覆盖、事务恢复及安全备份',async()=>{
  const app=await setup();
  try {
    const result=await app.page.evaluate(async()=>{
      const {openDatabase,Repository,readSafety}=await import('/storage.mjs');const {upsert,createState}=await import('/domain.mjs');const db=await openDatabase();const repo=new Repository(db,createState());
      await Promise.all([repo.run(s=>upsert(s,'memos',{content:'一'})),repo.run(s=>upsert(s,'memos',{content:'二'}))]);
      const count=repo.state.memos.length;
      let failed=false;try{await repo.run(()=>{throw new Error('故障注入');});}catch{failed=true;}
      const intact=repo.state.memos.length===count;
      await repo.replace(createState());const safety=await readSafety(db);db.close();return {count,failed,intact,restored:repo.state.memos.length,safetyCount:safety.data.memos.length};
    });
    assert.deepEqual(result,{count:2,failed:true,intact:true,restored:0,safetyCount:2});
  } finally {await app.close();}
});

test('阶段1：同一浏览器磁盘配置关闭重开后仍保留数据',async()=>{
  const app=await setup(); const profile=await mkdtemp(path.join(os.tmpdir(),'zhic-browser-')); let context;
  try {
    const options={headless:true,executablePath:browserExecutable,args:['--no-sandbox']};
    context=await chromium.launchPersistentContext(profile,options);
    let page=await context.newPage();await page.goto(app.url);await page.locator('#save-status').filter({hasText:'已保存'}).waitFor();
    await saveRecord(page,'memos',{content:'浏览器关闭后磁盘记录'});await context.close();
    context=await chromium.launchPersistentContext(profile,options);
    page=await context.newPage();await page.goto(app.url);await page.locator('#save-status').filter({hasText:'已保存'}).waitFor();
    assert.equal((await stateOf(page)).memos[0].content,'浏览器关闭后磁盘记录');
  } finally {if(context)await context.close();await app.close();await rm(profile,{recursive:true,force:true});}
});

test('阶段1：数据库不可用时界面明确失败，不显示已保存',async()=>{
  const app=await setup();
  try{
    await app.page.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{value:{open(){throw new Error('存储权限测试故障');}}});});
    await app.page.reload();await app.page.locator('#save-status').filter({hasText:'读取失败'}).waitFor();
    assert.match(await app.page.locator('#toast').textContent(),/存储权限测试故障/);
  }finally{await app.close();}
});

test('阶段1：两个窗口同时写入不会覆盖彼此的记录',async()=>{
  const app=await setup();try{
    const other=await app.context.newPage();await other.goto(app.url);await other.locator('#save-status').filter({hasText:'已保存'}).waitFor();
    const write=async(page,prefix)=>page.evaluate(async prefix=>{
      const {openDatabase,Repository,loadState}=await import('/storage.mjs');const {upsert}=await import('/domain.mjs');const db=await openDatabase();const repo=new Repository(db,await loadState(db));
      await Promise.all(Array.from({length:5},(_,i)=>repo.run(s=>upsert(s,'memos',{content:prefix+i}))));db.close();
    },prefix);
    await Promise.all([write(app.page,'窗口A'),write(other,'窗口B')]);const data=await stateOf(app.page);
    assert.equal(data.memos.length,10);assert.equal(new Set(data.memos.map(m=>m.content)).size,10);
  }finally{await app.close();}
});
