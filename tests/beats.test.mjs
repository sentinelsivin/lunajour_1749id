// Разбор музыки влога: темп и такты своего трека, волна.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, beatTrack } from './load.mjs';

const { VlogBeats } = load('vlog-beats.js');

// Найденные такты: темп совпадает, почти каждый такт на ударе (±25 мс), сетка не съезжает к концу.
function check(opts) {
  const { beats, bpm } = VlogBeats.find(beatTrack(opts));
  const step = 60 / opts.bpm;
  assert.ok(Math.abs(bpm - opts.bpm) <= 1, `темп ${bpm}, ждали ${opts.bpm}`);
  const err = beats.map((b) => {
    const k = Math.round((b - opts.offset) / step);
    return Math.abs(b - (opts.offset + k * step));
  });
  const onBeat = err.filter((e) => e < 0.025).length;
  const expected = Math.floor((opts.dur - opts.offset) / step) + 1;
  assert.ok(onBeat >= expected - 1, `на ударе ${onBeat} из ${expected}`);
  assert.ok(err[err.length - 1] < 0.025, `последний такт съехал на ${Math.round(err[err.length - 1] * 1000)} мс`);
}

test('ровный трек 120 уд/мин', () => check({ dur: 40, bpm: 120, offset: 0.37 }));
test('97 уд/мин с хай-хэтами между ударами и басом: сетка не уходит на слабые доли', () => check({ dur: 90, bpm: 97, offset: 0.82, hats: 0.6, bass: 0.12, noise: 0.05 }));
test('быстрый 150 уд/мин с громкими хай-хэтами', () => check({ dur: 60, bpm: 150, offset: 0.1, hats: 0.8, noise: 0.08 }));
test('медленный 75 уд/мин с басом', () => check({ dur: 60, bpm: 75, offset: 1.2, bass: 0.2, noise: 0.03 }));

test('частота 48 кГц (звук видео с телефона)', () => check({ sr: 48000, dur: 30, bpm: 104, offset: 0.25, hats: 0.5 }));
test('частота 44,1 кГц (обычный mp3)', () => check({ sr: 44100, dur: 30, bpm: 88, offset: 0.6, bass: 0.15 }));

test('слишком короткий трек: тактов нет, без ошибки', () => {
  const { beats, bpm } = VlogBeats.find(beatTrack({ dur: 2, bpm: 120, offset: 0 }));
  assert.deepEqual([beats.length, bpm], [0, 0]);
});

test('волна: по кусочку на каждые 10 мс, громкость от 0 до 1, на ударе громче, чем между ударами', () => {
  const buf = beatTrack({ dur: 4, bpm: 120, offset: 0.5, noise: 0.02 });
  const peaks = VlogBeats.peaks(buf, 100);
  assert.equal(peaks.length, 400);
  assert.ok(Math.max(...peaks) <= 1 && Math.min(...peaks) >= 0);
  assert.ok(peaks[51] > 0.5, 'на ударе громко');
  assert.ok(peaks[80] < 0.2, 'между ударами тихо');
});
