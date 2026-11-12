/* Музыка для видео: свой трек из файла или одна из встроенных мелодий.
   Встроенные мелодии не скачиваются: код сам собирает их из простых звуков при первом выборе,
   поэтому прав на них ни у кого нет и сеть не нужна. Каждая мелодия закольцована без стыка. */
(function () {
  let ac = null;
  const ctx = () => ac || (ac = new (window.AudioContext || window.webkitAudioContext)());
  /* браузеры запускают звук только после нажатия: вызывать прямо в обработчике клика */
  function unlock() {
    try {
      const c = ctx();
      if (c.state === 'suspended') c.resume();
    } catch { /* без звука тоже работает */ }
  }

  const TRACKS = [
    { id: 'lofi', name: 'Лоу-фай' },
    { id: 'dream', name: 'Мечта' },
    { id: 'neon', name: 'Неон' },
  ];
  const cache = new Map();
  let file = null;

  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  /* ---------- встроенные мелодии ---------- */
  /* Каждая собирается в OfflineAudioContext. Хвост после конца петли (эхо, затухание)
     переносится в начало, чтобы при повторе не было щелчка и обрыва. */
  async function synth(id) {
    const sr = 44100;
    const spec = {
      lofi: { bpm: 78, bars: 4 },
      dream: { bpm: 70, bars: 4 },
      neon: { bpm: 108, bars: 4 },
    }[id];
    const beat = 60 / spec.bpm;
    const loop = spec.bars * 4 * beat;
    const tail = 3;
    const oc = new OfflineAudioContext(2, Math.ceil((loop + tail) * sr), sr);

    const comp = oc.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    const master = oc.createGain();
    master.gain.value = 0.8;
    master.connect(comp);
    comp.connect(oc.destination);

    let noiseBuf = null;
    const noise = () => {
      if (!noiseBuf) {
        noiseBuf = oc.createBuffer(1, sr, sr);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const n = oc.createBufferSource();
      n.buffer = noiseBuf;
      n.loop = true;
      return n;
    };
    const env = (g, t, a, peak, d, rest = 0.0001) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, rest), t + a + d);
    };
    const kick = (t, level = 0.9) => {
      const o = oc.createOscillator();
      const g = oc.createGain();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      env(g, t, 0.004, level, 0.38);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.45);
    };
    const hiss = (t, freq, type, level, d, q = 0.8) => {
      const n = noise();
      const f = oc.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = oc.createGain();
      env(g, t, 0.002, level, d);
      n.connect(f).connect(g).connect(master);
      n.start(t, Math.random() * 0.5);
      n.stop(t + d + 0.05);
    };
    /* нота: несколько генераторов через фильтр с огибающей */
    const note = (t, midi, len, { waves = ['sine'], level = 0.1, attack = 0.01, decay = len, cut = 2000, detune = 0, dest = master, rest = 0.0001 } = {}) => {
      const g = oc.createGain();
      env(g, t, attack, level, decay, rest);
      g.gain.setValueAtTime(Math.max(0.0001, rest), t + attack + decay);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay + 0.4);
      const f = oc.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cut;
      f.connect(g).connect(dest);
      waves.forEach((w, k) => {
        const o = oc.createOscillator();
        o.type = w;
        o.frequency.value = hz(midi);
        o.detune.value = detune * (k % 2 ? -1 : 1);
        o.connect(f);
        o.start(t);
        o.stop(t + attack + decay + 0.5);
      });
    };
    const echo = (time, feedback, level) => {
      const inp = oc.createGain();
      const dl = oc.createDelay(2);
      dl.delayTime.value = time;
      const fb = oc.createGain();
      fb.gain.value = feedback;
      const wet = oc.createGain();
      wet.gain.value = level;
      inp.connect(master);
      inp.connect(dl);
      dl.connect(fb).connect(dl);
      dl.connect(wet).connect(master);
      return inp;
    };

    if (id === 'lofi') {
      /* тёплое пианино, мягкая бочка, щелчки пластинки */
      const chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
      const keys = echo(beat * 0.75, 0.25, 0.25);
      chords.forEach((ch, bar) => {
        const t0 = bar * 4 * beat;
        [0, 1.5, 2.5].forEach((b, k) => ch.forEach((m) => note(t0 + b * beat, m, k ? 0.9 : 1.6, { waves: ['sine', 'triangle'], level: k ? 0.045 : 0.06, cut: 1600, dest: keys })));
        note(t0, ch[0] - 12, 1.4, { waves: ['sine'], level: 0.22, cut: 400 });
        note(t0 + 2 * beat, ch[0] - 12, 1.2, { waves: ['sine'], level: 0.18, cut: 400 });
        for (let b = 0; b < 4; b++) {
          const t = t0 + b * beat;
          if (b === 0 || b === 2) kick(t, 0.7);
          if (b === 1 || b === 3) hiss(t, 1800, 'bandpass', 0.18, 0.16);
          /* хай-хэт восьмыми с покачиванием */
          hiss(t, 7500, 'highpass', 0.05, 0.04);
          hiss(t + beat * 0.58, 7500, 'highpass', 0.035, 0.035);
        }
      });
      for (let i = 0; i < loop * 9; i++) hiss(Math.random() * loop, 3000, 'highpass', 0.02 + Math.random() * 0.03, 0.006);
    } else if (id === 'dream') {
      /* медленные облака аккордов и колокольчики с эхом */
      const chords = [[45, 48, 52, 57], [41, 45, 48, 53], [48, 52, 55, 60], [43, 47, 50, 55]];
      const bells = echo(beat * 1.5, 0.4, 0.4);
      chords.forEach((ch, bar) => {
        const t0 = bar * 4 * beat;
        ch.forEach((m) => note(t0, m, 4 * beat, { waves: ['sawtooth', 'sawtooth'], detune: 8, level: 0.03, attack: 1.2, decay: 4 * beat - 1, rest: 0.02, cut: 900 }));
        const arp = [ch[1] + 24, ch[2] + 24, ch[3] + 24, ch[2] + 24, ch[1] + 36, ch[3] + 24, ch[2] + 24, ch[0] + 36];
        arp.forEach((m, k) => note(t0 + k * beat * 0.5, m, 0.7, { waves: ['sine'], level: k % 2 ? 0.05 : 0.07, cut: 6000, dest: bells }));
      });
    } else {
      /* неон: бас восьмыми, бочка на каждую долю, хлопок на 2 и 4, яркие аккорды */
      const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
      const stabs = echo(beat * 0.75, 0.3, 0.3);
      chords.forEach((ch, bar) => {
        const t0 = bar * 4 * beat;
        for (let e = 0; e < 8; e++) note(t0 + e * beat * 0.5, ch[0] - 24, beat * 0.4, { waves: ['sawtooth'], level: 0.12, cut: 500 });
        [0, 1.5, 3].forEach((b) => ch.forEach((m) => note(t0 + b * beat, m, beat * 0.5, { waves: ['square', 'sawtooth'], detune: 6, level: 0.025, cut: 2400, dest: stabs })));
        for (let b = 0; b < 4; b++) {
          const t = t0 + b * beat;
          kick(t, 0.85);
          if (b % 2) hiss(t, 1400, 'bandpass', 0.3, 0.14, 1.2);
          hiss(t + beat * 0.5, 9000, 'highpass', 0.06, 0.05);
        }
      });
    }

    const out = await oc.startRendering();
    const n = Math.round(loop * sr);
    const looped = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
    for (let c = 0; c < 2; c++) {
      const src = out.getChannelData(c);
      const dst = looped.getChannelData(c);
      dst.set(src.subarray(0, n));
      for (let i = n; i < src.length; i++) dst[(i - n) % n] += src[i];
    }
    /* все мелодии к одной громкости: одинаковая средняя сила звука, без перегруза */
    let peak = 0, sum = 0;
    for (let c = 0; c < 2; c++) {
      const d = looped.getChannelData(c);
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; }
    }
    const rms = Math.sqrt(sum / (n * 2)) || 1;
    const k = Math.min(0.085 / rms, 0.9 / (peak || 1));
    for (let c = 0; c < 2; c++) {
      const d = looped.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
    return looped;
  }

  async function decodeFile(blob) {
    const data = await blob.arrayBuffer();
    return new Promise((resolve, reject) => {
      const p = ctx().decodeAudioData(data, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  }

  function buffer(id) {
    if (!id) return Promise.resolve(null);
    if (id === 'file' && !file) return Promise.resolve(null);
    if (!cache.has(id)) {
      const p = (id === 'file' ? decodeFile(file.blob) : synth(id)).catch((err) => {
        cache.delete(id);
        throw err;
      });
      cache.set(id, p);
    }
    return cache.get(id);
  }
  /* длина уже собранной мелодии или 0, если ещё не готова */
  const loaded = new Map();
  async function duration(id) {
    const b = await buffer(id);
    if (b) loaded.set(id, b.duration);
    return b ? b.duration : 0;
  }

  function setFile(blob, name) {
    file = blob ? { blob, name: name || '' } : null;
    cache.delete('file');
    loaded.delete('file');
  }

  /* источник звука: встроенная мелодия идёт по кругу, свой трек играет с выбранной секунды */
  function source(c, buf, id, from) {
    const s = c.createBufferSource();
    s.buffer = buf;
    if (id !== 'file') {
      s.loop = true;
      s.loopStart = 0;
      s.loopEnd = buf.duration;
    }
    const at = id !== 'file' ? from % buf.duration : Math.min(from, Math.max(0, buf.duration - 0.05));
    return { s, at };
  }

  /* ---------- прослушивание в редакторе ---------- */
  let live = null;
  async function play(id, from, vol, len) {
    stop();
    const buf = await buffer(id);
    if (!buf) return false;
    const c = ctx();
    if (c.state === 'suspended') await c.resume().catch(() => {});
    const { s, at } = source(c, buf, id, from);
    const g = c.createGain();
    const now = c.currentTime;
    const v = Math.max(0.0001, vol / 100);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(v, now + 0.04);
    if (len) {
      g.gain.setValueAtTime(v, now + Math.max(0.05, len - 0.6));
      g.gain.linearRampToValueAtTime(0, now + len);
    }
    s.connect(g).connect(c.destination);
    s.start(now, at);
    if (len) s.stop(now + len + 0.05);
    live = { s, g };
    return true;
  }
  function stop() {
    if (!live) return;
    try { live.s.stop(); } catch { /* уже остановлен */ }
    live.s.disconnect();
    live = null;
  }
  function setVolume(vol) {
    if (live) live.g.gain.setTargetAtTime(Math.max(0.0001, vol / 100), ctx().currentTime, 0.03);
  }

  /* ---------- дорожка для записи видео ---------- */
  /* begin() запускает звук ровно со старта записи, в конце звук затихает за полсекунды */
  async function track(id, from, vol, len) {
    const buf = await buffer(id);
    if (!buf) return null;
    const c = ctx();
    if (c.state === 'suspended') await c.resume().catch(() => {});
    if (!c.createMediaStreamDestination) return null;
    const dest = c.createMediaStreamDestination();
    const g = c.createGain();
    g.connect(dest);
    let s = null;
    return {
      stream: dest.stream,
      begin() {
        const now = c.currentTime;
        const v = Math.max(0.0001, vol / 100);
        const src = source(c, buf, id, from);
        s = src.s;
        s.connect(g);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(v, now + 0.03);
        g.gain.setValueAtTime(v, now + Math.max(0.05, len - 0.6));
        g.gain.linearRampToValueAtTime(0, now + len);
        s.start(now, src.at);
      },
      end() {
        try { if (s) s.stop(); } catch { /* уже остановлен */ }
        dest.stream.getTracks().forEach((tr) => tr.stop());
      },
    };
  }

  /* формат видео со звуком: сначала MP4 (его понимают айфоны и галерея), потом WebM */
  function mime() {
    const list = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  window.Music = {
    TRACKS, unlock, buffer, duration, setFile, play, stop, setVolume, track, mime,
    get fileName() { return file ? file.name : ''; },
    get hasFile() { return !!file; },
    get playing() { return !!live; },
  };
})();
