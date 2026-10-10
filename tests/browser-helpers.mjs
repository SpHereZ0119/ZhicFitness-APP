import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from '../server.mjs';

const require = createRequire(import.meta.url);
const testTemp = path.resolve('.test-tmp');
mkdirSync(testTemp,{recursive:true});
process.env.TEMP = testTemp; process.env.TMP = testTemp;
let playwright;
try { playwright = require('playwright'); }
catch {
  const modulePath = process.env.PLAYWRIGHT_MODULE_PATH || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  if (!existsSync(modulePath)) throw new Error('缺少 Playwright。请安装本地测试依赖：npm install --save-dev playwright，然后安装 Chromium。');
  playwright = require(modulePath);
}
export async function setup() {
  const server = createServer();
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.BROWSER_PATH || (process.platform==='win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : undefined);
  const browser = await playwright.chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});
  const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(url); await page.locator('#save-status').filter({hasText:'已保存'}).waitFor();
  return {server,url,browser,context,page,errors,close:async()=>{await browser.close(); await new Promise(resolve=>server.close(resolve));}};
}
export const pwExpect = playwright.expect;
export const chromium = playwright.chromium;
export const browserExecutable = process.env.BROWSER_PATH || (process.platform==='win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : undefined);
export async function stateOf(page) {return page.evaluate(async()=>{const {openDatabase,loadState}=await import('/storage.mjs');const db=await openDatabase();try{return await loadState(db);}finally{db.close();}});}
export async function saveRecord(page, collection, values, id) {
  return page.evaluate(async ({collection,values,id})=>{
    const {openDatabase,loadState,saveState}=await import('/storage.mjs');const {upsert}=await import('/domain.mjs');const db=await openDatabase();
    try{const next=upsert(await loadState(db),collection,values,id);await saveState(db,next);return next[collection].at(-1).id;}finally{db.close();}
  },{collection,values,id});
}
export async function submit(page,label='保存') { await page.getByRole('dialog').getByRole('button',{name:label,exact:true}).click(); await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('#save-status').filter({hasText:'已保存'}).waitFor(); }
export async function nav(page,name) {await page.getByRole('navigation').getByRole('link',{name,exact:true}).click();}
