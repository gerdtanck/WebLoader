// Explicit simulated device; never opens or sends to a physical MIDI port.
import { CMD, PREFIX, packet, decodePacket, encodePacket, encodeDump, decodeDump, concat, pack7, view } from './protocol.ts';
import type { Packet } from './protocol.ts';
import type { Link } from './session.ts';
export class DemoLink implements Link {
  memory = new Map<number, Uint8Array>(); incoming: Packet[] = []; generation = 1;
  commits = new Map<string, Packet>();
  listeners = new Set<(b: Uint8Array) => void>();
  subscribe(receive: (b: Uint8Array) => void) { this.listeners.add(receive); return () => { this.listeners.delete(receive); }; }
  emit(bytes: Uint8Array) { queueMicrotask(() => { for (const listener of this.listeners) listener(bytes); }); }
  reply(p: Packet) { this.emit(encodePacket(p)); }
  send(raw: Uint8Array) { void this.respond(raw); }
  async respond(raw: Uint8Array) {
    if (raw[1] === 126) { this.emit(new Uint8Array([240, 126, 0, 6, 2, 125, 125, 0, 16, 0, 88, 50, 48, 32, 247])); return; }
    if (raw[6] === 112 && raw[7] === 48) { this.emit(new Uint8Array([240, 0, 32, 60, 2, 0, 114, 48, 126, 127, 15, 0, 247])); return; }
    if (raw[6] === 83) { this.emit(demoKit()); return; }
    if (raw[6] !== PREFIX[6]) return;
    const p = decodePacket(raw);
    const key = p.transaction + ':' + p.slot;
    if (p.command === CMD.END && this.commits.has(key)) { this.reply(this.commits.get(key)!); return; }
    if (p.command === CMD.CAP_REQUEST) { this.reply(packet(CMD.NAK, p.transaction, 127, 127, new Uint8Array([6, 15, 0, 0]))); return; }
    if (p.command === CMD.REQUEST) {
      const data = this.memory.get(p.slot + 1);
      if (!data) { this.reply(packet(CMD.NAK, p.transaction, p.slot, 127, new Uint8Array([3, 12, 0, 0]))); return; }
      for (const frame of await encodeDump(data, p.slot + 1, p.transaction)) this.reply(frame);
      return;
    }
    if (p.command === CMD.HEADER) { this.incoming = [p]; this.commits.delete(key); }
    else if (p.command === CMD.DATA || p.command === CMD.END) this.incoming[p.sequence + 1] = p;
    else return;
    const body = new Uint8Array(14); body[0] = p.command;
    if (p.command === CMD.END) {
      const dump = await decodeDump(concat(...this.incoming.map(encodePacket)));
      this.memory.set(dump.slot, dump.data); body[1] = 1; view(body).setUint32(2, ++this.generation); body.set(dump.data.slice(88, 96), 6);
    }
    const ack = packet(CMD.ACK, p.transaction, p.slot, p.sequence, body);
    if (p.command === CMD.END) this.commits.set(key, ack);
    this.reply(ack);
  }
}
export function demoKit(models = Array(16).fill(1)): Uint8Array {
  const raw = new Uint8Array(1176); raw.set([240, 0, 32, 60, 2, 0, 82, 65, 1, 0]);
  raw.set(new TextEncoder().encode('WEBLOADER DEMO'), 10);
  const data = new Uint8Array(64), v = view(data); models.forEach((n: number, i: number) => v.setUint32(i * 4, n)); raw.set(pack7(data), 0x28a);
  const sum = raw.slice(9, -5).reduce((s, n) => s + n, 0) & 16383, length = raw.length - 10;
  raw.set([sum >> 7, sum & 127, length >> 7, length & 127, 247], raw.length - 5); return raw;
}
