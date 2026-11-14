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

  const canvasEl = () => $('vlogCanvas');
  const total = () => Timeline.duration(p);
  const clip = () => p.clips[sel] || null;
  const overlay = () => (ov && p.overlays.find((o) => o.id === ov)) || null;
  const desktop = () => window.matchMedia('(min-width: 900px)').matches;

  function fmt(ms) {
    const s = Math.max(0, ms) / 1000;
    const m = Math.floor(s / 60);
    const rest = s - m * 60;
    return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
  }

  let toastTimer = 0;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  /* ---------- сохранение черновика ---------- */
  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => Store.set('vlog', p), 500);
  }

  async function load() {
    const saved = await Store.get('vlog');
    if (saved && saved.v === 1 && Array.isArray(saved.clips)) p = { ...Timeline.newProject(), ...saved };
    /* файлы, которые ни к чему не привязаны, больше не нужны */
    for (const id of Timeline.unused(p)) {
      delete p.media[id];
      Engine.forget(id);
    }
    loaded = true;
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
      Engine.drawFrame(x, p, Math.min(at, total() - 1), { seek: false });
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
    renderOverlays();
    const lane = $('vlogMusicLane');
    const name = musicName();
    lane.style.width = `${Math.max(120, (total() * pps) / 1000)}px`;
    lane.classList.toggle('empty', !name);
    lane.textContent = name ? `♪ ${name}` : `+ ${t('Добавить музыку')}`;
    lane.hidden = !p.clips.length;
    $('vlogTl').style.setProperty('--head-h', `${$('vlogTrack').offsetHeight - 8}px`);
  }

  /* дорожка надписей и стикеров: полоска от начала до конца показа */
  function ovLabel(o) {
    const l = o.layer;
    if (l.type === 'text') return `T  ${String(l.text || '').replace(/\s+/g, ' ').slice(0, 24)}`;
    if (l.emoji) return l.emoji;
    return '★';
  }
  function renderOverlays() {
    const box = $('vlogOvs');
    box.textContent = '';
    const { rows, of } = Timeline.overlayRows(p);
    box.style.height = `${rows * 26}px`;
    box.hidden = !p.overlays.length;
    p.overlays.forEach((o) => {
      const el = document.createElement('div');
      el.className = `vlog-ov${o.id === ov ? ' sel' : ''}${o.layer.type === 'text' ? ' text' : ''}`;
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

    bindClipGestures();
    bindOverlayGestures();
    $('vlogClips').addEventListener('click', (e) => {
      const j = e.target.closest('.vlog-join');
      if (j) selectJoin(Number(j.dataset.join));
    });
    $('vlogMusicLane').onclick = () => openSheet('music');
    $('vlogZoomIn').onclick = () => zoom(1.4);
    $('vlogZoomOut').onclick = () => zoom(1 / 1.4);
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
  function bindOverlayGestures() {
    const box = $('vlogOvs');
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
      g = { kind: edge ? 'trim' : 'move', edge, id, x: e.clientX, pid: e.pointerId, start: o.start, end: o.end, pushed: false };
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
        o.start = Math.round(Math.max(0, Math.min(o.end - MIN, g.start + ms)));
        peek = o.start;
      } else {
        o.end = Math.round(Math.max(o.start + MIN, Math.min(T, g.end + ms)));
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

  const CLIP_SHEETS = ['look', 'fx', 'speed', 'vol', 'dur'];
  const OV_SHEETS = ['text', 'style', 'anim'];
  function selectOv(id, jump = true) {
    ov = id;
    sel = -1;
    join = -1;
    if (CLIP_SHEETS.includes(sheet) || sheet === 'trans' || (!id && OV_SHEETS.includes(sheet))) sheet = '';
    const o = overlay();
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
    const sel0 = overlay();
    if (sel0 && now >= sel0.start && now < sel0.end && inside(sel0, pt)) return sel0;
    return Engine.visible(p, now).reverse().find((o) => inside(o, pt)) || null;
  }

  function positionBox() {
    const boxEl = $('vlogBox');
    const o = overlay();
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
      const o = overlay();
      if (!o || pts.size < 2) return;
      const [a, b] = [...pts.values()];
      g = { kind: 'pinch', d0: dist(a, b), a0: angle(a, b), size: o.layer.size, rot: o.layer.rot || 0, pushed: g && g.pushed };
    };
    stage.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || e.target.closest('.vlog-empty')) return;
      const pt = canvasPoint(e);
      pts.set(e.pointerId, pt);
      try { stage.setPointerCapture(e.pointerId); } catch { /* палец уже отпущен */ }
      if (pts.size === 2) { startPinch(); return; }
      if (e.target.id === 'vlogBoxH') {
        const o = overlay();
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
      } else g = { kind: 'tap', pt };
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !g) return;
      const pt = canvasPoint(e);
      pts.set(e.pointerId, pt);
      const o = overlay();
      const c = canvasEl();
      if (g.kind === 'tap') return;
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
      if (was.kind === 'tap') {
        if (ov) selectOv('');
        else togglePlay();
      } else if (was.pushed) changed();
      else if (was.kind === 'move' && was.again && overlay() && overlay().layer.type === 'text') openSheet('text');
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    /* колесо мыши над выбранной надписью: размер, с Shift поворот */
    stage.addEventListener('wheel', (e) => {
      const o = overlay();
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
    stickers: '<path d="M16.5 11.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h6.5z"/><path d="M11.5 16.5v-3.5a1.5 1.5 0 0 1 1.5-1.5h3.5"/><circle cx="7.5" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>',
    style: '<circle cx="10" cy="10" r="7"/><circle cx="7" cy="8" r="1.2"/><circle cx="12" cy="7" r="1.2"/><circle cx="13" cy="11.5" r="1.2"/>',
    anim: '<path d="M3 15c3 0 4-10 7-10s4 10 7 10"/>',
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
    if (o) {
      nav.append(toolBtn('back', 'Все клипы'));
      if (o.layer.type === 'text') nav.append(toolBtn('text', 'Текст', sheet === 'text'));
      else nav.append(toolBtn('style', 'Вид', sheet === 'style'));
      nav.append(toolBtn('anim', 'Появление', sheet === 'anim'), toolBtn('dup', 'Копия'), toolBtn('del', 'Удалить'));
      return;
    }
    if (!c) {
      nav.append(
        toolBtn('add', 'Добавить'), toolBtn('split', 'Разрезать'), toolBtn('newText', 'Текст'), toolBtn('stickers', 'Стикеры', sheet === 'stickers'),
        toolBtn('trans', 'Переход', sheet === 'trans'), toolBtn('music', 'Музыка', sheet === 'music'), toolBtn('format', 'Формат', sheet === 'format'),
      );
      return;
    }
    nav.append(toolBtn('back', 'Все клипы'), toolBtn('split', 'Разрезать'), toolBtn('look', 'Цвет', sheet === 'look'), toolBtn('fx', 'Эффект', sheet === 'fx'));
    if (c.kind === 'video') nav.append(toolBtn('speed', 'Скорость', sheet === 'speed'), toolBtn('vol', 'Звук', sheet === 'vol'));
    else nav.append(toolBtn('dur', 'Длина', sheet === 'dur'));
    nav.append(toolBtn('dup', 'Копия'), toolBtn('del', 'Удалить'));
  }

  function runTool(id) {
    if (id === 'add') return $('vlogFiles').click();
    if (id === 'back') { select(-1); return selectOv(''); }
    if (id === 'split') return split();
    if (id === 'newText') return addText();
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
    music: 'Музыка', format: 'Формат', look: 'Цвет', fx: 'Эффект', speed: 'Скорость', vol: 'Звук клипа', dur: 'Длина показа', project: 'Влог',
    text: 'Текст', stickers: 'Стикеры', style: 'Вид стикера', anim: 'Появление', trans: 'Переход',
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
    const id = sheet || (desktop() ? (o ? (o.layer.type === 'text' ? 'text' : 'style') : clip() ? 'look' : join >= 0 ? 'trans' : 'project') : '');
    $('vlog').classList.toggle('sheet-open', !!sheet);
    $('vlog').style.setProperty('--vlog-tools-h', `${$('vlogTools').offsetHeight}px`);
    body.textContent = '';
    side.hidden = !id;
    if (!id) return;
    $('vlogSheetTitle').textContent = t(SHEETS[id] || '');
    $('vlogSheetClose').hidden = desktop() && !sheet;
    const c = clip();
    if (id === 'project') {
      body.append(el('p', 'hint', t('Нажми на клип в ленте, чтобы настроить его. Пустое место ленты листает время.')));
      sheetFormat(body);
      sheetMusic(body);
    }
    if (id === 'format') sheetFormat(body);
    if (id === 'music') sheetMusic(body);
    if (id === 'stickers') sheetStickers(body);
    if (id === 'trans') sheetTrans(body);
    if (o && id === 'text') sheetText(body, o);
    if (o && id === 'style') sheetStyle(body, o);
    if (o && id === 'anim') sheetAnim(body, o);
    if (!c) return;
    if (id === 'look') sheetLook(body, c);
    if (id === 'fx') sheetFx(body, c);
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
      body.append(group('Подложка', chips([['none', t('Нет')], ['plaque', t('Плашка')], ['outline', t('Контур')]], l.style || 'none', (v) => editLayer(o, { style: v }))));
    }
    body.append(group('Цвет текста', swatches(l.color, (c) => editLayer(o, { color: c }))));
    if (l.card || l.style === 'plaque' || l.style === 'outline') body.append(group(l.card ? 'Фон' : 'Цвет подложки', swatches(l.bg, (c) => editLayer(o, { bg: c }))));
    body.append(slider('Размер', 2, 40, 0.5, Math.round(l.size * 200) / 2, (v) => `${Math.round(v)}`, (v) => { l.size = v / 100; }));
    body.append(el('p', 'hint', t('На кадре надпись можно тянуть; угол рамки меняет размер и поворот. Двумя пальцами тоже.')));
  }

  function sheetStickers(body) {
    const tabs = [['emoji', t('Эмодзи')], ['ready', t('Готовые')], ['cards', t('Карточки')], ['mine', t('Мои картинки')]];
    body.append(chips(tabs, stickerTab, (v) => { stickerTab = v; syncSheet(); }));
    const grid = el('div', 'vlog-stickers');
    const btn = (label, content, layer) => {
      const b = el('button');
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      if (typeof content === 'string') b.textContent = content;
      else b.append(content);
      b.onclick = () => addSticker(layer);
      grid.append(b);
    };
    if (stickerTab === 'emoji') EMOJIS.forEach((e) => btn(e, e, { type: 'sticker', emoji: e, size: 0.2 }));
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
      Object.values(p.media).filter((m) => m.kind === 'sticker').forEach((m) => {
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
    body.append(group('Обводка', chips([[false, t('Нет')], [true, t('Белый край наклейки')]], !!l.die, (v) => editLayer(o, { die: v }))));
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

  function sheetFormat(body) {
    const seg = el('div', 'seg');
    RATIO_LIST.forEach((r) => {
      const b = el('button', r === p.ratio ? 'on' : '', r);
      b.type = 'button';
      b.onclick = () => { commit(() => { p.ratio = r; }); sizeCanvas(); };
      seg.append(b);
    });
    body.append(group('Формат ролика', seg), el('p', 'hint', t('9:16 для Reels, Shorts и TikTok. Клипы заполняют кадр целиком, края обрезаются.')));
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
    body.append(el('p', 'hint', t('Музыка играет под всем роликом и затихает в конце. Звук самих клипов настраивается у каждого клипа.')));
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

  function sheetFx(body, c) {
    const E = window.Effects;
    if (!E) return;
    const list = [['', t('Без эффекта')], ...E.EFFECTS.map((x) => [x.id, t(x.name)])];
    body.append(group('', chips(list, c.fx, (v) => commit(() => { c.fx = v; }))));
    body.append(toAll('Ко всем клипам', () => p.clips.forEach((x) => { x.fx = c.fx; })));
    body.append(el('p', 'hint', t('Эффекты из раздела «Эффекты» карточки, поверх всего кадра. Глитчи в ролике живые.')));
  }

  /* ---------- синхронизация экрана ---------- */
  function syncTime() {
    $('vlogTime').textContent = `${fmt(peek ?? at)} / ${fmt(total())}`;
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
    if (failed) toast(t('Часть файлов не открылась. Попробуй MP4 или фото JPG/PNG.'));
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
    $('vlogExportNote').textContent = Engine.canRecord()
      ? t('Ролик записывается в реальном времени: минута влога займёт минуту. Не сворачивай вкладку, пока идёт запись.')
      : t('Этот браузер не умеет записывать видео. Открой Lunajour в Chrome или Safari.');
    $('vlogRecord').disabled = !Engine.canRecord();
    d.showModal();
  }
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
      const blob = await Engine.record(p, quality, (k) => { prog.value = k; }, abort.signal);
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
    return `lunajour-vlog-${new Date().toLocaleDateString('sv-SE')}.${ext}`;
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
    $('vlogPlay').onclick = togglePlay;
    $('vlogUndo').onclick = () => undo(false);
    $('vlogRedo').onclick = () => undo(true);
    $('vlogSave').onclick = openExport;
    $('vlogPick').onclick = () => $('vlogFiles').click();
    $('vlogFiles').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
    $('vlogMusicFile').onchange = (e) => { setMusicFile(e.target.files[0]); e.target.value = ''; };
    $('vlogStickerFile').onchange = (e) => { addStickerFile(e.target.files[0]); e.target.value = ''; };
    $('vlogTools').onclick = (e) => { const b = e.target.closest('button'); if (b) runTool(b.dataset.tool); };
    $('vlogSheetClose').onclick = () => openSheet('');
    $('vlogQuality').onclick = (e) => { const b = e.target.closest('button'); if (b) { quality = Number(b.dataset.v); markQuality(); } };
    $('vlogRecord').onclick = runExport;
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
    window.addEventListener('resize', () => { if (open) { sizeCanvas(); syncSheet(); } });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && open && Engine.playing && !abort) { Engine.pause(); syncPlay(); }
    });
    Engine.onChange = () => { dirty = true; kick(); };
  }

  async function show(opts = {}) {
    onClose = opts.onClose || null;
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
    clearTimeout(saveTimer);
    Store.set('vlog', p);
    if (onClose) onClose();
  }

  return { open: show, close, get isOpen() { return open; } };
})();
