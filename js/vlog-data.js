/* Влог: справочники и чистые функции без экрана и без состояния.
   Значки инструментов, стили «Собрать за меня», эмодзи, цвета, готовые надписи, шаги линейки;
   формат времени, склонение «клипа/клипов», стиль из оформления влога. Проверяются тестами в Node. */
(function (root) {
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
    pauses: '<path d="M2 10h3l1.5-4 2 8 1.5-4h1"/><path d="M13 6v8M17 6v8"/>',
    freeze: '<rect x="3" y="4" width="14" height="12" rx="1"/><path d="M10 7v6M7.5 8.5l5 3M12.5 8.5l-5 3"/>',
    reverse: '<path d="M8 5L4 9l4 4"/><path d="M4 9h8a4 4 0 0 1 0 8H9"/>',
    subs: '<rect x="2.5" y="4" width="15" height="12" rx="1.5"/><path d="M5.5 11h3M10.5 11h4M5.5 13.5h6"/>',
    trans: '<rect x="2.5" y="5" width="7" height="10" rx="1"/><rect x="10.5" y="5" width="7" height="10" rx="1" opacity=".5"/><path d="M8 10h4"/>',
  };

  /* ---------- «Собрать за меня» ----------
     Стиль задаёт музыку, длину фото, движение, переходы, цвет и подпись в начале.
     photo: секунд на фото; video: самое длинное видео, с; стыки потом встают на ближайший такт музыки. */
  const AUTO_STYLES = [
    { id: 'calm', name: 'Спокойный', track: 'dream', photo: 3.5, video: 6, look: 'dream', tr: ['fade'], trMs: 900, moves: ['in', 'out', 'left', 'right'],
      title: { font: 'yeseva', color: '#ffffff', style: 'none', shadow: 'soft', anim: 'fade' } },
    { id: 'energy', name: 'Бодрый', track: 'neon', photo: 1.7, video: 3, look: 'flash', tr: ['zoom', 'slide', 'flash'], trMs: 350, moves: ['in', 'left', 'right', 'out'],
      title: { font: 'unbounded', color: '#ffffff', style: 'outline', bg: '#111111', shadow: 'none', anim: 'pop' } },
    { id: 'film', name: 'Плёнка', track: 'lofi', photo: 3, video: 5, look: 'film', tr: ['black'], trMs: 700, moves: ['in', 'none', 'out', 'none'],
      title: { font: 'mono', color: '#111111', style: 'plaque', bg: '#ffe27a', shadow: 'none', anim: 'type' } },
    { id: 'diary', name: 'Дневник', track: 'chill', photo: 3, video: 5, look: 'warm', tr: ['fade', 'slide'], trMs: 600, moves: ['in', 'right', 'out', 'left'],
      title: { font: 'caveat', color: '#ffffff', style: 'none', shadow: 'soft', anim: 'rise' } },
    { id: 'retro', name: 'Ретро', track: 'lofi', photo: 2.5, video: 4, look: 'p1994', tr: ['flash', 'black'], trMs: 400, moves: ['in', 'none'],
      title: { font: 'retrogression', color: '#ffe27a', style: 'none', shadow: 'soft', anim: 'type' } },
    { id: 'night', name: 'Ночь', track: 'sunset', photo: 3, video: 5, look: 'pNightDriving', tr: ['black', 'fade'], trMs: 800, moves: ['out', 'in'],
      title: { font: 'dreamer', color: '#ffffff', style: 'haze', bg: '#1f3a8a', shadow: 'none', anim: 'fade' } },
    { id: 'tender', name: 'Нежный', track: 'dream', photo: 3.5, video: 5, look: 'pink', tr: ['fade'], trMs: 1000, moves: ['in', 'out'],
      title: { font: 'sexsmith', color: '#f9a8d4', style: 'outline', bg: '#ffffff', shadow: 'soft', anim: 'rise' } },
    { id: 'mono', name: 'Ч/б', track: 'lofi', photo: 2.5, video: 4, look: 'bw', tr: ['black', 'slide'], trMs: 500, moves: ['none', 'in'],
      title: { font: 'mono', color: '#ffffff', style: 'plaque', bg: '#111111', shadow: 'none', anim: 'type' } },
  ];

  /* ---------- сценарии: готовые подписи по порядку клипов ----------
     Клипы снимает человек сам, сценарий только подписывает их: первая подпись на первом клипе и так далее. */
  const SCENARIOS = [
    { id: 'day', name: 'Мой день', lines: ['утро', 'завтрак', 'дела', 'прогулка', 'вечер', 'спокойной ночи'] },
    { id: 'trip', name: 'Поездка', lines: ['в дороге', 'приехали', 'гуляем', 'самое вкусное', 'закат', 'до встречи'] },
    { id: 'food', name: 'Что я ела', lines: ['завтрак', 'перекус', 'обед', 'десерт', 'ужин'] },
    { id: 'unbox', name: 'Распаковка', lines: ['что пришло', 'открываем', 'что внутри', 'пробуем', 'итог'] },
    { id: 'week', name: 'Неделя', lines: ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'] },
    { id: 'count', name: 'Счёт', lines: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
  ];

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

  /* линейка времени: подписи не теснее ~56 px */
  const RULER_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

  /* 0:03.5 — минуты, секунды с десятыми */
  function fmt(ms) {
    const s = Math.max(0, ms) / 1000;
    const m = Math.floor(s / 60);
    const rest = s - m * 60;
    return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
  }

  /* «3 клипа», «5 клипов», «1 clip» */
  function clipsText(n, lang) {
    if (lang === 'en') return `${n} ${n === 1 ? 'clip' : 'clips'}`;
    const d = n % 10;
    const dd = n % 100;
    const word = d === 1 && dd !== 11 ? 'клип' : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'клипа' : 'клипов';
    return `${n} ${word}`;
  }

  /* стиль из того, как оформлен влог сейчас: музыка, длина фото, движения, переходы, цвет, подпись */
  function styleFromVlog(p, Timeline) {
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

  /* ---------- когда снято ----------
     Фото JPEG: DateTimeOriginal из EXIF (время по часам камеры, без пояса). Видео MP4/MOV: creation_time
     из mvhd (секунды с 1904 года, UTC). bytes — начало файла (у видео ещё и хвост: mvhd бывает в конце).
     → мс от 1970 или 0, если даты нет. */
  function exifDate(u8) {
    if (u8[0] !== 0xff || u8[1] !== 0xd8) return 0;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let i = 2;
    while (i + 4 < u8.length) {
      if (u8[i] !== 0xff) return 0;
      const mark = u8[i + 1];
      const size = dv.getUint16(i + 2);
      if (mark === 0xe1 && String.fromCharCode(...u8.subarray(i + 4, i + 8)) === 'Exif') return tiffDate(dv, i + 10);
      if (mark === 0xda) return 0;
      i += 2 + size;
    }
    return 0;
  }
  function tiffDate(dv, base) {
    if (base + 8 > dv.byteLength) return 0;
    const le = dv.getUint16(base) === 0x4949;
    const u16 = (o) => dv.getUint16(base + o, le);
    const u32 = (o) => dv.getUint32(base + o, le);
    /* значение тега в каталоге (IFD) по смещению off: { tag: смещение значения } */
    const tags = (off) => {
      const out = {};
      if (base + off + 2 > dv.byteLength) return out;
      const n = u16(off);
      for (let k = 0; k < n; k++) {
        const e = off + 2 + k * 12;
        if (base + e + 12 > dv.byteLength) break;
        out[u16(e)] = { count: u32(e + 4), at: u32(e + 8), raw: e + 8 };
      }
      return out;
    };
    const ascii = (t) => {
      if (!t || t.count < 19 || base + t.at + 19 > dv.byteLength) return '';
      let s = '';
      for (let k = 0; k < 19; k++) s += String.fromCharCode(dv.getUint8(base + t.at + k));
      return s;
    };
    const ifd0 = tags(u32(4));
    const exif = ifd0[0x8769] ? tags(ifd0[0x8769].at) : {};
    return parseExifTime(ascii(exif[0x9003]) || ascii(exif[0x9004]) || ascii(ifd0[0x0132]));
  }
  /* «2026:11:20 18:04:31» → мс по местному времени */
  function parseExifTime(s) {
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s || '');
    if (!m || m[1] === '0000') return 0;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  }
  function mp4Date(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    for (let i = 4; i + 24 < u8.length; i++) {
      if (u8[i] !== 0x6d || u8[i + 1] !== 0x76 || u8[i + 2] !== 0x68 || u8[i + 3] !== 0x64) continue; /* 'mvhd' */
      const v = u8[i + 4];
      const secs = v === 1 ? dv.getUint32(i + 8) * 4294967296 + dv.getUint32(i + 12) : dv.getUint32(i + 8);
      /* 0 и даты раньше 2000 года — камера без часов */
      const ms = (secs - 2082844800) * 1000;
      return ms > 946684800000 ? ms : 0;
    }
    return 0;
  }
  function takenFromBytes(u8, kind) {
    try { return kind === 'video' ? mp4Date(u8) : exifDate(u8); } catch { return 0; }
  }

  /* надпись даты: «20.11.2026», «NOV 20 2026» как на старой камере, «20 ноября» */
  const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dateText(ms, kind, lang) {
    const d = new Date(ms);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    if (kind === 'cam') return `${MONTHS_EN[d.getMonth()].slice(0, 3).toUpperCase()} ${dd} ${d.getFullYear()}`;
    if (kind === 'words') return lang === 'en' ? `${MONTHS_EN[d.getMonth()]} ${d.getDate()}` : `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
    return `${dd}.${mm}.${d.getFullYear()}`;
  }

  /* порядок клипов по времени съёмки; клипы без даты уходят в конец в прежнем порядке */
  function byTaken(clips, media) {
    const when = (c) => (media[c.media] && media[c.media].taken) || Infinity;
    return clips.map((c, i) => [c, i]).sort((a, b) => when(a[0]) - when(b[0]) || a[1] - b[1]).map(([c]) => c);
  }

  /* ---------- паузы в речи ----------
     level: громкость по кусочкам (0..1), step: мс на кусочек. Тишина — тише порога дольше minGap.
     → куски, которые оставить: [{ from, to }] в мс, с запасом pad по краям, чтобы не резать слова. */
  function keepRanges(level, step, { threshold = 0.04, minGap = 600, pad = 120, minKeep = 300 } = {}) {
    const n = level.length;
    const quiet = [];
    let s = -1;
    for (let k = 0; k <= n; k++) {
      const q = k < n && level[k] < threshold;
      if (q && s < 0) s = k;
      if (!q && s >= 0) {
        if ((k - s) * step >= minGap) quiet.push([s * step, k * step]);
        s = -1;
      }
    }
    const total = n * step;
    const keep = [];
    let from = 0;
    quiet.forEach(([a, b]) => {
      const to = a === 0 ? 0 : a + pad;
      if (to - from >= minKeep) keep.push({ from, to });
      from = b >= total ? total : Math.max(to, b - pad);
    });
    if (total - from >= minKeep) keep.push({ from, to: total });
    return keep;
  }

  /* ---------- субтитры ----------
     Куски речи от распознавания ({ start, end, text }, мс) → строки не длиннее max знаков.
     Длинный кусок делится по словам, время между строками — пропорционально числу знаков. */
  function subLines(chunks, max = 42) {
    const out = [];
    chunks.forEach((c) => {
      /* пометки вместо речи: «(свист)», «[Музыка]», «♪» — не субтитры */
      const said = String(c.text || '').replace(/\([^)]*\)|\[[^\]]*\]|[♪♫*]/g, ' ');
      const words = said.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
      if (!words.length || !(c.end > c.start)) return;
      const lines = [];
      let cur = '';
      words.forEach((w) => {
        if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
      });
      if (cur) lines.push(cur);
      const chars = lines.reduce((s, l) => s + l.length, 0);
      let at = c.start;
      lines.forEach((l, k) => {
        const end = k === lines.length - 1 ? c.end : Math.round(at + ((c.end - c.start) * l.length) / chars);
        out.push({ start: Math.round(at), end, text: l });
        at = end;
      });
    });
    return out;
  }

  /* ---------- ограничения площадок по длине, с ---------- */
  const LIMITS = [
    { name: 'Reels', max: 180 },
    { name: 'Shorts', max: 180 },
    { name: 'TikTok', max: 600 },
  ];
  function limitsText(totalMs, ratio, lang) {
    const s = totalMs / 1000;
    const ok = LIMITS.filter((l) => s <= l.max).map((l) => l.name);
    const no = LIMITS.filter((l) => s > l.max).map((l) => l.name);
    const en = lang === 'en';
    let text = !no.length
      ? (en ? `Fits ${ok.join(', ')}.` : `Подходит для ${ok.join(', ')}.`)
      : ok.length
        ? (en ? `Too long for ${no.join(' and ')} (3 min max); fine for ${ok.join(', ')}.` : `Длиннее, чем принимают ${no.join(' и ')} (до 3 мин); ${ok.join(', ')} — подходит.`)
        : (en ? 'Longer than Reels, Shorts and TikTok accept.' : 'Длиннее, чем принимают Reels, Shorts и TikTok.');
    if (ratio !== '9:16') text += en ? ' These apps fill the screen best with 9:16.' : ' Для них лучше формат 9:16.';
    return text;
  }

  root.VlogData = { subLines, limitsText, ICONS, AUTO_STYLES, SCENARIOS, EMOJIS, COLORS, TEXT_PRESETS, RULER_STEPS, fmt, clipsText, styleFromVlog, takenFromBytes, parseExifTime, dateText, byTaken, keepRanges };
})(typeof window !== 'undefined' ? window : globalThis);
