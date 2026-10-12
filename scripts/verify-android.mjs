import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { nav, submit } from '../tests/browser-helpers.mjs';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {_android}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const device=(await _android.devices()).find(item=>item.serial().startsWith('emulator-'));
if(!device) throw new Error('请先启动用于验收的 Android 模拟器并安装 APK。');
const adbPath=path.join(process.env.ANDROID_HOME || 'C:/Android/Sdk','platform-tools',process.platform==='win32'?'adb.exe':'adb');
const adb=(...args)=>execFileSync(adbPath,['-s',device.serial(),...args],{encoding:'utf8',windowsHide:true});
async function connect(){
  const view=await device.webView({pkg:'com.zhic.personal'});
  const p=await view.page();
  const browser={close:()=>device.close()};
  await p.locator('#save-status').filter({hasText:'已保存'}).waitFor();
  return {browser,p};
}
let {browser,p}=await connect();
const errors=[];p.on('pageerror',error=>errors.push(error.message));
try{
  assert.equal(await p.evaluate(()=>window.Capacitor.isNativePlatform()),true);
  for(const name of ['首页预览','今日计划','学习计划','开发工作','健身计划','饮食计划','游戏娱乐','数据与设置']){
    await nav(p,name);await p.waitForTimeout(350);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name} Android 横向溢出`);
  }
  await nav(p,'首页预览');
  await p.getByRole('button',{name:'＋ 记一笔',exact:true}).click();
  await p.getByLabel('备忘内容',{exact:true}).fill('Android actual persistence');
  await submit(p);
  await p.getByRole('button',{name:'＋ 记一笔',exact:true}).click();
  await p.getByLabel('备忘内容',{exact:true}).fill('cancel by system back');
  adb('shell','input','keyevent','4');
  await p.waitForTimeout(400);
  if(await p.getByRole('dialog').isVisible()) adb('shell','input','keyevent','4');
  await p.getByRole('dialog').waitFor({state:'hidden'});
  await nav(p,'数据与设置');
  await p.getByRole('button',{name:'导出完整备份',exact:true}).click();
  await p.waitForTimeout(800);
  const activity=adb('shell','dumpsys','activity','activities');
  assert.match(activity,/ChooserActivity|IntentResolver/,'系统备份分享菜单必须出现');
  const files=adb('shell','run-as','com.zhic.personal','ls','cache').split(/\s+/).filter(name=>name.startsWith('zhic-life-')&&name.endsWith('.json'));
  assert.ok(files.length);
  const backup=JSON.parse(adb('shell','run-as','com.zhic.personal','cat',`cache/${files.at(-1)}`));
  assert.ok(backup.data.memos.some(memo=>memo.content==='Android actual persistence'));
  await mkdir('test-results',{recursive:true});
  adb('shell','screencap','-p','/sdcard/zhic-share.png');
  adb('pull','/sdcard/zhic-share.png','test-results/android-share.png');
  adb('shell','input','keyevent','4');
  await p.waitForTimeout(500);
  adb('shell','input','keyevent','4');
  await p.waitForFunction(()=>location.hash==='#home');
  assert.deepEqual(errors,[]);
  adb('shell','am','force-stop','com.zhic.personal');
  adb('shell','am','start','-n','com.zhic.personal/.MainActivity');
  await new Promise(resolve=>setTimeout(resolve,2500));
  ({browser,p}=await connect());
  assert.match(await p.locator('.memo-content').first().textContent(),/Android actual persistence/);
  await p.screenshot({path:'test-results/android-app.png'});
  const summary={modules:8,native:true,saveAndRestart:true,dialogBack:true,pageBack:true,backupFile:true,systemShare:true,errors};
  await writeFile('test-results/android-acceptance.json',JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary));
}finally{await browser.close().catch(()=>{});}
