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

test('паузы в речи: тишина дольше порога вырезается с запасом по краям', () => {
  // 20 мс на кусочек: 1 с речи, 1 с тишины, 1 с речи, короткая пауза 200 мс, 0.5 с речи
  const lv = [...Array(50).fill(0.5), ...Array(50).fill(0), ...Array(50).fill(0.5), ...Array(10).fill(0), ...Array(25).fill(0.5)];
  const keep = VlogData.keepRanges(lv, 20, { threshold: 0.05, minGap: 600, pad: 100 });
  assert.deepEqual(keep, [{ from: 0, to: 1100 }, { from: 1900, to: 3700 }]);
  // тишина в начале и в конце уходит целиком
  const edge = VlogData.keepRanges([...Array(40).fill(0), ...Array(50).fill(0.5), ...Array(40).fill(0)], 20, { threshold: 0.05, pad: 100 });
  assert.deepEqual(edge, [{ from: 700, to: 1900 }]);
});

test('дата съёмки: EXIF у JPEG и mvhd у MP4', () => {
  // маленький JPEG: SOI, APP1 Exif, TIFF (II), IFD0 с одним тегом 0x0132 DateTime
  const date = '2026:11:20 18:04:31\0';
  const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x32, 0x01, 2, 0, 20, 0, 0, 0, 26, 0, 0, 0, 0, 0, 0, 0, ...[...date].map((ch) => ch.charCodeAt(0))];
  const app1 = [...'Exif'].map((ch) => ch.charCodeAt(0)).concat([0, 0], tiff);
  const len = app1.length + 2;
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xda, 0, 2]);
  assert.equal(VlogData.takenFromBytes(jpg, 'image'), new Date(2026, 10, 20, 18, 4, 31).getTime());
  // mvhd версии 0: секунды с 1904 года
  const secs = Date.UTC(2025, 0, 2) / 1000 + 2082844800;
  const mp4 = new Uint8Array([0, 0, 0, 108, 0x6d, 0x76, 0x68, 0x64, 0, 0, 0, 0, secs >>> 24, (secs >>> 16) & 255, (secs >>> 8) & 255, secs & 255, ...Array(30).fill(0)]);
  assert.equal(VlogData.takenFromBytes(mp4, 'video'), Date.UTC(2025, 0, 2));
  assert.equal(VlogData.takenFromBytes(new Uint8Array(40), 'video'), 0);
});

test('клипы по дате съёмки: без даты — в конце в прежнем порядке', () => {
  const media = { a: { taken: 300 }, b: { taken: 100 }, c: {}, d: { taken: 200 }, e: {} };
  const clips = ['a', 'c', 'b', 'e', 'd'].map((m) => ({ media: m }));
  assert.deepEqual(VlogData.byTaken(clips, media).map((c) => c.media), ['b', 'd', 'a', 'c', 'e']);
  assert.equal(VlogData.dateText(new Date(2026, 10, 5).getTime(), 'cam'), 'NOV 05 2026');
  assert.equal(VlogData.dateText(new Date(2026, 10, 5).getTime(), 'words', 'ru'), '5 ноября');
});

test('субтитры: длинный кусок делится по словам, время по числу знаков', () => {
  const lines = VlogData.subLines([{ start: 0, end: 4000, text: ' раз два три четыре пять шесть ' }, { start: 5000, end: 5000, text: 'пусто' }], 14);
  assert.deepEqual(lines.map((l) => l.text), ['раз два три', 'четыре пять', 'шесть']);
  assert.equal(lines[0].start, 0);
  assert.equal(lines[2].end, 4000);
  assert.ok(lines[0].end > 0 && lines[0].end === lines[1].start);
});

test('длина ролика и площадки', () => {
  assert.equal(VlogData.limitsText(60000, '9:16', 'ru'), 'Подходит для Reels, Shorts, TikTok.');
  assert.match(VlogData.limitsText(240000, '9:16', 'ru'), /Reels и Shorts/);
  assert.match(VlogData.limitsText(60000, '16:9', 'en'), /9:16/);
});

test('субтитры: пометки вместо речи отбрасываются', () => {
  const lines = VlogData.subLines([{ start: 0, end: 1000, text: ' (whistling)' }, { start: 1000, end: 2000, text: '[Музыка] ♪ привет ♪' }]);
  assert.deepEqual(lines.map((l) => l.text), ['привет']);
});
