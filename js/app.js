/* Экран приложения: связывает настройки, камеру, отрисовку и экспорт. */
(function () {
  const { CATEGORIES, MOTIFS, SYMBOLS, DEMO_PIECES, WORD_FONTS, makeRng, byId } = window.Motifs;
  const { RATIOS, PAPERS, FONTS, renderCard, sampleScene, layout, slotFrame, canvas, clearMasks, paintPaper, drawCover, luminance } = window.Render;
  const { Camera, Export, Store, Templates, I18n, Collages } = window;
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
    motif: 'star-flock', seed: 7, size: 1, density: 1, ghost: 0, invert: false, effect: 'none', word: '', wordFont: WORD_FONTS[0].id,
    pieces: [],
    paper: 'crumple', paperColor: PAPER_COLORS[0], paperPos: 'bottom', ratio: '4:5', collage: '', tints: {}, marks: {}, layers: [],
    adjust: { b: 0, c: 0, s: 0, w: 0, g: 0 },
    note: { title: SAMPLE_TITLE, place: '', date: today(), showDate: true, size: 'm', mood: '', font: 'sexsmith', color: 'auto' },
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

  const isMoving = () => slots.some((s) => s.src && (s.src.kind === 'live' || s.src.kind === 'video'));

  let lastFrame = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const due = isMoving() && now - lastFrame > 33;
    if (!dirty && !due) return;
    dirty = false;
    lastFrame = now;
    renderCard(ctx, state, slots, assets);
    drawSelection();
  }

  /* Рамка вокруг выбранной фигуры видна только в превью, в файл она не попадает. */
  function drawSelection() {
    if (tab === 'layers') {
      const l = state.layers[selectedLayer];
      if (!l) return;
      const b = window.Render.layerBox(ctx, l, assets, card.width, card.height);
      ctx.save();
      ctx.translate(l.x * card.width, l.y * card.height);
      ctx.rotate(l.rot || 0);
      ctx.strokeStyle = '#6c9fe0';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(-b.w / 2 - 6, -b.h / 2 - 6, b.w + 12, b.h + 12);
      ctx.restore();
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
      const c = collageGeo().cells[activeSlot];
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
    $('editBar').hidden = next !== 'edit';
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
        stickers: Object.entries(assets.stickerBlobs),
      });
    }, 700);
  }

  async function restoreDraft(draft) {
    state = { ...defaults(), ...draft.state };
    state.note = { ...defaults().note, ...draft.state.note };
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
    MOTIFS.filter((m) => category === 'all' || m.cat === category).forEach((m) => {
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
    $('genTools').hidden = !!motif.usesPieces;
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
  const syncGrab = () => card.classList.toggle('grab', tab === 'photo' || tab === 'layers' || handMode() || (tab === 'collage' && !!collageTpl()));

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
      const c = collageGeo().cells[i];
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
  async function findPeople() {
    const slot = slots[0];
    if (!slot || !slot.src || slot.src.kind === 'live') return toast(t('Сначала добавь фото.'));
    const btn = $('markFind');
    btn.disabled = true;
    btn.textContent = t('Ищу…');
    try {
      if (!detector) {
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
        detector = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
      }
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

  /* ---------- стикеры и текст поверх карточки ---------- */
  const EMOJIS = ['🌸', '🌷', '🌹', '🌼', '🌻', '💐', '🍀', '🌿', '🍒', '🍓', '🍰', '🧁', '🍩', '☕', '🎀', '💌', '💖', '💗', '💕', '💘', '🤍', '🦋', '🐚', '⭐', '🌟', '✨', '🌙', '☁️', '🌈', '🔮', '💿', '📷', '📼', '🎧', '🔒', '🗝️', '🕯️', '🪞', '🧸', '🐱', '🐰', '🫧', '💎', '👑', '🍓', '🎞️', '📌', '✂️'].filter((e, i, a) => a.indexOf(e) === i);
  const LAYER_COLORS = ['#111111', '#ffffff', '#f472b6', '#d64545', '#e8913a', '#ffe27a', '#86c96b', '#6c9fe0', '#1f3a8a', '#a78bfa'];
  let selectedLayer = -1;
  let stickerCount = 0;
  const layersMode = () => tab === 'layers';
  const layerAt = (i) => state.layers[i];

  function addLayer(layer) {
    state.layers = [...state.layers, { x: 0.5, y: 0.45, rot: 0, ...layer }];
    selectedLayer = state.layers.length - 1;
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
    Object.entries(assets.stickers).forEach(([id, el]) => {
      const b = document.createElement('button');
      b.type = 'button';
      const img = document.createElement('img');
      img.src = el.src;
      img.alt = '';
      b.append(img);
      b.onclick = () => addLayer({ type: 'sticker', img: id, size: 0.4 });
      grid.append(b);
    });
    EMOJIS.forEach((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e;
      b.setAttribute('aria-label', `${t('Добавить')} ${e}`);
      b.onclick = () => addLayer({ type: 'sticker', emoji: e, size: 0.22, rot: (Math.random() - 0.5) * 0.4 });
      grid.append(b);
    });
  }

  function syncLayerTools() {
    const l = layerAt(selectedLayer);
    $('layerTools').hidden = !l;
    if (!l) return;
    const isText = l.type === 'text';
    $('textTools').hidden = !isText;
    $('layerFlip').hidden = isText;
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
      editLayer({ x: clamp(px / card.width + drag.dx, 0, 1), y: clamp(py / card.height + drag.dy, 0, 1) }, true);
    });
    const end = (e) => {
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
    ['saveCard', 'saveStory', 'saveVideo', 'shareCard'].forEach((id) => { $(id).disabled = disabled; });
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
    const blob = await Export.storyBlob(state, slots, assets);
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

    $('tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) setTab(b.dataset.tab);
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
    $('saveStory').onclick = () => runExport(() => Export.storyBlob(state, slots, assets), 'story');
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
    bindLayers();
    bindHistory();
    bindFullscreen();
    buildPalette();
  }

  function setTab(next) {
    tab = next;
    document.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === next);
      b.setAttribute('aria-selected', b.dataset.tab === next);
    });
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== next; });
    syncGrab();
    if (next === 'layers') syncLayerTools();
    invalidate();
  }

  function syncAll() {
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
    setTab('motif');
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
