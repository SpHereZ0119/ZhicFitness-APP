# 多端运行

三端共用 `www` 中的同一套 HTML、CSS、ES Module 和 IndexedDB 业务代码。三端默认各自离线保存，跨设备使用“数据与设置”里的完整 JSON 备份导出和恢复迁移。

## Windows

运行 `npm run desktop:build`，生成 `release/ZHIC-工作台-1.1.0-x64.exe`。这是便携版，复制到桌面后双击即可运行，不依赖 Codex、Node.js 或本地服务窗口。运行数据保存在 Electron 的本机应用数据目录中。

默认交付独立便携版 EXE，电脑重启后可直接双击。NSIS 安装器脚本暂未作为交付物。

## Android

首次准备：安装 Android Studio、JDK 21、Android SDK API 36 和 Build Tools 35 或更新版本。然后运行：

```text
npm run android:build
```

APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。在手机上安装后，应用不依赖电脑服务器；教学视频链接由系统浏览器打开。

## iPhone

仓库 Pages 已启用 GitHub Actions，仅从默认 `main` 分支发布。`master` 保存开发记录，发布时先运行测试，再将提交快进到 `main`。请打开：

```text
https://spherez0119.github.io/ZhicFitness-APP/
```

在 Safari 中打开，点击分享按钮，选择“添加到主屏幕”。首次打开会缓存应用资源；之后核心功能可以离线使用。由于没有 Mac，这个方案不需要 Xcode 或苹果签名，也不产生 App Store 原生安装包。

## 验证

`tests/multiplatform.test.mjs` 检查子目录部署、320/390/430/900/1440px、断网刷新和 JSON 备份；`tests/mobile-acceptance.test.mjs` 用八模块实际记录验证手机布局、长按操作、图片解码、导出导入和刷新；`tests/desktop.test.mjs` 启动实际 Electron 程序，验证保存、导出和关闭重开；`tests/native-adapter.test.mjs` 验证手机备份失败与返回键处理。

可设置 `ZHIC_BROWSER_ENGINE=webkit` 单独运行手机验收测试，覆盖 Safari 内核。Android APK 已完成实际构建与签名校验，并在 Android 16 模拟器验收保存、关闭重开、返回键、完整备份和系统分享菜单。启动模拟器并安装 APK 后运行 `npm run test:android` 可重跑原生验收。

没有连接真实手机，本次验收未覆盖 iPhone/Android 真机安装。iPhone 通过主屏幕离线网页使用，首次联网加载完成再关闭网络；外部教学视频仍需网络。旧网页和新 Windows 程序属于独立数据空间，迁移前请在旧版导出 JSON，再在新程序导入。三个端之间通过备份迁移，不自动同步。
