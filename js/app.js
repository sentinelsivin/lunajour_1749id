/* Экран приложения: связывает настройки, камеру, отрисовку и экспорт. */
(function () {
  const { CATEGORIES, MOTIFS, SYMBOLS, DEMO_PIECES, WORD_FONTS, makeRng, byId } = window.Motifs;
  const Render = window.Render;
  const { RATIOS, PAPERS, FONTS, renderCard, sampleScene, layout, slotFrame, canvas, clearMasks, paintPaper, drawCover, luminance } = window.Render;
  const { Camera, Export, Store, Templates, I18n, Collages, Scanner } = window;
  const { t } = I18n;

  const $ = (id) => document.getElementById(id);
  const SAMPLE_TITLE = 'A quiet night';
  const CLIP_MS = 5000;
  const PAPER_COLORS = ['#f0ede5', '#ffffff', '#efe2cb', '#b8c5d6', '#6c9fe0', '#a78bfa', '#f5a3c7', '#ffe27a', '#3171c6', '#3a1a5e', '#0d1a2e', '#0a0a0a'];
  const TEXT_COLORS = ['#0a0a0a', '#f0ede5', '#3171c6', '#a78bfa', '#d7263d'];
  const TINT_COLORS = ['#c0392b', '#f5a3c7', '#f4c6cf', '#e8913a', '#ffe27a', '#86c96b', '#7b8040', '#a9c1e6', '#6c9fe0', '#3171c6', '#a78bfa', '#fbfaf6', '#0a0a0a'];
  const MOODS =['warm', 'calm', 'funny', 'miss you', 'yay', 'sleepy'];

  const today = () => new Date().toLocaleDateString('sv-SE');
  const defaults = () => ({
    motif: 'star-flock', seed: 7, size: 1, density: 1, ghost: 0, scatter: false, effect: 'none', word: '', wordFont: WORD_FONTS[0].id,
    pieces: [],
    paper: 'crumple', paperColor: PAPER_COLORS[0], paperPos: 'bottom', ratio: '4:5', collage: '', tints: {}, marks: {}, layers: [],
    fx: { id: '', color: '', text: '', font: '', style: '', amount: 1, seed: 1, boxes: [] },
    fx2: { id: '', color: '', text: '', font: '', style: '', amount: 1, seed: 2, boxes: [] },
    scan: Scanner.defaults(),
    adjust: { b: 0, c: 0, s: 0, w: 0, g: 0 },
    note: { title: '', place: '', date: today(), showDate: false, size: 'm', mood: '', font: 'sexsmith', color: 'auto' },
  });

  let state = defaults();
  let slots = [];
  const assets = { bg: null, bgBlob: null, mask: null, maskBlob: null, maskId: 0, stickers: {}, stickerBlobs: {} };
  let phase = 'shoot';
  let mode = 'photo';
  let boothIndex = 0;
  let activeSlot = 0;
  let category = 'stars';
  let tab = 'motif';
  let recording = null;
  let busy = false;
  let dirty = true;
  let selected = -1;
  let selectedMark = -1;

  const sample = sampleScene();
  const sampleSrc = { kind: 'sample', el: sample, sw: sample.width, sh: sample.height };
  const newSlot = (src) => ({ src, x: 0, y: 0, zoom: 1, flip: false, turn: 0 });

  /* ---------- коллаж ---------- */
  const collageTpl = () => (state.collage ? Collages.byId(state.collage) : null);
  const collageGeo = () => Collages.geometry(state.collage, card.width, card.height, state);
  /* Своё фото в ячейке есть, если это не пример и не живая камера. */
  const hasPhoto = (s) => !!(s && s.src && s.src.kind !== 'sample' && s.src.kind !== 'live');
  const nextEmpty = (from) => {
    for (let k = 1; k <= slots.length; k++) {
      const i = (from + k) % slots.length;
      if (!hasPhoto(slots[i])) return i;
    }
    return -1;
  };

  /* Переход между карточкой и коллажами. Свои снимки переезжают по порядку, пустые места остаются пустыми.
     Пока своих снимков нет, во всех ячейках пример, чтобы шаблон было видно. */
  function setCollage(id) {
    const own = slots.filter(hasPhoto);
    state.collage = id;
    selectedMark = -1;
    const tpl = collageTpl();
    const n = tpl ? Collages.count(id, state) : mode === 'booth' ? 2 : 1;
    const filler = () => (own.length ? (tpl ? null : sampleSrc) : sampleSrc);
    slots = Array.from({ length: n }, (_, i) => own[i] || newSlot(filler()));
    activeSlot = Math.max(0, own.length < n ? own.length : 0);
    if (Camera.active && phase === 'shoot' && liveSrc) {
      slots[activeSlot] = newSlot(liveSrc);
      slots[activeSlot].flip = Camera.mirrored;
    }
    syncKind();
    syncSlotUI();
    update();
  }

  /* В коллаже фигуры, раскладка бумаги и будка не нужны: прячем их. */
  function syncKind() {
    const on = !!collageTpl();
    document.querySelector('[data-tab="motif"]').hidden = on;
    $('paperPosGroup').hidden = on;
    $('cellTools').hidden = !on;
    $('cellHint').hidden = !on;
    const booth = $('modeSeg').querySelector('[data-v="booth"]');
    booth.hidden = on;
    if (on && mode === 'booth') setMode('photo');
    if (on && tab === 'motif') setTab('collage');
    syncCollages();
  }

  /* Миниатюры шаблонов рисуются той же отрисовкой, что и карточка, с примером в ячейках. */
  const collageThumbs = new Map();
  function collageThumb(id) {
    const key = `${id}|${I18n.lang}`;
    if (collageThumbs.has(key)) return collageThumbs.get(key);
    const c = canvas(120, 150);
    const s = { ...defaults(), paper: 'smooth', collage: id, note: { ...defaults().note, title: '', showDate: false } };
    const n = id ? Collages.count(id, s) : 1;
    /* ошибка в одном шаблоне не должна ломать весь экран: такой просто останется без миниатюры */
    try {
      renderCard(c.getContext('2d'), s, Array.from({ length: n }, () => newSlot(sampleSrc)), {});
    } catch (err) {
      console.warn('collage thumb', id, err);
    }
    collageThumbs.set(key, c);
    return c;
  }

  function syncCollages() {
    const grid = $('collageGrid');
    grid.replaceChildren();
    [{ id: '', name: 'Обычная карточка' }, ...Collages.COLLAGES].forEach((tpl) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb';
      b.classList.toggle('on', tpl.id === (state.collage || ''));
      const c = canvas(120, 150);
      c.getContext('2d').drawImage(collageThumb(tpl.id), 0, 0);
      const label = document.createElement('span');
      label.textContent = t(tpl.name);
      b.append(c, label);
      b.onclick = () => {
        if (tpl.id !== (state.collage || '')) setCollage(tpl.id);
      };
      grid.append(b);
    });
    /* по ряду цветов на каждый элемент шаблона, который можно перекрасить; выбор помнится для каждого шаблона */
    const groups = $('tintGroups');
    groups.replaceChildren();
    const id = state.collage;
    Collages.paletteOf(id).forEach((item) => {
      const group = document.createElement('div');
      group.className = 'group';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = t(item.name);
      const row = document.createElement('div');
      row.className = 'swatches';
      group.append(label, row);
      groups.append(group);
      const current = (state.tints[id] && state.tints[id][item.key]) || 'auto';
      swatches(row, TINT_COLORS, current, (c) => {
        state.tints = { ...state.tints, [id]: { ...(state.tints[id] || {}), [item.key]: c } };
        syncCollages();
        update();
      }, t('Как в шаблоне'));
    });
    /* варианты шаблона: скобки, подписи, где фото */
    const tpl = collageTpl();
    ((tpl && tpl.choices) || []).forEach((item) => {
      const group = document.createElement('div');
      group.className = 'group';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = t(item.name);
      const row = document.createElement('div');
      row.className = 'chips';
      group.append(label, row);
      groups.append(group);
      const current = (state.tints[id] && state.tints[id][item.key]) || item.def;
      item.options.forEach(([value, name]) => chip(row, t(name), value === current, () => {
        state.tints = { ...state.tints, [id]: { ...(state.tints[id] || {}), [item.key]: value } };
        /* от варианта может зависеть число снимков, например у листа марок */
        syncSlotCount();
        syncCollages();
        update();
      }));
    });
    $('collageShuffle').hidden = !(tpl && tpl.shuffle);
    $('markTools').hidden = !(tpl && tpl.marks);
    $('cellButtons').hidden = !!(tpl && tpl.marks);
  }

  /* У фраз число окошек зависит от текста: добавляем пустые ячейки или убираем лишние, свои снимки не трогаем. */
  function syncSlotCount() {
    if (!collageTpl() || !collageTpl().layout) return;
    const n = Collages.count(state.collage, state);
    const anyOwn = slots.some(hasPhoto);
    while (slots.length < n) slots.push(newSlot(anyOwn ? null : sampleSrc));
    if (slots.length > n) slots = slots.slice(0, n);
    activeSlot = Math.min(activeSlot, slots.length - 1);
  }

  const card = $('card');
  const ctx = card.getContext('2d');

  const invalidate = () => { dirty = true; };

  /* ---------- отрисовка ---------- */
  function sizeCanvas() {
    const [W, H] = RATIOS[state.ratio];
    const k = (Camera.active ? 800 : 1100) / Math.max(W, H);
    card.width = Math.round(W * k);
    card.height = Math.round(H * k);
    $('readout').textContent = `${W} × ${H} · ${state.ratio}`;
    invalidate();
  }

  /* текущее время первого видео в карточке: по нему рамки сканера следят и вспыхивают */
  const videoClock = () => {
    const v = slots.find((s) => s.src && s.src.kind === 'video');
    return v ? v.src.el.currentTime : null;
  };
  const isMoving = () => slots.some((s) => s.src && (s.src.kind === 'live' || s.src.kind === 'video'));

  let lastFrame = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (scanPlay != null) {
      const T = (now - scanPlay) / 1000;
      if (T > Scanner.DURATION) {
        scanPlay = null;
        dirty = true;
      } else {
        Scanner.time = T;
        renderCard(ctx, state, slots, assets);
        Scanner.time = null;
        return;
      }
    }
    /* у фото рамки, которые вспыхивают или роятся, тоже живут, пока открыт сканер */
    if (scanMode() && ['flash', 'swarm'].includes(state.scan.motion) && !isMoving() && now - lastFrame > 33) {
      lastFrame = now;
      Scanner.clock = now / 1000;
      renderCard(ctx, state, slots, assets);
      Scanner.clock = null;
      drawSelection();
      return;
    }
    const due = isMoving() && now - lastFrame > 33;
    if (!dirty && !due) return;
    dirty = false;
    lastFrame = now;
    Scanner.clock = videoClock();
    renderCard(ctx, comparing ? { ...state, fx: { ...state.fx, id: '' }, fx2: { ...state.fx2, id: '' }, scan: { ...state.scan, on: false } } : state, slots, assets);
    Scanner.clock = null;
    if (!comparing) drawSelection();
    placeCtx();
  }

  /* Рамка вокруг выбранной фигуры видна только в превью, в файл она не попадает. */
  function drawSelection() {
    if (scanMode() && selectedIcon >= 0) {
      const b = (Scanner.lastIcons || [])[selectedIcon];
      if (!b) return;
      const r = window.Render.fxRect(state, card.width, card.height);
      ctx.save();
      ctx.strokeStyle = '#6c9fe0';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(r.x + b.x * r.w - 6, r.y + b.y * r.h - 6, b.w * r.w + 12, b.h * r.h + 12);
      ctx.restore();
      return;
    }
    if (scanMode()) {
      /* в режиме слежения обводим рамку там, где она сейчас */
      const moved = Scanner.lastMotion === 'track' && Scanner.lastBoxes.length === state.scan.boxes.length;
      const b = (moved ? Scanner.lastBoxes : state.scan.boxes)[selectedScan];
      if (!b) return;
      const r = window.Render.fxRect(state, card.width, card.height);
      const x = r.x + b.x * r.w, y = r.y + b.y * r.h, w = b.w * r.w, h = b.h * r.h;
      ctx.save();
      ctx.strokeStyle = '#6c9fe0';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(x - 5, y - 5, w + 10, h + 10);
      ctx.setLineDash([]);
      ctx.fillStyle = '#6c9fe0';
      ctx.fillRect(x + w - 7, y + h - 7, 14, 14);
      ctx.restore();
      return;
    }
    if (tab === 'layers') {
      /* в режиме выбора нескольких обводим все отмеченные, иначе один выбранный */
      const list = multiMode ? [...multi] : [selectedLayer];
      list.forEach((i) => {
        const l = state.layers[i];
        if (!l) return;
        const b = window.Render.layerBox(ctx, l, assets, card.width, card.height);
        ctx.save();
        ctx.translate(l.x * card.width, l.y * card.height);
        ctx.rotate(l.rot || 0);
        ctx.strokeStyle = multiMode ? '#f5c518' : '#6c9fe0';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(-b.w / 2 - 6, -b.h / 2 - 6, b.w + 12, b.h + 12);
        ctx.restore();
      });
      return;
    }
    /* в коллаже обводим выбранную ячейку, пока открыт коллаж или кадр */
    if (collageTpl() && collageTpl().marks && tab === 'collage') {
      const b = collageGeo().marks[selectedMark];
      if (!b) return;
      ctx.save();
      ctx.strokeStyle = '#6c9fe0';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
      ctx.setLineDash([]);
      ctx.fillStyle = '#6c9fe0';
      ctx.fillRect(b.x + b.w - 7, b.y + b.h - 7, 14, 14);
      ctx.restore();
      return;
    }
    if (collageTpl() && (tab === 'collage' || tab === 'photo')) {
      const c = Collages.cellOf(collageGeo(), activeSlot);
      if (!c) return;
      ctx.save();
      ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
      ctx.rotate(c.rot);
      ctx.strokeStyle = '#6c9fe0';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 7]);
      ctx.strokeRect(-c.w / 2 - 4, -c.h / 2 - 4, c.w + 8, c.h + 8);
      ctx.restore();
      return;
    }
    const p = handMode() && state.pieces[selected];
    if (!p) return;
    const L = layout(state, card.width, card.height);
    [L.photo, L.pieces].filter(Boolean).forEach((r) => {
      ctx.save();
      ctx.strokeStyle = '#6c9fe0';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([9, 7]);
      ctx.beginPath();
      ctx.arc(r.x + p.x * r.w, r.y + p.y * r.h, p.size * Math.min(r.w, r.h) * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  /* ---------- сообщения ---------- */
  let toastTimer = 0;
  function toast(text, action) {
    const el = $('toast');
    el.textContent = text;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.onclick = () => { el.hidden = true; action.run(); };
      el.append(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, action ? 12000 : 4000);
  }

  /* ---------- этапы ---------- */
  function setPhase(next) {
    phase = next;
    $('shootBar').hidden = next !== 'shoot';
    document.querySelector('.app').classList.toggle('editing', next === 'edit');
    syncStarter();
    syncSlotUI();
  }

  function syncStarter() {
    /* Пока камера выключена, затвор её включает, а режимы съёмки и её кнопки не нужны. */
    const idle = phase === 'shoot' && !Camera.active && !slots.some((s) => s.src && s.src.kind !== 'sample');
    $('modeSeg').hidden = idle;
    $('camTools').hidden = idle;
    $('startSample').hidden = !idle;
    $('sampleTag').hidden = !slots.some((s) => s.src && s.src.kind === 'sample');
  }

  function goEdit() {
    Camera.stop();
    sizeCanvas();
    setPhase('edit');
    scheduleDraft();
  }

  function resetSlots() {
    boothIndex = 0;
    activeSlot = 0;
    const live = Camera.active ? liveSrc : sampleSrc;
    const tpl = collageTpl();
    if (tpl) slots = Array.from({ length: Collages.count(state.collage, state) }, (_, i) => newSlot(i === 0 ? live : Camera.active ? null : sampleSrc));
    else slots = mode === 'booth' ? [newSlot(live), newSlot(Camera.active ? null : sampleSrc)] : [newSlot(live)];
    slots.forEach((s) => { s.flip = !!s.src && s.src.kind === 'live' && Camera.mirrored; });
    syncSlotUI();
    invalidate();
  }

  function setMode(next) {
    mode = next;
    markSeg($('modeSeg'), next);
    resetSlots();
  }

  function clearSampleNote() {
    if (state.note.title === SAMPLE_TITLE) {
      state.note.title = '';
      syncInputs();
    }
  }

  /* ---------- камера ---------- */
  let liveSrc = null;

  async function openCamera(starter) {
    try {
      liveSrc = await starter();
    } catch (err) {
      const denied = err && err.name === 'NotAllowedError';
      toast(t(denied ? 'Нет доступа к камере. Разреши его в настройках браузера или загрузи фото.' : 'Камера не запустилась. Загрузи фото из галереи.'));
      return false;
    }
    clearSampleNote();
    $('torchBtn').hidden = !Camera.canTorch();
    $('zoomBtn').textContent = '1×';
    sizeCanvas();
    if (collageTpl()) {
      /* в коллаже камера встаёт в выбранную ячейку, остальные снимки не трогаем */
      if (!slots.some(hasPhoto)) resetSlots();
      slots.forEach((s) => { if (s.src && s.src.kind === 'live') s.src = null; });
      slots[activeSlot] = newSlot(liveSrc);
      slots[activeSlot].flip = Camera.mirrored;
      invalidate();
    } else if (boothIndex === 0) {
      resetSlots();
    } else {
      slots[boothIndex].src = liveSrc;
      slots[boothIndex].flip = Camera.mirrored;
    }
    syncStarter();
    return true;
  }

  function countdown(seconds) {
    const el = $('countdown');
    el.hidden = false;
    return new Promise((resolve) => {
      let n = seconds;
      const step = () => {
        if (n === 0) {
          el.hidden = true;
          return resolve();
        }
        el.textContent = n--;
        setTimeout(step, 800);
      };
      step();
    });
  }

  async function imageSrc(blob) {
    const el = new Image();
    el.src = URL.createObjectURL(blob);
    await el.decode();
    return { kind: 'image', el, sw: el.naturalWidth, sh: el.naturalHeight, blob };
  }

  /* Длинное видео на телефоне открывается не сразу, поэтому ждём первый кадр с запасом. */
  const VIDEO_WAIT_MS = 60000;
  const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|3gp)$/i;

  async function videoSrc(blob) {
    const el = document.createElement('video');
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.preload = 'auto';
    el.src = URL.createObjectURL(blob);
    /* Телефонные браузеры могут не грузить кадры, пока видео не запущено. */
    el.load();
    el.play().catch(() => {});
    let timer = 0;
    try {
      await new Promise((resolve, reject) => {
        el.onloadeddata = resolve;
        el.onerror = () => reject(new Error('bad video'));
        timer = setTimeout(() => reject(new Error('video timeout')), VIDEO_WAIT_MS);
      });
      /* Без кодека браузер открывает только звук, и кадра нет. */
      if (!el.videoWidth) throw new Error('no picture');
    } catch (err) {
      el.pause();
      URL.revokeObjectURL(el.src);
      throw err;
    } finally {
      clearTimeout(timer);
    }
    return { kind: 'video', el, sw: el.videoWidth, sh: el.videoHeight, blob };
  }

  /* Браузер не всегда знает тип файла, тогда смотрим на расширение. */
  const isVideoFile = (file) => file.type.startsWith('video/')
    || (!file.type.startsWith('image/') && VIDEO_EXT.test(file.name));

  /* Коллаж: снимок ложится в выбранную ячейку, камера переезжает в следующую пустую.
     Когда пустых не осталось, переходим к настройке. */
  function putIntoCell(src, flip, turn) {
    slots[activeSlot] = newSlot(src);
    Object.assign(slots[activeSlot], { flip, turn });
    const next = nextEmpty(activeSlot);
    if (next < 0) return goEdit();
    activeSlot = next;
    slots[next] = newSlot(liveSrc);
    slots[next].flip = Camera.mirrored;
    syncSlotUI();
    invalidate();
  }

  async function takePhoto() {
    const flip = Camera.mirrored;
    const { turn } = slots[activeSlot] || slots[0];
    const src = await imageSrc(await Camera.snapshot());
    if (collageTpl()) return putIntoCell(src, flip, turn);
    slots = [newSlot(src)];
    Object.assign(slots[0], { flip, turn });
    goEdit();
  }

  async function takeClip() {
    if (recording) return recording.stop();
    const flip = Camera.mirrored;
    const { turn } = slots[activeSlot] || slots[0];
    $('shutter').classList.add('rec');
    recording = Camera.record(CLIP_MS);
    const blob = await recording.done;
    recording = null;
    $('shutter').classList.remove('rec');
    let src;
    try {
      src = await videoSrc(blob);
    } catch {
      return toast(t('Этот файл не открывается. Попробуй JPG, PNG или MP4.'));
    }
    if (collageTpl()) return putIntoCell(src, flip, turn);
    slots = [newSlot(src)];
    Object.assign(slots[0], { flip, turn });
    goEdit();
  }

  async function runBooth() {
    busy = true;
    while (boothIndex < 2) {
      slots[boothIndex].src = liveSrc;
      slots[boothIndex].flip = Camera.mirrored;
      await countdown(3);
      const flip = Camera.mirrored;
      slots[boothIndex] = newSlot(await imageSrc(await Camera.snapshot()));
      slots[boothIndex].flip = flip;
      boothIndex++;
      invalidate();
    }
    busy = false;
    goEdit();
  }

  async function shutter() {
    if (busy) return;
    if (!Camera.active) return void openCamera(Camera.start);
    if (mode === 'photo') return takePhoto();
    if (mode === 'video') return takeClip();
    if (collageTpl()) return takePhoto();
    return runBooth();
  }

  /* ---------- загрузка файлов ---------- */
  async function handleFiles(files) {
    const list = [...files];
    if (!list.length) return;
    clearSampleNote();
    try {
      if (collageTpl()) {
        /* первое фото в выбранную ячейку, остальные по пустым ячейкам дальше */
        let i = activeSlot;
        for (const file of list) {
          const src = isVideoFile(file) ? await videoSrc(file) : await imageSrc(file);
          slots[i] = newSlot(src);
          activeSlot = i;
          i = nextEmpty(i);
          if (i < 0) break;
        }
        /* после примера остальные ячейки становятся пустыми, чтобы было видно, что ещё заполнить */
        slots.forEach((s, k) => { if (s.src && s.src.kind === 'sample') slots[k] = newSlot(null); });
        const left = slots.filter((s) => !hasPhoto(s)).length;
        if (phase === 'shoot' && left) {
          const next = nextEmpty(activeSlot);
          activeSlot = next;
          if (Camera.active) {
            slots.forEach((s) => { if (s.src && s.src.kind === 'live') s.src = null; });
            slots[next] = newSlot(liveSrc);
            slots[next].flip = Camera.mirrored;
          }
          syncSlotUI();
          syncStarter();
          invalidate();
          return toast(`${t('Осталось заполнить ячеек')}: ${left}`);
        }
        syncSlotUI();
        if (phase === 'edit') return update();
        return goEdit();
      }
      if (mode === 'booth' && phase === 'shoot') {
        const images = list.filter((f) => f.type.startsWith('image/'));
        if (!images.length) return toast(t('Для будки нужны фотографии.'));
        for (const file of images.slice(0, 2 - boothIndex)) {
          slots[boothIndex] = newSlot(await imageSrc(file));
          boothIndex++;
        }
        invalidate();
        if (boothIndex < 2) {
          syncStarter();
          return toast(t('Осталось выбрать второй снимок.'));
        }
      } else {
        const file = list[0];
        const src = isVideoFile(file) ? await videoSrc(file) : await imageSrc(file);
        const i = phase === 'edit' ? activeSlot : 0;
        if (phase === 'edit') slots[i] = newSlot(src);
        else slots = [newSlot(src)];
      }
      goEdit();
    } catch {
      toast(t('Этот файл не открывается. Попробуй JPG, PNG или MP4.'));
    }
  }

  async function setBackground(blob) {
    const src = await imageSrc(blob);
    assets.bg = src.el;
    assets.bgBlob = blob;
    state.paper = 'own';
    syncPaper();
    update();
  }

  /* Вырезом становится непрозрачная часть картинки. У картинки без прозрачности берём тёмные места. */
  async function setMask(blob) {
    const { el, sw, sh } = await imageSrc(blob);
    const k = Math.min(1, 1400 / Math.max(sw, sh));
    const c = canvas(sw * k, sh * k);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(el, 0, 0, c.width, c.height);
    const img = x.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    let opaque = true;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 250) { opaque = false; break; }
    }
    for (let i = 0; i < d.length; i += 4) {
      const a = opaque ? 255 - (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) : d[i + 3];
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = a;
    }
    x.putImageData(img, 0, 0);
    assets.mask = c;
    assets.maskBlob = blob;
    assets.maskId++;
    state.motif = 'own-mask';
    syncMotifs();
    update();
  }

  /* ---------- черновик ---------- */
  let draftTimer = 0;
  function scheduleDraft() {
    if (phase !== 'edit') return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      Store.set('draft', {
        state,
        mode,
        slots: slots.map((s) => ({ x: s.x, y: s.y, zoom: s.zoom, flip: s.flip, turn: s.turn, blob: s.src && s.src.blob, kind: s.src && s.src.kind })),
        bgBlob: assets.bgBlob,
        maskBlob: assets.maskBlob,
        stickers: Object.entries(assets.stickerBlobs).filter(([id]) => !id.startsWith('c') || state.layers.some((l) => l.img === id)),
      });
    }, 700);
  }

  async function restoreDraft(draft) {
    state = { ...defaults(), ...draft.state };
    state.note = { ...defaults().note, ...draft.state.note };
    state.fx = { ...defaults().fx, ...(draft.state.fx || {}) };
    state.fx2 = { ...defaults().fx2, ...(draft.state.fx2 || {}) };
    state.scan = { ...Scanner.defaults(), ...(draft.state.scan || {}) };
    ['fx', 'fx2'].forEach((key) => {
      const f = state[key];
      const to = Scanner.fromEffect(f);
      if (!to) return;
      if (!state.scan.on) state.scan = to;
      state[key] = { ...defaults()[key] };
    });
    mode = draft.mode;
    markSeg($('modeSeg'), mode);
    const restored = [];
    for (const s of draft.slots) {
      /* пустая ячейка коллажа так и остаётся пустой, а не превращается в пример */
      const empty = draft.state.collage && s.kind !== 'sample';
      const src = !s.blob ? (empty ? null : sampleSrc) : s.kind === 'video' ? await videoSrc(s.blob) : await imageSrc(s.blob);
      restored.push({ ...newSlot(src), x: s.x, y: s.y, zoom: s.zoom, flip: s.flip, turn: s.turn || 0 });
    }
    slots = restored;
    if (draft.bgBlob) {
      const paper = state.paper;
      await setBackground(draft.bgBlob);
      state.paper = paper;
    }
    if (draft.maskBlob) {
      const motif = state.motif;
      await setMask(draft.maskBlob);
      state.motif = motif;
    }
    for (const [id, blob] of draft.stickers || []) {
      try {
        assets.stickers[id] = (await imageSrc(blob)).el;
        assets.stickerBlobs[id] = blob;
      } catch {}
    }
    category = byId(state.motif).cat;
    activeSlot = 0;
    syncAll();
    goEdit();
    resetHistory();
  }

  /* ---------- общие помощники интерфейса ---------- */
  function update() {
    invalidate();
    scheduleDraft();
    recordHistory();
  }

  const getPath = (path) => path.split('.').reduce((o, k) => o[k], state);
  function setPath(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => o[k], state)[last] = value;
    update();
  }

  function markSeg(seg, value) {
    seg.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b.dataset.v === String(value));
      b.setAttribute('aria-pressed', b.dataset.v === String(value));
    });
  }

  function syncInputs() {
    document.querySelectorAll('[data-bind]').forEach((el) => {
      const v = getPath(el.dataset.bind);
      if (el.type === 'checkbox') el.checked = v;
      else el.value = v;
    });
    document.querySelectorAll('[data-seg]').forEach((seg) => markSeg(seg, getPath(seg.dataset.seg)));
  }

  /* выпадающий список шрифтов: первая строка значит «шрифт по умолчанию» */
  function fontSelect(el, first, current) {
    if (el.dataset.lang !== I18n.lang || !el.options.length) {
      el.replaceChildren();
      [{ id: '', name: first, css: '' }, ...Effects.fonts()].forEach((f) => {
        const o = document.createElement('option');
        o.value = f.id;
        o.textContent = f.id ? t(f.name) : first;
        if (f.css) o.style.fontFamily = f.css;
        el.append(o);
      });
      el.dataset.lang = I18n.lang;
    }
    el.value = current || '';
    const f = Effects.fonts().find((x) => x.id === current);
    el.style.fontFamily = f ? f.css : '';
  }

  function chip(parent, text, on, run) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.classList.toggle('on', on);
    b.onclick = run;
    parent.append(b);
    return b;
  }

  function swatches(parent, colors, current, pick, autoLabel) {
    parent.replaceChildren();
    if (autoLabel) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'auto';
      b.textContent = autoLabel;
      b.classList.toggle('on', current === 'auto');
      b.onclick = () => pick('auto');
      parent.append(b);
    }
    colors.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = c;
      b.setAttribute('aria-label', `${t('Цвет')} ${c}`);
      b.classList.toggle('on', c === current);
      b.onclick = () => pick(c);
      parent.append(b);
    });
    const own = document.createElement('label');
    own.title = t('Свой цвет');
    const input = document.createElement('input');
    input.type = 'color';
    input.setAttribute('aria-label', t('Свой цвет'));
    input.value = current === 'auto' ? '#000000' : current;
    input.onchange = () => pick(input.value);
    own.append(input);
    parent.append(own);
  }

  /* ---------- панель фигур ---------- */
  function drawThumb(c, motif) {
    const x = c.getContext('2d');
    if (motif.id === 'none') {
      /* значок «ничего»: перечёркнутый круг */
      x.strokeStyle = '#8a93a6';
      x.lineWidth = 4;
      x.beginPath();
      x.arc(c.width / 2, c.height / 2, 26, 0, Math.PI * 2);
      x.moveTo(c.width / 2 - 18, c.height / 2 + 18);
      x.lineTo(c.width / 2 + 18, c.height / 2 - 18);
      x.stroke();
      return;
    }
    x.fillStyle = '#f0ede5';
    motif.draw(x, c.width, c.height, makeRng(7), {
      size: 1, density: 0.8, text: '', font: state.wordFont, image: motif.usesImage ? assets.mask : null, pieces: DEMO_PIECES,
    });
    /* Перелив в миниатюрах: те же цвета, что у заголовка. */
    const holo = x.createLinearGradient(0, 0, c.width, c.height);
    ['#f0ede5', '#b8c5d6', '#6c9fe0', '#a78bfa'].forEach((color, i) => holo.addColorStop(i / 3, color));
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = holo;
    x.fillRect(0, 0, c.width, c.height);
  }

  let thumbQueue = [];
  function pumpThumbs() {
    const next = thumbQueue.splice(0, 6);
    next.forEach(([c, m]) => drawThumb(c, m));
    if (thumbQueue.length) requestAnimationFrame(pumpThumbs);
  }

  function syncMotifs() {
    const cats = $('motifCats');
    cats.replaceChildren();
    CATEGORIES.forEach((c) => chip(cats, t(c.name), c.id === category, () => { category = c.id; syncMotifs(); }));
    const grid = $('motifGrid');
    grid.replaceChildren();
    thumbQueue = [];
    MOTIFS.filter((m) => m.id === 'none' || category === 'all' || m.cat === category).forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb';
      b.classList.toggle('on', m.id === state.motif);
      const c = canvas(120, 150);
      const label = document.createElement('span');
      label.textContent = t(m.name);
      b.append(c, label);
      b.onclick = () => {
        state.motif = m.id;
        selected = -1;
        if (m.usesPieces && !state.pieces.length) state.pieces = DEMO_PIECES.map((p) => ({ ...p }));
        syncMotifs();
        update();
      };
      grid.append(b);
      thumbQueue.push([c, m]);
    });
    requestAnimationFrame(pumpThumbs);
    const motif = byId(state.motif);
    $('wordField').hidden = !motif.usesText;
    $('maskUpload').hidden = !motif.usesImage;
    $('maskHint').hidden = !motif.usesImage;
    $('handTools').hidden = !motif.usesPieces;
    const none = motif.id === 'none';
    $('genTools').hidden = !!motif.usesPieces || none;
    /* без фигуры настройки вырезов ни к чему */
    [$('ghost').closest('label'), document.querySelector('[data-seg="effect"]').closest('.group'), document.querySelector('[data-bind="scatter"]')?.closest('label')]
      .forEach((el) => { if (el) el.hidden = none; });
    const fonts = $('wordFonts');
    fonts.replaceChildren();
    fonts.hidden = !motif.usesText || WORD_FONTS.length < 2;
    WORD_FONTS.forEach((f) => {
      chip(fonts, f.name, f.id === state.wordFont, () => {
        state.wordFont = f.id;
        syncMotifs();
        update();
      }).style.fontFamily = f.css;
    });
    const only = WORD_FONTS.find((f) => f.id === state.wordFont)?.only;
    $('fontHint').hidden = !motif.usesText || !only;
    $('fontHint').textContent = t(only === 'latin' ? 'В этом шрифте только латиница.' : 'В этом шрифте только кириллица.');
    syncPieceTools();
    syncGrab();
  }

  /* ---------- ручная расстановка ---------- */
  const handMode = () => tab === 'motif' && !!byId(state.motif).usesPieces;
  const syncGrab = () => card.classList.toggle('grab', tab === 'photo' || tab === 'layers' || fxBoxMode() || scanMode() || handMode() || (tab === 'collage' && !!collageTpl()));

  function syncPieceTools() {
    const p = state.pieces[selected];
    ['pieceSize', 'pieceRot', 'pieceCopy', 'pieceDelete'].forEach((id) => { $(id).disabled = !p; });
    $('pieceClear').disabled = !state.pieces.length;
    if (!p) return;
    $('pieceSize').value = p.size;
    $('pieceRot').value = Math.round((p.rot * 180) / Math.PI);
  }

  function selectPiece(i) {
    selected = i;
    syncPieceTools();
    invalidate();
  }

  function addPiece(piece) {
    state.pieces.push(piece);
    selectPiece(state.pieces.length - 1);
    update();
  }

  function buildPalette() {
    $('palette').replaceChildren();
    Object.entries(SYMBOLS).forEach(([id, symbol]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', `${t('Добавить')}: ${t(symbol.name)}`);
      b.title = t(symbol.name);
      b.append(window.Decor.symbol(id, 26));
      b.onclick = () => addPiece({ shape: id, x: 0.3 + Math.random() * 0.4, y: 0.3 + Math.random() * 0.4, size: 0.3, rot: 0 });
      $('palette').append(b);
    });
  }

  /* Переводит точку касания в доли окна: фигура одна, а видна сразу в двух половинах. */
  function pointInFrame(e) {
    const box = card.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * card.width;
    const py = ((e.clientY - box.top) / box.height) * card.height;
    const L = layout(state, card.width, card.height);
    const r = [L.photo, L.pieces].filter(Boolean).find((a) => px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h);
    return r && { x: (px - r.x) / r.w, y: (py - r.y) / r.h, r };
  }

  function bindPieces() {
    const pointers = new Map();
    let grabbed = null;
    let pinch = 0;

    card.addEventListener('pointerdown', (e) => {
      if (!handMode()) return;
      pointers.set(e.pointerId, e);
      if (pointers.size > 1) return;
      const at = pointInFrame(e);
      if (!at) return selectPiece(-1);
      const m = Math.min(at.r.w, at.r.h);
      let hit = -1;
      let best = Infinity;
      state.pieces.forEach((p, i) => {
        const d = Math.hypot((p.x - at.x) * at.r.w, (p.y - at.y) * at.r.h);
        if (d < p.size * m * 0.62 && d < best) { best = d; hit = i; }
      });
      selectPiece(hit);
      if (hit < 0) return;
      card.setPointerCapture(e.pointerId);
      const p = state.pieces[hit];
      grabbed = { dx: p.x - at.x, dy: p.y - at.y, r: at.r };
    });

    card.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, e);
      const p = state.pieces[selected];
      if (!p) return;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinch) p.size = clamp(p.size * (dist / pinch), 0.05, 1.2);
        pinch = dist;
        syncPieceTools();
        return update();
      }
      if (!grabbed) return;
      const box = card.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * card.width;
      const py = ((e.clientY - box.top) / box.height) * card.height;
      p.x = clamp((px - grabbed.r.x) / grabbed.r.w + grabbed.dx, 0, 1);
      p.y = clamp((py - grabbed.r.y) / grabbed.r.h + grabbed.dy, 0, 1);
      update();
    });

    const release = (e) => {
      pointers.delete(e.pointerId);
      pinch = 0;
      if (!pointers.size) grabbed = null;
    };
    card.addEventListener('pointerup', release);
    card.addEventListener('pointercancel', release);
    card.addEventListener('wheel', (e) => {
      const p = handMode() && state.pieces[selected];
      if (!p) return;
      e.preventDefault();
      p.size = clamp(p.size * (e.deltaY < 0 ? 1.06 : 0.94), 0.05, 1.2);
      syncPieceTools();
      update();
    }, { passive: false });

    $('pieceSize').oninput = (e) => {
      state.pieces[selected].size = Number(e.target.value);
      update();
    };
    $('pieceRot').oninput = (e) => {
      state.pieces[selected].rot = (Number(e.target.value) * Math.PI) / 180;
      update();
    };
    $('pieceCopy').onclick = () => {
      const p = state.pieces[selected];
      addPiece({ ...p, x: clamp(p.x + 0.06, 0, 1), y: clamp(p.y + 0.06, 0, 1) });
    };
    $('pieceDelete').onclick = () => {
      state.pieces.splice(selected, 1);
      selectPiece(-1);
      update();
    };
    $('pieceClear').onclick = () => {
      state.pieces = [];
      selectPiece(-1);
      update();
    };
  }

  /* ---------- панель бумаги ---------- */
  let paperQueue = [];
  function pumpPapers() {
    const next = paperQueue.shift();
    if (!next) return;
    const [c, id] = next;
    const x = c.getContext('2d');
    if (id === 'own') drawCover(x, assets.bg, assets.bg.naturalWidth, assets.bg.naturalHeight, c.width, c.height);
    else x.drawImage(paintPaper(id, state.paperColor, c.width * 1.6, c.height * 1.6), 0, 0, c.width, c.height);
    requestAnimationFrame(pumpPapers);
  }

  function syncPaper() {
    const list = $('paperList');
    list.replaceChildren();
    paperQueue = [];
    PAPERS.filter((p) => p.id !== 'own' || assets.bg).forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb';
      b.classList.toggle('on', p.id === state.paper);
      const c = canvas(330, 220);
      const label = document.createElement('span');
      label.textContent = t(p.name);
      b.append(c, label);
      b.onclick = () => {
        state.paper = p.id;
        syncPaper();
        update();
      };
      list.append(b);
      paperQueue.push([c, p.id]);
    });
    requestAnimationFrame(pumpPapers);
    const grid = $('templateGrid');
    grid.replaceChildren();
    Templates.BACKGROUNDS.forEach((item) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb';
      const img = document.createElement('img');
      img.src = item.src;
      img.alt = '';
      const label = document.createElement('span');
      label.textContent = t(item.name);
      b.append(img, label);
      b.onclick = async () => setBackground(await (await fetch(item.src)).blob());
      grid.append(b);
    });
    swatches($('paperSwatches'), PAPER_COLORS, state.paperColor, (c) => {
      state.paperColor = c;
      if (state.paper === 'own') state.paper = 'smooth';
      syncPaper();
      update();
    });
  }

  /* ---------- панель подписи ---------- */
  function syncNote() {
    const moods = $('moodChips');
    moods.replaceChildren();
    MOODS.forEach((m) => chip(moods, m, m === state.note.mood, () => {
      state.note.mood = state.note.mood === m ? '' : m;
      syncInputs();
      syncNote();
      update();
    }));
    const fonts = $('fontList');
    fonts.replaceChildren();
    FONTS.forEach((f) => {
      chip(fonts, t(f.name), f.id === state.note.font, () => {
        state.note.font = f.id;
        syncSlotCount();
        syncNote();
        update();
      }).style.fontFamily = f.css;
    });
    swatches($('textSwatches'), TEXT_COLORS, state.note.color, (c) => {
      state.note.color = c;
      syncNote();
      update();
    }, t('Авто'));
  }

  /* ---------- панель формата ---------- */
  function syncRatios() {
    const list = $('ratioList');
    list.replaceChildren();
    Object.entries(RATIOS).forEach(([id, [w, h]]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.classList.toggle('on', id === state.ratio);
      const box = document.createElement('i');
      box.style.aspectRatio = `${w} / ${h}`;
      b.append(box, id);
      b.onclick = () => {
        state.ratio = id;
        syncRatios();
        sizeCanvas();
        scheduleDraft();
      };
      list.append(b);
    });
  }

  /* ---------- кадрирование ---------- */
  function syncSlotUI() {
    $('slotGroup').hidden = slots.length < 2 || !!collageTpl();
    if (collageTpl()) {
      const s = slots[activeSlot];
      $('cellClear').disabled = !hasPhoto(s);
    }
    markSeg($('slotSeg'), activeSlot);
    const s = slots[activeSlot];
    if (!s) return;
    $('slotZoom').value = s.zoom;
    $('slotX').value = s.x;
    $('slotY').value = s.y;
  }

  /* Какой снимок под пальцем: в будке их два. */
  function slotAt(px, py) {
    if (collageTpl()) return Collages.cellAt(collageGeo(), px, py);
    return slots.findIndex((s, i) => {
      const { area, rect } = slotFrame(state, i, slots.length, card.width, card.height);
      const x = px - area.x - rect.x;
      const y = py - area.y - rect.y;
      return x >= 0 && y >= 0 && x <= rect.w && y <= rect.h;
    });
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* Размер окна снимка номер i: ячейка коллажа или половина карточки. */
  function slotSize(i) {
    if (collageTpl()) {
      const c = Collages.cellOf(collageGeo(), i);
      return { w: c.w, h: c.h };
    }
    return slotFrame(state, i, slots.length, card.width, card.height).rect;
  }

  function setZoom(value) {
    const s = slots[activeSlot];
    if (!s) return;
    s.zoom = clamp(value, 1, 4);
    $('slotZoom').value = s.zoom;
    update();
  }

  function bindDrag() {
    const pointers = new Map();
    let pinch = 0;

    card.addEventListener('pointerdown', (e) => {
      if (tab === 'collage' && collageTpl() && collageTpl().marks) return;
      const picking = tab === 'collage' && !!collageTpl();
      if ((tab !== 'photo' && !picking) || !slots.length) return;
      if (slots.length > 1) {
        const box = card.getBoundingClientRect();
        const i = slotAt(((e.clientX - box.left) / box.width) * card.width, ((e.clientY - box.top) / box.height) * card.height);
        if (i >= 0 && i !== activeSlot) {
          activeSlot = i;
          /* в съёмке камера переезжает в выбранную ячейку, если в ней ещё нет своего снимка */
          if (picking && phase === 'shoot' && Camera.active && !hasPhoto(slots[i])) {
            slots.forEach((s) => { if (s.src && s.src.kind === 'live') s.src = null; });
            slots[i] = newSlot(liveSrc);
            slots[i].flip = Camera.mirrored;
          }
          invalidate();
        }
        syncSlotUI();
      }
      if (picking) return;
      pointers.set(e.pointerId, e);
      card.setPointerCapture(e.pointerId);
    });

    card.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, e);
      if (pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        const dist = Math.hypot(p.clientX - q.clientX, p.clientY - q.clientY);
        if (pinch && slots[activeSlot]) setZoom(slots[activeSlot].zoom * (dist / pinch));
        pinch = dist;
        return;
      }
      const s = slots[activeSlot];
      if (!s.src) return;
      const k = card.width / card.getBoundingClientRect().width;
      const rect = slotSize(activeSlot);
      s.x = clamp(s.x + ((e.clientX - prev.clientX) * k) / rect.w, -1, 1);
      s.y = clamp(s.y + ((e.clientY - prev.clientY) * k) / rect.h, -1, 1);
      syncSlotUI();
      update();
    });

    const release = (e) => {
      pointers.delete(e.pointerId);
      pinch = 0;
    };
    card.addEventListener('pointerup', release);
    card.addEventListener('pointercancel', release);
    card.addEventListener('wheel', (e) => {
      if (tab !== 'photo' || !slots.length) return;
      e.preventDefault();
      setZoom(slots[activeSlot].zoom * (e.deltaY < 0 ? 1.06 : 0.94));
    }, { passive: false });
  }

  /* ---------- рамки вокруг людей ---------- */
  const marksMode = () => tab === 'collage' && !!collageTpl() && !!collageTpl().marks;
  /* рамки хранятся долями фото для каждого шаблона; пока своих нет, показываем пример шаблона */
  function marksOf() {
    const id = state.collage;
    if (!state.marks[id]) state.marks = { ...state.marks, [id]: (collageTpl().demoMarks || []).map((m) => ({ ...m })) };
    return state.marks[id];
  }
  function syncMarkTools() {
    $('markDelete').disabled = selectedMark < 0;
  }

  function bindMarks() {
    let drag = null;
    const toCard = (e) => {
      const box = card.getBoundingClientRect();
      return [((e.clientX - box.left) / box.width) * card.width, ((e.clientY - box.top) / box.height) * card.height];
    };
    card.addEventListener('pointerdown', (e) => {
      if (!marksMode()) return;
      const [px, py] = toCard(e);
      const geo = collageGeo();
      const cell = geo.cells[0];
      if (px < cell.x || py < cell.y || px > cell.x + cell.w || py > cell.y + cell.h) return;
      const list = marksOf();
      const grab = Math.max(14, card.width * 0.025);
      let hit = -1;
      let mode = 'move';
      for (let i = geo.marks.length - 1; i >= 0; i--) {
        const b = geo.marks[i];
        if (Math.abs(px - (b.x + b.w)) < grab && Math.abs(py - (b.y + b.h)) < grab) { hit = i; mode = 'size'; break; }
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) { hit = i; break; }
      }
      const fx = (px - cell.x) / cell.w;
      const fy = (py - cell.y) / cell.h;
      if (hit < 0) {
        const w = 0.12 * (cell.h / cell.w) * 0.8;
        list.push({ x: Math.min(1 - w, Math.max(0, fx - w / 2)), y: Math.min(0.8, Math.max(0, fy - 0.1)), w, h: 0.2 });
        hit = list.length - 1;
      }
      selectedMark = hit;
      const m = list[hit];
      drag = { id: e.pointerId, mode, fx, fy, start: { ...m }, cw: cell.w, ch: cell.h };
      try { card.setPointerCapture(e.pointerId); } catch {}
      syncMarkTools();
      update();
    });
    card.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id || !marksMode()) return;
      const [px, py] = toCard(e);
      const geo = collageGeo();
      const cell = geo.cells[0];
      const dx = (px - cell.x) / cell.w - drag.fx;
      const dy = (py - cell.y) / cell.h - drag.fy;
      const m = marksOf()[selectedMark];
      if (!m) return;
      if (drag.mode === 'size') {
        m.w = clamp(drag.start.w + dx, 0.02, 1 - m.x);
        m.h = clamp(drag.start.h + dy, 0.02, 1 - m.y);
      } else {
        m.x = clamp(drag.start.x + dx, 0, 1 - m.w);
        m.y = clamp(drag.start.y + dy, 0, 1 - m.h);
      }
      update();
    });
    const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);

    $('markDelete').onclick = () => {
      if (selectedMark < 0) return;
      marksOf().splice(selectedMark, 1);
      selectedMark = -1;
      syncMarkTools();
      update();
    };
    $('markClear').onclick = () => {
      state.marks = { ...state.marks, [state.collage]: [] };
      selectedMark = -1;
      syncMarkTools();
      update();
    };
    $('markPhoto').onclick = () => {
      activeSlot = 0;
      $('filePhoto').click();
    };
    $('markFind').onclick = findPeople;
    $('collageShuffle').onclick = () => {
      state.seed = Math.floor(Math.random() * 1e6);
      update();
    };
  }

  /* Поиск людей прямо на телефоне: модель распознавания скачивается один раз при первом нажатии. */
  let detector = null;
  const loadScript = (src) => new Promise((resolve, reject) => {
    if ([...document.scripts].some((s) => s.src === src)) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error(`script ${src}`));
    document.head.append(el);
  });
  async function loadDetector() {
    if (detector) return;
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
    detector = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
  }
  async function findPeople() {
    const slot = slots[0];
    if (!slot || !slot.src || slot.src.kind === 'live') return toast(t('Сначала добавь фото.'));
    const btn = $('markFind');
    btn.disabled = true;
    btn.textContent = t('Ищу…');
    try {
      await loadDetector();
      const found = (await detector.detect(slot.src.el, 30, 0.35)).filter((p) => p.class === 'person');
      if (!found.length) return toast(t('Людей на фото не нашлось. Поставь рамки пальцем.'));
      /* из пикселей снимка в доли окна с фото: с учётом масштаба, сдвига и отражения */
      const cell = collageGeo().cells[0];
      const g = window.Render.coverGeom(slot, { x: 0, y: 0, w: cell.w, h: cell.h });
      const k = g.dw / slot.src.sw;
      const list = found.map(({ bbox: [bx, by, bw, bh] }) => {
        let x = (g.cx - g.dw / 2 + bx * k) / cell.w;
        const w = (bw * k) / cell.w;
        if (slot.flip) x = 1 - x - w;
        return { x, y: (g.cy - g.dh / 2 + by * k) / cell.h, w, h: (bh * k) / cell.h };
      }).filter((m) => m.x + m.w > 0 && m.x < 1 && m.y + m.h > 0 && m.y < 1);
      state.marks = { ...state.marks, [state.collage]: list };
      selectedMark = -1;
      update();
      toast(`${t('Нашлось людей')}: ${list.length}`);
    } catch (err) {
      console.warn('find people', err);
      toast(t('Не получилось найти людей. При первом запуске нужен интернет.'));
    } finally {
      btn.disabled = false;
      btn.textContent = t('Найти людей');
    }
  }

  /* ---------- эффекты поверх фото ---------- */
  const FX_COLORS = ['#ffffff', '#111111', '#f5c518', '#39ff6a', '#ff5a1f', '#e01b1b', '#6c9fe0', '#f472b6', '#a78bfa'];
  const FX_HINTS = {
    detect: 'Подпись у рамок. Пусто: Person или то, что нашлось.',
    objects: 'Слово перед номером рамки.',
    tags: 'Слова через запятую, по одному на рамку.',
    frameLetters: 'Своё слово спрячется среди случайных букв.',
    colLetters: 'Своё слово спрячется среди случайных букв.',
    pixels: 'Буквы этого слова встанут в квадраты.',
    morse: 'Текст станет точками и тире.',
    threads: 'Слова через пробел, у каждого своя нить.',
    graph: 'Подписи по оси внизу: буквы подряд или через запятую.',
    circle: 'Подписи по краям через запятую.',
    chart: 'Заголовок блока обозначений.',
    vwords: 'Каждое слово встанет своим столбиком.',
    rain: 'Слова через запятую: часть встанет вдоль капель, часть у кругов на воде.',
    split: 'Подпись на плашке.',
    glass: 'Для вида «С подписями»: строки через запятую, число в конце строки встанет ниже.',
    curve: 'Подписи точек через запятую.',
    formula: 'Например: x^2 [-3, 3], sin(x)/x, abs(x). Для кривой: x = cos(t); y = sin(t).',
  };
  let selectedBox = -1;
  /* какой из двух слоёв эффектов сейчас правится */
  let fxSlot = 'fx';
  const fxDef = () => (state[fxSlot].id ? Effects.byId(state[fxSlot].id) : null);
  const fxBoxMode = () => tab === 'fx' && fxCat !== 'scan' && (Effects.usesBoxes(state[fxSlot].id) || !!(fxDef() && fxDef().center));

  function syncFx() {
    const grid = $('fxGrid');
    if (!grid.childElementCount) {
      [{ id: '', name: 'Без эффекта' }, ...Effects.EFFECTS.filter((e) => !e.moved)].forEach((e, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'thumb';
        b.dataset.fx = e.id;
        const c = canvas(120, 150);
        const label = document.createElement('span');
        b.append(c, label);
        b.onclick = () => {
          if (state[fxSlot].id !== e.id) state[fxSlot] = { ...state[fxSlot], id: e.id, text: '', color: '', style: '', boxes: [] };
          selectedBox = -1;
          syncFx();
          syncGrab();
          update();
        };
        grid.append(b);
        /* превью рисуются по одной за кадр, чтобы вкладка открывалась сразу */
        setTimeout(() => {
          const x = c.getContext('2d');
          drawCover(x, sample, sample.width, sample.height, c.width, c.height);
          if (e.id) Effects.draw(x, { fx: { id: e.id, color: '', text: '', amount: 0.8, seed: 3, boxes: [] } }, c.width, c.height);
        }, 30 * i);
      });
    }
    /* разделы, как у фигур: сканер открывает свои настройки вместо сетки эффектов */
    const cats = $('fxCats');
    cats.replaceChildren();
    Effects.CATS.forEach((c) => chip(cats, t(c.name), c.id === fxCat, () => {
      fxCat = c.id;
      document.querySelector('.panels').scrollTop = 0;
      if (fxCat !== 'scan') unselect();
      else showHint('scan');
      syncFx();
      syncGrab();
      syncCtx();
      invalidate();
    }));
    const scan = fxCat === 'scan';
    $('scanPane').hidden = !scan;
    $('fxPane').hidden = scan;
    $('scanSub').hidden = !(scanOpen() && state.scan.on);
    if (scan) { syncScan(); return; }
    grid.querySelectorAll('[data-fx]').forEach((b) => {
      const e = Effects.byId(b.dataset.fx);
      b.hidden = !!e && fxCat !== 'all' && e.cat !== fxCat;
    });
    /* переключатель слоёв: у каждого свой эффект, второй ложится поверх первого */
    const slotsBar = $('fxSlots');
    slotsBar.replaceChildren();
    [['fx', 1], ['fx2', 2]].forEach(([key, n]) => {
      const e = Effects.byId(state[key].id);
      chip(slotsBar, `${t('Эффект')} ${n}${e ? ': ' + t(e.name) : ''}`, fxSlot === key, () => { fxSlot = key; selectedBox = -1; syncFx(); syncGrab(); invalidate(); });
    });
    grid.querySelectorAll('[data-fx]').forEach((b) => {
      b.classList.toggle('on', b.dataset.fx === (state[fxSlot].id || ''));
      const e = Effects.byId(b.dataset.fx);
      b.querySelector('span').textContent = t(e ? e.name : 'Без эффекта');
    });
    const def = fxDef();
    $('fxTools').hidden = !def;
    if (!def) return;
    const hint = FX_HINTS[def.id];
    $('fxTextField').hidden = !hint;
    $('fxTextHint').hidden = !hint;
    $('fxTextHint').textContent = hint ? t(hint) : '';
    const st = Effects.styleOf(def, state[fxSlot]);
    $('fxText').placeholder = (st && st.text) || def.text || '';
    $('fxText').value = state[fxSlot].text;
    $('fxAmount').value = state[fxSlot].amount;
    $('fxFontGroup').hidden = def.id === 'points';
    $('fxStyleGroup').hidden = !def.styles;
    const fxStyles = $('fxStyles');
    fxStyles.replaceChildren();
    (def.styles || []).forEach((st, i) => {
      const on = state[fxSlot].style ? state[fxSlot].style === st.id : i === 0;
      chip(fxStyles, t(st.name), on, () => { state[fxSlot] = { ...state[fxSlot], style: st.id, color: '', text: st.text ? '' : state[fxSlot].text }; syncFx(); update(); });
    });
    fontSelect($('fxFont'), t('Как в эффекте'), state[fxSlot].font);
    swatches($('fxSwatches'), FX_COLORS, state[fxSlot].color, (v) => { state[fxSlot] = { ...state[fxSlot], color: v }; syncFx(); update(); }, t('Как в эффекте'));
    $('fxBoxTools').hidden = !def.boxes;
    $('fxCenterHint').hidden = !def.center;
    $('fxBoxDelete').disabled = selectedBox < 0;
    $('fxBoxAuto').disabled = !state[fxSlot].boxes.length;
  }

  function bindFx() {
    let drag = null;
    /* в доли области фото, где лежит эффект */
    const toCard = (e) => {
      const box = card.getBoundingClientRect();
      const r = window.Render.fxRect(state, card.width, card.height);
      const px = ((e.clientX - box.left) / box.width) * card.width;
      const py = ((e.clientY - box.top) / box.height) * card.height;
      return [(px - r.x) / r.w, (py - r.y) / r.h, r.w / r.h];
    };
    card.addEventListener('pointerdown', (e) => {
      if (!fxBoxMode()) return;
      const [fx, fy, aspect] = toCard(e);
      if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return;
      if (fxDef().center) {
        state[fxSlot] = { ...state[fxSlot], center: { x: fx, y: fy } };
        drag = { id: e.pointerId, center: true };
        try { card.setPointerCapture(e.pointerId); } catch {}
        update();
        return;
      }
      /* первая правка превращает рамки «сами» в свои, чтобы их можно было двигать */
      if (!state[fxSlot].boxes.length) state[fxSlot].boxes = (Effects.lastBoxes[fxSlot] || []).map((b) => ({ ...b }));
      const list = state[fxSlot].boxes;
      const gx = 0.03;
      const gy = gx * aspect;
      let hit = -1;
      let mode = 'move';
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        if (Math.abs(fx - (b.x + b.w)) < gx && Math.abs(fy - (b.y + b.h)) < gy) { hit = i; mode = 'size'; break; }
        if (fx >= b.x && fx <= b.x + b.w && fy >= b.y && fy <= b.y + b.h) { hit = i; break; }
      }
      if (hit < 0) {
        const w = 0.16;
        const h = 0.16 * aspect * 1.2;
        list.push({ x: clamp(fx - w / 2, 0, 1 - w), y: clamp(fy - h / 2, 0, 1 - h), w, h });
        hit = list.length - 1;
      }
      selectedBox = hit;
      drag = { id: e.pointerId, mode, fx, fy, start: { ...list[hit] } };
      try { card.setPointerCapture(e.pointerId); } catch {}
      syncFx();
      update();
    });
    card.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id || !fxBoxMode()) return;
      const [fx, fy] = toCard(e);
      if (drag.center) {
        state[fxSlot] = { ...state[fxSlot], center: { x: clamp(fx, 0, 1), y: clamp(fy, 0, 1) } };
        update();
        return;
      }
      const m = state[fxSlot].boxes[selectedBox];
      if (!m) return;
      const dx = fx - drag.fx;
      const dy = fy - drag.fy;
      if (drag.mode === 'size') {
        m.w = clamp(drag.start.w + dx, 0.02, 1 - m.x);
        m.h = clamp(drag.start.h + dy, 0.02, 1 - m.y);
      } else {
        m.x = clamp(drag.start.x + dx, 0, 1 - m.w);
        m.y = clamp(drag.start.y + dy, 0, 1 - m.h);
      }
      update();
    });
    const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);

    $('fxShuffle').onclick = () => {
      state[fxSlot] = { ...state[fxSlot], seed: Math.floor(Math.random() * 1e6) };
      update();
    };
    $('fxBoxDelete').onclick = () => {
      if (selectedBox < 0) return;
      state[fxSlot].boxes.splice(selectedBox, 1);
      selectedBox = -1;
      syncFx();
      update();
    };
    $('fxBoxAuto').onclick = () => {
      state[fxSlot] = { ...state[fxSlot], boxes: [] };
      selectedBox = -1;
      syncFx();
      update();
    };
    $('fxFind').onclick = () => findThings();
    $('fxFont').onchange = (e) => { state[fxSlot] = { ...state[fxSlot], font: e.target.value }; syncFx(); update(); };
  }

  /* Ищем людей и вещи на чистой карточке, без эффекта, сканера и стикеров сверху. */
  async function findThings(btnId = 'fxFind', put) {
    const btn = $(btnId);
    btn.disabled = true;
    btn.textContent = t('Ищу…');
    try {
      await loadDetector();
      const c = canvas(card.width, card.height);
      renderCard(c.getContext('2d'), { ...state, fx: { ...state.fx, id: '' }, fx2: { ...state.fx2, id: '' }, scan: { ...state.scan, on: false }, layers: [] }, slots, assets);
      const found = await detector.detect(c, 40, 0.3);
      const r = window.Render.fxRect(state, c.width, c.height);
      if (!found.length) return toast(t('Ничего не нашлось. Поставь рамки пальцем.'));
      const name = (k) => k.charAt(0).toUpperCase() + k.slice(1);
      const boxes = found.map(({ bbox: [x, y, w, h], class: k, score }) => ({ x: (x - r.x) / r.w, y: (y - r.y) / r.h, w: w / r.w, h: h / r.h, label: name(k), score }))
        .filter((b) => b.x < 1 && b.y < 1 && b.x + b.w > 0 && b.y + b.h > 0);
      if (put) put(boxes);
      else {
        state[fxSlot] = { ...state[fxSlot], boxes };
        selectedBox = -1;
        syncFx();
      }
      update();
      toast(`${t('Нашлось')}: ${found.length}`);
    } catch (err) {
      console.warn('find things', err);
      toast(t('Не получилось найти. При первом запуске нужен интернет.'));
    } finally {
      btn.disabled = false;
      btn.textContent = t('Найти людей и вещи');
    }
  }

  /* ---------- сканер: рамки, подписи, линза, лупа, связи, интерфейс камеры ---------- */
  let selectedScan = -1;
  let selectedIcon = -1;
  /* выбрано досье: у него своё меню на фото */
  let dossierPicked = false;
  /* проигрывание анимации сканера в превью: время старта или null */
  let scanPlay = null;
  /* свои наборы сканера, лежат на устройстве */
  let userPresets = [];
  /* раздел вкладки «Эффекты»: все, сканер, буквы, графики… */
  let fxCat = 'all';
  const scanOpen = () => tab === 'fx' && fxCat === 'scan';
  const scanMode = () => scanOpen() && !!state.scan.on;
  let scanSub = 'boxes';
  const setScan = (patch) => { state.scan = { ...state.scan, ...patch }; syncScan(); update(); };
  const presetLookup = (id) => userPresets.find((p) => p.id === id) || Scanner.presetById(id);
  const unselect = () => { selectedScan = -1; selectedIcon = -1; dossierPicked = false; ctxEdit = false; };

  /* Набор меняет только вид: свои рамки, сид и живое сканирование остаются. */
  function applyPreset(p) {
    unselect();
    const keep = { boxes: state.scan.boxes, seed: state.scan.seed, anim: state.scan.anim };
    /* свои значки остаются, а значки прошлого набора уходят вместе с ним */
    const was = presetLookup(state.scan.preset);
    if (JSON.stringify(state.scan.icons) !== JSON.stringify((was && was.set.icons) || [])) keep.icons = state.scan.icons;
    /* копия набора: правки досье и значков не должны менять сам набор */
    state.scan = { ...Scanner.defaults(), ...JSON.parse(JSON.stringify(p.set)), ...keep, on: true, preset: p.id };
    syncScan();
    syncGrab();
    update();
  }

  /* Кубик: случайное сочетание деталей. Свои рамки, значки и тексты не трогаем. */
  function diceScan() {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const sc = state.scan;
    const hud = Scanner.HUD.map(([v]) => v).filter(() => Math.random() < 0.3);
    state.scan = {
      ...sc,
      on: true,
      preset: '',
      color: pick(FX_COLORS),
      shape: pick(Scanner.SHAPES)[0],
      label: pick(Scanner.LABELS.filter(([v]) => v !== 'none'))[0],
      text: pick(Scanner.PACKS)[2],
      lens: Math.random() < 0.5 ? 'none' : pick(Scanner.LENSES)[0],
      lensOut: Math.random() < 0.35,
      zoom: Math.floor(Math.random() * 3),
      zoomLook: pick(Scanner.LOOKS)[0],
      zoomLine: pick(Scanner.ZOOM_LINES)[0],
      links: pick(Scanner.LINKS)[0],
      hud,
      glow: Math.random() < 0.4,
      line: Math.round((0.6 + Math.random() * 1.4) * 20) / 20,
      seed: Math.floor(Math.random() * 1e6),
    };
    unselect();
    syncScan();
    syncGrab();
    update();
  }

  async function saveUserPreset() {
    const { boxes, seed, on, preset, ...set } = JSON.parse(JSON.stringify(state.scan));
    const n = userPresets.length + 1;
    const p = { id: `u${Date.now()}`, name: `${t('Мой набор')} ${n}`, set };
    userPresets = [p, ...userPresets];
    state.scan = { ...state.scan, preset: p.id };
    await Store.set('scanPresets', userPresets).catch(() => {});
    buildScanGrid();
    syncScan();
    toast(t('Набор сохранён. Он первый в ряду.'));
  }
  async function deleteUserPreset(id) {
    userPresets = userPresets.filter((p) => p.id !== id);
    if (state.scan.preset === id) state.scan = { ...state.scan, preset: '' };
    await Store.set('scanPresets', userPresets).catch(() => {});
    buildScanGrid();
    syncScan();
  }

  /* картинка-кнопка для действий в ряду наборов: плюс, кубик */
  function actionThumb(c, mark) {
    const x = c.getContext('2d');
    x.fillStyle = '#16181d';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#9fb3d9';
    x.font = '600 54px "Golos Text", system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(mark, c.width / 2, c.height / 2 + 2);
  }

  function buildScanGrid() {
    const grid = $('scanGrid');
    grid.replaceChildren();
    const items = [
      { id: '', name: 'Выключен' },
      { id: '@save', name: 'Сохранить свой', mark: '+' },
      { id: '@dice', name: 'Случайно', mark: '⚄' },
      ...userPresets.map((p) => ({ ...p, mine: true })),
      ...Scanner.PRESETS,
    ];
    items.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb';
      b.dataset.scan = p.id;
      b.dataset.name = p.name;
      if (p.mine) b.dataset.mine = '1';
      const c = canvas(120, 150);
      b.append(c, document.createElement('span'));
      b.onclick = () => {
        if (p.id === '') { unselect(); setScan({ on: false, preset: '' }); syncGrab(); return; }
        if (p.id === '@save') return saveUserPreset();
        if (p.id === '@dice') return diceScan();
        applyPreset(p);
      };
      grid.append(b);
      if (p.mark) { actionThumb(c, p.mark); return; }
      /* превью рисуются по одной, чтобы вкладка открывалась сразу */
      setTimeout(() => {
        const x = c.getContext('2d');
        drawCover(x, sample, sample.width, sample.height, c.width, c.height);
        if (p.id) Scanner.draw(x, { scan: { ...Scanner.defaults(), ...p.set, on: true, seed: 4 }, note: state.note }, c.width, c.height);
      }, 30 * i);
    });
  }

  /* Один ползунок на несколько величин: выбираешь величину, ползунок один. Двойное нажатие сбрасывает. */
  const sliderPick = {};
  function oneSlider(el, items) {
    if (!items.length) { el.replaceChildren(); return; }
    const cur = items.find((it) => it.id === sliderPick[el.id]) || items[0];
    sliderPick[el.id] = cur.id;
    el.replaceChildren();
    const row = document.createElement('div');
    row.className = 'chips';
    items.forEach((it) => chip(row, t(it.label), it === cur, () => { sliderPick[el.id] = it.id; oneSlider(el, items); }));
    const line = document.createElement('div');
    line.className = 'line';
    const r = document.createElement('input');
    r.type = 'range';
    Object.assign(r, { min: cur.min, max: cur.max, step: cur.step });
    r.value = cur.get();
    r.setAttribute('aria-label', t(cur.label));
    const val = document.createElement('span');
    val.className = 'val';
    const show = () => { val.textContent = `${Math.round(Number(r.value) * 100)}%`; };
    show();
    r.oninput = () => { cur.set(Number(r.value)); show(); update(); };
    r.ondblclick = () => { cur.set(cur.def); r.value = cur.def; show(); update(); };
    line.append(r, val);
    el.append(row, line);
  }

  function syncScan() {
    const sc = state.scan;
    const grid = $('scanGrid');
    if (!grid.childElementCount || grid.dataset.lang !== I18n.lang) { buildScanGrid(); grid.dataset.lang = I18n.lang; }
    grid.querySelectorAll('[data-scan]').forEach((b) => {
      const id = b.dataset.scan;
      b.classList.toggle('on', sc.on ? !!id && id === sc.preset : id === '');
      b.querySelector('span').textContent = b.dataset.mine ? b.dataset.name : t(b.dataset.name);
    });
    $('scanMineTools').hidden = !(sc.on && userPresets.some((p) => p.id === sc.preset));
    $('scanTools').hidden = !sc.on;
    $('scanSub').hidden = !(scanOpen() && sc.on);
    if (!sc.on) { syncCtx(); return; }

    const choose = (id, items, key) => {
      const el = $(id);
      el.replaceChildren();
      items.forEach(([v, name]) => chip(el, t(name), sc[key] === v, () => setScan({ [key]: v })));
    };
    markSeg($('scanSub'), scanSub);
    document.querySelectorAll('[data-sub]').forEach((el) => { el.hidden = el.dataset.sub !== scanSub; });

    swatches($('scanSwatches'), FX_COLORS, sc.color, (v) => setScan({ color: v }));
    choose('scanShapes', Scanner.SHAPES, 'shape');
    choose('scanMotion', Scanner.MOTIONS, 'motion');
    $('scanMotionHint').textContent = t({
      still: 'Рамки стоят на месте.',
      track: 'Рамка запоминает, что у неё внутри, и едет за этим по кадрам. Поставь рамку на человека или вещь.',
      flash: 'Рамки вспыхивают и гаснут в местах с деталями. Свои рамки мигают на своих местах.',
      swarm: 'Много тонких рамок перестраиваются несколько раз в секунду.',
    }[sc.motion || 'still']);
    /* рамки либо ставятся сами (тогда работает «Сколько рамок»), либо свои */
    const ownCount = sc.boxes.length;
    const countWorks = sc.motion === 'swarm' || !ownCount;
    oneSlider($('scanSliders'), [
      ...(countWorks ? [{ id: 'amount', label: 'Сколько рамок', min: 0.2, max: 2.5, step: 0.05, def: 1, get: () => state.scan.amount, set: (v) => { state.scan.amount = v; } }] : []),
      { id: 'line', label: 'Толщина линий', min: 0.4, max: 3, step: 0.05, def: 1, get: () => state.scan.line, set: (v) => { state.scan.line = v; } },
    ]);
    $('scanOwn').hidden = countWorks;
    $('scanOwnText').textContent = `${t('Рамки расставлены вручную')}: ${ownCount}. ${t('Чтобы снова менять их число ползунком, верни автоматические.')}`;
    choose('scanLabels', Scanner.LABELS, 'label');
    choose('scanLenses', Scanner.LENSES, 'lens');
    choose('scanLooks', Scanner.LOOKS, 'zoomLook');
    choose('scanZoomLines', Scanner.ZOOM_LINES, 'zoomLine');
    choose('scanLinks', Scanner.LINKS, 'links');
    choose('scanZoom', [[0, 'Нет'], [1, '1'], [2, '2'], [3, '3']], 'zoom');
    $('scanZoomTools').hidden = !sc.zoom;

    const vars = $('scanVars');
    vars.replaceChildren();
    Scanner.VARS.forEach((v) => chip(vars, v, false, () => setScan({ text: `${sc.text}${v}` })));
    fontSelect($('scanFont'), t('Моноширинный'), sc.font);

    const packs = $('scanPacks');
    packs.replaceChildren();
    const mood = state.note.mood;
    chip(packs, `${t('Под настроение')}${mood ? ': ' + mood : ''}`, false, () => setScan({ text: Scanner.moodPack(mood) }));
    Scanner.PACKS.forEach(([, name, text]) => chip(packs, t(name), sc.text === text, () => setScan({ text })));

    const dz = sc.dossier;
    $('scanDossierTools').hidden = !dz.on;
    const dStyles = $('scanDossierStyles');
    dStyles.replaceChildren();
    [['plates', 'Плашки'], ['card', 'Карточка'], ['terminal', 'Терминал']].forEach(([v, name]) => chip(dStyles, t(name), dz.style === v, () => setScan({ dossier: { ...dz, style: v } })));
    $('scanDossierHome').disabled = dz.x == null;

    const icons = $('scanIcons');
    if (!icons.childElementCount || icons.dataset.color !== sc.color || icons.dataset.lang !== I18n.lang) {
      icons.replaceChildren();
      Scanner.ICONS.forEach(([k, name]) => {
        const b = chip(icons, '', false, () => {
          /* новый значок встаёт чуть в стороне от центра, чтобы не лечь на прошлый */
          const n = state.scan.icons.length;
          state.scan.icons = [...state.scan.icons, { k, x: 0.3 + ((n * 0.17) % 0.4), y: 0.3 + ((n * 0.13) % 0.4), s: 1 }];
          unselect();
          selectedIcon = state.scan.icons.length - 1;
          syncScan();
          update();
        });
        b.title = t(name);
        b.setAttribute('aria-label', t(name));
        const c = canvas(68, 68);
        Scanner.drawIcon(c.getContext('2d'), k, k === 'cursor' ? 20 : 34, k === 'cursor' ? 10 : 34, 46, sc.color);
        b.append(c);
      });
      icons.dataset.color = sc.color;
      icons.dataset.lang = I18n.lang;
    }
    markSeg($('scanLensWhere'), sc.lensOut ? 'out' : 'in');
    $('scanLensWhere').hidden = !sc.lens || sc.lens === 'none';

    const hud = $('scanHud');
    hud.replaceChildren();
    Scanner.HUD.forEach(([v, name]) => chip(hud, t(name), sc.hud.includes(v), () => {
      setScan({ hud: sc.hud.includes(v) ? sc.hud.filter((x) => x !== v) : [...sc.hud, v] });
    }));
    $('scanCamField').hidden = !sc.hud.includes('cam');
    $('scanStatusField').hidden = !sc.hud.includes('status');

    document.querySelectorAll('[data-bind^="scan."]').forEach((el) => {
      const v = getPath(el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (document.activeElement !== el) el.value = v;
    });
    syncCtx();
  }

  /* ---------- меню у выбранного прямо на фото, как в Canva ---------- */
  let ctxEdit = false;
  let ctxKey = '';
  function ctxTarget() {
    if (!scanMode()) return null;
    const sc = state.scan;
    if (selectedIcon >= 0 && sc.icons[selectedIcon]) return { kind: 'icon', i: selectedIcon, box: (Scanner.lastIcons || [])[selectedIcon] };
    if (dossierPicked && sc.dossier.on) return { kind: 'dossier', box: Scanner.lastDossier };
    if (selectedScan >= 0 && sc.boxes[selectedScan] && !['flash', 'swarm'].includes(sc.motion)) {
      const moved = Scanner.lastMotion === 'track' && Scanner.lastBoxes.length === sc.boxes.length;
      return { kind: 'box', i: selectedScan, box: (moved ? Scanner.lastBoxes : sc.boxes)[selectedScan] };
    }
    return null;
  }

  function syncCtx() {
    const menu = $('ctxMenu');
    const tg = ctxTarget();
    const key = tg ? `${tg.kind}:${tg.i}:${ctxEdit}:${tg.kind === 'box' ? !!state.scan.boxes[tg.i].zoom : ''}:${I18n.lang}` : '';
    if (key === ctxKey) { placeCtx(); return; }
    ctxKey = key;
    menu.replaceChildren();
    menu.hidden = !tg;
    if (!tg) return;
    const add = (label, run, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (cls) b.className = cls;
      b.onclick = (e) => { e.stopPropagation(); run(); };
      menu.append(b);
      return b;
    };
    const sc = state.scan;
    if (tg.kind === 'box' && ctxEdit) {
      /* свой текст у этой рамки вместо общего шаблона */
      const b = sc.boxes[tg.i];
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 80;
      input.value = b.text || '';
      input.placeholder = t('Свой текст этой рамки');
      input.oninput = () => { b.text = input.value; update(); };
      input.onkeydown = (e) => { if (e.key === 'Enter') { ctxEdit = false; syncCtx(); } };
      menu.append(input);
      add('✓', () => { ctxEdit = false; syncCtx(); });
      placeCtx();
      setTimeout(() => input.focus(), 0);
      return;
    }
    if (tg.kind === 'box') {
      const b = sc.boxes[tg.i];
      add(t('Текст'), () => { ctxEdit = true; syncCtx(); });
      add(b.zoom ? t('Без лупы') : t('Лупа'), () => {
        b.zoom = !b.zoom;
        if (!b.zoom) { delete b.zx; delete b.zy; }
        const flagged = sc.boxes.filter((x) => x.zoom).length;
        setScan({ zoom: flagged ? Math.min(3, Math.max(flagged, sc.zoom)) : sc.zoom });
      });
      add(t('Копия'), () => {
        const c = { ...b, x: clamp(b.x + 0.04, 0, 1 - b.w), y: clamp(b.y + 0.04, 0, 1 - b.h) };
        delete c.zx; delete c.zy;
        sc.boxes.push(c);
        selectedScan = sc.boxes.length - 1;
        syncScan();
        update();
      });
      add(t('Удалить'), () => { sc.boxes.splice(tg.i, 1); unselect(); syncScan(); update(); }, 'danger');
    } else if (tg.kind === 'icon') {
      const ic = sc.icons[tg.i];
      const size = (k) => { ic.s = clamp(Math.round(((ic.s || 1) * k) * 100) / 100, 0.3, 3.5); update(); };
      add('−', () => size(1 / 1.2)).setAttribute('aria-label', t('Меньше'));
      add('+', () => size(1.2)).setAttribute('aria-label', t('Больше'));
      add(t('Копия'), () => {
        sc.icons = [...sc.icons, { ...ic, x: clamp(ic.x + 0.05, 0, 1), y: clamp(ic.y + 0.05, 0, 1) }];
        selectedIcon = sc.icons.length - 1;
        syncScan();
        update();
      });
      add(t('Удалить'), () => { sc.icons = sc.icons.filter((_, i) => i !== tg.i); unselect(); syncScan(); update(); }, 'danger');
    } else {
      add(t('Изменить'), () => { scanSub = 'dossier'; syncScan(); });
      if (sc.dossier.x != null) add(t('На место'), () => setScan({ dossier: { ...sc.dossier, x: null, y: null } }));
      add(t('Скрыть'), () => { unselect(); setScan({ dossier: { ...sc.dossier, on: false } }); }, 'danger');
    }
    placeCtx();
  }

  /* меню встаёт над выбранным, а если места нет, то под ним */
  function placeCtx() {
    const menu = $('ctxMenu');
    if (menu.hidden) return;
    const tg = ctxTarget();
    if (!tg || !tg.box) { menu.style.visibility = 'hidden'; return; }
    menu.style.visibility = '';
    const stage = $('stage').getBoundingClientRect();
    const cb = card.getBoundingClientRect();
    const r = window.Render.fxRect(state, card.width, card.height);
    const k = cb.width / card.width;
    const x = cb.left - stage.left + (r.x + tg.box.x * r.w) * k;
    const y = cb.top - stage.top + (r.y + tg.box.y * r.h) * k;
    const w = tg.box.w * r.w * k;
    const h = tg.box.h * r.h * k;
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const left = clamp(x + w / 2 - mw / 2, 6, stage.width - mw - 6);
    const top = y - mh - 10 >= 4 ? y - mh - 10 : Math.min(stage.height - mh - 4, y + h + 10);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function bindScan() {
    let drag = null;
    /* в доли области фото, где лежит сканер */
    const toRect = (e) => {
      const box = card.getBoundingClientRect();
      const r = window.Render.fxRect(state, card.width, card.height);
      const px = ((e.clientX - box.left) / box.width) * card.width;
      const py = ((e.clientY - box.top) / box.height) * card.height;
      return [(px - r.x) / r.w, (py - r.y) / r.h, r.w / r.h];
    };
    /* первая правка превращает рамки «сами» в свои, чтобы их можно было двигать */
    const own = () => {
      if (!state.scan.boxes.length) state.scan.boxes = (Scanner.lastBoxes || []).map((b) => ({ ...b }));
      return state.scan.boxes;
    };
    const capture = (e) => { try { card.setPointerCapture(e.pointerId); } catch {} };
    card.addEventListener('pointerdown', (e) => {
      if (!scanMode()) return;
      const [fx, fy, aspect] = toRect(e);
      if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return;
      ctxEdit = false;
      const inside = (s) => s && fx >= s.x && fx <= s.x + s.w && fy >= s.y && fy <= s.y + s.h;
      /* сверху вниз: значки, досье, увеличенные куски, рамки */
      const iconHit = (Scanner.lastIcons || []).map((b, i) => [b, i]).reverse().find(([b]) => inside(b));
      if (iconHit) {
        const ic = state.scan.icons[iconHit[1]];
        unselect();
        selectedIcon = iconHit[1];
        drag = { id: e.pointerId, icon: true, fx, fy, start: { x: ic.x, y: ic.y } };
        capture(e);
        syncCtx();
        invalidate();
        return;
      }
      if (state.scan.dossier.on && inside(Scanner.lastDossier)) {
        unselect();
        dossierPicked = true;
        drag = { id: e.pointerId, dossier: true, fx, fy, start: { ...Scanner.lastDossier } };
        capture(e);
        syncCtx();
        invalidate();
        return;
      }
      const motion = state.scan.motion || 'still';
      if (motion === 'flash' || motion === 'swarm') { unselect(); syncCtx(); invalidate(); return; }
      /* рамки уехали за объектом: правим их там, где они сейчас, и следим дальше оттуда */
      if (motion === 'track' && state.scan.boxes.length && Scanner.lastBoxes.length === state.scan.boxes.length) {
        state.scan.boxes = Scanner.lastBoxes.map((b) => ({ ...b }));
      }
      const inset = [...(Scanner.lastInsets || [])].reverse().find(inside);
      /* новая рамка ставится только на вкладке рамок, на других пустое место снимает выбор */
      const hitsBox = (Scanner.lastBoxes || []).some(inside);
      if (!inset && !hitsBox && scanSub !== 'boxes') { unselect(); syncCtx(); invalidate(); return; }
      const list = own();
      unselect();
      if (inset && list[inset.i]) {
        selectedScan = inset.i;
        drag = { id: e.pointerId, inset: true, fx, fy, start: { ...inset } };
      } else {
        const gx = 0.03;
        const gy = gx * aspect;
        let hit = -1;
        let mode = 'move';
        for (let i = list.length - 1; i >= 0; i--) {
          const b = list[i];
          if (Math.abs(fx - (b.x + b.w)) < gx && Math.abs(fy - (b.y + b.h)) < gy) { hit = i; mode = 'size'; break; }
          if (fx >= b.x && fx <= b.x + b.w && fy >= b.y && fy <= b.y + b.h) { hit = i; break; }
        }
        if (hit < 0) {
          const w = 0.16;
          const h = 0.16 * aspect * 1.2;
          list.push({ x: clamp(fx - w / 2, 0, 1 - w), y: clamp(fy - h / 2, 0, 1 - h), w, h });
          hit = list.length - 1;
        }
        selectedScan = hit;
        drag = { id: e.pointerId, mode, fx, fy, start: { ...list[hit] } };
      }
      capture(e);
      syncScan();
      update();
    });
    card.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id || !scanMode()) return;
      const [fx, fy] = toRect(e);
      if (drag.icon) {
        const ic = state.scan.icons[selectedIcon];
        if (!ic) return;
        ic.x = clamp(drag.start.x + fx - drag.fx, 0, 1);
        ic.y = clamp(drag.start.y + fy - drag.fy, 0, 1);
        update();
        return;
      }
      if (drag.dossier) {
        const dz = drag.start;
        state.scan.dossier = { ...state.scan.dossier, x: clamp(dz.x + fx - drag.fx, 0, 1 - dz.w), y: clamp(dz.y + fy - drag.fy, 0, 1 - dz.h) };
        update();
        return;
      }
      const m = state.scan.boxes[selectedScan];
      if (!m) return;
      const dx = fx - drag.fx;
      const dy = fy - drag.fy;
      if (drag.inset) {
        m.zx = clamp(drag.start.x + dx, 0, 1 - drag.start.w);
        m.zy = clamp(drag.start.y + dy, 0, 1 - drag.start.h);
      } else if (drag.mode === 'size') {
        m.w = clamp(drag.start.w + dx, 0.02, 1 - m.x);
        m.h = clamp(drag.start.h + dy, 0.02, 1 - m.y);
      } else {
        m.x = clamp(drag.start.x + dx, 0, 1 - m.w);
        m.y = clamp(drag.start.y + dy, 0, 1 - m.h);
      }
      update();
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.dossier) syncScan();
      drag = null;
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);

    $('scanShuffle').onclick = () => {
      /* новые случайные числа, а у лупы ещё и новое место */
      state.scan.boxes.forEach((b) => { delete b.zx; delete b.zy; });
      setScan({ seed: Math.floor(Math.random() * 1e6) });
    };
    $('scanBoxAuto').onclick = () => { unselect(); setScan({ boxes: [] }); };
    $('scanFind').onclick = () => findThings('scanFind', (boxes) => { unselect(); setScan({ boxes }); });
    $('scanFont').onchange = (e) => setScan({ font: e.target.value });
    $('scanDossierHome').onclick = () => setScan({ dossier: { ...state.scan.dossier, x: null, y: null } });
    $('scanMineDelete').onclick = () => deleteUserPreset(state.scan.preset);
    $('scanPlay').onclick = () => {
      scanPlay = performance.now();
      invalidate();
    };
    $('scanSub').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      scanSub = b.dataset.v;
      document.querySelector('.panels').scrollTop = $('scanTools').offsetTop - 8;
      syncScan();
    });
    $('scanLensWhere').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) setScan({ lensOut: b.dataset.v === 'out' });
    });
  }

  /* ---------- стикеры и текст поверх карточки ---------- */
  const EMOJIS = ['🌸', '🌷', '🌹', '🌼', '🌻', '💐', '🍀', '🌿', '🍒', '🍓', '🍰', '🧁', '🍩', '☕', '🎀', '💌', '💖', '💗', '💕', '💘', '🤍', '🦋', '🐚', '⭐', '🌟', '✨', '🌙', '☁️', '🌈', '🔮', '💿', '📷', '📼', '🎧', '🔒', '🗝️', '🕯️', '🪞', '🧸', '🐱', '🐰', '🫧', '💎', '👑', '🍓', '🎞️', '📌', '✂️'].filter((e, i, a) => a.indexOf(e) === i);
  const LAYER_COLORS = ['#111111', '#ffffff', '#f472b6', '#d64545', '#e8913a', '#ffe27a', '#86c96b', '#6c9fe0', '#1f3a8a', '#a78bfa'];
  let selectedLayer = -1;
  /* выбор нескольких стикеров сразу: номера слоёв */
  let multiMode = false;
  let multi = new Set();
  let stickerCount = 0;
  let stickerSet = 'emoji';
  const layersMode = () => tab === 'layers';
  const layerAt = (i) => state.layers[i];

  function addLayer(layer) {
    state.layers = [...state.layers, { x: 0.5, y: 0.45, rot: 0, ...layer }];
    selectedLayer = state.layers.length - 1;
    multiMode = false;
    multi = new Set();
    syncLayerTools();
    update();
  }

  /* своя картинка становится стикером: держим её в памяти, а в черновике сохраняем файл */
  async function addStickerFiles(files) {
    for (const file of [...files]) {
      try {
        const { el } = await imageSrc(file);
        const id = `s${Date.now()}_${stickerCount++}`;
        assets.stickers[id] = el;
        assets.stickerBlobs[id] = file;
        addLayer({ type: 'sticker', img: id, size: 0.4 });
      } catch {
        toast(t('Эта картинка не открывается.'));
      }
    }
    syncStickers();
  }

  function syncStickers() {
    const grid = $('stickerGrid');
    grid.replaceChildren();
    /* в наборе только исходные картинки; копии без фона (id на «c») живут только на карточке */
    Object.entries(assets.stickers).filter(([id]) => !id.startsWith('c')).forEach(([id, el]) => {
      const b = document.createElement('button');
      b.type = 'button';
      const img = document.createElement('img');
      img.src = el.src;
      img.alt = '';
      b.append(img);
      b.onclick = () => addLayer({ type: 'sticker', img: id, size: 0.4 });
      grid.append(b);
    });
    /* вкладки набора: эмодзи или готовые рисованные значки */
    const tabs = $('stickerTabs');
    tabs.replaceChildren();
    [['emoji', 'Эмодзи'], ['ready', 'Готовые']].forEach(([id, name]) => chip(tabs, t(name), stickerSet === id, () => { stickerSet = id; syncStickers(); }));
    if (stickerSet === 'ready') {
      Render.VECTORS.forEach((v) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', t(v.name));
        b.title = t(v.name);
        const c = canvas(80, 80);
        Render.drawVector(c.getContext('2d'), v.id, 40, 40, 64, v.color);
        b.append(c);
        b.onclick = () => addLayer({ type: 'sticker', vec: v.id, color: v.color, size: 0.4 });
        grid.append(b);
      });
      return;
    }
    EMOJIS.forEach((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e;
      b.setAttribute('aria-label', `${t('Добавить')} ${e}`);
      b.onclick = () => addLayer({ type: 'sticker', emoji: e, size: 0.22, rot: (Math.random() - 0.5) * 0.4 });
      grid.append(b);
    });
  }

  /* ---------- убрать фон у картинки-стикера ---------- */
  /* Цвет фона берём самый частый по краю картинки. «Фон вокруг» заливает от краёв всё похожее на него,
     «Этот цвет везде» убирает похожие пиксели по всей картинке. Край выреза мягкий: почти похожие
     пиксели становятся полупрозрачными, чтобы не было белой каймы. */
  function cutBackground(img, tol, mode, edgePx = 1) {
    const k = Math.min(1, 2000 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const c = canvas((img.naturalWidth || img.width) * k, (img.naturalHeight || img.height) * k);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, c.width, c.height);
    const { width: w, height: h } = c;
    const im = x.getImageData(0, 0, w, h);
    const d = im.data;
    /* самый частый цвет по краю, с округлением, чтобы шум JPEG не мешал */
    const counts = new Map();
    const edge = (i) => {
      if (d[i + 3] < 20) return;
      const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      counts.set(key, (counts.get(key) || 0) + 1);
    };
    for (let px = 0; px < w; px++) { edge(px * 4); edge(((h - 1) * w + px) * 4); }
    for (let py = 0; py < h; py++) { edge(py * w * 4); edge((py * w + w - 1) * 4); }
    let best = -1;
    let top = 0;
    counts.forEach((n, key) => { if (n > top) { top = n; best = key; } });
    if (best < 0) return null;
    /* точный средний цвет среди краевых пикселей этой группы */
    let sr = 0; let sg = 0; let sb = 0; let sn = 0;
    const add = (i) => {
      const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      if (key === best && d[i + 3] >= 20) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; sn++; }
    };
    for (let px = 0; px < w; px++) { add(px * 4); add(((h - 1) * w + px) * 4); }
    for (let py = 0; py < h; py++) { add(py * w * 4); add((py * w + w - 1) * 4); }
    const br = sr / sn; const bg = sg / sn; const bb = sb / sn;
    const soft = tol * 0.5;
    const dist = (i) => Math.hypot(d[i] - br, d[i + 1] - bg, d[i + 2] - bb);
    /* сколько непрозрачности оставить пикселю: 0 у фона, 1 у рисунка, плавно между */
    const keep = (i) => {
      if (d[i + 3] < 20) return 0;
      const v = dist(i);
      return v <= tol ? 0 : v >= tol + soft ? 1 : (v - tol) / soft;
    };
    /* маска непрозрачности 0..1 для каждого пикселя: сначала считаем её, потом чистим края */
    const n = w * h;
    const alpha = new Float32Array(n).fill(1);
    if (mode === 'all') {
      for (let p = 0; p < n; p++) alpha[p] = keep(p * 4);
    } else {
      const seen = new Uint8Array(n);
      const stack = [];
      const push = (p) => { if (!seen[p]) { seen[p] = 1; stack.push(p); } };
      for (let px = 0; px < w; px++) { push(px); push((h - 1) * w + px); }
      for (let py = 0; py < h; py++) { push(py * w); push(py * w + w - 1); }
      while (stack.length) {
        const p = stack.pop();
        const a = keep(p * 4);
        if (a >= 1) continue;
        alpha[p] = a;
        /* дальше растекаемся только от настоящего фона, полупрозрачная кайма не ведёт внутрь рисунка */
        if (a > 0) continue;
        const px = p % w;
        if (px > 0) push(p - 1);
        if (px < w - 1) push(p + 1);
        if (p >= w) push(p - w);
        if (p < w * (h - 1)) push(p + w);
      }
    }

    /* 1. Цвет каймы: в полупрозрачном пикселе вычитаем подмешанный фон, иначе остаётся светлый ореол. */
    for (let p = 0; p < n; p++) {
      const a = alpha[p];
      if (a <= 0.02 || a >= 1) continue;
      const i = p * 4;
      d[i] = Math.max(0, Math.min(255, (d[i] - (1 - a) * br) / a));
      d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] - (1 - a) * bg) / a));
      d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] - (1 - a) * bb) / a));
    }
    /* 2. Подрезаем край на edgePx пикселей: убирает светлую полоску от сжатия JPEG вокруг рисунка. */
    let mask = alpha;
    for (let k = 0; k < edgePx; k++) {
      const next = new Float32Array(n);
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const p = py * w + px;
          let v = mask[p];
          if (px > 0) v = Math.min(v, mask[p - 1]);
          if (px < w - 1) v = Math.min(v, mask[p + 1]);
          if (py > 0) v = Math.min(v, mask[p - w]);
          if (py < h - 1) v = Math.min(v, mask[p + w]);
          next[p] = v;
        }
      }
      mask = next;
    }
    /* 3. Сглаживаем край маски по соседям 3×3: лесенка становится плавной линией. */
    const smooth = new Float32Array(n);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        let sum = 0;
        let cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = py + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = px + dx;
            if (xx < 0 || xx >= w) continue;
            sum += mask[yy * w + xx];
            cnt++;
          }
        }
        smooth[py * w + px] = sum / cnt;
      }
    }
    for (let p = 0; p < n; p++) d[p * 4 + 3] = Math.round(d[p * 4 + 3] * smooth[p]);
    x.putImageData(im, 0, 0);
    return c;
  }

  let cutTimer = 0;
  /* делает копию картинки без фона и ставит её на выбранный стикер; исходник остаётся в l.src */
  function applyCut(tol, mode, edge) {
    const l = layerAt(selectedLayer);
    if (!l || !l.img) return;
    const srcId = l.cut ? l.cut.src : l.img;
    const orig = assets.stickers[srcId];
    if (!orig) return;
    const out = cutBackground(orig, tol, mode, edge);
    if (!out) return toast(t('Не получилось найти фон у этой картинки.'));
    const index = selectedLayer;
    out.toBlob(async (blob) => {
      const { el } = await imageSrc(blob);
      const id = `c${Date.now()}_${stickerCount++}`;
      assets.stickers[id] = el;
      assets.stickerBlobs[id] = blob;
      /* прежние копии не удаляем: к ним может вернуть «Назад»; в черновик попадают только нужные */
      state.layers = state.layers.map((x, i) => (i === index ? { ...x, img: id, cut: { src: srcId, tol, mode, edge } } : x));
      syncLayerTools();
      update();
    }, 'image/png');
  }
  function bindCut() {
    $('bgCut').onclick = () => applyCut(40, 'edge', 1);
    $('bgRestore').onclick = () => {
      const l = layerAt(selectedLayer);
      if (!l || !l.cut) return;
      editLayer({ img: l.cut.src, cut: null });
    };
    $('bgTol').oninput = (e) => {
      const l = layerAt(selectedLayer);
      if (!l || !l.cut) return;
      clearTimeout(cutTimer);
      const tol = Number(e.target.value);
      cutTimer = setTimeout(() => applyCut(tol, l.cut.mode, l.cut.edge ?? 1), 120);
    };
    $('bgEdge').oninput = (e) => {
      const l = layerAt(selectedLayer);
      if (!l || !l.cut) return;
      clearTimeout(cutTimer);
      const edge = Number(e.target.value);
      cutTimer = setTimeout(() => applyCut(l.cut.tol, l.cut.mode, edge), 120);
    };
    $('bgMode').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      const l = layerAt(selectedLayer);
      if (b && l && l.cut) applyCut(l.cut.tol, b.dataset.v, l.cut.edge ?? 1);
    });
  }

  function syncMulti() {
    multi = new Set([...multi].filter((i) => i < state.layers.length));
    $('multiToggle').textContent = t(multiMode ? 'Готово с выбором' : 'Выбрать несколько');
    $('multiToggle').classList.toggle('primary', multiMode);
    $('multiTools').hidden = !multiMode;
    $('multiCount').textContent = `${t('Выбрано')}: ${multi.size}`;
    ['multiCopy', 'multiDelete', 'multiNone', 'multiSize', 'multiUp', 'multiDown'].forEach((id) => { $(id).disabled = !multi.size; });
    $('multiToggle').hidden = state.layers.length < 2 && !multiMode;
  }

  function syncLayerTools() {
    syncMulti();
    const l = !multiMode && layerAt(selectedLayer);
    $('layerTools').hidden = !l;
    if (!l) return;
    const isText = l.type === 'text';
    $('textTools').hidden = !isText;
    $('layerFlip').hidden = isText;
    /* эффект наклейки включается у каждого стикера отдельно */
    $('dieTools').hidden = isText;
    if (!isText) {
      markSeg($('dieSeg'), l.die ? 'on' : 'off');
      $('dieWidthField').hidden = !l.die;
      $('dieWidth').value = l.dieW ?? 0.05;
    }
    /* убрать фон можно только у своей картинки */
    const own = l.type === 'sticker' && !!l.img;
    $('cutTools').hidden = !own;
    if (own) {
      const cut = !!l.cut;
      $('bgCutOptions').hidden = !cut;
      $('bgRestore').disabled = !cut;
      $('bgCut').textContent = t(cut ? 'Фон убран' : 'Убрать фон');
      $('bgCut').disabled = cut;
      $('bgTol').value = l.cut ? l.cut.tol : 40;
      $('bgEdge').value = l.cut ? l.cut.edge ?? 1 : 1;
      markSeg($('bgMode'), l.cut ? l.cut.mode : 'edge');
    }
    /* у готовых значков меняется цвет */
    $('vecTools').hidden = !l.vec;
    if (l.vec) swatches($('vecColor'), ['#ff1a1a', '#ffffff', '#111111', '#39ff6a', '#f5c518', '#ff5a1f', '#6c9fe0', '#f472b6', '#a78bfa'], l.color, (c) => editLayer({ color: c }));
    $('layerSize').value = l.size;
    $('layerRot').value = Math.round(((l.rot || 0) * 180) / Math.PI);
    $('layerUp').disabled = selectedLayer >= state.layers.length - 1;
    $('layerDown').disabled = selectedLayer <= 0;
    if (!isText) return;
    if (document.activeElement !== $('layerText')) $('layerText').value = l.text;
    markSeg($('layerStyle'), l.style || 'none');
    const fonts = $('layerFonts');
    fonts.replaceChildren();
    FONTS.forEach((f) => {
      chip(fonts, t(f.name), f.id === l.font, () => editLayer({ font: f.id })).style.fontFamily = f.css;
    });
    swatches($('layerColor'), LAYER_COLORS, l.color, (c) => editLayer({ color: c }));
    swatches($('layerBg'), LAYER_COLORS, l.bg || '#ffffff', (c) => editLayer({ bg: c }));
  }

  /* правка выбранного слоя: новый объект, чтобы отмена видела разницу */
  function editLayer(patch, quiet) {
    const l = layerAt(selectedLayer);
    if (!l) return;
    state.layers = state.layers.map((x, i) => (i === selectedLayer ? { ...x, ...patch } : x));
    if (!quiet) syncLayerTools();
    update();
  }

  function bindLayers() {
    const pointers = new Map();
    let drag = null;
    let pinch = null;
    const toCard = (e) => {
      const box = card.getBoundingClientRect();
      return [((e.clientX - box.left) / box.width) * card.width, ((e.clientY - box.top) / box.height) * card.height];
    };
    /* какой слой под пальцем: сверху вниз, с учётом поворота */
    const hitLayer = (px, py) => {
      for (let i = state.layers.length - 1; i >= 0; i--) {
        const l = state.layers[i];
        const b = window.Render.layerBox(ctx, l, assets, card.width, card.height);
        const dx = px - l.x * card.width;
        const dy = py - l.y * card.height;
        const r = -(l.rot || 0);
        const lx = dx * Math.cos(r) - dy * Math.sin(r);
        const ly = dx * Math.sin(r) + dy * Math.cos(r);
        const slack = Math.min(card.width, card.height) * 0.02;
        if (Math.abs(lx) <= b.w / 2 + slack && Math.abs(ly) <= b.h / 2 + slack) return i;
      }
      return -1;
    };
    card.addEventListener('pointerdown', (e) => {
      if (!layersMode()) return;
      pointers.set(e.pointerId, e);
      try { card.setPointerCapture(e.pointerId); } catch {}
      if (pointers.size === 2 && layerAt(selectedLayer)) {
        const [a, b] = [...pointers.values()];
        const l = layerAt(selectedLayer);
        pinch = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), ang: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX), size: l.size, rot: l.rot || 0 };
        drag = null;
        return;
      }
      const [px, py] = toCard(e);
      const hit = hitLayer(px, py);
      /* Shift на компьютере тоже включает выбор нескольких */
      if (e.shiftKey && !multiMode && hit >= 0) {
        multiMode = true;
        multi = new Set(selectedLayer >= 0 ? [selectedLayer] : []);
      }
      if (multiMode) {
        if (hit < 0) return;
        /* тап по невыбранному добавляет его; по выбранному можно сразу тянуть всю группу */
        const fresh = !multi.has(hit);
        if (fresh) multi.add(hit);
        drag = { group: true, px, py, start: [...multi].map((i) => [i, state.layers[i].x, state.layers[i].y]), moved: false, fresh, hit };
        syncLayerTools();
        invalidate();
        return;
      }
      selectedLayer = hit;
      syncLayerTools();
      invalidate();
      if (hit < 0) return;
      const l = layerAt(hit);
      drag = { dx: l.x - px / card.width, dy: l.y - py / card.height };
    });
    card.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId) || !layersMode()) return;
      pointers.set(e.pointerId, e);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const ang = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
        editLayer({ size: clamp(pinch.size * (dist / pinch.dist), 0.03, 1.5), rot: pinch.rot + ang - pinch.ang }, true);
        syncLayerTools();
        return;
      }
      if (!drag) return;
      const [px, py] = toCard(e);
      if (drag.group) {
        const dx = (px - drag.px) / card.width;
        const dy = (py - drag.py) / card.height;
        if (Math.abs(dx) + Math.abs(dy) > 0.004) drag.moved = true;
        const list = [...state.layers];
        drag.start.forEach(([i, x, y]) => { list[i] = { ...list[i], x: clamp(x + dx, 0, 1), y: clamp(y + dy, 0, 1) }; });
        state.layers = list;
        update();
        return;
      }
      editLayer({ x: clamp(px / card.width + drag.dx, 0, 1), y: clamp(py / card.height + drag.dy, 0, 1) }, true);
    });
    const end = (e) => {
      /* короткий тап по уже выбранному стикеру снимает с него выбор */
      if (drag && drag.group && !drag.moved && !drag.fresh) {
        multi.delete(drag.hit);
        syncLayerTools();
        invalidate();
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) drag = null;
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
    card.addEventListener('wheel', (e) => {
      const l = layersMode() && layerAt(selectedLayer);
      if (!l) return;
      e.preventDefault();
      editLayer({ size: clamp(l.size * (e.deltaY < 0 ? 1.06 : 0.94), 0.03, 1.5) });
    }, { passive: false });

    $('stickerUpload').onclick = () => $('fileSticker').click();
    $('fileSticker').onchange = (e) => { addStickerFiles(e.target.files); e.target.value = ''; };
    $('textAdd').onclick = () => addLayer({
      type: 'text', text: t('мой день'), font: 'caveat', color: luminance(state.paperColor) > 0.45 ? '#111111' : '#ffffff', bg: '#ffffff', style: 'none', size: 0.09,
    });
    $('layerText').oninput = (e) => editLayer({ text: e.target.value }, true);
    $('layerStyle').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) editLayer({ style: b.dataset.v });
    });
    $('layerSize').oninput = (e) => editLayer({ size: Number(e.target.value) }, true);
    $('layerRot').oninput = (e) => editLayer({ rot: (Number(e.target.value) * Math.PI) / 180 }, true);
    $('layerFlip').onclick = () => editLayer({ flip: !layerAt(selectedLayer).flip });
    bindCut();
    $('dieSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) editLayer({ die: b.dataset.v === 'on' });
    });
    $('dieWidth').oninput = (e) => editLayer({ dieW: Number(e.target.value) }, true);
    $('layerCopy').onclick = () => {
      const l = layerAt(selectedLayer);
      if (l) addLayer({ ...l, x: clamp(l.x + 0.05, 0, 1), y: clamp(l.y + 0.05, 0, 1) });
    };
    $('layerDelete').onclick = () => {
      state.layers = state.layers.filter((_, i) => i !== selectedLayer);
      selectedLayer = -1;
      syncLayerTools();
      update();
    };
    /* выше и ниже: меняем порядок, чтобы стикер лёг поверх соседа или под него */
    const move = (d) => {
      const j = selectedLayer + d;
      if (!layerAt(selectedLayer) || j < 0 || j >= state.layers.length) return;
      const list = [...state.layers];
      [list[selectedLayer], list[j]] = [list[j], list[selectedLayer]];
      state.layers = list;
      selectedLayer = j;
      syncLayerTools();
      update();
    };
    $('layerUp').onclick = () => move(1);
    $('layerDown').onclick = () => move(-1);

    /* ---------- несколько стикеров сразу ---------- */
    const done = () => { syncLayerTools(); update(); };
    $('multiToggle').onclick = () => {
      multiMode = !multiMode;
      multi = new Set(multiMode && selectedLayer >= 0 ? [selectedLayer] : []);
      selectedLayer = -1;
      syncLayerTools();
      invalidate();
    };
    $('multiAll').onclick = () => { multi = new Set(state.layers.map((_, i) => i)); syncLayerTools(); invalidate(); };
    $('multiNone').onclick = () => { multi = new Set(); syncLayerTools(); invalidate(); };
    $('multiDelete').onclick = () => {
      state.layers = state.layers.filter((_, i) => !multi.has(i));
      multi = new Set();
      done();
    };
    $('multiCopy').onclick = () => {
      const copies = [...multi].sort((a, b) => a - b).map((i) => ({ ...state.layers[i], x: clamp(state.layers[i].x + 0.05, 0, 1), y: clamp(state.layers[i].y + 0.05, 0, 1) }));
      const from = state.layers.length;
      state.layers = [...state.layers, ...copies];
      multi = new Set(copies.map((_, k) => from + k));
      done();
    };
    /* размер группы: стикеры растут вместе и расходятся от общего центра */
    let sizeStart = null;
    $('multiSize').oninput = (e) => {
      const k = Number(e.target.value);
      if (!sizeStart) {
        const ids = [...multi];
        const cx = ids.reduce((a, i) => a + state.layers[i].x, 0) / ids.length;
        const cy = ids.reduce((a, i) => a + state.layers[i].y, 0) / ids.length;
        sizeStart = { cx, cy, list: ids.map((i) => [i, { ...state.layers[i] }]) };
      }
      const list = [...state.layers];
      sizeStart.list.forEach(([i, l0]) => {
        list[i] = { ...list[i], size: clamp(l0.size * k, 0.03, 1.5), x: clamp(sizeStart.cx + (l0.x - sizeStart.cx) * k, 0, 1), y: clamp(sizeStart.cy + (l0.y - sizeStart.cy) * k, 0, 1) };
      });
      state.layers = list;
      update();
    };
    $('multiSize').onchange = (e) => { sizeStart = null; e.target.value = 1; };
    /* выше и ниже: вся группа целиком поверх остальных или под ними */
    const restack = (top) => {
      const picked = state.layers.filter((_, i) => multi.has(i));
      const rest = state.layers.filter((_, i) => !multi.has(i));
      state.layers = top ? [...rest, ...picked] : [...picked, ...rest];
      multi = new Set(picked.map((_, k) => (top ? rest.length + k : k)));
      done();
    };
    $('multiUp').onclick = () => restack(true);
    $('multiDown').onclick = () => restack(false);
  }

  /* ---------- отмена и повтор ---------- */
  /* Запоминаем снимок настроек после каждой паузы в правках. Фото в ячейках сюда не входят. */
  const past = [];
  let future = [];
  let lastSnap = null;
  let histTimer = 0;
  let restoring = false;
  const snapshot = () => JSON.stringify(state);
  function syncHistory() {
    $('undoBtn').disabled = !past.length;
    $('redoBtn').disabled = !future.length;
  }
  function commitHistory() {
    clearTimeout(histTimer);
    const now = snapshot();
    if (lastSnap !== null && now !== lastSnap) {
      past.push(lastSnap);
      if (past.length > 80) past.shift();
      future = [];
    }
    lastSnap = now;
    syncHistory();
  }
  function recordHistory() {
    if (restoring) return;
    clearTimeout(histTimer);
    histTimer = setTimeout(commitHistory, 450);
  }
  function resetHistory() {
    past.length = 0;
    future = [];
    lastSnap = snapshot();
    syncHistory();
  }
  function applySnap(json) {
    restoring = true;
    const before = state.collage;
    state = JSON.parse(json);
    selectedLayer = -1;
    selectedMark = -1;
    if (state.collage !== before) setCollage(state.collage);
    else syncSlotCount();
    syncAll();
    syncLayerTools();
    lastSnap = json;
    update();
    restoring = false;
    syncHistory();
  }
  function undo() {
    commitHistory();
    if (!past.length) return;
    future.push(lastSnap);
    applySnap(past.pop());
  }
  function redo() {
    commitHistory();
    if (!future.length) return;
    past.push(lastSnap);
    applySnap(future.pop());
  }
  function bindHistory() {
    $('undoBtn').onclick = undo;
    $('redoBtn').onclick = redo;
    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    });
  }

  /* ---------- ряды, которые листаются вбок ----------
     На телефоне их листают пальцем. На компьютере колесо мыши крутит их вбок,
     а ещё их можно тянуть мышью, как пальцем. */
  const STRIPS = '.thumbs, .chips, .swatches, .tools';
  const stripAt = (el) => {
    for (let n = el && el.closest(STRIPS); n; n = n.parentElement && n.parentElement.closest(STRIPS)) {
      if (n.scrollWidth > n.clientWidth + 2 && getComputedStyle(n).overflowX !== 'visible') return n;
    }
    return null;
  };
  function bindStrips() {
    document.addEventListener('wheel', (e) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const n = stripAt(e.target);
      if (!n) return;
      const max = n.scrollWidth - n.clientWidth;
      /* у края ряда колесо снова листает панель вниз */
      if ((e.deltaY < 0 && n.scrollLeft <= 0) || (e.deltaY > 0 && n.scrollLeft >= max - 1)) return;
      e.preventDefault();
      n.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    }, { passive: false });

    let pull = null;
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const n = stripAt(e.target);
      if (n) pull = { n, x: e.clientX, left: n.scrollLeft, moved: false };
    });
    document.addEventListener('pointermove', (e) => {
      if (!pull) return;
      const dx = e.clientX - pull.x;
      if (!pull.moved && Math.abs(dx) < 6) return;
      pull.moved = true;
      pull.n.classList.add('pulling');
      pull.n.scrollLeft = pull.left - dx;
    });
    document.addEventListener('pointerup', () => {
      if (!pull) return;
      const { n, moved } = pull;
      pull = null;
      n.classList.remove('pulling');
      /* после перетаскивания отпускание не должно нажать на кнопку под мышью */
      if (moved) window.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
    });
  }

  /* ---------- весь экран ---------- */
  function bindFullscreen() {
    const app = document.querySelector('.app');
    const grip = $('dockGrip');
    const setView = (on) => {
      const apply = () => {
        app.classList.toggle('view', on);
        $('expandCard').setAttribute('aria-pressed', on);
      };
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (document.startViewTransition && !calm) document.startViewTransition(apply);
      else apply();
    };
    const setFull = (on) => {
      app.classList.toggle('dock-full', on);
      grip.setAttribute('aria-expanded', on);
    };

    /* Полный экран открывает кнопка в углу или двойной тап по карточке. Одно нажатие оставляем для работы с фото.
       Пока карточку двигают пальцем или ставят рамки, двойной тап тоже занят, тогда только кнопка. */
    $('stage').addEventListener('click', (e) => {
      if (app.classList.contains('view')) return setView(false);
      if (e.target.closest('#expandCard')) setView(true);
    });
    card.addEventListener('dblclick', (e) => {
      if (app.classList.contains('view') || card.classList.contains('grab') || marksMode()) return;
      e.preventDefault();
      setView(true);
    });

    let startY = 0;
    let swiped = false;
    grip.addEventListener('pointerdown', (e) => {
      startY = e.clientY;
      swiped = false;
      grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener('pointerup', (e) => {
      const dy = e.clientY - startY;
      if (Math.abs(dy) < 24) return;
      swiped = true;
      setFull(dy < 0);
    });
    grip.addEventListener('click', () => {
      if (!swiped) setFull(!app.classList.contains('dock-full'));
      swiped = false;
    });

    /* На весь экран панель закрывает карточку, поэтому после выбора показываем результат. */
    document.querySelector('.panels').addEventListener('click', (e) => {
      if (e.target.closest('.thumb')) setFull(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      setView(false);
      setFull(false);
    });
  }

  /* ---------- экспорт ---------- */
  function exportButtons(disabled) {
    ['saveCard', 'saveVideo', 'shareCard'].forEach((id) => { $(id).disabled = disabled; });
  }

  async function runExport(make, label) {
    const status = $('exportStatus');
    exportButtons(true);
    status.textContent = t('Собираю файл…');
    try {
      const blob = await make();
      Export.save(blob, `lunajour-${label}-${Date.now()}.${Export.extension(blob)}`);
      status.textContent = t('Файл сохранён в загрузки.');
    } catch {
      status.textContent = t('Этот браузер не умеет записывать видео. Сохрани карточку как картинку.');
    }
    exportButtons(false);
  }

  async function shareCard() {
    const blob = await Export.cardBlob(state, slots, assets);
    const file = new File([blob], 'lunajour.png', { type: 'image/png' });
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err.name !== 'AbortError') $('exportStatus').textContent = t('Не получилось поделиться. Сохрани файл и отправь его вручную.');
    }
  }

  /* ---------- привязка событий ---------- */
  function bindEvents() {
    document.querySelectorAll('[data-bind]').forEach((el) => {
      el.addEventListener('input', () => {
        const value = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
        setPath(el.dataset.bind, value);
        if (el.dataset.bind === 'note.mood') syncNote();
        if (el.dataset.bind.startsWith('scan.')) syncScan();
        if (el.dataset.bind === 'note.title' || el.dataset.bind === 'note.font') syncSlotCount();
      });
    });
    document.querySelectorAll('[data-seg]').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        setPath(seg.dataset.seg, b.dataset.v);
        markSeg(seg, b.dataset.v);
      });
    });

    $('langSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      I18n.set(b.dataset.v);
      markSeg($('langSeg'), I18n.lang);
      collageThumbs.clear();
      buildPalette();
      syncAll();
    });

    $('tools').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) openTool(b.dataset.tab);
    });
    $('toolDone').onclick = () => closeTool(true);
    $('toolCancel').onclick = () => closeTool(false);
    /* удерживай, чтобы увидеть фото без эффектов и сканера */
    const cmp = $('compareBtn');
    const cmpOn = (on) => { comparing = on; cmp.classList.toggle('primary', on); invalidate(); };
    cmp.addEventListener('pointerdown', (e) => { e.preventDefault(); cmpOn(true); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => cmp.addEventListener(ev, () => { if (comparing) cmpOn(false); }));
    cmp.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && tab && !document.querySelector('.app').classList.contains('view')) closeTool(true);
    });
    $('modeSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && !busy && !recording) setMode(b.dataset.v);
    });
    $('slotSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      activeSlot = Number(b.dataset.v);
      syncSlotUI();
    });

    $('shutter').onclick = shutter;
    $('uploadBtn').onclick = () => $('filePhoto').click();
    $('startSample').onclick = goEdit;
    $('flipCam').onclick = () => {
      if (!Camera.active) return openCamera(Camera.start);
      if (!busy && !recording) openCamera(Camera.switchFacing);
    };
    $('zoomBtn').onclick = () => {
      const s = slots[boothIndex] || slots[0];
      s.zoom = s.zoom > 1.5 ? 1 : 2;
      $('zoomBtn').textContent = `${s.zoom}×`;
      invalidate();
    };
    $('torchBtn').onclick = async () => {
      const on = await Camera.toggleTorch().catch(() => false);
      $('torchBtn').classList.toggle('primary', on);
    };

    $('retake').onclick = () => {
      clearTimeout(draftTimer);
      Store.del('draft');
      setPhase('shoot');
      resetSlots();
      openCamera(Camera.start).then((ok) => { if (!ok) syncStarter(); });
    };
    $('finish').onclick = () => {
      $('exportStatus').textContent = '';
      $('saveVideo').hidden = !Camera.videoMime();
      $('exportSheet').showModal();
    };
    $('exportClose').onclick = () => $('exportSheet').close();
    $('saveCard').onclick = () => runExport(() => Export.cardBlob(state, slots, assets), 'card');
    $('saveVideo').onclick = () => runExport(() => Export.videoBlob(state, slots, assets, (p) => {
      $('exportStatus').textContent = `${t('Записываю видео')}: ${Math.round(p * 100)}%`;
    }), 'video');
    $('shareCard').hidden = !(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] }));
    $('shareCard').onclick = shareCard;

    $('filePhoto').onchange = (e) => { handleFiles(e.target.files); e.target.value = ''; };
    $('bgUpload').onclick = () => $('fileBg').click();
    $('fileBg').onchange = (e) => {
      if (e.target.files[0]) setBackground(e.target.files[0]).catch(() => toast(t('Эта картинка не открывается.')));
      e.target.value = '';
    };
    $('maskUpload').onclick = () => $('fileMask').click();
    $('fileMask').onchange = (e) => {
      if (e.target.files[0]) setMask(e.target.files[0]).catch(() => toast(t('Эта картинка не открывается.')));
      e.target.value = '';
    };

    $('cellUpload').onclick = () => $('filePhoto').click();
    $('cellShoot').onclick = () => {
      if (busy || recording) return;
      setPhase('shoot');
      openCamera(Camera.start).then((ok) => { if (!ok) syncStarter(); });
    };
    $('cellClear').onclick = () => {
      slots[activeSlot] = newSlot(null);
      syncSlotUI();
      update();
    };

    $('shuffle').onclick = () => {
      state.seed = Math.floor(Math.random() * 1e6);
      update();
    };
    $('slotZoom').oninput = (e) => setZoom(Number(e.target.value));
    ['x', 'y'].forEach((axis) => {
      $(axis === 'x' ? 'slotX' : 'slotY').oninput = (e) => {
        const s = slots[activeSlot];
        if (!s) return;
        s[axis] = Number(e.target.value);
        update();
      };
    });
    $('slotFlip').onclick = () => {
      const s = slots[activeSlot];
      if (s) { s.flip = !s.flip; update(); }
    };
    /* У отражённого снимка поворот идёт в обратную сторону, а на экране всегда по часовой. */
    $('slotTurn').onclick = () => {
      const s = slots[activeSlot];
      if (s) { s.turn = (s.turn + (s.flip ? 270 : 90)) % 360; update(); }
    };
    $('slotReset').onclick = () => {
      const s = slots[activeSlot];
      if (!s) return;
      Object.assign(s, { x: 0, y: 0, zoom: 1, turn: 0 });
      syncSlotUI();
      update();
    };
    $('adjReset').onclick = () => {
      state.adjust = defaults().adjust;
      syncInputs();
      update();
    };

    bindDrag();
    bindPieces();
    bindMarks();
    bindFx();
    bindScan();
    bindLayers();
    bindHistory();
    bindFullscreen();
    bindStrips();
    buildPalette();
  }

  /* Открытый инструмент: панель с ✕ и ✓ вместо ряда инструментов. ✕ возвращает всё, как было до открытия. */
  let toolSnap = null;
  let comparing = false;
  function setTab(next) {
    tab = next || '';
    const app = document.querySelector('.app');
    app.classList.toggle('tool-open', !!tab);
    if (!tab) app.classList.remove('dock-full');
    document.querySelectorAll('#tools [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
    const btn = document.querySelector(`#tools [data-tab="${tab}"]`);
    $('toolTitle').textContent = btn ? btn.querySelector('span').textContent : '';
    $('scanSub').hidden = !(scanOpen() && state.scan.on);
    if (!scanOpen()) unselect();
    syncGrab();
    if (tab === 'layers') syncLayerTools();
    if (tab === 'fx') syncFx();
    syncCtx();
    invalidate();
  }
  function openTool(name) {
    toolSnap = JSON.stringify(state);
    document.querySelector('.panels').scrollTop = 0;
    setTab(name);
    showHint(name);
  }
  function closeTool(keep) {
    if (!keep && toolSnap && toolSnap !== JSON.stringify(state)) applySnap(toolSnap);
    toolSnap = null;
    setTab('');
  }

  /* Подсказка при первом открытии инструмента, потом больше не показывается. */
  const HINTS = {
    scan: 'Выбери набор. Нажми на фото, чтобы добавить рамку, а нажатие на рамку откроет её меню.',
    fx: 'Можно наложить два эффекта: переключатель «Эффект 1 / Эффект 2» сверху.',
    layers: 'Стикеры двигаются пальцем. Двумя пальцами можно повернуть и увеличить.',
    collage: 'Нажми на ячейку коллажа, чтобы выбрать, куда встанет следующее фото.',
  };
  function showHint(name) {
    if (!HINTS[name]) return;
    try {
      const seen = JSON.parse(localStorage.getItem('lunajour-hints') || '[]');
      if (seen.includes(name)) return;
      localStorage.setItem('lunajour-hints', JSON.stringify([...seen, name]));
    } catch { return; }
    toast(t(HINTS[name]));
  }

  function syncAll() {
    syncFx();
    syncScan();
    syncStickers();
    syncInputs();
    syncMotifs();
    syncPaper();
    syncNote();
    syncRatios();
    syncKind();
    syncSlotUI();
    sizeCanvas();
  }

  /* Шрифты приезжают позже первого кадра, поэтому слова перерисовываем после их загрузки. */
  function whenFontsReady() {
    const faces = [...WORD_FONTS.map((f) => `${f.weight} 40px ${f.css}`), '900 40px Unbounded', '400 40px "Yeseva One"', '700 40px Caveat', '600 40px "Golos Text"', '500 40px "JetBrains Mono"'];
    Promise.all(faces.map((f) => document.fonts.load(f, 'Яя'))).catch(() => {}).then(() => {
      clearMasks();
      syncMotifs();
      invalidate();
    });
  }

  async function boot() {
    I18n.capture();
    I18n.apply();
    markSeg($('langSeg'), I18n.lang);
    resetSlots();
    bindEvents();
    setTab('');
    Store.get('scanPresets').then((list) => { if (Array.isArray(list)) { userPresets = list; buildScanGrid(); syncScan(); } }).catch(() => {});
    markSeg($('modeSeg'), mode);
    syncAll();
    setPhase('shoot');
    requestAnimationFrame(loop);
    whenFontsReady();
    resetHistory();

    const draft = await Store.get('draft');
    if (draft && draft.slots) {
      toast(t('Есть незаконченная карточка.'), {
        label: t('Продолжить'),
        run: () => restoreDraft(draft).catch(() => toast(t('Черновик не открылся.'))),
      });
    }
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if ('serviceWorker' in navigator && !local) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  boot();
})();
