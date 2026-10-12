import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { buildWeb, root } from './build-web.mjs';

await buildWeb();
const env = { ...process.env };
if (!env.JAVA_HOME && process.platform === 'win32') {
  const folder = 'C:/Program Files/Microsoft';
  const jdk = existsSync(folder) && readdirSync(folder).find(name => name.startsWith('jdk-21.'));
  if (jdk) env.JAVA_HOME = path.join(folder, jdk);
}
if (!env.ANDROID_HOME && existsSync('C:/Android/Sdk')) env.ANDROID_HOME = 'C:/Android/Sdk';
async function run(executable, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`构建退出码：${code}`)));
  });
}
await run(process.execPath, [path.join(root, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android'], root);
await run(process.platform === 'win32' ? 'cmd.exe' : './gradlew', process.platform === 'win32' ? ['/d', '/s', '/c', 'gradlew.bat assembleDebug --no-daemon --console=plain'] : ['assembleDebug', '--no-daemon', '--console=plain'], path.join(root, 'android'));
