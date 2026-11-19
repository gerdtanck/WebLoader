export type MobileView = 'library' | 'detail' | 'slots' | 'queue';
export interface Route { view: MobileView; machine?: string; image: boolean }
interface Entry { webloaderNavigation: 1; index: number; route: Route }
type BrowserHistory = Pick<History, 'state' | 'pushState' | 'replaceState' | 'go'>;
const library = (): Route => ({ view: 'library', image: false });
function entry(value: unknown): Entry | undefined {
  const e = value as Entry | null;
  if (e?.webloaderNavigation !== 1 || !Number.isSafeInteger(e.index) || e.index < 0 ||
      !['library', 'detail', 'slots', 'queue'].includes(e.route?.view) ||
      typeof e.route.image !== 'boolean' || (e.route.machine !== undefined && typeof e.route.machine !== 'string')) return;
  return e;
}

// History entries represent UI navigation only; restoring one never starts MIDI work.
export class Navigation {
  private history: BrowserHistory;
  private change: (route: Route, resetScroll: boolean) => void;
  private active: Entry;
  private pending = false;
  constructor(history: BrowserHistory, change: (route: Route, resetScroll: boolean) => void) {
    this.history = history; this.change = change;
    this.active = entry(history.state) ?? { webloaderNavigation: 1, index: 0, route: library() };
    history.replaceState(this.active, '');
  }
  get current() { return this.active.route; }
  restore(state: unknown) {
    this.pending = false;
    this.active = entry(state) ?? { webloaderNavigation: 1, index: 0, route: library() };
    this.change(this.current, false);
  }
  open(route: Route, resetScroll = false) {
    if (this.pending || (route.view === this.current.view && route.machine === this.current.machine && route.image === this.current.image)) return;
    // Desktop selection can change without opening a new mobile detail view.
    // Closing its image must keep that selection, including after rotation.
    if (route.image && !this.current.image && route.machine !== this.current.machine) {
      this.active = { ...this.active, route: { ...this.current, machine: route.machine } };
      this.history.replaceState(this.active, '');
    }
    this.active = { webloaderNavigation: 1, index: this.active.index + 1, route };
    this.history.pushState(this.active, '');
    this.change(route, resetScroll);
  }
  back() {
    if (this.pending) return;
    if (this.active.index > 0) { this.pending = true; this.history.go(-1); }
  }
  toLibrary() {
    if (this.pending) return;
    if (this.active.index > 0) { this.pending = true; this.history.go(-this.active.index); }
    else { this.active = { webloaderNavigation: 1, index: 0, route: library() }; this.history.replaceState(this.active, ''); this.change(this.current, false); }
  }
}
