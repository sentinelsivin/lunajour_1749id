/* Влог: экран монтажа. Сверху просмотр, под ним лента клипов с указателем по центру, внизу инструменты.
   На телефоне настройки выезжают шторкой над инструментами, на компьютере всегда открыты справа. */
window.Vlog = (function () {
  const { Timeline, VlogEngine: Engine, Store, Render, I18n } = window;
  const t = (ru) => I18n.t(ru);
  const $ = (id) => document.getElementById(id);

  const PPS_MIN = 12;
  const PPS_MAX = 400;
  const FRAME_MS = 1000 / 30;
  const SPEEDS = [0.5, 0.75, 1, 1.5, 2, 3];
  const RATIO_LIST = ['9:16', '1:1', '4:5', '16:9'];

  let p = Timeline.newProject();
  const hist = Timeline.history();
  let open = false;
  let sel = -1;
  /* выбранная надпись или стикер (id) и выбранный стык между клипами (номер левого клипа) */
  let ov = '';
  let join = -1;
  let sheet = '';
  let pps = 60;
  let at = 0;
  let peek = null;
  let dirty = true;
  let onClose = null;
  let loaded = false;
  let raf = 0;
  /* оформление карточек: как сейчас в редакторе и свои сохранённые стили */
  let editorCard = null;
  let myStyles = [];

  const canvasEl = () => $('vlogCanvas');
  const total = () => Timeline.duration(p);
  const clip = () => p.clips[sel] || null;
  const overlay = () => (ov && p.overlays.find((o) => o.id === ov)) || null;
  /* эффект на время — тоже полоска на ленте, но на кадре его нельзя тянуть: для просмотра нужны только надписи и стикеры */
  const isFxOv = (o) => !!(o && o.layer.type === 'effect');
  const isVoiceOv = (o) => !!(o && o.layer.type === 'voice');
  /* на кадре тянутся только надписи и стикеры: у эффекта и озвучки на просмотре ничего нет */
  const isLayerOv = (o) => !!(o && (o.layer.type === 'text' || o.layer.type === 'sticker'));
  const layerOv = () => { const o = overlay(); return isLayerOv(o) ? o : null; };
  const desktop = () => window.matchMedia('(min-width: 900px)').matches;

  function fmt(ms) {
    const s = Math.max(0, ms) / 1000;
    const m = Math.floor(s / 60);
    const rest = s - m * 60;
    return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
  }

  let toastTimer = 0;
  function toast(text, ms = 3500) {
    const el = $('toast');
    el.textContent = text;
    /* место сообщения могла сдвинуть карточка: во влоге оно всегда сверху */
    el.style.top = '';
    el.style.bottom = '';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  /* ---------- влоги: список и сохранение ----------
     Каждый влог хранится отдельно (vlog-p-<id>), список с названиями в 'vlogs'. Файлы клипов у влогов свои (vlog-m-<id>).
     Раньше влог был один под ключом 'vlog': при первом открытии он переезжает в список как «Мой влог». */
  let saveTimer = 0;
  let projId = '';
  let index = { current: '', list: [] };
  const projKey = (id) => `vlog-p-${id}`;
  const entry = () => index.list.find((x) => x.id === projId);
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
  }
  /* сохранить сейчас: сам влог и строку в списке (сколько клипов, длина, обложка) */
  async function flush() {
    clearTimeout(saveTimer);
    if (!projId) return;
    const e = entry();
    if (e) {
      const first = p.clips[0] && p.media[p.clips[0].media];
      Object.assign(e, { updated: Date.now(), clips: p.clips.length, dur: Math.round(total()), thumb: (first && first.thumb) || '' });
    }
    await Store.set(projKey(projId), p);
    await Store.set('vlogs', index);
  }
  function freshName() {
    const base = t('Влог');
    let n = index.list.length + 1;
    while (index.list.some((x) => x.name === `${base} ${n}`)) n++;
    return `${base} ${n}`;
  }

  async function load() {
    const saved = await Store.get('vlogs');
    if (saved && Array.isArray(saved.list) && saved.list.length) index = saved;
    else {
      /* переезд со старого одиночного влога */
      const old = await Store.get('vlog');
      const id = Timeline.uid();
      index = { current: id, list: [{ id, name: t('Мой влог'), updated: Date.now(), clips: 0, dur: 0, thumb: '' }] };
      if (old && old.v === 1 && Array.isArray(old.clips)) await Store.set(projKey(id), old);
      await Store.set('vlogs', index);
      await Store.del('vlog');
    }
    if (!index.list.some((x) => x.id === index.current)) index.current = index.list[0].id;
    await openProject(index.current, false);
    /* строка в списке сразу с числом клипов и обложкой */
    await flush();
    await sweepFiles();
    loaded = true;
  }
  /* Файлы, на которые не ссылается ни один влог (отменённое добавление клипа, картинки фигуры, вырезанного стикера),
     иначе копились бы в памяти браузера. Только при открытии: тогда история отмены пустая и вернуть их нечем. */
  async function sweepFiles() {
    try {
      const used = new Set();
      for (const e of index.list) {
        const pr = e.id === projId ? p : await Store.get(projKey(e.id));
        if (pr && pr.media) Object.keys(pr.media).forEach((id) => used.add(id));
      }
      for (const k of await Store.keys()) {
        const key = String(k);
        if (key.startsWith('vlog-m-') && !used.has(key.slice(7))) await Store.del(key);
      }
    } catch { /* уборка не обязательна: в следующий раз */ }
  }
  /* открыть влог из списка: всё, что держали для прошлого, отпускаем */
  async function openProject(id, sync = true) {
    if (projId && projId !== id) await flush();
    Engine.pause();
    Engine.release();
    Engine.resetMusic();
    const saved = await Store.get(projKey(id));
    p = saved && saved.v === 1 && Array.isArray(saved.clips) ? { ...Timeline.newProject(), ...saved } : Timeline.newProject();
    projId = id;
    index.current = id;
    /* файлы, которые ни к чему не привязаны, больше не нужны */
    for (const mid of Timeline.unused(p)) {
      delete p.media[mid];
      Engine.forget(mid);
    }
    hist.clear();
    sel = -1;
    ov = '';
    join = -1;
    at = 0;
    peek = null;
    Engine.preloadLooks(p);
    await Store.set('vlogs', index);
    syncName();
    if (sync && open) {
      sizeCanvas();
      const w = $('vlogTl').clientWidth;
      if (total()) pps = Math.max(PPS_MIN, Math.min(PPS_MAX, (w * 0.8 * 1000) / total()));
      syncAll();
      kick();
    }
  }
  async function newProject() {
    await flush();
    const id = Timeline.uid();
    index.list.unshift({ id, name: freshName(), updated: Date.now(), clips: 0, dur: 0, thumb: '' });
    await openProject(id);
    await flush();
  }
  /* удалить влог вместе с его файлами; если он открыт, открываем соседний или новый */
  async function deleteProject(id) {
    const saved = id === projId ? p : await Store.get(projKey(id));
    if (saved && saved.media) for (const mid of Object.keys(saved.media)) await Engine.forget(mid);
    await Store.del(projKey(id));
    index.list = index.list.filter((x) => x.id !== id);
    if (id === projId) {
      projId = '';
      if (index.list.length) await openProject(index.list[0].id);
      else { await newProject(); return; }
    }
    await Store.set('vlogs', index);
    syncSheet();
  }
  function syncName() {
    const e = entry();
    const name = (e && e.name) || t('Влог');
    $('vlogNameText').textContent = name;
    $('vlogName').title = `${name}: ${t('мои влоги, новый, переименовать')}`;
  }

  /* любое изменение проекта: сначала копия для отмены, потом действие */
  function commit(fn) {
    hist.push(p);
    fn();
    changed();
  }
  function changed() {
    if (sel >= p.clips.length) sel = p.clips.length - 1;
    if (join >= p.clips.length - 1) join = -1;
    Timeline.fitOverlays(p);
    if (ov && !overlay()) ov = '';
    at = Math.min(at, Math.max(0, total() - 1));
    Engine.preloadLooks(p);
    save();
    syncAll();
  }
  function undo(redo) {
    const next = redo ? hist.redo(p) : hist.undo(p);
    if (!next) return;
    Engine.pause();
    p = next;
    Engine.resetMusic();
    changed();
  }

  /* ---------- просмотр ---------- */
  function sizeCanvas() {
    const c = canvasEl();
    const box = $('vlogStage').getBoundingClientRect();
    const [RW, RH] = Render.RATIOS[p.ratio];
    const pad = 16;
    const k = Math.min((box.width - pad) / RW, (box.height - pad) / RH);
    const cw = Math.max(40, RW * k);
    const ch = Math.max(40, RH * k);
    c.style.width = `${Math.round(cw)}px`;
    c.style.height = `${Math.round(ch)}px`;
    /* просмотр в уменьшенном размере: цвет считается по пикселям, на телефоне это главная нагрузка */
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const long = Math.min(Math.max(cw, ch) * dpr, 960);
    const s = long / Math.max(cw, ch);
    const w = Math.round(cw * s);
    const h = Math.round(ch * s);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    dirty = true;
  }

  function loop() {
    raf = 0;
    if (!open) return;
    const c = canvasEl();
    const x = c.getContext('2d');
    if (Engine.playing) {
      at = Engine.time;
      if (stopAt != null && at >= stopAt) {
        at = Engine.pause();
        stopAt = null;
        syncPlay();
      } else if (at >= total()) {
        Engine.pause();
        at = total();
        syncPlay();
      } else Engine.steer(p, at);
      Engine.drawFrame(x, p, Math.min(at, total() - 1), { seek: false, quick: true });
      follow();
      syncTime();
    } else if (dirty) {
      dirty = false;
      const ok = Engine.drawFrame(x, p, Math.min(peek ?? at, Math.max(0, total() - 1)), { seek: true, calm: ov });
      if (!ok) dirty = true;
      positionBox();
    }
    raf = requestAnimationFrame(loop);
  }
  function kick() { if (open && !raf) raf = requestAnimationFrame(loop); }

  function togglePlay() {
    stopAt = null;
    if (!p.clips.length) return;
    if (Engine.playing) {
      at = Engine.pause();
      dirty = true;
    } else {
      if (at >= total() - 50) at = 0;
      Engine.play(p, at);
    }
    syncPlay();
  }
  function seekTo(ms, scroll = true) {
    at = Math.max(0, Math.min(total(), ms));
    if (Engine.playing) Engine.seek(at);
    dirty = true;
    if (scroll) follow();
    syncTime();
  }

  /* ---------- лента ---------- */
  let setScroll = -1;
  function follow() {
    const tl = $('vlogTl');
    const x = Math.round((at * pps) / 1000);
    if (Math.abs(tl.scrollLeft - x) < 1) return;
    setScroll = x;
    tl.scrollLeft = x;
  }

  function renderTrack() {
    const box = $('vlogClips');
    box.textContent = '';
    p.clips.forEach((c, i) => {
      const m = p.media[c.media] || {};
      const el = document.createElement('div');
      el.className = `vlog-clip${i === sel ? ' sel' : ''}`;
      el.dataset.i = i;
      el.style.width = `${Math.max(4, (Timeline.len(c) * pps) / 1000)}px`;
      if (m.thumb) el.style.backgroundImage = `url("${m.thumb}")`;
      const tag = document.createElement('span');
      tag.className = 'vlog-clip-tag';
      const bits = [`${(Timeline.len(c) / 1000).toFixed(1)} ${t('с')}`];
      if (c.speed !== 1) bits.push(`${c.speed}×`);
      if (c.look) bits.push('◐');
      if (c.fx) bits.push('✦');
      if (c.scan && c.scan.on) bits.push('⌖');
      if (c.shape && c.shape.motif && c.shape.motif !== 'none') bits.push('❋');
      if (hasLayout(c)) bits.push('▦');
      if (c.card) bits.push('▤');
      else if (c.fit || (c.zoom || 1) > 1 || c.x || c.y) bits.push('⛶');
      if (c.kind === 'video' && c.vol === 0) bits.push('🔇');
      tag.textContent = bits.join(' · ');
      el.append(tag);
      if (i === sel) {
        ['in', 'out'].forEach((edge) => {
          const h = document.createElement('i');
          h.className = `vlog-handle ${edge}`;
          h.dataset.edge = edge;
          el.append(h);
        });
      }
      box.append(el);
    });
    /* стыки: квадратик между клипами открывает переход */
    let x = 0;
    p.clips.forEach((c, i) => {
      x += (Timeline.len(c) * pps) / 1000;
      if (i === p.clips.length - 1) return;
      const j = document.createElement('button');
      j.type = 'button';
      j.className = `vlog-join${c.tr && c.tr.id ? ' has' : ''}${i === join ? ' on' : ''}`;
      j.dataset.join = i;
      j.style.left = `${x}px`;
      j.setAttribute('aria-label', t('Переход'));
      j.title = t('Переход');
      j.textContent = c.tr && c.tr.id ? '⧓' : '+';
      box.append(j);
    });
    renderRuler();
    renderOverlays();
    const lane = $('vlogMusicLane');
    const name = musicName();
    lane.style.width = `${Math.max(120, (total() * pps) / 1000)}px`;
    lane.classList.toggle('empty', !name);
    lane.textContent = '';
    if (name) lane.append(el('canvas', 'vlog-wave'));
    lane.append(el('span', 'vlog-music-name', name ? `♪ ${name}` : `+ ${t('Добавить музыку')}`));
    lane.hidden = !p.clips.length;
    drawWave();
    $('vlogTl').style.setProperty('--head-h', `${$('vlogTrack').offsetHeight - 8}px`);
  }

  /* линейка времени: подписи не теснее ~56 px, между ними мелкие засечки */
  const RULER_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  /* время рядом со стыком клипов (в пределах near мс) становится самим стыком */
  function snapMs(ms, near) {
    const s = Timeline.nearest(Timeline.starts(p), ms, near);
    return s == null ? ms : s;
  }

  /* отметки начала клипов на полоске перемотки */
  function renderScrubMarks() {
    const bar = $('vlogScrub');
    bar.querySelectorAll('s').forEach((m) => m.remove());
    const T = total();
    if (!T) return;
    Timeline.starts(p).forEach((s, i) => {
      if (!i) return;
      const m = document.createElement('s');
      m.style.left = `${((s / T) * 100).toFixed(2)}%`;
      bar.insertBefore(m, bar.firstChild);
    });
  }

  function renderRuler() {
    renderScrubMarks();
    const r = $('vlogRuler');
    r.textContent = '';
    r.hidden = !p.clips.length;
    if (!p.clips.length) return;
    const T = total() / 1000;
    const step = RULER_STEPS.find((s) => s * pps >= 56) || 600;
    r.style.width = `${(T * pps).toFixed(1)}px`;
    r.style.setProperty('--tick', `${((step * pps) / (step >= 1 && step < 5 ? step * 2 : 5)).toFixed(2)}px`);
    for (let s = 0; s <= T + 1e-6; s += step) {
      const span = document.createElement('span');
      span.style.left = `${(s * pps).toFixed(1)}px`;
      span.textContent = fmt(s * 1000).replace(/\.0$/, '');
      r.append(span);
    }
  }

  /* дорожка надписей и стикеров: полоска от начала до конца показа */
  function ovLabel(o) {
    const l = o.layer;
    if (l.type === 'text') return `T  ${String(l.text || '').replace(/\s+/g, ' ').slice(0, 24)}`;
    if (l.type === 'voice') return `🎙 ${t('Голос')} ${fmt(o.end - o.start)}`;
    if (l.type === 'effect') {
      const E = window.Effects;
      const S = window.Scanner;
      const fx = l.fx && E && E.byId(l.fx);
      const sc = l.scan && l.scan.on && S && (scanPresets.find((x) => x.id === l.scan.preset) || S.presetById(l.scan.preset));
      const names = [fx && t(fx.name), sc && (sc.mine ? sc.name : t(sc.name))].filter(Boolean);
      return `✦ ${names.join(' + ') || t('Эффект')}`;
    }
    if (l.emoji) return l.emoji;
    return '★';
  }
  /* две дорожки: эффекты на время сразу под клипами, ниже надписи и стикеры */
  function renderOverlays() {
    renderLane($('vlogFxs'), (o) => isFxOv(o));
    renderLane($('vlogVoices'), (o) => isVoiceOv(o));
    renderLane($('vlogOvs'), (o) => isLayerOv(o));
  }
  function renderLane(box, which) {
    box.textContent = '';
    const list = p.overlays.filter(which);
    const { rows, of } = Timeline.overlayRows(p, which);
    box.style.height = `${rows * 26}px`;
    box.hidden = !list.length;
    list.forEach((o) => {
      const el = document.createElement('div');
      el.className = `vlog-ov${o.id === ov ? ' sel' : ''}${o.layer.type === 'text' ? ' text' : ''}${o.layer.type === 'effect' ? ' fx' : ''}${o.layer.type === 'voice' ? ' voice' : ''}`;
      el.dataset.id = o.id;
      el.style.left = `${(o.start * pps) / 1000}px`;
      el.style.width = `${Math.max(6, ((o.end - o.start) * pps) / 1000)}px`;
      el.style.top = `${of.get(o.id) * 26}px`;
      const span = document.createElement('span');
      span.textContent = ovLabel(o);
      el.append(span);
      if (o.id === ov) {
        ['in', 'out'].forEach((edge) => {
          const h = document.createElement('i');
          h.className = `vlog-handle ${edge}`;
          h.dataset.edge = edge;
          el.append(h);
        });
      }
      box.append(el);
    });
  }

  /* ---------- волна и такты на дорожке музыки ---------- */
  let wave = null;
  let waveKey = '';
  const musicKey = () => (p.music.fileId ? `f:${p.music.fileId}` : p.music.track ? `t:${p.music.track}` : '');
  function beatsNow() {
    return wave && wave.key === musicKey() ? Engine.beatTimes(wave, p) : [];
  }
  /* ближайший такт к ms не дальше near мс, или null */
  function nearBeat(ms, near) {
    return Timeline.nearest(beatsNow(), ms, near);
  }
  function drawWave() {
    const key = musicKey();
    if (key !== waveKey) {
      waveKey = key;
      wave = null;
      if (key) Engine.musicInfo(p).then((w) => { if (w && w.key === waveKey) { wave = w; drawWave(); } });
    }
    const cv = $('vlogMusicLane').querySelector('canvas');
    if (!cv) return;
    const lane = $('vlogMusicLane');
    const W = Math.max(1, Math.round(lane.offsetWidth));
    const H = 26;
    /* очень длинная лента: холст не шире 8000 px, дальше растягивается */
    const cw = Math.min(W, 8000);
    cv.width = cw;
    cv.height = H * 2;
    const x = cv.getContext('2d');
    x.clearRect(0, 0, cw, H * 2);
    if (!wave || wave.key !== key) return;
    const T = total();
    const rate = Engine.WAVE_RATE;
    const s0 = wave.loop ? 0 : Number(p.music.start) || 0;
    const n = wave.peaks.length;
    x.fillStyle = 'rgba(255, 255, 255, .38)';
    for (let px = 0; px < cw; px++) {
      const a = ((px / cw) * T) / 1000 + s0;
      const b = (((px + 1) / cw) * T) / 1000 + s0;
      let v = 0;
      for (let k = Math.floor(a * rate); k <= Math.floor(b * rate); k++) {
        const i = wave.loop ? ((k % n) + n) % n : k;
        if (i >= 0 && i < n && wave.peaks[i] > v) v = wave.peaks[i];
      }
      const h = Math.max(1, v * (H * 2 - 6));
      x.fillRect(px, H - h / 2, 1, h);
    }
    /* засечки тактов: каждая четвёртая (сильная доля) ярче */
    const beats = Engine.beatTimes(wave, p);
    beats.forEach((ms, i) => {
      const px = Math.round((ms / Math.max(1, T)) * cw);
      x.fillStyle = i % 4 === 0 ? 'rgba(255, 226, 122, .95)' : 'rgba(255, 226, 122, .45)';
      x.fillRect(px, 0, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? H * 2 : 10);
    });
  }

  /* стыки клипов под такт: каждый стык встаёт на ближайший такт, который клип может достать по длине */
  function fitToBeats() {
    const beats = beatsNow();
    if (!beats.length) return;
    pauseNow();
    let moved = 0;
    commit(() => { moved = Timeline.fitToBeats(p, beats); });
    toast(moved ? `${t('Стыки встали на такт')}: ${moved}.` : t('Стыки уже стоят на такте.'));
  }

  function musicName() {
    if (p.music.fileId) return p.music.name || t('Свой трек');
    const tr = p.music.track && window.Music && window.Music.TRACKS.find((x) => x.id === p.music.track);
    return tr ? t(tr.name) : '';
  }

  function zoom(k, keepAt = true) {
    pps = Math.max(PPS_MIN, Math.min(PPS_MAX, pps * k));
    renderTrack();
    if (keepAt) follow();
  }

  function bindTimeline() {
    const tl = $('vlogTl');
    tl.addEventListener('scroll', () => {
      if (setScroll >= 0 && Math.abs(tl.scrollLeft - setScroll) <= 1) { setScroll = -1; return; }
      setScroll = -1;
      if (Engine.playing) { Engine.pause(); syncPlay(); }
      at = Math.max(0, Math.min(total(), (tl.scrollLeft * 1000) / pps));
      dirty = true;
      syncTime();
    }, { passive: true });
    /* колесо мыши крутит ленту вбок, с Ctrl меняет масштаб */
    tl.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
        return;
      }
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        tl.scrollLeft += e.deltaY;
      }
    }, { passive: false });
    /* щипок двумя пальцами меняет масштаб ленты */
    let pinch = null;
    const spread = (e) => Math.abs(e.touches[0].clientX - e.touches[1].clientX);
    tl.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) pinch = { d: spread(e), pps };
    }, { passive: true });
    tl.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const k = spread(e) / Math.max(20, pinch.d);
      pps = Math.max(PPS_MIN, Math.min(PPS_MAX, pinch.pps * k));
      renderTrack();
      follow();
    }, { passive: false });
    tl.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; });

    /* мышью лента тянется за пустое место и линейку, как пальцем; короткое нажатие на линейку — переход туда */
    let pan = null;
    tl.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button > 0) return;
      if (e.target.closest('.vlog-clip, .vlog-ov, .vlog-join, .vlog-music')) return;
      pan = { x: e.clientX, left: tl.scrollLeft, id: e.pointerId, moved: false, ruler: !!e.target.closest('.vlog-ruler') };
      try { tl.setPointerCapture(e.pointerId); } catch { /* кнопку уже отпустили */ }
      e.preventDefault();
    });
    tl.addEventListener('pointermove', (e) => {
      if (!pan || e.pointerId !== pan.id) return;
      const dx = e.clientX - pan.x;
      if (!pan.moved && Math.abs(dx) < 4) return;
      pan.moved = true;
      tl.classList.add('grab');
      tl.scrollLeft = pan.left - dx;
    });
    const panEnd = (e) => {
      if (!pan || e.pointerId !== pan.id) return;
      const was = pan;
      pan = null;
      tl.classList.remove('grab');
      if (!was.moved && was.ruler && e.type === 'pointerup') rulerSeek(e);
    };
    tl.addEventListener('pointerup', panEnd);
    tl.addEventListener('pointercancel', panEnd);
    /* на телефоне нажатие на линейку тоже переносит указатель */
    $('vlogRuler').addEventListener('click', (e) => { if (e.pointerType !== 'mouse') rulerSeek(e); });
    function rulerSeek(e) {
      const r = $('vlogRuler').getBoundingClientRect();
      pauseNow();
      seekTo(snapMs(((e.clientX - r.left) * 1000) / pps, (8 * 1000) / pps));
    }

    bindScrub();
    bindClipGestures();
    bindOverlayGestures($('vlogOvs'));
    bindOverlayGestures($('vlogFxs'));
    bindOverlayGestures($('vlogVoices'));
    $('vlogClips').addEventListener('click', (e) => {
      const j = e.target.closest('.vlog-join');
      if (j) selectJoin(Number(j.dataset.join));
    });
    $('vlogMusicLane').onclick = () => openSheet('music');
    $('vlogZoomIn').onclick = () => zoom(1.4);
    $('vlogZoomOut').onclick = () => zoom(1 / 1.4);
  }

  /* перемотка под просмотром: нажал в любое место полоски — указатель там, дальше можно тянуть */
  function bindScrub() {
    const bar = $('vlogScrub');
    let id = null;
    let wasPlaying = false;
    const toMs = (e) => {
      const r = bar.getBoundingClientRect();
      const w = Math.max(1, r.width);
      /* у стыка линия прилипает: ~8 px полоски */
      return snapMs((Math.max(0, Math.min(1, (e.clientX - r.left) / w))) * total(), (8 / w) * total());
    };
    bar.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !p.clips.length) return;
      id = e.pointerId;
      wasPlaying = Engine.playing;
      stopAt = null;
      pauseNow();
      try { bar.setPointerCapture(id); } catch { /* палец уже отпущен */ }
      bar.classList.add('on');
      seekTo(toMs(e));
      e.preventDefault();
    });
    bar.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      seekTo(toMs(e));
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      bar.classList.remove('on');
      /* если ролик шёл, он продолжается с нового места */
      if (wasPlaying && at < total() - 50) { Engine.play(p, at); syncPlay(); }
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }

  /* Клип: нажал — выбран. Выбранный можно тянуть за края (обрезка) и целиком (порядок).
     Невыбранные клипы на телефоне просто листают ленту. Мышью тянуть можно любой клип. */
  function bindClipGestures() {
    const box = $('vlogClips');
    let g = null;
    box.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.vlog-clip');
      if (!el || e.button > 0) return;
      const i = Number(el.dataset.i);
      const edge = e.target.dataset.edge || '';
      const mouse = e.pointerType === 'mouse';
      if (!edge && i !== sel && !mouse) {
        g = { kind: 'tap', i, x: e.clientX, y: e.clientY, id: e.pointerId };
        return;
      }
      if (Engine.playing) { Engine.pause(); syncPlay(); }
      const c = p.clips[i];
      g = { kind: edge ? 'trim' : 'press', edge, i, x: e.clientX, y: e.clientY, id: e.pointerId, in: c.in, out: c.out, el, pushed: false };
      try { box.setPointerCapture(e.pointerId); } catch { /* палец уже отпущен */ }
      if (!edge && i !== sel) select(i);
      e.preventDefault();
    });
    box.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x;
      if (g.kind === 'tap') {
        if (Math.abs(dx) > 8 || Math.abs(e.clientY - g.y) > 8) g = null;
        return;
      }
      if (g.kind === 'press' && Math.abs(dx) > 8) startDrag();
      if (g.kind === 'trim') trimMove(dx);
      if (g.kind === 'drag') dragMove(e.clientX);
    });
    const end = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const was = g;
      g = null;
      if (was.kind === 'tap') select(was.i === sel ? -1 : was.i);
      if (was.kind === 'trim') { peek = null; dirty = true; changed(); }
      if (was.kind === 'drag') dragEnd(was);
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', (e) => {
      if (g && g.kind === 'drag') { g.to = g.i; }
      end(e);
    });

    function trimMove(dx) {
      const c = p.clips[g.i];
      if (!g.pushed) { hist.push(p); g.pushed = true; }
      const ms = (dx * 1000 * c.speed) / pps;
      if (c.kind === 'image') Timeline.trim(p, g.i, 'out', g.out + (g.edge === 'in' ? -ms : ms));
      else if (g.edge === 'in') Timeline.trim(p, g.i, 'in', g.in + ms);
      else Timeline.trim(p, g.i, 'out', g.out + ms);
      /* стык после клипа прилипает к такту музыки (~8 px ленты) */
      const end = Timeline.starts(p)[g.i] + Timeline.len(c);
      const b = nearBeat(end, (8 * 1000) / pps);
      if (b != null && b !== end) {
        const d = (b - end) * c.speed;
        if (c.kind === 'image') Timeline.trim(p, g.i, 'out', c.out + d);
        else if (g.edge === 'in') Timeline.trim(p, g.i, 'in', c.in - d);
        else Timeline.trim(p, g.i, 'out', c.out + d);
      }
      /* в просмотре видно кадр на краю, который двигаешь */
      const start = Timeline.starts(p)[g.i];
      peek = g.edge === 'in' ? start : start + Timeline.len(c) - 1;
      dirty = true;
      renderTrack();
      syncTime();
    }

    function startDrag() {
      g.kind = 'drag';
      g.to = g.i;
      const els = [...box.querySelectorAll('.vlog-clip')];
      g.mids = els.map((el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; });
      g.el = els[g.i];
      g.el.classList.add('drag');
    }
    function dragMove(cx) {
      g.el.style.transform = `translateX(${cx - g.x}px)`;
      let to = 0;
      g.mids.forEach((m, k) => { if (k !== g.i && cx > m) to = k < g.i ? k + 1 : k; });
      if (cx <= Math.min(...g.mids)) to = 0;
      g.to = Math.max(0, Math.min(p.clips.length - 1, to));
      [...box.querySelectorAll('.vlog-clip')].forEach((el, k) => el.classList.toggle('drop', k === g.to && k !== g.i));
    }
    function dragEnd(was) {
      if (was.to !== was.i) {
        commit(() => Timeline.move(p, was.i, was.to));
        sel = was.to;
        syncAll();
      } else renderTrack();
    }
  }

  /* Полоска надписи: нажал — выбрана; выбранную тянешь целиком (сдвиг по времени) или за края (начало и конец). */
  function bindOverlayGestures(box) {
    let g = null;
    box.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.vlog-ov');
      if (!el || e.button > 0) return;
      const id = el.dataset.id;
      const edge = e.target.dataset.edge || '';
      const mouse = e.pointerType === 'mouse';
      if (!edge && id !== ov && !mouse) {
        g = { kind: 'tap', id, x: e.clientX, y: e.clientY, pid: e.pointerId };
        return;
      }
      if (Engine.playing) { Engine.pause(); syncPlay(); }
      const o = p.overlays.find((x) => x.id === id);
      g = { kind: edge ? 'trim' : 'move', edge, id, x: e.clientX, pid: e.pointerId, start: o.start, end: o.end, from: o.layer.from || 0, pushed: false };
      try { box.setPointerCapture(e.pointerId); } catch { /* палец уже отпущен */ }
      if (id !== ov) selectOv(id, false);
      e.preventDefault();
    });
    box.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.pid) return;
      const dx = e.clientX - g.x;
      if (g.kind === 'tap') {
        if (Math.abs(dx) > 8 || Math.abs(e.clientY - g.y) > 8) g = null;
        return;
      }
      if (Math.abs(dx) < 3 && !g.pushed) return;
      const o = p.overlays.find((x) => x.id === g.id);
      if (!o) return;
      if (!g.pushed) { hist.push(p); g.pushed = true; }
      const ms = (dx * 1000) / pps;
      const T = total();
      const MIN = Timeline.MIN_MS;
      if (g.kind === 'move') {
        const l = g.end - g.start;
        o.start = Math.round(Math.max(0, Math.min(T - l, g.start + ms)));
        o.end = o.start + l;
        peek = o.start;
      } else if (g.edge === 'in') {
        /* у голоса начало полоски сдвигает и место в записи: нельзя уйти раньше начала записи */
        const minStart = isVoiceOv(o) ? g.start - g.from : 0;
        o.start = Math.round(Math.max(0, minStart, Math.min(o.end - MIN, g.start + ms)));
        if (isVoiceOv(o)) o.layer.from = Math.max(0, g.from + (o.start - g.start));
        peek = o.start;
      } else {
        /* голос не тянется дальше конца записи */
        const maxEnd = isVoiceOv(o) ? o.start + (o.layer.dur || Infinity) - (o.layer.from || 0) : T;
        o.end = Math.round(Math.max(o.start + MIN, Math.min(T, maxEnd, g.end + ms)));
        peek = o.end - 1;
      }
      dirty = true;
      renderOverlays();
      syncTime();
    });
    const end = (e) => {
      if (!g || e.pointerId !== g.pid) return;
      const was = g;
      g = null;
      if (was.kind === 'tap') selectOv(was.id === ov ? '' : was.id);
      else if (was.pushed) {
        /* указатель встаёт туда, куда двигали, чтобы надпись была видна */
        if (peek != null) at = peek;
        peek = null;
        changed();
      }
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
  }

  const CLIP_SHEETS = ['frame', 'card', 'layout', 'look', 'fx', 'scan', 'shape', 'speed', 'vol', 'dur'];
  const OV_SHEETS = ['text', 'style', 'anim', 'ovfx', 'ovscan', 'voicevol'];
  /* у эффекта на время свои шторки, у надписи и стикера свои */
  const ovSheetOk = (o, s) => (isFxOv(o) ? ['ovfx', 'ovscan'] : isVoiceOv(o) ? ['voicevol'] : ['text', 'style', 'anim']).includes(s);
  function selectOv(id, jump = true) {
    ov = id;
    sel = -1;
    join = -1;
    if (CLIP_SHEETS.includes(sheet) || sheet === 'trans' || (!id && OV_SHEETS.includes(sheet))) sheet = '';
    const o = overlay();
    if (o && OV_SHEETS.includes(sheet) && !ovSheetOk(o, sheet)) sheet = isFxOv(o) ? 'ovfx' : isVoiceOv(o) ? 'voicevol' : '';
    if (o && jump && (at < o.start || at >= o.end)) at = o.start;
    syncAll();
  }
  function selectJoin(i) {
    join = i;
    sel = -1;
    ov = '';
    if (Engine.playing) { Engine.pause(); syncPlay(); }
    /* указатель на стык, чтобы переход было видно */
    if (i >= 0) at = Math.max(0, Timeline.starts(p)[i + 1] - Timeline.trDur(p, i) / 2 - 150);
    sheet = i >= 0 ? 'trans' : '';
    syncAll();
  }

  function select(i) {
    if (i !== sel) pieceSel = -1;
    sel = i;
    if (i >= 0) { ov = ''; join = -1; }
    if (OV_SHEETS.includes(sheet) || sheet === 'trans') sheet = '';
    if (i < 0 && CLIP_SHEETS.includes(sheet)) sheet = '';
    /* в просмотре сразу видно выбранный клип: если указатель вне его, ставим на начало */
    if (i >= 0) {
      const s = Timeline.starts(p)[i];
      if (at < s || at >= s + Timeline.len(p.clips[i])) at = s;
    }
    syncAll();
  }

  /* ---------- надпись на просмотре: тянуть, растягивать, поворачивать ---------- */
  function canvasPoint(e) {
    const c = canvasEl();
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  }
  function boxOf(o) {
    const c = canvasEl();
    return Engine.overlayBox(c.getContext('2d'), o, c.width, c.height);
  }
  /* точку переводим в систему повёрнутой рамки и проверяем, внутри ли она (с запасом для пальца) */
  function inside(o, pt) {
    const b = boxOf(o);
    const dx = pt.x - b.cx;
    const dy = pt.y - b.cy;
    const cos = Math.cos(-b.rot);
    const sin = Math.sin(-b.rot);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    const pad = canvasEl().width * 0.03;
    return Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad;
  }
  function hitOverlay(pt) {
    const now = peek ?? at;
    const sel0 = layerOv();
    if (sel0 && now >= sel0.start && now < sel0.end && inside(sel0, pt)) return sel0;
    return Engine.visible(p, now).filter((o) => isLayerOv(o)).reverse().find((o) => inside(o, pt)) || null;
  }

  /* ---------- кадр клипа на просмотре: тянуть — сдвиг, щипок или колесо — масштаб ---------- */
  const ZOOM_OF = (v) => Math.max(1, Math.min(Engine.ZOOM_MAX, v));
  /* сколько пикселей холста можно сдвигать клип (без движения фото, его сдвиг считается от этого места) */
  function clipRoom(c) {
    const m = p.media[c.media];
    const cv = canvasEl();
    /* в карточке место кадра задаёт сама карточка: сдвигать нечего, работает только масштаб */
    if (!m || !m.w || !m.h || c.card || hasShape(c) || hasLayout(c)) return { mx: 0, my: 0 };
    return Engine.framing({ ...c, move: 'none' }, m.w, m.h, cv.width, cv.height);
  }
  const hasShape = (c) => !!(c.shape && c.shape.motif && c.shape.motif !== 'none');
  const hasLayout = (c) => !!(c.layout && (c.layout.collage || c.layout.paper));
  /* выбранный клип должен быть на просмотре, иначе двигали бы невидимое */
  function showSel() {
    const hit = Timeline.at(p, peek ?? at);
    if (hit && hit.i === sel) return;
    at = Timeline.starts(p)[sel];
    dirty = true;
    follow();
    syncTime();
  }

  function positionBox() {
    const boxEl = $('vlogBox');
    if (piecesOn() && !Engine.playing) {
      const q = clip().shape.pieces[pieceSel];
      if (!q) { boxEl.hidden = true; return; }
      const cv = canvasEl();
      const cr = cv.getBoundingClientRect();
      const sr = $('vlogStage').getBoundingClientRect();
      const k = cr.width / cv.width;
      const b = pieceBox(q);
      boxEl.hidden = false;
      boxEl.style.left = `${cr.left - sr.left + b.cx * k}px`;
      boxEl.style.top = `${cr.top - sr.top + b.cy * k}px`;
      boxEl.style.width = `${b.w * k + 12}px`;
      boxEl.style.height = `${b.h * k + 12}px`;
      boxEl.style.transform = `translate(-50%, -50%) rotate(${b.rot}rad)`;
      return;
    }
    const o = layerOv();
    const now = peek ?? at;
    if (!o || Engine.playing || now < o.start || now >= o.end || !p.clips.length) { boxEl.hidden = true; return; }
    const c = canvasEl();
    const cr = c.getBoundingClientRect();
    const sr = $('vlogStage').getBoundingClientRect();
    const k = cr.width / c.width;
    const b = boxOf(o);
    boxEl.hidden = false;
    boxEl.style.left = `${cr.left - sr.left + b.cx * k}px`;
    boxEl.style.top = `${cr.top - sr.top + b.cy * k}px`;
    boxEl.style.width = `${b.w * k + 12}px`;
    boxEl.style.height = `${b.h * k + 12}px`;
    boxEl.style.transform = `translate(-50%, -50%) rotate(${b.rot}rad)`;
  }

  function bindStage() {
    const stage = $('vlogStage');
    const pts = new Map();
    let g = null;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
    const startPinch = () => {
      const o = layerOv();
      const c = clip();
      if ((!o && !c) || pts.size < 2 || Engine.playing) return;
      const [a, b] = [...pts.values()];
      if (o) g = { kind: 'pinch', d0: dist(a, b), a0: angle(a, b), size: o.layer.size, rot: o.layer.rot || 0, pushed: g && g.pushed };
      else g = { kind: 'zoom', d0: dist(a, b), zoom: c.zoom || 1, pushed: g && g.pushed };
    };
    /* сдвиг и масштаб выбранного клипа */
    const frameMove = (pt) => {
      const c = clip();
      if (!c) return;
      if (g.kind === 'pan' && !g.pushed && dist(pt, g.pt) < 4) return;
      if (!g.pushed) { hist.push(p); g.pushed = true; }
      if (g.kind === 'pan') {
        /* у середины кадр прилипает к центру */
        const snap = (v) => (Math.abs(v) < 0.04 ? 0 : Math.max(-1, Math.min(1, v)));
        if (g.inner) {
          const cv = canvasEl();
          const lim = (v) => (Math.abs(v) < 0.02 ? 0 : Math.max(-0.5, Math.min(0.5, v)));
          c.cx = lim(g.cx + (pt.x - g.pt.x) / cv.width);
          c.cy = lim(g.cy + (pt.y - g.pt.y) / cv.height);
        } else {
          if (g.room.mx) c.x = snap(g.x + (pt.x - g.pt.x) / g.room.mx);
          if (g.room.my) c.y = snap(g.y + (pt.y - g.pt.y) / g.room.my);
        }
      } else if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const z = ZOOM_OF(g.zoom * (dist(a, b) / Math.max(4, g.d0)));
        c.zoom = Math.abs(z - 1) < 0.03 ? 1 : z;
      }
      dirty = true;
    };
    stage.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || e.target.closest('.vlog-empty')) return;
      const pt = canvasPoint(e);
      pts.set(e.pointerId, pt);
      try { stage.setPointerCapture(e.pointerId); } catch { /* палец уже отпущен */ }
      if (pts.size === 2) { startPinch(); return; }
      if (piecesOn() && !Engine.playing) {
        const c = clip();
        showSel();
        if (e.target.id === 'vlogBoxH' && c.shape.pieces[pieceSel]) {
          const b = pieceBox(c.shape.pieces[pieceSel]);
          const center = { x: b.cx, y: b.cy };
          g = { kind: 'pieceTurn', i: pieceSel, center, d0: dist(center, pt), a0: angle(center, pt), size: c.shape.pieces[pieceSel].size, rot: c.shape.pieces[pieceSel].rot || 0 };
          e.preventDefault();
          return;
        }
        const i = hitPiece(c, pt);
        if (i >= 0) {
          if (i !== pieceSel) { pieceSel = i; syncSheet(); }
          const q = c.shape.pieces[i];
          g = { kind: 'piece', i, pt, x: q.x, y: q.y };
          e.preventDefault();
          return;
        }
      }
      if (e.target.id === 'vlogBoxH') {
        const o = layerOv();
        const b = boxOf(o);
        const center = { x: b.cx, y: b.cy };
        g = { kind: 'turn', center, d0: dist(center, pt), a0: angle(center, pt), size: o.layer.size, rot: o.layer.rot || 0 };
        e.preventDefault();
        return;
      }
      const hit = !Engine.playing && hitOverlay(pt);
      if (hit) {
        const again = hit.id === ov;
        if (!again) selectOv(hit.id, false);
        g = { kind: 'move', pt, x: hit.layer.x, y: hit.layer.y, again };
        e.preventDefault();
      } else if (!Engine.playing && clip()) {
        const c = clip();
        showSel();
        /* в карточке, макете или фигуре кадр двигается внутри своего окошка (cx, cy — доли окошка) */
        g = { kind: 'pan', pt, x: c.x || 0, y: c.y || 0, room: clipRoom(c), inner: !!(c.card || hasShape(c) || hasLayout(c)), cx: c.cx || 0, cy: c.cy || 0 };
        e.preventDefault();
      } else g = { kind: 'tap', pt };
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !g) return;
      const pt = canvasPoint(e);
      pts.set(e.pointerId, pt);
      const o = layerOv();
      const c = canvasEl();
      if (g.kind === 'tap') return;
      if (g.kind === 'pan' || g.kind === 'zoom') { frameMove(pt); return; }
      if (g.kind === 'piece' || g.kind === 'pieceTurn') {
        const cl = clip();
        if (!cl || !cl.shape || !cl.shape.pieces) return;
        if (g.kind === 'piece' && !g.pushed && dist(pt, g.pt) < 3) return;
        if (!g.pushed) { hist.push(p); g.pushed = true; }
        if (g.kind === 'piece') {
          setPieces(cl, (list) => {
            list[g.i].x = Math.max(0, Math.min(1, g.x + (pt.x - g.pt.x) / c.width));
            list[g.i].y = Math.max(0, Math.min(1, g.y + (pt.y - g.pt.y) / c.height));
            return list;
          });
        } else {
          setPieces(cl, (list) => {
            list[g.i].size = Math.max(0.04, Math.min(1.2, g.size * (dist(g.center, pt) / Math.max(4, g.d0))));
            let rot = g.rot + angle(g.center, pt) - g.a0;
            if (Math.abs(rot) < 0.05) rot = 0;
            list[g.i].rot = rot;
            return list;
          });
        }
        positionBox();
        return;
      }
      if (!o) return;
      if (g.kind === 'move' && !g.pushed && dist(pt, g.pt) < 4) return;
      if (!g.pushed) { hist.push(p); g.pushed = true; }
      if (g.kind === 'move') {
        /* у середины кадра надпись прилипает к центру */
        let x = g.x + (pt.x - g.pt.x) / c.width;
        let y = g.y + (pt.y - g.pt.y) / c.height;
        if (Math.abs(x - 0.5) < 0.015) x = 0.5;
        if (Math.abs(y - 0.5) < 0.015) y = 0.5;
        o.layer.x = Math.max(-0.2, Math.min(1.2, x));
        o.layer.y = Math.max(-0.2, Math.min(1.2, y));
      } else if (g.kind === 'turn') {
        o.layer.size = Math.max(0.01, Math.min(1.5, g.size * (dist(g.center, pt) / Math.max(4, g.d0))));
        o.layer.rot = g.rot + angle(g.center, pt) - g.a0;
      } else if (g.kind === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        o.layer.size = Math.max(0.01, Math.min(1.5, g.size * (dist(a, b) / Math.max(4, g.d0))));
        o.layer.rot = g.rot + angle(a, b) - g.a0;
      }
      /* поворот прилипает к ровному положению */
      if (Math.abs(o.layer.rot) < 0.05) o.layer.rot = 0;
      dirty = true;
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size) return;
      const was = g;
      g = null;
      if (!was) return;
      if (was.kind === 'tap' || (was.kind === 'pan' && !was.pushed)) {
        if (ov) selectOv('');
        else togglePlay();
      } else if (was.pushed) changed();
      else if (was.kind === 'move' && was.again && overlay() && overlay().layer.type === 'text') openSheet('text');
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    /* колесо мыши над выбранной надписью: размер, с Shift поворот */
    stage.addEventListener('wheel', (e) => {
      const o = layerOv();
      const c = clip();
      /* колесо над выбранным клипом: масштаб кадра */
      if (!o && c && !Engine.playing) {
        e.preventDefault();
        showSel();
        commitQuiet(() => {
          const z = ZOOM_OF((c.zoom || 1) * (e.deltaY < 0 ? 1.06 : 1 / 1.06));
          c.zoom = Math.abs(z - 1) < 0.03 ? 1 : z;
        });
        return;
      }
      if (!o || $('vlogBox').hidden) return;
      e.preventDefault();
      commitQuiet(() => {
        if (e.shiftKey) o.layer.rot = (o.layer.rot || 0) + (e.deltaY < 0 ? 1 : -1) * (Math.PI / 60);
        else o.layer.size = Math.max(0.01, Math.min(1.5, o.layer.size * (e.deltaY < 0 ? 1.06 : 0.94)));
      });
    }, { passive: false });
  }
  /* мелкие правки колесом: копия для отмены одна на серию прокруток */
  let quietTimer = 0;
  function commitQuiet(fn) {
    if (!quietTimer) hist.push(p);
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => { quietTimer = 0; changed(); }, 400);
    fn();
    dirty = true;
  }

  /* ---------- инструменты ---------- */
  const ICONS = {
    add: '<path d="M10 4v12M4 10h12"/>',
    music: '<path d="M8 15V4l9-2v11"/><circle cx="6" cy="15" r="2"/><circle cx="15" cy="13" r="2"/>',
    format: '<rect x="6" y="2.5" width="8" height="15" rx="1"/>',
    split: '<path d="M10 2v16"/><path d="M4 6l3 4-3 4M16 6l-3 4 3 4"/>',
    frame: '<path d="M5.5 2v12.5H18"/><path d="M2 5.5h12.5V18"/>',
    card: '<rect x="3.5" y="2.5" width="13" height="15" rx="1"/><rect x="6" y="5" width="8" height="7"/><path d="M6 14.5h5"/>',
    look: '<circle cx="10" cy="10" r="7"/><path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor"/>',
    fx: '<path d="M10 2v4M10 14v4M2 10h4M14 10h4M4.5 4.5L7 7M13 13l2.5 2.5M15.5 4.5L13 7M7 13l-2.5 2.5"/>',
    speed: '<path d="M3 14a7 7 0 1 1 14 0"/><path d="M10 14l4-5"/>',
    vol: '<path d="M3 8h3l4-3v10l-4-3H3z"/><path d="M13 7c1.5 1.5 1.5 4.5 0 6M15.5 5c3 3 3 7 0 10"/>',
    dur: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/>',
    dup: '<rect x="3" y="6" width="9" height="11" rx="1"/><path d="M7 6V3h10v11h-5"/>',
    del: '<path d="M4 6h12M8 6V3.5h4V6M5.5 6l1 11h7l1-11"/>',
    back: '<path d="M12 4l-6 6 6 6"/>',
    newText: '<path d="M4 4h12M10 4v13"/>',
    text: '<path d="M4 4h12M10 4v13"/>',
    'g-dress': '<rect x="3.5" y="2.5" width="13" height="15" rx="1"/><rect x="6" y="5" width="8" height="7"/><path d="M6 14.5h5"/>',
    auto: '<path d="M4 16L13 7M11.5 5.5l3 3"/><path d="M15 2.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6zM6 3l.5 1 1 .5-1 .5L6 6l-.5-1-1-.5 1-.5zM16 12l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z"/>',
    voice: '<rect x="7.5" y="2.5" width="5" height="9" rx="2.5"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"/>',
    voicevol: '<path d="M3 8h3l4-3v10l-4-3H3z"/><path d="M13 7c1.5 1.5 1.5 4.5 0 6M15.5 5c3 3 3 7 0 10"/>',
    newFx: '<path d="M10 2v4M10 14v4M2 10h4M14 10h4M4.5 4.5L7 7M13 13l2.5 2.5M15.5 4.5L13 7M7 13l-2.5 2.5"/>',
    ovfx: '<path d="M10 2v4M10 14v4M2 10h4M14 10h4M4.5 4.5L7 7M13 13l2.5 2.5M15.5 4.5L13 7M7 13l-2.5 2.5"/>',
    ovscan: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><rect x="7" y="7" width="6" height="6"/>',
    'g-fx': '<path d="M10 2v4M10 14v4M2 10h4M14 10h4M4.5 4.5L7 7M13 13l2.5 2.5M15.5 4.5L13 7M7 13l-2.5 2.5"/>',
    stickers: '<path d="M16.5 11.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h6.5z"/><path d="M11.5 16.5v-3.5a1.5 1.5 0 0 1 1.5-1.5h3.5"/><circle cx="7.5" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>',
    style: '<circle cx="10" cy="10" r="7"/><circle cx="7" cy="8" r="1.2"/><circle cx="12" cy="7" r="1.2"/><circle cx="13" cy="11.5" r="1.2"/>',
    anim: '<path d="M3 15c3 0 4-10 7-10s4 10 7 10"/>',
    layout: '<rect x="3" y="3" width="6" height="6"/><rect x="11" y="3" width="6" height="6"/><rect x="3" y="11" width="6" height="6"/><rect x="11" y="11" width="6" height="6"/>',
    scan: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><rect x="7" y="7" width="6" height="6"/>',
    shape: '<path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.8l5-.7z"/>',
    trans: '<rect x="2.5" y="5" width="7" height="10" rx="1"/><rect x="10.5" y="5" width="7" height="10" rx="1" opacity=".5"/><path d="M8 10h4"/>',
  };
  function toolBtn(id, label, on) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tool = id;
    if (on) b.classList.add('on');
    b.innerHTML = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ''}</svg><span></span>`;
    b.querySelector('span').textContent = t(label);
    return b;
  }

  function syncTools() {
    const nav = $('vlogTools');
    nav.textContent = '';
    const c = clip();
    const o = overlay();
    nav.classList.toggle('clip-mode', !!(c || o));
    $('vlogStage').classList.toggle('pan', !!c && !o);
    if (isVoiceOv(o)) {
      nav.append(toolBtn('back', 'Все клипы'), toolBtn('voicevol', 'Громкость', sheet === 'voicevol'), toolBtn('dup', 'Копия'), toolBtn('del', 'Удалить'));
      requestAnimationFrame(fadeTools);
      return;
    }
    if (isFxOv(o)) {
      nav.append(toolBtn('back', 'Все клипы'), toolBtn('ovfx', 'Эффект', sheet === 'ovfx'), toolBtn('ovscan', 'Сканер', sheet === 'ovscan'), toolBtn('dup', 'Копия'), toolBtn('del', 'Удалить'));
      requestAnimationFrame(fadeTools);
      return;
    }
    if (o) {
      nav.append(toolBtn('back', 'Все клипы'));
      if (o.layer.type === 'text') nav.append(toolBtn('text', 'Текст', sheet === 'text'));
      else nav.append(toolBtn('style', 'Вид', sheet === 'style'));
      nav.append(toolBtn('anim', 'Появление', sheet === 'anim'), toolBtn('dup', 'Копия'), toolBtn('del', 'Удалить'));
      return;
    }
    if (!c) {
      nav.append(
        toolBtn('add', 'Добавить'), toolBtn('auto', 'Собрать', sheet === 'auto'), toolBtn('split', 'Разрезать'), toolBtn('newText', 'Текст'), toolBtn('stickers', 'Стикеры', sheet === 'stickers'), toolBtn('newFx', 'Эффект'), toolBtn('voice', 'Озвучка', sheet === 'voice'),
        toolBtn('trans', 'Переход', sheet === 'trans'), toolBtn('music', 'Музыка', sheet === 'music'), toolBtn('format', 'Формат', sheet === 'format'),
      );
      return;
    }
    /* похожие настройки собраны в группы: одна кнопка, внутри шторки вкладки */
    const open = (g) => GROUPS[g].includes(sheet) || (desktop() && !sheet && g === 'g-fx');
    nav.append(toolBtn('back', 'Все клипы'), toolBtn('split', 'Разрезать'), toolBtn('frame', 'Кадр', sheet === 'frame'), toolBtn('g-dress', 'Оформление', open('g-dress')), toolBtn('g-fx', 'Эффекты', open('g-fx')));
    if (c.kind === 'video') nav.append(toolBtn('speed', 'Скорость', sheet === 'speed'), toolBtn('vol', 'Звук', sheet === 'vol'));
    else nav.append(toolBtn('dur', 'Длина', sheet === 'dur'));
    nav.append(toolBtn('dup', 'Копия'), toolBtn('del', 'Удалить'));
    requestAnimationFrame(fadeTools);
  }

  /* группы инструментов клипа: какие шторки внутри и какая открывалась последней */
  const GROUPS = { 'g-dress': ['card', 'layout', 'shape'], 'g-fx': ['look', 'fx', 'scan'] };
  const groupLast = { 'g-dress': 'card', 'g-fx': 'look' };
  const GROUP_NAMES = { 'g-dress': 'Оформление', 'g-fx': 'Эффекты' };
  const groupOf = (id) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(id)) || '';

  /* Оформление клипа можно скопировать и вставить на другой клип: цвет, эффект, сканер, карточка, макет, фигура.
     Кадр, обрезка, скорость и звук остаются у клипа свои. */
  const STYLE_KEYS = ['look', 'fx', 'fxs', 'scan', 'card', 'cardId', 'layout', 'shape'];
  let styleCopy = null;
  function styleRow() {
    const c = clip();
    const row = el('div', 'row vlog-style-row');
    const copy = el('button', 'btn small', t('Скопировать оформление'));
    copy.type = 'button';
    copy.onclick = () => {
      styleCopy = JSON.parse(JSON.stringify(Object.fromEntries(STYLE_KEYS.map((k) => [k, c[k]]))));
      toast(t('Оформление скопировано: выбери другой клип и нажми «Вставить».'));
      syncSheet();
    };
    const paste = el('button', 'btn small', t('Вставить'));
    paste.type = 'button';
    paste.disabled = !styleCopy;
    paste.onclick = () => {
      if (!styleCopy) return;
      const from = JSON.parse(JSON.stringify(styleCopy));
      commit(() => STYLE_KEYS.forEach((k) => {
        if (from[k] === undefined || from[k] === '') { if (k === 'look' || k === 'fx') c[k] = ''; else delete c[k]; }
        else c[k] = from[k];
      }));
      toast(t('Оформление вставлено.'));
    };
    row.append(copy, paste);
    return row;
  }

  /* у панели инструментов, которая не влезает, край тает: видно, что её можно листать */
  function fadeTools() {
    const nav = $('vlogTools');
    nav.classList.toggle('more-r', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
    nav.classList.toggle('more-l', nav.scrollLeft > 2);
  }

  function runTool(id) {
    if (id === 'add') return $('vlogFiles').click();
    if (id === 'back') { select(-1); return selectOv(''); }
    if (id === 'split') return split();
    if (id === 'newText') return addText();
    if (id === 'newFx') return addEffect();
    if (id === 'trans') {
      /* стык ближе всего к указателю */
      if (p.clips.length < 2) { toast(t('Переход ставится между клипами: добавь хотя бы два.')); return; }
      const st = Timeline.starts(p);
      let best = 0;
      for (let i = 1; i < st.length; i++) if (Math.abs(st[i] - at) < Math.abs(st[best + 1] - at)) best = i - 1;
      return selectJoin(best);
    }
    if (overlay() && (id === 'dup' || id === 'del')) {
      const o = overlay();
      if (id === 'del') { commit(() => { p.overlays = p.overlays.filter((x) => x.id !== o.id); }); return selectOv(''); }
      const copy = JSON.parse(JSON.stringify(o));
      copy.id = Timeline.uid();
      copy.layer.x = Math.min(0.9, copy.layer.x + 0.04);
      copy.layer.y = Math.min(0.9, copy.layer.y + 0.04);
      commit(() => p.overlays.push(copy));
      return selectOv(copy.id);
    }
    if (id === 'dup') {
      const i = sel;
      commit(() => Timeline.dup(p, i));
      sel = i + 1;
      return syncAll();
    }
    if (id === 'del') return removeSel();
    if (GROUPS[id]) {
      /* группа открывается на той вкладке, что была последней; повторное нажатие на телефоне закрывает */
      if (GROUPS[id].includes(sheet) && !desktop()) return openSheet('');
      return openSheet(groupLast[id]);
    }
    openSheet(sheet === id && !desktop() ? '' : id);
  }

  function split() {
    if (!p.clips.length) return;
    if (Engine.playing) { at = Engine.pause(); syncPlay(); }
    if (!Timeline.canSplit(p, at)) {
      toast(t('Поставь указатель внутрь клипа, не у самого края.'));
      return;
    }
    commit(() => Timeline.split(p, at));
    sel = Timeline.at(p, at + 1).i;
    syncAll();
  }
  function removeSel() {
    if (overlay()) return runTool('del');
    if (sel < 0) return;
    const i = sel;
    commit(() => Timeline.remove(p, i));
    sel = -1;
    syncAll();
  }

  /* ---------- шторка настроек ---------- */
  const SHEETS = {
    music: 'Музыка', format: 'Формат', frame: 'Кадр', card: 'Карточка', layout: 'Макет', look: 'Цвет', fx: 'Эффект', scan: 'Сканер', shape: 'Фигура', speed: 'Скорость', vol: 'Звук клипа', dur: 'Длина показа', project: 'Влог',
    projects: 'Мои влоги', voice: 'Озвучка', voicevol: 'Голос', auto: 'Собрать за меня', text: 'Текст', stickers: 'Стикеры', ovfx: 'Эффект на время', ovscan: 'Сканер на время', style: 'Вид стикера', anim: 'Появление', trans: 'Переход',
  };
  function openSheet(id) {
    sheet = id;
    syncSheet();
    syncTools();
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function group(label, ...kids) {
    const g = el('div', 'group');
    if (label) g.append(el('span', 'label', t(label)));
    g.append(...kids);
    return g;
  }
  function chips(list, current, pick) {
    const box = el('div', 'chips');
    list.forEach(([v, name]) => {
      const b = el('button', v === current ? 'on' : '', name);
      b.type = 'button';
      b.onclick = () => pick(v);
      box.append(b);
    });
    return box;
  }
  /* ползунок: копия для отмены один раз в начале движения */
  function slider(label, min, max, step, value, show, apply) {
    const wrap = el('label', 'vlog-slider');
    const head = el('span', 'label');
    const name = el('span', '', t(label));
    const val = el('b', '', show(value));
    head.append(name, val);
    const input = el('input');
    Object.assign(input, { type: 'range', min, max, step, value });
    let pushed = false;
    input.addEventListener('input', () => {
      if (!pushed) { hist.push(p); pushed = true; }
      const v = Number(input.value);
      val.textContent = show(v);
      apply(v);
      dirty = true;
      renderTrack();
      syncTime();
    });
    input.addEventListener('change', () => { pushed = false; changed(); });
    wrap.append(head, input);
    return wrap;
  }
  const toAll = (label, fn) => {
    const b = el('button', 'btn small', t(label));
    b.type = 'button';
    b.onclick = () => { commit(fn); toast(t('Готово: применено ко всем клипам.')); };
    return b;
  };

  function syncSheet() {
    const side = $('vlogSide');
    const body = $('vlogSheetBody');
    const o = overlay();
    const id = sheet || (desktop() ? (o ? (isFxOv(o) ? 'ovfx' : isVoiceOv(o) ? 'voicevol' : o.layer.type === 'text' ? 'text' : 'style') : clip() ? 'look' : join >= 0 ? 'trans' : 'project') : '');
    $('vlog').classList.toggle('sheet-open', !!sheet);
    $('vlog').style.setProperty('--vlog-tools-h', `${$('vlogTools').offsetHeight}px`);
    body.textContent = '';
    side.hidden = !id;
    if (!id) return;
    const g = clip() ? groupOf(id) : '';
    $('vlogSheetTitle').textContent = t(g ? GROUP_NAMES[g] : SHEETS[id] || '');
    $('vlogSheetClose').hidden = desktop() && !sheet;
    if (g) {
      /* вкладки группы: переключаются без закрытия шторки */
      groupLast[g] = id;
      const tabs = el('div', 'seg vlog-group-tabs');
      GROUPS[g].forEach((v) => {
        const b = el('button', v === id ? 'on' : '', t(SHEETS[v]));
        b.type = 'button';
        b.onclick = () => openSheet(v);
        tabs.append(b);
      });
      body.append(tabs);
      body.append(styleRow());
    }
    const c = clip();
    if (id === 'project') {
      body.append(el('p', 'hint', t('Нажми на клип в ленте, чтобы настроить его. Перематывай полоской под просмотром или нажми на линейку времени над клипами.')));
      sheetFormat(body);
      sheetMusic(body);
    }
    if (id === 'format') sheetFormat(body);
    if (id === 'projects') sheetProjects(body);
    if (id === 'auto') sheetAuto(body);
    if (id === 'music') sheetMusic(body);
    if (id === 'stickers') sheetStickers(body);
    if (id === 'trans') sheetTrans(body);
    if (o && id === 'text') sheetText(body, o);
    if (o && id === 'style') sheetStyle(body, o);
    if (o && id === 'anim') sheetAnim(body, o);
    if (isFxOv(o) && id === 'ovfx') { sheetFx(body, o.layer, shotOf(o)); sheetSpan(body, o); }
    if (isFxOv(o) && id === 'ovscan') { sheetScan(body, o.layer, shotOf(o)); sheetSpan(body, o); }
    if (isVoiceOv(o) && id === 'voicevol') sheetVoiceVol(body, o);
    if (id === 'voice') sheetVoice(body);
    if (!c) return;
    if (id === 'frame') sheetFrame(body, c);
    if (id === 'card') sheetCard(body, c);
    if (id === 'look') sheetLook(body, c);
    if (id === 'fx') sheetFx(body, c);
    if (id === 'scan') sheetScan(body, c);
    if (id === 'layout') sheetLayout(body, c);
    if (id === 'shape') sheetShape(body, c);
    if (id === 'speed') {
      body.append(group('Скорость', chips(SPEEDS.map((v) => [v, `${v}×`]), c.speed, (v) => commit(() => { c.speed = v; }))));
      body.append(el('p', 'hint', t('Звук ускоряется вместе с видео. Замедленный клип становится длиннее.')));
    }
    if (id === 'vol') {
      body.append(slider('Громкость', 0, 100, 1, c.vol, (v) => `${v}%`, (v) => { c.vol = v; }));
      body.append(toAll('Ко всем клипам', () => p.clips.forEach((x) => { x.vol = c.vol; })));
    }
    if (id === 'dur') {
      body.append(slider('Сколько показывать фото', 500, 10000, 100, c.out - c.in, (v) => `${(v / 1000).toFixed(1)} ${t('с')}`, (v) => { c.in = 0; c.out = v; }));
      body.append(toAll('Ко всем фото', () => p.clips.forEach((x) => { if (x.kind === 'image') { x.in = 0; x.out = c.out - c.in; } })));
    }
  }

  /* ---------- текст и стикеры ---------- */
  const EMOJIS = ['🌸', '🌷', '🌹', '🌼', '🌻', '💐', '🍀', '🌿', '🍒', '🍓', '🍰', '🧁', '🍩', '☕', '🎀', '💌', '💖', '💗', '💕', '💘', '🤍', '🦋', '🐚', '⭐', '🌟', '✨', '🌙', '☁️', '🌈', '🔮', '💿', '📷', '📼', '🎧', '🔒', '🗝️', '🕯️', '🪞', '🧸', '🐱', '🐰', '🫧', '💎', '👑', '🎞️', '📌', '✂️', '🔥', '😂', '🥹', '😍', '👀', '🙌', '✈️', '🌊', '🏝️', '🍕', '🎉'];
  const COLORS = ['#ffffff', '#111111', '#f472b6', '#d64545', '#e8913a', '#ffe27a', '#86c96b', '#6c9fe0', '#1f3a8a', '#a78bfa'];
  /* готовые надписи: шрифт, цвет и подложка разом, текст остаётся свой */
  const TEXT_PRESETS = [
    { name: 'От руки', font: 'caveat', color: '#ffffff', style: 'none', shadow: 'soft' },
    { name: 'Плашка', font: 'golos', color: '#111111', style: 'plaque', bg: '#ffffff', shadow: 'none' },
    { name: 'Жёлтая плашка', font: 'mono', color: '#111111', style: 'plaque', bg: '#ffe27a', shadow: 'none' },
    { name: 'Контур', font: 'unbounded', color: '#ffffff', style: 'outline', bg: '#111111', shadow: 'none' },
    { name: 'Журнал', font: 'yeseva', color: '#ffffff', style: 'none', shadow: 'soft' },
    { name: 'Розовый', font: 'sexsmith', color: '#f9a8d4', style: 'outline', bg: '#ffffff', shadow: 'soft' },
  ];
  let stickerTab = 'emoji';

  function pauseNow() { if (Engine.playing) { at = Engine.pause(); syncPlay(); } }

  function addOverlay(layer, nextSheet) {
    if (!p.clips.length) { toast(t('Сначала добавь клипы или фото.')); return null; }
    pauseNow();
    let o = null;
    commit(() => { o = Timeline.addOverlay(p, layer, Math.min(at, total() - 1)); });
    ov = o.id;
    sel = -1;
    join = -1;
    sheet = nextSheet;
    syncAll();
    return o;
  }
  function addText() {
    const o = addOverlay({ type: 'text', text: t('мой влог'), font: 'caveat', color: '#ffffff', bg: '#ffffff', style: 'none', shadow: 'soft', size: 0.1, x: 0.5, y: 0.3, rot: 0 }, 'text');
    if (!o) return;
    const area = $('vlogSheetBody').querySelector('textarea');
    if (area) { area.focus(); area.select(); }
  }
  /* эффект на время: полоска с указателя на 3 секунды, сразу открыта шторка эффекта */
  function addEffect() {
    addOverlay({ type: 'effect', fx: 'glitch', x: 0.5, y: 0.5, size: 1, rot: 0 }, 'ovfx');
  }
  /* кадр для превью эффекта на время: клип под указателем, если он внутри полоски, иначе под её началом */
  function shotOf(o) {
    const now = peek ?? at;
    const t0 = now >= o.start && now < o.end ? now : o.start;
    const hit = Timeline.at(p, Math.min(t0, Math.max(0, total() - 1)));
    return (hit && hit.clip) || p.clips[0];
  }
  /* когда идёт эффект на время: подсказка и быстрые кнопки «весь ролик» и «только этот клип» */
  function sheetSpan(body, o) {
    body.append(el('p', 'hint', `${t('Видно')} ${fmt(o.start)} – ${fmt(o.end)}. ${t('Края полоски на ленте меняют начало и конец.')}`));
    const row = el('div', 'row');
    const whole = el('button', 'btn small', t('Весь ролик'));
    whole.type = 'button';
    whole.onclick = () => commit(() => { o.start = 0; o.end = Math.round(total()); });
    const thisClip = el('button', 'btn small', t('Только этот клип'));
    thisClip.type = 'button';
    thisClip.onclick = () => {
      const hit = Timeline.at(p, Math.min(at, total() - 1));
      if (hit) commit(() => { o.start = Math.round(hit.start); o.end = Math.round(hit.start + Timeline.len(hit.clip)); });
    };
    const look = el('button', 'btn small', t('Посмотреть'));
    look.type = 'button';
    look.onclick = () => previewFrom(o.start, o.end);
    row.append(look, whole, thisClip);
    body.append(row);
    const check = (label, on, set) => {
      const box = el('label', 'check');
      const input = el('input');
      input.type = 'checkbox';
      input.checked = on;
      input.onchange = () => commit(() => set(input.checked));
      box.append(input, document.createTextNode(t(label)));
      body.append(box);
    };
    check('Плавно появляться', o.anim === 'fade', (v) => { o.anim = v ? 'fade' : ''; });
    check('Плавно исчезать в конце', !!o.fadeOut, (v) => { o.fadeOut = v; });
  }
  function addSticker(layer) {
    const o = addOverlay({ x: 0.5, y: 0.45, rot: (Math.random() - 0.5) * 0.3, ...layer }, desktop() ? 'style' : '');
    if (o && !desktop()) toast(t('Тяни стикер пальцем, двумя пальцами меняй размер и поворот.'));
  }

  /* правка слоя без перестройки шторки: поле ввода не теряет фокус */
  function liveEdit(fn) {
    let pushed = false;
    return (v) => {
      if (!pushed) { hist.push(p); pushed = true; }
      fn(v);
      dirty = true;
      renderOverlays();
    };
  }
  function swatches(current, pick) {
    const box = el('div', 'vlog-swatches');
    COLORS.forEach((c) => {
      const b = el('button', c === current ? 'on' : '');
      b.type = 'button';
      b.style.background = c;
      b.setAttribute('aria-label', c);
      b.onclick = () => pick(c);
      box.append(b);
    });
    return box;
  }
  const editLayer = (o, patch) => commit(() => Object.assign(o.layer, patch));

  function sheetText(body, o) {
    const l = o.layer;
    const area = el('textarea', 'vlog-textarea');
    area.rows = 2;
    area.value = l.text || '';
    const typing = liveEdit((v) => { l.text = v; });
    area.addEventListener('input', () => typing(area.value));
    area.addEventListener('change', () => changed());
    body.append(area);
    if (!l.card) {
      const grid = el('div', 'thumbs vlog-presets');
      TEXT_PRESETS.forEach((pr) => {
        const b = el('button', 'thumb');
        b.type = 'button';
        const sample = { type: 'text', text: t('Аа'), font: pr.font, color: pr.color, bg: pr.bg || '#ffffff', style: pr.style, shadow: 'none', size: 0.2 };
        const thumb = Render.layerThumb(sample, Engine.assets, 64);
        if (pr.color === '#ffffff' && pr.style === 'none') thumb.style.background = '#3a3a3a';
        b.append(thumb, el('span', '', t(pr.name)));
        b.onclick = () => editLayer(o, { font: pr.font, color: pr.color, style: pr.style, bg: pr.bg || l.bg, shadow: pr.shadow });
        grid.append(b);
      });
      body.append(group('Готовые стили', grid));
      body.append(group('Шрифт', chips(Render.FONTS.map((f) => [f.id, f.name]), l.font, (v) => {
        const f = Render.FONTS.find((x) => x.id === v);
        if (f && document.fonts) document.fonts.load(`${f.weight} 40px ${f.css}`).then(() => { dirty = true; kick(); }).catch(() => {});
        editLayer(o, { font: v });
      })));
      body.append(group('Подложка', chips([['none', t('Нет')], ['plaque', t('Плашка')], ['outline', t('Контур')], ['haze', t('Дымка')]], l.style || 'none', (v) => editLayer(o, { style: v }))));
    }
    body.append(group('Цвет текста', swatches(l.color, (c) => editLayer(o, { color: c }))));
    if (l.card || l.style === 'plaque' || l.style === 'outline' || l.style === 'haze') body.append(group(l.card ? 'Фон' : 'Цвет подложки', swatches(l.bg, (c) => editLayer(o, { bg: c }))));
    body.append(slider('Размер', 2, 40, 0.5, Math.round(l.size * 200) / 2, (v) => `${Math.round(v)}`, (v) => { l.size = v / 100; }));
    body.append(el('p', 'hint', t('На кадре надпись можно тянуть; угол рамки меняет размер и поворот. Двумя пальцами тоже.')));
  }

  function sheetStickers(body) {
    const Lib = window.StickerLib;
    const packs = (Lib && Lib.PACK_TABS) || [];
    const recent = Lib && Lib.recent ? Lib.recent() : [];
    if (stickerTab === 'recent' && !recent.length) stickerTab = 'emoji';
    const tabs = [...(recent.length ? [['recent', t('Недавние')]] : []), ['emoji', t('Эмодзи')], ['doodles', t('Дудлы')], ['ready', t('Готовые')], ['cards', t('Карточки')], ...packs.map(([id, name]) => [id, t(name)]), ['mine', t('Мои картинки')]];
    body.append(chips(tabs, stickerTab, (v) => { stickerTab = v; syncSheet(); }));
    const grid = el('div', 'vlog-stickers');
    const pack = packs.find(([id]) => id === stickerTab);
    if (pack) {
      /* стикер с листа вырезается один раз и хранится во влоге как своя картинка */
      grid.classList.add('packs');
      const status = el('p', 'hint', t('Загружаю стикеры…'));
      body.append(status, grid);
      Lib.fill(grid, pack[0], pack[1], async (id, makeBlob, label) => {
        let m = Object.values(p.media).find((x) => x.kind === 'sticker' && x.pack === id);
        if (!m) {
          const blob = await makeBlob();
          m = await Engine.importFile(new File([blob], 'sticker.png', { type: 'image/png' }));
          delete m.unsaved;
          m.kind = 'sticker';
          m.pack = id;
          m.name = label || '';
          p.media[m.id] = m;
        }
        addSticker({ type: 'sticker', img: m.id, size: 0.4 });
      }).then((failed) => {
        if (!status.isConnected) return;
        status.hidden = !failed;
        if (failed) status.textContent = t('Часть стикеров не загрузилась. Открой вкладку ещё раз.');
      });
      return;
    }
    const btn = (label, content, layer) => {
      const b = el('button');
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      if (typeof content === 'string') b.textContent = content;
      else b.append(content);
      b.onclick = () => {
        /* недавние общие с редактором карточек */
        const key = layer.emoji ? `e:${layer.emoji}` : layer.vec ? `v:${layer.vec}` : '';
        if (key && Lib && Lib.remember) Lib.remember(key);
        addSticker(layer);
      };
      grid.append(b);
    };
    const vecBtn = (v) => {
      const cv = Render.canvas(64, 64);
      Render.drawVector(cv.getContext('2d'), v.id, 32, 32, 52, v.color);
      btn(t(v.name), cv, { type: 'sticker', vec: v.id, color: v.color, size: v.size || 0.35 });
    };
    if (stickerTab === 'recent') {
      recent.forEach((k) => {
        if (k.startsWith('e:')) btn(k.slice(2), k.slice(2), { type: 'sticker', emoji: k.slice(2), size: 0.2 });
        else { const v = Lib.vecDef(k.slice(2)); if (v) vecBtn(v); }
      });
    }
    if (stickerTab === 'emoji') EMOJIS.forEach((e) => btn(e, e, { type: 'sticker', emoji: e, size: 0.2 }));
    /* дудлы белые, как маркером по кадру */
    if (stickerTab === 'doodles') {
      Render.DOODLES.forEach(([id, name]) => {
        const c = Render.canvas(64, 64);
        Render.drawVector(c.getContext('2d'), id, 32, 32, 52, '#ffffff');
        btn(t(name), c, { type: 'sticker', vec: id, color: '#ffffff', size: 0.16 });
      });
    }
    if (stickerTab === 'ready') {
      Render.VECTORS.forEach((v) => {
        const c = Render.canvas(64, 64);
        Render.drawVector(c.getContext('2d'), v.id, 32, 32, 52, v.color);
        btn(t(v.name), c, { type: 'sticker', vec: v.id, color: v.color, size: v.size || 0.35 });
      });
    }
    if (stickerTab === 'cards') {
      grid.classList.add('wide');
      Render.CARDS.filter((d) => d.kind !== 'player').forEach((d) => {
        const layer = { type: 'text', card: d.kind, text: t(d.text), color: d.color, bg: d.bg, font: 'golos', size: 0.045 };
        btn(t(d.name), Render.layerThumb(layer, Engine.assets, 96), layer);
      });
    }
    if (stickerTab === 'mine') {
      const up = el('button', 'btn small', t('Загрузить картинку'));
      up.type = 'button';
      up.onclick = () => $('vlogStickerFile').click();
      body.append(up);
      Object.values(p.media).filter((m) => m.kind === 'sticker' && !m.pack).forEach((m) => {
        const img = new Image();
        img.src = m.thumb;
        img.alt = '';
        btn(m.name || t('Картинка'), img, { type: 'sticker', img: m.id, size: 0.4 });
      });
      if (!grid.children.length) body.append(el('p', 'hint', t('PNG с прозрачным фоном выглядит как настоящая наклейка.')));
    }
    body.append(grid);
  }

  function sheetStyle(body, o) {
    const l = o.layer;
    body.append(slider('Размер', 2, 100, 1, Math.round(l.size * 100), (v) => `${v}`, (v) => { l.size = v / 100; }));
    if (l.vec) body.append(group('Цвет', swatches(l.color, (c) => editLayer(o, { color: c }))));
    /* эффект только на сам стикер, как в карточке */
    const cur = (l.fx && l.fx.id) || '';
    body.append(group('Эффект стикера', chips([['', t('Без эффекта')], ...Render.STICKER_FX.map((f) => [f.id, t(f.name)])], cur, (v) => {
      editLayer(o, { fx: v ? { id: v, amount: (l.fx && l.fx.amount) ?? 1, seed: (l.fx && l.fx.seed) ?? 1 } : null });
    })));
    if (cur) {
      body.append(slider('Сила эффекта', 40, 250, 5, Math.round(((l.fx && l.fx.amount) ?? 1) * 100), (v) => `${v}%`, (v) => { l.fx = { ...l.fx, amount: v / 100 }; }));
    }
    body.append(group('Обводка', chips([[false, t('Нет')], [true, t('Край наклейки')]], !!l.die, (v) => editLayer(o, { die: v }))));
    if (l.die) {
      body.append(slider('Толщина обводки', 15, 120, 5, Math.round((l.dieW ?? 0.05) * 1000), (v) => `${v}`, (v) => { l.dieW = v / 1000; }));
      body.append(group('Цвет обводки', swatches(l.dieColor || '#ffffff', (c) => editLayer(o, { dieColor: c }))));
    }
    body.append(group('', chips([[false, t('Как есть')], [true, t('Отразить')]], !!l.flip, (v) => editLayer(o, { flip: v }))));
    body.append(slider('Прозрачность', 10, 100, 1, Math.round((l.opacity ?? 1) * 100), (v) => `${v}%`, (v) => { l.opacity = v / 100; }));
  }

  function sheetAnim(body, o) {
    const canType = o.layer.type === 'text' && !o.layer.card;
    const list = Engine.ANIMS.filter((a) => !a.text || canType).map((a) => [a.id, t(a.name)]);
    body.append(group('Как появляется', chips(list, o.anim || '', (v) => { commit(() => { o.anim = v; }); previewFrom(o.start, o.start + 1500); })));
    const out = el('label', 'check');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = !!o.fadeOut;
    box.onchange = () => commit(() => { o.fadeOut = box.checked; });
    out.append(box, document.createTextNode(t('Плавно исчезать в конце')));
    body.append(out);
    body.append(el('p', 'hint', `${t('Видно')} ${fmt(o.start)} – ${fmt(o.end)}. ${t('Края полоски на ленте меняют начало и конец.')}`));
    const row = el('div', 'row');
    const whole = el('button', 'btn small', t('Весь ролик'));
    whole.type = 'button';
    whole.onclick = () => commit(() => { o.start = 0; o.end = Math.round(total()); });
    const thisClip = el('button', 'btn small', t('Только этот клип'));
    thisClip.type = 'button';
    thisClip.onclick = () => {
      const hit = Timeline.at(p, Math.min(at, total() - 1));
      if (hit) commit(() => { o.start = Math.round(hit.start); o.end = Math.round(hit.start + Timeline.len(hit.clip)); });
    };
    row.append(whole, thisClip);
    body.append(row);
  }

  /* ---------- переходы ---------- */
  function sheetTrans(body) {
    if (join < 0 || join >= p.clips.length - 1) {
      body.append(el('p', 'hint', t('Нажми на квадратик между двумя клипами на ленте.')));
      return;
    }
    const c = p.clips[join];
    const cur = (c.tr && c.tr.id) || '';
    body.append(el('p', 'hint', `${t('Стык')} ${join + 1} → ${join + 2}`));
    body.append(chips(Engine.TRANSITIONS.map((x) => [x.id, t(x.name)]), cur, (v) => {
      commit(() => {
        if (v) c.tr = { id: v, dur: (c.tr && c.tr.dur) || Timeline.TR_MS };
        else delete c.tr;
      });
      if (v) previewJoin();
    }));
    if (cur) {
      body.append(slider('Длина перехода', 200, 1500, 50, (c.tr && c.tr.dur) || Timeline.TR_MS, (v) => `${(v / 1000).toFixed(2)} ${t('с')}`, (v) => { c.tr.dur = v; }));
      const row = el('div', 'row');
      const look = el('button', 'btn small', t('Посмотреть'));
      look.type = 'button';
      look.onclick = previewJoin;
      row.append(look, toAll('Ко всем стыкам', () => p.clips.forEach((x, i) => { if (i < p.clips.length - 1) x.tr = { ...c.tr }; })));
      body.append(row);
    }
    if (c.media === p.clips[join + 1].media && c.kind === 'video') {
      body.append(el('p', 'hint', t('Это две части одного видео: переход между ними будет видно как обычную склейку.')));
    }
  }
  /* короткий показ вокруг стыка или с начала надписи */
  let stopAt = null;
  function previewFrom(from, to) {
    if (!p.clips.length) return;
    at = Math.max(0, from);
    stopAt = Math.min(total(), to);
    Engine.play(p, at);
    syncPlay();
  }
  function previewJoin() {
    if (join < 0) return;
    const b = Timeline.starts(p)[join + 1];
    const d = Timeline.trDur(p, join);
    previewFrom(b - d / 2 - 500, b + d / 2 + 500);
  }

  /* ---------- «Собрать за меня»: готовый черновик одним нажатием ----------
     Стиль задаёт музыку, длину фото, движение, переходы, цвет и подпись в начале. Всё ставится одним шагом отмены.
     photo: секунд на фото; video: самое длинное видео, с; стыки потом встают на ближайший такт музыки. */
  const AUTO_STYLES = [
    { id: 'calm', name: 'Спокойный', track: 'dream', photo: 3.5, video: 6, look: 'dream', tr: ['fade'], trMs: 900, moves: ['in', 'out', 'left', 'right'],
      title: { font: 'yeseva', color: '#ffffff', style: 'none', shadow: 'soft', anim: 'fade' } },
    { id: 'energy', name: 'Бодрый', track: 'neon', photo: 1.7, video: 3, look: 'flash', tr: ['zoom', 'slide', 'flash'], trMs: 350, moves: ['in', 'left', 'right', 'out'],
      title: { font: 'unbounded', color: '#ffffff', style: 'outline', bg: '#111111', shadow: 'none', anim: 'pop' } },
    { id: 'film', name: 'Плёнка', track: 'lofi', photo: 3, video: 5, look: 'film', tr: ['black'], trMs: 700, moves: ['in', 'none', 'out', 'none'],
      title: { font: 'mono', color: '#111111', style: 'plaque', bg: '#ffe27a', shadow: 'none', anim: 'type' } },
    { id: 'diary', name: 'Дневник', track: 'lofi', photo: 3, video: 5, look: 'warm', tr: ['fade', 'slide'], trMs: 600, moves: ['in', 'right', 'out', 'left'],
      title: { font: 'caveat', color: '#ffffff', style: 'none', shadow: 'soft', anim: 'rise' } },
    { id: 'retro', name: 'Ретро', track: 'lofi', photo: 2.5, video: 4, look: 'p1994', tr: ['flash', 'black'], trMs: 400, moves: ['in', 'none'],
      title: { font: 'retrogression', color: '#ffe27a', style: 'none', shadow: 'soft', anim: 'type' } },
    { id: 'night', name: 'Ночь', track: 'dream', photo: 3, video: 5, look: 'pNightDriving', tr: ['black', 'fade'], trMs: 800, moves: ['out', 'in'],
      title: { font: 'dreamer', color: '#ffffff', style: 'haze', bg: '#1f3a8a', shadow: 'none', anim: 'fade' } },
    { id: 'tender', name: 'Нежный', track: 'dream', photo: 3.5, video: 5, look: 'pink', tr: ['fade'], trMs: 1000, moves: ['in', 'out'],
      title: { font: 'sexsmith', color: '#f9a8d4', style: 'outline', bg: '#ffffff', shadow: 'soft', anim: 'rise' } },
    { id: 'mono', name: 'Ч/б', track: 'lofi', photo: 2.5, video: 4, look: 'bw', tr: ['black', 'slide'], trMs: 500, moves: ['none', 'in'],
      title: { font: 'mono', color: '#ffffff', style: 'plaque', bg: '#111111', shadow: 'none', anim: 'type' } },
  ];
  /* свои стили: сохраняются из оформления влога, общие для всех влогов (Store 'vlogStyles') */
  let ownStyles = [];
  const allStyles = () => [...AUTO_STYLES, ...ownStyles];
  /* стиль из того, как оформлен влог сейчас: музыка, длина фото, движения, переходы, цвет, подпись */
  function styleFromVlog() {
    const imgs = p.clips.filter((c) => c.kind === 'image');
    const vids = p.clips.filter((c) => c.kind === 'video');
    const joins = p.clips.slice(0, -1).filter((c) => c.tr && c.tr.id);
    const titleOv = p.overlays.find((o) => o.layer.auto) || p.overlays.find((o) => o.layer.type === 'text' && !o.layer.card);
    const tl = titleOv && titleOv.layer;
    const avg = (list) => list.reduce((s, x) => s + x, 0) / Math.max(1, list.length);
    return {
      track: p.music.fileId ? '' : p.music.track || '',
      photo: imgs.length ? Math.round(avg(imgs.map((c) => Timeline.len(c))) / 100) / 10 : 3,
      video: vids.length ? Math.round(Math.max(...vids.map((c) => Timeline.len(c))) / 100) / 10 : 5,
      look: (p.clips.find((c) => c.look) || {}).look || '',
      tr: joins.length ? [...new Set(joins.map((c) => c.tr.id))] : [''],
      trMs: joins.length ? joins[0].tr.dur || Timeline.TR_MS : Timeline.TR_MS,
      moves: imgs.length ? imgs.map((c) => c.move || 'none').slice(0, 6) : ['none'],
      title: tl ? { font: tl.font, color: tl.color, style: tl.style || 'none', bg: tl.bg, shadow: tl.shadow || 'none', anim: titleOv.anim || 'fade' }
        : { font: 'golos', color: '#ffffff', style: 'none', shadow: 'soft', anim: 'fade' },
    };
  }
  async function saveOwnStyle() {
    if (!p.clips.length) return;
    const n = ownStyles.length + 1;
    const st = { id: `own-${Timeline.uid()}`, own: true, name: `${t('Мой стиль')} ${n}`, ...styleFromVlog() };
    ownStyles = [...ownStyles, st];
    await Store.set('vlogStyles', ownStyles);
    autoStyle = st.id;
    toast(t('Стиль сохранён: его можно применить к любому влогу.'));
    syncSheet();
  }
  async function deleteOwnStyle(id) {
    ownStyles = ownStyles.filter((x) => x.id !== id);
    await Store.set('vlogStyles', ownStyles);
    autoStyle = 'calm';
    syncSheet();
  }
  let autoStyle = 'calm';
  let autoTitle = null;
  let autoOwn = true;
  let autoBusy = false;
  function sheetAuto(body) {
    if (!p.clips.length) {
      body.append(el('p', 'hint', t('Сначала добавь клипы и фото: из них соберётся ролик.')));
      return;
    }
    const grid = el('div', 'thumbs vlog-looks vlog-auto-styles');
    const shot = p.clips[0];
    if (!allStyles().some((x) => x.id === autoStyle)) autoStyle = 'calm';
    allStyles().forEach((st) => {
      const look = Engine.looks().find((l) => l.id === st.look);
      const b = el('button', `thumb${st.id === autoStyle ? ' on' : ''}`);
      b.type = 'button';
      b.title = st.own ? st.name : t(st.name);
      b.append(lookThumb(shot, look || null), el('span', '', st.own ? st.name : t(st.name)));
      b.onclick = () => { autoStyle = st.id; syncSheet(); };
      grid.append(b);
    });
    body.append(group('Стиль', grid));
    /* свой стиль: сохранить оформление этого влога или удалить выбранный свой */
    const mine = el('div', 'row');
    const keep = el('button', 'btn small', t('Сохранить оформление как свой стиль'));
    keep.type = 'button';
    keep.onclick = saveOwnStyle;
    mine.append(keep);
    const cur = ownStyles.find((x) => x.id === autoStyle);
    if (cur) {
      const del = el('button', 'btn small', t('Удалить этот стиль'));
      del.type = 'button';
      let armed = false;
      del.onclick = () => {
        if (!armed) { armed = true; del.textContent = t('Точно?'); del.classList.add('danger'); return; }
        deleteOwnStyle(cur.id);
      };
      mine.append(del);
    }
    body.append(mine);
    const title = el('input', 'vlog-input');
    title.type = 'text';
    title.placeholder = t('Без подписи');
    title.value = autoTitle != null ? autoTitle : ((entry() && entry().name) || '');
    title.addEventListener('input', () => { autoTitle = title.value; });
    body.append(group('Подпись в начале', title));
    if (p.music.fileId) {
      const own = el('label', 'check');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = autoOwn;
      box.onchange = () => { autoOwn = box.checked; };
      own.append(box, document.createTextNode(`${t('Оставить мою музыку')}: ${p.music.name || t('Свой трек')}`));
      body.append(own);
    }
    const go = el('button', 'btn primary', autoBusy ? t('Собираю…') : t('Собрать'));
    go.type = 'button';
    go.disabled = autoBusy;
    go.onclick = autoAssemble;
    body.append(go);
    body.append(el('p', 'hint', t('Ставит музыку, длину фото, движение, переходы, цвет и подпись, а стыки — на такт. Твои эффекты, надписи и стикеры остаются. Не понравилось — «Отменить» вернёт как было.')));
  }
  async function autoAssemble() {
    if (autoBusy || !p.clips.length) return;
    const st = allStyles().find((x) => x.id === autoStyle) || AUTO_STYLES[0];
    autoBusy = true;
    syncSheet();
    pauseNow();
    hist.push(p);
    try {
      /* у своего стиля со своей музыкой трека нет: музыка влога остаётся */
      if (st.track && !(autoOwn && p.music.fileId)) {
        p.music = { ...p.music, track: st.track, fileId: '', name: '', start: 0 };
        Engine.resetMusic();
      }
      p.music.fadeIn = p.music.fadeIn || 0.5;
      p.music.fadeOut = p.music.fadeOut ?? 1.5;
      p.clips.forEach((c, i) => {
        c.look = st.look;
        if (c.kind === 'image') {
          c.in = 0;
          c.out = Math.round(st.photo * 1000);
          c.move = st.moves[i % st.moves.length];
        } else {
          const max = c.in + st.video * 1000 * (c.speed || 1);
          if (c.out > max) c.out = Math.round(Math.max(c.in + Timeline.MIN_MS, max));
        }
      });
      const info = await Engine.musicInfo(p);
      /* такты с запасом: после подгонки ролик может стать чуть длиннее */
      const beats = Engine.beatTimes(info, p, total() + 10000);
      if (beats.length) Timeline.fitToBeats(p, beats);
      p.clips.forEach((c, i) => {
        if (i < p.clips.length - 1) c.tr = { id: st.tr[i % st.tr.length], dur: st.trMs };
        else delete c.tr;
      });
      /* подпись в начале: прошлую собранную заменяем, свои надписи не трогаем */
      p.overlays = p.overlays.filter((o) => !o.layer.auto);
      const text = (autoTitle != null ? autoTitle : (entry() && entry().name) || '').trim();
      if (text) {
        const { anim, ...look } = st.title;
        const o = Timeline.addOverlay(p, { type: 'text', text, size: 0.09, x: 0.5, y: 0.22, rot: 0, auto: true, ...look }, 0);
        o.end = Math.round(Math.min(total(), 3200));
        o.anim = anim;
        o.fadeOut = true;
        const f = Render.FONTS.find((x) => x.id === look.font);
        if (f && document.fonts) document.fonts.load(`${f.weight} 40px ${f.css}`).then(() => { dirty = true; kick(); }).catch(() => {});
      }
      at = 0;
      changed();
      toast(`${t('Готово')}: ${t(st.name).toLowerCase()} ${t('стиль')}, ${fmt(total())}. ${beats.length ? t('Стыки на такте.') : ''}`);
    } finally {
      autoBusy = false;
      syncSheet();
    }
  }

  /* ---------- озвучка: голос с микрофона поверх ролика ----------
     Запись идёт с линии воспроизведения; ролик в это время играет без звука в динамиках, чтобы микрофон
     не записал музыку и звук клипов. Готовая запись ложится зелёной полоской на свою дорожку. */
  let rec = null;
  function sheetVoice(body) {
    if (!p.clips.length) { body.append(el('p', 'hint', t('Сначала добавь клипы и фото.'))); return; }
    const can = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    const row = el('div', 'vlog-rec');
    if (rec) {
      const stop = el('button', 'btn primary', `■ ${t('Стоп')}`);
      stop.type = 'button';
      stop.onclick = stopVoice;
      const dot = el('i', 'vlog-rec-dot');
      const time = el('b', '', fmt(0));
      time.id = 'vlogRecTime';
      row.append(stop, dot, time);
    } else {
      const go = el('button', 'btn primary', `● ${t('Записать с')} ${fmt(at)}`);
      go.type = 'button';
      go.disabled = !can;
      go.onclick = startVoice;
      row.append(go);
    }
    body.append(row);
    body.append(el('p', 'hint', t(can
      ? 'Ролик пойдёт с линии воспроизведения без звука, говори в микрофон. Лучше в наушниках. Музыка под голосом сама станет тише. Запись можно двигать и обрезать на ленте.'
      : 'Этот браузер не даёт записывать с микрофона.')));
  }
  async function startVoice() {
    if (rec) return;
    pauseNow();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast(t('Нет доступа к микрофону. Разреши его в настройках браузера.'), 6000);
      return;
    }
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const parts = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    rec = { mr, stream, parts, start: Math.min(at, Math.max(0, total() - Timeline.MIN_MS)), t0: performance.now(), timer: 0 };
    mr.start(250);
    Engine.muteSpeakers(true);
    if (Engine.play(p, rec.start)) syncPlay();
    rec.timer = setInterval(() => {
      const el2 = $('vlogRecTime');
      if (el2) el2.textContent = fmt(performance.now() - rec.t0);
      /* ролик кончился: запись тоже */
      if (!Engine.playing) stopVoice();
    }, 200);
    syncSheet();
  }
  async function stopVoice() {
    if (!rec) return;
    const r = rec;
    rec = null;
    clearInterval(r.timer);
    await new Promise((done) => { r.mr.onstop = done; try { r.mr.stop(); } catch { done(); } });
    r.stream.getTracks().forEach((tr) => tr.stop());
    pauseNow();
    Engine.muteSpeakers(false);
    const blob = new Blob(r.parts, { type: r.mr.mimeType || 'audio/webm' });
    syncSheet();
    if (blob.size < 1000) { toast(t('Запись получилась пустой.')); return; }
    const id = Timeline.uid();
    if (!(await Store.set(`vlog-m-${id}`, blob))) return;
    const buf = await Engine.voiceBuffer(id).catch(() => null);
    const dur = Math.round(buf ? buf.duration * 1000 : performance.now() - r.t0);
    let o = null;
    commit(() => {
      p.media[id] = { id, kind: 'voice', name: '', w: 0, h: 0, dur, thumb: '' };
      o = Timeline.addOverlay(p, { type: 'voice', media: id, from: 0, dur, vol: 100 }, r.start);
      o.start = Math.round(r.start);
      o.end = Math.round(Math.min(total(), r.start + dur));
    });
    ov = o.id;
    sel = -1;
    sheet = 'voicevol';
    syncAll();
    toast(`${t('Голос записан')}: ${fmt(dur)}.`);
  }
  function sheetVoiceVol(body, o) {
    body.append(slider('Громкость голоса', 0, 200, 5, o.layer.vol ?? 100, (v) => `${v}%`, (v) => { o.layer.vol = v; }));
    sheetSpanVoice(body, o);
  }
  function sheetSpanVoice(body, o) {
    body.append(el('p', 'hint', `${t('Звучит')} ${fmt(o.start)} – ${fmt(o.end)}. ${t('Тяни полоску, чтобы сдвинуть голос, края обрезают начало и конец.')}`));
    const row = el('div', 'row');
    const look = el('button', 'btn small', t('Послушать'));
    look.type = 'button';
    look.onclick = () => previewFrom(o.start, o.end);
    const again = el('button', 'btn small', t('Записать ещё'));
    again.type = 'button';
    again.onclick = () => { at = o.end; selectOv(''); openSheet('voice'); };
    row.append(look, again);
    body.append(row);
  }

  /* ---------- влог файлом ---------- */
  let fileBusy = '';
  const sizeText = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} ${t('МБ')}` : `${Math.max(1, Math.round(b / 1024))} ${t('КБ')}`);
  async function exportProject() {
    if (fileBusy || !p.clips.length) return;
    pauseNow();
    fileBusy = 'save';
    syncSheet();
    try {
      await flush();
      const e = entry();
      const name = (e && e.name) || t('Влог');
      const blob = await window.VlogFile.pack(p, name, Engine.blobOf);
      const safe = name.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) || 'vlog';
      window.Export.save(blob, `${safe}.${window.VlogFile.EXT}`);
      toast(`${t('Влог сохранён файлом')}: ${sizeText(blob.size)}.`);
    } catch {
      toast(t('Не получилось сохранить влог файлом.'));
    } finally {
      fileBusy = '';
      syncSheet();
    }
  }
  /* открыть из файла: новый влог в списке, файлы получают новые номера (см. VlogFile.remap) */
  async function importProject(file) {
    if (!file || fileBusy) return;
    pauseNow();
    fileBusy = 'open';
    syncSheet();
    try {
      const got = await window.VlogFile.unpack(file);
      const map = {};
      for (const f of got.files) {
        const nid = Timeline.uid();
        if (!(await Store.set(`vlog-m-${nid}`, f.blob))) throw new Error('storage');
        map[f.id] = nid;
      }
      const proj = window.VlogFile.remap(got.project, map);
      await flush();
      const id = Timeline.uid();
      await Store.set(projKey(id), proj);
      const base = got.name || String(file.name || '').replace(/\.lunavlog$/i, '') || t('Влог');
      const name = index.list.some((x) => x.name === base) ? `${base} (${t('копия')})` : base;
      index.list.unshift({ id, name, updated: Date.now(), clips: proj.clips.length, dur: 0, thumb: '' });
      await openProject(id);
      await flush();
      toast(`${t('Влог открыт')}: ${name}.`);
    } catch (err) {
      toast(t(String(err && err.message) === 'storage'
        ? 'В памяти браузера не хватило места для этого влога.'
        : 'Это не файл влога Lunajour или он повреждён.'), 6000);
    } finally {
      fileBusy = '';
      syncSheet();
    }
  }

  /* «3 клипа», «5 клипов», «1 clip» */
  function clipsText(n) {
    if (I18n.lang === 'en') return `${n} ${n === 1 ? 'clip' : 'clips'}`;
    const d = n % 10;
    const dd = n % 100;
    const word = d === 1 && dd !== 11 ? 'клип' : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'клипа' : 'клипов';
    return `${n} ${word}`;
  }

  /* ---------- мои влоги ---------- */
  function sheetProjects(body) {
    const e = entry();
    const name = el('input', 'vlog-input');
    name.type = 'text';
    name.value = (e && e.name) || '';
    name.placeholder = t('Название влога');
    name.maxLength = 60;
    name.addEventListener('input', () => {
      const cur = entry();
      if (!cur) return;
      cur.name = name.value.trim() || t('Без названия');
      syncName();
      save();
    });
    name.addEventListener('change', () => syncSheet());
    body.append(group('Название', name));
    const add = el('button', 'btn small primary', `+ ${t('Новый влог')}`);
    add.type = 'button';
    add.onclick = () => newProject();
    body.append(add);
    const list = el('div', 'vlog-projects');
    [...index.list].sort((a, b) => (b.updated || 0) - (a.updated || 0)).forEach((x) => {
      const row = el('div', `vlog-project${x.id === projId ? ' on' : ''}`);
      const openBtn = el('button', 'vlog-project-open');
      openBtn.type = 'button';
      if (x.thumb) { const img = el('img'); img.src = x.thumb; img.alt = ''; openBtn.append(img); } else openBtn.append(el('i'));
      const text = el('span');
      const when = x.updated ? new Date(x.updated).toLocaleDateString(I18n.lang === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short' }) : '';
      text.append(el('b', '', x.name), el('small', '', [clipsText(x.clips || 0), x.dur ? fmt(x.dur) : '', when].filter(Boolean).join(' · ')));
      openBtn.append(text);
      openBtn.onclick = () => { if (x.id !== projId) openProject(x.id); };
      row.append(openBtn);
      /* удаление в два нажатия: первое спрашивает */
      const del = el('button', 'btn small', t('Удалить'));
      del.type = 'button';
      let armed = false;
      del.onclick = () => {
        if (!armed) { armed = true; del.textContent = t('Точно?'); del.classList.add('danger'); return; }
        deleteProject(x.id);
      };
      row.append(del);
      list.append(row);
    });
    body.append(list);
    /* резервная копия: влог целиком (с клипами) в один файл и обратно */
    const backup = el('div', 'row');
    const saveBtn = el('button', 'btn small', fileBusy === 'save' ? t('Сохраняю…') : t('Сохранить влог файлом'));
    saveBtn.type = 'button';
    saveBtn.disabled = !!fileBusy || !p.clips.length;
    saveBtn.onclick = exportProject;
    const openBtn2 = el('button', 'btn small', fileBusy === 'open' ? t('Открываю…') : t('Открыть из файла'));
    openBtn2.type = 'button';
    openBtn2.disabled = !!fileBusy;
    openBtn2.onclick = () => $('vlogProjectFile').click();
    backup.append(saveBtn, openBtn2);
    body.append(group('Резервная копия', backup));
    body.append(el('p', 'hint', t('Влоги хранятся только в памяти браузера на этом устройстве. Сохрани влог файлом, чтобы не потерять его при очистке браузера и открыть на другом телефоне или компьютере. В файле все клипы, фото и музыка, поэтому он большой.')));
    body.append(el('p', 'hint', t('Удалённый влог не вернуть: сначала сохрани его файлом.')));
  }

  function sheetFormat(body) {
    const seg = el('div', 'seg');
    RATIO_LIST.forEach((r) => {
      const b = el('button', r === p.ratio ? 'on' : '', r);
      b.type = 'button';
      b.onclick = () => { commit(() => { p.ratio = r; }); sizeCanvas(); };
      seg.append(b);
    });
    body.append(group('Формат ролика', seg), el('p', 'hint', t('9:16 для Reels, Shorts и TikTok. Как клип ляжет в кадр, настраивается у клипа в «Кадр».')));
  }

  /* карточка на клипе: «как в редакторе» или свой стиль. Оформление копируется в клип,
     поэтому ролик не меняется, если потом поправить редактор или удалить стиль */
  function sheetCard(body, c) {
    const grid = el('div', 'thumbs vlog-looks');
    const item = (id, name, thumb, pick) => {
      const b = el('button', `thumb${(c.cardId || '') === id ? ' on' : ''}`);
      b.type = 'button';
      if (thumb) {
        const img = el('img');
        img.src = thumb;
        img.alt = '';
        b.append(img);
      } else b.append(el('i', 'vlog-card-none', '∅'));
      b.append(el('span', '', name));
      b.onclick = pick;
      grid.append(b);
    };
    item('', t('Без карточки'), '', () => commit(() => { delete c.card; delete c.cardId; }));
    const now = editorCard && editorCard();
    if (now) item('editor', t('Как в редакторе'), now.thumb, () => commit(() => { c.card = now.state; c.cardId = 'editor'; }));
    myStyles.forEach((st, k) => item(st.id, `${t('Стиль')} ${st.n || k + 1}`, st.thumb, () => commit(() => { c.card = JSON.parse(JSON.stringify(st.state)); c.cardId = st.id; })));
    body.append(grid);
    if (c.card) body.append(toAll('Ко всем клипам', () => p.clips.forEach((x) => { x.card = JSON.parse(JSON.stringify(c.card)); x.cardId = c.cardId; })));
    body.append(el('p', 'hint', t(myStyles.length || now
      ? 'Клип играет внутри карточки: бумага, фигуры, коллаж, эффекты и подпись из редактора. Свой стиль сохраняется в редакторе: меню ⋯ → Мои стили.'
      : 'Оформи карточку в редакторе и сохрани её как стиль (меню ⋯ → Мои стили): здесь клип заиграет внутри неё.')));
  }

  /* кадр клипа: как вписать, масштаб, движение фото; сдвиг — пальцем по просмотру */
  function sheetFrame(body, c) {
    const fixed = c.card || hasShape(c) || hasLayout(c);
    if (fixed) body.append(el('p', 'hint', t('У клипа есть карточка, макет или фигура: окошко для кадра задают они, а сам кадр внутри окошка двигается пальцем и масштабом.')));
    body.append(group('Как вписать', chips(Engine.FITS.map((f) => [f.id, t(f.name)]), c.fit || '', (v) => commit(() => { c.fit = v; }))));
    body.append(slider('Масштаб', 100, Engine.ZOOM_MAX * 100, 5, Math.round((c.zoom || 1) * 100), (v) => `${v}%`, (v) => { c.zoom = v / 100; }));
    if (c.kind === 'image') {
      body.append(group('Движение фото', chips(Engine.MOVES.map((m) => [m.id, t(m.name)]), c.move || 'in', (v) => {
        commit(() => { c.move = v; });
        /* показываем движение сразу */
        const s = Timeline.starts(p)[sel];
        previewFrom(s, s + Timeline.len(c));
      })));
    }
    const row = el('div', 'row');
    const reset = el('button', 'btn small', t('Сбросить кадр'));
    reset.type = 'button';
    reset.onclick = () => commit(() => { delete c.fit; delete c.zoom; delete c.x; delete c.y; delete c.cx; delete c.cy; });
    row.append(reset, toAll('Вписать так все клипы', () => p.clips.forEach((x) => { x.fit = c.fit || ''; })));
    if (c.kind === 'image') row.append(toAll('Движение ко всем фото', () => p.clips.forEach((x) => { if (x.kind === 'image') x.move = c.move || 'in'; })));
    body.append(row);
    body.append(el('p', 'hint', t(fixed ? 'Двигай кадр в окошке пальцем на просмотре, щипком или колесом меняй масштаб.' : 'Двигай кадр пальцем прямо на просмотре, щипком меняй масштаб. На компьютере: мышью и колесом.')));
  }

  function sheetMusic(body) {
    const M = window.Music;
    const list = [['', t('Без музыки')], ...((M && M.TRACKS) || []).map((x) => [x.id, t(x.name)])];
    const cur = p.music.fileId ? '' : p.music.track;
    const box = chips(list, p.music.fileId ? null : cur, (v) => commit(() => { p.music.track = v; p.music.fileId = ''; p.music.name = ''; Engine.resetMusic(); }));
    const own = el('button', p.music.fileId ? 'on' : '', p.music.fileId ? `♪ ${p.music.name || t('Свой трек')}` : t('Свой трек…'));
    own.type = 'button';
    own.onclick = () => $('vlogMusicFile').click();
    box.append(own);
    body.append(group('Музыка', box));
    if (p.music.track || p.music.fileId) {
      body.append(slider('Громкость музыки', 0, 100, 1, p.music.vol, (v) => `${v}%`, (v) => { p.music.vol = v; }));
    }
    if (p.music.fileId) {
      body.append(slider('Начало трека', 0, 300, 1, p.music.start, (v) => fmt(v * 1000).replace(/\.\d$/, ''), (v) => { p.music.start = v; }));
    }
    if (p.music.track || p.music.fileId) {
      const sec = (v) => (v ? `${v.toFixed(1)} ${t('с')}` : t('сразу'));
      body.append(slider('Плавное начало', 0, 5, 0.5, Number(p.music.fadeIn) || 0, sec, (v) => { p.music.fadeIn = v; }));
      body.append(slider('Затухание в конце', 0, 5, 0.5, Number(p.music.fadeOut ?? 1), sec, (v) => { p.music.fadeOut = v; }));
      const duckBox = el('label', 'check');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = p.music.duck !== false;
      box.onchange = () => commit(() => { p.music.duck = box.checked; });
      duckBox.append(box, document.createTextNode(t('Тише, когда в клипе звучит голос')));
      body.append(duckBox);
    }
    if (p.music.track || p.music.fileId) {
      const beat = el('div', 'group');
      beat.append(el('span', 'label', t('Такт')));
      const info = el('p', 'hint', t('Ищу такты…'));
      const row = el('div', 'row');
      const fit = el('button', 'btn small', t('Подогнать стыки под такт'));
      fit.type = 'button';
      fit.disabled = true;
      fit.onclick = fitToBeats;
      row.append(fit);
      beat.append(info, row);
      body.append(beat);
      Engine.musicInfo(p).then((w) => {
        if (!info.isConnected) return;
        if (!w || !w.beats.length) { info.textContent = t('В этом треке не получилось найти такты.'); return; }
        info.textContent = `${t('Темп')} ≈ ${w.bpm} ${t('уд/мин')}. ${t('Засечки тактов видно на дорожке музыки, к ним прилипают стыки, когда тянешь край клипа.')}`;
        fit.disabled = p.clips.length < 1;
      });
    }
    body.append(el('p', 'hint', t('Музыка играет под всем роликом. Пока в клипе говорят, она сама становится тише. Звук самих клипов настраивается у каждого клипа.')));
  }

  /* превью цвета: кадр клипа, перекрашенный каждым шаблоном */
  const lookThumbs = new Map();
  function lookThumb(c, look) {
    const m = p.media[c.media];
    const cv = Render.canvas(72, 96);
    if (!m || !m.thumb) return cv;
    const key = `${m.id}|${look ? look.id : ''}`;
    const draw = (img) => {
      const x = cv.getContext('2d', { willReadFrequently: true });
      const k = Math.max(72 / img.width, 96 / img.height);
      x.drawImage(img, (72 - img.width * k) / 2, (96 - img.height * k) / 2, img.width * k, img.height * k);
      if (look) Render.applyAdjust(x, 72, 96, look.adjust);
    };
    const go = () => {
      if (lookThumbs.has(m.id)) { draw(lookThumbs.get(m.id)); return; }
      const img = new Image();
      img.onload = () => { lookThumbs.set(m.id, img); draw(img); };
      img.src = m.thumb;
    };
    if (look && look.adjust.lut) Render.loadLut(look.adjust.lut).then(go);
    else go();
    cv.dataset.key = key;
    return cv;
  }

  /* Превью на кадре самого клипа: кадр 90×120, поверх рисует paint(x, w, h).
     Готовые превью хранятся по ключу, новые рисуются по одной, чтобы шторка открывалась сразу. */
  const frameThumbs = new Map();
  let thumbQueue = 0;
  function frameThumb(c, key, paint) {
    const W = 90;
    const H = 120;
    const cv = Render.canvas(W, H);
    const m = p.media[c.media];
    if (!m || !m.thumb) return cv;
    const full = `${m.id}|${key}`;
    const show = (src) => cv.getContext('2d').drawImage(src, 0, 0);
    if (frameThumbs.has(full)) { show(frameThumbs.get(full)); return cv; }
    const draw = (img) => {
      const out = Render.canvas(W, H);
      const x = out.getContext('2d', { willReadFrequently: true });
      const k = Math.max(W / img.width, H / img.height);
      x.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
      try { paint(x, W, H); } catch { /* превью не вышло: остаётся сам кадр */ }
      if (frameThumbs.size > 300) frameThumbs.clear();
      frameThumbs.set(full, out);
      show(out);
    };
    const go = () => {
      if (lookThumbs.has(m.id)) { draw(lookThumbs.get(m.id)); return; }
      const img = new Image();
      img.onload = () => { lookThumbs.set(m.id, img); draw(img); };
      img.src = m.thumb;
    };
    const wait = 16 * thumbQueue++;
    setTimeout(() => { thumbQueue = Math.max(0, thumbQueue - 1); go(); }, wait);
    return cv;
  }
  /* сетка превью: выбор одной кнопкой, как у «Цвета» */
  function thumbGrid(items, current, pick) {
    const grid = el('div', 'thumbs vlog-looks vlog-fx-thumbs');
    items.forEach(([id, name, thumb]) => {
      const b = el('button', `thumb${id === current ? ' on' : ''}`);
      b.type = 'button';
      b.title = name;
      b.append(thumb, el('span', '', name));
      b.onclick = () => pick(id);
      grid.append(b);
    });
    keepOnInView(grid);
    return grid;
  }
  /* в ряду превью выбранное видно сразу, даже если оно далеко в списке */
  function keepOnInView(grid) {
    requestAnimationFrame(() => {
      const on = grid.querySelector('.on');
      if (!on || grid.scrollWidth <= grid.clientWidth) return;
      const g = grid.getBoundingClientRect();
      const r = on.getBoundingClientRect();
      grid.scrollLeft += r.left - g.left - (g.width - r.width) / 2;
    });
  }

  function sheetLook(body, c) {
    const grid = el('div', 'thumbs vlog-looks');
    [null, ...Engine.looks()].forEach((look) => {
      const id = look ? look.id : '';
      const b = el('button', `thumb${c.look === id ? ' on' : ''}`);
      b.type = 'button';
      b.append(lookThumb(c, look), el('span', '', look ? t(look.name) : t('Без цвета')));
      b.onclick = () => commit(() => { c.look = id; });
      grid.append(b);
    });
    body.append(grid, toAll('Ко всем клипам', () => p.clips.forEach((x) => { x.look = c.look; })));
  }

  function sheetFx(body, c, shot = c) {
    const E = window.Effects;
    if (!E) return;
    const def = c.fx ? E.byId(c.fx) : null;
    /* разделы как в карточке; сканер во влоге не нужен */
    const cats = E.CATS.filter((x) => x.id !== 'scan');
    if (!cats.some((x) => x.id === fxCat)) fxCat = 'all';
    body.append(chips(cats.map((x) => [x.id, t(x.name)]), fxCat, (v) => { fxCat = v; syncSheet(); }));
    const shown = E.EFFECTS.filter((x) => fxCat === 'all' || x.cat === fxCat);
    const fxThumb = (id) => frameThumb(shot, `fx:${id}`, (x, w, h) => {
      if (!id) return;
      E.clock = null;
      E.draw(x, { fx: { id, color: '', text: '', font: '', style: '', amount: 0.8, seed: 3, boxes: [], mask: 'all' } }, w, h);
    });
    const list = [['', t('Без эффекта'), fxThumb('')], ...shown.map((x) => [x.id, t(x.name), fxThumb(x.id)])];
    body.append(thumbGrid(list, c.fx || '', (v) => commit(() => { c.fx = v; delete c.fxs; })));
    if (def) {
      const o = c.fxs || {};
      const setOpt = (patch) => commit(() => { c.fxs = { ...(c.fxs || {}), ...patch }; });
      if (def.styles) {
        const cur = (E.styleOf(def, o) || def.styles[0]).id;
        body.append(group('Вид', chips(def.styles.map((s) => [s.id, t(s.name)]), cur, (v) => {
          const st = def.styles.find((s) => s.id === v);
          /* у вида свой цвет и свои слова: сбрасываем на «как в эффекте» */
          setOpt({ style: v, color: '', ...(st && st.text ? { text: '' } : {}) });
        })));
      }
      body.append(slider('Сколько', 40, 200, 5, Math.round((o.amount ?? 1) * 100), (v) => `${v}%`, (v) => { c.fxs = { ...(c.fxs || {}), amount: v / 100 }; }));
      const colors = el('div', 'vlog-swatches');
      const same = el('button', `vlog-same${o.color ? '' : ' on'}`, t('Как в эффекте'));
      same.type = 'button';
      same.onclick = () => setOpt({ color: '' });
      colors.append(same, ...swatches(o.color || '', (v) => setOpt({ color: v })).children);
      body.append(group('Цвет', colors));
      /* слова есть не у всех эффектов: у точек и пикселей их нет */
      const st = E.styleOf(def, o);
      const sample = (st && st.text) || def.text;
      if (sample && def.cat !== 'pixel' && def.id !== 'points') {
        const input = el('input', 'vlog-input');
        input.type = 'text';
        input.value = o.text || '';
        input.placeholder = sample;
        const typing = liveEdit((v) => { c.fxs = { ...(c.fxs || {}), text: v }; });
        input.addEventListener('input', () => typing(input.value));
        input.addEventListener('change', () => changed());
        body.append(group('Слова', input));
      }
      const row = el('div', 'row');
      const again = el('button', 'btn small', t('Перемешать'));
      again.type = 'button';
      again.onclick = () => setOpt({ seed: Math.floor(Math.random() * 1e6) });
      row.append(again);
      body.append(row);
    }
    if (shot !== c) return;
    body.append(toAll('Ко всем клипам', () => p.clips.forEach((x) => { x.fx = c.fx; if (c.fxs) x.fxs = { ...c.fxs }; else delete x.fxs; })));
    body.append(el('p', 'hint', t('Эффекты из раздела «Эффекты» карточки, поверх всего кадра. Глитчи в ролике живые. Эффект только на кусок ролика: кнопка «Эффект» в общей панели.')));
  }
  let fxCat = 'all';

  /* ---------- макет: коллаж и бумага из редактора; клип стоит во всех ячейках ---------- */
  function sheetLayout(body, c) {
    const C = window.Collages;
    if (!C) return;
    const lay = c.layout || {};
    const setLay = (patch) => commit(() => {
      const next = { ...(c.layout || {}), ...patch };
      if (!next.collage && !next.paper) delete c.layout;
      else c.layout = next;
    });
    const grid = el('div', 'thumbs vlog-looks');
    [{ id: '', name: 'Без коллажа' }, ...C.COLLAGES].forEach((tpl) => {
      const b = el('button', `thumb${(lay.collage || '') === tpl.id ? ' on' : ''}`);
      b.type = 'button';
      b.title = t(tpl.name);
      const cv = Render.canvas(72, 90);
      /* превью те же, что в редакторе; рисуются после открытия шторки */
      setTimeout(() => {
        try { if (window.CollageThumb) cv.getContext('2d').drawImage(window.CollageThumb(tpl.id), 0, 0, 72, 90); } catch { /* шаблон без превью */ }
      }, 0);
      b.append(cv, el('span', '', t(tpl.name)));
      b.onclick = () => setLay(tpl.id === (lay.collage || '') ? {} : { collage: tpl.id, tints: {} });
      grid.append(b);
    });
    body.append(group('Коллаж', grid));
    const tpl = lay.collage ? C.byId(lay.collage) : null;
    /* подпись есть у шаблонов с текстом и у обычной карточки с подписью */
    if (tpl && (tpl.sample || !tpl.noNote)) {
      const input = el('input', 'vlog-input');
      input.type = 'text';
      input.value = lay.title || '';
      input.placeholder = tpl.sample || t('Подпись');
      const typing = liveEdit((v) => { c.layout = { ...c.layout, title: v }; });
      input.addEventListener('input', () => typing(input.value));
      input.addEventListener('change', () => changed());
      body.append(group('Подпись', input));
      if (tpl.sample && tpl.sample.includes('()')) body.append(el('p', 'hint', t('Скобки () в тексте — место для кадра.')));
    }
    /* поля шаблона, как в редакторе: заголовки, подписи, ползунки (мудборд, список желаний и др.) */
    if (tpl && tpl.fields) {
      const fstate = { tints: { [lay.collage]: lay.tints || {} }, note: { title: lay.title || '' }, collage: lay.collage };
      let fields = [];
      try { fields = tpl.fields(fstate) || []; } catch { fields = []; }
      fields.forEach((item) => {
        const cur = (lay.tints || {})[item.key];
        const write = liveEdit((v) => { c.layout = { ...c.layout, tints: { ...((c.layout && c.layout.tints) || {}), [item.key]: v } }; });
        if (item.range) {
          const [min, max, def] = item.range;
          body.append(slider(item.name, min, max, 1, Number(cur ?? def), (v) => `${v}`, (v) => { c.layout = { ...c.layout, tints: { ...((c.layout && c.layout.tints) || {}), [item.key]: String(v) } }; }));
          return;
        }
        const input = el(item.multiline ? 'textarea' : 'input', item.multiline ? 'vlog-textarea' : 'vlog-input');
        if (item.multiline) input.rows = 3;
        else input.type = 'text';
        input.maxLength = item.maxLength || 90;
        input.placeholder = t(item.placeholder || '');
        input.value = cur || '';
        input.addEventListener('input', () => write(input.value));
        input.addEventListener('change', () => changed());
        body.append(group(item.name, input));
      });
    }
    if (tpl) {
      /* цвета элементов шаблона и его варианты, как в редакторе; выбор помнится у клипа */
      const tints = lay.tints || {};
      const setTint = (key, v) => setLay({ tints: { ...tints, [key]: v } });
      C.paletteOf(lay.collage).forEach((item) => {
        const row = el('div', 'vlog-swatches');
        const same = el('button', `vlog-same${!tints[item.key] || tints[item.key] === 'auto' ? ' on' : ''}`, t('Как в шаблоне'));
        same.type = 'button';
        same.onclick = () => setTint(item.key, 'auto');
        row.append(same);
        (window.TintColors || COLORS).forEach((col) => {
          const b = el('button', tints[item.key] === col ? 'on' : '');
          b.type = 'button';
          b.style.background = col;
          b.setAttribute('aria-label', col);
          b.onclick = () => setTint(item.key, col);
          row.append(b);
        });
        body.append(group(item.name, row));
      });
      (tpl.choices || []).forEach((item) => {
        body.append(group(item.name, chips(item.options.map(([v, name]) => [v, t(name)]), tints[item.key] || item.def, (v) => setTint(item.key, v))));
      });
    }
    body.append(group('Бумага', chips([['', t('Как в карточке')], ...Render.PAPERS.filter((x) => x.id !== 'own').map((x) => [x.id, t(x.name)])], lay.paper || '', (v) => setLay({ paper: v }))));
    const papers = el('div', 'vlog-swatches');
    (window.PaperColors || COLORS).forEach((col) => {
      const b = el('button', col === lay.paperColor ? 'on' : '');
      b.type = 'button';
      b.style.background = col;
      b.setAttribute('aria-label', col);
      b.onclick = () => setLay({ paperColor: col, paper: lay.paper || 'smooth' });
      papers.append(b);
    });
    body.append(group('Цвет бумаги', papers));
    body.append(toAll('Ко всем клипам', () => p.clips.forEach((x) => { if (c.layout) x.layout = { ...c.layout }; else delete x.layout; })));
    body.append(el('p', 'hint', t('Макеты из карточки: клип играет во всех ячейках коллажа. Размер ролика меняется в «Формат».')));
  }

  /* ---------- сканер: готовые наборы и свои сохранённые из редактора ---------- */
  let scanPresets = [];
  function sheetScan(body, c, shot = c) {
    const S = window.Scanner;
    if (!S) return;
    const sc = c.scan && c.scan.on ? c.scan : null;
    const scanThumb = (pr) => frameThumb(shot, `scan:${pr ? pr.id : ''}`, (x, w, h) => {
      if (!pr) return;
      S.draw(x, { scan: { ...S.defaults(), ...pr.set, on: true, seed: 4, anim: false }, note: { title: '', date: '', mood: '' } }, w, h);
    });
    const list = [['', t('Выключен'), scanThumb(null)], ...scanPresets.map((x) => [x.id, x.name, scanThumb(x)]), ...S.PRESETS.map((x) => [x.id, t(x.name), scanThumb(x)])];
    body.append(thumbGrid(list, sc ? sc.preset : '', (v) => commit(() => {
      if (!v) { delete c.scan; return; }
      const pr = scanPresets.find((x) => x.id === v) || S.presetById(v);
      /* копия набора: правки не должны менять сам набор */
      c.scan = { ...S.defaults(), ...JSON.parse(JSON.stringify(pr.set)), seed: (sc && sc.seed) || 5, on: true, preset: v };
      /* на видео рамки по умолчанию следят за объектом; «вспышки» и «рой» у наборов свои */
      if ((!c.scan.motion || c.scan.motion === 'still') && (shot.kind === 'video' || shot !== c)) c.scan.motion = 'track';
    })));
    if (sc) {
      const setScan = (patch) => commit(() => { c.scan = { ...c.scan, ...patch }; });
      body.append(group('Цвет', swatches(sc.color, (v) => setScan({ color: v }))));
      if (S.MOTIONS) body.append(group('Рамки', chips(S.MOTIONS.map(([v, name]) => [v, t(name)]), sc.motion || 'still', (v) => setScan({ motion: v }))));
      body.append(slider('Сколько рамок', 20, 250, 5, Math.round((sc.amount ?? 1) * 100), (v) => `${v}%`, (v) => { c.scan = { ...c.scan, amount: v / 100 }; }));
      const live = el('label', 'check');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = sc.anim !== false;
      box.onchange = () => setScan({ anim: box.checked });
      live.append(box, document.createTextNode(t('Живое сканирование: рамки появляются по одной, подписи печатаются')));
      body.append(live);
      const row = el('div', 'row');
      const again = el('button', 'btn small', t('Перемешать'));
      again.type = 'button';
      again.onclick = () => setScan({ seed: Math.floor(Math.random() * 1e6) });
      row.append(again);
      body.append(row);
    }
    if (shot !== c) return;
    body.append(toAll('Ко всем клипам', () => p.clips.forEach((x) => { if (c.scan) x.scan = JSON.parse(JSON.stringify(c.scan)); else delete x.scan; })));
    body.append(el('p', 'hint', t('Сканер из раздела «Эффекты» карточки: рамки сами находят, что в кадре. Свои наборы сохраняются в редакторе.')));
  }

  /* ---------- фигура: вырез поверх кадра, как в карточке ---------- */
  let shapeCat = 'stars';
  const shapeThumbs = new Map();
  function shapeThumb(m) {
    const out = Render.canvas(56, 70);
    const draw = () => {
      let src = shapeThumbs.get(m.id);
      if (!src) {
        const M = window.Motifs;
        src = Render.canvas(112, 140);
        const x = src.getContext('2d');
        x.fillStyle = '#fff';
        try {
          m.draw(x, 112, 140, M.makeRng(7), { size: 1, density: 1, text: '', font: M.WORD_FONTS[0].id, pieces: M.DEMO_PIECES, orbit: { x: 0.5, y: 0.46, size: 1, rot: -24 } });
        } catch { /* фигуре нужны свои данные: превью остаётся пустым */ }
        shapeThumbs.set(m.id, src);
      }
      out.getContext('2d').drawImage(src, 0, 0, 56, 70);
    };
    /* новые превью рисуются после открытия шторки, чтобы она не подвисала */
    if (shapeThumbs.has(m.id)) draw();
    else setTimeout(draw, 0);
    return out;
  }
  /* ---------- своя раскладка: фигурки по местам на кадре ----------
     shape.pieces: [{ shape, x, y, size, rot }], x и y — доли кадра, size — доля короткой стороны.
     Фигурки тянутся по просмотру, уголок рамки меняет размер и поворот выбранной. */
  let pieceSel = -1;
  const piecesOn = () => { const c = clip(); return !!(c && c.shape && c.shape.motif === 'hand-place' && sheet === 'shape' && Array.isArray(c.shape.pieces)); };
  function setPieces(c, fn) {
    c.shape = { ...c.shape, pieces: fn(c.shape.pieces.map((q) => ({ ...q }))) };
    dirty = true;
  }
  function pieceBox(q) {
    const cv = canvasEl();
    const m = Math.min(cv.width, cv.height);
    return { cx: q.x * cv.width, cy: q.y * cv.height, w: q.size * m, h: q.size * m, rot: q.rot || 0 };
  }
  function hitPiece(c, pt) {
    const list = c.shape.pieces;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = pieceBox(list[i]);
      if (Math.hypot(pt.x - b.cx, pt.y - b.cy) <= b.w * 0.55 + canvasEl().width * 0.02) return i;
    }
    return -1;
  }
  function sheetPieces(body, c) {
    const M = window.Motifs;
    const add = el('div', 'chips');
    Object.entries(M.SYMBOLS).forEach(([id, sym]) => {
      const b = el('button', '', `+ ${t(sym.name)}`);
      b.type = 'button';
      b.onclick = () => {
        commit(() => setPieces(c, (list) => [...list, { shape: id, x: 0.5, y: 0.5, size: 0.3, rot: 0 }]));
        pieceSel = c.shape.pieces.length - 1;
        syncSheet();
      };
      add.append(b);
    });
    body.append(group('Добавить фигурку', add));
    const q = c.shape.pieces[pieceSel];
    if (q) {
      body.append(slider('Размер фигурки', 5, 90, 1, Math.round(q.size * 100), (v) => `${v}%`, (v) => setPieces(c, (list) => { list[pieceSel].size = v / 100; return list; })));
      body.append(slider('Поворот', -180, 180, 1, Math.round(((q.rot || 0) * 180) / Math.PI), (v) => `${v}°`, (v) => setPieces(c, (list) => { list[pieceSel].rot = (v * Math.PI) / 180; return list; })));
      const del = el('button', 'btn small', t('Удалить фигурку'));
      del.type = 'button';
      del.onclick = () => { commit(() => setPieces(c, (list) => list.filter((_, k) => k !== pieceSel))); pieceSel = -1; syncSheet(); };
      body.append(del);
    }
    body.append(el('p', 'hint', t('Тяни фигурки прямо на кадре. Нажми на фигурку, чтобы выбрать её: уголок рамки меняет размер и поворот.')));
  }

  function sheetShape(body, c) {
    const M = window.Motifs;
    if (!M) return;
    /* «Своя раскладка» расставляется руками на карточке, во влоге её нет; «Своя фигура» — по своей картинке */
    const ok = (m) => m.cat !== 'none';
    const cats = M.CATEGORIES.filter((k) => k.id === 'all' || M.MOTIFS.some((m) => ok(m) && m.cat === k.id));
    if (!cats.some((k) => k.id === shapeCat)) shapeCat = 'all';
    body.append(chips(cats.map((k) => [k.id, t(k.name)]), shapeCat, (v) => { shapeCat = v; syncSheet(); }));
    const cur = hasShape(c) ? c.shape.motif : '';
    const grid = el('div', 'thumbs vlog-shapes');
    const item = (id, name, thumb) => {
      const b = el('button', `thumb${cur === id ? ' on' : ''}`);
      b.type = 'button';
      b.title = name;
      b.append(thumb, el('span', '', name));
      b.onclick = () => commit(() => {
        if (!id) { delete c.shape; return; }
        c.shape = { size: 1, density: 1, seed: 7, paper: 'crumple', paperColor: (window.PaperColors || ['#f0ede5'])[0], ...(c.shape || {}), motif: id };
        /* своя раскладка начинается с пяти фигурок, дальше их тянут на кадре */
        if (id === 'hand-place' && !(c.shape.pieces && c.shape.pieces.length)) c.shape.pieces = JSON.parse(JSON.stringify(M.DEMO_PIECES));
        pieceSel = -1;
      });
      grid.append(b);
    };
    item('', t('Без фигуры'), el('i', 'vlog-card-none', '∅'));
    M.MOTIFS.filter((m) => ok(m) && m.id !== 'own-mask' && (shapeCat === 'all' || m.cat === shapeCat)).forEach((m) => item(m.id, t(m.name), shapeThumb(m)));
    if (shapeCat === 'mine' || shapeCat === 'all') {
      /* своя фигура: картинка с компьютера или телефона; выбранная уже — показываем её */
      const own = c.shape && c.shape.motif === 'own-mask' && c.shape.mask && p.media[c.shape.mask];
      const b = el('button', `thumb${own ? ' on' : ''}`);
      b.type = 'button';
      b.title = t('Своя фигура');
      if (own && own.thumb) { const img = el('img'); img.src = own.thumb; img.alt = ''; b.append(img); } else b.append(el('i', 'vlog-card-none', '+'));
      b.append(el('span', '', t(own ? 'Своя фигура' : 'Загрузить фигуру')));
      b.onclick = () => $('vlogMaskFile').click();
      grid.append(b);
    }
    body.append(grid);
    if (shapeCat === 'mine') body.append(el('p', 'hint', t('Своя фигура: PNG с прозрачным фоном режется по контуру, обычная картинка — по тёмному. Чёрный силуэт на белом подходит лучше всего.')));
    if (cur === 'hand-place') sheetPieces(body, c);
    if (cur) {
      const sh = c.shape;
      if (cur !== 'hand-place') body.append(slider('Размер', 40, 180, 5, Math.round((sh.size ?? 1) * 100), (v) => `${v}%`, (v) => { c.shape = { ...c.shape, size: v / 100 }; }));
      if (cur !== 'hand-place') body.append(slider('Плотность', 30, 200, 5, Math.round((sh.density ?? 1) * 100), (v) => `${v}%`, (v) => { c.shape = { ...c.shape, density: v / 100 }; }));
      const papers = el('div', 'vlog-swatches');
      (window.PaperColors || COLORS).forEach((col) => {
        const b = el('button', col === sh.paperColor ? 'on' : '');
        b.type = 'button';
        b.style.background = col;
        b.setAttribute('aria-label', col);
        b.onclick = () => commit(() => { c.shape = { ...c.shape, paperColor: col }; });
        papers.append(b);
      });
      body.append(group('Цвет бумаги', papers));
      const row = el('div', 'row');
      const again = el('button', 'btn small', t('Перемешать'));
      again.type = 'button';
      again.onclick = () => commit(() => { c.shape = { ...c.shape, seed: Math.floor(Math.random() * 1e6) }; });
      row.append(again);
      body.append(row);
    }
    body.append(toAll('Ко всем клипам', () => p.clips.forEach((x) => { if (hasShape(c)) x.shape = { ...c.shape }; else delete x.shape; })));
    body.append(el('p', 'hint', t('Фигуры из карточки: вырезы в кадре, сквозь них видно бумагу. У клипа в карточке фигура заменяет её фигуру.')));
  }


  /* ---------- синхронизация экрана ---------- */
  function syncTime() {
    const now = peek ?? at;
    const T = total();
    $('vlogTime').textContent = `${fmt(now)} / ${fmt(T)}`;
    const k = T > 0 ? Math.max(0, Math.min(1, now / T)) : 0;
    $('vlogScrubFill').style.width = `${(k * 100).toFixed(2)}%`;
    $('vlogScrubKnob').style.left = `${(k * 100).toFixed(2)}%`;
    const bar = $('vlogScrub');
    bar.setAttribute('aria-valuemax', String(Math.round(T / 100) / 10));
    bar.setAttribute('aria-valuenow', String(Math.round(now / 100) / 10));
    bar.setAttribute('aria-valuetext', fmt(now));
    bar.setAttribute('aria-disabled', String(!p.clips.length));
  }
  function syncPlay() {
    const b = $('vlogPlay');
    b.textContent = Engine.playing ? '❚❚' : '▶';
    b.setAttribute('aria-label', t(Engine.playing ? 'Пауза' : 'Смотреть'));
    if (!Engine.playing) { dirty = true; follow(); syncTime(); }
    positionBox();
  }
  function syncAll() {
    const empty = !p.clips.length;
    $('vlogEmpty').hidden = !empty;
    canvasEl().hidden = empty;
    $('vlogUndo').disabled = !hist.canUndo;
    $('vlogRedo').disabled = !hist.canRedo;
    $('vlogSave').disabled = empty;
    $('vlogPlay').disabled = empty;
    renderTrack();
    syncTools();
    syncSheet();
    syncTime();
    follow();
    dirty = true;
  }

  /* ---------- файлы ---------- */
  async function addFiles(files) {
    const list = [...files];
    if (!list.length) return;
    const fresh = [];
    let failed = 0;
    for (let k = 0; k < list.length; k++) {
      if (list.length > 1) toast(`${t('Загружаю')} ${k + 1} ${t('из')} ${list.length}…`);
      try {
        fresh.push(await Engine.importFile(list[k]));
      } catch {
        failed++;
      }
    }
    const unsaved = fresh.filter((m) => m.unsaved).length;
    fresh.forEach((m) => { delete m.unsaved; });
    if (unsaved) toast(t('В памяти браузера не хватило места: эти клипы пропадут после перезагрузки. Сохрани ролик, пока вкладка открыта.'), 9000);
    else if (failed) toast(t('Часть файлов не открылась. Попробуй MP4 или фото JPG/PNG.'));
    else $('toast').hidden = true;
    if (!fresh.length) return;
    const index = sel >= 0 ? sel + 1 : p.clips.length;
    commit(() => {
      fresh.forEach((m) => { p.media[m.id] = m; });
      Timeline.add(p, fresh, index);
    });
    sel = -1;
    syncAll();
    seekTo(Timeline.starts(p)[index] || 0);
  }

  async function addStickerFile(file) {
    if (!file) return;
    try {
      const m = await Engine.importFile(file);
      m.kind = 'sticker';
      p.media[m.id] = m;
      addSticker({ type: 'sticker', img: m.id, size: 0.4 });
    } catch {
      toast(t('Эта картинка не открылась. Попробуй PNG или JPG.'));
    }
  }

  /* картинка для своей фигуры клипа: хранится как файл влога, клип вырезается по ней */
  async function addMaskFile(file) {
    const c = clip();
    if (!file || !c) return;
    try {
      const m = await Engine.importFile(file);
      m.kind = 'mask';
      commit(() => {
        p.media[m.id] = m;
        c.shape = { size: 1, density: 1, seed: 7, paper: 'crumple', paperColor: (window.PaperColors || ['#f0ede5'])[0], ...(c.shape || {}), motif: 'own-mask', mask: m.id };
      });
    } catch {
      toast(t('Эта картинка не открылась. Попробуй PNG или JPG.'));
    }
  }

  async function setMusicFile(file) {
    if (!file) return;
    try {
      const id = Timeline.uid();
      await Store.set(`vlog-m-${id}`, file);
      commit(() => {
        p.media[id] = { id, kind: 'audio', name: file.name || '', w: 0, h: 0, dur: 0, thumb: '' };
        p.music.fileId = id;
        p.music.name = (file.name || '').replace(/\.[a-z0-9]+$/i, '');
        p.music.start = 0;
        p.music.track = '';
      });
      Engine.resetMusic();
    } catch {
      toast(t('Этот файл не получилось открыть как музыку.'));
    }
  }

  /* ---------- запись ролика ---------- */
  let result = null;
  let abort = null;
  let quality = 720;
  /* обложка: кадр p.cover.at, по умолчанию начало; first — показать его первыми кадрами ролика */
  const coverAt = () => Math.max(0, Math.min(total() - 1, (p.cover && p.cover.at) || 0));
  let coverRun = 0;
  async function syncCover() {
    const run = ++coverRun;
    $('vlogCoverTime').textContent = `${t('Кадр')} ${fmt(coverAt())}`;
    $('vlogCoverFirst').checked = !!(p.cover && p.cover.first);
    $('vlogCoverFirst').disabled = !fastOk;
    const pv = $('vlogCoverPreview');
    const [RW, RH] = Render.RATIOS[p.ratio];
    pv.height = Math.round((pv.width * RH) / RW);
    if (!window.VlogFast) return;
    try {
      const c = await window.VlogFast.cover(p, 360, coverAt());
      if (run !== coverRun) return;
      pv.getContext('2d').drawImage(c, 0, 0, pv.width, pv.height);
    } catch { /* превью не вышло: обложка всё равно сохранится */ }
  }
  async function saveCover() {
    if (!window.VlogFast) return;
    try {
      const c = await window.VlogFast.cover(p, 1080, coverAt());
      const blob = await new Promise((q) => c.toBlob(q, 'image/jpeg', 0.92));
      const e = entry();
      const name = ((e && e.name) || 'vlog').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 40) || 'vlog';
      window.Export.save(blob, `lunajour-${name}-cover.jpg`);
    } catch {
      toast(t('Не получилось сохранить обложку.'));
    }
  }

  function openExport() {
    if (Engine.playing) { Engine.pause(); syncPlay(); }
    const d = $('vlogExport');
    result = null;
    $('vlogDownload').hidden = true;
    $('vlogShare').hidden = true;
    $('vlogRecord').hidden = false;
    $('vlogRecord').disabled = false;
    $('vlogQuality').hidden = false;
    $('vlogProgress').hidden = true;
    markQuality();
    const slow = () => {
      $('vlogExportNote').textContent = Engine.canRecord()
        ? t('Ролик записывается в реальном времени: минута влога займёт минуту. Не сворачивай вкладку, пока идёт запись.')
        : t('Этот браузер не умеет записывать видео. Открой Lunajour в Chrome или Safari.');
      $('vlogRecord').disabled = !Engine.canRecord();
    };
    slow();
    /* быстрая запись: кадр за кадром, без ожидания реального времени */
    fastOk = false;
    if (window.VlogFast) {
      window.VlogFast.can(p, quality).then((ok) => {
        fastOk = ok;
        /* «обложка первым кадром» есть только в быстрой записи */
        syncCover();
        if (!ok || !d.open || result) return;
        $('vlogExportNote').textContent = t('Ролик собирается кадр за кадром, обычно быстрее, чем идёт, и без пропущенных кадров.');
        $('vlogRecord').disabled = false;
      }).catch(() => {});
    }
    syncCover();
    d.showModal();
  }
  let fastOk = false;
  function markQuality() {
    [...$('vlogQuality').children].forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === quality));
  }
  async function runExport() {
    const prog = $('vlogProgress');
    $('vlogRecord').disabled = true;
    $('vlogQuality').hidden = true;
    prog.hidden = false;
    prog.value = 0;
    abort = new AbortController();
    let lock = null;
    try { lock = navigator.wakeLock ? await navigator.wakeLock.request('screen') : null; } catch { lock = null; }
    try {
      const onProgress = (k) => { prog.value = k; };
      let blob = null;
      let done = false;
      if (fastOk && window.VlogFast) {
        try {
          blob = await window.VlogFast.record(p, quality, onProgress, abort.signal);
          done = true;
        } catch (err) {
          /* быстрая запись не вышла (например, кодировщик отказал): пишем по-старому, в реальном времени */
          console.warn('fast export failed, falling back', err);
          if (abort.signal.aborted) return;
          prog.value = 0;
          $('vlogExportNote').textContent = t('Ролик записывается в реальном времени: минута влога займёт минуту. Не сворачивай вкладку, пока идёт запись.');
        }
      }
      if (!done) blob = await Engine.record(p, quality, onProgress, abort.signal);
      if (!blob) return;
      result = blob;
      prog.value = 1;
      $('vlogRecord').hidden = true;
      $('vlogDownload').hidden = false;
      const file = new File([blob], fileName(blob), { type: blob.type });
      $('vlogShare').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
      $('vlogExportNote').textContent = `${t('Готово')}: ${fmt(total())}, ${(blob.size / 1048576).toFixed(1)} ${t('МБ')}.`;
    } catch {
      $('vlogExportNote').textContent = t('Не получилось записать ролик. Попробуй ещё раз или выбери 720p.');
      $('vlogRecord').disabled = false;
      $('vlogQuality').hidden = false;
    } finally {
      abort = null;
      if (lock) lock.release().catch(() => {});
      dirty = true;
    }
  }
  function fileName(blob) {
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const e = entry();
    const name = ((e && e.name) || 'vlog').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 40) || 'vlog';
    return `lunajour-${name}-${new Date().toLocaleDateString('sv-SE')}.${ext}`;
  }

  /* ---------- клавиши: пока влог открыт, клавиши карточки не срабатывают ---------- */
  function onKey(e) {
    if (!open) return;
    if ($('vlogExport').open) return;
    e.stopImmediatePropagation();
    const a = document.activeElement;
    if (a && (/TEXTAREA|SELECT/.test(a.tagName) || (a.tagName === 'INPUT' && !['range', 'checkbox'].includes(a.type)))) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && (k === 'z' || k === 'Z' || k === 'я' || k === 'Я')) { e.preventDefault(); undo(e.shiftKey); return; }
    if (mod && (k === 'y' || k === 'н')) { e.preventDefault(); undo(true); return; }
    if (mod) return;
    if (a && a.type === 'range' && k.startsWith('Arrow')) return;
    if (k === ' ') { e.preventDefault(); togglePlay(); }
    else if (k === 's' || k === 'S' || k === 'ы' || k === 'Ы') { e.preventDefault(); split(); }
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeSel(); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      if (Engine.playing) { Engine.pause(); syncPlay(); }
      seekTo(at + (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1000 : FRAME_MS));
    } else if (k === 'Home') seekTo(0);
    else if (k === 'End') seekTo(total());
    else if (k === '+' || k === '=') zoom(1.4);
    else if (k === '-' || k === '_') zoom(1 / 1.4);
    else if (k === 'Escape') { if (sheet) openSheet(''); else if (ov) selectOv(''); else if (join >= 0) selectJoin(-1); else select(-1); }
  }

  /* ---------- открыть и закрыть ---------- */
  let bound = false;
  function bind() {
    if (bound) return;
    bound = true;
    bindTimeline();
    $('vlogBack').onclick = close;
    $('vlogName').onclick = () => { pauseNow(); select(-1); selectOv(''); openSheet(sheet === 'projects' && !desktop() ? '' : 'projects'); };
    $('vlogPlay').onclick = togglePlay;
    $('vlogUndo').onclick = () => undo(false);
    $('vlogRedo').onclick = () => undo(true);
    $('vlogSave').onclick = openExport;
    $('vlogPick').onclick = () => $('vlogFiles').click();
    $('vlogFiles').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
    $('vlogMusicFile').onchange = (e) => { setMusicFile(e.target.files[0]); e.target.value = ''; };
    $('vlogStickerFile').onchange = (e) => { addStickerFile(e.target.files[0]); e.target.value = ''; };
    $('vlogMaskFile').onchange = (e) => { addMaskFile(e.target.files[0]); e.target.value = ''; };
    $('vlogProjectFile').onchange = (e) => { importProject(e.target.files[0]); e.target.value = ''; };
    $('vlogTools').addEventListener('scroll', fadeTools, { passive: true });
    $('vlogTools').onclick = (e) => { const b = e.target.closest('button'); if (b) runTool(b.dataset.tool); };
    $('vlogSheetClose').onclick = () => openSheet('');
    $('vlogQuality').onclick = (e) => { const b = e.target.closest('button'); if (b) { quality = Number(b.dataset.v); markQuality(); } };
    $('vlogRecord').onclick = runExport;
    $('vlogCoverSet').onclick = () => { commit(() => { p.cover = { ...(p.cover || {}), at: Math.round(at) }; }); syncCover(); };
    $('vlogCoverFirst').onchange = (e) => commit(() => { p.cover = { at: coverAt(), ...(p.cover || {}), first: e.target.checked }; });
    $('vlogCoverSave').onclick = saveCover;
    $('vlogExportClose').onclick = () => { if (abort) abort.abort(); $('vlogExport').close(); };
    $('vlogExport').addEventListener('cancel', () => { if (abort) abort.abort(); });
    $('vlogDownload').onclick = () => result && window.Export.save(result, fileName(result));
    $('vlogShare').onclick = () => {
      if (!result) return;
      const file = new File([result], fileName(result), { type: result.type });
      navigator.share({ files: [file] }).catch(() => {});
    };
    bindStage();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', () => { if (open) { sizeCanvas(); syncSheet(); fadeTools(); } });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && open && Engine.playing && !abort) { Engine.pause(); syncPlay(); }
    });
    Engine.onChange = () => { dirty = true; kick(); };
  }

  async function show(opts = {}) {
    onClose = opts.onClose || null;
    editorCard = opts.card || null;
    myStyles = (await Store.get('styles')) || [];
    scanPresets = (await Store.get('scanPresets').catch(() => null)) || [];
    ownStyles = (await Store.get('vlogStyles').catch(() => null)) || [];
    bind();
    if (!loaded) await load();
    open = true;
    $('vlog').hidden = false;
    Engine.audio();
    hist.clear();
    sel = -1;
    sheet = '';
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    requestAnimationFrame(() => {
      sizeCanvas();
      /* масштаб ленты: весь ролик примерно на ширину экрана */
      const w = $('vlogTl').clientWidth;
      if (total()) pps = Math.max(PPS_MIN, Math.min(PPS_MAX, (w * 0.8 * 1000) / total()));
      syncAll();
      kick();
    });
  }

  function close() {
    Engine.pause();
    Engine.release();
    open = false;
    $('vlog').hidden = true;
    flush();
    if (onClose) onClose();
  }

  /* «Память → Очистить влоги»: все влоги и их файлы уже удалены из базы, здесь забываем их и начинаем один пустой */
  async function reset() {
    Engine.pause();
    for (const id of Object.keys(p.media)) await Engine.forget(id);
    clearTimeout(saveTimer);
    projId = '';
    const id = Timeline.uid();
    index = { current: id, list: [{ id, name: t('Мой влог'), updated: Date.now(), clips: 0, dur: 0, thumb: '' }] };
    await openProject(id, false);
    await flush();
    loaded = true;
    if (open) syncAll();
  }

  return { open: show, close, reset, get isOpen() { return open; } };
})();
