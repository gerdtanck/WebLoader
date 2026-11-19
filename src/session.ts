import { CMD, PREFIX, packet, encodePacket, decodePacket, decodeDump, encodeDump, capabilities, inspectPackage, check, equal, concat, kitModels, hex, view } from './protocol.ts';
import type { Packet, MachineInfo, Capabilities } from './protocol.ts';

export interface Link { send(bytes: Uint8Array): void; subscribe(receive: (bytes: Uint8Array) => void, failed: (error: Error) => void): () => void }
export interface SlotState { slot: number; status: 'unknown' | 'empty' | 'occupied'; info?: MachineInfo; source?: string; checkedAt?: string }
export interface DeviceState { revision: string; enhancedGui: boolean; caps: Capabilities; kit?: number; pattern?: number; bpm?: number }
export interface Progress { stage: string; fraction: number }
export interface Commit { generation: number; contentPrefix: string; slot: number; receivedAt: string }
export class TimeoutError extends Error { constructor() { super('Timed out waiting for a matching MIDI reply.'); } }
export class Rejected extends Error {
  reply: Packet; reason: number; detail: number; reference: number;
  constructor(p: Packet) {
    const names: Record<number, string> = { 4: 'Invalid slot', 6: 'Corrupt data', 7: 'Incompatible machine', 9: 'Receiver not ready', 10: 'Slot is in use', 11: 'Device busy', 12: 'Storage error', 15: 'Internal error', 16: 'DSP memory full', 17: 'Machine storage full', 18: 'DSP budget exceeded' };
    super((p.command === CMD.CANCEL ? 'Canceled' : 'NAK ' + p.body[1]) + ': ' + (names[p.body[1]] || 'Device rejected the request'));
    this.reply = p; this.reference = p.body[0]; this.reason = p.body[1]; this.detail = p.body.length === 4 ? view(p.body).getUint16(2) : -1;
  }
}
const aborted = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Operation canceled.', 'AbortError'); };
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
class Inbox {
  queue: Uint8Array[] = []; error?: Error; wake?: () => void; unsubscribe: () => void;
  constructor(link: Link) {
    this.unsubscribe = link.subscribe(data => {
      if (data[0] !== 240) return;
      if (this.queue.length >= 512) { this.error = new Error('MIDI receive buffer overflow. Reconnect MIDI.'); this.wake?.(); return; }
      this.queue.push(data); this.wake?.();
    }, error => { this.error = error; this.wake?.(); });
  }
  async next(ms: number, signal?: AbortSignal): Promise<Uint8Array> {
    aborted(signal); if (this.error) throw this.error;
    if (this.queue.length) return this.queue.shift()!;
    if (ms <= 0) throw new TimeoutError();
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); this.wake = undefined; };
      const cancel = () => { cleanup(); reject(new DOMException('Operation canceled.', 'AbortError')); };
      const timer = setTimeout(() => { cleanup(); reject(new TimeoutError()); }, ms);
      this.wake = () => { cleanup(); resolve(); };
      signal?.addEventListener('abort', cancel, { once: true });
    });
    if (this.error) throw this.error; aborted(signal);
    check(this.queue.length, 'MIDI reception interrupted.'); return this.queue.shift()!;
  }
  close() { this.unsubscribe(); }
}
const MD = [240, 0, 32, 60, 2, 0];
const md = (...bytes: number[]) => new Uint8Array([...MD, ...bytes, 247]);
const starts = (data: Uint8Array, prefix: number[] | Uint8Array) => prefix.every((n, i) => data[i] === n);
function framed(raw: Uint8Array) { check(raw.length >= 3 && raw[0] === 240 && raw.at(-1) === 247 && raw.slice(1, -1).every(n => n < 128), 'Corrupt SysEx reply.'); }
export type Timing = { reply: number; total: number; read: number; legacy: number; hold: number; gap: number };
export class Session {
  link: Link; compatibility: boolean; state?: DeviceState; needsReconnect = false; busy = false;
  trace: { at: string; direction: string; hex: string }[] = [];
  timing: Timing; transaction = 1 + Math.floor(Math.random() * 12000);
  constructor(link: Link, compatibility = true, timing: Partial<Timing> = {}) {
    this.link = link; this.compatibility = compatibility;
    this.timing = { reply: 2200, total: 120000, read: 30000, legacy: 4000, hold: 60, gap: 140, ...timing };
  }
  log(direction: string, bytes: Uint8Array) { this.trace.push({ at: new Date().toISOString(), direction, hex: hex(bytes) }); if (this.trace.length > 5000) this.trace.shift(); }
  send(bytes: Uint8Array) { this.log('out', bytes); this.link.send(bytes); }
  nextId() { this.transaction = this.transaction % 16383 + 1; return this.transaction; }
  async exclusive<T>(action: () => Promise<T>): Promise<T> {
    check(!this.busy, 'A MIDI operation is already running.'); check(!this.needsReconnect, 'Reconnect MIDI.');
    this.busy = true; try { return await action(); } finally { this.busy = false; }
  }
  async nextPacket(box: Inbox, deadline: number, signal?: AbortSignal): Promise<Packet> {
    while (true) {
      const bytes = await box.next(deadline - Date.now(), signal); this.log('in', bytes);
      try { return decodePacket(bytes); } catch { /* Corrupt or unrelated MIDI must never authorize a write. */ }
    }
  }
  async legacy<T>(wire: Uint8Array, match: (b: Uint8Array) => boolean, decode: (b: Uint8Array) => T, signal?: AbortSignal): Promise<T> {
    check(!this.needsReconnect, 'Reconnect MIDI.');
    const box = new Inbox(this.link), deadline = Date.now() + this.timing.legacy;
    try {
      aborted(signal); this.send(wire);
      while (true) {
        const raw = await box.next(deadline - Date.now(), signal); this.log('in', raw);
        if (!match(raw)) continue;
        try { framed(raw); return decode(raw); } catch { /* Keep waiting for a valid matching frame. */ }
      }
    } catch (e) { this.needsReconnect = true; throw e; } finally { box.close(); }
  }
  async identity(signal?: AbortSignal): Promise<string> {
    return this.legacy(new Uint8Array([240, 126, 127, 6, 1, 247]), b => starts(b, [240, 126]) && b[3] === 6 && b[4] === 2, b => {
      const count = b[5] === 0 ? 3 : 1; check(b.length === 14 + count, 'Invalid identity reply length.');
      return String.fromCharCode(...b.slice(9 + count, 13 + count)).trim();
    }, signal);
  }
  async mdx(signal?: AbortSignal): Promise<boolean> {
    return this.legacy(md(112, 48), b => starts(b, [...MD, 114, 48]), b => {
      check(b.length === 13, 'Invalid MDX capabilities.');
      const bits = b[8] | (b[9] << 7) | (b[10] << 14) | (b[11] << 21); return !!(bits & (1 << 10));
    }, signal);
  }
  async probeCaps(signal?: AbortSignal): Promise<Capabilities> {
    const id = this.nextId(), box = new Inbox(this.link), deadline = Date.now() + this.timing.legacy;
    try {
      aborted(signal); this.send(encodePacket(packet(CMD.CAP_REQUEST, id)));
      while (true) {
        const p = await this.nextPacket(box, deadline, signal);
        if (p.transaction !== id || p.slot !== 127 || p.sequence !== 127) continue;
        if (p.command === CMD.CAP_REPLY) { try { return capabilities(p); } catch { continue; } }
        if (![CMD.WAIT, CMD.NAK, CMD.CANCEL].includes(p.command as 124)) continue;
        if (p.body.length !== (p.command === CMD.NAK ? 4 : 2) || p.body[0] !== CMD.CAP_REQUEST) continue;
        if (p.command === CMD.WAIT) continue;
        const error = new Rejected(p);
        if (this.compatibility && this.state?.revision === 'X20' && p.command === CMD.NAK && error.reason === 15 && error.detail === 0) return { slots: 16, maxBytes: 45724, maxWords: 14324, maxPacket: 499, codec: 1, source: 'compatibility' };
        throw error;
      }
    } finally { box.close(); }
  }
  connect(signal?: AbortSignal) { return this.exclusive(async () => {
    const revision = await this.identity(signal); check(revision === 'X20', 'Requires MDX X.20. Device reports: ' + revision);
    const enhancedGui = await this.mdx(signal);
    this.state = { revision, enhancedGui, caps: { slots: 0, maxBytes: 0, maxWords: 0, maxPacket: 0, codec: 0, source: 'device' } };
    this.state.caps = await this.probeCaps(signal); return this.state;
  }); }
  async readSlot(slot: number, signal?: AbortSignal): Promise<SlotState & { bytes?: Uint8Array; data?: Uint8Array }> {
    check(slot >= 1 && slot <= Math.min(this.state?.caps.slots ?? 0, 16), 'This slot is not supported in version 0.1.');
    const id = this.nextId(), box = new Inbox(this.link), deadline = Date.now() + this.timing.read, frames: Uint8Array[] = [];
    try {
      aborted(signal); this.send(encodePacket(packet(CMD.REQUEST, id, slot - 1)));
      while (true) {
        const p = await this.nextPacket(box, deadline, signal);
        if (p.transaction !== id || p.slot !== slot - 1) continue;
        if ((p.command === CMD.NAK || p.command === CMD.CANCEL) && p.sequence === 127 && p.body[0] === CMD.REQUEST && p.body.length === (p.command === CMD.NAK ? 4 : 2)) {
          const error = new Rejected(p);
          if (this.compatibility && this.state?.revision === 'X20' && p.command === CMD.NAK && error.reason === 12 && error.detail === 0) return { slot, status: 'empty', source: 'NAK 12 / X.20-C rule', checkedAt: new Date().toISOString() };
          throw error;
        }
        if (![CMD.HEADER, CMD.DATA, CMD.END].includes(p.command as 1)) continue;
        frames.push(encodePacket(p)); check(frames.length <= 129, 'MDS dump exceeds the maximum size.');
        if (p.command !== CMD.END) continue;
        const bytes = concat(...frames), dump = await decodeDump(bytes);
        check(dump.slot === slot, 'MDS dump target mismatch.');
        return { slot, status: 'occupied', info: dump.info, data: dump.data, bytes, source: 'Read from device', checkedAt: new Date().toISOString() };
      }
    } finally { box.close(); }
  }
  scan(onSlot: (slot: SlotState) => void, signal?: AbortSignal) { return this.exclusive(async () => {
    check(this.state, 'Connect MIDI first.'); this.state.caps = await this.probeCaps(signal);
    for (let slot = 1; slot <= Math.min(this.state.caps.slots, 16); slot++) {
      aborted(signal);
      try { onSlot(await this.readSlot(slot, signal)); }
      catch (error) { onSlot({ slot, status: 'unknown', source: String(error) }); throw error; }
    }
  }); }
  async workspace(signal?: AbortSignal) {
    return this.legacy(md(83, 127, 0), b => starts(b, [...MD, 82]), bytes => ({ bytes, models: kitModels(bytes) }), signal);
  }
  async prepare(signal?: AbortSignal) {
    for (let i = 0; i < 4; i++) {
      aborted(signal);
      try { this.send(md(64, 41, 127)); await sleep(this.timing.hold); }
      finally { this.send(md(64, 41, 0)); }
      await sleep(this.timing.gap);
    }
    aborted(signal);
  }
  async upload(data: Uint8Array, slot: number, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<Commit> {
    const info = await inspectPackage(data), cap = await this.probeCaps(signal);
    check(slot >= 1 && slot <= Math.min(16, cap.slots) && (cap.codec & 1), 'Unsupported target slot or codec.');
    check(info.bytes <= cap.maxBytes && info.programWords <= cap.maxWords, 'Machine exceeds device limits.');
    const id = this.nextId(), frames = await encodeDump(data, slot, id), box = new Inbox(this.link), end = Date.now() + this.timing.total;
    check(frames.every(p => encodePacket(p).length <= cap.maxPacket), 'MIDI packet exceeds the device limit.');
    let index = 0, endSent = false; const attempts = new Map<number, number>();
    try {
      while (index < frames.length) {
        aborted(signal); check(Date.now() < end, 'Transfer time limit exceeded.');
        const request = frames[index], count = (attempts.get(index) ?? 0) + 1;
        check(count <= 3, 'No acknowledgement after three attempts.'); attempts.set(index, count);
        if (request.command === CMD.END) endSent = true;
        this.send(encodePacket(request)); let deadline = Math.min(end, Date.now() + this.timing.reply), advanced = false;
        while (Date.now() < deadline) {
          let reply: Packet;
          try { reply = await this.nextPacket(box, deadline, signal); } catch (e) { if (e instanceof TimeoutError) break; throw e; }
          if (reply.transaction !== id || reply.slot !== slot - 1 || reply.sequence !== request.sequence) continue;
          if (reply.command === CMD.WAIT && reply.body.length === 2 && reply.body[0] === request.command) { deadline = Math.min(end, Date.now() + this.timing.reply); continue; }
          if ((reply.command === CMD.NAK || reply.command === CMD.CANCEL) && reply.body.length === (reply.command === CMD.NAK ? 4 : 2) && reply.body[0] === request.command) {
            const error = new Rejected(reply);
            if (reply.command === CMD.NAK && error.reason === 6 && error.detail) {
              const target = frames.findIndex(p => p.command === (error.detail >> 8) && p.sequence === (error.detail & 255));
              if (target >= index && target <= index + 1) { index = target; break; }
            }
            throw error;
          }
          if (reply.command !== CMD.ACK || reply.body.length !== 14 || reply.body[0] !== request.command) continue;
          if (request.command === CMD.END) {
            check(reply.body[1] === 1 && equal(reply.body.slice(6, 14), data.slice(88, 96)), 'Final ACK does not confirm this machine.');
            return { slot, generation: view(reply.body).getUint32(2), contentPrefix: hex(reply.body.slice(6)), receivedAt: new Date().toISOString() };
          }
          check(reply.body[1] === 0, 'Unexpected status in packet ACK.'); index++; advanced = true;
          onProgress({ stage: 'Transferring', fraction: index / frames.length }); break;
        }
        if (!advanced && Date.now() >= end) throw new TimeoutError();
      }
      throw new Error('Missing final commit ACK.');
    } catch (error) {
      if (endSent) throw new Error('Commit unconfirmed. Refresh the target slot before retrying. ' + (error instanceof Error ? error.message : String(error)));
      throw error;
    } finally { box.close(); }
  }
  install(data: Uint8Array, target: SlotState, onProgress: (p: Progress) => void, onCommit: (c: Commit) => void, signal?: AbortSignal) {
    return this.exclusive(async () => {
      check(this.state && this.state.enhancedGui, 'Enhanced GUI is required to prepare the receiver.');
      check(target.status !== 'unknown', 'Refresh the target slot before loading.');
      const info = await inspectPackage(data); onProgress({ stage: 'Checking target', fraction: 0 });
      const revision = await this.identity(signal); check(revision === 'X20', 'Device changed. Reconnect MIDI.');
      const prior = await this.readSlot(target.slot, signal);
      check(prior.status === target.status && (prior.status !== 'occupied' || prior.info?.sha256 === target.info?.sha256), 'Target contents changed. Refresh slots and add the transfer again.');
      const kit = await this.workspace(signal);
      check(!kit.models.includes(193 + target.slot), 'The current kit uses this slot. Assign another machine on the device first.');
      check(await this.mdx(signal), 'Enhanced GUI is unavailable.');
      onProgress({ stage: 'Preparing receiver', fraction: 0.06 }); await this.prepare(signal);
      const commit = await this.upload(data, target.slot, onProgress, signal);
      // Capacity measurements predate this commit. A later scan refreshes them.
      this.state.caps = { ...this.state.caps, freeBytes: undefined, freeWords: undefined };
      onCommit(commit);
      // The final ACK completes installation; no dump or byte comparison follows.
      const installed: SlotState = { slot: target.slot, status: 'occupied', info, source: 'Confirmed by commit ACK', checkedAt: commit.receivedAt };
      onProgress({ stage: 'Loaded', fraction: 1 }); return installed;
    });
  }
}
