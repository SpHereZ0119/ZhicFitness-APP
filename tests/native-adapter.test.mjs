import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeAdapter } from '../native-adapter.mjs';

test('手机备份先写完整 UTF-8 文件，再分享真实文件地址', async () => {
  const calls = [];
  const adapter = createNativeAdapter({
    Filesystem: { async writeFile(options) { calls.push(options); return { uri: 'file:///cache/backup.json' }; } },
    Share: { async share(options) { calls.push(options); } },
  });
  const data = JSON.stringify({ data: { memos: [{ content: '中文离线记录' }] } });
  await adapter.shareBackup(data, 'zhic-life-backup.json');
  assert.deepEqual(calls[0], { path: 'zhic-life-backup.json', data, directory: 'CACHE', encoding: 'utf8' });
  assert.deepEqual(calls[1].files, ['file:///cache/backup.json']);
  assert.equal(JSON.parse(calls[0].data).data.memos[0].content, '中文离线记录');
});

test('手机写入失败不能误报分享成功；只允许打开网页视频地址', async () => {
  let shared = false;
  const opened = [];
  const adapter = createNativeAdapter({
    Filesystem: { async writeFile() { throw new Error('存储空间不足'); } },
    Share: { async share() { shared = true; } },
    Browser: { async open(options) { opened.push(options.url); } },
  });
  await assert.rejects(adapter.shareBackup('{}', 'backup.json'), /存储空间不足/);
  assert.equal(shared, false);
  await assert.rejects(adapter.openVideo('javascript:alert(1)'), /地址/);
  await adapter.openVideo('https://www.bilibili.com/video/test');
  assert.deepEqual(opened, ['https://www.bilibili.com/video/test']);
});

test('手机返回键优先处理弹窗和页面，首页才退到后台', async () => {
  let callback, handled = true, minimized = 0;
  const adapter = createNativeAdapter({ App: {
    async addListener(name, listener) { assert.equal(name, 'backButton'); callback = listener; },
    async minimizeApp() { minimized++; },
  } });
  await adapter.listenBack(() => handled);
  await callback();
  assert.equal(minimized, 0);
  handled = false;
  await callback();
  assert.equal(minimized, 1);
});
