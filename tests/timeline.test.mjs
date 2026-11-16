// Модель влога: длина, стыки, обрезка, наложения и подгонка стыков под такт.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { Timeline } = load('timeline.js');

function project(...clips) {
  const p = Timeline.newProject();
  clips.forEach(([kind, ms, dur], i) => {
    const m = { id: `m${i}`, kind, name: '', w: 100, h: 100, dur: dur || 0, thumb: '' };
    p.media[m.id] = m;
    Timeline.add(p, [m], p.clips.length);
    const c = p.clips[p.clips.length - 1];
    c.in = 0;
    c.out = ms;
  });
  return p;
}

test('длина ролика и начала клипов', () => {
  const p = project(['image', 3000], ['video', 2000, 10000], ['image', 1500]);
  assert.equal(Timeline.duration(p), 6500);
  assert.deepEqual(Timeline.starts(p), [0, 3000, 5000]);
});

test('скорость меняет длину видео на ленте', () => {
  const p = project(['video', 4000, 10000]);
  p.clips[0].speed = 2;
  assert.equal(Timeline.duration(p), 2000);
});

test('обрезка не даёт клипу стать короче минимума и длиннее файла', () => {
  const p = project(['video', 4000, 5000]);
  Timeline.trim(p, 0, 'out', 100);
  assert.equal(p.clips[0].out, Timeline.MIN_MS);
  Timeline.trim(p, 0, 'out', 99999);
  assert.equal(p.clips[0].out, 5000);
});

test('разрезать посередине: два клипа, общая длина та же', () => {
  const p = project(['video', 4000, 4000]);
  assert.ok(Timeline.canSplit(p, 1500));
  Timeline.split(p, 1500);
  assert.equal(p.clips.length, 2);
  assert.equal(Timeline.duration(p), 4000);
  assert.deepEqual(Timeline.starts(p), [0, 1500]);
});

test('ближайшее значение: только в пределах near', () => {
  assert.equal(Timeline.nearest([0, 1000, 2000], 1080, 100), 1000);
  assert.equal(Timeline.nearest([0, 1000, 2000], 1500, 100), null);
});

test('эффект на время: без появления и затухания, надпись — с ними', () => {
  const p = project(['image', 6000]);
  const fx = Timeline.addOverlay(p, { type: 'effect', fx: 'glitch' }, 1000);
  const text = Timeline.addOverlay(p, { type: 'text', text: 'привет' }, 1000);
  assert.deepEqual([fx.anim, fx.fadeOut], ['', false]);
  assert.deepEqual([text.anim, text.fadeOut], ['pop', true]);
  assert.deepEqual([fx.start, fx.end], [1000, 4000]);
});

test('наложения после обрезки не висят за концом ролика', () => {
  const p = project(['image', 6000]);
  const o = Timeline.addOverlay(p, { type: 'effect', fx: 'glitch' }, 4000);
  p.clips[0].out = 3000;
  Timeline.fitOverlays(p);
  assert.ok(o.end <= 3000 && o.start <= o.end - Timeline.MIN_MS);
});

test('стыки под такт: каждый конец клипа встаёт на такт', () => {
  const beat = 555.6;
  const beats = Array.from({ length: 40 }, (_, k) => k * beat);
  const p = project(['image', 3000], ['image', 3000], ['video', 2500, 2600]);
  const moved = Timeline.fitToBeats(p, beats);
  assert.equal(moved, 3);
  const ends = Timeline.starts(p).map((s, i) => s + Timeline.len(p.clips[i]));
  ends.forEach((e) => {
    const k = Math.round(e / beat);
    assert.ok(Math.abs(e - k * beat) < 1, `стык ${e} не на такте`);
  });
  /* видео не тянется дальше файла: 2600 мс файла, ближайший доступный такт раньше */
  assert.ok(p.clips[2].out <= 2600);
});

test('стыки под такт: если такты уже совпадают, ничего не меняется', () => {
  const p = project(['image', 1000], ['image', 1000]);
  assert.equal(Timeline.fitToBeats(p, [0, 1000, 2000, 3000]), 0);
});

test('ряды наложений: эффекты раскладываются отдельно от надписей', () => {
  const p = project(['image', 9000]);
  Timeline.addOverlay(p, { type: 'text', text: 'а' }, 0);
  Timeline.addOverlay(p, { type: 'text', text: 'б' }, 1000);
  Timeline.addOverlay(p, { type: 'effect', fx: 'glitch' }, 500);
  const isFx = (o) => o.layer.type === 'effect';
  assert.equal(Timeline.overlayRows(p, isFx).rows, 1);
  assert.equal(Timeline.overlayRows(p, (o) => !isFx(o)).rows, 2);
  assert.equal(Timeline.overlayRows(p).rows, 3);
});

test('ненужные файлы: картинка своей фигуры клипа не считается лишней', () => {
  const p = project(['image', 3000]);
  p.media.mask1 = { id: 'mask1', kind: 'mask' };
  p.media.junk = { id: 'junk', kind: 'image' };
  p.clips[0].shape = { motif: 'own-mask', mask: 'mask1' };
  assert.deepEqual([...Timeline.unused(p)], ['junk']);
});

test('новое фото добавляется без движения, у видео поля движения нет', () => {
  const p = project(['image', 3000], ['video', 2000, 5000]);
  assert.equal(p.clips[0].move, 'none');
  assert.equal(p.clips[1].move, undefined);
});
