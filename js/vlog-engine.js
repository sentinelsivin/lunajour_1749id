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
  /* Звук клипов идёт через общую шину clips: по ней слушаем, есть ли в клипе голос.
     Музыка идёт через duck: эта ступень приглушает музыку, пока звучит клип. */
  let ac = null;
  let master = null;
  let clips = null;
  let meter = null;
  let duckNode = null;
  let speakers = true;
  function audio() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.connect(ac.destination);
      clips = ac.createGain();
      clips.connect(master);
      meter = ac.createAnalyser();
      meter.fftSize = 1024;
      clips.connect(meter);
      duckNode = ac.createGain();
      duckNode.connect(master);
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
    /* файл не лёг в базу (чаще всего кончилось место): в этот раз клип работает, но после перезагрузки его не будет */
    if (!(await Store.set(blobKey(id), file))) m.unsaved = true;
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
      v.node.connect(v.gain).connect(clips);
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

  /* ---------- кадр клипа: как вписан, сдвиг, масштаб и движение фото ---------- */
  /* c.fit: '' заполнить кадр (края обрезаются), 'blur' целиком на размытом фоне, 'black' целиком на чёрном.
     c.zoom от 1 до 4. c.x, c.y от -1 до 1: доля возможного сдвига, поэтому в «заполнить» пустых краёв не бывает.
     c.move у фото: 'in' (по умолчанию, лёгкий наезд), 'out', 'left', 'right', 'up', 'down', 'none'. */
  const FITS = [
    { id: '', name: 'Заполнить' },
    { id: 'blur', name: 'Целиком, размытый фон' },
    { id: 'black', name: 'Целиком, чёрный фон' },
  ];
  const MOVES = [
    { id: 'none', name: 'Без движения' },
    { id: 'in', name: 'Приближение' },
    { id: 'out', name: 'Отдаление' },
    { id: 'left', name: 'Влево' },
    { id: 'right', name: 'Вправо' },
    { id: 'up', name: 'Вверх' },
    { id: 'down', name: 'Вниз' },
  ];
  const ZOOM_MAX = 4;
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));
  const moveOf = (clip) => (clip.kind === 'image' ? clip.move || 'in' : 'none');

  /* где рисовать источник sw×sh в кадре W×H; into01 — доля показа клипа, для движения фото */
  function framing(clip, sw, sh, W, H, into01 = 0) {
    const fit = clip.fit === 'blur' || clip.fit === 'black';
    let zoom = Math.max(1, Math.min(ZOOM_MAX, clip.zoom || 1));
    let fx = clip.x || 0;
    let fy = clip.y || 0;
    const mv = moveOf(clip);
    const e = Math.max(0, Math.min(1, into01));
    if (mv === 'in') zoom *= 1 + 0.08 * e;
    else if (mv === 'out') zoom *= 1.08 - 0.08 * e;
    else if (mv !== 'none') {
      /* проезд: кадр чуть крупнее, чтобы было куда ехать, и едет от края до края */
      zoom *= 1.12;
      const d = (e - 0.5) * 1.8;
      if (mv === 'left') fx -= d;
      if (mv === 'right') fx += d;
      if (mv === 'up') fy -= d;
      if (mv === 'down') fy += d;
    }
    const k = (fit ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh)) * zoom;
    const dw = sw * k;
    const dh = sh * k;
    const mx = Math.max(0, (dw - W) / 2);
    const my = Math.max(0, (dh - H) / 2);
    return { dx: (W - dw) / 2 + clamp1(fx) * mx, dy: (H - dh) / 2 + clamp1(fy) * my, dw, dh, mx, my, fit };
  }

  /* размытый фон: кадр сжимается до крошечного и растягивается обратно, так размытие дешёвое и на телефоне */
  const tiny = { c: null, mid: null };
  function blurBg(x, src, sw, sh, W, H) {
    const k = 36 / Math.max(sw, sh);
    const tw = Math.max(1, Math.round(sw * k));
    const th = Math.max(1, Math.round(sh * k));
    if (!tiny.c || tiny.c.width !== tw || tiny.c.height !== th) tiny.c = Render.canvas(tw, th);
    tiny.c.getContext('2d').drawImage(src, 0, 0, tw, th);
    const mw = Math.max(1, Math.round(W / 4));
    const mh = Math.max(1, Math.round(H / 4));
    if (!tiny.mid || tiny.mid.width !== mw || tiny.mid.height !== mh) tiny.mid = Render.canvas(mw, mh);
    const m = tiny.mid.getContext('2d');
    m.save();
    if ('filter' in m) m.filter = `blur(${Math.max(2, Math.round(mw / 60))}px)`;
    /* чуть крупнее кадра: у размытия по краям светлая кайма */
    const s = Math.max(mw / tw, mh / th) * 1.15;
    m.drawImage(tiny.c, (mw - tw * s) / 2, (mh - th * s) / 2, tw * s, th * s);
    m.restore();
    x.save();
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(tiny.mid, 0, 0, W, H);
    x.fillStyle = 'rgba(0,0,0,.2)';
    x.fillRect(0, 0, W, H);
    x.restore();
  }

  function place(x, src, sw, sh, W, H, clip, into01) {
    const f = framing(clip, sw, sh, W, H, into01);
    if (clip.fit === 'blur') blurBg(x, src, sw, sh, W, H);
    x.drawImage(src, f.dx, f.dy, f.dw, f.dh);
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
    /* фото движется за время показа (по умолчанию чуть наезжает), чтобы кадр не стоял */
    const into01 = Math.max(0, Math.min(1, into / Math.max(1, Timeline.len(clip))));
    place(x, src.el, src.w, src.h, W, H, clip, into01);
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

  let musicRun = 0;
  async function startMusic(p, at, total) {
    stopMusic();
    /* если за время ожидания ролик перемотали, этот запуск устарел: иначе зазвучали бы две музыки сразу */
    const run = ++musicRun;
    const buf = await musicBuffer(p).catch(() => null);
    if (!buf || !playing || run !== musicRun) return;
    /* мелодия собирается не мгновенно: пока ждали, ролик ушёл вперёд. Считаем от того места, где он сейчас,
       иначе затухание съезжает за конец и музыка обрывается */
    at = Math.max(at, from + (ac.currentTime - t0) * 1000);
    if (at >= total - 50) return;
    const c = audio();
    const s = c.createBufferSource();
    s.buffer = buf;
    const own = !!p.music.fileId;
    if (!own) { s.loop = true; s.loopEnd = buf.duration; }
    const g = c.createGain();
    const v = Math.max(0.0001, p.music.vol / 100);
    const now = c.currentTime;
    const pos = at / 1000;
    const left = Math.max(0.1, (total - at) / 1000);
    /* плавное начало от начала ролика и затухание к его концу (по умолчанию за секунду);
       если включили посередине, громкость сразу такая, какой была бы в этот момент */
    const fi = Math.max(0, Number(p.music.fadeIn) || 0);
    const fo = Math.max(0, Number(p.music.fadeOut ?? 1));
    const level = (x) => (fi > 0 ? v * Math.min(1, x / fi) : v);
    const outAt = Math.max(0.06, left - fo);
    const inEnd = Math.min(outAt, Math.max(0.05, fi - pos));
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, level(pos + 0.05)), now + 0.05);
    if (fi > pos + 0.05) g.gain.linearRampToValueAtTime(Math.max(0.0001, level(pos + inEnd)), now + inEnd);
    g.gain.setValueAtTime(Math.max(0.0001, level(pos + outAt)), now + outAt);
    g.gain.linearRampToValueAtTime(0.0001, now + left);
    s.connect(g).connect(duckNode);
    const offset = own ? (p.music.start || 0) + at / 1000 : (at / 1000) % buf.duration;
    if (own && offset >= buf.duration) return;
    s.start(now, offset);
    music = { s, g };
  }
  function stopMusic() {
    unduck();
    if (!music) return;
    try { music.s.stop(); } catch { /* уже остановлена */ }
    music.s.disconnect();
    music = null;
  }

  const now = () => (playing ? from + (audio().currentTime - t0) * 1000 : from);

  function pauseVideos(except) {
    pool.forEach((v, id) => { if (id !== except && !v.el.paused) v.el.pause(); });
  }

  /* ---------- звук на стыках ---------- */
  /* Клип не обрывается на склейке, а за пару кадров затихает и так же проявляется: без щелчков.
     На стыке с переходом звук уходит и приходит за половину перехода, вместе с картинкой. */
  const EDGE_MS = 60;
  function edgeLevel(p, i, into, l) {
    const fin = i > 0 ? Math.max(EDGE_MS, Timeline.trDur(p, i - 1) / 2) : EDGE_MS;
    const fout = i < p.clips.length - 1 ? Math.max(EDGE_MS, Timeline.trDur(p, i) / 2) : EDGE_MS;
    return Math.max(0, Math.min(1, into / fin, (l - into) / fout));
  }
  function setClipGain(v, value) {
    if (!v.gain || Math.abs((v.level ?? -1) - value) < 0.005) return;
    v.level = value;
    v.gain.gain.setTargetAtTime(value, ac.currentTime, 0.012);
  }

  /* ---------- музыка тише, пока в клипе звучит голос ---------- */
  /* Слушаем шину клипов: громче порога — музыка быстро уходит вниз, тишина дольше HOLD — медленно возвращается. */
  const DUCK_TO = 0.3;
  const DUCK_RMS = 0.02;
  const DUCK_HOLD = 0.35;
  let meterBuf = null;
  let lastVoice = -1;
  let duckTarget = 1;
  function duck(p) {
    if (!meter || !duckNode) return;
    if (!meterBuf) meterBuf = new Float32Array(meter.fftSize);
    meter.getFloatTimeDomainData(meterBuf);
    let sum = 0;
    for (let k = 0; k < meterBuf.length; k++) sum += meterBuf[k] * meterBuf[k];
    if (Math.sqrt(sum / meterBuf.length) > DUCK_RMS) lastVoice = ac.currentTime;
    const on = p.music.duck !== false && !!music && lastVoice >= 0 && ac.currentTime - lastVoice < DUCK_HOLD;
    const target = on ? DUCK_TO : 1;
    if (target === duckTarget) return;
    duckTarget = target;
    duckNode.gain.setTargetAtTime(target, ac.currentTime, on ? 0.06 : 0.3);
  }
  function unduck() {
    lastVoice = -1;
    duckTarget = 1;
    if (!duckNode) return;
    duckNode.gain.cancelScheduledValues(ac.currentTime);
    duckNode.gain.setValueAtTime(1, ac.currentTime);
  }

  /* каждый кадр: текущее видео играет со своей скоростью, следующее ждёт на первом кадре */
  function steer(p, t) {
    const hit = Timeline.at(p, t);
    if (!hit) return;
    const { i, clip, local, into } = hit;
    duck(p);
    if (clip.kind === 'video') {
      const v = video(clip.media);
      if (v) {
        setClipGain(v, (clip.vol / 100) * edgeLevel(p, i, into, Timeline.len(clip)));
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
    audio, looks, lookOf, TRANSITIONS, ANIMS, FITS, MOVES, ZOOM_MAX, framing, visible, overlayBox, assets,
    get time() { return now(); },
    get playing() { return playing; },
    set onChange(fn) { onChange = fn; },
    resetMusic() { musicFile = { id: '', buf: null }; },
    release() { [...pool.keys()].forEach(drop); },
  };
})();
