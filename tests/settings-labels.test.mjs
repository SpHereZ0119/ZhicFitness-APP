import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, saveRecord, nav } from './browser-helpers.mjs';

test('完整备份统计明确标注动作组，不显示 undefined', async () => {
  const app=await setup();
  try{
    await saveRecord(app.page,'exerciseGroups',{name:'力量动作组'});
    await app.page.reload();
    await app.page.locator('#save-status').filter({hasText:'已保存'}).waitFor();
    await nav(app.page,'数据与设置');
    const row=app.page.locator('tr').filter({has:app.page.locator('[data-backup-count="exerciseGroups"]')});
    assert.match(await row.textContent(),/动作组/);
    assert.equal(await row.locator('[data-backup-count="exerciseGroups"]').textContent(),'1');
    assert.doesNotMatch(await app.page.locator('#page-body').textContent(),/undefined/);
  }finally{await app.close();}
});
