/* Старые видео с фотоаппаратов (Nikon, Canon, Olympus и другие, примерно 2000–2012 годов):
   MOV или AVI, где каждый кадр — обычная JPEG-картинка (Motion JPEG). Браузеры такое видео не играют,
   а JPEG открывают. Поэтому файл разбирается здесь: находим кадры, а показывает их холст,
   который ведёт себя как <video> (currentTime, duration, play, pause, videoWidth), и карточка его рисует.
   Звук в таких файлах не берём: в ролик идёт музыка из «Движения». */
(function () {
  const JPEG_CODECS = ['jpeg', 'mjpa', 'AVDJ', 'dmb1', 'MJPG', 'mjpg'];

  const read = async (blob, from, len) => new DataView(await blob.slice(from, from + len).arrayBuffer());
  const tag = (dv, at) => String.fromCharCode(dv.getUint8(at), dv.getUint8(at + 1), dv.getUint8(at + 2), dv.getUint8(at + 3));

  /* ---------- MOV и MP4: атомы верхнего уровня читаем по заголовкам, целиком грузим только moov ---------- */
  async function parseMov(blob) {
    let off = 0;
    let moov = null;
    while (off + 8 <= blob.size) {
      const h = await read(blob, off, 16);
      let size = h.getUint32(0);
      const type = tag(h, 4);
      if (size === 1) size = Number(h.getBigUint64(8));
      if (size === 0) size = blob.size - off;
      if (size < 8) return null;
      if (type === 'moov') {
        moov = new DataView(await blob.slice(off, off + size).arrayBuffer());
        break;
      }
      off += size;
    }
    if (!moov) return null;

    const boxes = (dv, start, end) => {
      const out = [];
      let p = start;
      while (p + 8 <= end) {
        let size = dv.getUint32(p);
        if (size === 1) size = Number(dv.getBigUint64(p + 8));
        if (size === 0) size = end - p;
        if (size < 8) break;
        out.push({ type: tag(dv, p + 4), at: p, end: p + size });
        p += size;
      }
      return out;
    };
    const find = (dv, start, end, path) => {
      let list = boxes(dv, start, end);
      let box = null;
      for (const name of path) {
        box = list.find((b) => b.type === name);
        if (!box) return null;
        list = boxes(dv, box.at + 8, box.end);
      }
      return box;
    };

    for (const trak of boxes(moov, 8, moov.byteLength).filter((b) => b.type === 'trak')) {
      const stbl = find(moov, trak.at + 8, trak.end, ['mdia', 'minf', 'stbl']);
      const mdhd = find(moov, trak.at + 8, trak.end, ['mdia', 'mdhd']);
      if (!stbl || !mdhd) continue;
      const sub = (name) => boxes(moov, stbl.at + 8, stbl.end).find((b) => b.type === name);
      const stsd = sub('stsd');
      if (!stsd || !JPEG_CODECS.includes(tag(moov, stsd.at + 20))) continue;
      const w = moov.getUint16(stsd.at + 16 + 32);
      const h = moov.getUint16(stsd.at + 16 + 34);
      const v1 = moov.getUint8(mdhd.at + 8) === 1;
      const scale = moov.getUint32(mdhd.at + (v1 ? 28 : 20));

      /* размеры кадров */
      const stsz = sub('stsz');
      const fixed = moov.getUint32(stsz.at + 12);
      const count = moov.getUint32(stsz.at + 16);
      const sizes = Array.from({ length: count }, (_, i) => (fixed || moov.getUint32(stsz.at + 20 + i * 4)));
      /* где лежат куски */
      const co = sub('stco') || sub('co64');
      const big = co.type === 'co64';
      const nChunks = moov.getUint32(co.at + 12);
      const chunks = Array.from({ length: nChunks }, (_, i) => (big ? Number(moov.getBigUint64(co.at + 16 + i * 8)) : moov.getUint32(co.at + 16 + i * 4)));
      /* сколько кадров в каждом куске */
      const stsc = sub('stsc');
      const runs = Array.from({ length: moov.getUint32(stsc.at + 12) }, (_, i) => ({ first: moov.getUint32(stsc.at + 16 + i * 12) - 1, per: moov.getUint32(stsc.at + 20 + i * 12) }));
      const offs = [];
      for (let c = 0, r = 0, s = 0; c < nChunks && s < count; c++) {
        while (r + 1 < runs.length && runs[r + 1].first <= c) r++;
        let p = chunks[c];
        for (let k = 0; k < runs[r].per && s < count; k++, s++) {
          offs.push(p);
          p += sizes[s];
        }
      }
      /* время каждого кадра */
      const stts = sub('stts');
      const times = [];
      let t = 0;
      for (let i = 0, n = moov.getUint32(stts.at + 12); i < n; i++) {
        const cnt = moov.getUint32(stts.at + 16 + i * 8);
        const dur = moov.getUint32(stts.at + 20 + i * 8);
        for (let k = 0; k < cnt; k++) { times.push(t / scale); t += dur; }
      }
      const frames = offs.map((o, i) => ({ off: o, size: sizes[i], t: times[i] ?? i / 15 }));
      return { w, h, frames, duration: t / scale || frames.length / 15 };
    }
    return null;
  }

  /* ---------- AVI: кадры — куски «00dc» в списке movi ---------- */
  async function parseAvi(blob) {
    const head = await read(blob, 0, 12);
    if (tag(head, 0) !== 'RIFF' || tag(head, 8) !== 'AVI ') return null;
    let off = 12;
    let usPerFrame = 66666;
    let w = 0, h = 0, codec = '';
    const frames = [];
    while (off + 8 <= blob.size) {
      const c = await read(blob, off, 12);
      const id = tag(c, 0);
      const size = c.getUint32(4, true);
      if (id === 'LIST' && tag(c, 8) === 'hdrl') {
        const dv = await read(blob, off, Math.min(size + 8, 64 * 1024));
        for (let p = 12; p + 8 < dv.byteLength; p++) {
          if (tag(dv, p) === 'avih') { usPerFrame = dv.getUint32(p + 8, true) || usPerFrame; w = dv.getUint32(p + 40, true); h = dv.getUint32(p + 44, true); }
          if (tag(dv, p) === 'strh' && tag(dv, p + 8) === 'vids') codec = tag(dv, p + 12);
        }
      } else if (id === 'LIST' && tag(c, 8) === 'movi') {
        let p = off + 12;
        const end = off + 8 + size;
        while (p + 8 <= end) {
          const k = await read(blob, p, 8);
          const kid = tag(k, 0);
          const ks = k.getUint32(4, true);
          if (kid === 'LIST') { p += 12; continue; }
          if (/^\d\d(dc|db)$/.test(kid) && ks) frames.push({ off: p + 8, size: ks, t: frames.length * usPerFrame / 1e6 });
          p += 8 + ks + (ks & 1);
        }
      }
      off += 8 + size + (size & 1);
    }
    if (!frames.length || (codec && !JPEG_CODECS.includes(codec))) return null;
    return { w, h, frames, duration: frames.length * usPerFrame / 1e6 };
  }

  /* ---------- холст, который ведёт себя как видео ---------- */
  function player(blob, info) {
    const el = document.createElement('canvas');
    el.width = info.w;
    el.height = info.h;
    const x = el.getContext('2d');
    const { frames } = info;
    const cache = new Map();
    const pending = new Map();
    let shown = -1;
    let base = 0;
    let startedAt = 0;
    let playing = false;
    let raf = 0;

    const decode = (i) => {
      if (cache.has(i)) return Promise.resolve(cache.get(i));
      if (!pending.has(i)) {
        const f = frames[i];
        pending.set(i, createImageBitmap(blob.slice(f.off, f.off + f.size, 'image/jpeg')).then((bmp) => {
          cache.set(i, bmp);
          pending.delete(i);
          /* держим в памяти ограниченное число кадров, лишние отпускаем */
          if (cache.size > 90) {
            const old = cache.keys().next().value;
            cache.get(old).close();
            cache.delete(old);
          }
          return bmp;
        }).catch(() => { pending.delete(i); return null; }));
      }
      return pending.get(i);
    };
    const indexAt = (t) => {
      let lo = 0, hi = frames.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (frames[mid].t <= t) lo = mid; else hi = mid - 1;
      }
      return lo;
    };
    const now = () => {
      const t = playing ? base + (performance.now() - startedAt) / 1000 : base;
      return el.loop ? t % info.duration : Math.min(t, info.duration);
    };
    const paint = (i) => {
      const bmp = cache.get(i);
      if (!bmp) return false;
      x.drawImage(bmp, 0, 0, el.width, el.height);
      shown = i;
      return true;
    };
    const tick = () => {
      const i = indexAt(now());
      if (i !== shown && !paint(i)) decode(i).then(() => { if (indexAt(now()) === i) paint(i); });
      /* следующие кадры готовим заранее */
      for (let k = 1; k <= 4; k++) decode((i + k) % frames.length);
      if (playing) raf = requestAnimationFrame(tick);
    };

    Object.defineProperties(el, {
      videoWidth: { get: () => info.w },
      videoHeight: { get: () => info.h },
      duration: { get: () => info.duration },
      paused: { get: () => !playing },
      currentTime: {
        get: now,
        set: (t) => {
          base = Math.max(0, Number(t) || 0);
          startedAt = performance.now();
          shown = -1;
          tick();
        },
      },
    });
    el.loop = true;
    el.muted = true;
    el.play = () => {
      if (!playing) {
        base = now();
        startedAt = performance.now();
        playing = true;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
      }
      return Promise.resolve();
    };
    el.pause = () => {
      if (!playing) return;
      base = now();
      playing = false;
      cancelAnimationFrame(raf);
    };
    /* первый кадр нужен сразу: по нему считается размер и рисуется превью */
    el.ready = decode(0).then((bmp) => {
      if (!bmp) throw new Error('no picture');
      paint(0);
      return el;
    });
    return el;
  }

  /* null — это не Motion JPEG, пусть файл открывает сам браузер */
  async function open(blob) {
    let info = null;
    try {
      const head = await read(blob, 0, 12);
      info = tag(head, 0) === 'RIFF' ? await parseAvi(blob) : await parseMov(blob);
    } catch {
      return null;
    }
    if (!info || !info.frames.length) return null;
    const el = player(blob, info);
    await el.ready;
    if (!info.w || !info.h) return null;
    el.play();
    return el;
  }

  window.Mjpeg = { open };
})();
