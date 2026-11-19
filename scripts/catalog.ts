import { readdir, readFile, writeFile } from 'node:fs/promises';
import { decodeDump, sha256 } from '../src/protocol.ts';
const root = new URL('../', import.meta.url), machines = [];
for (const manufacturer of (await readdir(new URL('machines/', root), { withFileTypes: true })).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const directory = new URL('machines/' + encodeURIComponent(manufacturer.name) + '/', root);
  for (const filename of (await readdir(directory)).filter(n => n.toLowerCase().endsWith('.syx')).sort()) {
    const description = filename.slice(0, -4) + '.png';
    await readFile(new URL(encodeURIComponent(description), directory));
    const raw = new Uint8Array(await readFile(new URL(encodeURIComponent(filename), directory))), { info, slot } = await decodeDump(raw);
    machines.push({ ...info, key: manufacturer.name + '/' + filename, manufacturer: manufacturer.name,
      fileVersion: filename.match(/(?:^|[-_.])v?(\d+\.\d+)(?=[-.]|$)/i)?.[1] ?? '',
      file: 'machines/' + encodeURIComponent(manufacturer.name) + '/' + encodeURIComponent(filename),
      image: 'machines/' + encodeURIComponent(manufacturer.name) + '/' + encodeURIComponent(description),
      fileHash: await sha256(raw), originalSlot: slot });
  }
}
await writeFile(new URL('catalog.json', root), JSON.stringify({ schema: 1, machines }, null, 2) + '\n');
console.log(machines.length + ' validated MDS machines with descriptions.');
