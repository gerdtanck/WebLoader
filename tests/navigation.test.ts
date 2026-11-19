import test from 'node:test';
import assert from 'node:assert/strict';
import { Navigation } from '../src/navigation.ts';
import type { Route } from '../src/navigation.ts';

function browser() {
  const stack: unknown[] = [{ external: true }, null], renders: Route[] = [], pending: number[] = [];
  let cursor = 1;
  const history = {
    get state() { return stack[cursor]; },
    pushState(state: unknown) { stack.splice(++cursor); stack.push(state); },
    replaceState(state: unknown) { stack[cursor] = state; },
    go(delta: number) { pending.push(delta); },
  };
  const navigation = new Navigation(history, route => renders.push(route));
  function flush() { assert.equal(pending.length, 1); cursor += pending.shift()!; navigation.restore(history.state); }
  return { history, navigation, pending, renders, flush, get cursor() { return cursor; } };
}
const detail: Route = { view: 'detail', machine: 'jmamma/SYN-O1.syx', image: false };
const image: Route = { ...detail, image: true };

test('Back closes the image, returns to the library, then permits leaving the site', () => {
  const b = browser(); b.navigation.open(detail, true); b.navigation.open(image);
  b.history.go(-1); b.flush(); assert.deepEqual(b.renders.at(-1), detail);
  b.history.go(-1); b.flush(); assert.equal(b.renders.at(-1)?.view, 'library');
  assert.equal(b.cursor, 1);
  b.history.go(-1); b.flush(); assert.equal(b.cursor, 0);
});

test('Direct library return skips the image and detail entries; Forward restores the selected machine', () => {
  const b = browser(); b.navigation.open(detail); b.navigation.open(image);
  b.navigation.toLibrary(); b.navigation.toLibrary(); b.navigation.back();
  assert.deepEqual(b.pending, [-2]); b.flush(); assert.equal(b.navigation.current.view, 'library');
  b.history.go(1); b.flush(); assert.deepEqual(b.navigation.current, detail);
  b.history.go(1); b.flush(); assert.deepEqual(b.navigation.current, image);
});

test('Repeated native dialog closes leave no extra Back steps or duplicate navigation', () => {
  const b = browser(); b.navigation.open(detail);
  for (let i = 0; i < 3; i++) {
    b.navigation.open(image); b.navigation.open(image);
    b.navigation.back(); b.navigation.back(); b.flush();
    assert.deepEqual(b.navigation.current, detail);
  }
  b.navigation.back(); b.flush(); assert.equal(b.cursor, 1);
});

test('Reload retains a valid route; unrelated or malformed history state starts at the library', () => {
  const b = browser(); b.navigation.open(detail); b.navigation.open(image);
  const restored = new Navigation(b.history, () => {});
  assert.deepEqual(restored.current, image); restored.toLibrary(); assert.deepEqual(b.pending, [-2]);
  for (const state of [null, { external: true }, { webloaderNavigation: 1, index: -1 }, { webloaderNavigation: 1, index: 3, route: { view: 'invalid' } }]) {
    b.history.replaceState(state);
    const nav = new Navigation(b.history, () => {});
    assert.deepEqual(nav.current, { view: 'library', image: false });
  }
});

test('Closing an image keeps a machine selected on desktop after rotating out of mobile view', () => {
  const b = browser(); b.navigation.open(detail);
  const other = { ...image, machine: 'jmamma/SYN-O3.syx' };
  b.navigation.open(other); b.navigation.back(); b.flush();
  assert.deepEqual(b.navigation.current, { ...other, image: false });
});
