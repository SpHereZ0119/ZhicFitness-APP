import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createState, upsert, makeBackup, localDate } from '../domain.mjs';
import { buildWeb } from '../scripts/build-web.mjs';
import { chromium, webkit, browserExecutable, nav, submit } from './browser-helpers.mjs';

test('手机带完整记录验收：八模块、训练长按操作、表单、餐食图片、备份恢复和无障碍动效', async () => {
  const dir = await buildWeb();
  const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer(async (req,res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    try { res.setHeader('Content-Type',types[path.extname(name)] || 'text/plain'); res.end(await readFile(path.join(dir,name))); }
    catch {res.writeHead(404);res.end();}
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = process.env.ZHIC_BROWSER_ENGINE === 'webkit' ? await webkit.launch({headless:true}) : await chromium.launch({headless:true,executablePath:browserExecutable});
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
  try {
  let state = createState();
  const add = (collection,values) => {state=upsert(state,collection,values);return state[collection].at(-1);};
  const date=localDate();
  add('memos',{content:'手机完整记录验收'});
  add('plans',{title:'手机计划',date});
  const topic=add('studyTopics',{name:'学习验收',goal:'验证手机阅读和记录'});
  add('studyEntries',{topicId:topic.id,title:'课程阅读',date,plannedMinutes:30});
  const project=add('projects',{name:'手机项目'});
  add('workItems',{projectId:project.id,title:'手机工作项'});
  const exercise=add('exercises',{name:'杠铃深蹲',notes:'背部保持稳定，按个人能力选择负重。',videoUrl:'https://example.com/tutorial'});
  add('routines',{name:'当天力量训练',date,exerciseIds:[exercise.id]});
  add('sessions',{date,name:'实际训练验收',entries:[{exerciseId:exercise.id,sets:[{reps:8,weightKg:20}]}]});
  add('mealPlans',{date,meal:'breakfast',title:'早餐计划'});
  const png=await readFile(path.join(dir,'icons/icon-192.png'));
  add('foods',{date,meal:'breakfast',name:'早餐实物',portion:'一份',imageData:`data:image/png;base64,${png.toString('base64')}`});
  add('waters',{date,amountMl:500});
  const game=add('games',{name:'手机游戏'});
  add('plays',{gameId:game.id,date,minutes:20});
  const p=await context.newPage();
  const errors=[];p.on('pageerror',error=>errors.push(error.message));
    await p.goto(`http://127.0.0.1:${server.address().port}/`);
    await p.locator('#save-status').filter({hasText:'已保存'}).waitFor();
    await nav(p,'数据与设置');
    await p.getByLabel('选择备份文件').setInputFiles({name:'mobile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(makeBackup(state)))});
    await submit(p,'确认替换恢复');
    for(const width of [320,390,430]) {
      await p.setViewportSize({width,height:844});
      for(const name of ['首页预览','今日计划','学习计划','开发工作','健身计划','饮食计划','游戏娱乐','数据与设置']) {
        await nav(p,name);await p.waitForTimeout(250);
        const overflow = await p.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > innerWidth+1).slice(0,12).map(node => ({tag:node.tagName,cls:String(node.className),right:node.getBoundingClientRect().right}))}));
        assert.ok(overflow.scroll<=overflow.width,`${width}px ${name} 有记录时横向溢出：${JSON.stringify(overflow)}`);
      }
    }
    await p.setViewportSize({width:390,height:844});
    await nav(p,'健身计划');
    await p.getByRole('tab',{name:'动作库',exact:true}).click();
    const row=p.locator('.exercise-row').first();
    await row.scrollIntoViewIfNeeded();
    const box=await row.boundingBox();
    await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.waitForTimeout(380);
    await p.mouse.move(box.x+box.width/2-50,box.y+box.height/2);await p.mouse.up();
    assert.equal(await row.getAttribute('data-actions-revealed'),'true');
    const area=await row.locator('.exercise-swipe-actions').boundingBox();
    assert.ok(area.x>=0 && area.x+area.width<=390,'滑动操作区必须在手机屏幕内');
    await row.getByRole('button',{name:'编辑动作',exact:true}).click();
    await p.getByLabel('动作说明（可选）',{exact:true}).fill('手机修改并保存');
    const dialog=p.getByRole('dialog');
    assert.ok((await dialog.boundingBox()).width<=390,'手机表单不超出屏幕');
    await submit(p);
    await nav(p,'饮食计划');
    await p.locator('img.food-image').first().waitFor();
    assert.equal(await p.locator('img.food-image').first().evaluate(img=>img.complete&&img.naturalWidth>0),true,'餐食图片实际可解码显示');
    await p.locator('img.food-image').first().scrollIntoViewIfNeeded();
    await p.waitForTimeout(350);
    await mkdir('test-results',{recursive:true});
    await p.screenshot({path:'test-results/mobile-meals.png'});
    await p.emulateMedia({reducedMotion:'reduce'});
    await nav(p,'首页预览');
    await p.getByLabel('完成计划：手机计划').check();
    await p.waitForFunction(() => document.querySelector('[data-testid="today-progress-ring"]')?.getAttribute('aria-valuenow') === '1');
    assert.equal(await p.locator('[data-testid="today-progress-ring"]').getAttribute('aria-valuenow'),'1');
    await nav(p,'数据与设置');
    const downloading=p.waitForEvent('download');
    await p.getByRole('button',{name:'导出完整备份',exact:true}).click();
    const backup=JSON.parse(await readFile(await(await downloading).path(),'utf8'));
    assert.equal(backup.data.exercises[0].notes,'手机修改并保存');
    assert.equal(backup.data.foods[0].imageData,state.foods[0].imageData);
    await p.reload();await p.locator('#save-status').filter({hasText:'已保存'}).waitFor();
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});
