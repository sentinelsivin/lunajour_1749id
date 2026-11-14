/* node tools/check-sticker-gestures.cjs
   Exercising the actual pointer handlers with two independent touch pointers.
   DOM stubs replace layout only; gesture and selection logic comes from app.js. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const hs = source.indexOf('  function stickerHandles(');
const he = source.indexOf('  /* Рамка вокруг', hs);
const bs = source.indexOf('  function bindLayers() {');
const be = source.indexOf("    $('stickerUpload').onclick", bs);
assert(hs >= 0 && he > hs && bs >= 0 && be > bs, 'Gesture handler boundaries changed');
const listeners = {}, elements = new Map();
const element = () => ({ style: {}, addEventListener() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 500, height: 700 }; } });
const card = { ...element(), width: 1000, height: 1400, setPointerCapture() {}, addEventListener(name, fn) { (listeners[name] ||= []).push(fn); } };
const render = { layerBox(ctx, l) { return { w: l.size * 1000, h: l.size * 700 }; } };
const c = {
  card, ctx: {}, assets: {}, Render: render, window: { Render: render }, navigator: { vibrate() {} },
  state: { layers: [] }, selectedLayer: 0, multiMode: false, multi: new Set(), addingSticker: false,
  snapGuides: { x: false, y: false }, layersMode: () => true,
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  syncLayerTools() {}, invalidate() {}, update() {}, commitHistory() {},
  $: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
};
c.layerAt = i => c.state.layers[i];
c.editLayer = patch => Object.assign(c.layerAt(c.selectedLayer), patch);
vm.createContext(c);
vm.runInContext(source.slice(hs, he) + source.slice(bs, be) + '\n}\nbindLayers();', c);
const fire = (name, id, x, y, extra = {}) => {
  const event = { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', preventDefault() {}, ...extra };
  for (const fn of listeners[name] || []) fn(event);
};
const reset = () => { c.selectedLayer = 0; c.state.layers = [{ type: 'sticker', size: 0.4, x: 0.5, y: 0.45, rot: 0 }]; };
const close = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const cx = 250, cy = 315;
reset();
let handles = vm.runInContext('stickerHandles(state.layers[0])', c);
fire('pointerdown', 1, handles.resize.x / 2, handles.resize.y / 2, { pointerType: 'mouse' });
fire('pointermove', 1, cx + (handles.resize.x / 2 - cx) * 1.25, cy + (handles.resize.y / 2 - cy) * 1.25);
close(c.state.layers[0].size, 0.5); fire('pointerup', 1, 0, 0);
reset(); handles = vm.runInContext('stickerHandles(state.layers[0])', c);
const distance = Math.hypot(handles.rotate.x / 2 - cx, handles.rotate.y / 2 - cy);
fire('pointerdown', 1, handles.rotate.x / 2, handles.rotate.y / 2, { pointerType: 'mouse' });
fire('pointermove', 1, cx + distance, cy); close(c.state.layers[0].rot, Math.PI / 2); fire('pointerup', 1, 0, 0);
reset();
fire('pointerdown', 1, cx - 30, cy); fire('pointerdown', 2, cx + 30, cy);
fire('pointermove', 2, cx + 90, cy); close(c.state.layers[0].size, 0.8);
fire('pointermove', 2, cx - 30, cy + 120); close(c.state.layers[0].rot, Math.PI / 2);
fire('pointerup', 2, cx - 30, cy + 120); fire('pointermove', 1, cx - 20, cy + 10);
close(c.state.layers[0].x, 0.52); close(c.state.layers[0].y, 0.45 + 10 / 700); fire('pointerup', 1, 0, 0);
reset();
fire('pointerdown', 1, cx + 30, cy); fire('pointerdown', 2, cx - 30, cy + 0.3);
fire('pointermove', 2, cx - 30, cy - 0.3); assert(Math.abs(c.state.layers[0].rot) < 0.02);
fire('pointerup', 2, 0, 0); fire('pointerup', 1, 0, 0);
reset();
fire('wheel', 0, 0, 0, { shiftKey: true, deltaY: -10 }); close(c.state.layers[0].rot, Math.PI / 60); close(c.state.layers[0].size, 0.4);
fire('wheel', 0, 0, 0, { deltaY: -10 }); assert(c.state.layers[0].size > 0.4);
reset(); fire('pointerdown', 1, cx - 30, cy); fire('pointerdown', 2, cx + 30, cy);
fire('pointermove', 2, cx + 3000, cy); close(c.state.layers[0].size, 1.5);
fire('pointermove', 2, cx - 30, cy); close(c.state.layers[0].size, 0.005);
fire('pointercancel', 2, 0, 0); fire('pointercancel', 1, 0, 0);
const final = { ...c.state.layers[0] }; fire('pointermove', 1, 100, 100); assert.deepEqual(c.state.layers[0], final);
reset(); fire('pointerdown', 1, cx, cy); fire('lostpointercapture', 1, cx, cy);
const released = { ...c.state.layers[0] }; fire('pointermove', 1, cx + 40, cy + 40); assert.deepEqual(c.state.layers[0], released);
console.log('Passed: mouse resize/rotation, touch pinch/rotation, finger lift, angle wrap, wheel, size limits, cancellation, lost capture.');
