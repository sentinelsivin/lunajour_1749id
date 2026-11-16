/* Влог: разбор музыки для дорожки. Волна (громкость по кусочкам) и такты своего трека.
   Без браузерных зависимостей: на входе любой объект как AudioBuffer (sampleRate, length,
   numberOfChannels, getChannelData), поэтому то же самое проверяют тесты в Node (tests/). */
(function (root) {
  function monoOf(buf) {
    const n = buf.length;
    const out = new Float32Array(n);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels;
    }
    return out;
  }
  function peaks(buf, rate = 100) {
    const mono = monoOf(buf);
    const per = Math.max(1, Math.round(buf.sampleRate / rate));
    const out = new Float32Array(Math.ceil(mono.length / per));
    let max = 1e-4;
    for (let k = 0; k < out.length; k++) {
      let v = 0;
      for (let i = k * per, e = Math.min(mono.length, i + per); i < e; i++) { const a = Math.abs(mono[i]); if (a > v) v = a; }
      out[k] = v;
      if (v > max) max = v;
    }
    for (let k = 0; k < out.length; k++) out[k] /= max;
    return out;
  }
  /* Такты своего трека: огибающая ударов (рост громкости низов кадр к кадру), темп по автокорреляции
     в пределах 70–180 уд/мин, дальше каждый такт подтягивается к ближайшему удару, чтобы сетка не уплывала. */
  function find(buf) {
    const sr = buf.sampleRate;
    const mono = monoOf(buf);
    const hop = Math.round(sr / 100);
    const frames = Math.floor(mono.length / hop);
    if (frames < 300) return { beats: [], bpm: 0 };
    /* низы: простой сглаживающий фильтр, бочка и бас читаются лучше */
    /* два сглаживающих фильтра подряд: тарелки и хай-хэты почти не проходят.
       Громкость берём как есть (RMS), без логарифма: он раздувает тихие высокие щелчки между ударами */
    const low = new Float32Array(frames);
    let y1 = 0;
    let y2 = 0;
    const a = Math.exp((-2 * Math.PI * 150) / sr);
    for (let f = 0; f < frames; f++) {
      let e = 0;
      for (let i = f * hop, end = i + hop; i < end; i++) {
        y1 = (1 - a) * mono[i] + a * y1;
        y2 = (1 - a) * y1 + a * y2;
        e += y2 * y2;
      }
      low[f] = Math.sqrt(e / hop);
    }
    const env = new Float32Array(frames);
    for (let f = 1; f < frames; f++) env[f] = Math.max(0, low[f] - low[f - 1]);
    let mean = 0;
    for (let f = 0; f < frames; f++) mean += env[f];
    mean /= frames;
    for (let f = 0; f < frames; f++) env[f] = Math.max(0, env[f] - mean);
    /* темп: шаг между ударами в кадрах по 10 мс */
    /* кусочков в секунду: hop округлён до целого числа отсчётов, поэтому не ровно 100 */
    const fps = sr / hop;
    const minLag = Math.round((60 / 180) * fps);
    const maxLag = Math.round((60 / 70) * fps);
    const span = Math.min(frames, Math.round(60 * fps));
    let bestLag = 0;
    let best = -1;
    const score = [];
    for (let L = minLag; L <= maxLag; L++) {
      let s = 0;
      for (let f = L; f < span; f++) s += env[f] * env[f - L];
      /* чуть предпочитаем привычные темпы около 120 */
      const bpm = (60 * fps) / L;
      s *= Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
      score[L] = s;
      if (s > best) { best = s; bestLag = L; }
    }
    if (!bestLag || best <= 0) return { beats: [], bpm: 0 };
    /* дробная часть шага по соседям пика */
    const l0 = score[bestLag - 1] || 0;
    const l2 = score[bestLag + 1] || 0;
    const den = l0 - 2 * best + l2;
    const lag = bestLag + (den ? Math.max(-0.5, Math.min(0.5, (0.5 * (l0 - l2)) / den)) : 0);
    /* фаза: где удары сильнее всего в первых секундах */
    let phase = 0;
    let ph = -1;
    for (let f0 = 0; f0 < Math.ceil(lag); f0++) {
      let s = 0;
      for (let t = f0; t < frames; t += lag) s += env[Math.round(t)] || 0;
      if (s > ph) { ph = s; phase = f0; }
    }
    const beats = [];
    const win = Math.max(1, Math.round(lag * 0.1));
    for (let t = phase; t < frames; t += lag) {
      const base = Math.round(t);
      let at = base;
      let top = env[base] || 0;
      for (let d = -win; d <= win; d++) {
        const v = env[base + d] || 0;
        if (v > top) { top = v; at = base + d; }
      }
      /* слабый удар не тянет сетку: остаёмся на расчётном месте */
      if (top < (env[base] || 0) * 1.3 + 1e-6) at = base;
      /* сетка идёт за найденным ударом, но не прыгает дальше окна */
      if (at !== Math.round(t)) t = at;
      beats.push(at / fps);
    }
    return { beats, bpm: Math.round((60 * fps) / lag) };
  }

  root.VlogBeats = { peaks, find, monoOf };
})(typeof window !== 'undefined' ? window : globalThis);
