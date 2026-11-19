// MDS 1.0/1.1, pinned sources and lab reference hashes in toolchain.lock.json.
export const PREFIX = new Uint8Array([240, 0, 32, 60, 2, 0, 116, 1]);
export const CMD = { HEADER: 1, DATA: 2, REQUEST: 3, QUERY: 4, SLOTS: 5, CAP_REQUEST: 6, CAP_REPLY: 7, END: 123, WAIT: 124, CANCEL: 125, NAK: 126, ACK: 127 } as const;
export interface Packet { command: number; transaction: number; slot: number; sequence: number; body: Uint8Array }
export interface MachineInfo {
  name: string; id: string; category: string; label: string; version: string; mdsVersion: string;
  bytes: number; programWords: number; imports: number; xWords: number; yWords: number;
  cycles: { mkii: number; mkiDram: number; mkiSram: number }; contentId: string; sha256: string;
  sprite: number[]; parameters: { name: string; default: number; min: number; max: number }[];
}
export function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
export const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((n, i) => n === b[i]);
export const hex = (data: Uint8Array) => Array.from(data, n => n.toString(16).padStart(2, '0')).join('');
export const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0; for (const p of parts) { out.set(p, offset); offset += p.length; } return out;
};
export const packet = (command: number, transaction: number, slot = 127, sequence = 127, body: Uint8Array = new Uint8Array()): Packet => ({ command, transaction, slot, sequence, body });
export const view = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);
export function pack7(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 7) {
    const group = data.slice(i, i + 7);
    out.push(group.reduce((mask, value, n) => mask | ((value >> 7) << (6 - n)), 0), ...group.map(n => n & 127));
  } return new Uint8Array(out);
}
export function unpack7(data: Uint8Array): Uint8Array {
  check(data.every(n => n < 128), 'Invalid 7-bit data.');
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 8) {
    const group = data.slice(i, i + 8), count = group.length - 1;
    check(count > 0 && !(group[0] & ((1 << (7 - count)) - 1)), 'Invalid 7-bit mask.');
    for (let n = 0; n < count; n++) out.push(group[n + 1] | (((group[0] >> (6 - n)) & 1) << 7));
  } return new Uint8Array(out);
}
export function encodePacket(p: Packet): Uint8Array {
  check(Number.isInteger(p.transaction) && p.transaction >= 0 && p.transaction <= 16383, 'Invalid transaction.');
  check([p.command, p.slot, p.sequence].every(n => Number.isInteger(n) && n >= 0 && n < 128), 'Invalid SysEx header.');
  check(p.body.length <= 420, 'SysEx packet is too large.');
  const checked = concat(new Uint8Array([p.transaction >> 7, p.transaction & 127, p.slot, p.sequence, 0]), pack7(p.body));
  const sum = checked.reduce((s, n) => s + n, 0) & 16383, length = checked.length + 4;
  return concat(PREFIX, new Uint8Array([p.command]), checked, new Uint8Array([sum >> 7, sum & 127, length >> 7, length & 127, 247]));
}
export function decodePacket(input: Uint8Array): Packet {
  const raw = input.filter(n => n < 248);
  check(raw.length >= 19 && raw.length <= 499 && equal(raw.slice(0, 8), PREFIX) && raw.at(-1) === 247, 'Invalid MDS frame.');
  check(raw.slice(1, -1).every(n => n < 128) && raw[13] === 0, 'Invalid MDS header.');
  const checked = raw.slice(9, -5);
  check((checked.reduce((s, n) => s + n, 0) & 16383) === ((raw.at(-5)! << 7) | raw.at(-4)!), 'SysEx checksum mismatch.');
  check(checked.length + 4 === ((raw.at(-3)! << 7) | raw.at(-2)!), 'SysEx length mismatch.');
  return packet(raw[8], (raw[9] << 7) | raw[10], raw[11], raw[12], unpack7(raw.slice(14, -5)));
}
export function splitSysex(raw: Uint8Array): Uint8Array[] {
  const messages: Uint8Array[] = []; let current: number[] | null = null;
  for (const value of raw) {
    if (value >= 248) continue;
    if (value === 240) { check(current === null, 'Nested SysEx start.'); current = [value]; }
    else if (current === null) throw new Error('Data outside SysEx.');
    else if (value === 247) { current.push(value); messages.push(new Uint8Array(current)); current = null; }
    else { check(value < 128, 'Invalid MIDI status byte.'); current.push(value); }
  }
  check(current === null && messages.length, 'Empty or incomplete SysEx file.'); return messages;
}
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  } return (crc ^ 0xffffffff) >>> 0;
}
export async function sha256(data: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data))));
}
const text = (d: Uint8Array) => String.fromCharCode(...d).split('\0')[0].trim();
export async function inspectPackage(data: Uint8Array): Promise<MachineInfo> {
  check(data.length >= 128 && text(data.slice(0, 4)) === 'MDS1', 'Not an MDS machine file.');
  const v = view(data), version = v.getUint16(4), size = v.getUint32(8), align = (n: number) => (n + 3) & ~3;
  check([1, 257].includes(version) && v.getUint16(6) === 128 && size === data.length && size % 4 === 0, 'Invalid MDS version or size.');
  check(equal(data.slice(16, 22), new Uint8Array([86, 3, 0, 1, 0, 0])), 'Unsupported MDS target or codec.');
  check(concat(data.slice(12, 16), data.slice(54, 56), data.slice(60, 64), data.slice(120, 128)).every(n => !n), 'Reserved MDS fields are not zero.');
  const words = v.getUint16(22), imports = v.getUint16(24), x = v.getUint16(26), y = v.getUint16(28);
  const start = v.getUint32(32), length = v.getUint32(36), decoded = v.getUint32(40), reloc = v.getUint32(44), imp = v.getUint32(48), msize = v.getUint16(52), mstart = v.getUint32(56);
  check(words > 0 && imports <= 64 && x <= 64 && y <= 64 && start === 128 && length === words * 3 && decoded === length && reloc === align(start + length) && imp === align(reloc + Math.ceil(words / 8)) && mstart === align(imp + imports * 4) && msize >= 128 && (msize - 128) % 8 === 0 && size === align(mstart + msize) + 128, 'Invalid MDS sections or resources.');
  const program = data.slice(start, start + length), manifest = data.slice(mstart, mstart + msize);
  check(text(manifest.slice(0, 4)) === 'MDM1', 'Missing MDS metadata.');
  check([64, 66, 68].every(n => v.getUint16(n) < words), 'Entry point outside the program.');
  const cycles = { mkii: v.getUint16(70), mkiDram: v.getUint16(72), mkiSram: v.getUint16(74) };
  check(cycles.mkii > 0 && cycles.mkiSram <= cycles.mkiDram && (version !== 257 || (cycles.mkiDram > 0 && cycles.mkiSram > 0)), 'Missing or invalid cycle declarations.');
  check(crc32(program) === v.getUint32(76) && crc32(manifest) === v.getUint32(80), 'Program or metadata CRC mismatch.');
  const cleared = data.slice(); cleared.fill(0, 84, 88);
  check(crc32(cleared) === v.getUint32(84), 'Package CRC mismatch.');
  cleared.fill(0, 84, 120);
  const contentId = await sha256(concat(cleared, program));
  check(contentId === hex(data.slice(88, 120)), 'MDS content ID mismatch.');
  const sprite = Array.from({ length: 32 }, (_, i) => v.getUint32(align(mstart + msize) + 4 * i));
  check(sprite.every(n => (n & 255) === 0), 'Invalid reserved sprite bits.');
  check(manifest[5] <= 8, 'Invalid parameter count.');
  return { name: text(manifest.slice(16, 32)), id: text(manifest.slice(32, 64)), category: text(manifest.slice(8, 12)), label: text(manifest.slice(12, 14)), version: data[30] || data[31] ? data[30] + '.' + data[31] : '', mdsVersion: version === 257 ? '1.1' : '1.0', bytes: size, programWords: words, imports, xWords: x, yWords: y, cycles, contentId, sha256: await sha256(data), sprite, parameters: Array.from({ length: manifest[5] }, (_, i) => { const p = manifest.slice(64 + i * 8, 72 + i * 8); return { name: text(p.slice(0, 4)), default: p[4], min: p[5], max: p[6] }; }) };
}
export async function encodeDump(data: Uint8Array, slot: number, transaction: number): Promise<Packet[]> {
  await inspectPackage(data); check(Number.isInteger(slot) && slot >= 1 && slot <= 48, 'Target slot outside U01–U48.');
  const count = Math.ceil(data.length / 420); check(count <= 127, 'Too many data packets.');
  const body = new Uint8Array(42), v = view(body); v.setUint32(0, data.length); body[4] = count; body.set(data.slice(84, 120), 6);
  return [packet(CMD.HEADER, transaction, slot - 1, 127, body), ...Array.from({ length: count }, (_, i) => packet(CMD.DATA, transaction, slot - 1, i, data.slice(i * 420, (i + 1) * 420))), packet(CMD.END, transaction, slot - 1, count)];
}
export async function decodeDump(raw: Uint8Array): Promise<{ data: Uint8Array; slot: number; info: MachineInfo }> {
  const packets = splitSysex(raw).map(decodePacket), first = packets[0];
  check(first.command === CMD.HEADER && first.sequence === 127 && first.body.length === 42 && first.slot < 48, 'Missing MDS dump header.');
  const v = view(first.body), size = v.getUint32(0), count = first.body[4];
  check(first.body[5] === 0 && count === Math.ceil(size / 420) && packets.length === count + 2 && count <= 127, 'Invalid dump length.');
  packets.slice(1).forEach((p, i) => {
    check(p.command === (i < count ? CMD.DATA : CMD.END) && p.sequence === i && p.transaction === first.transaction && p.slot === first.slot && p.body.length === (i < count ? Math.min(420, size - i * 420) : 0), 'MDS packet order, target or length mismatch.');
  });
  const data = concat(...packets.slice(1, -1).map(p => p.body)), info = await inspectPackage(data);
  check(equal(data.slice(84, 120), first.body.slice(6)), 'Dump header does not match the package.');
  return { data, slot: first.slot + 1, info };
}
export interface Capabilities { slots: number; maxBytes: number; maxWords: number; maxPacket: number; totalWords?: number; freeWords?: number; totalBytes?: number; freeBytes?: number; codec: number; features?: number; source: 'device' | 'compatibility' }
export function capabilities(p: Packet): Capabilities {
  check(p.command === CMD.CAP_REPLY && p.slot === 127 && p.body.length === 34, 'Invalid capability reply.');
  const b = p.body, v = view(b);
  check(b[17] === 1 && b[14] >= 1 && b[14] <= 48 && v.getUint16(8) <= v.getUint16(6) && v.getUint16(12) <= v.getUint16(10), 'Invalid device limits.');
  return { maxBytes: v.getUint16(0), maxWords: v.getUint16(2), maxPacket: v.getUint16(4), totalWords: v.getUint16(6), freeWords: v.getUint16(8), totalBytes: v.getUint16(10), freeBytes: v.getUint16(12), slots: b[14], codec: v.getUint16(18), features: v.getUint32(22), source: 'device' };
}
export function kitModels(raw: Uint8Array): number[] {
  check(equal(raw.slice(0, 7), new Uint8Array([240, 0, 32, 60, 2, 0, 82])) && raw.at(-1) === 247 && raw.slice(1, -1).every(n => n < 128), 'Invalid kit dump.');
  const extended = raw[7] === 65 && raw[8] === 1, legacy = raw[7] === 4 && raw[8] === 1;
  check((extended && raw.length === 1176) || (legacy && raw.length === 1233), 'Unsupported kit format.');
  check((raw.slice(9, -5).reduce((s, n) => s + n, 0) & 16383) === ((raw.at(-5)! << 7) | raw.at(-4)!) && ((raw.at(-3)! << 7) | raw.at(-2)!) === raw.length - 10, 'Kit checksum or length mismatch.');
  const offset = extended ? 0x28a : 0x1aa, data = unpack7(raw.slice(offset, offset + 74)), v = view(data);
  return Array.from({ length: 16 }, (_, i) => v.getUint32(i * 4));
}
