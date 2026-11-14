/* Влог: файлы, кадр в момент t, воспроизведение со звуком и запись ролика.
   Один и тот же drawFrame рисует и просмотр, и кадры сохранённого ролика: что видно, то и выйдет. */
window.VlogEngine = (function () {
  const { Timeline, Store, Render } = window;
  /* больше трёх живых видео телефоны не любят: аппаратных декодеров мало, iOS начинает выгружать вкладку */
  const POOL = 3;
  const IMAGE_MAX = 1920;
  const THUMB_H = 96;
  const PRELOAD_MS = 1500;
  const DRIFT_MS = 180;

  const blobKey = (id) => `vlog-m-${id}`;
  const isMov = (blob) => blob.type === 'video/quicktime' || /\.(mov|qt)$/i.test(blob.name || '');
  /* MOV с айфона внутри обычный MP4: Chrome открывает его, если назвать тип иначе */
  const playable = (blob) => (isMov(blob) ? new Blob([blob], { type: 'video/mp4' }) : blob);

  /* ---------- звук: один контекст на просмотр и запись ---------- */
  let ac = null;
  let master = null;
  let speakers = true;
  function audio() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  function muteSpeakers(off) {
    if (!master || speakers === !off) return;
    speakers = !off;
    if (off) master.disconnect(ac.destination);
    else master.connect(ac.destination);
  }

  /* ---------- файлы ---------- */
  const blobs = new Map();
  const images = new Map();
  async function blobOf(id) {
    if (blobs.has(id)) return blobs.get(id);
    const b = await Store.get(blobKey(id));
    if (b) blobs.set(id, b);
    return b || null;
  }

  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }
  /* большие фото сразу уменьшаем: 12 Мп в памяти на каждый кадр не нужны */
  function shrink(img, max) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = Render.canvas(img.naturalWidth * k, img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function videoEl(blob) {
    const el = document.createElement('video');
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.preload = 'auto';
    el.src = URL.createObjectURL(playable(blob));
    return el;
  }
  const once = (el, name, ms = 15000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => { el.removeEventListener(name, ok); reject(new Error(`${name} timeout`)); }, ms);
    function ok() { clearTimeout(t); resolve(); }
    el.addEventListener(name, ok, { once: true });
  });
  /* у роликов, снятых в браузере, длина бывает Infinity, пока не прыгнешь в конец */
  async function realDuration(el) {
    if (Number.isFinite(el.duration)) return el.duration;
    el.currentTime = 1e9;
    await once(el, 'durationchange', 5000).catch(() => {});
    const d = el.duration;
    el.currentTime = 0;
    return Number.isFinite(d) ? d : 5;
  }

  function thumbOf(source, w, h) {
    const th = Render.canvas(Math.max(1, Math.round((THUMB_H * w) / h)), THUMB_H);
    th.getContext('2d').drawImage(source, 0, 0, th.width, th.height);
    return th.toDataURL('image/jpeg', 0.7);
  }

  /* новый файл: кладём в базу и узнаём размер, длину и картинку для ленты */
  async function importFile(file) {
    const video = file.type.startsWith('video/') || (!file.type.startsWith('image/') && /\.(mp4|m4v|mov|webm|mkv|3gp)$/i.test(file.name));
    const id = Timeline.uid();
    const m = { id, kind: video ? 'video' : 'image', name: file.name || '', w: 0, h: 0, dur: 0, thumb: '' };
    if (video) {
      const el = videoEl(file);
      el.muted = true;
      try {
        await once(el, 'loadeddata');
        m.dur = Math.round((await realDuration(el)) * 1000);
        m.w = el.videoWidth;
        m.h = el.videoHeight;
        el.currentTime = Math.min(0.2, m.dur / 2000);
        await once(el, 'seeked', 5000).catch(() => {});
        m.thumb = thumbOf(el, m.w, m.h);
      } finally {
        URL.revokeObjectURL(el.src);
        el.removeAttribute('src');
        el.load();
      }
      if (!m.w) throw new Error('no picture');
    } else {
      const img = await loadImage(file);
      const small = shrink(img, IMAGE_MAX);
      images.set(id, small);
      m.w = small.width;
      m.h = small.height;
      m.thumb = thumbOf(small, m.w, m.h);
    }
    await Store.set(blobKey(id), file);
    blobs.set(id, file);
    return m;
  }

  async function forget(id) {
    blobs.delete(id);
    images.delete(id);
    drop(id);
    await Store.del(blobKey(id));
  }

  /* ---------- живые видео: маленький пул, самые старые освобождаем ---------- */
  const pool = new Map();
  function drop(id) {
    const v = pool.get(id);
    if (!v) return;
    v.el.pause();
    if (v.node) v.node.disconnect();
    URL.revokeObjectURL(v.el.src);
    v.el.removeAttribute('src');
    v.el.load();
    pool.delete(id);
  }
  function video(id) {
    if (pool.has(id)) {
      const v = pool.get(id);
      pool.delete(id);
      pool.set(id, v);
      return v;
    }
    const blob = blobs.get(id);
    if (!blob) { blobOf(id).then((b) => b && changed()); return null; }
    while (pool.size >= POOL) drop(pool.keys().next().value);
    const el = videoEl(blob);
    const v = { el, node: null, gain: null, ready: false, want: -1 };
    el.addEventListener('loadeddata', () => { v.ready = true; changed(); });
    el.addEventListener('seeked', changed);
    /* звук клипа идёт через общий контекст: так его можно и слышать, и записать в ролик */
    try {
      const c = audio();
      v.node = c.createMediaElementSource(el);
      v.gain = c.createGain();
      v.node.connect(v.gain).connect(master);
    } catch { el.muted = true; }
    pool.set(id, v);
    return v;
  }

  async function image(id) {
    if (images.has(id)) return images.get(id);
    const b = await blobOf(id);
    if (!b) return null;
    const small = shrink(await loadImage(b), IMAGE_MAX);
    images.set(id, small);
    return small;
  }

  /* перерисовать, когда видео докрутилось или файл подгрузился */
  let onChange = () => {};
  function changed() { onChange(); }

  /* ---------- кадр ---------- */
  const FX_BASE = { id: '', color: '', text: '', font: '', style: '', amount: 1, seed: 1, boxes: [], mask: 'all', brush: [], brushSize: 1, live: true };
  const looks = () => Render.LOOKS;
  const lookOf = (id) => (id ? looks().find((l) => l.id === id) : null);
  /* два буфера: на стыке с переходом нужны оба кадра сразу */
  const bufs = [null, null];
  function buf(k, W, H) {
    let b = bufs[k];
    if (!b || b.c.width !== W || b.c.height !== H) {
      const c = Render.canvas(W, H);
      b = { c, x: c.getContext('2d', { willReadFrequently: true }) };
      bufs[k] = b;
    }
    return b;
  }

  function cover(x, src, sw, sh, W, H, zoom = 1) {
    const k = Math.max(W / sw, H / sh) * zoom;
    const dw = sw * k;
    const dh = sh * k;
    x.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  /* source: что показать для клипа; false, если файл ещё не готов */
  function source(clip, local, seek) {
    if (clip.kind === 'image') {
      const img = images.get(clip.media);
      if (!img) { image(clip.media).then((r) => r && changed()).catch(() => {}); return null; }
      return { el: img, w: img.width, h: img.height };
    }
    const v = video(clip.media);
    if (!v || !v.ready) return null;
    if (seek) {
      const want = local / 1000;
      if (Math.abs(v.el.currentTime - want) > 0.04 && !v.el.seeking) v.el.currentTime = want;
    }
    return { el: v.el, w: v.el.videoWidth, h: v.el.videoHeight };
  }

  /* один клип со своим цветом и эффектом в буфер k; null, если кадр ещё не готов */
  function paintClip(k, W, H, clip, local, into, t, seek) {
    const src = source(clip, local, seek);
    if (!src) return null;
    const { c, x } = buf(k, W, H);
    x.fillStyle = '#0a0a0a';
    x.fillRect(0, 0, W, H);
    /* фото чуть наезжает за время показа, чтобы кадр не стоял */
    const into01 = Math.max(0, Math.min(1, into / Math.max(1, Timeline.len(clip))));
    cover(x, src.el, src.w, src.h, W, H, clip.kind === 'image' ? 1 + 0.08 * into01 : 1);
    const look = lookOf(clip.look);
    if (look) Render.applyAdjust(x, W, H, look.adjust);
    if (clip.fx && window.Effects) {
      window.Effects.clock = t / 1000;
      window.Effects.draw(x, { fx: { ...FX_BASE, id: clip.fx, seed: 3 } }, W, H);
      window.Effects.clock = null;
    }
    return c;
  }

  /* ---------- переходы ---------- */
  const TRANSITIONS = [
    { id: '', name: 'Без перехода' },
    { id: 'fade', name: 'Растворение' },
    { id: 'black', name: 'Через чёрное' },
    { id: 'flash', name: 'Вспышка' },
    { id: 'zoom', name: 'Зум' },
    { id: 'slide', name: 'Свайп' },
    { id: 'up', name: 'Шторка вверх' },
  ];
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  function compose(ctx, id, k, A, B, W, H) {
    const e = smooth(k);
    ctx.save();
    if (id === 'fade') {
      ctx.drawImage(A, 0, 0);
      ctx.globalAlpha = e;
      ctx.drawImage(B, 0, 0);
    } else if (id === 'black' || id === 'flash') {
      /* до середины гаснет первый кадр, после середины проявляется второй */
      ctx.drawImage(k < 0.5 ? A : B, 0, 0);
      ctx.globalAlpha = id === 'flash' ? Math.pow(1 - Math.abs(k - 0.5) * 2, 1.5) : 1 - Math.abs(k - 0.5) * 2;
      ctx.fillStyle = id === 'flash' ? '#ffffff' : '#000000';
      ctx.fillRect(0, 0, W, H);
    } else if (id === 'zoom') {
      const grow = (img, s, a) => {
        ctx.globalAlpha = a;
        ctx.drawImage(img, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s);
      };
      grow(A, 1 + e * 0.6, 1);
      grow(B, 1.35 - e * 0.35, e);
    } else if (id === 'slide') {
      ctx.drawImage(A, -e * W, 0);
      ctx.drawImage(B, W - e * W, 0);
    } else if (id === 'up') {
      ctx.drawImage(A, 0, 0);
      ctx.drawImage(B, 0, H - e * H);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(0, H - e * H - 3, W, 3);
    } else ctx.drawImage(k < 0.5 ? A : B, 0, 0);
    ctx.restore();
  }

  /* ---------- текст и стикеры ---------- */
  const ANIMS = [
    { id: '', name: 'Без анимации' },
    { id: 'fade', name: 'Проявление' },
    { id: 'rise', name: 'Всплытие' },
    { id: 'pop', name: 'Прыжок' },
    { id: 'type', name: 'Печать', text: true },
  ];
  const IN_MS = 450;
  const OUT_MS = 300;
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeBack = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
  const stickers = {};
  const assets = { stickers };
  /* своя картинка-стикер лежит в базе, как фото: подгружаем при первом показе */
  function stickerReady(id) {
    if (stickers[id]) return true;
    image(id).then((img) => { if (img) { stickers[id] = img; changed(); } }).catch(() => {});
    return false;
  }
  /* слой в момент t с учётом анимации появления и ухода */
  function overlayLayer(o, t, calm) {
    const l = { ...o.layer };
    const a = t - o.start;
    let op = l.opacity ?? 1;
    /* выбранную надпись на паузе показываем целиком, без анимации: её правят */
    if (calm) return l;
    if (o.anim === 'type' && l.type === 'text' && !l.card) {
      const full = String(l.text || '');
      const dur = Math.max(400, Math.min(2500, full.length * 60));
      l.text = full.slice(0, Math.ceil(full.length * Math.min(1, a / dur)));
    } else if (o.anim) {
      const p = Math.min(1, a / IN_MS);
      const e = easeOut(p);
      if (o.anim === 'fade') op *= e;
      if (o.anim === 'rise') { op *= e; l.y += (1 - e) * 0.05; }
      if (o.anim === 'pop') { op *= Math.min(1, p * 3); l.size *= Math.max(0.05, 0.3 + 0.7 * easeBack(p)); }
    }
    if (o.fadeOut && o.end - t < OUT_MS) op *= Math.max(0, (o.end - t) / OUT_MS);
    l.opacity = op;
    return l;
  }
  const visible = (p, t) => (p.overlays || []).filter((o) => t >= o.start && t < o.end);
  function drawOverlays(ctx, p, t, W, H, calm) {
    visible(p, t).forEach((o) => {
      if (o.layer.img && !stickerReady(o.layer.img)) return;
      Render.drawLayers(ctx, { layers: [overlayLayer(o, t, o.id === calm)] }, assets, W, H);
    });
  }
  /* рамка слоя на кадре: центр, размер и поворот в пикселях холста */
  function overlayBox(ctx, o, W, H) {
    const b = Render.layerBox(ctx, o.layer, assets, W, H);
    return { cx: o.layer.x * W, cy: o.layer.y * H, w: b.w, h: b.h, rot: o.layer.rot || 0 };
  }

  /* opts.seek: на паузе ставим видео точно на кадр; во время игры оно идёт само */
  function drawFrame(ctx, p, t, opts = {}) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);
    const hit = Timeline.at(p, t);
    if (!hit) return true;
    const seek = opts.seek !== false;
    const tr = Timeline.transitionAt(p, hit);
    let ok = true;
    /* один и тот же файл не может стоять на двух местах сразу: такой стык показываем склейкой */
    if (tr && (tr.a.media !== tr.b.media || tr.a.kind === 'image')) {
      const A = paintClip(0, W, H, tr.a, tr.aLocal, tr.aInto, t, seek);
      const B = paintClip(1, W, H, tr.b, tr.bLocal, tr.bInto, t, seek);
      if (A && B) compose(ctx, tr.id, tr.k, A, B, W, H);
      else if (A || B) ctx.drawImage(A || B, 0, 0);
      ok = !!(A && B);
    } else {
      const C = paintClip(0, W, H, hit.clip, hit.local, hit.into, t, seek);
      if (C) ctx.drawImage(C, 0, 0);
      ok = !!C;
    }
    drawOverlays(ctx, p, t, W, H, opts.calm);
    return ok;
  }

  /* LUT из шаблонов цвета грузятся по сети: подтягиваем заранее и перерисовываем */
  function preloadLooks(p) {
    p.clips.forEach((c) => {
      const l = lookOf(c.look);
      if (l && l.adjust.lut) Render.loadLut(l.adjust.lut).then(changed);
    });
  }

  /* ---------- воспроизведение ---------- */
  let project = null;
  let playing = false;
  let t0 = 0;
  let from = 0;
  let music = null;
  let musicFile = { id: '', buf: null };

  async function musicBuffer(p) {
    const m = p.music;
    if (m.fileId) {
      if (musicFile.id === m.fileId && musicFile.buf) return musicFile.buf;
      const b = await blobOf(m.fileId);
      if (!b) return null;
      const data = await b.arrayBuffer();
      const buf = await new Promise((resolve, reject) => {
        const r = audio().decodeAudioData(data, resolve, reject);
        if (r && r.then) r.then(resolve, reject);
      });
      musicFile = { id: m.fileId, buf };
      return buf;
    }
    return m.track && window.Music ? window.Music.buffer(m.track) : null;
  }

  async function startMusic(p, at, total) {
    stopMusic();
    const buf = await musicBuffer(p).catch(() => null);
    if (!buf || !playing) return;
    const c = audio();
    const s = c.createBufferSource();
    s.buffer = buf;
    const own = !!p.music.fileId;
    if (!own) { s.loop = true; s.loopEnd = buf.duration; }
    const g = c.createGain();
    const v = Math.max(0.0001, p.music.vol / 100);
    const now = c.currentTime;
    const left = Math.max(0.1, (total - at) / 1000);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(v, now + 0.05);
    /* в конце ролика музыка затихает за секунду */
    const fadeAt = Math.max(0.06, left - 1);
    g.gain.setValueAtTime(v, now + fadeAt);
    g.gain.linearRampToValueAtTime(0.0001, now + left);
    s.connect(g).connect(master);
    const offset = own ? (p.music.start || 0) + at / 1000 : (at / 1000) % buf.duration;
    if (own && offset >= buf.duration) return;
    s.start(now, offset);
    music = { s, g };
  }
  function stopMusic() {
    if (!music) return;
    try { music.s.stop(); } catch { /* уже остановлена */ }
    music.s.disconnect();
    music = null;
  }

  const now = () => (playing ? from + (audio().currentTime - t0) * 1000 : from);

  function pauseVideos(except) {
    pool.forEach((v, id) => { if (id !== except && !v.el.paused) v.el.pause(); });
  }

  /* каждый кадр: текущее видео играет со своей скоростью, следующее ждёт на первом кадре */
  function steer(p, t) {
    const hit = Timeline.at(p, t);
    if (!hit) return;
    const { i, clip, local, into } = hit;
    if (clip.kind === 'video') {
      const v = video(clip.media);
      if (v) {
        if (v.gain) v.gain.gain.value = clip.vol / 100;
        v.el.playbackRate = clip.speed;
        if (Math.abs(v.el.currentTime * 1000 - local) > DRIFT_MS * clip.speed) v.el.currentTime = local / 1000;
        if (v.el.paused && v.ready) v.el.play().catch(() => {});
      }
      pauseVideos(clip.media);
    } else pauseVideos(null);
    /* следующий клип загружаем заранее, чтобы стык был без чёрного кадра */
    const next = p.clips[i + 1];
    if (next && Timeline.len(clip) - into < PRELOAD_MS) {
      if (next.kind === 'video' && next.media !== clip.media) {
        const v = video(next.media);
        if (v && v.ready && v.el.paused && Math.abs(v.el.currentTime * 1000 - next.in) > 60) v.el.currentTime = next.in / 1000;
      } else if (next.kind === 'image') image(next.media).catch(() => {});
    }
  }

  function play(p, at) {
    project = p;
    const total = Timeline.duration(p);
    if (!total) return false;
    audio();
    from = at >= total - 50 ? 0 : at;
    t0 = ac.currentTime;
    playing = true;
    steer(p, from);
    startMusic(p, from, total);
    return true;
  }
  function pause() {
    if (!playing) return from;
    from = now();
    playing = false;
    stopMusic();
    pauseVideos(null);
    return from;
  }
  function seek(t) {
    from = t;
    if (playing) { const p = project; playing = false; stopMusic(); play(p, t); }
  }

  /* ---------- запись ролика ---------- */
  /* В реальном времени, как в остальном приложении: ролик играет с начала, кадры пишутся с холста.
     Динамики на время записи выключаем, звук идёт только в файл. */
  function recordMime(withSound) {
    const list = withSound
      ? ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/mp4;codecs=avc1.42E01F', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }
  const canRecord = () => !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream && recordMime(false));

  async function record(p, size, onProgress, signal) {
    const [RW, RH] = Render.RATIOS[p.ratio];
    const W = size;
    const H = Math.round((W * RH) / RW / 2) * 2;
    const c = Render.canvas(W, H);
    const x = c.getContext('2d');
    const total = Timeline.duration(p);
    /* все нужные файлы и таблицы цвета заранее, чтобы запись не ждала сети */
    await Promise.all(p.clips.map((cl) => blobOf(cl.media)));
    await Promise.all(p.clips.filter((cl) => cl.kind === 'image').map((cl) => image(cl.media)));
    await Promise.all(p.clips.map((cl) => lookOf(cl.look)).filter((l) => l && l.adjust.lut).map((l) => Render.loadLut(l.adjust.lut)));
    await musicBuffer(p).catch(() => null);
    await Promise.all((p.overlays || []).filter((o) => o.layer.img).map((o) => image(o.layer.img).then((img) => { if (img) stickers[o.layer.img] = img; })));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    /* первый клип ставим на начало и ждём картинку */
    const first = p.clips[0];
    if (first.kind === 'video') {
      const v = video(first.media);
      if (v && !v.ready) await once(v.el, 'loadeddata').catch(() => {});
      if (v) { v.el.currentTime = first.in / 1000; await once(v.el, 'seeked', 3000).catch(() => {}); }
    }

    const c0 = audio();
    const dest = c0.createMediaStreamDestination ? c0.createMediaStreamDestination() : null;
    const picture = c.captureStream(30);
    const withSound = !!dest && !!recordMime(true);
    const tracks = withSound ? [...picture.getVideoTracks(), ...dest.stream.getAudioTracks()] : picture.getVideoTracks();
    const mimeType = recordMime(withSound);
    const rec = new MediaRecorder(new MediaStream(tracks), { mimeType, videoBitsPerSecond: 8000000, audioBitsPerSecond: 160000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const finished = new Promise((r) => { rec.onstop = r; });
    if (withSound) master.connect(dest);
    muteSpeakers(true);

    drawFrame(x, p, 0, { seek: false });
    const started = new Promise((r) => { rec.onstart = r; });
    rec.start(1000);
    /* кодировщик звука просыпается не сразу: если пустить ролик раньше, картинка в файле отстанет от звука почти на секунду */
    await started;
    play(p, 0);
    let stopped = false;
    try {
      await new Promise((resolve) => {
        const tick = () => {
          if (signal && signal.aborted) { stopped = true; return resolve(); }
          const t = now();
          if (t >= total) return resolve();
          steer(p, t);
          drawFrame(x, p, t, { seek: false });
          onProgress(t / total);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    } finally {
      pause();
      rec.stop();
      await finished;
      if (withSound) master.disconnect(dest);
      muteSpeakers(false);
    }
    if (stopped) return null;
    return new Blob(chunks, { type: rec.mimeType || mimeType });
  }

  return {
    importFile, forget, blobOf, drawFrame, preloadLooks, steer, play, pause, seek, record, canRecord,
    audio, looks, lookOf, TRANSITIONS, ANIMS, visible, overlayBox, assets,
    get time() { return now(); },
    get playing() { return playing; },
    set onChange(fn) { onChange = fn; },
    resetMusic() { musicFile = { id: '', buf: null }; },
    release() { [...pool.keys()].forEach(drop); },
  };
})();
