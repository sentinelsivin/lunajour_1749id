// Сборка для выкладки: node build.mjs, затем загрузи папку dist на хостинг.
import { cp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = join(root, 'dist');
const files = ['index.html', 'style.css', 'manifest.webmanifest', 'sw.js', 'icons', 'js', 'fonts', 'templates'];

await rm(dist, { recursive: true, force: true });
await mkdir(dist);
for (const name of files) await cp(join(root, name), join(dist, name), { recursive: true });
console.log('Готово: папка dist');
