# 多端运行

三端共用 `www` 中的同一套 HTML、CSS、ES Module 和 IndexedDB 业务代码。三端默认各自离线保存，跨设备使用“数据与设置”里的完整 JSON 备份导出和恢复迁移。

## Windows

运行 `npm run desktop:build`，生成 `release/ZHIC-工作台-1.1.0-x64.exe`。这是便携版，复制到桌面后双击即可运行，不依赖 Codex、Node.js 或本地服务窗口。运行数据保存在 Electron 的本机应用数据目录中。

`npm run desktop:installer` 会尝试生成 NSIS 安装器；Windows 中文路径可能导致旧版 NSIS 临时脚本失败，便携版是默认交付物。

## Android

首次准备：安装 Android Studio、JDK 21、Android SDK API 36 和 Build Tools 35 或更新版本。然后运行：

```text
npm run android:build
```

APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。在手机上安装后，应用不依赖电脑服务器；教学视频链接由系统浏览器打开。

## iPhone

仓库包含 GitHub Pages 工作流。启用仓库 Settings → Pages → Source: GitHub Actions，工作流完成后打开：

```text
https://spherez0119.github.io/ZhicFitness-APP/
```

在 Safari 中打开，点击分享按钮，选择“添加到主屏幕”。首次打开会缓存应用资源；之后核心功能可以离线使用。由于没有 Mac，这个方案不需要 Xcode 或苹果签名，也不产生 App Store 原生安装包。

## 验证

`tests/multiplatform.test.mjs` 会在子目录地址下检查 320px、390px、430px、900px 和 1440px 视口、断网刷新、本地写入和 JSON 备份。`tests/packaging-config.test.mjs` 检查桌面和 Android 配置是否继续指向同一份 `www`。

