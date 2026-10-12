import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build as bundle } from 'esbuild';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const webFiles = ['index.html', 'styles.css', 'app.mjs', 'domain.mjs', 'storage.mjs', 'learning.mjs', 'development.mjs', 'fitness.mjs', 'diet.mjs', 'gaming.mjs', 'settings.mjs', 'runtime.mjs', 'manifest.webmanifest', 'icons/icon.svg'];

// Generate deterministic PNG icons without a runtime image or font dependency.
function png(size) {
  const crc = data => { let value = 0xffffffff; for (const byte of data) { value ^= byte; for (let j = 0; j < 8; j++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const label = Buffer.from(type); const buf = Buffer.alloc(data.length + 12); buf.writeUInt32BE(data.length); label.copy(buf, 4); data.copy(buf, 8); buf.writeUInt32BE(crc(Buffer.concat([label, data])), data.length + 8); return buf; };
  const rows = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = x / size, b = y / size;
    const mark = a >= .3 && a <= .7 && ((b >= .32 && b <= .4) || (b >= .6 && b <= .68) || (b >= .4 && b <= .6 && Math.abs(a + b - 1) < .06));
    const pos = y * (size * 3 + 1) + 1 + x * 3;
    rows.set(mark ? [255, 255, 255] : [36, 123, 112], pos);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

export async function buildWeb() {
  const dest = path.join(root, 'www');
  await mkdir(path.join(dest, 'icons'), { recursive: true });
  const hash = createHash('sha256');
  for (const name of webFiles) { const data = await readFile(path.join(root, name)); hash.update(data); await copyFile(path.join(root, name), path.join(dest, name)); }
  await bundle({ entryPoints: [path.join(root, 'native.mjs')], outfile: path.join(dest, 'native.mjs'), bundle: true, format: 'esm', target: 'es2020', minify: true });
  hash.update(await readFile(path.join(dest, 'native.mjs')));
  for (const size of [192, 512]) await writeFile(path.join(dest, `icons/icon-${size}.png`), png(size));
  const worker = await readFile(path.join(root, 'sw.js'), 'utf8');
  hash.update(worker);
  const build = hash.digest('hex').slice(0, 16);
  await writeFile(path.join(dest, 'sw.js'), worker.replace('__BUILD_ID__', build));
  console.log(`离线应用已生成：www（${build}）`);
  return dest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildWeb();
