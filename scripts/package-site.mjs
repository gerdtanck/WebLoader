import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('catalog.json', root), 'utf8'));
const names = new Set(['catalog.json', 'icon.svg', ...catalog.machines.flatMap(m => [m.file, m.image])]);
for (const name of names) {
  const destination = new URL(`artifacts/site/${name}`, root);
  await mkdir(new URL('.', destination), { recursive: true });
  await copyFile(new URL(name, root), destination);
}
await writeFile(new URL('artifacts/site/.nojekyll', root), '');
console.log(`Static site: ${fileURLToPath(new URL('artifacts/site/', root))}`);
