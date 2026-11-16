// Загружает браузерный скрипт из js/ в отдельный контекст Node и возвращает его window.
// Скрипты пишут в window.Имя, поэтому достаточно подставить пустой window.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));

export function load(...names) {
  const window = {};
  /* в том же контексте, что и тесты: иначе массивы из скрипта не равны нашим при строгом сравнении */
  for (const name of names) {
    const run = vm.compileFunction(readFileSync(`${root}js/${name}`, 'utf8'), ['window'], { filename: name });
    run(window);
  }
  return window;
}

// Тестовый трек: удар бочки на каждый такт, по желанию хай-хэт на слабых долях, тянущийся бас и шум.
// Возвращает объект как AudioBuffer: этого достаточно для разбора музыки.
export function beatTrack({ sr = 22050, dur, bpm, offset, hats = 0, bass = 0, noise = 0.04, seed = 1 }) {
  const n = Math.round(sr * dur);
  const d = new Float32Array(n);
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let i = 0; i < n; i++) d[i] = (rnd() * 2 - 1) * noise;
  const step = 60 / bpm;
  for (let t = offset; t < dur; t += step) {
    const i0 = Math.round(t * sr);
    let phase = 0;
    for (let k = 0; k < sr * 0.3 && i0 + k < n; k++) {
      const tt = k / sr;
      const f = 40 + 60 * Math.exp(-tt / 0.05);
      phase += (2 * Math.PI * f) / sr;
      d[i0 + k] += 0.8 * Math.sin(phase) * Math.exp(-tt / 0.06);
    }
    if (hats) {
      const h0 = Math.round((t + step / 2) * sr);
      let prev = 0;
      for (let k = 0; k < sr * 0.05 && h0 + k < n; k++) {
        const w = rnd() * 2 - 1;
        d[h0 + k] += hats * (w - prev) * (1 - k / (sr * 0.05));
        prev = w;
      }
    }
  }
  if (bass) {
    for (let t = offset; t < dur; t += step * 2) {
      for (let i = Math.round((t + 0.02) * sr), e = Math.min(n, Math.round((t + step * 2 - 0.02) * sr)); i < e; i++) {
        d[i] += bass * (((i / sr) * 55) % 1 * 2 - 1);
      }
    }
  }
  return { sampleRate: sr, length: n, numberOfChannels: 1, duration: dur, getChannelData: () => d };
}
