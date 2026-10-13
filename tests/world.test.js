import test from 'node:test';
import assert from 'node:assert/strict';
import { PixelWorld, drawPreview } from '../src/world.js';
import { NPC_LINES } from '../src/state.js';

const NPC_NAMES = ['Mr Jonathan', 'Mr Femi', 'Mr Ezekiel', 'Facility Manager', 'Kayode, the male rep', 'Mr Emmanuel', 'Mr Itunu'];

class FakeEventTarget {
  listeners = new Map();
  removed = [];
  added = [];

  addEventListener(type, listener, options) {
    this.added.push({ type, listener, options });
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.removed.push({ type, listener });
    this.listeners.get(type)?.delete(listener);
    if (!this.listeners.get(type)?.size) this.listeners.delete(type);
  }

  dispatch(type, properties = {}) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }

  get listenerCount() {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
  }
}

function fakeContext() {
  return {
    fills: [], texts: [], transforms: [], clears: [], fillStyle: '',
    fillRect(x, y, w, h) { this.fills.push({ x, y, w, h, color: this.fillStyle }); },
    fillText(value, x, y) { this.texts.push({ value, x, y, color: this.fillStyle }); },
    measureText(value) { return { width: String(value).length * 6 }; },
    clearRect(...values) {
      this.clears.push({ values, transform: this.transforms.at(-1) });
      this.fills.length = 0; this.texts.length = 0;
    },
    setTransform(...values) { this.transforms.push(values); },
    drawImage() {},
  };
}

function modal({ tagName = 'DIV', open = false, role = null, ariaModal = null,
  hidden = false, ariaHidden = null, visible = true } = {}) {
  return {
    tagName, open, hidden,
    getAttribute(name) {
      return { role, 'aria-modal': ariaModal, 'aria-hidden': ariaHidden }[name] ?? null;
    },
    getClientRects() { return visible && !hidden ? [{}] : []; },
  };
}

function matchesSelector(element, selector) {
  return selector.split(',').some(part => {
    const value = part.trim();
    if (value === 'dialog[open]') return element.tagName === 'DIALOG' && element.open;
    const attribute = /^\[([^=]+)="([^"]+)"\]$/.exec(value);
    return attribute && element.getAttribute(attribute[1]) === attribute[2];
  });
}

function createHarness(t, { camera = false, bounds = { left: 37, top: 59, width: 660, height: 350 }, dpr = 2, reducedMotion = null, onObjectsChange } = {}) {
  let time = 0;
  let serial = 0;
  const frames = new Map();
  const win = new FakeEventTarget();
  win.devicePixelRatio = dpr;
  if (reducedMotion !== null) {
    win.motionQuery = new FakeEventTarget();
    win.motionQuery.matches = reducedMotion;
    win.matchMedia = query => {
      assert.equal(query, '(prefers-reduced-motion: reduce)');
      return win.motionQuery;
    };
  }
  win.resizeObservers = [];
  win.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; win.resizeObservers.push(this); }
    observe(element) { this.element = element; }
    disconnect() { this.disconnected = true; }
  };
  win.performance = { now: () => time };
  win.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; };
  win.cancelAnimationFrame = id => frames.delete(id);
  const doc = {
    defaultView: win, activeElement: null, elements: [],
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) { return this.elements.filter(element => matchesSelector(element, selector)); },
    createElement(tagName) {
      assert.equal(tagName, 'canvas');
      const context = fakeContext();
      return { width: 0, height: 0, getContext: kind => kind === '2d' ? context : null };
    },
  };
  const ctx = fakeContext();
  const canvas = new FakeEventTarget();
  Object.assign(canvas, {
    ownerDocument: doc, width: 0, height: 0, style: { cursor: 'help', touchAction: 'pan-y' },
    bounds, captured: new Set(),
    setPointerCapture(id) { this.captured.add(id); },
    hasPointerCapture(id) { return this.captured.has(id); },
    releasePointerCapture(id) {
      this.captured.delete(id);
      this.dispatch('lostpointercapture', { pointerId: id });
    },
    getContext: kind => kind === '2d' ? ctx : null,
    getBoundingClientRect() { return this.bounds; },
  });
  const selections = [];
  const moves = [];
  const cameraChanges = [];
  const world = new PixelWorld(canvas, { camera, onObjectsChange, onCameraChange: state => cameraChanges.push(state),
    onInteract: object => selections.push(object), onMove: state => moves.push(state) });
  t.after(() => world.destroy());
  const frame = () => {
    time += 50;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(time));
  };
  const screenPointer = (type, x, y, properties = {}) => canvas.dispatch(type, {
    button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true,
    clientX: canvas.bounds.left + x, clientY: canvas.bounds.top + y, ...properties,
  });
  const pointer = (type, x, y, properties = {}) => {
    const view = world.getCamera();
    return screenPointer(type, camera ? (x - view.x) * view.scale : x * canvas.bounds.width / 1320,
      camera ? (y - view.y) * view.scale : y * canvas.bounds.height / 700, properties);
  };
  return { world, canvas, ctx, doc, win, frames, selections, moves, cameraChanges, frame, pointer, screenPointer };
}

function hasFill(ctx, x, y, w, h, color) {
  return ctx.fills.some(fill => fill.x === x && fill.y === y && fill.w === w && fill.h === h && fill.color === color);
}

function assertCollisionFree(world, point = world.player) {
  assert.ok(point.x >= 25 && point.x <= 1295 && point.y >= 29 && point.y <= 675, 'Inside outer walls');
  const layout = world.floors.get(point.floor ?? world.floor).layout;
  assert.ok(!layout.obstacles.some(o => point.x > o.x - 9 && point.x < o.x + o.w + 9 &&
    point.y > o.y - 9 && point.y < o.y + o.h + 9), `Obstacle collision at ${point.x}, ${point.y}`);
}

function assertSafeRoute(world, person = world.player, path = world.path) {
  let previous = { x: person.x, y: person.y };
  for (const point of path) {
    const steps = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / 2));
    for (let i = 1; i <= steps; i++) {
      assertCollisionFree(world, {
        floor: person.floor ?? world.floor,
        x: previous.x + (point.x - previous.x) * i / steps,
        y: previous.y + (point.y - previous.y) * i / steps,
      });
    }
    previous = point;
  }
}

function settle(harness) {
  const { world, frame } = harness;
  for (let i = 0; i < 500 && (world.path.length || world.pending); i++) {
    frame();
    if (!world.player.seated) assertCollisionFree(world);
  }
  assert.equal(world.path.length, 0, 'Route completed within 25 simulated seconds');
  assert.equal(world.pending, null);
}

test('boolean wearId renders a gold lanyard and cream photo badge via setPlayer in front/side views only', t => {
  const { world, ctx } = createHarness(t);
  const profile = { name: 'ID wearer', skin: '#ab7654', hair: '#30272c', shirt: '#5b938a' };
  for (const [direction, offset] of [['down', 0], ['left', -3], ['right', 3], ['up', 0]]) {
    world.player.direction = direction;
    const { x, y } = world.player;
    world.setPlayer({ ...profile, wearId: true });
    const visible = direction !== 'up';
    assert.equal(hasFill(ctx, x - 5 + offset, y - 29, 2, 6, '#d7b56a'), visible, `${direction} lanyard`);
    assert.equal(hasFill(ctx, x - 5 + offset, y - 21, 10, 11, '#c7a15a'), visible, `${direction} gold border`);
    assert.equal(hasFill(ctx, x - 4 + offset, y - 20, 8, 9, '#fff6df'), visible, `${direction} cream badge`);
    assert.equal(hasFill(ctx, x - 3 + offset, y - 18, 4, 6, '#98b9ae'), visible, `${direction} photo background`);
    if (visible) {
      assert.ok(hasFill(ctx, x - 2 + offset, y - 18, 2, 1, profile.hair));
      assert.ok(hasFill(ctx, x - 2 + offset, y - 17, 2, 2, profile.skin));
      assert.ok(hasFill(ctx, x - 3 + offset, y - 14, 4, 2, profile.shirt));
    }
    for (const wearId of [false, undefined, 'true']) {
      world.setPlayer({ wearId });
      assert.equal(hasFill(ctx, x - 5 + offset, y - 21, 10, 11, '#c7a15a'), false);
      assert.equal(hasFill(ctx, x - 5 + offset, y - 29, 2, 6, '#d7b56a'), false);
    }
  }
});

test('string accessories remain visible on NPCs and player profiles', t => {
  const { world, ctx } = createHarness(t, { reducedMotion: true });
  world.player.direction = 'down';
  world.layout.objects.find(object => object.name === 'Mr Femi').direction = 'down';
  world.setPlayer({ wearId: 'glasses' });
  const { x, y } = world.player;
  assert.ok(hasFill(ctx, x - 7, y - 39, 6, 1, '#36394b'));
  const femi = world.layout.objects.find(object => object.name === 'Mr Femi');
  assert.equal(femi.profile.wearId, 'glasses');
  assert.ok(hasFill(ctx, femi.x - 7, femi.y - 39, 6, 1, '#36394b'));
  const manager = world.layout.objects.find(object => object.name === 'Facility Manager');
  assert.equal(manager.profile.wearId, 'cap');
  assert.ok(ctx.fills.some(fill => fill.x === manager.x - 10 && fill.y === manager.y - 51 && fill.w === 20 && fill.h === 8));
  world.setPlayer({ wearId: 'cap' });
  assert.ok(ctx.fills.some(fill => fill.x === x - 10 && fill.y === y - 51 && fill.w === 20 && fill.h === 8));
  assert.equal(hasFill(ctx, x - 5, y - 21, 10, 11, '#c7a15a'), false);
});

test('floors share seven unique NPCs with correctly named, copied interactions', t => {
  const h = createHarness(t);
  h.world.setActive(true);
  for (const floor of [1, 2]) {
    h.world.setFloor(floor);
    const npcs = h.world.layout.objects.filter(object => object.type === 'npc');
    const names = floor === 1 ? NPC_NAMES.slice(0, 5) : NPC_NAMES.slice(5);
    assert.equal(npcs.length, names.length);
    assert.deepEqual(npcs.map(object => object.name), names);
    assert.deepEqual(npcs.map(object => object.label), names);
    assert.deepEqual(npcs.map(object => object.profile.name), names);
    for (const npc of npcs) {
      h.pointer('pointerdown', npc.x, npc.y - 20);
      const selection = h.selections.at(-1);
      assert.equal(selection.type, 'npc');
      assert.equal(selection.name, npc.name);
      assert.equal(selection.label, npc.name);
      assert.notEqual(selection, npc);
      assert.notEqual(selection.profile, npc.profile);
    }
    assert.ok(names.every(name => h.ctx.texts.some(item => item.value === name)));
  }
});

test('every unoccupied chair is individually selectable and has a collision-free route on both floors', t => {
  const h = createHarness(t);
  h.world.setActive(true);
  for (const floor of [1, 2]) {
    h.world.setFloor(floor);
    const chairs = h.world.layout.objects.filter(object => object.type === 'chair' && !object.occupantId);
    assert.equal(new Set(chairs.map(chair => chair.id)).size, chairs.length);
    for (const chair of chairs) {
      h.pointer('pointerdown', chair.x, chair.y);
      const selection = h.selections.at(-1);
      assert.equal(selection.id, chair.id);
      assert.equal(selection.type, 'chair');
      assert.equal(selection.action, 'Sit down');
      assert.equal(selection.tableId, chair.tableId);
      assert.ok(h.world.interact(selection), `Reachable chair: ${chair.id}`);
      assertSafeRoute(h.world);
    }
  }
});

test('chairs seat at every table and report floor-scoped table IDs; standing clears the seat', t => {
  const h = createHarness(t);
  h.world.setActive(true);
  const floorIds = [];
  for (const floor of [1, 2]) {
    h.world.setFloor(floor);
    floorIds.push(h.world.layout.tables.map(table => table.id));
    for (const table of h.world.layout.tables) {
      const chair = h.world.layout.objects.find(object => object.type === 'chair' && object.tableId === table.id);
      assert.ok(chair.id.startsWith(`floor-${floor}-`));
      assert.ok(table.id.startsWith(`floor-${floor}-`));
      assert.ok(h.world.interact(chair));
      assertSafeRoute(h.world);
      settle(h);
      assert.equal(h.world.player.seated, true);
      assert.equal(h.world.player.x, chair.x);
      assert.equal(h.world.player.y, chair.y + 6);
      assert.equal(h.world.player.tableId, table.id);
      assert.deepEqual(h.moves.at(-1), { x: Math.round(chair.x * 100) / 100, y: chair.y + 6, seated: true, tableId: table.id });
      h.world.stand();
      assert.equal(h.world.player.seated, false);
      assert.equal(h.world.player.tableId, null);
      assertCollisionFree(h.world);
      assert.equal(h.moves.at(-1).seated, false);
      assert.equal(h.moves.at(-1).tableId, null);
    }
  }
  assert.ok(floorIds[0].every(id => !floorIds[1].includes(id)));
});

test('beanbags seat without a table; floor changes clear seats and reject stale objects', t => {
  const h = createHarness(t);
  h.world.setActive(true);
  const bag = h.world.layout.objects.find(object => object.type === 'beanbag');
  assert.ok(h.world.interact(bag));
  settle(h);
  assert.equal(h.world.player.seated, true);
  assert.equal(h.world.player.tableId, null);
  h.world.stand();
  assertCollisionFree(h.world);
  const chair = h.world.layout.objects.find(object => object.type === 'chair');
  h.world.interact(chair);
  settle(h);
  h.world.setFloor(2);
  assert.deepEqual(h.moves.at(-1), { x: 655, y: 635, seated: false, tableId: null });
  assert.equal(h.world.seat, null);
  assert.equal(h.world.path.length, 0);
  assert.equal(h.world.pending, null);
  assert.equal(h.world.interact(chair), false);
  assert.equal(h.world.interact(bag), false);
  assert.equal(h.world.interact({ id: 'unknown' }), false);
  assert.throws(() => h.world.setFloor(3), RangeError);
});

test('stairs route safely and switch floors in both directions', t => {
  const h = createHarness(t);
  h.world.setActive(true);
  for (const [floor, targetFloor] of [[1, 2], [2, 1]]) {
    assert.equal(h.world.floor, floor);
    const stairs = h.world.layout.objects.find(object => object.type === 'stairs');
    h.pointer('pointerdown', stairs.x, stairs.y);
    assert.equal(h.selections.at(-1).type, 'stairs');
    assert.equal(h.selections.at(-1).targetFloor, targetFloor);
    assert.ok(h.world.interact(h.selections.at(-1)));
    assertSafeRoute(h.world);
    settle(h);
    assert.equal(h.world.floor, targetFloor);
    assert.deepEqual(h.moves.at(-1), { x: 655, y: 635, seated: false, tableId: null });
  }
});

test('DPR rendering and pointer scaling use logical coordinates across CSS sizes', t => {
  const h = createHarness(t);
  assert.equal(h.canvas.width, 2640);
  assert.equal(h.canvas.height, 1400);
  assert.deepEqual(h.ctx.transforms.at(-1), [2, 0, 0, 2, 0, 0]);
  h.world.setActive(true);
  const chair = h.world.layout.objects.find(object => object.type === 'chair');
  for (const bounds of [
    { left: 37, top: 59, width: 660, height: 350 },
    { left: 120, top: 240, width: 330, height: 175 },
    { left: 0, top: 0, width: 1320, height: 700 },
  ]) {
    h.canvas.bounds = bounds;
    h.pointer('pointerdown', chair.x, chair.y);
    assert.equal(h.selections.at(-1).id, chair.id);
  }
  h.win.devicePixelRatio = 3;
  h.win.dispatch('resize');
  assert.equal(h.canvas.width, 3960);
  assert.equal(h.canvas.height, 2100);
  assert.deepEqual(h.ctx.transforms.at(-1), [3, 0, 0, 3, 0, 0]);
  h.pointer('pointermove', chair.x, chair.y);
  assert.equal(h.canvas.style.cursor, 'pointer');
  h.canvas.dispatch('pointerleave');
  assert.equal(h.canvas.style.cursor, 'help');
  const count = h.selections.length;
  h.pointer('pointerdown', chair.x, chair.y, { button: 2 });
  assert.equal(h.selections.length, count);
  h.canvas.bounds = { left: 0, top: 0, width: 0, height: 0 };
  h.canvas.dispatch('pointerdown', { button: 0, clientX: 10, clientY: 10 });
  assert.equal(h.selections.length, count);
});

test('floor clicks route around desks, not through them, and wall/table clicks do not move', t => {
  const h = createHarness(t);
  h.world.setActive(true);
  Object.assign(h.world.player, { x: 205, y: 195 });
  h.pointer('pointerdown', 205, 65);
  assert.ok(h.world.path.length > 13, 'Must detour around the west desk');
  assertSafeRoute(h.world);
  settle(h);
  assert.equal(h.world.player.x, 205);
  assert.equal(h.world.player.y, 65);
  assert.equal(h.world.player.seated, false);
  for (const [x, y] of [[1, 200], [205, 133], [1319, 200]]) {
    h.pointer('pointerdown', x, y);
    assert.equal(h.world.path.length, 0);
  }
});

test('keyboard guards block editing and any open modal even without modal focus', t => {
  const h = createHarness(t);
  h.world.setActive(true);
  h.frame();
  const origin = { x: h.world.player.x, y: h.world.player.y };
  const assertBlocked = label => {
    const event = h.win.dispatch('keydown', { key: 'ArrowLeft' });
    assert.equal(event.defaultPrevented, false, label);
    assert.equal(h.world.keys.size, 0, label);
    h.frame();
    assert.equal(h.world.player.x, origin.x, label);
    assert.equal(h.world.player.y, origin.y, label);
  };
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    h.doc.activeElement = { tagName };
    assertBlocked(tagName);
  }
  h.doc.activeElement = { tagName: 'DIV', isContentEditable: true };
  assertBlocked('contenteditable');
  h.doc.activeElement = { tagName: 'SPAN', closest: selector => selector.includes('[role="textbox"]') ? {} : null };
  assertBlocked('textbox descendant');
  h.doc.activeElement = null;
  for (const element of [
    modal({ tagName: 'DIALOG', open: true }),
    modal({ tagName: 'DIALOG', open: true, visible: false }),
    modal({ role: 'dialog' }),
    modal({ role: 'alertdialog' }),
    modal({ ariaModal: 'true' }),
  ]) {
    h.doc.elements = [modal({ role: 'dialog', hidden: true }), element];
    assertBlocked('unfocused open modal');
  }
  h.doc.elements = [
    modal({ tagName: 'DIALOG', open: false }),
    modal({ role: 'dialog', hidden: true }),
    modal({ role: 'dialog', ariaHidden: 'true' }),
    modal({ role: 'alertdialog', visible: false }),
  ];
  const allowed = h.win.dispatch('keydown', { key: 'a' });
  assert.equal(allowed.defaultPrevented, true);
  h.frame();
  assert.ok(h.world.player.x < origin.x, 'Hidden or closed dialogs must not capture keys');
  h.win.dispatch('keyup', { key: 'a' });
});

test('opening a modal clears held keys; WASD/arrows stay collision-safe and inactive keys are ignored', t => {
  const h = createHarness(t);
  assert.equal(h.win.dispatch('keydown', { key: 'w' }).defaultPrevented, false);
  assert.equal(h.world.keys.size, 0);
  h.world.setActive(true);
  h.frame();
  h.win.dispatch('keydown', { key: 'ArrowLeft' });
  h.doc.elements = [modal({ role: 'dialog' })];
  const x = h.world.player.x;
  h.frame();
  assert.equal(h.world.player.x, x);
  assert.equal(h.world.keys.size, 0);
  h.doc.elements = [];
  h.frame();
  assert.equal(h.world.player.x, x, 'Closing the modal must not resume stale held keys');
  Object.assign(h.world.player, { x: 205, y: 195 });
  for (const key of ['w', 'ArrowUp']) {
    h.win.dispatch('keydown', { key });
    for (let i = 0; i < 50; i++) { h.frame(); assertCollisionFree(h.world); }
    assert.ok(h.world.player.y >= 161, 'Stops at the desk edge');
    h.win.dispatch('keyup', { key });
  }
  h.win.dispatch('keydown', { key: 'd' });
  assert.equal(h.world.keys.size, 1);
  h.win.dispatch('blur');
  assert.equal(h.world.keys.size, 0);
  h.world.setActive(false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.win.dispatch('keydown', { key: 'ArrowDown' }).defaultPrevented, false);
});

test('onMove emits only changed logical state and inactivity pauses animation without duplicate loops', t => {
  const h = createHarness(t);
  assert.equal(h.frames.size, 0);
  h.world.setActive(true);
  h.world.setActive(true);
  assert.equal(h.frames.size, 1);
  assert.deepEqual(h.moves, [{ x: 655, y: 635, seated: false, tableId: null }]);
  h.frame(); h.frame();
  assert.equal(h.moves.length, 1);
  h.win.dispatch('keydown', { key: 'd', ctrlKey: true });
  assert.equal(h.world.keys.size, 0);
  h.win.dispatch('keydown', { key: 'd' });
  h.frame();
  assert.ok(h.moves.length > 1);
  assert.ok(h.moves.every(state => Object.keys(state).sort().join() === 'seated,tableId,x,y'));
  h.world.setActive(false);
  assert.equal(h.frames.size, 0);
  const x = h.world.player.x;
  h.frame();
  assert.equal(h.world.player.x, x);
  h.world.setActive(true);
  assert.equal(h.frames.size, 1);
});

test('destroy removes the exact listeners, cancels animation, restores the cursor and is idempotent', t => {
  const h = createHarness(t);
  const registered = [...h.canvas.listeners, ...h.win.listeners].flatMap(([type, listeners]) =>
    [...listeners].map(listener => ({ type, listener })));
  assert.equal(h.canvas.listenerCount, 3);
  assert.equal(h.win.listenerCount, 4);
  h.world.setActive(true);
  const chair = h.world.layout.objects.find(object => object.type === 'chair');
  h.pointer('pointermove', chair.x, chair.y);
  assert.equal(h.canvas.style.cursor, 'pointer');
  assert.equal(h.frames.size, 1);
  h.world.destroy();
  assert.equal(h.frames.size, 0);
  assert.equal(h.canvas.listenerCount, 0);
  assert.equal(h.win.listenerCount, 0);
  assert.equal(h.canvas.style.cursor, 'help');
  const removed = [...h.canvas.removed, ...h.win.removed];
  assert.equal(removed.length, registered.length);
  for (const entry of registered) assert.ok(removed.some(item => item.type === entry.type && item.listener === entry.listener));
  assert.equal(h.world.onInteract, null);
  assert.equal(h.world.onMove, null);
  assert.equal(h.world.background.width, 0);
  assert.equal(h.world.background.height, 0);
  const count = h.moves.length;
  h.world.destroy();
  h.world.setActive(true);
  h.world.setPlayer({ wearId: true });
  assert.equal(h.world.interact(chair), false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.moves.length, count);
  assert.equal(h.canvas.removed.length + h.win.removed.length, registered.length);
});

test('drawPreview renders the campus without adding listeners or animation', t => {
  const h = createHarness(t);
  h.world.destroy();
  drawPreview(h.canvas);
  assert.equal(h.canvas.width, 2640);
  assert.equal(h.canvas.height, 1400);
  assert.ok(h.ctx.fills.length > 1000);
  for (const label of ['COLLABORATION', 'FOCUS STUDIO', 'THE COMMONS']) {
    assert.ok(h.ctx.texts.some(item => item.value === label));
  }
  assert.equal(h.canvas.listenerCount, 0);
  assert.equal(h.win.listenerCount, 0);
  assert.equal(h.frames.size, 0);
});

function approximately(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
}

function assertCameraBounds(camera) {
  assert.ok(camera.x >= 0 && camera.y >= 0);
  assert.ok(camera.x + camera.width <= 1320 + 1e-8);
  assert.ok(camera.y + camera.height <= 700 + 1e-8);
}

test('camera remains opt-in and legacy camera controls and preview leave full-map rendering unchanged', t => {
  const h = createHarness(t);
  h.world.setActive(true);
  const legacy = { x: 0, y: 0, width: 1320, height: 700, zoom: 1, scale: 1, playerVisible: true };
  assert.deepEqual(h.world.getCamera(), legacy);
  assert.deepEqual(h.world.panCamera(100, 100), legacy);
  assert.deepEqual(h.world.setZoom(2), legacy);
  assert.deepEqual(h.world.zoomBy(0.2), legacy);
  assert.deepEqual(h.world.centerOnPlayer(), legacy);
  assert.equal(h.canvas.listenerCount, 3);
  assert.equal(h.win.resizeObservers.length, 0);
  assert.equal(h.canvas.style.touchAction, 'pan-y');
  assert.equal(h.canvas.dispatch('wheel', { deltaY: -100 }).defaultPrevented, false);
  assert.equal(h.cameraChanges.length, 0);
  assert.equal(h.canvas.width, 2640);
  h.world.destroy();
  drawPreview(h.canvas);
  assert.equal(h.canvas.width, 2640);
  assert.equal(h.canvas.height, 1400);
});

test('camera starts centered on the player at cover scale × 1.35 for desktop and portrait viewports', t => {
  for (const bounds of [
    { left: 10, top: 20, width: 1440, height: 900 },
    { left: 0, top: 0, width: 375, height: 812 },
  ]) {
    const h = createHarness(t, { camera: true, bounds, dpr: 3 });
    const camera = h.world.getCamera();
    assert.equal(camera.zoom, 1.35);
    approximately(camera.scale, Math.max(bounds.width / 1320, bounds.height / 700) * 1.35);
    approximately(camera.width, bounds.width / camera.scale);
    approximately(camera.height, bounds.height / camera.scale);
    approximately(camera.x + camera.width / 2, h.world.player.x);
    approximately(camera.y, 700 - camera.height); // Spawn is near the south wall.
    assert.equal(camera.playerVisible, true);
    assertCameraBounds(camera);
    assert.equal(h.canvas.width, bounds.width * 2, 'Camera DPR is capped at 2');
    assert.equal(h.canvas.height, bounds.height * 2);
    assert.equal(h.frames.size, 0, 'Initialization does not start an inactive animation');
    assert.equal(h.cameraChanges.length, 1);
    const scale = camera.scale * 2;
    assert.deepEqual(h.ctx.transforms.at(-1), [scale, 0, 0, scale, -camera.x * scale, -camera.y * scale]);
    assert.deepEqual(h.ctx.clears.at(-1), {
      values: [0, 0, bounds.width * 2, bounds.height * 2], transform: [1, 0, 0, 1, 0, 0],
    });
  }
});

test('camera pan and zoom clamp to world bounds and zoom limits without changing player state', t => {
  const h = createHarness(t, { camera: true });
  h.world.setActive(true);
  const player = { ...h.world.player };
  const moves = h.moves.length;
  h.world.panCamera(-10000, -10000);
  assert.equal(h.world.getCamera().x, 0);
  assert.equal(h.world.getCamera().y, 0);
  for (const value of [1, 2.5, 1.35]) {
    h.world.setZoom(value);
    h.world.panCamera(10000, 10000);
    const camera = h.world.getCamera();
    approximately(camera.x, 1320 - camera.width);
    approximately(camera.y, 700 - camera.height);
    assertCameraBounds(camera);
  }
  assert.equal(h.world.setZoom(99).zoom, 2.5);
  assert.equal(h.world.zoomBy(-99).zoom, 1);
  assert.equal(h.world.zoomBy(0.2).zoom, 1.2);
  const before = h.world.getCamera();
  assert.deepEqual(h.world.setZoom(NaN), before);
  assert.deepEqual(h.world.panCamera(Infinity, 0), before);
  assert.deepEqual(h.world.player, player);
  assert.equal(h.moves.length, moves);
});

test('camera resize tracks CSS bounds and DPR while preserving the viewed center rather than following', t => {
  const h = createHarness(t, { camera: true });
  h.world.setActive(true);
  let camera = h.world.getCamera();
  h.world.panCamera(0, 350 - (camera.y + camera.height / 2));
  camera = h.world.getCamera();
  const center = { x: camera.x + camera.width / 2, y: camera.y + camera.height / 2 };
  for (const bounds of [
    { left: 20, top: 40, width: 990, height: 450 },
    { left: 0, top: 0, width: 375, height: 812 },
  ]) {
    h.canvas.bounds = bounds;
    h.win.resizeObservers[0].callback();
    camera = h.world.getCamera();
    approximately(camera.x + camera.width / 2, center.x);
    approximately(camera.y + camera.height / 2, center.y);
    assert.equal(h.canvas.width, bounds.width * 2);
    assert.equal(h.canvas.height, bounds.height * 2);
    assertCameraBounds(camera);
  }
  h.win.devicePixelRatio = 1.5;
  h.win.dispatch('resize');
  assert.equal(h.canvas.width, Math.round(375 * 1.5));
  assert.equal(h.canvas.height, 812 * 1.5);
  assert.deepEqual(h.world.getCamera(), camera);
});

test('camera pointer mapping selects objects and routes floor clicks through scaled and translated views', t => {
  const h = createHarness(t, { camera: true });
  h.world.setActive(true);
  const chair = h.world.layout.objects.find(object => object.type === 'chair');
  for (const bounds of [
    { left: 37, top: 59, width: 660, height: 350 },
    { left: 10, top: 100, width: 375, height: 812 },
  ]) {
    h.canvas.bounds = bounds;
    h.win.dispatch('resize');
    h.world.panCamera(-10000, -10000);
    h.world.setZoom(1.8);
    h.pointer('pointerdown', chair.x, chair.y);
    assert.equal(h.selections.at(-1).id, chair.id);
    assert.equal(h.selections.at(-1).x, chair.x);
    // This floor point remains inside even the narrow portrait viewport.
    const camera = h.world.getCamera();
    assert.ok(165 >= camera.x && 165 <= camera.x + camera.width);
    assert.ok(195 >= camera.y && 195 <= camera.y + camera.height);
    h.pointer('pointerdown', 165, 195);
    h.canvas.dispatch('pointerleave');
    assertSafeRoute(h.world);
    settle(h);
    assert.equal(h.world.player.x, 165);
    assert.equal(h.world.player.y, 195);
  }
});

test('player may walk and sit offscreen without camera follow; centering and floor changes explicitly recenter', t => {
  const h = createHarness(t, { camera: true });
  h.world.setActive(true);
  h.world.setZoom(2);
  h.world.panCamera(10000, 10000);
  const before = h.world.getCamera();
  const chair = h.world.layout.objects.find(object => object.type === 'chair');
  h.world.interact(chair);
  settle(h);
  let camera = h.world.getCamera();
  assert.equal(camera.x, before.x);
  assert.equal(camera.y, before.y);
  assert.equal(camera.playerVisible, false);
  assert.equal(h.world.player.seated, true);
  assert.equal(h.cameraChanges.at(-1).playerVisible, false);
  camera = h.world.centerOnPlayer();
  assert.equal(camera.playerVisible, true);
  assert.equal(camera.x, 0, 'Center clamps near the west wall');
  assert.equal(camera.y, 0, 'Center clamps near the north wall');
  h.world.panCamera(10000, 10000);
  h.world.setFloor(2);
  camera = h.world.getCamera();
  assert.equal(camera.zoom, 2, 'Floor switching preserves zoom');
  assert.equal(camera.playerVisible, true);
  approximately(camera.x + camera.width / 2, 655);
  approximately(camera.y, 700 - camera.height);
  assert.equal(h.world.player.seated, false);
});

test('mouse edge scrolling is proportional in screen pixels and independent of player movement', t => {
  const h = createHarness(t, { camera: true });
  h.world.setActive(true);
  h.frame();
  const player = { ...h.world.player };
  const before = h.world.getCamera();
  h.screenPointer('pointermove', 16, 175);
  h.frame();
  let camera = h.world.getCamera();
  approximately(camera.x, before.x - (48 / 64) * 520 * 0.05 / before.scale);
  assert.deepEqual(h.world.player, player);
  h.canvas.dispatch('pointerleave');
  h.frame();
  assert.equal(h.world.getCamera().x, camera.x);
  h.screenPointer('pointermove', 0, 175, { pointerType: 'touch' });
  h.frame();
  assert.equal(h.world.getCamera().x, camera.x, 'Touch hover does not edge-scroll');
  h.screenPointer('pointermove', 0, 175, { pointerType: 'pen' });
  h.frame();
  assert.equal(h.world.getCamera().x, camera.x, 'Pen hover does not edge-scroll');
  h.screenPointer('pointermove', 0, 175);
  h.win.dispatch('blur');
  h.frame();
  assert.equal(h.world.getCamera().x, camera.x);
  h.screenPointer('pointermove', 0, 175);
  h.doc.elements = [modal({ role: 'dialog' })];
  h.frame();
  assert.equal(h.world.getCamera().x, camera.x);
  h.doc.elements = [];
  h.frame();
  assert.equal(h.world.getCamera().x, camera.x, 'Closing a modal does not restore stale edge input');
  h.screenPointer('pointermove', 0, 175);
  h.world.setActive(false);
  camera = h.world.getCamera();
  h.frame();
  assert.deepEqual(h.world.getCamera(), camera);
});

test('stationary mouse hover is recalculated when the camera pans and camera callbacks are deduplicated', t => {
  const h = createHarness(t, { camera: true });
  h.world.setActive(true);
  h.world.panCamera(-10000, -10000);
  const chair = h.world.layout.objects.find(object => object.type === 'chair');
  h.pointer('pointermove', chair.x, chair.y);
  assert.equal(h.world.hovered.id, chair.id);
  h.world.panCamera(100, 0);
  assert.notEqual(h.world.hovered?.id, chair.id);
  h.canvas.dispatch('pointerleave');
  const count = h.cameraChanges.length;
  h.frame(); h.frame();
  h.world.panCamera(0, 0);
  assert.equal(h.cameraChanges.length, count);
  const external = h.world.getCamera();
  external.x = -999;
  assert.notEqual(h.world.getCamera().x, -999);
  h.cameraChanges.at(-1).x = -999;
  h.world.setPlayer({ name: 'No camera change' });
  assert.equal(h.cameraChanges.length, count, 'Callback receives a defensive copy');
});

test('wheel zoom preserves its logical cursor anchor and all camera controls respect inactive/editing/modal guards', t => {
  const h = createHarness(t, { camera: true });
  const wheel = () => h.canvas.dispatch('wheel', {
    clientX: h.canvas.bounds.left + 200, clientY: h.canvas.bounds.top + 120, deltaY: -100, deltaMode: 0,
  });
  const before = h.world.getCamera();
  assert.equal(wheel().defaultPrevented, false);
  assert.deepEqual(h.world.panCamera(20, 20), before);
  assert.deepEqual(h.world.setZoom(2), before);
  assert.deepEqual(h.world.centerOnPlayer(), before);
  h.world.setActive(true);
  h.world.panCamera(-10000, -10000);
  h.world.panCamera(100, 80);
  let camera = h.world.getCamera();
  const anchor = { x: camera.x + 200 / camera.scale, y: camera.y + 120 / camera.scale };
  assert.equal(wheel().defaultPrevented, true);
  camera = h.world.getCamera();
  approximately(camera.x + 200 / camera.scale, anchor.x);
  approximately(camera.y + 120 / camera.scale, anchor.y);
  assert.equal(h.canvas.added.find(entry => entry.type === 'wheel').options.passive, false);
  for (const editing of [false, true]) {
    h.doc.activeElement = editing ? { tagName: 'INPUT' } : null;
    h.doc.elements = editing ? [] : [modal({ tagName: 'DIALOG', open: true })];
    assert.equal(wheel().defaultPrevented, false);
    assert.deepEqual(h.world.panCamera(20, 20), camera);
    assert.deepEqual(h.world.zoomBy(0.3), camera);
    assert.deepEqual(h.world.centerOnPlayer(), camera);
    h.screenPointer('pointerdown', 200, 100, { pointerType: 'touch', pointerId: 5 });
    assert.equal(h.world.gesture, null);
  }
});

test('touch taps select objects and move on floor; an eight-pixel drag only pans with pointer capture', t => {
  const h = createHarness(t, { camera: true });
  h.world.setActive(true);
  h.world.panCamera(-10000, -10000);
  const chair = h.world.layout.objects.find(object => object.type === 'chair');
  const touch = { pointerType: 'touch', pointerId: 7 };
  h.pointer('pointerdown', chair.x, chair.y, touch);
  assert.equal(h.selections.length, 0, 'Touch selection waits for release');
  assert.ok(h.canvas.hasPointerCapture(7));
  h.pointer('pointerup', chair.x, chair.y, touch);
  assert.equal(h.selections.at(-1).id, chair.id);
  assert.equal(h.canvas.hasPointerCapture(7), false);
  h.pointer('pointerdown', 205, 195, touch);
  h.pointer('pointerup', 205, 195, touch);
  assert.ok(h.world.path.length > 0);
  settle(h);
  h.world.panCamera(100, 60);
  const camera = h.world.getCamera();
  const player = { ...h.world.player };
  const count = h.selections.length;
  h.screenPointer('pointerdown', 250, 150, touch);
  h.screenPointer('pointermove', 254, 150, touch);
  assert.equal(h.world.getCamera().x, camera.x, 'Sub-threshold motion is not a drag');
  h.screenPointer('pointermove', 270, 160, { ...touch, pointerId: 99 });
  assert.equal(h.world.getCamera().x, camera.x, 'Another pointer cannot hijack a captured drag');
  h.screenPointer('pointermove', 258, 150, touch);
  approximately(h.world.getCamera().x, camera.x - 8 / camera.scale);
  assert.equal(h.canvas.style.cursor, 'grabbing');
  h.screenPointer('pointermove', 280, 170, touch);
  h.screenPointer('pointerup', 280, 170, touch);
  approximately(h.world.getCamera().x, camera.x - 30 / camera.scale);
  approximately(h.world.getCamera().y, camera.y - 20 / camera.scale);
  assert.deepEqual(h.world.player, player);
  assert.equal(h.world.path.length, 0);
  assert.equal(h.selections.length, count, 'Dragging does not select an object');
  assert.equal(h.world.gesture, null);
  assert.equal(h.canvas.captured.size, 0);
  assert.equal(h.world.pointerPosition, null, 'Touch never starts mouse edge scrolling');
});

test('cancelled touch gestures do not click and middle/shift mouse drags only pan', t => {
  const h = createHarness(t, { camera: true });
  h.world.setActive(true);
  const before = h.world.getCamera();
  const touch = { pointerType: 'touch', pointerId: 8 };
  h.screenPointer('pointerdown', 250, 150, touch);
  h.screenPointer('pointercancel', 250, 150, touch);
  assert.equal(h.selections.length, 0);
  assert.equal(h.world.path.length, 0);
  assert.equal(h.canvas.captured.size, 0);
  assert.deepEqual(h.world.getCamera(), before);
  for (const properties of [{ button: 1 }, { button: 0, shiftKey: true }]) {
    const camera = h.world.getCamera();
    h.screenPointer('pointerdown', 250, 150, properties);
    h.screenPointer('pointermove', 280, 150, properties);
    h.screenPointer('pointerup', 280, 150, properties);
    approximately(h.world.getCamera().x, camera.x - 30 / camera.scale);
    assert.equal(h.world.path.length, 0);
    assert.equal(h.selections.length, 0);
  }
  h.screenPointer('pointerdown', 250, 150, touch);
  h.canvas.releasePointerCapture(8);
  assert.equal(h.world.gesture, null);
  assert.equal(h.world.path.length, 0);
});

test('camera cleanup releases capture, disconnects resize observers and removes all camera listeners', t => {
  const h = createHarness(t, { camera: true });
  assert.equal(h.canvas.listenerCount, 7);
  assert.equal(h.win.listenerCount, 4);
  assert.equal(h.canvas.style.touchAction, 'none');
  assert.equal(h.win.resizeObservers[0].element, h.canvas);
  h.world.setActive(true);
  h.screenPointer('pointerdown', 250, 150, { pointerType: 'touch', pointerId: 9 });
  assert.ok(h.canvas.hasPointerCapture(9));
  h.world.destroy();
  assert.equal(h.canvas.captured.size, 0);
  assert.equal(h.canvas.listenerCount, 0);
  assert.equal(h.win.listenerCount, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.win.resizeObservers[0].disconnected, true);
  assert.equal(h.canvas.style.touchAction, 'pan-y');
  assert.equal(h.canvas.style.cursor, 'help');
  assert.equal(h.world.onCameraChange, null);
  const count = h.cameraChanges.length;
  h.win.resizeObservers[0].callback();
  h.canvas.dispatch('wheel', { deltaY: -100 });
  h.world.panCamera(10, 10);
  h.world.destroy();
  assert.equal(h.cameraChanges.length, count);
  assert.equal(h.canvas.removed.length, 7);
  assert.equal(h.win.removed.length, 4);
});

test('mentors have individual home seats and Kayode occupies only the downstairs seat nine', t => {
  const h = createHarness(t);
  h.world.setActive(true);
  for (const floor of [1, 2]) {
    h.world.setFloor(floor);
    const mentors = h.world.actors.filter(actor => actor.kind === 'mentor' && actor.object.floor === floor);
    assert.equal(mentors.length, floor === 1 ? 3 : 2);
    assert.deepEqual(mentors.map(actor => actor.object.x), floor === 1 ? [105, 175, 245] : [105, 175]);
    assert.ok(mentors.every(actor => actor.object.y === 566 && actor.object.seated && actor.state === 'home'));
    assert.ok(mentors.every(actor => actor.wait >= actor.schedule.seated[0] && actor.wait <= actor.schedule.seated[1]));
    assert.equal(new Set(mentors.map(actor => actor.object.idlePhase)).size, mentors.length);
  }
  h.world.setFloor(1);
  const chair = h.world.layout.objects.find(object => object.id === 'floor-1-west-1-chair-0-9');
  const kayode = h.world.layout.objects.find(object => object.name === 'Kayode, the male rep');
  assert.equal(chair.occupantId, kayode.id);
  assert.equal(chair.action, 'Talk to Kayode');
  assert.match(chair.label, /occupied by Kayode/);
  assert.equal(kayode.seated, true);
  assert.equal(kayode.x, chair.x);
  assert.equal(kayode.y, chair.y + 6);
  assert.equal(kayode.direction, chair.facing);
  assert.equal(kayode.tableId, chair.tableId);
  assert.equal(h.world.interact(chair), false);
  h.pointer('pointerdown', chair.x, chair.y);
  assert.equal(h.selections.at(-1).id, kayode.id);
  h.world.clearSelection();
  const position = { x: kayode.x, y: kayode.y };
  h.world.setFloor(2);
  const upstairsChair = h.world.layout.objects.find(object => object.id === 'floor-2-west-1-chair-0-9');
  assert.equal(upstairsChair.occupantId, undefined);
  assert.ok(h.world.interact(upstairsChair));
  for (let i = 0; i < 220; i++) h.world._updateActors(0.05);
  h.world.setFloor(1);
  assert.equal(h.world.layout.objects.find(object => object.id === kayode.id), kayode);
  assert.deepEqual({ x: kayode.x, y: kayode.y }, position);
  assert.equal(kayode.seated, true);
});

test('mentor inspection/return routes and manager roaming stay collision-free and do not pan the camera', t => {
  const h = createHarness(t, { camera: true });
  h.world.setActive(true);
  const camera = h.world.getCamera();
  const actor = h.world.actors[0];
  actor.wait = 0;
  h.world._updateActors(0.05);
  assert.equal(actor.state, 'outbound');
  assert.equal(actor.object.seated, false);
  const finishRoute = () => {
    for (let i = 0; i < 2000 && actor.path.length; i++) {
      h.world._updateActors(0.05);
      h.world.actors.forEach(person => assertCollisionFree(h.world, person.object));
    }
    assert.equal(actor.path.length, 0);
  };
  finishRoute();
  assert.equal(actor.state, 'inspect');
  assert.ok(actor.wait >= actor.schedule.inspect[0] && actor.wait <= actor.schedule.inspect[1]);
  actor.wait = 0;
  h.world._updateActors(0.05);
  assert.equal(actor.state, 'returning');
  finishRoute();
  assert.equal(actor.state, 'home');
  assert.equal(actor.object.seated, true);
  assert.equal(actor.object.x, actor.home.x);
  assert.equal(actor.object.y, actor.home.y);
  assert.ok(actor.wait >= actor.schedule.seated[0] && actor.wait <= actor.schedule.seated[1]);
  const manager = h.world.actors.find(person => person.kind === 'manager');
  manager.path = [];
  manager.state = 'pause';
  manager.wait = 0;
  h.world._updateActors(0.05);
  assert.equal(manager.state, 'roaming');
  assert.ok(manager.path.length > 0);
  assert.deepEqual(h.world.getCamera(), camera);
});

test('selected and pending conversations freeze actors until selection and pending targets are released', t => {
  const h = createHarness(t);
  h.world.setActive(true);
  const actor = h.world.actors[0];
  actor.wait = 0;
  h.world.selected = actor.object;
  h.world._updateActors(1);
  assert.equal(actor.state, 'home');
  assert.equal(actor.wait, 0);
  h.world.clearSelection();
  assert.equal(h.world.selected, null);
  assert.equal(h.world.hovered, null);
  h.world._updateActors(0.05);
  assert.equal(actor.state, 'outbound');
  h.world.pending = actor.object;
  const position = { x: actor.object.x, y: actor.object.y };
  h.world.clearSelection();
  h.world._updateActors(1);
  assert.equal(actor.object.x, position.x);
  assert.equal(actor.object.y, position.y);
  h.world.pending = null;
  const mentorCorner = h.world.layout.objects.find(object => object.type === 'mentor');
  assert.equal(mentorCorner.npcId, actor.object.id);
  h.world.selected = mentorCorner;
  h.world._updateActors(1);
  assert.equal(actor.object.x, position.x);
  assert.equal(actor.object.y, position.y);
  h.world.clearSelection();
  h.world._updateActors(0.05);
  assert.ok(actor.object.x !== position.x || actor.object.y !== position.y);
});

test('world and live-object screen projection uses viewport CSS coordinates in legacy and camera modes', t => {
  for (const camera of [false, true]) {
    const h = createHarness(t, { camera });
    h.world.setActive(true);
    const projection = h.world.worldToScreen(655, 635);
    const roundTrip = h.world._point({ clientX: projection.x, clientY: projection.y });
    approximately(roundTrip.x, 655);
    approximately(roundTrip.y, 635);
    assert.equal(projection.visible, true);
    const actor = h.world.actors[0];
    const popup = h.world.getObjectScreenPosition(actor.object.id);
    assert.deepEqual(popup, h.world.worldToScreen(actor.object.x, actor.object.y - actor.object.h - 12));
    actor.object.x += 10;
    assert.notEqual(h.world.getObjectScreenPosition(actor.object.id).x, popup.x);
    assert.equal(h.world.getObjectScreenPosition('unknown'), null);
    assert.equal(h.world.worldToScreen(-10, 100).visible, false);
    const id = actor.object.id;
    h.world.setFloor(2);
    assert.equal(h.world.getObjectScreenPosition(id), null);
  }
});

test('reduced motion fixes foliage and idle poses, leaves sway no more than one pixel, and media listeners clean up', t => {
  const h = createHarness(t, { reducedMotion: true });
  const leaves = () => h.ctx.fills.filter(fill => ['#75a67a', '#4d865e'].includes(fill.color)).map(fill => ({ ...fill }));
  const pots = () => h.ctx.fills.filter(fill => fill.color === '#a97558').map(fill => ({ ...fill }));
  h.world.ambientTime = 100;
  h.world.setPlayer({ wearId: true });
  const still = leaves();
  const fixedPots = pots();
  assert.equal(fixedPots.length, 8);
  h.world.ambientTime = 2500;
  h.world.setPlayer({ wearId: true });
  assert.deepEqual(leaves(), still);
  assert.deepEqual(pots(), fixedPots);
  h.win.motionQuery.dispatch('change', { matches: false });
  assert.equal(h.world.reducedMotion, false);
  const moving = leaves();
  assert.notDeepEqual(moving, still);
  moving.forEach((leaf, i) => {
    assert.ok(Math.abs(leaf.x - still[i].x) <= 1);
    assert.equal(leaf.y, still[i].y);
  });
  assert.deepEqual(pots(), fixedPots);
  assert.equal(h.win.motionQuery.listenerCount, 1);
  h.world.destroy();
  assert.equal(h.win.motionQuery.listenerCount, 0);
});

function assertUniqueActors(world) {
  const residents = [...world.floors.values()].flatMap(context => context.layout.objects.filter(object => object.type === 'npc'));
  assert.equal(residents.length, 7);
  assert.equal(new Set(residents.map(object => object.id)).size, 7);
  assert.equal(new Set(residents.map(object => object.name)).size, 7);
  for (const actor of world.actors) {
    assert.equal(residents.filter(object => object === actor.object).length, 1);
    assert.ok(world.floors.get(actor.object.floor).layout.objects.includes(actor.object));
  }
}

function finishActorRoute(world, actor) {
  assertSafeRoute(world, actor.object, actor.path);
  for (let i = 0; i < 3000 && actor.path.length; i++) {
    world._updateActors(0.05);
    world.actors.forEach(person => assertCollisionFree(world, person.object));
  }
  assert.equal(actor.path.length, 0, 'Actor completes its route');
  assertUniqueActors(world);
}

test('floor switching preserves actor identity, position, route, schedule and ambient time', t => {
  const { world } = createHarness(t);
  const actors = world.actors;
  const actor = actors[0];
  const layout = world.layout;
  actor.wait = 0;
  world._updateActors(0.05);
  world._updateActors(0.5);
  world.ambientTime = 1234;
  const snapshot = structuredClone(actor);
  const path = actor.path;
  for (const floor of [2, 1, 1, 2, 1]) world.setFloor(floor);
  assert.equal(world.actors, actors);
  assert.equal(world.layout, layout);
  assert.equal(world.actors[0], actor);
  assert.equal(actor.path, path);
  assert.deepEqual(actor, snapshot);
  assert.equal(world.ambientTime, 1234);
  assert.equal(actor.object.id, 'floor-1-npc-1');
  assertUniqueActors(world);
});

test('active frames simulate unseen floors, while inactive worlds pause both floors', t => {
  const h = createHarness(t);
  const emmanuel = h.world.actors.find(actor => actor.object.name === 'Mr Emmanuel');
  emmanuel.wait = 0;
  h.world.setActive(true);
  h.frame();
  h.frame();
  assert.equal(h.world.floor, 1);
  assert.equal(emmanuel.state, 'outbound');
  assertSafeRoute(h.world, emmanuel.object, emmanuel.path);
  const before = { x: emmanuel.object.x, y: emmanuel.object.y };
  for (let i = 0; i < 20; i++) h.frame();
  assert.ok(emmanuel.object.x !== before.x || emmanuel.object.y !== before.y);
  const snapshot = structuredClone(h.world.actors);
  h.world.setActive(false);
  for (let i = 0; i < 20; i++) h.frame();
  assert.deepEqual(h.world.actors, snapshot);
  h.world.setFloor(2);
  assert.equal(h.world.layout.objects.find(object => object.id === emmanuel.object.id), emmanuel.object);
});

test('individual schedules keep Jonathan mostly seated and Femi more active', t => {
  let seed = 42;
  t.mock.method(Math, 'random', () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; });
  const { world } = createHarness(t);
  const jonathan = world.actors.find(actor => actor.object.name === 'Mr Jonathan');
  const femi = world.actors.find(actor => actor.object.name === 'Mr Femi');
  assert.ok(jonathan.schedule.seated[0] > femi.schedule.seated[1] * 2);
  assert.ok(femi.speed > jonathan.speed);
  assert.ok(femi.schedule.stops > jonathan.schedule.stops);
  assert.ok(femi.schedule.transferEvery < jonathan.schedule.transferEvery);
  for (let i = 0; i < 920; i++) world._updateActors(0.05);
  assert.equal(jonathan.state, 'home');
  assert.equal(jonathan.object.seated, true);
  assert.equal(femi.object.seated, false);
  assert.equal(femi.outings, 1);
  const seated = new Map([[jonathan, 0], [femi, 0]]);
  for (let i = 0; i < 3600; i++) {
    world._updateActors(0.25);
    for (const actor of seated.keys()) if (actor.object.seated) seated.set(actor, seated.get(actor) + 1);
  }
  assert.ok(seated.get(jonathan) > 1800, 'Jonathan sits for most of the simulation');
  assert.ok(seated.get(jonathan) > seated.get(femi), 'Femi spends more time on rounds');
  assert.ok(femi.outings > jonathan.outings);
  assertUniqueActors(world);
});

test('every mentor transfers only at the stairs, stays unique, visits and returns to their own home', t => {
  for (const name of ['Mr Jonathan', 'Mr Femi', 'Mr Ezekiel', 'Mr Emmanuel', 'Mr Itunu']) {
    const { world } = createHarness(t, { camera: true });
    world.setActive(true);
    const actor = world.actors.find(actor => actor.object.name === name);
    // Exercise a scheduled cross-floor outing without waiting several minutes.
    actor.outings = actor.schedule.transferEvery - 1;
    actor.wait = 0;
    const id = actor.object.id;
    const source = world.floors.get(actor.homeFloor).layout;
    const destinationFloor = actor.homeFloor === 1 ? 2 : 1;
    const camera = world.getCamera();
    const player = { ...world.player };
    world._updateActors(0.05);
    assert.equal(actor.state, 'transferring');
    assert.equal(actor.object.floor, actor.homeFloor);
    assert.equal(actor.destination.targetFloor, destinationFloor);
    assert.deepEqual(actor.path.at(-1), { x: 515, y: 555 });
    assertSafeRoute(world, actor.object, actor.path);
    world._updateActors(0.05);
    assert.equal(actor.object.floor, actor.homeFloor, 'No teleport at route departure');
    finishActorRoute(world, actor);
    assert.equal(actor.object.floor, destinationFloor);
    assert.equal(actor.object.id, id);
    assert.equal(source.objects.includes(actor.object), false);
    assert.equal(actor.state, 'visit');
    assert.deepEqual({ x: actor.object.x, y: actor.object.y }, { x: 515, y: 555 });
    assert.deepEqual(world.getCamera(), camera);
    assert.deepEqual(world.player, player);
    world.setFloor(actor.homeFloor);
    assert.equal(world.interact(id), false);
    if (actor.object.name === 'Mr Jonathan' || actor.object.name === 'Mr Emmanuel') {
      const corner = source.objects.find(object => object.type === 'mentor');
      assert.equal(world.interact(corner), false, 'Absent mentors cannot be summoned by their corner');
      assert.equal(world._hit({ x: corner.x, y: corner.y }), null);
      assert.equal(corner.name, actor.object.name);
      assert.match(corner.label, /mentor corner/);
      world.selected = corner; // A destination menu may still hold the cubicle entry.
      assert.equal(world.interact(corner), false);
      assert.equal(world.pending, null);
      assert.equal(world.path.length, 0);
    }
    world.setFloor(destinationFloor);
    assert.ok(world.interact(id), 'Stable ID resolves on the destination floor');
    world.path = [];
    world.pending = null;
    world.clearSelection();
    for (let stop = 0; stop < actor.schedule.stops; stop++) {
      actor.wait = 0;
      world._updateActors(0.05);
      assert.equal(actor.state, 'outbound');
      assert.ok(actor.destination.tableId.startsWith(`floor-${destinationFloor}-`));
      finishActorRoute(world, actor);
      assert.equal(actor.state, 'inspect');
      assert.equal(actor.object.seated, false, 'Visitors do not take another mentor’s home seat');
    }
    actor.wait = 0;
    world._updateActors(0.05);
    assert.equal(actor.state, 'transferring');
    assert.equal(actor.destination.targetFloor, actor.homeFloor);
    finishActorRoute(world, actor);
    assert.equal(actor.object.floor, actor.homeFloor);
    assert.equal(actor.state, 'home');
    assert.equal(actor.object.seated, true);
    assert.equal(actor.object.x, actor.home.x);
    assert.equal(actor.object.y, actor.home.y);
    assert.ok(actor.wait >= actor.schedule.seated[0] && actor.wait <= actor.schedule.seated[1]);
  }
});

test('new mentors have distinct appearances, dialogue and behavior and reachable conversations', t => {
  const { world } = createHarness(t, { reducedMotion: true });
  world.setFloor(2);
  const emmanuel = world.actors.find(actor => actor.object.name === 'Mr Emmanuel');
  const itunu = world.actors.find(actor => actor.object.name === 'Mr Itunu');
  assert.equal(emmanuel.object.profile.hair, '#e6ded0');
  assert.equal(emmanuel.object.profile.wearId, 'glasses');
  assert.equal(itunu.object.profile.wearId, 'headphones');
  assert.notEqual(emmanuel.object.profile.skin, itunu.object.profile.skin);
  assert.notEqual(emmanuel.object.profile.shirt, itunu.object.profile.shirt);
  assert.ok(emmanuel.schedule.seated[0] > itunu.schedule.seated[1]);
  assert.ok(emmanuel.schedule.inspect[0] > itunu.schedule.inspect[1]);
  assert.ok(itunu.schedule.stops > emmanuel.schedule.stops);
  for (const actor of [emmanuel, itunu]) {
    assert.equal(actor.object.profile.name, actor.object.name);
    assert.ok(NPC_LINES[actor.object.name].length >= 3);
    assert.ok(world.interact(actor.object));
    assertSafeRoute(world);
    world.pending = null;
    world.path = [];
    world.clearSelection();
    actor.wait = 0;
    world._updateActors(0.05);
    finishActorRoute(world, actor);
    assert.ok(world.interact(actor.object));
    assertSafeRoute(world);
    world.pending = null;
    world.path = [];
    world.clearSelection();
  }
  assert.equal(new Set(Object.values(NPC_LINES).flat()).size, Object.values(NPC_LINES).flat().length);
});


test('offscreen routes use their own navigation and failed departures do not advance schedules', t => {
  const { world } = createHarness(t);
  const actor = world.actors.find(actor => actor.object.name === 'Mr Emmanuel');
  const { blocked } = world.floors.get(2);
  const destination = { x: 345, y: 375 };
  const cell = Math.floor(destination.y / 10) * 132 + Math.floor(destination.x / 10);
  assert.equal(world.blocked[cell], 0);
  blocked[cell] = 1;
  assert.ok(world._startActorRoute(actor, destination, 'outbound'));
  assert.notDeepEqual(actor.path.at(-1), destination, 'Offscreen destination snaps using floor two navigation');
  for (const point of actor.path) {
    assert.equal(blocked[Math.floor(point.y / 10) * 132 + Math.floor(point.x / 10)], 0);
  }
  assertSafeRoute(world, actor.object, actor.path);
  finishActorRoute(world, actor);
  actor.wait = 0;
  actor.stopsRemaining = 1;
  const navigation = blocked.slice();
  blocked.fill(1);
  const before = { state: actor.state, outings: actor.outings, stopsRemaining: actor.stopsRemaining, lastTableId: actor.lastTableId };
  world._updateActors(0.05);
  assert.deepEqual({ state: actor.state, outings: actor.outings, stopsRemaining: actor.stopsRemaining, lastTableId: actor.lastTableId }, before);
  assert.equal(actor.path.length, 0);
  assert.equal(actor.wait, 2);
  blocked.set(navigation);
  actor.wait = 0;
  world._updateActors(0.05);
  assert.equal(actor.state, 'returning');
  finishActorRoute(world, actor);
  assert.equal(actor.state, 'home');
});


test('onObjectsChange publishes unique active-floor snapshots once per mentor departure and arrival', t => {
  for (const floor of [1, 2]) {
    const changes = [];
    const { world } = createHarness(t, { onObjectsChange: objects => changes.push(objects) });
    world.setFloor(floor);
    const actor = world.actors.find(actor => actor.object.name === 'Mr Jonathan');
    const initialCount = world.layout.objects.filter(object => object.type === 'npc').length;
    assert.equal(changes.length, 0, 'Floor selection remains handled by the consumer');
    actor.outings = actor.schedule.transferEvery - 1;
    actor.wait = 0;
    world._updateActors(0.05);
    assert.equal(changes.length, 0, 'Route departure does not yet change floor membership');
    finishActorRoute(world, actor);
    assert.equal(changes.length, 1);
    const first = changes[0];
    assert.notEqual(first, world.layout.objects, 'A new array triggers consumer state updates');
    assert.deepEqual(first, world.layout.objects);
    assert.ok(first.every(object => object.floor === floor));
    assert.equal(new Set(first.map(object => object.id)).size, first.length);
    assert.equal(first.filter(object => object.type === 'npc').length, initialCount + (floor === 1 ? -1 : 1));
    assert.equal(first.filter(object => object.id === actor.object.id).length, floor === 1 ? 0 : 1);
    first.forEach((object, index) => assert.equal(object, world.layout.objects[index], 'Objects retain their live identity'));
    const firstIds = first.map(object => object.id);
    world._updateActors(0.05);
    assert.equal(changes.length, 1, 'Normal simulation does not emit membership updates');
    // The visiting mentor is still at the stairs; return through the same transfer path.
    assert.ok(world._startActorRoute(actor, world._stairsDestination(actor), 'transferring'));
    finishActorRoute(world, actor);
    assert.equal(changes.length, 2);
    const second = changes[1];
    assert.notEqual(second, first);
    assert.notEqual(second, world.layout.objects);
    assert.deepEqual(second, world.layout.objects);
    assert.ok(second.every(object => object.floor === floor));
    assert.equal(new Set(second.map(object => object.id)).size, second.length);
    assert.equal(second.filter(object => object.type === 'npc').length, initialCount);
    assert.equal(second.filter(object => object.id === actor.object.id).length, floor === 1 ? 1 : 0);
    assert.deepEqual(first.map(object => object.id), firstIds, 'Earlier arrays retain their membership');
    const count = world.layout.objects.length;
    second.pop();
    assert.equal(world.layout.objects.length, count, 'Consumer array edits cannot corrupt the layout');
    world.destroy();
    assert.equal(world.onObjectsChange, null);
    world.setFloor(1);
    world.setActive(true);
    assert.equal(changes.length, 2, 'Destroy releases the callback without publishing more updates');
  }
});

test('onObjectsChange accepts only functions and remains optional during transfers', t => {
  for (const onObjectsChange of [undefined, null, true, 'not a callback']) {
    const { world } = createHarness(t, { onObjectsChange });
    assert.equal(world.onObjectsChange, null);
    const actor = world.actors[0];
    actor.outings = actor.schedule.transferEvery - 1;
    actor.wait = 0;
    world._updateActors(0.05);
    finishActorRoute(world, actor);
    assert.equal(actor.object.floor, 2);
  }
});
