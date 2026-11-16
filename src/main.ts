import './style.css';
import './mobile.css';
import { decodeDump, sha256, equal } from './protocol.ts';
import type { MachineInfo } from './protocol.ts';
import { Session } from './session.ts';
import type { SlotState, Backup, Commit } from './session.ts';
import { WebMidiLink } from './webmidi.ts';
import { DemoLink } from './demo.ts';
import { saveBackup, getBackups, download } from './storage.ts';

interface Machine extends MachineInfo { key: string; manufacturer: string; file: string; image: string; fileHash: string; originalSlot: number; fileVersion?: string }
interface Job { id: string; machine: Machine; target: SlotState; status: 'queued' | 'running' | 'done' | 'error'; message: string; fraction: number; commit?: Commit }
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const slotName = (n: number) => 'U' + String(n).padStart(2, '0');
const kb = (n: number) => (n / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' KB';
let machines: Machine[] = [], selected: Machine | undefined, session: Session | undefined, native: WebMidiLink | undefined, midi: MIDIAccess | undefined;
let demo = false, working = false, controller: AbortController | undefined, jobs: Job[] = [], selectedSlot = 1;
let slots: SlotState[] = Array.from({ length: 48 }, (_, i) => ({ slot: i + 1, status: 'unknown' }));
let lockRelease: (() => void) | undefined;
type MobileView = 'library' | 'detail' | 'slots' | 'queue';
const mobile = matchMedia('(max-width: 740px)');
let mobileView: MobileView = 'library', mobileMachine: Machine | undefined;
const mobileScroll: Record<MobileView, number> = { library: 0, detail: 0, slots: 0, queue: 0 };
function showMobileView(view: MobileView, resetScroll = false) {
  if (mobile.matches) mobileScroll[mobileView] = window.scrollY;
  mobileView = view; document.body.dataset.mobileView = view;
  document.querySelectorAll<HTMLElement>('.mobile-nav [data-mobile-view]').forEach(button => {
    const current = button.dataset.mobileView === (view === 'detail' ? 'library' : view);
    if (current) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  if (mobile.matches) {
    window.scrollTo({ top: resetScroll ? 0 : mobileScroll[view], behavior: 'instant' });
    const section = { library: '.library', detail: '.detail', slots: '.device', queue: '.queue' }[view];
    const heading = document.querySelector<HTMLElement>(view === 'detail' ? '.detail-heading h2' : section + ' h2');
    heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true });
  }
}
function renderMobileSelection() {
  $('mobile-selection').hidden = !mobileMachine;
  $('mobile-machine-name').textContent = mobileMachine?.name ?? '';
}
function reviewMobileSlot(slot: number) {
  if (!mobileMachine || working) return;
  selectedSlot = slot; renderSlots();
  const target = slots[slot - 1], duplicate = jobs.some(j => j.target.slot === slot && j.status !== 'done');
  $('slot-review-title').textContent = mobileMachine.name + ' → ' + slotName(slot);
  $('slot-review-content').textContent = duplicate ? 'Für diesen Slot gibt es bereits einen Auftrag. Entferne ihn zuerst unter Laden.' : target.status === 'occupied' ? 'Ersetzt ' + target.info!.name + '. Vor dem Laden wird die vorhandene Machine gesichert.' : target.status === 'empty' ? 'Dieser Slot ist frei.' : 'Der Slotstatus ist noch unbekannt. Vor dem Laden muss der Gerätebestand eingelesen werden.';
  $<HTMLButtonElement>('confirm-slot').disabled = duplicate;
  $<HTMLDialogElement>('slot-dialog').showModal();
}
const cache = new Map<string, Uint8Array>();
const icon = (name: string) => {
  const paths: Record<string, string> = { search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', plug: '<path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-6 6v4m-6-13v3a6 6 0 0 0 6 6"/>', arrow: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>', refresh: '<path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', book: '<path d="M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3zM12 6v16"/>' };
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' + (paths[name] || paths.arrow) + '</svg>';
};
function sprite(m: MachineInfo, size = 64) {
  let pixels = '';
  m.sprite.forEach((column, x) => { for (let y = 0; y < 24; y++) if ((column >>> (y + 8)) & 1) pixels += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>'; });
  return '<svg class="sprite" width="' + size + '" height="' + size * .75 + '" viewBox="0 0 32 24" aria-hidden="true">' + pixels + '</svg>';
}
function toast(message: string, error = false) { $('notice').textContent = message; $('notice').className = 'notice visible' + (error ? ' error' : ''); }
function clearNotice() { $('notice').className = 'notice'; }
function invalidate() { slots = slots.map(s => ({ slot: s.slot, status: 'unknown' })); renderSlots(); renderStats(); }
function shell() {
  $('app').innerHTML = `
    <header class="topbar">
      <a class="brand" href="./"><span class="brand-mark">m<span>d</span></span><span>MACHINEDRUM<small>USER MACHINE WEBLOADER</small></span></a>
      <div class="header-actions"><span class="version">v0.1</span><button id="backups" class="quiet">${icon('arrow')} Backups</button><button id="connection" class="connect">${icon('plug')} MIDI verbinden</button></div>
    </header>
    <main>
      <div class="page-heading"><div><div class="eyebrow">DEINE MACHINEDRUM. NEUE MÖGLICHKEITEN.</div><h1>Machines laden.<br><span>Sounds entdecken.</span></h1></div><p>Eine Bibliothek voller neuer Klänge.<br>Ziehe eine Machine auf einen Slot<br>und bring sie auf deine Machinedrum.</p></div>
      <div id="notice" class="notice" role="status" aria-live="polite"></div>
      <div id="demo-banner" class="demo-banner" hidden><strong>DEMO</strong> Simulierte Machinedrum · Es werden keine MIDI-Geräte angesprochen.<button id="exit-demo">Demo beenden</button></div>
      <div class="workspace">
        <section class="library panel" aria-label="Machine-Bibliothek">
          <div class="panel-title"><div><span class="section-index">01</span><h2>Bibliothek</h2></div><span id="catalog-count" class="count">…</span></div>
          <div class="search-wrap">${icon('search')}<input id="search" type="search" placeholder="Machine suchen …" aria-label="Machines durchsuchen"><kbd>/</kbd></div>
          <div class="filters"><select id="manufacturer" aria-label="Hersteller"><option value="">Alle Hersteller</option></select><select id="category" aria-label="Kategorie"><option value="">Alle Kategorien</option></select></div>
          <div class="list-caption"><span>MACHINE / HERSTELLER</span><span>PROGRAMM</span></div>
          <div id="library-list" class="machine-list"></div>
          <div class="library-footer"><span class="dot"></span> MDX X.20 · MDS User Machines</div>
        </section>
        <section class="device panel" aria-label="Slots der Machinedrum">
          <div class="panel-title"><div><span class="section-index">02</span><h2>Deine Machinedrum</h2></div><span id="device-status" class="device-status">Nicht verbunden</span></div>
          <div class="device-toolbar"><div><span class="eyebrow">MACHINE BANK</span><h3>Aktuelle Bank <span id="bank-note">am Gerät ausgewählt</span></h3></div><button id="scan" class="quiet" disabled>${icon('refresh')} Aktualisieren</button></div>
          <div class="stats"><div><strong id="used">—</strong><span>belegt</span></div><div><strong id="free">—</strong><span>frei</span></div><div><strong id="unknown">48</strong><span>unbekannt</span></div><div class="memory"><strong id="memory">—</strong><span>Programmspeicher frei</span></div></div>
          <div id="connection-hint" class="connection-hint">${icon('plug')}<div><strong>Bereit für deine Machinedrum</strong><p>Verbinde MIDI IN und OUT, um die aktuelle Bank einzulesen.</p><button id="try-demo" class="text-button">Ohne Gerät ausprobieren →</button></div></div>
          <div id="mobile-selection" class="mobile-only mobile-selection" hidden><div><span>ZIELSLOT ANTIPPEN FÜR</span><strong id="mobile-machine-name"></strong></div><button id="clear-mobile-selection" class="icon-button" aria-label="Machine-Auswahl aufheben">${icon('close')}</button></div>
          <div class="slot-section-label"><span>U01–U16</span><span class="desktop-only">Machine hier ablegen</span><span class="mobile-only">Zielslot antippen</span></div>
          <div id="slots-active" class="slot-grid"></div>
          <details class="extended-slots"><summary>Weitere +Drive-Slots <span>U17–U48 · Zugriff noch nicht freigegeben</span></summary><div id="slots-extended" class="slot-grid"></div></details>
          <p id="scan-note" class="scan-note">Status wird erst nach dem Verbinden vom Gerät gelesen.</p>
        </section>
        <aside class="detail panel" aria-label="Machine-Details"><button id="back-to-library" class="mobile-only mobile-back">← Bibliothek</button><div class="panel-title"><div><span class="section-index">03</span><h2>Im Detail</h2></div>${icon('book')}</div><div id="detail-content"></div></aside>
      </div>
      <section class="queue panel" aria-label="Ladeaufträge"><div class="queue-top"><div><span class="section-index">04</span><h2>Ladeaufträge</h2><span id="queue-count" class="count">0</span></div><div><button id="cancel" class="quiet" hidden>Abbrechen</button><button id="load" class="primary" disabled>${icon('arrow')} Machines laden</button></div></div><div id="jobs"></div></section>
      <footer><span>WEBLOADER <span class="footer-slash">/</span> MDX X.20</span><span>Bibliothek → Slot → Laden</span><button id="log" class="text-button">Transferprotokoll exportieren</button></footer>
    </main>
    <nav class="mobile-nav" aria-label="Hauptbereiche"><button data-mobile-view="library" aria-current="page">${icon('book')}<span>Bibliothek</span></button><button data-mobile-view="slots">${icon('plug')}<span>Slots</span></button><button data-mobile-view="queue">${icon('arrow')}<span>Laden <b id="mobile-queue-count">0</b></span></button></nav>
    <dialog id="slot-dialog" aria-labelledby="slot-review-title"><form method="dialog"><div class="dialog-heading"><h2 id="slot-review-title"></h2><button class="icon-button" aria-label="Slotwahl schließen">${icon('close')}</button></div></form><p id="slot-review-content"></p><p>Der Auftrag wird zunächst vorgemerkt. Die Übertragung startest du anschließend unter „Laden“.</p><button id="confirm-slot" class="primary">Auftrag vormerken</button></dialog>
    <dialog id="midi-dialog"><form method="dialog"><div class="dialog-heading"><h2>MIDI verbinden</h2><button class="icon-button" aria-label="Schließen">${icon('close')}</button></div></form><p>Wähle beide Ports deines MIDI-Interfaces. Die Machinedrum benötigt MDX X.20.</p><button id="midi-access" class="primary">MIDI-Zugriff erlauben</button><div id="port-fields" hidden><label>MIDI-Eingang<select id="input-port"></select></label><label>MIDI-Ausgang<select id="output-port"></select></label><label>Geräteprofil<select id="profile"><option value="x20c">MKI UW+ · X.20 C (NAK-12/15-Kompatibilität)</option><option value="standard">X.20 · Standardabfragen</option></select></label><button id="connect-now" class="primary">Verbinden und einlesen</button></div><p id="midi-error" class="dialog-message" role="status"></p></dialog>
    <dialog id="image-dialog"><form method="dialog"><button class="icon-button" aria-label="Beschreibung schließen">${icon('close')}</button></form><img id="large-image" alt="Originalbeschreibung der Machine"></dialog>
    <dialog id="backup-dialog"><form method="dialog"><div class="dialog-heading"><h2>Deine Backups</h2><button class="icon-button" aria-label="Schließen">${icon('close')}</button></div></form><p>Vor dem Ersetzen belegter Slots lokal gesichert. Lade wichtige Sicherungen zusätzlich als Datei herunter.</p><div id="backup-list"></div></dialog>`;
}
function renderLibrary() {
  const query = $<HTMLInputElement>('search').value.toLowerCase(), manufacturer = $<HTMLSelectElement>('manufacturer').value, category = $<HTMLSelectElement>('category').value;
  const filtered = machines.filter(m => (!manufacturer || m.manufacturer === manufacturer) && (!category || m.category === category) && (m.name + ' ' + m.key + ' ' + m.category).toLowerCase().includes(query));
  $('catalog-count').textContent = filtered.length + ' / ' + machines.length;
  $('library-list').innerHTML = filtered.map(m => `<button class="machine-card ${selected?.key === m.key ? 'selected' : ''}" draggable="${!mobile.matches}" data-machine="${esc(m.key)}" aria-pressed="${selected?.key === m.key}"><span class="machine-icon">${sprite(m, 44)}</span><span class="machine-label"><strong>${esc(m.category)}-${esc(m.label)} <small>${m.fileVersion ? 'v' + esc(m.fileVersion) : ''}</small></strong><span>${esc(m.name)}</span><em>${esc(m.manufacturer)}</em></span><span class="machine-size">${kb(m.programWords * 3)}<span class="drag-dots">⠿</span></span></button>`).join('') || '<div class="empty-state">Keine Machines gefunden.<br>Versuche einen anderen Suchbegriff.</div>';
}
function renderDetail() {
  if (!selected) return;
  const m = selected;
  $('detail-content').innerHTML = `<div class="detail-sprite">${sprite(m, 112)}<span>${esc(m.category)} / ${esc(m.label)}</span></div><div class="detail-heading"><div class="eyebrow">${esc(m.manufacturer)}</div><h2>${esc(m.name)}</h2><span class="tag">${m.fileVersion ? 'DATEI v' + esc(m.fileVersion) : 'MDS ' + esc(m.mdsVersion)}</span></div><button id="show-image" class="description-preview" aria-label="Beschreibung vergrößern"><img src="${esc(m.image)}" alt="Beschreibung ${esc(m.name)}" loading="lazy"><span>Beschreibung öffnen ↗</span></button><dl><div><dt>Paketversion</dt><dd>${esc(m.version || 'Nicht angegeben')}</dd></div><div><dt>Programm</dt><dd>${kb(m.programWords * 3)}</dd></div><div><dt>MDS-Paket</dt><dd>${kb(m.bytes)}</dd></div><div><dt>Parameter</dt><dd>${m.parameters.length}</dd></div></dl><div class="target-control"><label for="target-slot">Zielslot</label><select id="target-slot">${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}" ${selectedSlot === i + 1 ? 'selected' : ''}>${slotName(i + 1)}</option>`).join('')}</select><button id="add-job" class="primary" ${working ? 'disabled' : ''}>Zum Laden vormerken</button></div><a class="sysex-download" href="${esc(m.file)}" download>Original-SysEx herunterladen ↗</a>`;
  $('show-image').onclick = () => { $<HTMLImageElement>('large-image').src = m.image; $<HTMLDialogElement>('image-dialog').showModal(); };
  $('add-job').onclick = () => addJob(m, Number($<HTMLSelectElement>('target-slot').value));
  $('detail-content').insertAdjacentHTML('beforeend', '<div class="mobile-only mobile-detail-action"><button id="choose-mobile-slot" class="primary">Zielslot wählen →</button></div>');
  $('choose-mobile-slot').onclick = () => { mobileMachine = m; renderMobileSelection(); showMobileView('slots', true); };
  $<HTMLButtonElement>('choose-mobile-slot').disabled = working;
  $('target-slot').onchange = () => { selectedSlot = Number($<HTMLSelectElement>('target-slot').value); renderSlots(); };
}
function renderSlots() {
  const markup = (s: SlotState) => {
    const queued = jobs.find(j => j.target.slot === s.slot && ['queued', 'running'].includes(j.status)), enabled = s.slot <= 16;
    return `<button class="slot ${s.status} ${queued ? 'planned' : ''} ${selectedSlot === s.slot ? 'chosen' : ''} ${!enabled ? 'unavailable' : ''}" data-slot="${s.slot}" ${!enabled ? 'disabled' : ''} aria-label="${slotName(s.slot)}: ${esc(queued ? queued.machine.name + ' vorgemerkt' : s.info?.name || (s.status === 'empty' ? 'Leer' : 'Unbekannt'))}"><span class="slot-number">${slotName(s.slot)}<i></i></span><strong>${esc(queued?.machine.name || s.info?.name || (s.status === 'empty' ? 'Leer' : '—'))}</strong><span class="slot-state">${queued ? (queued.status === 'running' ? 'Ladevorgang' : 'Vorgemerkt') : s.status === 'occupied' ? 'Belegt' : s.status === 'empty' ? 'Verfügbar' : 'Unbekannt'}</span></button>`;
  };
  $('slots-active').innerHTML = slots.slice(0, 16).map(markup).join(''); $('slots-extended').innerHTML = slots.slice(16).map(markup).join('');
}
function renderStats() {
  $('used').textContent = String(slots.filter(s => s.status === 'occupied').length);
  $('free').textContent = String(slots.filter(s => s.status === 'empty').length);
  $('unknown').textContent = String(slots.filter(s => s.status === 'unknown').length);
  const cap = session?.state?.caps; $('memory').textContent = cap?.source === 'device' && cap.freeWords !== undefined ? kb(cap.freeWords * 3) : 'Unbekannt';
}
function renderQueue() {
  $('queue-count').textContent = String(jobs.filter(j => j.status === 'queued').length);
  $('mobile-queue-count').textContent = String(jobs.filter(j => ['queued', 'running'].includes(j.status)).length);
  $('jobs').innerHTML = jobs.map(j => `<div class="job ${j.status}"><span class="job-target">${slotName(j.target.slot)}</span><div class="job-name"><strong>${esc(j.machine.name)}</strong><span>${esc(j.target.info ? 'Ersetzt ' + j.target.info.name : j.target.status === 'empty' ? 'Leerer Slot' : 'Ziel wird vor dem Laden geprüft')}</span></div><span class="job-message">${esc(j.message)}</span><progress max="1" value="${j.fraction}" aria-label="Ladefortschritt ${slotName(j.target.slot)}"></progress><button data-remove="${j.id}" class="icon-button" aria-label="Auftrag entfernen" ${working ? 'disabled' : ''}>${icon('close')}</button></div>`).join('') || '<div class="queue-empty"><span>↳</span> <span class="desktop-only">Ziehe eine Machine aus der Bibliothek auf einen Slot.</span><span class="mobile-only">Wähle eine Machine in der Bibliothek und danach ihren Zielslot.</span><small>Vorhandene Machines werden vor dem Ersetzen gesichert.</small></div>';
  $<HTMLButtonElement>('load').disabled = working || !session?.state || session.needsReconnect || !jobs.some(j => j.status === 'queued');
}
function renderConnection() {
  $('device-status').textContent = session?.needsReconnect ? 'Neu verbinden' : working ? 'Vorgang läuft' : session?.state ? (demo ? 'Demo verbunden' : 'X20 verbunden') : 'Nicht verbunden';
  $('device-status').className = 'device-status' + (session?.state && !session.needsReconnect ? ' connected' : '');
  $('connection').innerHTML = icon('plug') + (session ? 'Trennen' : 'MIDI verbinden');
  $('demo-banner').hidden = !demo; $('connection-hint').hidden = !!session?.state;
  $<HTMLButtonElement>('connection').disabled = working; $<HTMLButtonElement>('scan').disabled = working || !session?.state || session.needsReconnect;
  $('cancel').hidden = !working; $('bank-note').textContent = demo ? 'Simulation' : 'am Gerät ausgewählt';
  $<HTMLButtonElement>('try-demo').disabled = working;
  if ($('add-job')) $<HTMLButtonElement>('add-job').disabled = working;
  if ($('choose-mobile-slot')) $<HTMLButtonElement>('choose-mobile-slot').disabled = working;
  renderQueue();
}
function addJob(machine: Machine, slot: number) {
  if (working) return false;
  if (slot > 16) { toast('U17–U48 sind noch nicht für Transfers freigegeben.', true); return false; }
  if (jobs.some(j => j.target.slot === slot && j.status !== 'done')) { toast(slotName(slot) + ' hat bereits einen Auftrag. Entferne ihn zuerst.'); return false; }
  jobs.push({ id: crypto.randomUUID(), machine, target: { ...slots[slot - 1] }, status: 'queued', message: 'Bereit', fraction: 0 });
  selectedSlot = slot; renderSlots(); renderQueue(); toast(machine.name + ' → ' + slotName(slot) + ' vorgemerkt.');
  return true;
}
async function packageFor(m: Machine) {
  if (cache.has(m.key)) return cache.get(m.key)!;
  const response = await fetch(m.file); if (!response.ok) throw new Error('Machine-Datei konnte nicht geladen werden.');
  const raw = new Uint8Array(await response.arrayBuffer());
  if (await sha256(raw) !== m.fileHash) throw new Error('Datei stimmt nicht mit dem Katalog überein.');
  const { data, info } = await decodeDump(raw); if (info.sha256 !== m.sha256) throw new Error('Paket stimmt nicht mit dem Katalog überein.');
  cache.set(m.key, data); return data;
}
async function action(fn: (signal: AbortSignal) => Promise<void>) {
  if (working) return;
  working = true; controller = new AbortController(); clearNotice(); renderConnection();
  try { await fn(controller.signal); }
  catch (error) { toast(error instanceof Error ? error.message : String(error), true); }
  finally { working = false; controller = undefined; renderConnection(); renderStats(); }
}
async function scan(signal: AbortSignal) {
  if (!session) return;
  invalidate(); $('scan-note').textContent = 'Aktuelle Bank wird eingelesen …';
  await session.scan(s => { slots[s.slot - 1] = s; renderSlots(); renderStats(); $('scan-note').textContent = slotName(s.slot) + ' eingelesen …'; }, signal);
  // Jobs made offline have not reviewed a device target; require re-adding if occupied.
  for (const job of jobs) if (job.status === 'queued' && job.target.status === 'unknown' && slots[job.target.slot - 1].status === 'empty') job.target = { ...slots[job.target.slot - 1] };
  $('scan-note').textContent = 'U01–U16 aktualisiert · ' + new Date().toLocaleTimeString('de-DE') + ' · NAK 12 gilt im X.20-C-Profil als leer. Nach Bankwechsel erneut aktualisieren.';
  renderQueue();
}
async function disconnect() {
  if (working) return;
  const old = native; native = undefined; session = undefined; demo = false; jobs = []; invalidate();
  try { await old?.close(); } finally { lockRelease?.(); lockRelease = undefined; renderConnection(); }
  $('scan-note').textContent = 'Verbindung getrennt. Status vor dem nächsten Laden neu einlesen.';
}
async function acquireLock(): Promise<void> {
  if (!navigator.locks) throw new Error('Dieser Browser unterstützt die benötigte MIDI-Sitzungssperre nicht. Bitte Chrome oder Edge verwenden.');
  await new Promise<void>((resolve, reject) => {
    void navigator.locks.request('machinedrum-webloader-midi', { ifAvailable: true }, async lock => {
      if (!lock) { reject(new Error('WebLoader ist bereits in einem anderen Tab mit MIDI verbunden.')); return; }
      await new Promise<void>(release => { lockRelease = release; resolve(); });
    }).catch(reject);
  });
}
function fillPorts() {
  if (!midi) return;
  $<HTMLSelectElement>('input-port').innerHTML = Array.from(midi.inputs.values()).map(p => `<option value="${esc(p.id)}">${esc(p.name || p.id)}</option>`).join('');
  $<HTMLSelectElement>('output-port').innerHTML = Array.from(midi.outputs.values()).map(p => `<option value="${esc(p.id)}">${esc(p.name || p.id)}</option>`).join('');
  for (const [id, expected] of [['input-port', 'MIDIIN2 (USB MIDI cable) 1'], ['output-port', 'USB MIDI cable 1']]) {
    const select = $<HTMLSelectElement>(id), option = Array.from(select.options).find(o => o.text === expected); if (option) select.value = option.value;
  }
}
function events() {
  document.querySelectorAll<HTMLElement>('.mobile-nav [data-mobile-view]').forEach(button => { button.onclick = () => showMobileView(button.dataset.mobileView as MobileView); });
  $('back-to-library').onclick = () => showMobileView('library');
  $('clear-mobile-selection').onclick = () => { mobileMachine = undefined; renderMobileSelection(); };
  $('confirm-slot').onclick = () => {
    if (mobileMachine && addJob(mobileMachine, selectedSlot)) {
      $<HTMLDialogElement>('slot-dialog').close(); mobileMachine = undefined; renderMobileSelection(); showMobileView('queue', true);
    }
  };
  mobile.addEventListener('change', () => { renderLibrary(); showMobileView(mobileView); });
  for (const id of ['search', 'manufacturer', 'category']) $(id).addEventListener(id === 'search' ? 'input' : 'change', renderLibrary);
  $('library-list').addEventListener('click', event => { const card = (event.target as HTMLElement).closest<HTMLElement>('[data-machine]'); if (!card) return; selected = machines.find(m => m.key === card.dataset.machine); renderLibrary(); renderDetail(); if (mobile.matches) showMobileView('detail', true); });
  $('library-list').addEventListener('dragstart', event => { const card = (event.target as HTMLElement).closest<HTMLElement>('[data-machine]'); if (!card || !event.dataTransfer || working) { event.preventDefault(); return; } event.dataTransfer.setData('application/x-md-machine', card.dataset.machine!); event.dataTransfer.setData('text/plain', card.dataset.machine!); event.dataTransfer.effectAllowed = 'copy'; document.body.classList.add('dragging'); });
  document.addEventListener('dragend', () => { document.body.classList.remove('dragging'); document.querySelectorAll('.drop-over').forEach(e => e.classList.remove('drop-over')); });
  const acceptDrop = (event: DragEvent) => { if (working || !event.dataTransfer?.types.includes('application/x-md-machine')) return; const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-slot]'); if (cell) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; cell.classList.add('drop-over'); } };
  $('slots-active').addEventListener('dragenter', acceptDrop);
  $('slots-active').addEventListener('dragover', acceptDrop);
  $('slots-active').addEventListener('dragleave', event => (event.target as HTMLElement).closest('[data-slot]')?.classList.remove('drop-over'));
  $('slots-active').addEventListener('drop', event => { event.preventDefault(); document.body.classList.remove('dragging'); const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-slot]'), key = event.dataTransfer?.getData('application/x-md-machine'), machine = machines.find(m => m.key === key); if (cell && machine) addJob(machine, Number(cell.dataset.slot)); });
  $('slots-active').addEventListener('click', event => { const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-slot]'); if (cell && !working) { selectedSlot = Number(cell.dataset.slot); renderSlots(); renderDetail(); if (mobile.matches) { if (mobileMachine) reviewMobileSlot(selectedSlot); else { toast(slotName(selectedSlot) + ' ausgewählt. Tippe eine Machine an, um ihre Details zu öffnen.'); showMobileView('library'); } } } });
  $('jobs').addEventListener('click', event => { const button = (event.target as HTMLElement).closest<HTMLElement>('[data-remove]'); if (button && !working) { jobs = jobs.filter(j => j.id !== button.dataset.remove); renderSlots(); renderQueue(); } });
  $('connection').onclick = () => { if (session) void disconnect(); else $<HTMLDialogElement>('midi-dialog').showModal(); };
  $('midi-access').onclick = async () => {
    try {
      if (!window.isSecureContext || !navigator.requestMIDIAccess) throw new Error('WebMIDI ist hier nicht verfügbar. Öffne diese Seite in Chrome/Edge über localhost oder HTTPS.');
      midi = await navigator.requestMIDIAccess({ sysex: true }); if (!midi.sysexEnabled) throw new Error('Bitte Zugriff auf MIDI einschließlich SysEx erlauben.');
      fillPorts(); $('port-fields').hidden = false; $('midi-access').hidden = true; $('midi-error').textContent = '';
    } catch (error) { $('midi-error').textContent = String(error); }
  };
  $('connect-now').onclick = () => void action(async signal => {
    if (!midi) throw new Error('MIDI-Zugriff zuerst erlauben.');
    const input = midi.inputs.get($<HTMLSelectElement>('input-port').value), output = midi.outputs.get($<HTMLSelectElement>('output-port').value);
    if (!input || !output) throw new Error('Bitte MIDI-Ein- und Ausgang auswählen.');
    await acquireLock();
    try {
      await input.open(); await output.open();
      native = new WebMidiLink(midi, input, output, () => { controller?.abort(); if (session) session.needsReconnect = true; invalidate(); renderConnection(); toast('MIDI-Verbindung verloren. Bitte trennen und neu verbinden.', true); });
      session = new Session(native, $<HTMLSelectElement>('profile').value === 'x20c');
      await session.connect(signal); $<HTMLDialogElement>('midi-dialog').close(); renderConnection(); await scan(signal);
    } catch (e) {
      const old = native; native = undefined; session = undefined;
      try { if (old) await old.close(); else await Promise.allSettled([input.close(), output.close()]); }
      finally { lockRelease?.(); lockRelease = undefined; invalidate(); }
      $('midi-error').textContent = String(e); throw e;
    }
  });
  $('scan').onclick = () => void action(scan);
  $('cancel').onclick = () => controller?.abort();
  $('try-demo').onclick = () => void action(async signal => {
    const link = new DemoLink(); for (const [slot, n] of [[3, 2], [4, 14], [6, 30], [11, 52]]) link.memory.set(slot, await packageFor(machines[n]));
    demo = true; session = new Session(link, true, { hold: 5, gap: 5 });
    await session.connect(signal); renderConnection(); await scan(signal);
  });
  $('exit-demo').onclick = () => void disconnect();
  $('load').onclick = () => void action(async signal => {
    if (!session) throw new Error('Zuerst MIDI verbinden.');
    for (const job of jobs.filter(j => j.status === 'queued')) {
      if (signal.aborted) break;
      job.status = 'running'; job.message = 'Vorbereitung'; renderQueue();
      try {
        const data = await packageFor(job.machine);
        const result = await session.install(data, job.target, async backup => { if (!demo) await saveBackup(backup); }, p => { job.message = p.stage; job.fraction = p.fraction; renderQueue(); }, commit => {
          job.commit = commit; job.status = 'done'; job.fraction = 1; job.message = demo ? 'Demo: geladen' : 'Geladen';
          slots[job.target.slot - 1] = { slot: job.target.slot, status: 'occupied', info: job.machine, source: 'Durch Commit-ACK bestätigt', checkedAt: commit.receivedAt };
          renderSlots(); renderStats(); renderQueue();
        }, signal);
        slots[job.target.slot - 1] = result; job.status = 'done'; job.message = demo ? 'Demo: geladen' : 'Geladen';
        renderSlots(); renderStats(); renderQueue();
      } catch (error) {
        job.status = job.commit ? 'done' : 'error'; job.message = (job.commit ? 'Geladen · Abschlussfehler: ' : '') + (error instanceof Error ? error.message : String(error));
        if (!job.commit) slots[job.target.slot - 1] = { slot: job.target.slot, status: 'unknown' };
        renderSlots(); renderStats(); renderQueue(); throw error;
      }
    }
  });
  $('backups').onclick = async () => {
    $<HTMLDialogElement>('backup-dialog').showModal();
    try {
      const backups = await getBackups();
      $('backup-list').innerHTML = backups.map(b => `<button class="backup-row" data-backup="${b.id}"><span><strong>${slotName(b.slot)} · ${esc(b.name)}</strong><small>${new Date(b.createdAt).toLocaleString('de-DE')} · ${esc(b.kind)}</small></span>${icon('arrow')}</button>`).join('') || '<p class="empty-state">Noch keine Backups. Vor jedem echten Ladevorgang werden Sicherungen angelegt.</p>';
      $('backup-list').onclick = event => { const id = (event.target as HTMLElement).closest<HTMLElement>('[data-backup]')?.dataset.backup, b = backups.find(b => b.id === id); if (b) download(b.bytes, 'MD-' + slotName(b.slot) + '-' + b.kind + '-' + b.createdAt.replace(/[:.]/g, '-') + (b.kind === 'commit' ? '.json' : '.syx')); };
    } catch (e) { $('backup-list').textContent = 'Browserspeicher nicht verfügbar: ' + String(e); }
  };
  $('log').onclick = () => download(new TextEncoder().encode(JSON.stringify({ version: '0.1.0', demo, device: session?.state, slots, jobs, trace: session?.trace ?? [] }, null, 2)), 'webloader-protokoll.json', 'application/json');
  document.addEventListener('keydown', event => { if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('search').focus(); } });
  window.addEventListener('beforeunload', event => { if (working) { event.preventDefault(); event.returnValue = ''; } });
}
async function init() {
  shell(); events(); renderSlots(); renderQueue(); showMobileView('library');
  try {
    const response = await fetch('./catalog.json'); if (!response.ok) throw new Error('Katalog fehlt. Bitte npm run catalog ausführen.');
    const catalog = await response.json(); machines = catalog.machines;
    if (!machines.length) throw new Error('Der Katalog enthält keine Machines.');
    for (const [id, values] of [['manufacturer', [...new Set(machines.map(m => m.manufacturer))].sort()], ['category', [...new Set(machines.map(m => m.category))].sort()]] as [string, string[]][]) {
      $<HTMLSelectElement>(id).insertAdjacentHTML('beforeend', values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join(''));
    }
    selected = machines.find(m => m.key.includes('SYN-MW')) ?? machines[0]; renderLibrary(); renderDetail();
  } catch (error) { toast(String(error), true); }
}
void init();
