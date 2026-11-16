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

  root.VlogData = { ICONS, AUTO_STYLES, EMOJIS, COLORS, TEXT_PRESETS, RULER_STEPS, fmt, clipsText, styleFromVlog };
})(typeof window !== 'undefined' ? window : globalThis);
