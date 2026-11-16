/* Влог: быстрая запись ролика через WebCodecs.
   Звук сводится заранее, без проигрывания (OfflineAudioContext). Видео читается из файла подряд, кадр за кадром
   (mediabunny), кадр рисуется тем же drawFrame, что и просмотр, и кодируется в MP4.
   Ничего не идёт в реальном времени, поэтому кадры не пропадают, а ролик собирается быстрее, чем идёт.
   Где браузер этого не умеет, остаётся старая запись в реальном времени (VlogEngine.record). */
window.VlogFast = (function () {
  const { Timeline, VlogEngine: Engine, Render } = window;
  const FPS = 30;
  const SR = 48000;
  /* декодировать звук целиком из очень больших видео телефону тяжело: такие пишем по-старому */
  const MAX_AUDIO_BYTES = 300 * 1024 * 1024;

  const hasApi = () => typeof window.VideoEncoder === 'function' && typeof window.AudioEncoder === 'function'
    && typeof window.VideoDecoder === 'function' && typeof window.VideoFrame === 'function' && typeof window.OfflineAudioContext === 'function';

  /* клипы, чей звук слышен в ролике */
  const audible = (p) => p.clips.filter((c) => c.kind === 'video' && c.vol > 0);

  /* mediabunny (js/vendor): читает видео подряд и собирает MP4. Грузится только при сохранении ролика */
  let mbLoad = null;
  function lib() {
    if (!mbLoad) {
      mbLoad = import(new URL('js/vendor/mediabunny.min.mjs', document.baseURI).href).catch((err) => { mbLoad = null; throw err; });
    }
    return mbLoad;
  }
  const bitrateFor = (W, H) => Math.min(16000000, Math.round(W * H * FPS * 0.3));
  const sizeOf = (p, size) => {
    const [RW, RH] = Render.RATIOS[p.ratio];
    const W = Math.round(size / 2) * 2;
    return [W, Math.round((W * RH) / RW / 2) * 2];
  };

  /* Быструю запись берём, только если она выйдет такой же, как просмотр.
     Ускоренный или замедленный клип со звуком в просмотре звучит без смены высоты голоса, а сведение заранее так не умеет. */
  async function can(p, size = 720) {
    if (!hasApi() || !p.clips.length) return false;
    if (audible(p).some((c) => (c.speed || 1) !== 1)) return false;
    let bytes = 0;
    for (const id of new Set(audible(p).map((c) => c.media))) {
      const b = await Engine.blobOf(id);
      bytes += b ? b.size : 0;
    }
    if (bytes > MAX_AUDIO_BYTES) return false;
    try {
      const MB = await lib();
      const [W, H] = sizeOf(p, size);
      /* AAC нужен, чтобы ролик со звуком открывался везде, включая «Фото» на айфоне */
      return (await MB.canEncodeVideo('avc', { width: W, height: H, bitrate: bitrateFor(W, H) }))
        && (await MB.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: SR, bitrate: 160000 }));
    } catch {
      return false;
    }
  }

  /* ---------- звук: всё сведение заранее ---------- */
  async function decode(id) {
    const blob = await Engine.blobOf(id);
    if (!blob) return null;
    try {
      const data = await blob.arrayBuffer();
      return await new OfflineAudioContext(2, 1, SR).decodeAudioData(data);
    } catch {
      return null; /* в видео нет звуковой дорожки или браузер её не читает */
    }
  }

  /* громкость кусочка звука: так же, как в просмотре, решаем, звучит ли голос */
  function rms(buf, from, n) {
    const a = buf.getChannelData(0);
    const b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
    const end = Math.min(a.length, from + n);
    let sum = 0;
    let k = 0;
    for (let i = Math.max(0, from); i < end; i++, k++) {
      const v = (a[i] + b[i]) / 2;
      sum += v * v;
    }
    return k ? Math.sqrt(sum / k) : 0;
  }

  async function mix(p, total, signal) {
    const T = total / 1000;
    const oc = new OfflineAudioContext(2, Math.max(1, Math.ceil(T * SR)), SR);
    const starts = Timeline.starts(p);
    const buffers = new Map();
    const voices = [];
    let any = false;

    for (let i = 0; i < p.clips.length; i++) {
      const c = p.clips[i];
      if (c.kind !== 'video' || !(c.vol > 0)) continue;
      if (signal && signal.aborted) return null;
      if (!buffers.has(c.media)) buffers.set(c.media, await decode(c.media));
      const buf = buffers.get(c.media);
      if (!buf) continue;
      const s = starts[i] / 1000;
      const l = Timeline.len(c) / 1000;
      const v = c.vol / 100;
      const [fin, fout] = Engine.edgeMs(p, i).map((ms) => Math.min(ms / 1000, l / 2));
      const src = oc.createBufferSource();
      src.buffer = buf;
      const g = oc.createGain();
      /* на стыках звук нарастает и затихает, как в просмотре */
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(v, s + fin);
      g.gain.setValueAtTime(v, s + l - fout);
      g.gain.linearRampToValueAtTime(0, s + l);
      src.connect(g).connect(oc.destination);
      src.start(s, c.in / 1000, l);
      voices.push({ s, l, buf, off: c.in / 1000, v });
      any = true;
    }

    /* озвучка: как звук клипа, со своей громкостью; музыка под ней тоже приглушается */
    for (const o of (p.overlays || []).filter((x) => x.layer.type === 'voice')) {
      if (signal && signal.aborted) return null;
      if (!buffers.has(o.layer.media)) buffers.set(o.layer.media, await decode(o.layer.media));
      const buf = buffers.get(o.layer.media);
      if (!buf) continue;
      const s = o.start / 1000;
      const l = Math.max(0, Math.min(o.end, total) - o.start) / 1000;
      const off = (o.layer.from || 0) / 1000;
      if (!l || off >= buf.duration) continue;
      const v = Math.max(0, (o.layer.vol ?? 100) / 100);
      const src = oc.createBufferSource();
      src.buffer = buf;
      const g = oc.createGain();
      g.gain.value = v;
      src.connect(g).connect(oc.destination);
      src.start(s, off, l);
      voices.push({ s, l, buf, off, v });
      any = true;
    }

    const mbuf = await Engine.musicBuffer(p).catch(() => null);
    if (mbuf) {
      const src = oc.createBufferSource();
      src.buffer = mbuf;
      const own = !!p.music.fileId;
      if (!own) { src.loop = true; src.loopEnd = mbuf.duration; }
      const g = oc.createGain();
      const duck = oc.createGain();
      const v = Math.max(0.0001, p.music.vol / 100);
      const fi = Math.max(0, Number(p.music.fadeIn) || 0);
      const fo = Math.max(0, Number(p.music.fadeOut ?? 1));
      const level = (x) => Math.max(0.0001, fi > 0 ? v * Math.min(1, x / fi) : v);
      const outAt = Math.max(0, T - fo);
      g.gain.setValueAtTime(level(0), 0);
      if (fi > 0) g.gain.linearRampToValueAtTime(level(Math.min(fi, outAt)), Math.min(fi, outAt));
      g.gain.setValueAtTime(level(outAt), outAt);
      g.gain.linearRampToValueAtTime(0.0001, T);

      /* музыка тише, пока в клипе звучит голос: те же порог, задержка и скорость, что в просмотре */
      if (p.music.duck !== false && voices.length) {
        const STEP = 0.05;
        const n = Math.ceil(T / STEP);
        const voiced = new Uint8Array(n);
        voices.forEach((vc) => {
          for (let w = Math.floor(vc.s / STEP); w < Math.min(n, Math.ceil((vc.s + vc.l) / STEP)); w++) {
            const at = vc.off + (w * STEP - vc.s);
            if (rms(vc.buf, Math.round(at * vc.buf.sampleRate), Math.round(STEP * vc.buf.sampleRate)) * vc.v > Engine.DUCK_RMS) voiced[w] = 1;
          }
        });
        let down = false;
        let last = -1;
        for (let w = 0; w < n; w++) {
          const t = w * STEP;
          if (voiced[w]) {
            last = t + STEP;
            if (!down) { duck.gain.setTargetAtTime(Engine.DUCK_TO, t, 0.06); down = true; }
          } else if (down && t - last >= Engine.DUCK_HOLD) {
            duck.gain.setTargetAtTime(1, t, 0.3);
            down = false;
          }
        }
      }
      src.connect(g).connect(duck).connect(oc.destination);
      if (own) {
        const offset = p.music.start || 0;
        if (offset < mbuf.duration) src.start(0, offset);
      } else src.start(0);
      any = true;
    }
    if (!any) return null;
    return oc.startRendering();
  }

  /* ---------- видео: каждый клип читается из файла подряд ---------- */
  /* Для каждого видеоклипа заранее известны все моменты файла, которые понадобятся, по порядку кадров ролика.
     Декодер идёт по файлу вперёд и отдаёт ровно эти кадры, без перемотки на каждом шаге. */
  function plan(p, frames, total) {
    const byClip = new Map();
    for (let i = 0; i < frames; i++) {
      const t = Math.min(total - 1, (i * 1000) / FPS);
      Engine.frameNeeds(p, t).forEach(([clip, local]) => {
        if (clip.kind !== 'video') return;
        if (!byClip.has(clip.id)) byClip.set(clip.id, { clip, frames: [], times: [] });
        const e = byClip.get(clip.id);
        e.frames.push(i);
        e.times.push(Math.max(0, local / 1000));
      });
    }
    return byClip;
  }

  /* читатель кадров одного клипа; null, если этот файл так не читается (тогда кадры берём перемоткой) */
  async function reader(MB, entry, inputs) {
    try {
      const id = entry.clip.media;
      if (!inputs.has(id)) {
        const blob = await Engine.blobOf(id);
        const input = new MB.Input({ source: new MB.BlobSource(blob), formats: MB.ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (!track || !(await track.canDecode())) throw new Error('cannot decode');
        inputs.set(id, { input, track, start: await track.getFirstTimestamp() });
      }
      const { track, start } = inputs.get(id);
      /* время в файле: у некоторых видео первый кадр стоит не на нуле */
      const sink = new MB.VideoSampleSink(track);
      const it = sink.samplesAtTimestamps(entry.times.map((s) => s + start));
      const canvas = Render.canvas(1, 1);
      return { it, canvas, x: canvas.getContext('2d'), k: 0, have: false };
    } catch {
      return null;
    }
  }

  async function nextFrame(r) {
    const { value: sample, done } = await r.it.next();
    r.k++;
    if (done || !sample) return r.have;
    const w = sample.displayWidth;
    const h = sample.displayHeight;
    if (r.canvas.width !== w || r.canvas.height !== h) { r.canvas.width = w; r.canvas.height = h; }
    sample.draw(r.x, 0, 0, w, h);
    sample.close();
    r.have = true;
    return true;
  }

  /* ---------- обложка ---------- */
  /* Кадр ролика в момент t на холсте ширины size: видео ставится на кадр перемоткой.
     Из него обложка картинкой и, если выбрано, первые кадры ролика (галерея показывает первый кадр). */
  const COVER_FRAMES = 3;
  async function cover(p, size, t) {
    const [W, H] = sizeOf(p, size);
    const c = Render.canvas(W, H);
    const x = c.getContext('2d');
    const total = Timeline.duration(p);
    const at = Math.max(0, Math.min(total - 1, t || 0));
    await Engine.preload(p);
    for (const [clip, local] of Engine.frameNeeds(p, at)) {
      Engine.setFrame(clip.media, null);
      await Engine.seekClip(clip, local);
    }
    Engine.drawFrame(x, p, at, { seek: false });
    return c;
  }

  /* ---------- запись ---------- */
  async function record(p, size, onProgress, signal) {
    const MB = await lib();
    const [W, H] = sizeOf(p, size);
    const total = Timeline.duration(p);
    await Engine.preload(p);

    /* звук: первые 10% полоски */
    onProgress(0.01);
    const sound = await mix(p, total, signal);
    if (signal && signal.aborted) return null;
    /* обложка первым кадром: первые доли секунды показывают выбранный кадр, длина и звук не меняются */
    const coverPic = p.cover && p.cover.first ? await cover(p, size, p.cover.at) : null;
    onProgress(0.1);

    const c = Render.canvas(W, H);
    const x = c.getContext('2d', { willReadFrequently: true });
    const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() });
    const video = new MB.CanvasSource(c, { codec: 'avc', bitrate: bitrateFor(W, H), keyFrameInterval: 2 });
    output.addVideoTrack(video, { frameRate: FPS });
    const audio = sound ? new MB.AudioBufferSource({ codec: 'aac', bitrate: 160000 }) : null;
    if (audio) output.addAudioTrack(audio);

    const frames = Math.max(1, Math.round((total / 1000) * FPS));
    const byClip = plan(p, frames, total);
    const inputs = new Map();
    const readers = new Map();
    let ok = false;
    Engine.setExporting(true);
    try {
      await output.start();
      if (audio) await audio.add(sound);
      for (let i = 0; i < frames; i++) {
        if (signal && signal.aborted) return null;
        const t = Math.min(total - 1, (i * 1000) / FPS);
        for (const [clip, local] of Engine.frameNeeds(p, t)) {
          const entry = clip.kind === 'video' && byClip.get(clip.id);
          if (entry && !readers.has(clip.id)) readers.set(clip.id, await reader(MB, entry, inputs));
          const r = entry && readers.get(clip.id);
          if (r && r.it && (await nextFrame(r))) {
            Engine.setFrame(clip.media, { el: r.canvas, w: r.canvas.width, h: r.canvas.height });
            /* клип кончился: читатель больше не нужен, освобождаем декодер */
            if (r.k >= entry.times.length) { r.it.return(); readers.set(clip.id, { done: true }); }
          } else {
            /* файл не читается подряд: ставим видео на кадр перемоткой, как раньше */
            Engine.setFrame(clip.media, null);
            await Engine.seekClip(clip, local);
          }
        }
        Engine.drawFrame(x, p, t, { seek: false });
        if (coverPic && i < COVER_FRAMES) x.drawImage(coverPic, 0, 0, W, H);
        await video.add(i / FPS, 1 / FPS);
        onProgress(0.1 + 0.88 * ((i + 1) / frames));
      }
      video.close();
      if (audio) audio.close();
      await output.finalize();
      ok = true;
      onProgress(1);
      return new Blob([output.target.buffer], { type: 'video/mp4' });
    } finally {
      if (!ok) await output.cancel().catch(() => {});
      readers.forEach((r) => { if (r && r.it) r.it.return(); });
      inputs.forEach(({ input }) => { if (input.dispose) input.dispose(); });
      Engine.setExporting(false);
    }
  }

  return { can, record, cover };
})();
