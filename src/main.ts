import './style.css';
import './mobile.css';
import { decodeDump, sha256 } from './protocol.ts';
import type { MachineInfo } from './protocol.ts';
import { Session } from './session.ts';
import type { SlotState, Commit } from './session.ts';
import { WebMidiLink } from './webmidi.ts';
import { download } from './download.ts';
import { Navigation } from './navigation.ts';
import type { MobileView, Route } from './navigation.ts';

interface Machine extends MachineInfo { key: string; manufacturer: string; file: string; image: string; fileHash: string; originalSlot: number; fileVersion?: string }
interface Job { id: string; machine: Machine; target: SlotState; status: 'queued' | 'running' | 'done' | 'error'; message: string; fraction: number; commit?: Commit }
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const slotName = (n: number) => 'U' + String(n).padStart(2, '0');
const kb = (n: number) => (n / 1024).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + ' KB';
let machines: Machine[] = [], selected: Machine | undefined, session: Session | undefined, native: WebMidiLink | undefined, midi: MIDIAccess | undefined;
let working = false, controller: AbortController | undefined, jobs: Job[] = [], selectedSlot = 1;
let slots: SlotState[] = Array.from({ length: 48 }, (_, i) => ({ slot: i + 1, status: 'unknown' }));
let lockRelease: (() => void) | undefined;
const mobile = matchMedia('(max-width: 740px)');
let navigation: Navigation | undefined;
let mobileView: MobileView = 'library', mobileMachine: Machine | undefined;
const mobileScroll: Record<MobileView, number> = { library: 0, detail: 0, slots: 0, queue: 0 };
function showMobileView(view: MobileView, resetScroll = false) {
  if (navigation && mobile.matches) {
    if (view === 'library') navigation.toLibrary();
    else navigation.open({ view, machine: selected?.key, image: false }, resetScroll);
    return;
  }
  renderMobileView(view, resetScroll);
}
function renderMobileView(view: MobileView, resetScroll = false) {
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
function applyRoute(route: Route, resetScroll: boolean) {
  const dialog = $<HTMLDialogElement>('image-dialog');
  if (!route.image && dialog.open) dialog.close();
  const machine = machines.find(m => m.key === route.machine);
  if (machine && machine !== selected) { selected = machine; renderLibrary(); renderDetail(); }
  if (route.view !== mobileView || resetScroll) renderMobileView(route.view, resetScroll);
  if (route.image && machine) {
    $<HTMLImageElement>('large-image').src = machine.image;
    $<HTMLImageElement>('large-image').alt = 'Description ' + machine.name;
    if (!dialog.open) { $('image-dialog-content').scrollTop = 0; dialog.showModal(); }
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
  $('slot-review-title').textContent = mobileMachine.name + ' / ' + slotName(slot);
  $('slot-review-content').textContent = duplicate ? 'This slot already has a queued transfer.' : target.status === 'occupied' ? 'Replaces ' + target.info!.name + '.' : target.status === 'empty' ? 'Empty slot.' : 'Scan slots before loading.';
  $<HTMLButtonElement>('confirm-slot').disabled = duplicate;
  $<HTMLDialogElement>('slot-dialog').showModal();
}
const cache = new Map<string, Uint8Array>();
function toast(message: string, error = false) { $('notice').textContent = message; $('notice').className = 'notice visible' + (error ? ' error' : ''); }
function clearNotice() { $('notice').className = 'notice'; }
function invalidate() { slots = slots.map(s => ({ slot: s.slot, status: 'unknown' })); renderSlots(); renderStats(); }
function shell() {
  $('app').innerHTML = `
    <header class="topbar"><a class="brand" href="./">Machinedrum WebLoader</a><button id="connection" class="connect">Connect MIDI</button></header>
    <main>
      <div id="notice" class="notice" role="status" aria-live="polite"></div>
      <div class="workspace">
        <section class="library panel" aria-label="Machine library">
          <div class="panel-title"><h2>Library</h2><span id="catalog-count" class="count">…</span></div>
          <div class="search-wrap"><input id="search" type="search" placeholder="Search machines" aria-label="Search machines"></div>
          <div class="filters"><select id="manufacturer" aria-label="Author"><option value="">All authors</option></select><select id="category" aria-label="Category"><option value="">All categories</option></select></div>
          <div id="library-list" class="machine-list"></div>
        </section>
        <section class="device panel" aria-label="Machinedrum slots">
          <div class="panel-title"><h2>Slots</h2><span id="device-status" class="device-status">Not connected</span></div>
          <div class="device-toolbar"><div><h3>Current bank</h3><span id="bank-note">Selected on device</span></div><button id="scan" disabled>Refresh</button></div>
          <div class="stats"><div><strong id="used">—</strong><span>Used</span></div><div><strong id="free">—</strong><span>Free</span></div><div><strong id="unknown">48</strong><span>Unknown</span></div><div class="memory"><strong id="memory">—</strong><span>Free program memory</span></div></div>
          <div id="mobile-selection" class="mobile-only mobile-selection" hidden><div><span>Choose a slot for</span><strong id="mobile-machine-name"></strong></div><button id="clear-mobile-selection" class="icon-button" aria-label="Clear machine selection">×</button></div>
          <div class="slot-section-label"><span>U01–U16</span><span class="desktop-only">Drop a machine onto a slot</span><span class="mobile-only">Tap a slot</span></div>
          <div id="slots-active" class="slot-grid"></div>
          <details class="extended-slots"><summary>U17–U48 <span>Unavailable</span></summary><div id="slots-extended" class="slot-grid"></div></details>
          <p id="scan-note" class="scan-note">Connect to read slots.</p>
        </section>
        <aside class="detail panel" aria-label="Machine details"><button id="back-to-library" class="mobile-only mobile-back">Back to library</button><div class="panel-title"><h2>Details</h2></div><div id="detail-content"></div></aside>
      </div>
      <section class="queue panel" aria-label="Transfers"><div class="queue-top"><div><h2>Transfers</h2><span id="queue-count" class="count">0</span></div><div><button id="cancel" hidden>Cancel</button><button id="load" class="primary" disabled>Load machines</button></div></div><div id="jobs"></div></section>
      <footer><button id="log" class="text-button">Export transfer log</button></footer>
    </main>
    <nav class="mobile-nav" aria-label="Main navigation"><button data-mobile-view="library" aria-current="page">Library</button><button data-mobile-view="slots">Slots</button><button data-mobile-view="queue">Transfers <b id="mobile-queue-count">0</b></button></nav>
    <dialog id="slot-dialog" aria-labelledby="slot-review-title"><form method="dialog"><div class="dialog-heading"><h2 id="slot-review-title"></h2><button class="icon-button" aria-label="Close slot selection">×</button></div></form><p id="slot-review-content"></p><button id="confirm-slot" class="primary">Add to queue</button></dialog>
    <dialog id="midi-dialog" aria-labelledby="midi-title"><form method="dialog"><div class="dialog-heading"><h2 id="midi-title">MIDI connection</h2><button class="icon-button" aria-label="Close MIDI settings">×</button></div></form><p>Requires MDX X.20.</p><button id="midi-access" class="primary">Allow MIDI access</button><div id="port-fields" hidden><label>MIDI input<select id="input-port"></select></label><label>MIDI output<select id="output-port"></select></label><label>Device profile<select id="profile"><option value="x20c">MKI UW+ · X.20 C</option><option value="standard">MDX X.20 · Standard</option></select></label><button id="connect-now" class="primary">Connect and scan</button></div><p id="midi-error" class="dialog-message" role="status"></p></dialog>
    <dialog id="image-dialog" aria-label="Machine description"><div id="image-dialog-content" class="image-dialog-content" tabindex="0" autofocus role="region" aria-label="Description image"><form method="dialog" class="desktop-only"><button class="icon-button" aria-label="Close description">×</button></form><img id="large-image" alt="Machine description"></div><div class="mobile-only image-dialog-actions"><button id="image-to-library">Back to library</button><button id="close-image">Close</button></div></dialog>`;
}
function renderLibrary() {
  const query = $<HTMLInputElement>('search').value.toLowerCase(), manufacturer = $<HTMLSelectElement>('manufacturer').value, category = $<HTMLSelectElement>('category').value;
  const filtered = machines.filter(m => (!manufacturer || m.manufacturer === manufacturer) && (!category || m.category === category) && (m.name + ' ' + m.key + ' ' + m.category).toLowerCase().includes(query));
  $('catalog-count').textContent = filtered.length + ' / ' + machines.length;
  $('library-list').innerHTML = filtered.map(m => `<button class="machine-card ${selected?.key === m.key ? 'selected' : ''}" draggable="${!mobile.matches}" data-machine="${esc(m.key)}" aria-pressed="${selected?.key === m.key}"><span class="machine-label"><strong>${esc(m.category)}-${esc(m.label)} <small>${m.fileVersion ? 'v' + esc(m.fileVersion) : ''}</small></strong><span>${esc(m.name)}</span><em>${esc(m.manufacturer)}</em></span><span class="machine-size">${kb(m.programWords * 3)}</span></button>`).join('') || '<div class="empty-state">No matches.</div>';
}
function renderDetail() {
  if (!selected) return;
  const m = selected;
  $('detail-content').innerHTML = `<div class="detail-heading"><div class="eyebrow">${esc(m.manufacturer)}</div><h2>${esc(m.name)}</h2><span class="tag">${m.fileVersion ? 'File v' + esc(m.fileVersion) : 'MDS ' + esc(m.mdsVersion)}</span></div><button id="show-image" class="description-preview" aria-label="Open description"><img src="${esc(m.image)}" alt="Description ${esc(m.name)}" loading="lazy"><span>Open description</span></button><dl><div><dt>Version</dt><dd>${esc(m.version || 'Not specified')}</dd></div><div><dt>Program</dt><dd>${kb(m.programWords * 3)}</dd></div></dl><div class="target-control"><label for="target-slot">Target slot</label><select id="target-slot">${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}" ${selectedSlot === i + 1 ? 'selected' : ''}>${slotName(i + 1)}</option>`).join('')}</select><button id="add-job" class="primary" ${working ? 'disabled' : ''}>Add to queue</button></div><a class="sysex-download" href="${esc(m.file)}" download>Download SysEx</a>`;
  $('show-image').onclick = () => navigation?.open({ view: mobileView, machine: m.key, image: true });
  $('add-job').onclick = () => addJob(m, Number($<HTMLSelectElement>('target-slot').value));
  $('detail-content').insertAdjacentHTML('beforeend', '<div class="mobile-only mobile-detail-action"><button id="choose-mobile-slot" class="primary">Choose slot</button></div>');
  $('choose-mobile-slot').onclick = () => { mobileMachine = m; renderMobileSelection(); showMobileView('slots', true); };
  $<HTMLButtonElement>('choose-mobile-slot').disabled = working;
  $('target-slot').onchange = () => { selectedSlot = Number($<HTMLSelectElement>('target-slot').value); renderSlots(); };
}
function renderSlots() {
  const markup = (s: SlotState) => {
    const queued = jobs.find(j => j.target.slot === s.slot && ['queued', 'running'].includes(j.status)), enabled = s.slot <= 16;
    return `<button class="slot ${s.status} ${queued ? 'planned' : ''} ${selectedSlot === s.slot ? 'chosen' : ''} ${!enabled ? 'unavailable' : ''}" data-slot="${s.slot}" ${!enabled ? 'disabled' : ''} aria-label="${slotName(s.slot)}: ${esc(queued ? queued.machine.name + ' queued' : s.info?.name || (s.status === 'empty' ? 'Empty' : 'Unknown'))}"><span class="slot-number">${slotName(s.slot)}</span><strong>${esc(queued?.machine.name || s.info?.name || (s.status === 'empty' ? 'Empty' : '—'))}</strong><span class="slot-state">${queued ? (queued.status === 'running' ? 'Loading' : 'Queued') : s.status === 'occupied' ? 'Occupied' : s.status === 'empty' ? 'Available' : 'Unknown'}</span></button>`;
  };
  $('slots-active').innerHTML = slots.slice(0, 16).map(markup).join(''); $('slots-extended').innerHTML = slots.slice(16).map(markup).join('');
}
function renderStats() {
  $('used').textContent = String(slots.filter(s => s.status === 'occupied').length);
  $('free').textContent = String(slots.filter(s => s.status === 'empty').length);
  $('unknown').textContent = String(slots.filter(s => s.status === 'unknown').length);
  const cap = session?.state?.caps; $('memory').textContent = cap?.source === 'device' && cap.freeWords !== undefined ? kb(cap.freeWords * 3) : 'Unknown';
}
function renderQueue() {
  $('queue-count').textContent = String(jobs.filter(j => j.status === 'queued').length);
  $('mobile-queue-count').textContent = String(jobs.filter(j => ['queued', 'running'].includes(j.status)).length);
  $('jobs').innerHTML = jobs.map(j => `<div class="job ${j.status}"><span class="job-target">${slotName(j.target.slot)}</span><div class="job-name"><strong>${esc(j.machine.name)}</strong><span>${esc(j.target.info ? 'Replaces ' + j.target.info.name : j.target.status === 'empty' ? 'Empty slot' : 'Target checked before loading')}</span></div><span class="job-message">${esc(j.message)}</span><progress max="1" value="${j.fraction}" aria-label="Transfer progress ${slotName(j.target.slot)}"></progress><button data-remove="${j.id}" class="icon-button" aria-label="Remove transfer" ${working ? 'disabled' : ''}>×</button></div>`).join('') || '<div class="queue-empty">Queue is empty.</div>';
  $<HTMLButtonElement>('load').disabled = working || !session?.state || session.needsReconnect || !jobs.some(j => j.status === 'queued');
}
function renderConnection() {
  $('device-status').textContent = session?.needsReconnect ? 'Reconnect' : working ? 'Busy' : session?.state ? 'X.20 connected' : 'Not connected';
  $('device-status').className = 'device-status' + (session?.state && !session.needsReconnect ? ' connected' : '');
  $('connection').textContent = (session ? 'Disconnect' : 'Connect MIDI');
  $<HTMLButtonElement>('connection').disabled = working; $<HTMLButtonElement>('scan').disabled = working || !session?.state || session.needsReconnect;
  $('cancel').hidden = !working; $('bank-note').textContent = 'Selected on device';
  if ($('add-job')) $<HTMLButtonElement>('add-job').disabled = working;
  if ($('choose-mobile-slot')) $<HTMLButtonElement>('choose-mobile-slot').disabled = working;
  renderQueue();
}
function addJob(machine: Machine, slot: number) {
  if (working) return false;
  if (slot > 16) { toast('Transfers to U17–U48 are not supported yet.', true); return false; }
  if (jobs.some(j => j.target.slot === slot && j.status !== 'done')) { toast(slotName(slot) + ' already has a queued transfer.'); return false; }
  jobs.push({ id: crypto.randomUUID(), machine, target: { ...slots[slot - 1] }, status: 'queued', message: 'Ready', fraction: 0 });
  selectedSlot = slot; renderSlots(); renderQueue(); toast(machine.name + ' / ' + slotName(slot) + ' queued.');
  return true;
}
async function packageFor(m: Machine) {
  if (cache.has(m.key)) return cache.get(m.key)!;
  const response = await fetch(m.file); if (!response.ok) throw new Error('Could not fetch the machine file.');
  const raw = new Uint8Array(await response.arrayBuffer());
  if (await sha256(raw) !== m.fileHash) throw new Error('File does not match the catalog.');
  const { data, info } = await decodeDump(raw); if (info.sha256 !== m.sha256) throw new Error('Package does not match the catalog.');
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
  invalidate(); $('scan-note').textContent = 'Reading current bank…';
  await session.scan(s => { slots[s.slot - 1] = s; renderSlots(); renderStats(); $('scan-note').textContent = slotName(s.slot) + ' read…'; }, signal);
  // Jobs made offline have not reviewed a device target; require re-adding if occupied.
  for (const job of jobs) if (job.status === 'queued' && job.target.status === 'unknown' && slots[job.target.slot - 1].status === 'empty') job.target = { ...slots[job.target.slot - 1] };
  $('scan-note').textContent = 'U01–U16 updated · ' + new Date().toLocaleTimeString('en-GB') + '. Refresh after changing banks.';
  renderQueue();
}
async function disconnect() {
  if (working) return;
  const old = native; native = undefined; session = undefined; jobs = []; invalidate();
  try { await old?.close(); } finally { lockRelease?.(); lockRelease = undefined; renderConnection(); }
  $('scan-note').textContent = 'Disconnected. Reconnect to refresh slots.';
}
async function acquireLock(): Promise<void> {
  if (!navigator.locks) throw new Error('MIDI session locking is unavailable. Use Chrome or Edge.');
  await new Promise<void>((resolve, reject) => {
    void navigator.locks.request('machinedrum-webloader-midi', { ifAvailable: true }, async lock => {
      if (!lock) { reject(new Error('Another WebLoader tab is using MIDI.')); return; }
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
  $('image-to-library').onclick = () => navigation?.toLibrary();
  $('close-image').onclick = () => $<HTMLDialogElement>('image-dialog').close();
  // Native Android dismiss gestures and Escape close the dialog first. Consume
  // its history entry too, so the next Back goes to the library, not an empty step.
  $('image-dialog').addEventListener('close', () => {
    if (!$<HTMLDialogElement>('image-dialog').open && navigation?.current.image) navigation.back();
  });
  window.addEventListener('popstate', event => navigation?.restore(event.state));
  $('clear-mobile-selection').onclick = () => { mobileMachine = undefined; renderMobileSelection(); };
  $('confirm-slot').onclick = () => {
    if (mobileMachine && addJob(mobileMachine, selectedSlot)) {
      $<HTMLDialogElement>('slot-dialog').close(); mobileMachine = undefined; renderMobileSelection(); showMobileView('queue', true);
    }
  };
  mobile.addEventListener('change', () => { renderLibrary(); renderMobileView(mobileView); });
  for (const id of ['search', 'manufacturer', 'category']) $(id).addEventListener(id === 'search' ? 'input' : 'change', renderLibrary);
  $('library-list').addEventListener('click', event => { const card = (event.target as HTMLElement).closest<HTMLElement>('[data-machine]'); if (!card) return; selected = machines.find(m => m.key === card.dataset.machine); renderLibrary(); renderDetail(); if (mobile.matches) showMobileView('detail', true); });
  $('library-list').addEventListener('dragstart', event => { const card = (event.target as HTMLElement).closest<HTMLElement>('[data-machine]'); if (!card || !event.dataTransfer || working) { event.preventDefault(); return; } event.dataTransfer.setData('application/x-md-machine', card.dataset.machine!); event.dataTransfer.setData('text/plain', card.dataset.machine!); event.dataTransfer.effectAllowed = 'copy'; document.body.classList.add('dragging'); });
  document.addEventListener('dragend', () => { document.body.classList.remove('dragging'); document.querySelectorAll('.drop-over').forEach(e => e.classList.remove('drop-over')); });
  const acceptDrop = (event: DragEvent) => { if (working || !event.dataTransfer?.types.includes('application/x-md-machine')) return; const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-slot]'); if (cell) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; cell.classList.add('drop-over'); } };
  $('slots-active').addEventListener('dragenter', acceptDrop);
  $('slots-active').addEventListener('dragover', acceptDrop);
  $('slots-active').addEventListener('dragleave', event => (event.target as HTMLElement).closest('[data-slot]')?.classList.remove('drop-over'));
  $('slots-active').addEventListener('drop', event => { event.preventDefault(); document.body.classList.remove('dragging'); const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-slot]'), key = event.dataTransfer?.getData('application/x-md-machine'), machine = machines.find(m => m.key === key); if (cell && machine) addJob(machine, Number(cell.dataset.slot)); });
  $('slots-active').addEventListener('click', event => { const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-slot]'); if (cell && !working) { selectedSlot = Number(cell.dataset.slot); renderSlots(); renderDetail(); if (mobile.matches) { if (mobileMachine) reviewMobileSlot(selectedSlot); else { toast(slotName(selectedSlot) + ' selected. Choose a machine.'); showMobileView('library'); } } } });
  $('jobs').addEventListener('click', event => { const button = (event.target as HTMLElement).closest<HTMLElement>('[data-remove]'); if (button && !working) { jobs = jobs.filter(j => j.id !== button.dataset.remove); renderSlots(); renderQueue(); } });
  $('connection').onclick = () => { if (session) void disconnect(); else $<HTMLDialogElement>('midi-dialog').showModal(); };
  $('midi-access').onclick = async () => {
    try {
      if (!window.isSecureContext || !navigator.requestMIDIAccess) throw new Error('WebMIDI is unavailable. Use Chrome or Edge over HTTPS or localhost.');
      midi = await navigator.requestMIDIAccess({ sysex: true }); if (!midi.sysexEnabled) throw new Error('Allow MIDI access including SysEx.');
      fillPorts(); $('port-fields').hidden = false; $('midi-access').hidden = true; $('midi-error').textContent = '';
    } catch (error) { $('midi-error').textContent = String(error); }
  };
  $('connect-now').onclick = () => void action(async signal => {
    if (!midi) throw new Error('Allow MIDI access first.');
    const input = midi.inputs.get($<HTMLSelectElement>('input-port').value), output = midi.outputs.get($<HTMLSelectElement>('output-port').value);
    if (!input || !output) throw new Error('Select MIDI input and output.');
    await acquireLock();
    try {
      await input.open(); await output.open();
      native = new WebMidiLink(midi, input, output, () => { controller?.abort(); if (session) session.needsReconnect = true; invalidate(); renderConnection(); toast('MIDI connection lost. Disconnect and reconnect.', true); });
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
  $('load').onclick = () => void action(async signal => {
    if (!session) throw new Error('Connect MIDI first.');
    for (const job of jobs.filter(j => j.status === 'queued')) {
      if (signal.aborted) break;
      job.status = 'running'; job.message = 'Preparing'; renderQueue();
      try {
        const data = await packageFor(job.machine);
        const result = await session.install(data, job.target, p => { job.message = p.stage; job.fraction = p.fraction; renderQueue(); }, commit => {
          job.commit = commit; job.status = 'done'; job.fraction = 1; job.message = 'Loaded';
          slots[job.target.slot - 1] = { slot: job.target.slot, status: 'occupied', info: job.machine, source: 'Confirmed by commit ACK', checkedAt: commit.receivedAt };
          renderSlots(); renderStats(); renderQueue();
        }, signal);
        slots[job.target.slot - 1] = result; job.status = 'done'; job.message = 'Loaded';
        renderSlots(); renderStats(); renderQueue();
      } catch (error) {
        job.status = job.commit ? 'done' : 'error'; job.message = (job.commit ? 'Loaded · completion error: ' : '') + (error instanceof Error ? error.message : String(error));
        if (!job.commit) slots[job.target.slot - 1] = { slot: job.target.slot, status: 'unknown' };
        renderSlots(); renderStats(); renderQueue(); throw error;
      }
    }
  });
  $('log').onclick = () => download(new TextEncoder().encode(JSON.stringify({ version: '0.1.0', device: session?.state, slots, jobs, trace: session?.trace ?? [] }, null, 2)), 'webloader-log.json', 'application/json');
  document.addEventListener('keydown', event => { if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('search').focus(); } });
  window.addEventListener('beforeunload', event => { if (working) { event.preventDefault(); event.returnValue = ''; } });
}
async function init() {
  shell(); events(); renderSlots(); renderQueue(); showMobileView('library');
  try {
    const response = await fetch('./catalog.json'); if (!response.ok) throw new Error('Catalog unavailable.');
    const catalog = await response.json(); machines = catalog.machines;
    if (!machines.length) throw new Error('The catalog is empty.');
    for (const [id, values] of [['manufacturer', [...new Set(machines.map(m => m.manufacturer))].sort()], ['category', [...new Set(machines.map(m => m.category))].sort()]] as [string, string[]][]) {
      $<HTMLSelectElement>(id).insertAdjacentHTML('beforeend', values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join(''));
    }
    selected = machines.find(m => m.key.includes('SYN-MW')) ?? machines[0]; renderLibrary(); renderDetail();
    history.scrollRestoration = 'manual';
    navigation = new Navigation(history, applyRoute);
    navigation.restore(history.state);
  } catch (error) { toast(String(error), true); }
}
void init();
