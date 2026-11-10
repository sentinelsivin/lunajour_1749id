/* Экспорт: PNG карточки, кадр для сторис и пятисекундное видео. */
(function () {
  const { RATIOS, canvas, renderCard, drawCover } = window.Render;
  const STORY = [1080, 1920];
  const CLIP_MS = 5000;

  function fullCard(s, slots, assets, width) {
    const [W, H] = RATIOS[s.ratio];
    const k = width ? width / W : 1;
    const c = canvas(W * k, H * k);
    renderCard(c.getContext('2d'), s, slots, assets);
    return c;
  }

  /* Размытый фон без ctx.filter: сжимаем снимок почти в точку и растягиваем обратно. */
  function backdrop(card, W, H) {
    const tiny = canvas(18, 32);
    drawCover(tiny.getContext('2d'), card, card.width, card.height, 18, 32);
    const c = canvas(W, H);
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(tiny, 0, 0, W, H);
    x.fillStyle = 'rgba(0,0,0,.28)';
    x.fillRect(0, 0, W, H);
    return c;
  }

  function placeCard(ctx, card, W, H, motion) {
    const k = Math.min((W * 0.84) / card.width, (H * 0.8) / card.height);
    const w = card.width * k;
    const h = card.height * k;
    const m = motion || { squeeze: 1, tilt: 0, lift: 0 };
    ctx.save();
    ctx.translate(W / 2, H / 2 + m.lift * H);
    ctx.rotate(m.tilt);
    ctx.scale(m.squeeze, 1);
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = W * 0.05;
    ctx.shadowOffsetY = W * 0.025;
    ctx.drawImage(card, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function toBlob(c) {
    return new Promise((r) => c.toBlob(r, 'image/png'));
  }

  function cardBlob(s, slots, assets) {
    return toBlob(fullCard(s, slots, assets));
  }

  function storyBlob(s, slots, assets) {
    const card = fullCard(s, slots, assets);
    if (s.ratio === '9:16') return toBlob(card);
    const c = canvas(...STORY);
    const x = c.getContext('2d');
    x.drawImage(backdrop(card, ...STORY), 0, 0);
    placeCard(x, card, ...STORY);
    return toBlob(c);
  }

  /* Видео: карточка покачивается на размытом фоне. Клип внутри карточки продолжает играть. */
  async function videoBlob(s, slots, assets, onProgress) {
    const W = 720;
    const H = 1280;
    const moving = slots.some((slot) => slot.src && slot.src.kind === 'video');
    const c = canvas(W, H);
    const x = c.getContext('2d');
    const still = fullCard(s, slots, assets, 640);
    const back = backdrop(still, W, H);

    /* Длина ролика: целиком самое длинное загруженное видео, но не меньше одного покачивания.
       У клипа, снятого в браузере, длина бывает неизвестна (Infinity), такой не считаем. */
    const longest = Math.max(0, ...slots
      .filter((slot) => slot.src && slot.src.kind === 'video')
      .map((slot) => slot.src.el.duration * 1000)
      .filter(Number.isFinite));
    const total = Math.max(CLIP_MS, longest);

    if (moving) {
      for (const slot of slots) {
        if (slot.src && slot.src.kind === 'video') {
          slot.src.el.currentTime = 0;
          await slot.src.el.play().catch(() => {});
        }
      }
    }

    const mimeType = window.Camera.videoMime();
    if (!mimeType || !c.captureStream) throw new Error('unsupported');
    const rec = new MediaRecorder(c.captureStream(30), { mimeType, videoBitsPerSecond: 6000000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const finished = new Promise((r) => { rec.onstop = r; });

    function frame(t) {
      const a = (t / CLIP_MS) * Math.PI * 2;
      x.drawImage(back, 0, 0);
      /* сканер в видео оживает: каждый кадр рисуется заново со своим временем */
      const live = window.Scanner && window.Scanner.animates(s);
      if (moving || live) {
        if (live) window.Scanner.time = t / 1000;
        renderCard(still.getContext('2d'), s, slots, assets);
        if (live) window.Scanner.time = null;
      }
      placeCard(x, still, W, H, {
        squeeze: Math.cos(Math.sin(a) * 0.42),
        tilt: Math.sin(a * 2) * 0.022,
        lift: Math.sin(a) * 0.012,
      });
    }

    frame(0);
    rec.start();
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

  window.Export = { cardBlob, storyBlob, videoBlob, save, extension };
})();
