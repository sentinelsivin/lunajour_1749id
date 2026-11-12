/* Экспорт: PNG карточки и видео. */
(function () {
  const { RATIOS, canvas, renderCard } = window.Render;
  const CLIP_MS = 5000;

  function fullCard(s, slots, assets, width) {
    const [W, H] = RATIOS[s.ratio];
    const k = width ? width / W : 1;
    const c = canvas(W * k, H * k);
    renderCard(c.getContext('2d'), s, slots, assets);
    return c;
  }

  function toBlob(c) {
    return new Promise((r) => c.toBlob(r, 'image/png'));
  }

  function cardBlob(s, slots, assets) {
    return toBlob(fullCard(s, slots, assets));
  }

  /* Видео: сама карточка во весь кадр, в её пропорциях, без фона и покачивания.
     Клип внутри карточки продолжает играть, сканер оживает. Стороны чётные: так видео принимают все кодеки. */
  /* opts.seq: серия, список наборов фото; каждая карточка держится opts.per мс, по кругу (как гифка). */
  async function videoBlob(s, slots, assets, onProgress, opts = {}) {
    const [RW, RH] = RATIOS[s.ratio];
    const W = 720;
    const H = Math.round((W * RH) / RW / 2) * 2;
    const seq = opts.seq && opts.seq.length > 1 ? opts.seq : null;
    const per = opts.per || 600;
    const moving = !seq && slots.some((slot) => slot.src && slot.src.kind === 'video');
    const c = canvas(W, H);
    const x = c.getContext('2d');
    const still = canvas(W, H);
    /* кадры серии собираются заранее, чтобы смена шла ровно */
    const stills = seq ? seq.map((items) => {
      const one = canvas(W, H);
      renderCard(one.getContext('2d'), s, items, assets);
      return one;
    }) : null;
    if (seq) {
      slots = seq[0];
      still.getContext('2d').drawImage(stills[0], 0, 0);
    } else renderCard(still.getContext('2d'), s, slots, assets);

    /* Длина ролика: целиком самое длинное загруженное видео, но не меньше пяти секунд.
       У клипа, снятого в браузере, длина бывает неизвестна (Infinity), такой не считаем. */
    const longest = Math.max(0, ...slots
      .filter((slot) => slot.src && slot.src.kind === 'video')
      .map((slot) => slot.src.el.duration * 1000)
      .filter(Number.isFinite));
    /* серия: минимум два круга и не меньше трёх секунд */
    const total = opts.total || (seq ? Math.max(3000, seq.length * per * 2) : Math.max(CLIP_MS, longest));
    const sparkles = Number(s.adjust && s.adjust.spA) > 0;

    if (moving) {
      for (const slot of slots) {
        if (slot.src && slot.src.kind === 'video') {
          slot.src.el.currentTime = 0;
          await slot.src.el.play().catch(() => {});
        }
      }
    }

    if (!window.Camera.videoMime() || !c.captureStream) throw new Error('unsupported');
    const picture = c.captureStream(30);
    /* музыка: отдельная дорожка, склеенная с картинкой; если браузер не умеет, ролик выйдет без звука */
    let sound = null;
    if (opts.audio && window.Music && window.Music.mime()) {
      try { sound = await window.Music.track(opts.audio.id, opts.audio.start, opts.audio.vol, total / 1000); } catch { sound = null; }
    }
    let rec;
    try {
      if (!sound) throw new Error('silent');
      const both = new MediaStream([...picture.getVideoTracks(), ...sound.stream.getAudioTracks()]);
      rec = new MediaRecorder(both, { mimeType: window.Music.mime(), videoBitsPerSecond: 6000000, audioBitsPerSecond: 160000 });
    } catch {
      if (sound) { sound.end(); sound = null; }
      rec = new MediaRecorder(picture, { mimeType: window.Camera.videoMime(), videoBitsPerSecond: 6000000 });
    }
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const finished = new Promise((r) => { rec.onstop = r; });

    function frame(t) {
      /* сканер в видео оживает: каждый кадр рисуется заново со своим временем */
      const live = (window.Scanner && window.Scanner.animates(s)) || (window.Effects && window.Effects.animates(s));
      const k = seq ? Math.floor(t / per) % seq.length : 0;
      if (moving || live || sparkles) {
        if (window.Scanner) {
          if (live) window.Scanner.time = t / 1000;
          window.Scanner.clock = t / 1000;
        }
        if (window.Effects) window.Effects.clock = t / 1000;
        window.Render.setClock(sparkles ? t / 1000 : null);
        renderCard(still.getContext('2d'), s, seq ? seq[k] : slots, assets);
        window.Render.setClock(null);
        if (window.Scanner) { window.Scanner.time = null; window.Scanner.clock = null; }
        if (window.Effects) window.Effects.clock = null;
      } else if (seq) {
        still.getContext('2d').drawImage(stills[k], 0, 0);
      }
      /* рисуем кадр каждый раз, даже неподвижный: иначе запись может пропустить кадры */
      x.drawImage(still, 0, 0);
    }

    frame(0);
    rec.start();
    if (sound) sound.begin();
    const started = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const t = performance.now() - started;
        if (t >= total) return resolve();
        frame(t);
        onProgress(t / total);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    rec.stop();
    await finished;
    if (sound) sound.end();
    return new Blob(chunks, { type: rec.mimeType });
  }

  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function extension(blob) {
    return blob.type.includes('mp4') ? 'mp4' : blob.type.includes('webm') ? 'webm' : 'png';
  }

  window.Export = { cardBlob, videoBlob, save, extension };
})();
