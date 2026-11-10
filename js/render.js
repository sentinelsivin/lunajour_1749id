/* Сборка карточки: бумага -> фото сквозь мотив -> подпись.
   Один и тот же код рисует превью, PNG и кадры видео, меняется только размер холста. */
(function () {
  const { makeRng, byId } = window.Motifs;

  const RATIOS = {
    '4:5': [1080, 1350],
    '1:1': [1080, 1080],
    '9:16': [1080, 1920],
    '4:3': [1440, 1080],
    '16:9': [1920, 1080],
  };

  const PAPERS = [
    { id: 'smooth', name: 'Гладкая' },
    { id: 'lace', name: 'Кружево' },
    { id: 'tablecloth', name: 'Скатерть' },
    { id: 'tulle', name: 'Сетка' },
    { id: 'crumple', name: 'Мятая' },
    { id: 'gridfold', name: 'Мятая клетка' },
    { id: 'crochet', name: 'Вязание' },
    { id: 'dotfold', name: 'Мятая в точку' },
    { id: 'damask', name: 'Дамаск' },
    { id: 'blossom', name: 'Цветение' },
    { id: 'kraft', name: 'Крафт' },
    { id: 'squares', name: 'В клетку' },
    { id: 'lines', name: 'В линейку' },
    { id: 'own', name: 'Своя картинка' },
  ];

  const FONTS = [
    ...window.Motifs.WORD_FONTS,
    { id: 'golos', name: 'Обычный', css: '"Golos Text", system-ui, sans-serif', weight: 600 },
    { id: 'caveat', name: 'От руки', css: '"Caveat", cursive', weight: 700 },
    { id: 'yeseva', name: 'Журнал', css: '"Yeseva One", Georgia, serif', weight: 400 },
    { id: 'mono', name: 'Машинка', css: '"JetBrains Mono", ui-monospace, monospace', weight: 500 },
    { id: 'unbounded', name: 'Плакат', css: '"Unbounded", system-ui, sans-serif', weight: 800 },
  ];

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  /* Держим только свежие результаты, старые размеры и зёрна вытесняем. */
  function lruCache(limit) {
    const map = new Map();
    const get = (key, make) => {
      if (map.has(key)) {
        const v = map.get(key);
        map.delete(key);
        map.set(key, v);
        return v;
      }
      const v = make();
      map.set(key, v);
      if (map.size > limit) map.delete(map.keys().next().value);
      return v;
    };
    get.clear = () => map.clear();
    return get;
  }
  const paperCache = lruCache(4);
  const maskCache = lruCache(6);

  /* Рабочие холсты живут между кадрами, чтобы камера не плодила мусор на каждом кадре. */
  const buffers = new Map();
  function buffer(name, w, h, options) {
    let b = buffers.get(name);
    if (!b) {
      const c = canvas(w, h);
      b = { c, x: c.getContext('2d', options) };
      buffers.set(name, b);
    }
    b.c.width = Math.max(1, Math.round(w));
    b.c.height = Math.max(1, Math.round(h));
    return b;
  }

  /* ---------- бумага ---------- */
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }

  /* Заломы листа: ломаная через весь лист, тонкая тень с одной стороны и блик с другой. */
  function creases(x, rng, w, h, u) {
    x.lineJoin = 'round';
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0.25, 1.3) * (rng() > 0.5 ? 1 : -1);
      const cx = rng() * w;
      const cy = rng() * h;
      const l = Math.hypot(w, h);
      const pts = [-1, -0.45, -0.1, 0.3, 0.7, 1].map((t) => [
        cx + Math.cos(a) * l * t + rng.range(-16, 16) * u,
        cy + Math.sin(a) * l * t + rng.range(-16, 16) * u,
      ]);
      const trace = (dx, dy) => {
        x.beginPath();
        pts.forEach(([p, q], k) => x[k ? 'lineTo' : 'moveTo'](p + dx, q + dy));
        x.stroke();
      };
      [[20, 0.012], [9, 0.018], [3, 0.05]].forEach(([width, alpha]) => {
        x.strokeStyle = `rgba(0,0,0,${alpha})`;
        x.lineWidth = width * u;
        trace(1.5 * u, 1.5 * u);
      });
      x.strokeStyle = 'rgba(255,255,255,.55)';
      x.lineWidth = 2 * u;
      trace(-1.5 * u, -1.5 * u);
    }
  }

  function dotGrid(x, w, h, step, r, color) {
    x.fillStyle = color;
    x.beginPath();
    for (let py = step / 2; py < h; py += step) {
      for (let px = step / 2; px < w; px += step) {
        x.moveTo(px + r, py);
        x.arc(px, py, r, 0, 7);
      }
    }
    x.fill();
  }

  /* Цветок кружева: лепестки контуром, сердцевина дырочками, вокруг фестон. */
  function laceFlower(x, cx, cy, r, ink, u, rng) {
    const petals = 8;
    x.lineWidth = 2.6 * u;
    x.strokeStyle = `rgba(${ink},.27)`;
    x.fillStyle = `rgba(${ink},.07)`;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * 6.283 + rng() * 0.1;
      x.beginPath();
      x.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.42, r * 0.2, a, 0, 7);
      x.fill();
      x.stroke();
    }
    x.beginPath();
    x.arc(cx, cy, r * 0.17, 0, 7);
    x.stroke();
    x.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 6.283;
      const px = cx + Math.cos(a) * r * 1.14;
      const py = cy + Math.sin(a) * r * 1.14;
      x.moveTo(px + r * 0.1, py);
      x.arc(px, py, r * 0.1, 0, 7);
    }
    x.stroke();
  }

  function damaskCell(x, cx, cy, tw, th, ink, u) {
    x.strokeStyle = `rgba(${ink},.2)`;
    x.fillStyle = `rgba(${ink},.1)`;
    x.lineWidth = 2.5 * u;
    /* рамка в форме оживальной арки */
    x.beginPath();
    x.moveTo(cx, cy - th / 2);
    x.bezierCurveTo(cx + tw * 0.2, cy - th * 0.3, cx + tw / 2, cy - th * 0.12, cx + tw / 2, cy);
    x.bezierCurveTo(cx + tw / 2, cy + th * 0.12, cx + tw * 0.2, cy + th * 0.3, cx, cy + th / 2);
    x.bezierCurveTo(cx - tw * 0.2, cy + th * 0.3, cx - tw / 2, cy + th * 0.12, cx - tw / 2, cy);
    x.bezierCurveTo(cx - tw / 2, cy - th * 0.12, cx - tw * 0.2, cy - th * 0.3, cx, cy - th / 2);
    x.stroke();
    /* внутри зеркальные листья вокруг центрального бутона */
    for (const side of [-1, 1]) {
      for (const [dy, s] of [[-0.2, 0.75], [0, 1], [0.2, 0.75]]) {
        x.beginPath();
        x.moveTo(cx, cy + th * dy);
        x.quadraticCurveTo(cx + side * tw * 0.16 * s, cy + th * (dy - 0.11) * s, cx + side * tw * 0.3 * s, cy + th * dy);
        x.quadraticCurveTo(cx + side * tw * 0.16 * s, cy + th * (dy + 0.08) * s, cx, cy + th * dy);
        x.fill();
      }
    }
    x.beginPath();
    x.ellipse(cx, cy, tw * 0.07, th * 0.1, 0, 0, 7);
    x.fill();
    x.stroke();
  }

  /* Гипюровая скатерть: белая сетка, цвет бумаги виден только в дырочках,
     сверху плотные завитки, листья и розы с серым шнуром по краю, под всем мягкая тень. */
  function tablecloth(x, w, h, u, rng, flowers = true) {
    const L = canvas(w, h);
    const l = L.getContext('2d');
    l.lineCap = 'round';
    l.lineJoin = 'round';

    /* сетка из ромбиков */
    const step = 12 * u;
    const k = Math.tan(Math.PI / 3);
    l.strokeStyle = '#fff';
    l.lineWidth = Math.max(1, 2.8 * u);
    l.beginPath();
    for (let d = -h; d < w + h; d += step) {
      l.moveTo(d, 0); l.lineTo(d + h / k, h);
      l.moveTo(d, 0); l.lineTo(d - h / k, h);
    }
    l.stroke();

    const cord = 'rgba(0,0,0,.2)';
    /* линия со шнуром: сначала тёмная пошире, потом белая уже */
    const corded = (path, width) => {
      l.strokeStyle = cord;
      l.lineWidth = width + 3 * u;
      l.stroke(path);
      l.strokeStyle = '#fff';
      l.lineWidth = width;
      l.stroke(path);
    };
    const shape = (path) => {
      l.fillStyle = '#fff';
      l.fill(path);
      l.strokeStyle = cord;
      l.lineWidth = 1.8 * u;
      l.stroke(path);
    };
    const leaf = (cx, cy, len, a) => {
      const p = new Path2D();
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pt = (fx, fy) => [cx + fx * len * ca - fy * len * sa, cy + fx * len * sa + fy * len * ca];
      p.moveTo(...pt(0, 0));
      p.quadraticCurveTo(...pt(0.45, -0.42), ...pt(1, 0));
      p.quadraticCurveTo(...pt(0.45, 0.42), ...pt(0, 0));
      shape(p);
      const vein = new Path2D();
      vein.moveTo(...pt(0.1, 0));
      vein.lineTo(...pt(0.85, 0));
      l.strokeStyle = cord;
      l.lineWidth = 1.2 * u;
      l.stroke(vein);
    };
    const rose = (cx, cy, r) => {
      for (const [rr, n] of [[1, 9], [0.66, 7], [0.36, 5]]) {
        const p = new Path2D();
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 6.283 + rr;
          const px = cx + Math.cos(a) * r * rr * 0.62;
          const py = cy + Math.sin(a) * r * rr * 0.62;
          p.moveTo(px + r * rr * 0.42, py);
          p.arc(px, py, r * rr * 0.42, 0, 6.283);
        }
        shape(p);
      }
    };
    const curl = (cx, cy, r, a0, dir) => {
      const p = new Path2D();
      for (let t = 0; t <= 1; t += 0.02) {
        const a = a0 + dir * t * 6.283 * 1.15;
        const rr = r * (1 - t * 0.75);
        p[t ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      corded(p, 9 * u);
    };

    /* узор по сетке ячеек со сдвигом, чтобы не выглядел штампом */
    const cell = 230 * u;
    if (flowers) for (let row = 0, cy = 0; cy < h + cell; row++, cy += cell * 0.75) {
      for (let cx = row % 2 ? cell / 2 : 0; cx < w + cell; cx += cell) {
        const ox = cx + rng.range(-0.15, 0.15) * cell;
        const oy = cy + rng.range(-0.15, 0.15) * cell;
        /* лоза: изогнутый стебель с листьями */
        let px = ox - cell * 0.45;
        let py = oy + rng.range(-0.2, 0.2) * cell;
        let a = rng.range(-0.6, 0.6);
        const stem = new Path2D();
        stem.moveTo(px, py);
        const knots = [];
        for (let i = 0; i < 7; i++) {
          a += rng.range(-0.7, 0.7);
          const nx = px + Math.cos(a) * cell * 0.16;
          const ny = py + Math.sin(a) * cell * 0.16;
          stem.quadraticCurveTo(px + Math.cos(a - 0.5) * cell * 0.1, py + Math.sin(a - 0.5) * cell * 0.1, nx, ny);
          knots.push([nx, ny, a]);
          px = nx;
          py = ny;
        }
        corded(stem, 9 * u);
        knots.forEach(([kx, ky, ka], i) => leaf(kx, ky, cell * rng.range(0.17, 0.27), ka + (i % 2 ? 1 : -1) * rng.range(0.7, 1.2)));
        curl(px, py, cell * 0.11, a + 1.6, rng() > 0.5 ? 1 : -1);
        if (rng() > 0.2) rose(ox + rng.range(-0.25, 0.25) * cell, oy + rng.range(-0.3, 0.3) * cell, cell * rng.range(0.14, 0.21));
      }
    }

    /* мелкие дырочки по всему кружеву, чтобы плотные места не были плоскими */
    l.globalCompositeOperation = 'destination-out';
    dotGrid(l, w, h, 6 * u, Math.max(0.4, 0.9 * u), 'rgba(0,0,0,.45)');
    l.globalCompositeOperation = 'source-over';

    /* тень под кружевом: та же картинка, только тёмная и чуть сдвинутая */
    const S = canvas(w, h);
    const s = S.getContext('2d');
    s.drawImage(L, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = 'rgba(0,0,0,.22)';
    s.fillRect(0, 0, w, h);
    x.drawImage(S, 2.5 * u, 3 * u);
    x.globalAlpha = 0.93;
    x.drawImage(L, 0, 0);
    x.globalAlpha = 1;
  }

  function paintPaper(type, color, w, h) {
    {
      const c = canvas(w, h);
      const x = c.getContext('2d');
      const rng = makeRng(77);
      const u = w / 1080;
      x.fillStyle = color;
      x.fillRect(0, 0, w, h);
      const ink = luminance(color) > 0.45 ? '0,0,0' : '255,255,255';

      if (type === 'crumple') {
        /* грани смятого листа: случайные треугольники светлее и темнее основы */
        for (let i = 0; i < 260; i++) {
          const cx = rng() * w;
          const cy = rng() * h;
          const r = rng.range(80, 330) * u;
          const a = rng() * 6.28;
          x.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${rng.range(0.012, 0.035)})` : `rgba(0,0,0,${rng.range(0.006, 0.02)})`;
          x.beginPath();
          x.moveTo(cx, cy);
          x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          x.lineTo(cx + Math.cos(a + 1.3) * r, cy + Math.sin(a + 1.3) * r);
          x.closePath();
          x.fill();
        }
      } else if (type === 'gridfold') {
        const step = 45 * u;
        x.strokeStyle = `rgba(${ink},.2)`;
        x.lineWidth = Math.max(1, 1.3 * u);
        x.beginPath();
        for (let y = step; y < h; y += step) { x.moveTo(0, y); x.lineTo(w, y); }
        for (let v = step; v < w; v += step) { x.moveTo(v, 0); x.lineTo(v, h); }
        x.stroke();
        creases(x, rng, w, h, u);
      } else if (type === 'dotfold') {
        dotGrid(x, w, h, 30 * u, Math.max(0.8, 2 * u), `rgba(${ink},.34)`);
        creases(x, rng, w, h, u);
      } else if (type === 'lace') {
        /* тюлевая сетка, поверх неё цветы в шахматном порядке */
        const mesh = 15 * u;
        x.strokeStyle = `rgba(${ink},.12)`;
        x.lineWidth = Math.max(0.7, 1.1 * u);
        x.beginPath();
        for (let d = -h; d < w + h; d += mesh) {
          x.moveTo(d, 0);
          x.lineTo(d + h, h);
          x.moveTo(d + h, 0);
          x.lineTo(d, h);
        }
        x.stroke();
        const tile = 300 * u;
        let row = 0;
        for (let y = 0; y < h + tile; y += tile * 0.72, row++) {
          for (let v = row % 2 ? tile / 2 : 0; v < w + tile; v += tile) laceFlower(x, v, y, 88 * u, ink, u, rng);
        }
      } else if (type === 'tablecloth') {
        tablecloth(x, w, h, u, rng);
      } else if (type === 'tulle') {
        tablecloth(x, w, h, u, rng, false);
      } else if (type === 'crochet') {
        /* филейное вязание: столбики плотные там, где узор, и редкие в сетке вокруг */
        const cell = 16 * u;
        const period = 15;
        const dense = new Path2D();
        const open = new Path2D();
        for (let gy = 0, py = 0; py < h; gy++, py += cell) {
          for (let gx = 0, px = 0; px < w; gx++, px += cell) {
            const lx = (gx % period) - period / 2 + 0.5;
            const ly = ((gy + (Math.floor(gx / period) % 2) * 7) % period) - period / 2 + 0.5;
            const d = Math.hypot(lx, ly);
            const a = Math.atan2(ly, lx);
            const on = d < 1.7 || (d > 2.8 && d < 5.6 && Math.cos(a * 6) > -0.1);
            const p = on ? dense : open;
            const i = cell * 0.18;
            if (on) {
              p.moveTo(px + i, py + i); p.lineTo(px + cell - i, py + cell - i);
              p.moveTo(px + cell - i, py + i); p.lineTo(px + i, py + cell - i);
              p.moveTo(px + cell / 2, py + i); p.lineTo(px + cell / 2, py + cell - i);
            } else {
              p.moveTo(px, py + cell / 2); p.lineTo(px + cell, py + cell / 2);
              p.moveTo(px + cell / 2, py); p.lineTo(px + cell / 2, py + cell);
            }
          }
        }
        x.lineWidth = Math.max(0.7, 1.2 * u);
        x.strokeStyle = `rgba(${ink},.14)`;
        x.stroke(open);
        x.lineWidth = Math.max(0.9, 2 * u);
        x.strokeStyle = `rgba(${ink},.36)`;
        x.stroke(dense);
      } else if (type === 'damask') {
        const tw = 270 * u;
        const th = 380 * u;
        for (let col = 0, v = 0; v < w + tw; col++, v += tw) {
          for (let y = col % 2 ? th / 2 : 0; y < h + th; y += th) damaskCell(x, v, y, tw * 0.94, th * 0.94, ink, u);
        }
        dotGrid(x, w, h, 9 * u, Math.max(0.5, 0.9 * u), `rgba(${ink},.1)`);
      } else if (type === 'blossom') {
        /* рельефные ветки: тёмный край снизу и светлый сверху */
        dotGrid(x, w, h, 18 * u, Math.max(0.5, 1.1 * u), `rgba(${ink},.16)`);
        const relief = (draw) => {
          x.save();
          x.translate(2.4 * u, 2.4 * u);
          x.strokeStyle = 'rgba(0,0,0,.14)';
          draw();
          x.translate(-4.2 * u, -4.2 * u);
          x.strokeStyle = 'rgba(255,255,255,.8)';
          draw();
          x.restore();
        };
        x.lineWidth = 3.4 * u;
        x.lineCap = 'round';
        for (let b = 0; b < 24; b++) {
          let px = rng() * w;
          let py = rng() * h;
          let a = rng() * 6.283;
          const pts = [];
          for (let i = 0; i < 9; i++) {
            pts.push([px, py]);
            a += rng.range(-0.55, 0.55);
            px += Math.cos(a) * 62 * u;
            py += Math.sin(a) * 62 * u;
          }
          relief(() => {
            x.beginPath();
            pts.forEach(([p, q], i) => x[i ? 'lineTo' : 'moveTo'](p, q));
            x.stroke();
          });
          pts.forEach(([p, q], i) => {
            if (i % 2) return;
            const r = 25 * u;
            relief(() => {
              for (let k = 0; k < 5; k++) {
                const t = (k / 5) * 6.283;
                x.beginPath();
                x.arc(p + Math.cos(t) * r, q + Math.sin(t) * r, r * 0.62, 0, 7);
                x.stroke();
              }
            });
          });
        }
      } else if (type === 'kraft') {
        /* короткие волокна */
        x.lineWidth = 1.2 * u;
        for (let i = 0; i < 5200; i++) {
          const cx = rng() * w;
          const cy = rng() * h;
          const a = rng() * 6.28;
          const l = rng.range(5, 24) * u;
          x.strokeStyle = `rgba(${ink},${rng.range(0.03, 0.14)})`;
          x.beginPath();
          x.moveTo(cx, cy);
          x.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
          x.stroke();
        }
      } else if (type === 'squares' || type === 'lines') {
        const step = (type === 'squares' ? 45 : 54) * u;
        x.strokeStyle = 'rgba(45,105,190,.26)';
        x.lineWidth = Math.max(1, 1.4 * u);
        x.beginPath();
        for (let y = step; y < h; y += step) { x.moveTo(0, y); x.lineTo(w, y); }
        if (type !== 'lines') for (let v = step; v < w; v += step) { x.moveTo(v, 0); x.lineTo(v, h); }
        x.stroke();
      }
      return c;
    }
  }

  function drawPaper(type, color, w, h) {
    return paperCache(`${type}|${color}|${w}x${h}`, () => paintPaper(type, color, w, h));
  }

  /* ---------- маска мотива ---------- */
  function drawMask(s, w, h, assets) {
    const key = [s.motif, s.seed, s.size, s.density, s.word, s.wordFont, s.invert, assets.maskId, JSON.stringify(s.pieces), w, h].join('|');
    return maskCache(key, () => {
      const c = canvas(w, h);
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      byId(s.motif).draw(x, c.width, c.height, makeRng(s.seed), {
        size: s.size, density: s.density, text: s.word, font: s.wordFont, image: assets.mask, pieces: s.pieces,
      });
      if (s.invert) {
        x.globalCompositeOperation = 'source-out';
        x.fillRect(0, 0, c.width, c.height);
      }
      return c;
    });
  }

  /* ---------- геометрия ---------- */
  /* photo: снимок с вырезанными фигурами. pieces: бумага, на которой лежат вырезанные кусочки.
     Обе части одного размера, поэтому каждый кусочок совпадает со своим отверстием. */
  function layout(s, W, H) {
    const pos = s.paperPos;
    const unit = Math.min(W, H);
    if (pos === 'photo') return { photo: { x: 0, y: 0, w: W, h: H }, pieces: null, note: null };
    if (pos === 'pieces') {
      const m = Math.round(unit * 0.045);
      const t = Math.round(unit * 0.19);
      return { photo: null, pieces: { x: m, y: m, w: W - 2 * m, h: H - t - m }, note: { x: m, y: H - t, w: W - 2 * m, h: t } };
    }
    const hw = Math.floor(W / 2);
    const hh = Math.floor(H / 2);
    const halves = {
      top: [{ x: 0, y: 0, w: W, h: hh }, { x: 0, y: H - hh, w: W, h: hh }],
      bottom: [{ x: 0, y: H - hh, w: W, h: hh }, { x: 0, y: 0, w: W, h: hh }],
      left: [{ x: 0, y: 0, w: hw, h: H }, { x: W - hw, y: 0, w: hw, h: H }],
      right: [{ x: W - hw, y: 0, w: hw, h: H }, { x: 0, y: 0, w: hw, h: H }],
    };
    const [pieces, photo] = halves[pos] || halves.bottom;
    const t = Math.round(unit * 0.15);
    return { photo, pieces, note: { x: pieces.x, y: pieces.y + pieces.h - t, w: pieces.w, h: t } };
  }

  /* Где лежит снимок номер i. В будке с двумя половинами первый снимок идёт в фото, второй в кусочки. */
  function slotFrame(s, i, count, W, H) {
    const L = layout(s, W, H);
    if (count === 2 && L.photo && L.pieces) {
      const area = i === 0 ? L.photo : L.pieces;
      return { area, rect: slotRect(0, 1, area.w, area.h) };
    }
    const area = L.photo || L.pieces;
    return { area, rect: slotRect(i, count, area.w, area.h) };
  }

  /* Прямоугольник слота внутри окна: в режиме будки окно делится на две части. */
  function slotRect(i, count, w, h) {
    if (count === 1) return { x: 0, y: 0, w, h };
    return { x: 0, y: (h / 2) * i, w, h: h / 2 };
  }

  /* Как лежит снимок в слоте: заполняет его целиком, потом масштаб и свободный сдвиг.
     x и y это доли окна: при отражении сдвиг идёт в обратную сторону, чтобы на экране совпасть с жестом. */
  function coverGeom(slot, rect) {
    const { sw, sh } = slot.src;
    const sideways = slot.turn % 180 !== 0;
    const k = Math.max(rect.w / (sideways ? sh : sw), rect.h / (sideways ? sw : sh)) * slot.zoom;
    return {
      dw: sw * k,
      dh: sh * k,
      cx: rect.x + rect.w / 2 + (slot.flip ? -slot.x : slot.x) * rect.w,
      cy: rect.y + rect.h / 2 + slot.y * rect.h,
    };
  }

  /* ---------- цветокоррекция по пикселям: ctx.filter не работает в Safari ---------- */
  function neutral(a) { return !a.b && !a.c && !a.s && !a.w; }

  function applyAdjust(ctx, w, h, a) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const contrast = 1 + a.c / 100;
    const shift = a.b * 1.1;
    const warm = a.w * 0.35;
    const sat = 1 + a.s / 100;
    const lut = (bias) => {
      const t = new Float32Array(256);
      for (let i = 0; i < 256; i++) t[i] = (i - 128) * contrast + 128 + shift + bias;
      return t;
    };
    const lr = lut(warm);
    const lg = lut(0);
    const lb = lut(-warm);
    for (let i = 0; i < d.length; i += 4) {
      const r = lr[d[i]];
      const g = lg[d[i + 1]];
      const b = lb[d[i + 2]];
      const y = 0.3 * r + 0.59 * g + 0.11 * b;
      d[i] = y + (r - y) * sat;
      d[i + 1] = y + (g - y) * sat;
      d[i + 2] = y + (b - y) * sat;
    }
    ctx.putImageData(img, 0, 0);
  }

  let grainTile = null;
  function grain() {
    if (grainTile) return grainTile;
    grainTile = canvas(256, 256);
    const x = grainTile.getContext('2d');
    const img = x.createImageData(256, 256);
    const rng = makeRng(5);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rng() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return grainTile;
  }

  /* ---------- фото в окне ---------- */
  function drawPhoto(s, slots, w, h, name) {
    const { c, x } = buffer(neutral(s.adjust) ? name : `${name}-read`, w, h, { willReadFrequently: !neutral(s.adjust) });
    slots.forEach((slot, i) => {
      const rect = slotRect(i, slots.length, c.width, c.height);
      if (!slot.src) {
        x.fillStyle = '#181818';
        x.fillRect(rect.x, rect.y, rect.w, rect.h);
        return;
      }
      const g = coverGeom(slot, rect);
      x.save();
      x.beginPath();
      x.rect(rect.x, rect.y, rect.w, rect.h);
      x.clip();
      if (slot.flip) {
        x.translate(rect.x * 2 + rect.w, 0);
        x.scale(-1, 1);
      }
      x.translate(g.cx, g.cy);
      x.rotate((slot.turn * Math.PI) / 180);
      x.drawImage(slot.src.el, -g.dw / 2, -g.dh / 2, g.dw, g.dh);
      x.restore();
    });
    if (!neutral(s.adjust)) applyAdjust(x, c.width, c.height, s.adjust);
    if (s.adjust.g) {
      x.save();
      x.globalCompositeOperation = 'overlay';
      x.globalAlpha = s.adjust.g / 170;
      const speckled = x.createPattern(grain(), 'repeat');
      x.restore();
      /* Зерно только на самом снимке: сдвинутое фото оставляет пустое место, там видна бумага. */
      const tint = buffer('grain', c.width, c.height);
      tint.x.fillStyle = speckled;
      tint.x.fillRect(0, 0, c.width, c.height);
      tint.x.globalCompositeOperation = 'destination-in';
      tint.x.drawImage(c, 0, 0);
      x.save();
      x.globalCompositeOperation = 'overlay';
      x.globalAlpha = s.adjust.g / 170;
      x.drawImage(tint.c, 0, 0);
      x.restore();
    }
    return c;
  }

  /* ---------- текст ---------- */
  function fitText(ctx, text, font, maxW, startSize) {
    let size = startSize;
    ctx.font = `${font.weight} ${size}px ${font.css}`;
    const width = ctx.measureText(text).width;
    if (width > maxW) {
      size = Math.max(10, (size * maxW) / width);
      ctx.font = `${font.weight} ${size}px ${font.css}`;
    }
    return size;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  const NOTE_SIZES = { s: 0.75, m: 1, l: 1.3 };

  function drawNote(ctx, s, L, W, H) {
    const n = s.note;
    const meta = [n.place, n.showDate && formatDate(n.date)].filter(Boolean).join(' · ');
    if (!n.title && !meta && !n.mood) return;
    const font = FONTS.find((f) => f.id === n.font) || FONTS[0];
    const u = Math.min(W, H) / 1080;
    const scale = NOTE_SIZES[n.size] || 1;
    const overlay = !L.note;
    const box = L.note || { x: 0, y: H - 210 * u, w: W, h: 210 * u };
    const color = overlay ? '#ffffff' : n.color === 'auto' ? (luminance(s.paperColor) > 0.45 ? '#1b2522' : '#f6f6ef') : n.color;

    ctx.save();
    ctx.translate(box.x, box.y);
    const bw = box.w;
    const bh = box.h;
    const pad = 34 * u;
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    if (overlay) {
      ctx.shadowColor = 'rgba(0,0,0,.65)';
      ctx.shadowBlur = 18 * u;
    }
    const moodW = n.mood ? bw * 0.3 : 0;
    const textW = bw - pad * 2 - moodW;
    let titleSize = 0;
    if (n.title) {
      ctx.textAlign = 'left';
      titleSize = fitText(ctx, n.title, font, textW, (meta ? 66 : 80) * u * scale);
      ctx.fillText(n.title, pad, bh / 2 + (meta ? -4 * u : titleSize * 0.34));
    }
    if (meta) {
      ctx.textAlign = 'left';
      const small = { ...font, weight: Math.min(font.weight, 500) };
      const size = fitText(ctx, meta, small, textW, 32 * u * scale);
      ctx.fillText(meta, pad, n.title ? bh / 2 + size + 16 * u : bh / 2 + size * 0.34);
    }
    if (n.mood) {
      /* настроение печатается штампом в углу полосы */
      ctx.shadowBlur = 0;
      const size = fitText(ctx, n.mood, FONTS.find((f) => f.id === 'mono'), moodW - 56 * u, 30 * u);
      const tw = ctx.measureText(n.mood).width;
      const sw = tw + 44 * u;
      const sh = size + 34 * u;
      ctx.translate(bw - pad - sw / 2, bh / 2);
      ctx.rotate(-0.07);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5 * u;
      ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.mood, 0, 2 * u);
    }
    ctx.restore();
  }

  /* ---------- сборка ---------- */
  function drawCover(ctx, el, sw, sh, W, H) {
    const k = Math.max(W / sw, H / sh);
    ctx.drawImage(el, (W - sw * k) / 2, (H - sh * k) / 2, sw * k, sh * k);
  }

  /* Коллаж: на бумаге лежат ячейки шаблона, в каждой свой снимок. Пустая ячейка показывает плюс. */
  function renderCollage(ctx, s, slots, W, H, u, paper) {
    const C = window.Collages;
    const light = luminance(s.paperColor) > 0.45;
    const ink = light ? '0,0,0' : '255,255,255';
    const inkText = light ? '#1b2522' : '#f6f6ef';
    const geo = C.geometry(s.collage, W, H, s, inkText);
    /* выбранный цвет элемента шаблона или цвет по умолчанию */
    const chosen = (s.tints && s.tints[s.collage]) || {};
    const pick = (key, def) => (chosen[key] && chosen[key] !== 'auto' ? chosen[key] : def);
    const opt = { title: s.note.title, ink: inkText, c: pick };
    if (geo.tpl.deco) geo.tpl.deco(ctx, geo.box, u, geo, opt);
    geo.cells.forEach((base, i) => {
      const slot = slots[i];
      const cell = { ...base };
      if (base.tint) cell.color = pick(base.tint, base.color);
      else if (C.COLORABLE.includes(base.frame)) cell.color = pick('frame', base.color);
      if (base.tape) cell.tapeColor = pick('tape', undefined);
      if (base.pin) cell.pinColor = pick('pins', undefined);
      ctx.save();
      C.clipBox(ctx, cell, geo.box);
      ctx.translate(cell.x + cell.w / 2, cell.y + cell.h / 2);
      ctx.rotate(cell.rot);
      C.drawFrame(ctx, cell, u, buffer);
      ctx.save();
      C.clipCell(ctx, cell);
      if (slot && slot.src) {
        const photo = drawPhoto(s, [slot], cell.w, cell.h, `cell${i}`);
        if (s.effect === 'shadow' && !cell.frame) {
          ctx.shadowColor = 'rgba(0,0,0,.45)';
          ctx.shadowBlur = 14 * u;
          ctx.shadowOffsetY = 6 * u;
        }
        ctx.drawImage(photo, -cell.w / 2, -cell.h / 2, cell.w, cell.h);
      } else {
        /* цвет пустой ячейки зависит от того, что под ней: белая рамка, тёмная плёнка или бумага */
        const tone = cell.frame || geo.tpl.under === 'light' ? '0,0,0' : geo.tpl.under === 'dark' ? '255,255,255' : ink;
        ctx.fillStyle = `rgba(${tone},.1)`;
        ctx.fillRect(-cell.w / 2, -cell.h / 2, cell.w, cell.h);
        const r = Math.min(cell.w, cell.h) * 0.09;
        ctx.strokeStyle = `rgba(${tone},.4)`;
        ctx.lineWidth = Math.max(2, r * 0.18);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
        ctx.moveTo(0, -r); ctx.lineTo(0, r);
        ctx.stroke();
      }
      ctx.restore();
      C.drawOver(ctx, cell, u, inkText);
      ctx.restore();
    });

    /* вырезки: на фото на месте кусочка видна бумага, сам кусочек лежит в другом месте */
    const base = geo.cells[0];
    const source = slots[0] && slots[0].src ? drawPhoto(s, [slots[0]], base.w, base.h, 'cell0') : null;
    geo.holes.forEach((r) => {
      ctx.drawImage(paper, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    });
    geo.pieces.forEach((p) => {
      ctx.save();
      if (p.border) {
        ctx.fillStyle = p.border;
        const b = Math.max(1.5, 2.5 * u);
        ctx.fillRect(p.x - b, p.y - b, p.w + b * 2, p.h + b * 2);
      }
      if (source) {
        const f = p.from;
        ctx.drawImage(source, f.x, f.y, f.w, f.h, p.x, p.y, p.w, p.h);
      }
      ctx.restore();
    });
    /* текст фраз: слова, скобки и номера */
    geo.items.forEach((it) => {
      ctx.font = `${it.weight} ${it.size}px ${it.css}`;
      ctx.fillStyle = it.color;
      ctx.textAlign = it.align || 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.s, it.x, it.y);
    });

    const font = FONTS.find((f) => f.id === s.note.font) || FONTS[0];
    if (geo.tpl.overlay) {
      ctx.save();
      geo.tpl.overlay(ctx, geo, u, { ...opt, font: font.css });
      ctx.restore();
    }
    if (geo.note) drawNote(ctx, s, { note: geo.note }, W, H);
  }

  function renderCard(ctx, s, slots, assets = {}) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const L = layout(s, W, H);
    const u = Math.min(W, H) / 1080;

    const paper = drawPaper(s.paper === 'own' ? 'smooth' : s.paper, s.paperColor, W, H);
    ctx.drawImage(paper, 0, 0);
    if (s.paper === 'own' && assets.bg) drawCover(ctx, assets.bg, assets.bg.naturalWidth, assets.bg.naturalHeight, W, H);
    if (s.collage && window.Collages.byId(s.collage)) {
      renderCollage(ctx, s, slots, W, H, u, paper);
      drawLayers(ctx, s, assets, W, H);
      return;
    }

    const frame = L.photo || L.pieces;
    const dual = slots.length === 2 && L.photo && L.pieces;
    const main = drawPhoto(s, dual ? [slots[0]] : slots, frame.w, frame.h, 'main');
    const second = dual ? drawPhoto(s, [slots[1]], frame.w, frame.h, 'second') : main;
    const mask = drawMask(s, Math.round(frame.w), Math.round(frame.h), assets);

    const withShadow = (draw) => {
      ctx.save();
      if (s.effect === 'shadow') {
        ctx.shadowColor = 'rgba(0,0,0,.5)';
        ctx.shadowBlur = 16 * u;
        ctx.shadowOffsetX = 5 * u;
        ctx.shadowOffsetY = 9 * u;
      }
      draw();
      ctx.restore();
    };

    if (L.pieces) {
      const a = L.pieces;
      if (s.ghost) {
        ctx.save();
        ctx.globalAlpha = s.ghost / 100;
        ctx.drawImage(second, a.x, a.y, a.w, a.h);
        ctx.restore();
      }
      const { c: cut, x } = buffer('cut', a.w, a.h);
      x.drawImage(second, 0, 0);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(mask, 0, 0, cut.width, cut.height);
      withShadow(() => ctx.drawImage(cut, a.x, a.y, a.w, a.h));
    }

    if (L.photo) {
      const a = L.photo;
      const { c: holed, x } = buffer('holes', a.w, a.h);
      x.drawImage(main, 0, 0);
      x.globalCompositeOperation = 'destination-out';
      x.drawImage(mask, 0, 0, holed.width, holed.height);
      withShadow(() => ctx.drawImage(holed, a.x, a.y, a.w, a.h));
    }

    drawNote(ctx, s, L, W, H);
    drawLayers(ctx, s, assets, W, H);
  }

  /* ---------- стикеры и текст поверх всей карточки ---------- */
  /* Слой хранит центр (x, y) в долях карточки, размер в долях короткой стороны и поворот в радианах.
     Стикер: emoji или своя картинка (img — номер в assets.stickers). Текст: строки, шрифт, цвет и фон. */
  const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  function layerFont(l) {
    return FONTS.find((f) => f.id === l.font) || FONTS[0];
  }
  /* Размер слоя без поворота: нужен и для отрисовки, и чтобы попасть в него пальцем. */
  function layerBox(ctx, l, assets, W, H) {
    const m = Math.min(W, H);
    const size = l.size * m;
    if (l.type === 'text') {
      const f = layerFont(l);
      ctx.font = `${f.weight} ${size}px ${f.css}`;
      const lines = String(l.text || '').split('\n');
      const w = Math.max(...lines.map((ln) => ctx.measureText(ln).width), size * 0.5);
      const pad = l.style === 'plaque' ? size * 0.35 : size * 0.1;
      return { w: w + pad * 2, h: lines.length * size * 1.2 + pad * 1.2, size, lines, pad };
    }
    const img = l.img && assets.stickers && assets.stickers[l.img];
    if (img) {
      const k = size / Math.max(img.width, img.height);
      return { w: img.width * k, h: img.height * k, size, img };
    }
    return { w: size, h: size, size };
  }
  /* эмодзи как картинка: нужна, чтобы обвести его контур */
  function emojiBitmap(emoji, size) {
    const c = canvas(size, size);
    const x = c.getContext('2d');
    x.font = `${size * 0.86}px ${EMOJI_FONT}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(emoji, size / 2, size / 2 + size * 0.04);
    return c;
  }
  /* Наклейка: картинку рисуем по кругу со сдвигом, перекрашенную в белый, — получается обводка по контуру;
     сверху сама картинка и мягкий блик в верхней части. Результат кешируем: жесты перерисовывают его часто. */
  const dieCache = lruCache(16);
  function dieCut(art, w, h, stroke, key) {
    return dieCache(key, () => {
      const pad = Math.ceil(stroke + 2);
      const c = canvas(w + pad * 2, h + pad * 2);
      const x = c.getContext('2d');
      const steps = 24;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        x.drawImage(art, pad + Math.cos(a) * stroke, pad + Math.sin(a) * stroke, w, h);
      }
      x.drawImage(art, pad, pad, w, h);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'source-over';
      x.drawImage(art, pad, pad, w, h);
      /* блик: светлая полоса сверху, только по форме наклейки */
      const g = x.createLinearGradient(0, 0, c.width * 0.35, c.height);
      g.addColorStop(0, 'rgba(255,255,255,.38)');
      g.addColorStop(0.32, 'rgba(255,255,255,.1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = g;
      x.fillRect(0, 0, c.width, c.height);
      return c;
    });
  }

  function drawLayers(ctx, s, assets, W, H) {
    (s.layers || []).forEach((l) => {
      const b = layerBox(ctx, l, assets, W, H);
      ctx.save();
      ctx.translate(l.x * W, l.y * H);
      ctx.rotate(l.rot || 0);
      if (l.flip) ctx.scale(-1, 1);
      if (l.type === 'text') {
        const f = layerFont(l);
        if (l.style === 'plaque') {
          ctx.fillStyle = l.bg || '#ffffff';
          ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        }
        ctx.font = `${f.weight} ${b.size}px ${f.css}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        b.lines.forEach((ln, i) => {
          const y = (i - (b.lines.length - 1) / 2) * b.size * 1.2;
          if (l.style === 'outline') {
            ctx.strokeStyle = l.bg || '#ffffff';
            ctx.lineWidth = b.size * 0.16;
            ctx.strokeText(ln, 0, y);
          }
          ctx.fillStyle = l.color || '#111111';
          ctx.fillText(ln, 0, y);
        });
      } else if (l.die) {
        /* эффект наклейки: белая обводка по контуру, блик сверху и тень под всей наклейкой */
        const art = b.img || emojiBitmap(l.emoji, b.size);
        const bmp = dieCut(art, b.w, b.h, (l.dieW ?? 0.05) * b.size, `${l.img || l.emoji}|${Math.round(b.w)}|${Math.round(b.h)}|${l.dieW ?? 0.05}`);
        ctx.shadowColor = 'rgba(0,0,0,.32)';
        ctx.shadowBlur = b.size * 0.05;
        ctx.shadowOffsetY = b.size * 0.03;
        ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
      } else if (b.img) {
        /* своя картинка: мягкая тень, как у наклейки */
        ctx.shadowColor = 'rgba(0,0,0,.28)';
        ctx.shadowBlur = b.size * 0.04;
        ctx.shadowOffsetY = b.size * 0.02;
        ctx.drawImage(b.img, -b.w / 2, -b.h / 2, b.w, b.h);
      } else if (l.emoji) {
        ctx.shadowColor = 'rgba(0,0,0,.22)';
        ctx.shadowBlur = b.size * 0.05;
        ctx.shadowOffsetY = b.size * 0.025;
        ctx.font = `${b.size * 0.86}px ${EMOJI_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(l.emoji, 0, b.size * 0.04);
      }
      ctx.restore();
    });
  }

  /* Пример для первого экрана: ночной пейзаж, нарисованный кодом, чтобы эффект был виден до загрузки фото. */
  function sampleScene() {
    const c = canvas(1200, 1500);
    const x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, 1500);
    [[0, '#0d1a2e'], [0.35, '#2a4fa0'], [0.6, '#6b4bd6'], [0.8, '#c9b3ff']].forEach(([p, col]) => sky.addColorStop(p, col));
    x.fillStyle = sky;
    x.fillRect(0, 0, 1200, 1500);
    const rng = makeRng(9);
    x.fillStyle = '#ffe9b0';
    for (let i = 0; i < 170; i++) {
      x.beginPath();
      x.arc(rng() * 1200, rng() * 950, rng.range(1.5, 5), 0, 7);
      x.fill();
    }
    [['#3a1a5e', 960, 90], ['#1e0d2e', 1100, 130], ['#0a0a0a', 1270, 150]].forEach(([col, base, amp]) => {
      x.fillStyle = col;
      x.beginPath();
      x.moveTo(0, 1500);
      const ph = rng() * 6;
      for (let px = 0; px <= 1200; px += 20) {
        x.lineTo(px, base + Math.sin(px / 170 + ph) * amp * 0.6 + Math.sin(px / 61 + ph * 2) * amp * 0.2);
      }
      x.lineTo(1200, 1500);
      x.fill();
    });
    return c;
  }

  window.Render = {
    RATIOS, PAPERS, FONTS, canvas, layout, slotFrame, coverGeom, paintPaper, renderCard, sampleScene, luminance, drawCover, layerBox,
    clearMasks: () => maskCache.clear(),
  };
})();
