export function enableOffline() {
  if (!('serviceWorker' in navigator) || !['http:', 'https:'].includes(location.protocol) || window.Capacitor?.isNativePlatform?.()) return;
  navigator.serviceWorker.register(new URL('./sw.js', import.meta.url)).catch(error => console.warn('离线缓存暂不可用：', error.message));
}

const isNative = () => Boolean(window.Capacitor?.isNativePlatform?.());
let nativePromise;
const nativeAdapter = () => nativePromise ||= import('./native.mjs').then(module => module.native);

export async function enableNative({ onBack, toast }) {
  if (!isNative()) return;
  try {
    const native = await nativeAdapter();
    await native.listenBack(onBack);
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!link || !/^https?:\/\//i.test(link.href)) return;
      event.preventDefault();
      native.openVideo(link.href).catch(error => toast(`无法打开链接：${error.message}`, true));
    });
  } catch (error) { toast(`手机功能初始化失败：${error.message}`, true); }
}

export async function exportBackupFile(text, name) {
  if (isNative()) {
    await (await nativeAdapter()).shareBackup(text, name);
    return 'shared';
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
