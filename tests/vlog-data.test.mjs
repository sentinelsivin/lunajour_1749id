// Справочники и чистые функции влога: формат времени, склонение, стили «Собрать», стиль из влога.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { VlogData, Timeline } = load('vlog-data.js', 'timeline.js');

test('время: минуты, секунды с десятыми, без минуса', () => {
  assert.equal(VlogData.fmt(0), '0:00.0');
  assert.equal(VlogData.fmt(3500), '0:03.5');
  assert.equal(VlogData.fmt(65400), '1:05.4');
  assert.equal(VlogData.fmt(-200), '0:00.0');
});

test('склонение: клип, клипа, клипов (и 11–14 всегда «клипов»)', () => {
  const ru = (n) => VlogData.clipsText(n, 'ru');
  assert.deepEqual([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(ru), [
    '0 клипов', '1 клип', '2 клипа', '4 клипа', '5 клипов', '11 клипов', '12 клипов', '14 клипов', '21 клип', '22 клипа', '25 клипов', '101 клип', '111 клипов',
  ]);
  assert.equal(VlogData.clipsText(1, 'en'), '1 clip');
  assert.equal(VlogData.clipsText(3, 'en'), '3 clips');
});

test('стили «Собрать»: у каждого есть всё нужное, номера не повторяются', () => {
  const ids = new Set();
  VlogData.AUTO_STYLES.forEach((st) => {
    assert.ok(!ids.has(st.id), st.id);
    ids.add(st.id);
    assert.ok(st.name && st.track && st.look, st.id);
    assert.ok(st.photo > 0.5 && st.video >= st.photo, st.id);
    assert.ok(st.tr.length && st.trMs > 0, st.id);
    assert.ok(st.moves.length, st.id);
    assert.ok(st.title.font && st.title.anim !== undefined, st.id);
  });
  assert.equal(ids.size, 8);
});

test('линейка: шаги по возрастанию', () => {
  const s = VlogData.RULER_STEPS;
  assert.ok(s.every((v, i) => i === 0 || v > s[i - 1]));
});

function vlog() {
  const p = Timeline.newProject();
  const add = (kind, ms, extra = {}) => {
    const m = { id: `m${p.clips.length}`, kind, dur: 9000 };
    p.media[m.id] = m;
    Timeline.add(p, [m], p.clips.length);
    Object.assign(p.clips[p.clips.length - 1], { in: 0, out: ms, ...extra });
  };
  add('image', 2000, { look: 'film', move: 'in', tr: { id: 'fade', dur: 700 } });
  add('image', 3000, { look: 'film', move: 'left', tr: { id: 'black', dur: 700 } });
  add('video', 4500, { look: 'film', tr: { id: 'fade', dur: 700 } });
  add('image', 2500, { look: 'film', move: 'out' });
  p.music.track = 'lofi';
  return p;
}

test('стиль из влога: музыка, средняя длина фото, переходы, движения, цвет', () => {
  const p = vlog();
  const st = VlogData.styleFromVlog(p, Timeline);
  assert.equal(st.track, 'lofi');
  assert.equal(st.photo, 2.5);
  assert.equal(st.video, 4.5);
  assert.equal(st.look, 'film');
  assert.deepEqual(st.tr, ['fade', 'black']);
  assert.equal(st.trMs, 700);
  assert.deepEqual(st.moves, ['in', 'left', 'out']);
  assert.equal(st.title.font, 'golos');
});

test('стиль из влога: своя музыка не переносится, подпись берётся из собранной', () => {
  const p = vlog();
  p.music.fileId = 'own';
  p.overlays.push({ id: 'a', start: 0, end: 1000, anim: 'pop', layer: { type: 'text', text: 'Привет', font: 'caveat', color: '#fff', auto: true } });
  const st = VlogData.styleFromVlog(p, Timeline);
  assert.equal(st.track, '');
  assert.deepEqual([st.title.font, st.title.anim], ['caveat', 'pop']);
});
