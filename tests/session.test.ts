import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DemoLink, demoKit } from '../src/demo.ts';
import { Session, Rejected, TimeoutError } from '../src/session.ts';
import type { Backup, Commit } from '../src/session.ts';
import { CMD, packet, decodePacket, encodePacket, decodeDump, equal } from '../src/protocol.ts';
import type { Packet } from '../src/protocol.ts';
const sample = await decodeDump(new Uint8Array(await readFile(new URL('../machines/dbx/drone-0.5.syx', import.meta.url))));
const replacement = await decodeDump(new Uint8Array(await readFile(new URL('../machines/dbx/kick2-0.9.slot1.syx', import.meta.url))));
class Device extends DemoLink {
  behavior = ''; sent: Uint8Array[] = []; replies = new Map<string, number>();
  send(raw: Uint8Array) {
    this.sent.push(raw);
    if (this.behavior === 'legacy-timeout' && raw[1] === 126) return;
    if (this.behavior === 'in-use' && raw[6] === 83) { this.emit(demoKit([196, ...Array(15).fill(1)])); return; }
    if (this.behavior === 'read-timeout' && raw[6] === 116 && raw[8] === CMD.REQUEST) return;
    if (this.behavior === 'no-read-after-commit' && this.generation > 1 && raw[6] === 116 && raw[8] === CMD.REQUEST) throw new Error('Unexpected dump after commit');
    super.send(raw);
  }
  reply(p: Packet) {
    if (p.command === CMD.NAK && p.body[0] === CMD.CAP_REQUEST && this.behavior === 'wrong-cap-nak') { super.reply({ ...p, body: new Uint8Array([CMD.CAP_REQUEST, 11, 0, 0]) }); return; }
    if (p.command === CMD.ACK) {
      const key = p.transaction + ':' + p.sequence, count = (this.replies.get(key) ?? 0) + 1; this.replies.set(key, count);
      if (this.behavior === 'lost' && p.body[0] === CMD.DATA && p.sequence === 0 && count === 1) return;
      if (this.behavior === 'missing-final' && p.body[0] === CMD.END) return;
      if (this.behavior === 'lost-final-once' && p.body[0] === CMD.END && count === 1) return;
      if (this.behavior === 'wrong-final' && p.body[0] === CMD.END) { const body = p.body.slice(); body[6] ^= 1; super.reply({ ...p, body }); return; }
      if (this.behavior === 'nak' && p.body[0] === CMD.DATA) { super.reply({ ...p, command: CMD.NAK, body: new Uint8Array([CMD.DATA, 7, 0, 0]) }); return; }
      if (this.behavior === 'wait') super.reply({ ...p, command: CMD.WAIT, body: new Uint8Array([p.body[0], 0]) });
      if (this.behavior === 'endless-wait') {
        for (let i = 0; i < 30; i++) super.reply({ ...p, command: CMD.WAIT, body: new Uint8Array([p.body[0], 0]) }); return;
      }
      if (this.behavior === 'foreign') {
        super.reply({ ...p, transaction: p.transaction + 1 });
        super.reply({ ...p, slot: p.slot + 1 });
        const corrupted = encodePacket(p); corrupted[10] ^= 1; this.emit(corrupted);
      }
    }
    super.reply(p);
  }
  commands() { return this.sent.filter(raw => raw[6] === 116).map(decodePacket); }
}
const setup = async (behavior = '', compatibility = true) => {
  const link = new Device(); link.behavior = behavior;
  const session = new Session(link, compatibility, { reply: 15, total: 120, read: 50, legacy: 50, hold: 1, gap: 1 });
  await session.connect(); return { link, session };
};
test('X20 capability NAK15 enables only the scoped conservative limits', async () => {
  const { session } = await setup(); assert.equal(session.state?.caps.source, 'compatibility'); assert.equal(session.state?.caps.freeBytes, undefined); assert.equal(session.state?.caps.slots, 16);
  await assert.rejects(setup('wrong-cap-nak'), Rejected); await assert.rejects(setup('', false), Rejected);
});
test('NAK12 is empty only for the configured X20 profile; timeout stays unknown', async () => {
  const { link, session } = await setup(); assert.equal((await session.readSlot(1)).status, 'empty');
  session.compatibility = false; await assert.rejects(session.readSlot(1), Rejected);
  session.compatibility = true; link.behavior = 'read-timeout'; await assert.rejects(session.readSlot(1), TimeoutError);
});
test('No high-slot write/read is admitted by v0.1', async () => {
  const { link, session } = await setup(); await assert.rejects(session.readSlot(17));
  await assert.rejects(session.upload(sample.data, 17, () => {})); assert.equal(link.commands().filter(p => p.command === CMD.HEADER).length, 0);
});
test('Upload handles WAIT, foreign/corrupt responses and bounded lost packet retry', async () => {
  for (const behavior of ['wait', 'foreign', 'lost']) {
    const { session, link } = await setup(behavior); const commit = await session.upload(sample.data, 2, () => {});
    assert.equal(commit.contentPrefix, sample.info.contentId.slice(0, 16)); assert(equal(link.memory.get(2)!, sample.data));
  }
});
test('NAK, infinite WAIT, missing commit and wrong final content are failures', async () => {
  for (const behavior of ['nak', 'endless-wait', 'missing-final', 'wrong-final']) {
    const { session } = await setup(behavior); await assert.rejects(session.upload(sample.data, 2, () => {}));
  }
});
test('A missing final ACK retries END only and does not duplicate the commit', async () => {
  const { session, link } = await setup('lost-final-once'); await session.upload(sample.data, 1, () => {});
  assert.equal(link.commands().filter(p => p.command === CMD.HEADER).length, 1);
  assert.equal(link.commands().filter(p => p.command === CMD.END).length, 2); assert.equal(link.generation, 2);
});
test('Install backs up target and kit, then finishes with the commit ACK', async () => {
  const { link, session } = await setup(); link.memory.set(3, sample.data);
  session.state!.caps.freeWords = 1000; session.state!.caps.freeBytes = 4000;
  const target = await session.readSlot(3), backups: Backup[] = [], commits: Commit[] = [];
  const after = await session.install(replacement.data, target, async backup => {
    if (backup.kind !== 'commit') assert.equal(link.commands().filter(p => p.command === CMD.HEADER).length, 0);
    backups.push(backup);
  }, () => {}, commit => commits.push(commit));
  assert.deepEqual(backups.map(b => b.kind), ['machine', 'kit', 'commit']); assert.equal(commits.length, 1);
  assert.equal(after.info?.sha256, replacement.info.sha256); assert.equal(after.slot, 3);
  assert.equal(after.source, 'Durch Commit-ACK bestätigt');
  assert.equal(link.commands().at(-1)?.command, CMD.END);
  assert.equal(session.state!.caps.freeWords, undefined); assert.equal(session.state!.caps.freeBytes, undefined);
});
test('Changed target, in-use target, and backup storage failure send no header', async () => {
  for (const scenario of ['changed', 'in-use', 'storage']) {
    const { link, session } = await setup(); link.memory.set(3, sample.data); const target = await session.readSlot(3);
    if (scenario === 'changed') link.memory.set(3, replacement.data);
    if (scenario === 'in-use') link.behavior = 'in-use';
    await assert.rejects(session.install(replacement.data, target, async () => { if (scenario === 'storage') throw new Error('Disk full'); }, () => {}, () => {}));
    assert.equal(link.commands().filter(p => p.command === CMD.HEADER).length, 0);
  }
});
test('Install sends no dump after commit, including cancellation after the ACK', async () => {
  const { link, session } = await setup('no-read-after-commit');
  const target = await session.readSlot(3), abort = new AbortController(), stages: string[] = [];
  link.sent = [];
  const result = await session.install(replacement.data, target, async () => {}, p => stages.push(p.stage), () => abort.abort(), abort.signal);
  assert.equal(result.status, 'occupied'); assert.equal(result.info?.sha256, replacement.info.sha256);
  assert.equal(link.commands().filter(p => p.command === CMD.REQUEST).length, 1); // Target check before upload only.
  assert.equal(link.commands().at(-1)?.command, CMD.END);
  assert.equal(stages.at(-1), 'Geladen'); assert(stages.every(stage => !/Rücklesen|vergleichen/.test(stage)));
});
test('A commit log storage failure preserves commit evidence without requesting a dump', async () => {
  const { link, session } = await setup('no-read-after-commit'), commits: Commit[] = [];
  const target = await session.readSlot(3);
  await assert.rejects(session.install(replacement.data, target, async b => { if (b.kind === 'commit') throw new Error('Disk full'); }, () => {}, c => commits.push(c)), /Disk full/);
  assert.equal(commits.length, 1); assert(equal(link.memory.get(3)!, replacement.data));
  assert.equal(link.commands().at(-1)?.command, CMD.END);
});
test('Legacy timeout quarantines subsequent operations until reconnection', async () => {
  const { session, link } = await setup(); link.behavior = 'legacy-timeout'; await assert.rejects(session.identity(), TimeoutError);
  assert.equal(session.needsReconnect, true); const before = link.sent.length;
  await assert.rejects(session.scan(() => {}), /neu verbinden/); assert.equal(link.sent.length, before);
});
test('Abort releases the remote NO key and never uploads a package', async () => {
  const { session, link } = await setup(), abort = new AbortController();
  const send = link.send.bind(link);
  link.send = raw => { send(raw); if (raw[6] === 64 && raw[8] === 127) abort.abort(); };
  await assert.rejects(session.prepare(abort.signal), { name: 'AbortError' });
  assert(link.sent.some(raw => raw[6] === 64 && raw[7] === 41 && raw[8] === 0));
  assert.equal(link.commands().filter(p => p.command === CMD.HEADER).length, 0);
});
test('Concurrent operations are rejected without opening another MIDI transaction', async () => {
  const { session, link } = await setup('read-timeout'); const running = session.scan(() => {});
  await assert.rejects(session.scan(() => {}), /bereits/); await assert.rejects(running); assert.equal(session.busy, false);
});
