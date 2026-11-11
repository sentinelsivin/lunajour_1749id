/* Сканер: конструктор «машинного зрения» поверх фото.
   Картинка собирается из деталей: рамки, подписи по шаблону, линза (другая обработка внутри рамок или снаружи),
   лупа-выноска с увеличенным куском кадра, связи между рамками и интерфейс камеры по краям.
   Рамки хранятся в долях области фото, как у эффектов: state.scan.boxes. Пустой список: рамки ищутся сами. */
window.Scanner = (function () {
  const MONO = '"JetBrains Mono", ui-monospace, monospace';
  const SANS = '"Golos Text", system-ui, sans-serif';
  const TAU = Math.PI * 2;

  const defaults = () => ({
    on: false, preset: '', color: '#39ff6a', shape: 'full', label: 'plate', text: '', font: '', line: 1, glow: false,
    amount: 1, seed: 5, boxes: [],
    lens: 'none', lensOut: false,
    zoom: 0, zoomLook: 'same', zoomLine: 'one', zoomText: '#{hex}',
    links: 'none',
    hud: [], cam: 'CAM#3', status: 'Biometric identification ON, Behavior analysis ON, Style analysis ON',
    anim: true, motion: 'still', icons: [], dossier: dossierDefaults(),
  });
  function dossierDefaults() {
    return { on: false, style: 'plates', title: 'OFFLINE ACTIVITY DETECTED', rows: 'ID: {id}\nSOCIAL SYNC RATE: {%}\nINTERACTION FREQUENCY: RARE\nEMOTIONAL OUTPUT: CONTROLLED', x: null, y: null };
  }
  const D = (o) => ({ ...dossierDefaults(), on: true, ...o });

  /* Готовые наборы: с них удобно начать, дальше любую деталь можно поменять. */
  const PRESETS = [
    { id: 'cctv', name: 'CCTV', set: { color: '#3d4bff', shape: 'full', label: 'flag', text: 'FEMALE, #{hex}, UNDER, #{hex}', zoom: 1, zoomLook: 'bw', zoomLine: 'funnel', links: 'none', lens: 'none', glow: false, hud: ['corners', 'cam', 'time', 'rec'], cam: 'CCTV 01', amount: 0.6,
      icons: [{ k: 'cursor', x: 0.55, y: 0.3, s: 1 }, { k: 'folder', x: 0.12, y: 0.46, s: 1 }, { k: 'folder', x: 0.24, y: 0.58, s: 0.8 }, { k: 'warning', x: 0.86, y: 0.26, s: 0.8 }] } },
    { id: 'person', name: 'Распознавание', set: { color: '#39ff6a', shape: 'full', label: 'plate', text: 'person: {0.}', lens: 'tint', lensOut: false, zoom: 0, links: 'none', glow: false, hud: [], amount: 0.8 } },
    { id: 'windows', name: 'Окна', set: { color: '#39ff6a', shape: 'full', label: 'below', text: 'online, AFK, searching…, online, where am i, a way out ???', line: 2.2, glow: true, lens: 'none', zoom: 0, links: 'none', hud: [], amount: 0.9 } },
    { id: 'botany', name: 'Ботаника', set: { color: '#ffffff', shape: 'nodes', label: 'corner', text: '#{hex}', zoom: 2, zoomLook: 'same', zoomLine: 'funnel', zoomText: '', links: 'net', lens: 'none', glow: true, hud: [], amount: 0.7 } },
    { id: 'thermal', name: 'Тепловизор', set: { color: '#ffffff', shape: 'cross', label: 'corner', text: '{t}°C', lens: 'thermal', lensOut: false, zoom: 0, links: 'none', glow: false, hud: ['corners', 'rec', 'time', 'scan'], amount: 0.7 } },
    { id: 'noir', name: 'Нуар', set: { color: '#ff5a1f', shape: 'nodes', label: 'none', text: '', lens: 'bw', lensOut: true, zoom: 0, links: 'hub', glow: true, hud: ['noise'], amount: 0.5 } },
    { id: 'terminal', name: 'Терминал', set: { color: '#3dff7a', shape: 'full', label: 'corner', text: '{label}, product, #{hex}', lens: 'none', zoom: 1, zoomLook: 'same', zoomLine: 'elbow', zoomText: '', links: 'none', glow: false, hud: [], amount: 0.5,
      dossier: D({ style: 'terminal', title: '//// DETECTION:', rows: 'PRODUCT: {label}\nmood: {mood}\nLIFE LEVEL\nprocessing… [70%]' }) } },
    { id: 'objects', name: 'Объекты', set: { color: '#ffffff', shape: 'full', label: 'plate', text: 'Object {n}', lens: 'none', zoom: 0, links: 'net', glow: false, hud: ['noise'], amount: 1.4 } },
    { id: 'dossier', name: 'Досье', set: { color: '#2bd94a', shape: 'cross', label: 'corner', text: 'person 0.{nn}', zoom: 1, zoomLook: 'bw', zoomLine: 'elbow', zoomText: '', lens: 'none', links: 'none', glow: false, hud: ['frame', 'ruler', 'status'], status: 'signal strength: 92%, noise level: internal, output filter: active', amount: 0.5,
      dossier: D({}) } },
    { id: 'feelings', name: 'Детектор чувств', set: { color: '#f472b6', shape: 'corners', label: 'plate', text: 'longing {0.}, nostalgia {%}, tenderness {%}, quiet joy {0.}, butterflies {%}', lens: 'none', zoom: 1, zoomLook: 'duo', zoomLine: 'one', zoomText: 'SUBJECT #{hex}', links: 'none', glow: true, hud: ['corners', 'rec', 'time'], amount: 0.6,
      dossier: D({ style: 'card', title: 'EMOTION SCAN', rows: 'SUBJECT: {id}\nMOOD: {mood}\nTENDERNESS: {%}\nUntil the weekend [62%]' }) } },
    /* лица с глазами и шкалами чувств под рамкой */
    { id: 'faceFront', name: 'Шкалы чувств', set: { color: '#5b5bff', shape: 'eyes', label: 'meters', text: 'Face.Front, Angry, Happy, Sad, Surprised, Gender: Male', line: 1, lens: 'none', zoom: 0, links: 'none', glow: false, hud: [], amount: 0.6 } },
    { id: 'surf', name: 'Флажки', set: { color: '#ff2020', shape: 'full', label: 'flag', text: '', line: 0.8, lens: 'none', zoom: 0, links: 'none', glow: false, hud: [], amount: 1 } },
    /* для видео: как в роликах с цветами */
    { id: 'glassFlash', name: 'Стекло', set: { color: '#ffffff', shape: 'full', label: 'center', text: '{.4}', line: 0.6, lens: 'glass', lensOut: false, zoom: 0, links: 'chain', glow: false, hud: [], amount: 1, motion: 'flash' } },
    { id: 'swarm', name: 'Рой', set: { color: '#a8324e', shape: 'xbox', label: 'corner', text: '{nn}{n}, 0.{nn}, {x}, #{hex}', line: 0.5, lens: 'none', zoom: 0, links: 'net', glow: false, hud: [], amount: 1, motion: 'swarm' } },
    /* бывшие эффекты с рамками из вкладки «Эффекты» */
    { id: 'detect', name: 'Плашки', set: { color: '#f5c518', shape: 'full', label: 'plate', text: 'Person {%}', line: 1.1, lens: 'none', zoom: 0, links: 'none', glow: false, hud: [], amount: 1.4 } },
    { id: 'rings', name: 'Кружки', set: { color: '#ffffff', shape: 'oval', label: 'corner', text: '{nn}', line: 0.7, lens: 'none', zoom: 0, links: 'chain', glow: false, hud: [], amount: 1.2 } },
    { id: 'coords', name: 'Координаты', set: { color: '#ffffff', shape: 'target', label: 'corner', text: 'x: {x} y: {y}', line: 0.75, lens: 'none', zoom: 0, links: 'center', glow: false, hud: ['digits'], amount: 1.4 } },
    { id: 'coordArcs', name: 'Координаты с дугами', set: { color: '#ff3b3b', shape: 'target', label: 'corner', text: 'x: {x}  y: {y}', line: 0.7, lens: 'none', zoom: 0, links: 'arcs', glow: false, hud: [], amount: 2.2 } },
  ];

  const SHAPES = [['full', 'Рамка'], ['eyes', 'С глазами'], ['corners', 'Уголки'], ['dashed', 'Пунктир'], ['cross', 'Прицел'], ['target', 'Мишень'], ['xbox', 'С крестом'], ['nodes', 'С узлами'], ['double', 'Двойная'], ['oval', 'Овал']];
  const LABELS = [['plate', 'Плашка'], ['flag', 'Флажок'], ['meters', 'Шкалы'], ['below', 'Снизу'], ['corner', 'Мелко сверху'], ['center', 'В центре'], ['none', 'Без подписи']];
  const LENSES = [['none', 'Нет'], ['thermal', 'Тепловизор'], ['invert', 'Негатив'], ['bw', 'Ч/б'], ['pixel', 'Пиксели'], ['tint', 'Заливка'], ['duo', 'Два цвета'], ['xray', 'Рентген'], ['glass', 'Стекло']];
  const LOOKS = [['same', 'Как есть'], ['bw', 'Ч/б'], ['pixel', 'Пиксели'], ['invert', 'Негатив'], ['thermal', 'Тепловизор'], ['duo', 'Два цвета']];
  const ZOOM_LINES = [['one', 'Линия'], ['funnel', 'Воронка'], ['elbow', 'Уголком']];
  const LINKS = [['none', 'Нет'], ['net', 'Сеть'], ['hub', 'К одной точке'], ['center', 'К центру'], ['chain', 'Цепочка'], ['arcs', 'Дуги']];
  const HUD = [['corners', 'Уголки кадра'], ['frame', 'Тонкая рамка'], ['cam', 'Камера'], ['rec', 'REC'], ['time', 'Время'], ['ruler', 'Линейка'], ['status', 'Статусы'], ['scan', 'Линия скана'], ['digits', 'Столбики цифр'], ['noise', 'Зерно']];
  const VARS = ['{n}', '{nn}', '{%}', '{0.}', '{.4}', '{hex}', '{id}', '{x}', '{y}', '{t}', '{label}', '{date}', '{place}', '{mood}'];

  const presetById = (id) => PRESETS.find((p) => p.id === id) || null;

  /* Старые эффекты с рамками («Распознавание», «Объекты», «Координаты», «Метки») теперь наборы сканера.
     Черновик с таким эффектом открывается сканером с теми же рамками, цветом и словами. */
  const MOVED = {
    detect: (f) => (f.style === 'tab' ? 'surf' : 'detect'),
    objects: (f) => (f.style === 'rings' ? 'rings' : 'objects'),
    hud: (f) => (f.style === 'arcs' ? 'coordArcs' : 'coords'),
    tags: () => 'windows',
  };
  function fromEffect(f) {
    if (!f || !MOVED[f.id]) return null;
    const p = presetById(MOVED[f.id](f));
    const out = { ...defaults(), ...JSON.parse(JSON.stringify(p.set)), on: true, preset: p.id, seed: f.seed || 5, boxes: (f.boxes || []).map((b) => ({ ...b })) };
    if (f.color) out.color = f.color;
    if (f.text) out.text = f.id === 'detect' ? f.text.split(',').map((w) => w.trim()).filter(Boolean).map((w) => `${w} {%}`).join(', ') : f.text;
    return out;
  }

  /* ---------- холсты для работы ---------- */
  const pool = new Map();
  function buf(name, w, h) {
    let c = pool.get(name);
    if (!c) { c = document.createElement('canvas'); pool.set(name, c); }
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = c.getContext('2d', { willReadFrequently: true });
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.imageSmoothingEnabled = true;
    x.clearRect(0, 0, w, h);
    return { c, x };
  }

  const hexRgb = (hex) => {
    const h = String(hex || '#ffffff').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const isLight = (hex) => { const [r, g, b] = hexRgb(hex); return 0.299 * r + 0.587 * g + 0.114 * b > 150; };

  /* ---------- линза: обработка куска кадра по пикселям ---------- */
  const THERMAL = (() => {
    const stops = [[0, '#0b0030'], [0.22, '#3b0fa0'], [0.42, '#c2187a'], [0.62, '#ff4b1f'], [0.8, '#ffc21a'], [1, '#fffbe0']].map(([p, c]) => [p, hexRgb(c)]);
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      let k = 0;
      while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
      const [p0, a] = stops[k];
      const [p1, b] = stops[k + 1];
      const f = (v - p0) / (p1 - p0 || 1);
      for (let j = 0; j < 3; j++) lut[i * 3 + j] = a[j] + (b[j] - a[j]) * f;
    }
    return lut;
  })();

  function process(c, x, kind, col, seed) {
    if (!kind || kind === 'none' || kind === 'same') return;
    const w = c.width, h = c.height;
    if (kind === 'pixel') {
      const cell = Math.max(4, Math.round(Math.min(w, h) / 14));
      const s = buf('px', Math.ceil(w / cell), Math.ceil(h / cell));
      s.x.drawImage(c, 0, 0, s.c.width, s.c.height);
      x.imageSmoothingEnabled = false;
      x.clearRect(0, 0, w, h);
      x.drawImage(s.c, 0, 0, w, h);
      x.imageSmoothingEnabled = true;
      return;
    }
    const img = x.getImageData(0, 0, w, h);
    const d = img.data;
    const [cr, cg, cb] = hexRgb(col);
    let r = (seed * 2654435761) >>> 0 || 1;
    const noise = () => { r ^= r << 13; r >>>= 0; r ^= r >> 17; r ^= r << 5; r >>>= 0; return (r / 4294967296) - 0.5; };
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (kind === 'thermal') {
        const k = Math.max(0, Math.min(255, Math.round(l))) * 3;
        d[i] = THERMAL[k]; d[i + 1] = THERMAL[k + 1]; d[i + 2] = THERMAL[k + 2];
      } else if (kind === 'invert') {
        d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
      } else if (kind === 'bw') {
        const v = (l - 128) * 1.45 + 128 + noise() * 46;
        d[i] = d[i + 1] = d[i + 2] = v;
      } else if (kind === 'xray') {
        const v = 255 - l;
        d[i] = v * 0.7; d[i + 1] = v * 0.95; d[i + 2] = Math.min(255, v * 1.2 + 20);
      } else if (kind === 'tint') {
        d[i] = d[i] * 0.58 + cr * 0.42; d[i + 1] = d[i + 1] * 0.58 + cg * 0.42; d[i + 2] = d[i + 2] * 0.58 + cb * 0.42;
      } else if (kind === 'duo') {
        const f = Math.max(0, Math.min(1, (l - 40) / 170));
        d[i] = 14 + (cr - 14) * f; d[i + 1] = 14 + (cg - 14) * f; d[i + 2] = 18 + (cb - 18) * f;
      } else if (kind === 'glass') {
        d[i] = d[i] * 0.42 + 18; d[i + 1] = d[i + 1] * 0.45 + 24; d[i + 2] = d[i + 2] * 0.5 + 32;
      } else if (kind === 'noise') {
        const n = noise() * 40;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
      }
    }
    x.putImageData(img, 0, 0);
  }

  /* ---------- подписи по шаблону ---------- */
  const words = (text) => String(text || '').split(/[,\n]/).map((w) => w.trim());
  function rngFor(seed, i) {
    let a = ((seed * 7919 + i * 104729) * 2654435761) >>> 0 || 1;
    return () => { a ^= a << 13; a >>>= 0; a ^= a >> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; };
  }
  const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  function fill(tpl, b, i, W, H, seed, note, tick) {
    if (!tpl) return '';
    const r = rngFor(seed, i);
    const base = 0.21 + r() * 0.78;
    const score = tick != null ? 0.05 + rngFor(seed + tick * 13, i)() * 0.94 : b.score != null ? b.score : base;
    const digit = () => String(Math.floor(r() * 10));
    const letter = () => LETTERS[Math.floor(r() * LETTERS.length)];
    const date = String((note && note.date) || '').replace(/-/g, '.');
    const map = {
      '{n}': () => String(i + 1),
      '{nn}': () => String(i + 1).padStart(2, '0'),
      '{%}': () => `${Math.round(score * 100)}%`,
      '{0.}': () => score.toFixed(8),
      '{.4}': () => score.toFixed(4),
      '{hex}': () => digit() + digit() + letter() + letter() + digit() + digit(),
      '{id}': () => `P-${digit()}${digit()}${digit()}${digit()}-${digit()}${digit()}`,
      '{x}': () => String(Math.round((b.x + b.w / 2) * W)),
      '{y}': () => String(Math.round((b.y + b.h / 2) * H)),
      '{t}': () => (31 + r() * 7.5).toFixed(1),
      '{label}': () => (b.label || 'object').toLowerCase(),
      '{date}': () => date,
      '{place}': () => (note && note.place) || '',
      '{mood}': () => (note && note.mood) || '',
    };
    return tpl.replace(/\{(nn|n|%|0\.|\.4|hex|id|x|y|t|label|date|place|mood)\}/g, (m) => map[m]());
  }

  /* ---------- рамки ---------- */
  function shapePath(ctx, kind, x, y, w, h, u, lw, i = 0) {
    const k = Math.min(w, h);
    if (kind === 'oval') {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU);
      ctx.stroke();
      return;
    }
    if (kind === 'corners' || kind === 'cross') {
      const L = Math.max(8 * u, k * 0.22);
      ctx.beginPath();
      [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([px, py, sx, sy]) => {
        ctx.moveTo(px + sx * L, py);
        ctx.lineTo(px, py);
        ctx.lineTo(px, py + sy * L);
      });
      if (kind === 'cross') {
        /* прицел: тонкая рамка и засечки внутрь посередине сторон */
        const t = Math.max(6 * u, k * 0.1);
        ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + t);
        ctx.moveTo(x + w / 2, y + h); ctx.lineTo(x + w / 2, y + h - t);
        ctx.moveTo(x, y + h / 2); ctx.lineTo(x + t, y + h / 2);
        ctx.moveTo(x + w, y + h / 2); ctx.lineTo(x + w - t, y + h / 2);
      }
      ctx.stroke();
      if (kind === 'cross') {
        ctx.save();
        ctx.lineWidth = lw * 0.5;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      }
      return;
    }
    if (kind === 'dashed') {
      ctx.save();
      ctx.setLineDash([6 * u, 5 * u]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
      return;
    }
    ctx.strokeRect(x, y, w, h);
    if (kind === 'xbox' && i % 2 === 0) {
      /* крест по диагоналям у каждой второй рамки */
      ctx.save();
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
      ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
      ctx.stroke();
      ctx.restore();
    }
    if (kind === 'target') {
      const d = Math.max(5 * u, lw * 2.2);
      ctx.fillRect(x + w / 2 - d / 2, y + h / 2 - d / 2, d, d);
    }
    if (kind === 'double') {
      const o = Math.max(5 * u, k * 0.06);
      ctx.save();
      ctx.globalAlpha *= 0.7;
      ctx.strokeRect(x + o, y + o * 0.6, w - o * 0.3, h - o * 0.2);
      ctx.restore();
    }
    if (kind === 'eyes') {
      /* два кружка-глаза в верхней части рамки */
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, lw * 1.4);
      ctx.beginPath();
      [0.34, 0.66].forEach((fx) => { ctx.moveTo(x + w * fx + k * 0.07, y + h * 0.4); ctx.arc(x + w * fx, y + h * 0.4, k * 0.07, 0, TAU); });
      ctx.stroke();
      ctx.restore();
    }
    if (kind === 'nodes') {
      /* маленькие квадраты на углах и на середине одной стороны, как на ботаническом плакате */
      const s = Math.max(10 * u, k * 0.12);
      ctx.save();
      ctx.lineWidth = lw * 0.8;
      [[x, y], [x + w, y + h], [x + w, y + h * 0.5]].forEach(([px, py]) => ctx.strokeRect(px - s / 2, py - s / 2, s, s));
      ctx.restore();
    }
  }

  function textBox(ctx, text, x, y, size, bg, fg, pad, fontCss, weight) {
    ctx.font = `${weight} ${size}px ${fontCss}`;
    const w = ctx.measureText(text).width + pad * 2;
    const h = size * 1.4;
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(x, y, w, h); }
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + pad, y + h / 2 + size * 0.05);
    return { w, h };
  }

  function drawLabel(ctx, sc, text, x, y, w, h, W, H, u, col, f, i = 0) {
    if (sc.label === 'none') return;
    const ink = isLight(col) ? '#0d0d0d' : '#ffffff';
    if (sc.label === 'meters') {
      /* первая строка шаблона над рамкой, остальные под ней: слово и шкала; «слово: значение» без шкалы,
         значение красным. Одна шкала у рамки заполнена. */
      const items = String(sc.text || 'Face.Front, Angry, Happy, Sad, Surprised').split(',').map((v) => v.trim()).filter(Boolean);
      if (!items.length) return;
      const size = Math.max(12 * u, Math.min(30 * u, w * 0.13));
      const r = rngFor(sc.seed || 5, i * 17 + 3);
      ctx.font = `${f.weight === 600 ? 400 : f.weight} ${size}px ${f.css}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(items[0], x, Math.max(size, y - size * 0.3));
      const rows = items.slice(1);
      const keyW = Math.max(...rows.map((v) => ctx.measureText(v.split(':')[0]).width), 0) + size * 0.5;
      const barW = Math.max(size * 3, w * 0.75);
      const hot = Math.floor(r() * Math.max(1, rows.filter((v) => !v.includes(':')).length));
      let n = 0;
      rows.forEach((row, k) => {
        const ty = y + h + size * (1.25 + k * 1.25);
        const [key, val] = row.split(':').map((v) => v.trim());
        ctx.fillStyle = '#ffffff';
        ctx.fillText(key, x, ty);
        if (val != null) {
          ctx.fillStyle = '#ff2b2b';
          ctx.fillText(val, x + keyW, ty);
          return;
        }
        const bx = x + keyW, bh = size * 0.62, by = ty - bh * 1.05;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.5, size * 0.09);
        ctx.strokeRect(bx, by, barW, bh);
        if (n++ === hot) {
          ctx.fillStyle = '#ff2b2b';
          ctx.fillRect(bx + ctx.lineWidth, by + ctx.lineWidth, (barW - ctx.lineWidth * 2) * (0.2 + r() * 0.75), bh - ctx.lineWidth * 2);
        }
      });
      return;
    }
    if (sc.label === 'plate') {
      if (!text) return;
      const size = 19 * u;
      ctx.font = `${f.weight} ${size}px ${f.css}`;
      const tw = ctx.measureText(text).width + 12 * u;
      const ph = size * 1.4;
      const py = y - ph >= 0 ? y - ph : y;
      const px = Math.min(Math.max(0, x - ctx.lineWidth / 2), W - tw);
      textBox(ctx, text, px, py, size, col, ink, 6 * u, f.css, f.weight);
      return;
    }
    if (sc.label === 'flag') {
      const size = 18 * u;
      ctx.font = `${f.weight} ${size}px ${f.css}`;
      const th = text ? size * 1.4 : Math.max(9 * u, Math.min(18 * u, h * 0.12));
      const tw = text ? ctx.measureText(text).width + 14 * u : Math.max(28 * u, w * 0.38);
      const px = Math.max(0, x + w - tw + ctx.lineWidth / 2);
      const py = y - th >= 0 ? y - th : y;
      ctx.fillStyle = col;
      ctx.fillRect(px, py, tw, th);
      if (text) {
        ctx.fillStyle = ink;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, px + 7 * u, py + th / 2 + size * 0.05);
      }
      return;
    }
    if (!text) return;
    if (sc.label === 'center') {
      const size = Math.max(10 * u, Math.min(17 * u, h * 0.16));
      ctx.font = `${f.weight === 600 ? 500 : f.weight} ${size}px ${f.css}`;
      ctx.fillStyle = col;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + (w - ctx.measureText(text).width) / 2, y + h / 2);
      return;
    }
    if (sc.label === 'below') {
      const size = 34 * u;
      ctx.font = `${f.weight === 600 ? 300 : f.weight} ${size}px ${f.css === MONO ? SANS : f.css}`;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = col;
      ctx.textBaseline = 'top';
      ctx.fillText(text, Math.max(6 * u, Math.min(W - tw - 6 * u, x + w - tw)), Math.min(H - size * 1.2, y + h + 6 * u));
      return;
    }
    /* мелко сверху, без подложки */
    const size = 14 * u;
    ctx.font = `${f.weight === 600 ? 400 : f.weight} ${size}px ${f.css}`;
    ctx.fillStyle = col;
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, Math.max(2 * u, Math.min(W - ctx.measureText(text).width - 2 * u, x)), y > size * 1.3 ? y - 4 * u : y + h + size + 4 * u);
  }

  /* ---------- лупа: где поставить увеличенный кусок ---------- */
  function placeInsets(boxes, picks, W, H, u, rng) {
    const out = [];
    const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const px = boxes.map((b) => ({ x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H }));
    picks.forEach((i) => {
      const b = px[i];
      const ar = b.w / Math.max(1, b.h);
      let iw = Math.min(W * 0.32, Math.max(W * 0.18, Math.max(b.w, b.h * ar) * 1.6));
      let ih = iw / ar;
      if (ih > H * 0.3) { ih = H * 0.3; iw = ih * ar; }
      const src = boxes[i];
      let best = null;
      if (src.zx != null && src.zy != null) {
        best = { x: src.zx * W, y: src.zy * H };
      } else {
        const m = 0.03 * W;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        for (let gy = 0; gy <= 8; gy++) {
          for (let gx = 0; gx <= 6; gx++) {
            const x = m + ((W - 2 * m - iw) * gx) / 6;
            const y = m + ((H - 2 * m - ih) * gy) / 8;
            const c = { x, y, w: iw, h: ih };
            let score = 0;
            px.forEach((o, j) => { score += area(c, o) * (j === i ? 40 : 6); });
            out.forEach((o) => { score += area(c, o) * 30; });
            const d = Math.hypot(x + iw / 2 - cx, y + ih / 2 - cy);
            score += Math.abs(d - W * 0.32) * iw * 0.6 + rng() * iw * ih * 0.05;
            if (!best || score < best.score) best = { x, y, score };
          }
        }
      }
      out.push({ i, x: best.x, y: best.y, w: iw, h: ih });
    });
    return out;
  }

  function insetLine(ctx, kind, b, s) {
    const bc = [b.x + b.w / 2, b.y + b.h / 2];
    const sc = [s.x + s.w / 2, s.y + s.h / 2];
    const dx = sc[0] - bc[0], dy = sc[1] - bc[1];
    const horiz = Math.abs(dx) / (b.w + s.w) > Math.abs(dy) / (b.h + s.h);
    ctx.beginPath();
    if (kind === 'funnel') {
      if (horiz) {
        const bx = dx > 0 ? b.x + b.w : b.x, sx = dx > 0 ? s.x : s.x + s.w;
        ctx.moveTo(bx, b.y); ctx.lineTo(sx, s.y);
        ctx.moveTo(bx, b.y + b.h); ctx.lineTo(sx, s.y + s.h);
      } else {
        const by = dy > 0 ? b.y + b.h : b.y, sy = dy > 0 ? s.y : s.y + s.h;
        ctx.moveTo(b.x, by); ctx.lineTo(s.x, sy);
        ctx.moveTo(b.x + b.w, by); ctx.lineTo(s.x + s.w, sy);
      }
    } else if (kind === 'elbow') {
      if (horiz) {
        const bx = dx > 0 ? b.x + b.w : b.x;
        const sy = dy > 0 ? s.y : s.y + s.h;
        ctx.moveTo(bx, bc[1]);
        ctx.lineTo(sc[0], bc[1]);
        if (bc[1] < s.y || bc[1] > s.y + s.h) ctx.lineTo(sc[0], sy);
      } else {
        const by = dy > 0 ? b.y + b.h : b.y;
        const sx = dx > 0 ? s.x : s.x + s.w;
        ctx.moveTo(bc[0], by);
        ctx.lineTo(bc[0], sc[1]);
        if (bc[0] < s.x || bc[0] > s.x + s.w) ctx.lineTo(sx, sc[1]);
      }
    } else {
      const corner = (r, p) => [Math.max(r.x, Math.min(r.x + r.w, p[0])), Math.max(r.y, Math.min(r.y + r.h, p[1]))];
      const a = corner(b, sc);
      const z = corner(s, bc);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(z[0], z[1]);
    }
    ctx.stroke();
  }

  /* ---------- связи между рамками ---------- */
  function links(ctx, kind, px, W, H, u, rng, lw) {
    if (kind === 'none' || (px.length < 2 && kind !== 'hub' && kind !== 'center')) return;
    const c = px.map((b) => [b.x + b.w / 2, b.y + b.h / 2]);
    ctx.save();
    ctx.lineWidth = lw * 0.7;
    if (kind === 'net') {
      ctx.setLineDash([7 * u, 6 * u]);
      ctx.beginPath();
      c.forEach((p, i) => {
        const near = c.map((q, j) => [j, Math.hypot(q[0] - p[0], q[1] - p[1])]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
        near.slice(0, 2).forEach(([j]) => { if (j > i || rng() < 0.4) { ctx.moveTo(p[0], p[1]); ctx.lineTo(c[j][0], c[j][1]); } });
      });
      ctx.stroke();
    } else if (kind === 'hub') {
      /* все линии уходят в одну далёкую точку у края кадра */
      const hx = W * (0.7 + rng() * 0.25), hy = H * (0.05 + rng() * 0.12);
      ctx.beginPath();
      c.forEach((p, i) => {
        const b = px[i];
        const s = Math.min(b.w, b.h) * 0.2;
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(hx, hy);
        ctx.rect(p[0] - s / 2, p[1] - s / 2, s, s);
      });
      ctx.stroke();
    } else if (kind === 'center') {
      const cx = W / 2, cy = H * 0.42, hub = 46 * u;
      ctx.beginPath();
      c.forEach((p) => { ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); });
      ctx.stroke();
      ctx.lineWidth = lw;
      ctx.strokeRect(cx - hub / 2, cy - hub * 0.35, hub, hub * 0.7);
    } else if (kind === 'chain') {
      const order = c.slice().sort((a, b) => a[1] - b[1]);
      ctx.beginPath();
      order.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      order.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 4 * u, 0, TAU); ctx.fill(); });
    } else if (kind === 'arcs') {
      ctx.setLineDash([6 * u, 5 * u]);
      c.forEach((a, i) => {
        const b = c[(i + 1 + Math.floor(rng() * (c.length - 1))) % c.length];
        if (b === a) return;
        const mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - H * (0.05 + rng() * 0.15);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.quadraticCurveTo(mx, my, b[0], b[1]);
        ctx.stroke();
        const tx = 0.25 * a[0] + 0.5 * mx + 0.25 * b[0], ty = 0.25 * a[1] + 0.5 * my + 0.25 * b[1];
        ctx.save();
        ctx.setLineDash([]);
        ctx.translate(tx, ty);
        ctx.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]));
        ctx.beginPath();
        ctx.moveTo(-6 * u, -5 * u); ctx.lineTo(2 * u, 0); ctx.lineTo(-6 * u, 5 * u);
        ctx.stroke();
        ctx.restore();
      });
    }
    ctx.restore();
  }

  /* ---------- интерфейс камеры по краям ---------- */
  function hud(ctx, sc, W, H, u, col, rng, note, T) {
    const on = (k) => sc.hud.includes(k);
    const ink = '#ffffff';
    const m = Math.min(W, H) * 0.04;
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 2 * u;
    if (on('scan')) {
      const y0 = H * (0.2 + rng() * 0.6);
      const y = T == null ? y0 : ((T * 0.32) % 1.15) * H;
      const g = ctx.createLinearGradient(0, y - 60 * u, 0, y + 4 * u);
      const [r, gg, b] = hexRgb(col);
      g.addColorStop(0, `rgba(${r},${gg},${b},0)`);
      g.addColorStop(1, `rgba(${r},${gg},${b},.35)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 60 * u, W, 64 * u);
      ctx.fillStyle = col;
      ctx.fillRect(0, y, W, 2 * u);
      ctx.fillStyle = ink;
    }
    if (on('digits')) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.font = `400 ${12 * u}px ${MONO}`;
      ctx.textBaseline = 'top';
      const strips = 3 + Math.floor(rng() * 3);
      for (let s = 0; s < strips; s++) {
        const sx = (0.08 + rng() * 0.84) * W;
        const sy = rng() * H * 0.5;
        const len = 10 + Math.floor(rng() * 30);
        for (let k = 0; k < len; k++) {
          if (rng() < 0.25) continue;
          const v = rng() < 0.5 ? '0' : rng() < 0.5 ? '00' : rng() < 0.5 ? '0 0' : '1';
          ctx.fillText(v, sx + (rng() < 0.2 ? 12 * u : 0), sy + k * 16 * u);
        }
      }
      ctx.restore();
    }
    if (on('frame')) {
      ctx.lineWidth = 1.2 * u;
      ctx.strokeRect(m * 0.7, m * 0.7, W - m * 1.4, H - m * 1.4);
      ctx.lineWidth = 2 * u;
    }
    if (on('corners')) {
      const L = Math.min(W, H) * 0.07;
      ctx.beginPath();
      [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => {
        ctx.moveTo(x + sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * L);
      });
      ctx.stroke();
    }
    const top = m + 6 * u;
    if (on('cam') && sc.cam) {
      ctx.font = `500 ${30 * u}px ${MONO}`;
      ctx.textBaseline = 'top';
      ctx.fillText(sc.cam, m + 14 * u, top + 8 * u);
    }
    let right = top + 8 * u;
    if (on('rec')) {
      ctx.font = `500 ${22 * u}px ${MONO}`;
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText('REC').width;
      ctx.fillText('REC', W - m - 14 * u - tw, right + 12 * u);
      ctx.fillStyle = T != null && Math.floor(T * 2) % 2 ? 'rgba(255,42,42,0)' : '#ff2a2a';
      ctx.beginPath();
      ctx.arc(W - m - 14 * u - tw - 16 * u, right + 12 * u, 8 * u, 0, TAU);
      ctx.fill();
      ctx.fillStyle = ink;
      right += 38 * u;
    }
    if (on('time')) {
      const pad = (n) => String(n).padStart(2, '0');
      const hh = Math.floor(rng() * 24), mm = Math.floor(rng() * 60), ss = Math.floor(rng() * 50) + Math.floor(T || 0);
      const clock = `${pad(hh)}:${pad(mm)}:${pad(ss % 60)}`;
      const date = String((note && note.date) || '').replace(/-/g, '.');
      ctx.font = `500 ${24 * u}px ${MONO}`;
      ctx.textBaseline = 'top';
      [clock, date].filter(Boolean).forEach((line) => {
        ctx.fillText(line, W - m - 14 * u - ctx.measureText(line).width, right);
        right += 32 * u;
      });
    }
    if (on('ruler')) {
      const y = H - m - (on('status') ? 44 * u : 6 * u);
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      ctx.moveTo(m, y); ctx.lineTo(W - m, y);
      for (let i = 0; i <= 8; i++) {
        const x = m + ((W - 2 * m) * i) / 8;
        ctx.moveTo(x, y); ctx.lineTo(x, y - (i % 2 ? 8 : 14) * u);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W / 2, y, 7 * u, 0, TAU);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = ink;
    }
    if (on('status') && sc.status) {
      const items = words(sc.status).filter(Boolean);
      const size = 17 * u;
      ctx.font = `400 ${size}px ${MONO}`;
      ctx.textBaseline = 'bottom';
      const y = H - m * 0.6;
      const widths = items.map((s) => ctx.measureText(s).width);
      const total = widths.reduce((a, b) => a + b, 0);
      const gap = items.length > 1 ? Math.max(12 * u, (W - 2 * m - total) / (items.length - 1)) : 0;
      let x = items.length > 1 ? m : (W - total) / 2;
      items.forEach((s, i) => {
        /* последнее слово ON / OFF / active подсвечиваем цветом сканера */
        const mm = s.match(/^(.*\s)(\S+)$/);
        if (mm && /^(on|off|active|ok|\d+%)$/i.test(mm[2])) {
          ctx.fillStyle = ink;
          ctx.fillText(mm[1], x, y);
          ctx.fillStyle = col;
          ctx.fillText(mm[2], x + ctx.measureText(mm[1]).width, y);
        } else {
          ctx.fillStyle = ink;
          ctx.fillText(s, x, y);
        }
        x += widths[i] + gap;
      });
    }
    ctx.restore();
  }

  /* ---------- досье: панель с полями ---------- */
  /* Строка вида «Until the weekend [62%]» становится полосой прогресса с подписью. */
  const BAR = /^(.*?)\s*\[(\d{1,3})%\]\s*$/;
  function dossierLayout(d, W, H, u, f, note, seed) {
    const size = 15 * u;
    const rows = String(d.rows || '').split('\n').map((s) => s.trim()).filter(Boolean)
      .map((s, k) => {
        const m = s.match(BAR);
        const text = fill(m ? m[1] : s, { x: 0, y: 0, w: 0, h: 0 }, k, W, H, seed + k, note);
        return m ? { text, bar: Math.min(100, Number(m[2])) / 100 } : { text };
      });
    const title = fill(d.title || '', { x: 0, y: 0, w: 0, h: 0 }, 0, W, H, seed + 40, note);
    return { size, rows, title };
  }

  function drawDossier(ctx, d, L, x0, y0, u, col, f, T, t0) {
    const { size, rows, title } = L;
    const ink = isLight(col) ? '#0d0d0d' : '#ffffff';
    const pad = 9 * u;
    ctx.font = `${f.weight} ${size}px ${f.css}`;
    const tag = d.style === 'terminal' ? ctx.measureText('  [SCANNING]').width : 0;
    const tw = Math.max(title ? ctx.measureText(title).width + tag : 0, ...rows.map((r) => ctx.measureText(r.text).width + (r.bar != null ? 120 * u : 0)), 200 * u);
    const w = tw + pad * 2;
    /* при анимации строки печатаются по очереди, полосы заполняются */
    let budget = T == null ? Infinity : Math.max(0, (T - t0) * 45);
    const typed = (s) => {
      if (budget === Infinity) return s;
      const out = s.slice(0, Math.max(0, Math.floor(budget)));
      budget = Math.max(0, budget - s.length - 4);
      return out;
    };
    const fillOf = (r, k) => (T == null ? r.bar : r.bar * Math.min(1, Math.max(0, (T - t0 - 0.4 - k * 0.3) / 0.9)));
    const line = size * 1.75;
    let y = y0;
    ctx.textBaseline = 'middle';

    if (d.style === 'card') {
      const h = (title ? line * 1.2 : 0) + rows.length * line + pad * 2;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x0, y0, w, h);
      ctx.globalAlpha = 1;
      y += pad;
      if (title) {
        ctx.fillStyle = ink;
        ctx.font = `700 ${size * 1.05}px ${f.css}`;
        ctx.fillText(typed(title), x0 + pad, y + line * 0.55);
        ctx.fillRect(x0 + pad, y + line * 1.1, w - pad * 2, 1.2 * u);
        y += line * 1.2;
        ctx.font = `${f.weight} ${size}px ${f.css}`;
      }
      rows.forEach((r, k) => {
        const cy = y + line / 2;
        ctx.fillStyle = ink;
        const s = typed(r.text);
        ctx.fillText(s, x0 + pad, cy);
        if (r.bar != null) {
          const bx = x0 + pad + ctx.measureText(r.text).width + 10 * u;
          const bw = x0 + w - pad - bx - 42 * u;
          ctx.fillStyle = '#111';
          ctx.fillRect(bx, cy - 6 * u, bw, 12 * u);
          ctx.fillStyle = '#fff';
          ctx.fillRect(bx, cy - 6 * u, bw * fillOf(r, k), 12 * u);
          ctx.fillStyle = ink;
          ctx.fillText(`${Math.round(fillOf(r, k) * 100)}%`, bx + bw + 6 * u, cy);
        }
        y += line;
      });
      return { x: x0, y: y0, w, h };
    }

    if (d.style === 'terminal') {
      const h = (title ? line : 0) + rows.length * line + 2 * u;
      ctx.fillStyle = 'rgba(8,8,8,.84)';
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(x0, y0, w, h);
      if (title) {
        ctx.fillStyle = '#fff';
        ctx.fillText(typed(title), x0 + pad, y + line / 2);
        ctx.fillStyle = col;
        const tag = '[SCANNING]';
        ctx.fillText(tag, x0 + w - pad - ctx.measureText(tag).width, y + line / 2);
        y += line;
      }
      rows.forEach((r, k) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1 * u;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + w, y);
        ctx.stroke();
        const cy = y + line / 2;
        if (r.bar != null) {
          /* полоса-пилюля с подписью внутри */
          const bh = line * 0.62;
          const bw = w - pad * 2;
          ctx.beginPath();
          ctx.roundRect(x0 + pad, cy - bh / 2, bw, bh, bh / 2);
          ctx.stroke();
          ctx.save();
          ctx.clip();
          ctx.fillStyle = col;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(x0 + pad, cy - bh / 2, bw * fillOf(r, k), bh);
          ctx.restore();
          ctx.fillStyle = '#fff';
          const s = typed(r.text || 'processing…');
          ctx.fillText(s, x0 + pad + (bw - ctx.measureText(s).width) / 2, cy);
        } else {
          ctx.fillStyle = '#fff';
          ctx.fillText(typed(r.text), x0 + pad, cy);
        }
        y += line;
      });
      return { x: x0, y: y0, w, h };
    }

    /* плашки: заголовок и каждая строка отдельной залитой полосой */
    const gap = 6 * u;
    const all = [...(title ? [{ text: title, head: true }] : []), ...rows];
    all.forEach((r, k) => {
      const ph = line * (r.head ? 1.05 : 0.95);
      ctx.fillStyle = col;
      if (r.bar != null) {
        ctx.fillRect(x0, y, w, ph);
        ctx.fillStyle = ink;
        ctx.fillText(typed(r.text), x0 + pad, y + ph / 2);
        const bx = x0 + pad + ctx.measureText(r.text).width + 10 * u;
        const bw = x0 + w - pad - bx;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(bx, y + ph * 0.3, bw, ph * 0.4);
        ctx.globalAlpha = 1;
        ctx.fillRect(bx, y + ph * 0.3, bw * fillOf(r, k), ph * 0.4);
      } else {
        ctx.fillRect(x0, y, w, ph);
        ctx.fillStyle = ink;
        if (r.head) ctx.font = `700 ${size}px ${f.css}`;
        ctx.fillText(typed(r.text), x0 + pad, y + ph / 2 + size * 0.05);
        ctx.font = `${f.weight} ${size}px ${f.css}`;
      }
      y += ph + gap;
    });
    return { x: x0, y: y0, w, h: y - y0 - gap };
  }

  /* ---------- значки ---------- */
  const SPRITES = {
    cursor: ['X...........', 'XX..........', 'XWX.........', 'XWWX........', 'XWWWX.......', 'XWWWWX......', 'XWWWWWX.....', 'XWWWWWWX....', 'XWWWWWWWX...', 'XWWWWWWWWX..', 'XWWWWWWWWWX.', 'XWWWWWWXXXXX', 'XWWWXWWX....', 'XWWX.XWWX...', 'XWX..XWWX...', 'XX....XWWX..', 'X.....XWWX..', '.......XX...'],
    folder: ['.XXXXX..........', 'XYYYYYX.........', 'XYYYYYYXXXXXXXX.', 'XYYYYYYYYYYYYYYX', 'XYYYYYYYYYYYYYYX', 'XYYYYYYYYYYYYYYX', 'XYYYYYYYYYYYYYYX', 'XYYYYYYYYYYYYYYX', 'XyyyyyyyyyyyyyyX', 'XyyyyyyyyyyyyyyX', '.XXXXXXXXXXXXXX.'],
    file: ['XXXXXXX....', 'XWWWWWXX...', 'XWWWWWXWX..', 'XWWWWWXXXX.', 'XWWWWWWWWX.', 'XWGGGGGWWX.', 'XWWWWWWWWX.', 'XWGGGGGGWX.', 'XWWWWWWWWX.', 'XWGGGGGWWX.', 'XWWWWWWWWX.', 'XWWWWWWWWX.', 'XXXXXXXXXX.'],
  };
  const PIX = { X: '#141414', W: '#ffffff', Y: '#f7d64a', y: '#d9ad22', G: '#9a9a9a' };
  const ICONS = [['cursor', 'Курсор'], ['folder', 'Папка'], ['file', 'Файл'], ['warning', 'Внимание'], ['question', 'Вопрос'], ['disc', 'Диск'], ['error', 'Ошибка'], ['up', 'Вверх'], ['right', 'Вправо'], ['down', 'Вниз'], ['left', 'Влево']];

  function drawIcon(ctx, k, cx, cy, size, col) {
    ctx.save();
    const rows = SPRITES[k];
    if (rows) {
      const cell = size / rows.length;
      const w = rows[0].length * cell;
      const x0 = k === 'cursor' ? cx : cx - w / 2;
      const y0 = k === 'cursor' ? cy : cy - size / 2;
      ctx.shadowBlur = 0;
      rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
        if (!PIX[ch]) return;
        ctx.fillStyle = PIX[ch];
        ctx.fillRect(Math.round(x0 + rx * cell), Math.round(y0 + ry * cell), Math.ceil(cell), Math.ceil(cell));
      }));
      ctx.restore();
      return;
    }
    const s = size;
    ctx.lineJoin = 'round';
    if (k === 'warning' || k === 'question') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.48);
      ctx.lineTo(cx + s * 0.55, cy + s * 0.45);
      ctx.lineTo(cx - s * 0.55, cy + s * 0.45);
      ctx.closePath();
      if (k === 'warning') {
        ctx.fillStyle = '#ffd21f';
        ctx.fill();
        ctx.lineWidth = s * 0.06;
        ctx.strokeStyle = '#141414';
        ctx.stroke();
        ctx.fillStyle = '#141414';
      } else {
        ctx.lineWidth = s * 0.07;
        ctx.strokeStyle = col;
        ctx.stroke();
        ctx.fillStyle = col;
      }
      ctx.font = `900 ${s * 0.55}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(k === 'warning' ? '!' : '?', cx, cy + s * 0.14);
    } else if (k === 'disc') {
      const g = ctx.createConicGradient ? ctx.createConicGradient(0, cx, cy) : null;
      if (g) ['#d9d9e8', '#b6f0ff', '#f0c6ff', '#fff6b0', '#d9d9e8'].forEach((c, i) => g.addColorStop(i / 4, c));
      ctx.fillStyle = g || '#d9d9e8';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.48, 0, TAU);
      ctx.arc(cx, cy, s * 0.1, 0, TAU, true);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.45)';
      ctx.lineWidth = s * 0.03;
      ctx.stroke();
    } else if (k === 'error') {
      const w = s * 0.9, h = s * 1.05;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      ctx.globalAlpha = 1;
      const ink = isLight(col) ? '#141414' : '#ffffff';
      ctx.fillStyle = ink;
      ctx.fillRect(cx - w / 2, cy - h / 2 + h * 0.26, w, s * 0.02);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${s * 0.17}px ${MONO}`;
      ctx.fillText('ERROR', cx, cy - h / 2 + h * 0.13);
      ctx.font = `500 ${s * 0.36}px ${MONO}`;
      ctx.fillText(': (', cx, cy + h * 0.14);
    } else {
      /* стрелка: толстый стержень и наконечник, повёрнута по направлению */
      const rot = { up: -Math.PI / 2, right: 0, down: Math.PI / 2, left: Math.PI }[k] || 0;
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, 0);
      ctx.lineTo(s * 0.05, -s * 0.36);
      ctx.lineTo(s * 0.05, -s * 0.13);
      ctx.lineTo(-s * 0.5, -s * 0.13);
      ctx.lineTo(-s * 0.5, s * 0.13);
      ctx.lineTo(s * 0.05, s * 0.13);
      ctx.lineTo(s * 0.05, s * 0.36);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  /* рамка значка в долях фото: для выбора и перетаскивания */
  function iconBox(k, cx, cy, size) {
    const rows = SPRITES[k];
    if (rows) {
      const w = (rows[0].length / rows.length) * size;
      return k === 'cursor' ? { x: cx, y: cy, w, h: size } : { x: cx - w / 2, y: cy - size / 2, w, h: size };
    }
    return { x: cx - size * 0.55, y: cy - size * 0.55, w: size * 1.1, h: size * 1.1 };
  }

  /* ---------- готовые слова: детектор чувств и другие ---------- */
  const PACKS = [
    ['feel', 'Чувства', 'longing {0.}, nostalgia {%}, tenderness {%}, quiet joy {0.}, déjà vu {%}, butterflies {%}'],
    ['moments', 'Моменты', 'first coffee 100% MATCH, golden hour {%}, inside joke {0.}, home {%} MATCH, sunday morning {%}'],
    ['love', 'Любовь', 'my person 100% MATCH, miss you {%}, safe place {0.}, heartbeat ↑ {%}'],
    ['status', 'Статусы', 'online, AFK, searching…, where am i, a way out ???, low battery'],
    ['absurd', 'Абсурд', 'cloud: suspicious {%}, pigeon.exe, very good dog {%}, main character {0.}, NPC {%}'],
    ['tech', 'Техника', 'person {%}, object {0.}, unknown {%}, face.{n}'],
  ];
  const MOOD_PACKS = {
    warm: 'warmth {%}, soft light {0.}, hug detected, cosy {%}',
    calm: 'calm {0.}, slow breath {%}, nothing urgent, still water {%}',
    funny: 'laughter {%}, chaos {0.}, inside joke detected, snort.wav',
    'miss you': 'missing: you, distance {x} km, signal lost, searching… {%}',
    yay: 'joy {%} MATCH, yay!!!, serotonin {0.}, best day {%}',
    sleepy: 'sleepy {%}, battery 3%, nap.exe, dreaming {0.}',
  };
  const moodPack = (mood) => MOOD_PACKS[String(mood || '').toLowerCase()] || (mood ? `${mood} {%} MATCH, ${mood} detected, ${mood}.exe` : MOOD_PACKS.warm);

  /* ---------- рамки в видео: стоят, следят, вспыхивают, рой ---------- */
  const MOTIONS = [['still', 'Стоят'], ['track', 'Следят'], ['flash', 'Вспыхивают'], ['swarm', 'Рой']];

  /* места с деталями: центры клеток, где больше всего краёв, от сильных к слабым. Доли кадра. */
  function spots(A) {
    const cols = 16;
    const rows = Math.max(8, Math.round((cols * A.gh) / A.gw));
    const cw = A.gw / cols, ch = A.gh / rows;
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let e = 0;
        const y0 = Math.floor(r * ch), y1 = Math.floor((r + 1) * ch), x0 = Math.floor(c * cw), x1 = Math.floor((c + 1) * cw);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) e += A.edge[y * A.gw + x];
        out.push({ x: (c + 0.5) / cols, y: (r + 0.5) / rows, e: e / ((y1 - y0) * (x1 - x0) || 1) });
      }
    }
    return out.sort((a, b) => b.e - a.e);
  }

  /* Вспыхивают: у каждой рамки своя короткая жизнь, потом она гаснет и встаёт в другое место с деталями.
     Свои рамки при этом остаются на местах, но мигают. */
  function flashBoxes(A, sc, W, H, clock, own) {
    const seed = sc.seed || 1;
    const c = clock || 0;
    const n = own ? own.length : Math.max(1, Math.round(5 * (sc.amount || 1)));
    const S = own ? null : spots(A);
    const top = S ? S.slice(0, Math.max(n * 3, Math.floor(S.length * 0.35))) : null;
    const side = 0.13 * Math.min(W, H);
    const out = [];
    for (let k = 0; k < n; k++) {
      const rk = rngFor(seed, 7000 + k);
      const life = 0.35 + rk() * 0.6;
      const e = Math.floor((c + rk() * life) / life);
      const re = rngFor(seed + e * 31, k);
      if (re() < (own ? 0.3 : 0.25)) continue;
      if (own) { out.push({ ...own[k], epoch: e, slot: k }); continue; }
      const sp = top[Math.floor(re() * top.length)];
      const s = side * (0.8 + re() * 0.45);
      const w = s / W, h = s / H;
      out.push({ x: Math.max(0, Math.min(1 - w, sp.x - w / 2 + (re() - 0.5) * 0.03)), y: Math.max(0, Math.min(1 - h, sp.y - h / 2 + (re() - 0.5) * 0.03)), w, h, epoch: e, slot: k });
    }
    return out;
  }

  /* Рой: много тонких рамок разного размера, перестраиваются несколько раз в секунду. */
  function swarmBoxes(A, sc, W, H, clock) {
    const seed = sc.seed || 1;
    const n = Math.max(4, Math.round(26 * (sc.amount || 1)));
    const bucket = Math.floor((clock || 0) * 8);
    const re = rngFor(seed + bucket * 17, 3);
    const S = spots(A);
    const top = S.slice(0, Math.max(n, Math.floor(S.length * 0.5)));
    const out = [];
    for (let k = 0; k < n; k++) {
      const sp = top[Math.floor(re() * top.length)];
      const big = re();
      const w = 0.025 + big * big * big * 0.32;
      const h = (w * (0.55 + re() * 0.9) * W) / H;
      out.push({
        x: Math.max(0, Math.min(1 - w, sp.x - w / 2 + (re() - 0.5) * 0.06)),
        y: Math.max(0, Math.min(1 - h, sp.y - h / 2 + (re() - 0.5) * 0.06)),
        w, h, epoch: bucket, slot: k,
      });
    }
    return out;
  }

  /* Следят: рамка запоминает, что у неё внутри, и на каждом кадре ищет этот кусок рядом.
     Сравниваем яркость на сетке 10 × 10 точек, без среднего, чтобы свет и тень меньше мешали. */
  const trackers = new WeakMap();
  const G = 10;
  function patch(A, cx, cy, tw, th) {
    const p = new Float32Array(G * G);
    let m = 0;
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        const x = Math.max(0, Math.min(A.gw - 1, Math.round(cx - tw / 2 + ((gx + 0.5) * tw) / G)));
        const y = Math.max(0, Math.min(A.gh - 1, Math.round(cy - th / 2 + ((gy + 0.5) * th) / G)));
        const v = A.lum[y * A.gw + x];
        p[gy * G + gx] = v;
        m += v;
      }
    }
    m /= G * G;
    for (let i = 0; i < p.length; i++) p[i] -= m;
    return p;
  }
  function track(canvasKey, A, boxes, clock) {
    const key = JSON.stringify(boxes.map((b) => [b.x, b.y, b.w, b.h])) + `|${A.gw}x${A.gh}`;
    let t = trackers.get(canvasKey);
    /* начинаем заново: рамки поменялись, ролик пошёл сначала или времени нет */
    if (!t || t.key !== key || clock == null || clock < t.last - 0.05) {
      t = {
        key,
        last: clock == null ? -1 : clock,
        items: boxes.map((b) => {
          const cx = (b.x + b.w / 2) * A.gw, cy = (b.y + b.h / 2) * A.gh;
          const tw = Math.max(3, b.w * A.gw), th = Math.max(3, b.h * A.gh);
          return { cx, cy, tw, th, tpl: patch(A, cx, cy, tw, th) };
        }),
      };
      trackers.set(canvasKey, t);
    } else if (clock !== t.last) {
      t.last = clock;
      t.items.forEach((it) => {
        let best = Infinity, bx = 0, by = 0;
        const tryAt = (dx, dy) => {
          const p = patch(A, it.cx + dx, it.cy + dy, it.tw, it.th);
          let s = 0;
          for (let i = 0; i < p.length; i++) s += Math.abs(p[i] - it.tpl[i]);
          /* лёгкий штраф за дальний прыжок, чтобы рамка не скакала по похожим местам */
          s += (Math.abs(dx) + Math.abs(dy)) * 0.15;
          if (s < best) { best = s; bx = dx; by = dy; }
        };
        /* сначала грубо через клетку, потом уточняем вокруг лучшего места */
        for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) tryAt(dx, dy);
        const cx0 = bx, cy0 = by;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) tryAt(cx0 + dx, cy0 + dy);
        it.cx = Math.max(it.tw / 2, Math.min(A.gw - it.tw / 2, it.cx + bx * 0.8));
        it.cy = Math.max(it.th / 2, Math.min(A.gh - it.th / 2, it.cy + by * 0.8));
        /* образец понемногу обновляется: объект поворачивается и меняется */
        const now = patch(A, it.cx, it.cy, it.tw, it.th);
        for (let i = 0; i < now.length; i++) it.tpl[i] = it.tpl[i] * 0.85 + now[i] * 0.15;
      });
    }
    return boxes.map((b, i) => {
      const it = t.items[i];
      return { ...b, x: it.cx / A.gw - b.w / 2, y: it.cy / A.gh - b.h / 2 };
    });
  }

  /* рамки «сами» в видео не прыгают каждый кадр: считаем один раз и держим */
  const autoCache = new WeakMap();

  /* ---------- сборка ---------- */
  const api = { fromEffect, PRESETS, SHAPES, LABELS, LENSES, LOOKS, ZOOM_LINES, LINKS, HUD, VARS, ICONS, PACKS, moodPack, drawIcon, defaults, presetById, time: null, lastBoxes: [], lastInsets: [], lastIcons: [], lastDossier: null };
  /* анимация нужна, только если сканер включён и живое сканирование не выключено */
  api.animates = (s) => !!(s && s.scan && s.scan.on && (s.scan.anim !== false || ['flash', 'swarm'].includes(s.scan.motion)));
  api.MOTIONS = MOTIONS;
  api.clock = null;
  api.DURATION = 5;

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeOut = (v) => 1 - (1 - v) * (1 - v) * (1 - v);

  /* rect: где лежит фото на карточке. Всё рисуется только внутри него.
     api.time в секундах: кадр анимации для видео; null значит готовая картинка. */
  api.draw = function (ctx, state, CW, CH, rect) {
    const sc = state.scan;
    if (!sc || !sc.on) return;
    const E = window.Effects;
    const r = rect || { x: 0, y: 0, w: CW, h: CH };
    const W = r.w, H = r.h;
    const u = Math.min(CW, CH) / 1080;
    const col = sc.color || '#39ff6a';
    const hudList = sc.hud || [];
    const T = sc.anim === false ? null : api.time;
    const seed = sc.seed || 1;

    /* часы ролика: время анимации или текущий кадр видео, null у фото */
    const clock = api.time != null ? api.time : api.clock;
    const motion = sc.motion || 'still';
    let A = null;
    const look = () => A || (A = E.analyze(ctx, W, H, r));
    const own = sc.boxes && sc.boxes.length ? sc.boxes : null;
    let boxes;
    if (motion === 'swarm') boxes = swarmBoxes(look(), sc, W, H, clock);
    else if (motion === 'flash') boxes = flashBoxes(look(), sc, W, H, clock, own);
    else {
      boxes = own;
      if (!boxes) {
        const key = `${seed}|${sc.amount}|${sc.label}|${W}x${H}`;
        const kept = clock != null && autoCache.get(ctx.canvas);
        if (kept && kept.key === key && clock >= kept.at) boxes = kept.boxes;
        else {
          boxes = E.autoBoxes(look(), Math.max(1, Math.round(6 * (sc.amount || 1))), E.makeRng(seed), W, H, sc.label === 'below' || sc.label === 'meters' ? 0.05 : 0.02);
          autoCache.set(ctx.canvas, { key, boxes, at: clock == null ? Infinity : clock });
        }
      }
      if (motion === 'track') boxes = track(ctx.canvas, look(), boxes, clock);
    }
    api.lastBoxes = boxes;
    api.lastMotion = motion;
    const px = boxes.map((b) => ({ x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H }));

    /* время появления рамок: по одной, сверху вниз по списку */
    const step = Math.min(0.35, 2.2 / Math.max(1, px.length));
    const appear = (i) => 0.3 + i * step;
    const prog = (i, d = 0.25) => (T == null ? 1 : clamp01((T - appear(i)) / d));
    const shown = px.map((_, i) => prog(i) > 0);
    const boxesDone = appear(px.length) + 0.4;

    /* снимок кадра до обработки: из него берутся лупа и «чистые» рамки при линзе снаружи */
    const needSrc = (sc.lens && sc.lens !== 'none') || sc.zoom > 0 || hudList.includes('noise');
    let src = null;
    if (needSrc) {
      src = buf('scan-src', W, H);
      src.x.drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, W, H);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.translate(r.x, r.y);

    const clipShape = (b) => {
      ctx.beginPath();
      if (sc.shape === 'oval') ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, TAU);
      else ctx.rect(b.x, b.y, b.w, b.h);
    };

    /* зерно по всему кадру */
    if (hudList.includes('noise')) {
      const n = buf('scan-noise', W, H);
      n.x.drawImage(src.c, 0, 0);
      process(n.c, n.x, 'noise', col, seed);
      ctx.drawImage(n.c, 0, 0);
    }

    /* линза: внутри рамок или во всём кадре, кроме рамок */
    if (sc.lens && sc.lens !== 'none') {
      if (sc.lensOut) {
        const all = buf('scan-lens', W, H);
        all.x.drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, W, H);
        process(all.c, all.x, sc.lens, col, seed);
        ctx.drawImage(all.c, 0, 0);
        px.forEach((b, i) => {
          if (!shown[i]) return;
          ctx.save();
          clipShape(b);
          ctx.clip();
          ctx.drawImage(src.c, 0, 0);
          ctx.restore();
        });
      } else {
        px.forEach((b, i) => {
          if (!shown[i]) return;
          const bx = Math.max(0, Math.floor(b.x)), by = Math.max(0, Math.floor(b.y));
          const bw = Math.min(W - bx, Math.ceil(b.w)), bh = Math.min(H - by, Math.ceil(b.h));
          if (bw < 2 || bh < 2) return;
          const p = buf('scan-piece', bw, bh);
          p.x.drawImage(src.c, bx, by, bw, bh, 0, 0, bw, bh);
          process(p.c, p.x, sc.lens, col, seed + i);
          ctx.save();
          ctx.globalAlpha = prog(i);
          clipShape(b);
          ctx.clip();
          ctx.drawImage(p.c, bx, by);
          ctx.restore();
        });
      }
    }

    const lw = 2 * u * (sc.line || 1);
    const f = (() => {
      const c = sc.font && E.fonts().find((x) => x.id === sc.font);
      return c ? { css: c.css, weight: c.weight || 400 } : { css: MONO, weight: 600 };
    })();
    const rng = rngFor(seed, 999);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = lw;
    if (sc.glow) { ctx.shadowColor = col; ctx.shadowBlur = 14 * u; }

    links(ctx, sc.links || 'none', px.filter((_, i) => prog(i) >= 1), W, H, u, rng, lw);

    /* лупа: увеличенный кусок кадра в свободном месте и линия к рамке */
    api.lastInsets = [];
    if (sc.zoom > 0 && px.length) {
      const flagged = boxes.map((b, i) => (b.zoom ? i : -1)).filter((i) => i >= 0);
      /* сначала рамки, отмеченные рукой, остальное добирают самые крупные */
      const big = px.map((b, i) => [i, b.w * b.h]).sort((a, b) => b[1] - a[1]).map(([i]) => i).filter((i) => !flagged.includes(i));
      const picks = [...flagged, ...big].slice(0, Math.max(sc.zoom, flagged.length));
      const insets = placeInsets(boxes, picks, W, H, u, rngFor(seed, 77));
      insets.forEach((s, k) => {
        api.lastInsets.push({ i: s.i, x: s.x / W, y: s.y / H, w: s.w / W, h: s.h / H });
        const p = T == null ? 1 : easeOut(clamp01((T - appear(s.i) - 0.5) / 0.35));
        if (p <= 0) return;
        const b = px[s.i];
        ctx.save();
        ctx.globalAlpha = p;
        ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
        ctx.scale(0.6 + 0.4 * p, 0.6 + 0.4 * p);
        ctx.translate(-(s.x + s.w / 2), -(s.y + s.h / 2));
        ctx.save();
        ctx.shadowBlur = 0;
        const sw = Math.max(2, Math.round(b.w)), sh = Math.max(2, Math.round(b.h));
        const z = buf('scan-zoom', s.w, s.h);
        z.x.drawImage(src.c, b.x, b.y, sw, sh, 0, 0, s.w, s.h);
        process(z.c, z.x, sc.zoomLook, col, seed + 50 + k);
        ctx.drawImage(z.c, s.x, s.y, s.w, s.h);
        ctx.restore();
        ctx.lineWidth = lw * 1.1;
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = p;
        ctx.lineWidth = lw * 0.8;
        insetLine(ctx, sc.zoomLine, b, s);
        ctx.restore();
        const cap = fill(sc.zoomText, boxes[s.i], s.i, W, H, seed + 300, state.note);
        if (cap && p >= 1) {
          ctx.save();
          ctx.shadowBlur = 0;
          const size = 15 * u;
          const ty = s.y - size * 1.4 >= 0 ? s.y - size * 1.4 : s.y + s.h;
          textBox(ctx, cap, s.x, ty, size, col, isLight(col) ? '#0d0d0d' : '#ffffff', 6 * u, f.css, f.weight);
          ctx.restore();
        }
      });
    }

    const list = words(sc.text);
    px.forEach((b, i) => {
      const p = prog(i);
      if (p <= 0) return;
      ctx.save();
      if (p < 1) {
        /* рамка наезжает и сжимается до места */
        const k = 1 + (1 - easeOut(p)) * 0.4;
        ctx.globalAlpha = p;
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
        ctx.scale(k, k);
        ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      shapePath(ctx, sc.shape, b.x, b.y, b.w, b.h, u, lw, i);
      ctx.restore();
      /* у рамки может быть свой текст вместо общего шаблона */
      const tpl = boxes[i].text ? boxes[i].text : list.length ? list[i % list.length] : '';
      /* пока рамка «думает», проценты перебираются, потом застывают */
      const settled = T == null || T > appear(i) + 1.3;
      const tick = boxes[i].epoch != null ? boxes[i].epoch * 7 + 1 : settled ? null : Math.floor(T * 12);
      let text = fill(tpl, boxes[i], boxes[i].slot != null ? boxes[i].slot : i, W, H, seed, state.note, tick);
      if (T != null) text = text.slice(0, Math.max(0, Math.floor((T - appear(i) - 0.15) * 32)));
      drawLabel(ctx, sc, text, b.x, b.y, b.w, b.h, W, H, u, col, f, i);
    });
    ctx.shadowBlur = 0;

    hud(ctx, { ...sc, hud: hudList }, W, H, u, col, rngFor(seed, 555), state.note, T);

    /* досье */
    api.lastDossier = null;
    const d = sc.dossier;
    if (d && d.on) {
      const L = dossierLayout(d, W, H, u, f, state.note, seed + 900);
      /* размер считаем заранее на скрытом холсте, чтобы выбрать свободный угол */
      const probe = buf('scan-measure', 4, 4);
      const box = drawDossier(probe.x, d, L, -1e5, -1e5, u, col, f, null, 0);
      let x0, y0;
      if (d.x != null && d.y != null) {
        x0 = d.x * W;
        y0 = d.y * H;
      } else {
        const m = 0.05 * W;
        const corners = [[m, H * 0.12], [W - box.w - m, H * 0.12], [m, H - box.h - H * 0.08], [W - box.w - m, H - box.h - H * 0.08]];
        let best = Infinity;
        corners.forEach(([cx, cy]) => {
          let o = 0;
          px.forEach((b) => { o += Math.max(0, Math.min(cx + box.w, b.x + b.w) - Math.max(cx, b.x)) * Math.max(0, Math.min(cy + box.h, b.y + b.h) - Math.max(cy, b.y)); });
          if (o < best) { best = o; x0 = cx; y0 = cy; }
        });
      }
      x0 = Math.max(0, Math.min(W - box.w, x0));
      y0 = Math.max(0, Math.min(H - box.h, y0));
      if (T == null || T >= boxesDone) {
        ctx.save();
        if (T != null) ctx.globalAlpha = clamp01((T - boxesDone) / 0.25);
        drawDossier(ctx, d, L, x0, y0, u, col, f, T, boxesDone);
        ctx.restore();
      }
      api.lastDossier = { x: x0 / W, y: y0 / H, w: box.w / W, h: box.h / H };
    }

    /* значки поверх всего: появляются по одному, курсор подъезжает */
    api.lastIcons = [];
    (sc.icons || []).forEach((ic, j) => {
      const size = 64 * u * (ic.s || 1);
      let cx = ic.x * W, cy = ic.y * H;
      const b = iconBox(ic.k, cx, cy, size);
      api.lastIcons.push({ x: b.x / W, y: b.y / H, w: b.w / W, h: b.h / H });
      if (T != null) {
        const p = clamp01((T - 0.6 - j * 0.35) / 0.8);
        if (p <= 0) return;
        if (ic.k === 'cursor') {
          const e = easeOut(p);
          cx += (1 - e) * W * 0.25;
          cy += (1 - e) * H * 0.18;
        }
        ctx.save();
        ctx.globalAlpha = ic.k === 'cursor' ? 1 : p;
        drawIcon(ctx, ic.k, cx, cy, size, col);
        ctx.restore();
        return;
      }
      drawIcon(ctx, ic.k, cx, cy, size, col);
    });
    ctx.restore();
  };

  return api;
})();
