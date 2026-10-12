import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, saveRecord } from './browser-helpers.mjs';
import { localDate } from '../domain.mjs';

test('首页训练摘要遵守具体日期，同时保留每周训练安排', async () => {
  const app = await setup();
  try {
    const p = app.page;
    const now = new Date();
    const past = new Date(now);past.setDate(past.getDate()-7);
    await saveRecord(p,'routines',{name:'今天专属训练',date:localDate(now),weekday:(now.getDay()+1)%7});
    await saveRecord(p,'routines',{name:'过去专属训练',date:localDate(past),weekday:now.getDay()});
    await saveRecord(p,'routines',{name:'每周固定训练',weekday:now.getDay()});
    await p.reload();
    await p.locator('#save-status').filter({hasText:'已保存'}).waitFor();
    const summary=await p.locator('.module-grid .panel').filter({has:p.getByRole('heading',{name:'健身计划',exact:true})}).locator('.summary-text').textContent();
    assert.match(summary,/今天专属训练/);
    assert.match(summary,/每周固定训练/);
    assert.doesNotMatch(summary,/过去专属训练/);
    assert.deepEqual(app.errors,[]);
  } finally { await app.close(); }
});
