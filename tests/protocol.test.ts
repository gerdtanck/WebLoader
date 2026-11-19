import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { CMD, packet, encodePacket, decodePacket, encodeDump, decodeDump, splitSysex, concat, pack7, unpack7, inspectPackage, kitModels } from '../src/protocol.ts';
import { demoKit } from '../src/demo.ts';
const root = new URL('../', import.meta.url);
const sample = new Uint8Array(await readFile(new URL('machines/dbx/drone-0.5.syx', root)));
const decoded = await decodeDump(sample);

test('Documented capability request has exact reference bytes', () => {
  assert.equal(Buffer.from(encodePacket(packet(CMD.CAP_REQUEST, 1))).toString('hex'), 'f000203c020074010600017f7f00017f0009f7');
});
test('Packing covers every byte and partial mask', () => {
  for (let size = 1; size <= 256; size++) {
    const data = new Uint8Array(Array.from({ length: size }, (_, i) => i));
    assert.deepEqual(unpack7(pack7(data)), data);
  }
  assert.throws(() => unpack7(new Uint8Array([1, 0])), /Maske/);
});
test('All library packages match Python references and roundtrip byte exactly', async () => {
  const reference = JSON.parse(await readFile(new URL('tests/fixtures/catalog-reference.json', root), 'utf8')) as Record<string, { hash: string; contentId: string; words: number }>;
  let count = 0;
  for (const manufacturer of await readdir(new URL('machines/', root))) {
    const directory = new URL('machines/' + manufacturer + '/', root);
    for (const file of (await readdir(directory)).filter(n => n.endsWith('.syx'))) {
      const raw = new Uint8Array(await readFile(new URL(file, directory))), first = decodePacket(splitSysex(raw)[0]);
      const dump = await decodeDump(raw), ref = reference[manufacturer + '/' + file];
      assert.equal(dump.info.sha256, ref.hash); assert.equal(dump.info.contentId, ref.contentId); assert.equal(dump.info.programWords, ref.words);
      assert.deepEqual(concat(...(await encodeDump(dump.data, dump.slot, first.transaction)).map(encodePacket)), raw);
      count++;
    }
  }
  assert.equal(count, Object.keys(reference).length);
});
test('Retargeting preserves MDS bytes for U01, U16, U17 and U48', async () => {
  for (const slot of [1, 16, 17, 48]) {
    const raw = concat(...(await encodeDump(decoded.data, slot, 127)).map(encodePacket));
    const result = await decodeDump(raw); assert.equal(result.slot, slot); assert.deepEqual(result.data, decoded.data);
  }
});
test('Corrupt packet checksums and reserved bits are rejected', () => {
  const raw = encodePacket(packet(CMD.REQUEST, 1, 0)); raw[10] ^= 1;
  assert.throws(() => decodePacket(raw), /Prüfsumme/);
  const reserved = encodePacket(packet(CMD.REQUEST, 1, 0)); reserved[13] = 1;
  assert.throws(() => decodePacket(reserved), /Header/);
});
test('Missing end, reordered packets, mixed IDs and raw firmware are rejected', async () => {
  const frames = await encodeDump(decoded.data, 1, 1);
  await assert.rejects(decodeDump(concat(...frames.slice(0, -1).map(encodePacket))));
  const reordered = [...frames]; [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
  await assert.rejects(decodeDump(concat(...reordered.map(encodePacket))));
  const mixed = [...frames]; mixed[1] = { ...mixed[1], transaction: 2 };
  await assert.rejects(decodeDump(concat(...mixed.map(encodePacket))));
  await assert.rejects(inspectPackage(new Uint8Array(1024)), /MDS/);
});
test('Package CRC and content ID are both validated', async () => {
  const corrupt = decoded.data.slice(); corrupt[150] ^= 1; await assert.rejects(inspectPackage(corrupt), /CRC/);
  const changedId = decoded.data.slice(); changedId[88] ^= 1; await assert.rejects(inspectPackage(changedId));
});
test('Realtime interleaving is stripped; incomplete frames are rejected', () => {
  const raw = encodePacket(packet(CMD.REQUEST, 3, 5)), withClock = concat(raw.slice(0, 8), new Uint8Array([248, 254]), raw.slice(8));
  assert.deepEqual(decodePacket(withClock), decodePacket(raw));
  assert.throws(() => splitSysex(raw.slice(0, -1)));
  assert.throws(() => splitSysex(new Uint8Array([240, 240, 247])));
});
test('Kit model decoding preserves all 16 BE32 values and validates checksum', () => {
  const models = Array.from({ length: 16 }, (_, i) => 194 + i);
  const raw = demoKit(models); assert.deepEqual(kitModels(raw), models);
  raw[11] ^= 1; assert.throws(() => kitModels(raw), /Prüfsumme/);
});
