/* Влог: модель проекта. Только данные и операции над ними, без отрисовки.
   Время везде в миллисекундах. Файлы клипов лежат в IndexedDB отдельно (ключ vlog-m-<id>),
   в проекте только их описание: так проект легко копировать для отмены и сохранять. */
window.Timeline = (function () {
  const MIN_MS = 300;
  const IMAGE_MS = 3000;
  const HISTORY = 60;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function newProject() {
    return {
      v: 1,
      ratio: '9:16',
      media: {},
      clips: [],
      /* музыка идёт под всем роликом: встроенная мелодия по кругу или свой файл с выбранной секунды */
      music: { track: '', fileId: '', name: '', start: 0, vol: 70 },
      /* текст и стикеры поверх ролика: слой в формате карточки (js/render.js) и отрезок времени */
      overlays: [],
    };
  }

  /* клип ссылается на файл и вырезает из него кусок [in, out] */
  function newClip(m) {
    const out = m.kind === 'image' ? IMAGE_MS : Math.max(MIN_MS, Math.round(m.dur || IMAGE_MS));
    return { id: uid(), media: m.id, kind: m.kind, in: 0, out, speed: 1, vol: 100, look: '', fx: '' };
  }

  const len = (c) => (c.out - c.in) / (c.speed || 1);
  const duration = (p) => p.clips.reduce((sum, c) => sum + len(c), 0);
  const starts = (p) => {
    let acc = 0;
    return p.clips.map((c) => { const s = acc; acc += len(c); return s; });
  };

  /* какой клип звучит в момент t и какое место файла показывать */
  function at(p, t) {
    let acc = 0;
    for (let i = 0; i < p.clips.length; i++) {
      const c = p.clips[i];
      const l = len(c);
      if (t < acc + l || i === p.clips.length - 1) {
        const into = Math.max(0, Math.min(l, t - acc));
        return { i, clip: c, start: acc, into, local: c.in + into * (c.speed || 1) };
      }
      acc += l;
    }
    return null;
  }

  function add(p, list, index = p.clips.length) {
    const fresh = list.map(newClip);
    p.clips.splice(index, 0, ...fresh);
    return fresh;
  }

  /* разрезать там, где стоит указатель; слишком короткие куски не оставляем */
  function canSplit(p, t) {
    const hit = at(p, t);
    return !!hit && hit.local - hit.clip.in >= MIN_MS && hit.clip.out - hit.local >= MIN_MS;
  }
  function split(p, t) {
    if (!canSplit(p, t)) return false;
    const { i, clip, local } = at(p, t);
    const right = { ...clip, id: uid(), in: Math.round(local) };
    /* переход после клипа уезжает вместе с правой частью, на новом стыке его нет */
    delete clip.tr;
    clip.out = Math.round(local);
    p.clips.splice(i + 1, 0, right);
    return true;
  }

  /* край клипа: у видео не дальше границ файла, у фото меняется только длина показа */
  function trim(p, i, edge, value) {
    const c = p.clips[i];
    const m = p.media[c.media];
    const max = c.kind === 'image' ? 60000 : (m && m.dur) || c.out;
    if (c.kind === 'image') {
      c.in = 0;
      c.out = Math.round(Math.max(MIN_MS, Math.min(max, value)));
      return;
    }
    if (edge === 'in') c.in = Math.round(Math.max(0, Math.min(c.out - MIN_MS, value)));
    else c.out = Math.round(Math.max(c.in + MIN_MS, Math.min(max, value)));
  }

  function move(p, from, to) {
    if (from === to || from < 0 || to < 0 || from >= p.clips.length || to >= p.clips.length) return false;
    const [c] = p.clips.splice(from, 1);
    p.clips.splice(to, 0, c);
    return true;
  }

  function remove(p, i) {
    p.clips.splice(i, 1);
  }

  function dup(p, i) {
    const c = { ...p.clips[i], id: uid(), tr: p.clips[i].tr ? { ...p.clips[i].tr } : undefined };
    p.clips.splice(i + 1, 0, c);
    return c;
  }

  /* ---------- переходы ---------- */
  /* Переход хранится у левого клипа (c.tr) и ложится на стык: половина до склейки, половина после.
     Длина ролика от этого не меняется. Переход не длиннее самих клипов. */
  const TR_MS = 600;
  function trDur(p, i) {
    const a = p.clips[i];
    const b = p.clips[i + 1];
    if (!a || !b || !a.tr || !a.tr.id) return 0;
    return Math.max(100, Math.min(a.tr.dur || TR_MS, len(a), len(b)));
  }
  /* что смешивать в момент t: левый клип стоит на последнем кадре, правый на первом; k от 0 до 1 */
  function transitionAt(p, hit) {
    if (!hit) return null;
    const { i, clip, into } = hit;
    const l = len(clip);
    const prev = p.clips[i - 1];
    const dIn = i > 0 ? trDur(p, i - 1) : 0;
    if (dIn && into < dIn / 2) {
      return { id: prev.tr.id, k: 0.5 + into / dIn, a: prev, aLocal: prev.out - 40, aInto: len(prev), b: clip, bLocal: hit.local, bInto: into };
    }
    const next = p.clips[i + 1];
    const dOut = trDur(p, i);
    if (dOut && l - into < dOut / 2) {
      return { id: clip.tr.id, k: 0.5 - (l - into) / dOut, a: clip, aLocal: hit.local, aInto: into, b: next, bLocal: next.in, bInto: 0 };
    }
    return null;
  }

  /* ---------- текст и стикеры ---------- */
  const OV_MS = 3000;
  function addOverlay(p, layer, t) {
    const total = duration(p);
    const start = Math.max(0, Math.min(t, total - MIN_MS));
    const o = { id: uid(), start: Math.round(start), end: Math.round(Math.min(total, start + OV_MS)), anim: 'pop', fadeOut: true, layer };
    p.overlays.push(o);
    return o;
  }
  /* после обрезки клипов надписи не должны висеть за концом ролика */
  function fitOverlays(p) {
    const total = duration(p);
    p.overlays.forEach((o) => {
      if (o.end > total) o.end = Math.round(total);
      if (o.start > o.end - MIN_MS) o.start = Math.round(Math.max(0, o.end - MIN_MS));
    });
  }
  /* ряды дорожки: надписи, которые идут одновременно, ложатся друг под друга */
  function overlayRows(p) {
    const rows = [];
    const out = new Map();
    [...p.overlays].sort((a, b) => a.start - b.start).forEach((o) => {
      let r = rows.findIndex((end) => end <= o.start);
      if (r < 0) { r = rows.length; rows.push(0); }
      rows[r] = o.end;
      out.set(o.id, r);
    });
    return { rows: rows.length, of: out };
  }

  /* файлы, на которые больше не ссылается ни один клип, стикер и не музыка */
  function unused(p) {
    const used = new Set(p.clips.map((c) => c.media));
    (p.overlays || []).forEach((o) => { if (o.layer.img) used.add(o.layer.img); });
    if (p.music.fileId) used.add(p.music.fileId);
    return Object.keys(p.media).filter((id) => !used.has(id));
  }

  /* отмена: копии проекта до каждого действия */
  function history() {
    let back = [];
    let ahead = [];
    return {
      push(p) {
        back.push(JSON.stringify(p));
        if (back.length > HISTORY) back.shift();
        ahead = [];
      },
      undo(p) {
        if (!back.length) return null;
        ahead.push(JSON.stringify(p));
        return JSON.parse(back.pop());
      },
      redo(p) {
        if (!ahead.length) return null;
        back.push(JSON.stringify(p));
        return JSON.parse(ahead.pop());
      },
      clear() { back = []; ahead = []; },
      get canUndo() { return back.length > 0; },
      get canRedo() { return ahead.length > 0; },
    };
  }

  return {
    MIN_MS, IMAGE_MS, TR_MS, uid, newProject, newClip, len, duration, starts, at, add, canSplit, split, trim, move, remove, dup, unused, history,
    trDur, transitionAt, addOverlay, fitOverlays, overlayRows,
  };
})();
