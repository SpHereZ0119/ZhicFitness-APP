// Native I/O stays outside the shared business model and can be tested independently.
export function createNativeAdapter({ Filesystem, Share, Browser, App }) {
  return {
    async shareBackup(data, name) {
      const { uri } = await Filesystem.writeFile({ path: name, data, directory: 'CACHE', encoding: 'utf8' });
      await Share.share({ title: 'ZHIC 完整备份', files: [uri], dialogTitle: '保存或发送备份文件' });
    },
    async openVideo(url) {
      if (!/^https?:\/\//i.test(url)) throw new Error('请使用有效的网页视频地址。');
      await Browser.open({ url });
    },
    async listenBack(onBack) {
      return App.addListener('backButton', async () => {
        if (!onBack()) await App.minimizeApp();
      });
    },
  };
}
