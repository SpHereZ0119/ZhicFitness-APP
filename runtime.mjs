export function enableOffline() {
  if (!('serviceWorker' in navigator) || !['http:', 'https:'].includes(location.protocol) || window.Capacitor?.isNativePlatform?.()) return;
  navigator.serviceWorker.register(new URL('./sw.js', import.meta.url)).catch(error => console.warn('离线缓存暂不可用：', error.message));
}
