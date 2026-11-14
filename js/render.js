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
  /* карусель Instagram: N слайдов в ряд на одной широкой карточке, при сохранении она режется на слайды */
  for (let n = 2; n <= 10; n++) {
    RATIOS[`${n}×4:5`] = [1080 * n, 1350];
    RATIOS[`${n}×1:1`] = [1080 * n, 1080];
  }

  const PAPERS = [
    { id: 'smooth', name: 'Гладкая' },
    { id: 'lace', name: 'Кружево' },
    { id: 'tablecloth', name: 'Скатерть' },
    { id: 'fold4', name: 'Сложенный лист' },
    { id: 'fold8', name: 'Сложенный плакат' },
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

  /* Лист, сложенный и снова развёрнутый: каждая панель чуть по-своему наклонена к свету,
     по сгибам тонкая тень с одной стороны и светлая грань с другой, сверху редкие волокна. */
  function foldedSheet(x, w, h, u, rng, cols, rows) {
    const xs = [0, ...cols.map((c) => c * w), w];
    const ys = [0, ...rows.map((r) => r * h), h];
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < ys.length - 1; j++) {
        const x0 = xs[i]; const x1 = xs[i + 1]; const y0 = ys[j]; const y1 = ys[j + 1];
        const flip = (i + j) % 2;
        const g = x.createLinearGradient(flip ? x1 : x0, y0, flip ? x0 : x1, y1);
        g.addColorStop(0, `rgba(255,255,255,${rng.range(0.05, 0.12)})`);
        g.addColorStop(1, `rgba(0,0,0,${rng.range(0.03, 0.07)})`);
        x.fillStyle = g;
        x.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    const crease = (ax, ay, bx, by, nx, ny) => {
      [[18, 0.05], [7, 0.08], [2, 0.16]].forEach(([wd, a]) => {
        x.strokeStyle = `rgba(0,0,0,${a})`;
        x.lineWidth = wd * u;
        x.beginPath();
        x.moveTo(ax + nx * wd * 0.5 * u, ay + ny * wd * 0.5 * u);
        x.lineTo(bx + nx * wd * 0.5 * u, by + ny * wd * 0.5 * u);
        x.stroke();
      });
      x.strokeStyle = 'rgba(255,255,255,.85)';
      x.lineWidth = 2.2 * u;
      x.beginPath();
      x.moveTo(ax - nx * 1.6 * u, ay - ny * 1.6 * u);
      x.lineTo(bx - nx * 1.6 * u, by - ny * 1.6 * u);
      x.stroke();
    };
    cols.forEach((c) => crease(c * w, 0, c * w, h, 1, 0));
    rows.forEach((r) => crease(0, r * h, w, r * h, 0, 1));
    /* волокна и мелкие пятнышки бумаги */
    x.lineWidth = 1 * u;
    for (let i = 0; i < 1400; i++) {
      const cx = rng() * w;
      const cy = rng() * h;
      const a = rng() * 6.28;
      const l = rng.range(3, 14) * u;
      x.strokeStyle = `rgba(0,0,0,${rng.range(0.015, 0.05)})`;
      x.beginPath();
      x.moveTo(cx, cy);
      x.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
      x.stroke();
    }
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
      } else if (type === 'fold4' || type === 'fold8') {
        foldedSheet(x, w, h, u, rng, type === 'fold8' ? [0.5] : [0.5], type === 'fold8' ? [0.25, 0.5, 0.75] : [0.5]);
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
    const key = [s.motif, s.seed, s.size, s.density, s.word, s.wordFont, assets.maskId, JSON.stringify(s.pieces), w, h].join('|');
    return maskCache(key, () => {
      const c = canvas(w, h);
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      byId(s.motif).draw(x, c.width, c.height, makeRng(s.seed), {
        size: s.size, density: s.density, text: s.word, font: s.wordFont, image: assets.mask, pieces: s.pieces,
      });
      return c;
    });
  }

  /* ---------- кусочки вразброс ---------- */
  /* Кусочки фигуры находим как отдельные пятна на маске (в уменьшенном виде, это быстро) и делим на несколько групп.
     Каждая группа берёт снимок со своим случайным сдвигом, снимок при этом повторяется плиткой,
     поэтому в каждом кусочке оказывается другая часть фото. Разметку групп кешируем по маске. */
  const SCATTER_GROUPS = 7;
  const scatterCache = new WeakMap();
  function scatterGroups(mask) {
    if (scatterCache.has(mask)) return scatterCache.get(mask);
    const k = Math.min(1, 360 / Math.max(mask.width, mask.height));
    const lw = Math.max(1, Math.round(mask.width * k));
    const lh = Math.max(1, Math.round(mask.height * k));
    const low = canvas(lw, lh);
    const lx = low.getContext('2d', { willReadFrequently: true });
    lx.drawImage(mask, 0, 0, lw, lh);
    const a = lx.getImageData(0, 0, lw, lh).data;
    const label = new Int32Array(lw * lh);
    let next = 0;
    const stack = [];
    for (let p = 0; p < lw * lh; p++) {
      if (label[p] || a[p * 4 + 3] < 30) continue;
      next += 1;
      label[p] = next;
      stack.push(p);
      while (stack.length) {
        const q = stack.pop();
        const qx = q % lw;
        for (const n of [qx > 0 ? q - 1 : -1, qx < lw - 1 ? q + 1 : -1, q >= lw ? q - lw : -1, q < lw * (lh - 1) ? q + lw : -1]) {
          if (n >= 0 && !label[n] && a[n * 4 + 3] >= 30) { label[n] = next; stack.push(n); }
        }
      }
    }
    /* маска каждой группы: пятна с номером по кругу; края потом всё равно режет точная маска фигуры */
    const groups = [];
    for (let g = 0; g < SCATTER_GROUPS; g++) {
      const gc = canvas(lw, lh);
      const gx = gc.getContext('2d');
      const img = gx.createImageData(lw, lh);
      for (let p = 0; p < lw * lh; p++) {
        const l = label[p];
        if (l && (l * 2654435761 >>> 0) % SCATTER_GROUPS === g) img.data[p * 4 + 3] = 255;
      }
      gx.putImageData(img, 0, 0);
      /* чуть расширяем, чтобы полупрозрачный край кусочка тоже получил свою часть снимка */
      const up = canvas(mask.width, mask.height);
      const ux = up.getContext('2d');
      const pad = Math.ceil(1 / k);
      [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]].forEach(([dx, dy]) => ux.drawImage(gc, dx, dy, mask.width, mask.height));
      groups.push(up);
    }
    scatterCache.set(mask, groups);
    return groups;
  }
  function scatterContent(photo, mask, seed) {
    const groups = scatterGroups(mask);
    const w = mask.width;
    const h = mask.height;
    const out = buffer('scatter', w, h);
    const tmp = buffer('scatter-tmp', w, h);
    const pattern = out.x.createPattern(photo, 'repeat');
    const rng = makeRng(seed * 31 + 3);
    groups.forEach((gm) => {
      /* сдвиг не меньше четверти снимка, чтобы кусочек точно показал другое место */
      const dx = (0.25 + rng() * 0.5) * w * (rng() < 0.5 ? -1 : 1);
      const dy = (0.25 + rng() * 0.5) * h * (rng() < 0.5 ? -1 : 1);
      tmp.x.globalCompositeOperation = 'source-over';
      tmp.x.clearRect(0, 0, w, h);
      tmp.x.drawImage(gm, 0, 0);
      tmp.x.globalCompositeOperation = 'source-in';
      tmp.x.save();
      tmp.x.translate(dx, dy);
      tmp.x.scale(w / photo.width, h / photo.height);
      tmp.x.fillStyle = pattern;
      tmp.x.fillRect(-dx * photo.width / w, -dy * photo.height / h, photo.width, photo.height);
      tmp.x.restore();
      out.x.drawImage(tmp.c, 0, 0);
    });
    return out.c;
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
    /* наклон: окно, повёрнутое на угол, должно целиком лежать на снимке */
    const a = Math.abs(((slot.tilt || 0) * Math.PI) / 180);
    const bw = rect.w * Math.cos(a) + rect.h * Math.sin(a);
    const bh = rect.w * Math.sin(a) + rect.h * Math.cos(a);
    const k = Math.max(bw / (sideways ? sh : sw), bh / (sideways ? sw : sh)) * slot.zoom;
    return {
      dw: sw * k,
      dh: sh * k,
      cx: rect.x + rect.w / 2 + (slot.flip ? -slot.x : slot.x) * rect.w,
      cy: rect.y + rect.h / 2 + slot.y * rect.h,
    };
  }

  /* ---------- цветокоррекция по пикселям: ctx.filter не работает в Safari ---------- */
  /* ---------- цвет фото ----------
     b яркость, c контраст, s насыщенность, w теплота, t оттенок (плюс к пурпуру, минус к зелени),
     sh тени, hl света, f выцветание (поднятые чёрные), v виньетка (плюс темнее к краям, минус светлее),
     k резкость (плюс резче, минус мягче), tsC/tsA тонировка теней цветом и силой, thC/thA то же для светов.
     gl свечение (размытая копия в «Экране»), glR его радиус, glN шум в свечении, cl чёткость (цветовой контраст
     в «Мягком свете»), ca сдвиг красного канала, kR и kT радиус и порог резкости, stC/stA тонировка мягким светом.
     lut/lutA цветовая таблица шаблона и её сила, lkA/lkC/lkS засветка (сила, цвет, край),
     spA/spT/spS/spC блёстки (сколько, вид, размер, цвет), fl вспышка, ds/dsD/dsC дата в углу (вид, дата, цвет).
     g зерно рисуется отдельно. Поля, которых нет в старом черновике, считаются нулём. */
  const ADJ_KEYS = ['b', 'c', 's', 'w', 't', 'sh', 'hl', 'f', 'v', 'k', 'tsA', 'thA', 'gl', 'cl', 'ca', 'stA', 'lut', 'lkA', 'spA', 'fl', 'ds'];
  function neutral(a) { return ADJ_KEYS.every((key) => !a[key]); }
  const hexRgb = (hex) => {
    const n = parseInt(String(hex || '#808080').replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  /* сила виньетки по месту пикселя: 0 в середине, 1 в углах; карта одна на размер */
  const vigCache = lruCache(3);
  function vignetteMap(w, h) {
    return vigCache(`${w}x${h}`, () => {
      const m = new Float32Array(w * h);
      const cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const d = Math.hypot(x - cx, y - cy) / R;
          const t = Math.min(1, Math.max(0, (d - 0.38) / 0.62));
          m[y * w + x] = t * t * (3 - 2 * t);
        }
      }
      return m;
    });
  }
  /* цветовая таблица шаблона из js/luts.js: раскодируем один раз */
  const LUT_N = 17;
  const lutCache = new Map();
  /* Таблицы лежат по файлам в luts/ и подгружаются, только когда шаблон выбран. Пока файл едет,
     фото рисуется без таблицы, а когда приехал, готовые снимки сбрасываются и карточка перерисовывается.
     Свои таблицы из .cube регистрируются прямо из памяти. */
  const lutData = {};
  const lutWait = new Map();
  let lutListener = null;
  function loadLut(id) {
    if (!id) return Promise.resolve(null);
    if (lutData[id]) return Promise.resolve(lutTable(id));
    if (!lutWait.has(id)) {
      lutWait.set(id, fetch(`luts/${encodeURIComponent(id)}.txt`)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .then((text) => {
          lutData[id] = text.trim();
          photoMemo.clear();
          if (lutListener) lutListener(id);
          return lutTable(id);
        })
        .catch(() => {
          lutWait.delete(id);
          return null;
        }));
    }
    return lutWait.get(id);
  }
  function registerLut(id, b64) {
    lutData[id] = b64;
    lutCache.delete(id);
    photoMemo.clear();
  }
  function lutTable(id) {
    if (!id) return null;
    if (lutCache.has(id)) return lutCache.get(id);
    const src = lutData[id];
    if (!src) {
      loadLut(id);
      return null;
    }
    const bin = atob(src);
    const t = new Float32Array(bin.length);
    for (let i = 0; i < bin.length; i++) t[i] = bin.charCodeAt(i);
    lutCache.set(id, t);
    return t;
  }
  /* Засветка: цветное пятно света от края кадра в режиме «Экран», как плёночный блик. */
  const LEAK_SPOTS = {
    right: [1.04, 0.42], left: [-0.04, 0.42], top: [0.5, -0.06], bottom: [0.5, 1.06], tr: [1, 0], tl: [0, 0], br: [1, 1], bl: [0, 1],
  };
  function drawLeak(ctx, w, h, a) {
    const [fx, fy] = LEAK_SPOTS[a.lkS] || LEAK_SPOTS.right;
    const [r, g, b] = hexRgb(a.lkC || '#ff9a2e');
    const k = Math.min(1, (Number(a.lkA) || 0) / 100);
    /* пятно держится у своего края и к середине кадра почти гаснет */
    const R = Math.max(w, h) * 0.52;
    const grad = ctx.createRadialGradient(fx * w, fy * h, 0, fx * w, fy * h, R);
    grad.addColorStop(0, `rgba(${r},${g},${b},${0.95 * k})`);
    grad.addColorStop(0.3, `rgba(${r},${g},${b},${0.5 * k})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  /* Блёстки поверх фото. Вид (spT), размер (spS, множитель) и цвет (spC); раскладка всегда одна и та же.
     rays: искры с лучами, как в BlueBlue; glitter: мелкая переливчатая пыль; twinkle: звёздочки ✦;
     stars: пятиконечные звёзды; hearts: сердечки; bokeh: мягкие круги света, как огни не в фокусе. */
  /* Вспышка мыльницы: свет бьёт в лоб, середина кадра светлее и контрастнее,
     к краям свет падает в темноту, самые яркие места выгорают в белое и чуть холодят. */
  function drawFlash(ctx, w, h, a) {
    const amt = Math.min(100, Math.max(0, Number(a.fl) || 0)) / 100;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const cx = w / 2, cy = h * 0.42;
    const R2 = (w / 2) ** 2 + (h * 0.58) ** 2;
    const con = 1 + amt * 0.25;
    /* мягкое плечо: яркое подходит к белому плавно, лицо не превращается в пятно */
    const knee = (v) => (v <= 200 ? v : 200 + (v - 200) / (1 + (v - 200) / 55));
    for (let y = 0; y < h; y++) {
      const dy2 = (y - cy) ** 2;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const fall = 1 / (1 + (((x - cx) ** 2 + dy2) / R2) * 2.4);
        const lit = 1 + amt * (fall * 0.55 - 0.32);
        let r = knee((d[i] * lit - 128) * con + 128 + amt * 10 * fall);
        let g = knee((d[i + 1] * lit - 128) * con + 128 + amt * 10 * fall);
        let b = knee((d[i + 2] * lit - 128) * con + 128 + amt * 15 * fall);
        const l = r * 0.3 + g * 0.59 + b * 0.11;
        if (l > 215) {
          const k = Math.min(1, ((l - 215) / 40) * amt * 0.6);
          r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k;
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /* Дата в углу, как печатала цифровая мыльница: оранжевые цифры со свечением, чуть наклонные.
     ds: вид ('digi' '26 11 12, 'dots' 12.11.2026, 'en' NOV 12 '26), dsD: дата (пусто значит сегодня), dsC: цвет. */
  const STAMP_TYPES = ['digi', 'dots', 'en'];
  function stampText(a) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a.dsD || '');
    const now = new Date();
    const Y = m ? m[1] : String(now.getFullYear());
    const M = m ? m[2] : String(now.getMonth() + 1).padStart(2, '0');
    const D = m ? m[3] : String(now.getDate()).padStart(2, '0');
    if (a.ds === 'dots') return `${D}.${M}.${Y}`;
    if (a.ds === 'en') return `${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][Number(M) - 1] || 'JAN'} ${Number(D)} '${Y.slice(2)}`;
    return `'${Y.slice(2)} ${M} ${D}`;
  }
  function drawStamp(ctx, w, h, a) {
    const m = Math.max(w, h);
    const size = Math.max(7, m * 0.036);
    const [r, g, b] = hexRgb(a.dsC || '#ff8a1f');
    const text = stampText(a);
    ctx.save();
    ctx.font = `bold ${size}px "Courier New", ui-monospace, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    const pad = m * 0.045;
    ctx.translate(w - pad, h - pad);
    ctx.transform(1, 0, -0.12, 1, 0, 0);
    ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
    ctx.shadowBlur = size * 0.45;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillText(text, 0, 0);
    /* светлая сердцевина цифр, как у светодиодов */
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = `rgb(${(r + 255) >> 1},${(g + 230) >> 1},${(b + 180) >> 1})`;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  let sparkClock = null;
  const SPARKLE_TYPES = ['rays', 'glitter', 'twinkle', 'stars', 'hearts', 'bokeh'];
  function drawSparkles(ctx, w, h, a) {
    const amount = Number(a.spA) || 0;
    const type = SPARKLE_TYPES.includes(a.spT) ? a.spT : 'rays';
    const size = Math.min(4, Math.max(0.1, Number(a.spS) || 1));
    const [cr, cg, cb] = hexRgb(a.spC || '#ffffff');
    const col = (alpha, mix = 0) => {
      /* mix: насколько оттенок уходит к белому в середине искры */
      const r = cr + (255 - cr) * mix, g = cg + (255 - cg) * mix, b = cb + (255 - cb) * mix;
      return `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
    };
    const m = Math.max(w, h);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const k = amount / 100;
    /* в видео каждая блёстка мерцает в своём ритме; на снимке горит ровно */
    const blink = (i) => (sparkClock == null ? 1 : 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(sparkClock * (2.2 + (i % 7) * 0.45) + i * 2.399)));
    const glow = (x, y, r, alpha) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col(alpha, 0.7));
      g.addColorStop(0.3, col(alpha * 0.45, 0.2));
      g.addColorStop(1, col(0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const starPath = (x, y, r, points, inner, rot) => {
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const rr = i % 2 ? r * inner : r;
        const ang = rot + (i * Math.PI) / points - Math.PI / 2;
        ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
      }
      ctx.closePath();
    };
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    if (type === 'glitter') {
      /* много мелких точек, часть переливается соседними оттенками */
      const n = Math.round(k * 900);
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = blink(i);
        const x = rnd() * w, y = rnd() * h;
        /* не тоньше полупикселя, иначе самая мелкая пыль пропадает совсем */
        const r = Math.max(0.5, m * 0.0026 * size * (0.4 + rnd() * 1.2));
        const hue = rnd();
        ctx.fillStyle = hue < 0.55 ? col(0.55 + rnd() * 0.45, 0.4) : `hsla(${(hue * 720) % 360},90%,85%,${0.5 + rnd() * 0.4})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (rnd() < 0.1) glow(x, y, r * 7, 0.8);
      }
    } else if (type === 'bokeh') {
      /* мягкие круги света с более светлой кромкой */
      const n = Math.round(k * 40);
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = blink(i);
        const x = rnd() * w, y = rnd() * h;
        const r = m * (0.02 + rnd() * 0.05) * size;
        const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
        const al = 0.18 + rnd() * 0.25;
        g.addColorStop(0, col(al * 0.6, 0.3));
        g.addColorStop(0.85, col(al, 0.2));
        g.addColorStop(1, col(0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const n = Math.round(k * (type === 'rays' ? 70 : 45));
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = blink(i);
        const x = rnd() * w, y = rnd() * h;
        const big = rnd() < (type === 'rays' ? 0.18 : 0.35);
        const s = m * size * (big ? 0.02 + rnd() * 0.035 : 0.006 + rnd() * 0.012);
        glow(x, y, s * (type === 'rays' ? 0.9 : 1.6), type === 'rays' ? 0.95 : 0.6);
        if (type === 'rays') {
          if (!big) continue;
          /* лучи крестом: длинные по вертикали и горизонтали, короткие по диагонали */
          ctx.strokeStyle = col(0.85, 0.6);
          ctx.lineCap = 'round';
          [[1, 0, 1], [0, 1, 1], [0.7, 0.7, 0.4], [0.7, -0.7, 0.4]].forEach(([dx, dy, len]) => {
            ctx.lineWidth = Math.max(1, m * 0.0016 * len * size);
            ctx.beginPath();
            ctx.moveTo(x - dx * s * 2.2 * len, y - dy * s * 2.2 * len);
            ctx.lineTo(x + dx * s * 2.2 * len, y + dy * s * 2.2 * len);
            ctx.stroke();
          });
          continue;
        }
        ctx.fillStyle = col(0.95, 0.55);
        if (type === 'twinkle') starPath(x, y, s, 4, 0.22, 0);
        else if (type === 'stars') starPath(x, y, s * 0.9, 5, 0.45, rnd() * 0.6 - 0.3);
        else {
          /* сердечко из двух дуг и острого низа */
          const r = s * 0.55;
          const rot = (rnd() - 0.5) * 0.6;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rot);
          ctx.beginPath();
          ctx.moveTo(0, r * 1.3);
          ctx.bezierCurveTo(-r * 2.1, -r * 0.1, -r * 1.1, -r * 1.7, 0, -r * 0.6);
          ctx.bezierCurveTo(r * 1.1, -r * 1.7, r * 2.1, -r * 0.1, 0, r * 1.3);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          continue;
        }
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* Размытие RGB тремя проходами скользящего среднего: почти как по Гауссу, время не зависит от радиуса.
     Своё, а не ctx.filter: в Safari фильтров холста нет, а картинка должна выходить одинаковой везде. */
  function blurRGB(src, w, h, radius) {
    const out = new Float32Array(w * h * 3);
    for (let i = 0, j = 0; i < src.length; i += 4, j += 3) { out[j] = src[i]; out[j + 1] = src[i + 1]; out[j + 2] = src[i + 2]; }
    if (radius < 0.5) return out;
    /* три прохода коробкой шириной 2r+1 дают размытие с сигмой около r, как радиус в Фотошопе */
    const r = Math.max(1, Math.round(radius));
    const tmp = new Float32Array(out.length);
    const pass = (a, b, len, lines, step, lineStep) => {
      const inv = 1 / (r * 2 + 1);
      for (let line = 0; line < lines; line++) {
        const base = line * lineStep;
        for (let c = 0; c < 3; c++) {
          let acc = 0;
          for (let k = -r; k <= r; k++) acc += a[base + Math.min(len - 1, Math.max(0, k)) * step + c];
          for (let x = 0; x < len; x++) {
            b[base + x * step + c] = acc * inv;
            const add = Math.min(len - 1, x + r + 1);
            const sub = Math.max(0, x - r);
            acc += a[base + add * step + c] - a[base + sub * step + c];
          }
        }
      }
    };
    for (let n = 0; n < 3; n++) {
      pass(out, tmp, w, h, 3, w * 3);
      pass(tmp, out, h, w, w * 3, 3);
    }
    return out;
  }
  /* кривая по точкам, как в «Кривых» Фотошопа: плавная, через все точки */
  function curveLut(points) {
    const lut = new Float32Array(256);
    const p = points;
    for (let i = 0; i < 256; i++) {
      let k = 0;
      while (k < p.length - 2 && i > p[k + 1][0]) k++;
      const [x0, y0] = p[k];
      const [x1, y1] = p[k + 1];
      const tt = (i - x0) / Math.max(1, x1 - x0);
      const s = tt * tt * (3 - 2 * tt);
      lut[i] = y0 + (y1 - y0) * (tt * 0.5 + s * 0.5);
    }
    return lut;
  }
  /* мягкий свет, как в Фотошопе: b основа, s слой, 0…1 */
  const softLight = (b, s) => (s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b));

  function applyAdjust(ctx, w, h, a) {
    const num = (key) => Number(a[key]) || 0;
    /* пиксели экшенов Фотошопа даны для снимка около 3000 px по длинной стороне */
    const scale = Math.max(w, h) / 3000;
    /* мягкость: размытие до попиксельной работы */
    if (num('k') < 0) {
      const im = ctx.getImageData(0, 0, w, h);
      const bl = blurRGB(im.data, w, h, (-num('k') / 100) * Math.max(w, h) * 0.004);
      for (let i = 0, j = 0; i < im.data.length; i += 4, j += 3) { im.data[i] = bl[j]; im.data[i + 1] = bl[j + 1]; im.data[i + 2] = bl[j + 2]; }
      ctx.putImageData(im, 0, 0);
    }
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    /* размытые копии исходника для свечения, чёткости и резкости */
    const gl = num('gl') / 100;
    const glow = gl ? blurRGB(d, w, h, (3 + num('glR') * 0.6) * scale) : null;
    /* кривая из экшена ложится на размытую копию */
    const glowLut = gl ? curveLut([[0, 0], [67, 62], [174, 192], [255, 240]]) : null;
    const glN = num('glN') / 100;
    const cl = num('cl') / 100;
    const clear = cl ? blurRGB(d, w, h, 3 * Math.max(scale, 0.34)) : null;
    const k = num('k') > 0 ? (num('k') / 100) * 2 : 0;
    const sharpBlur = k ? blurRGB(d, w, h, Math.max(0.6, (num('kR') || 8) / 10 * Math.max(scale, 0.5))) : null;
    const kT = num('kT');

    const contrast = 1 + num('c') / 100;
    const shift = num('b') * 1.1;
    const warm = num('w') * 0.35;
    const tint = num('t') * 0.3;
    const sat = 1 + num('s') / 100;
    const fade = (num('f') / 100) * 0.24;
    /* яркость, контраст, баланс белого и выцветание: таблица на каждый канал */
    const lut = (bias) => {
      const tb = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const v = (i - 128) * contrast + 128 + shift + bias;
        tb[i] = fade * 255 + v * (1 - fade);
      }
      return tb;
    };
    const lr = lut(warm + tint * 0.4);
    const lg = lut(-tint);
    const lb = lut(-warm + tint * 0.4);
    const sh = num('sh') * 0.55;
    const hl = num('hl') * 0.55;
    const [sr, sg, sb] = hexRgb(a.tsC || '#1f6f78');
    const [hr, hg, hb] = hexRgb(a.thC || '#ffb680');
    const ts = (num('tsA') / 100) * 0.55;
    const th = (num('thA') / 100) * 0.55;
    /* тонировка мягким светом: чёрно-белая копия, окрашенная цветом, поверх в режиме «Мягкий свет» */
    const st = num('stA') / 100;
    const [cr, cg, cb] = hexRgb(a.stC || '#e1d3b3');
    const cy = Math.max(1, 0.299 * cr + 0.587 * cg + 0.114 * cb);
    const vg = num('v') / 100;
    const vmap = vg ? vignetteMap(w, h) : null;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const L = lutTable(a.lut);
    const la = L ? Math.min(1, Math.max(0, (a.lutA ?? 100) / 100)) : 0;
    const N1 = LUT_N - 1;
    const toIdx = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
    for (let i = 0, j = 0, p = 0; i < d.length; i += 4, j += 3, p++) {
      const o0 = d[i], o1 = d[i + 1], o2 = d[i + 2];
      let i0 = o0, i1 = o1, i2 = o2;
      if (L) {
        /* цветовая таблица: трилинейно между восемью узлами */
        const x = (o0 / 255) * N1, y = (o1 / 255) * N1, z = (o2 / 255) * N1;
        const xi = x >= N1 ? N1 - 1 : x | 0, yi = y >= N1 ? N1 - 1 : y | 0, zi = z >= N1 ? N1 - 1 : z | 0;
        const fx = x - xi, fy = y - yi, fz = z - zi;
        const at = (a1, b1, c1) => ((a1 * LUT_N + b1) * LUT_N + c1) * 3;
        const c000 = at(xi, yi, zi), c001 = at(xi, yi, zi + 1), c010 = at(xi, yi + 1, zi), c011 = at(xi, yi + 1, zi + 1);
        const c100 = at(xi + 1, yi, zi), c101 = at(xi + 1, yi, zi + 1), c110 = at(xi + 1, yi + 1, zi), c111 = at(xi + 1, yi + 1, zi + 1);
        for (let c = 0; c < 3; c++) {
          const v = ((L[c000 + c] * (1 - fz) + L[c001 + c] * fz) * (1 - fy) + (L[c010 + c] * (1 - fz) + L[c011 + c] * fz) * fy) * (1 - fx)
            + ((L[c100 + c] * (1 - fz) + L[c101 + c] * fz) * (1 - fy) + (L[c110 + c] * (1 - fz) + L[c111 + c] * fz) * fy) * fx;
          if (c === 0) i0 = o0 + (v - o0) * la;
          else if (c === 1) i1 = o1 + (v - o1) * la;
          else i2 = o2 + (v - o2) * la;
        }
      }
      let r = lr[toIdx(i0)];
      let g = lg[toIdx(i1)];
      let b = lb[toIdx(i2)];
      /* чёткость: цветовой контраст (исходник минус размытие) поверх в «Мягком свете» */
      if (clear) {
        r = 255 * (softLight(r / 255, Math.min(1, Math.max(0, (o0 - clear[j]) / 255 + 0.5))) * cl + (r / 255) * (1 - cl));
        g = 255 * (softLight(g / 255, Math.min(1, Math.max(0, (o1 - clear[j + 1]) / 255 + 0.5))) * cl + (g / 255) * (1 - cl));
        b = 255 * (softLight(b / 255, Math.min(1, Math.max(0, (o2 - clear[j + 2]) / 255 + 0.5))) * cl + (b / 255) * (1 - cl));
      }
      let y = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
      y = y < 0 ? 0 : y > 1 ? 1 : y;
      /* тени и света: подъём тёмного и приглушение светлого */
      if (sh || hl) {
        const add = sh * (1 - y) * (1 - y) + hl * y * y;
        r += add; g += add; b += add;
      }
      /* тонировка: тени тянутся к своему цвету, света к своему */
      if (ts) {
        const q = ts * (1 - y) * (1 - y);
        r += (sr - 128) * q; g += (sg - 128) * q; b += (sb - 128) * q;
      }
      if (th) {
        const q = th * y * y;
        r += (hr - 128) * q; g += (hg - 128) * q; b += (hb - 128) * q;
      }
      const yy = 0.3 * r + 0.59 * g + 0.11 * b;
      r = yy + (r - yy) * sat;
      g = yy + (g - yy) * sat;
      b = yy + (b - yy) * sat;
      if (st) {
        const l = Math.min(1, Math.max(0, yy / 255));
        r = 255 * ((1 - st) * (r / 255) + st * softLight(Math.min(1, Math.max(0, r / 255)), Math.min(1, (l * cr) / cy)));
        g = 255 * ((1 - st) * (g / 255) + st * softLight(Math.min(1, Math.max(0, g / 255)), Math.min(1, (l * cg) / cy)));
        b = 255 * ((1 - st) * (b / 255) + st * softLight(Math.min(1, Math.max(0, b / 255)), Math.min(1, (l * cb) / cy)));
      }
      /* свечение: размытая копия с кривой, поверх в режиме «Экран» */
      if (glow) {
        const n = glN ? (rnd() - 0.5) * glN * 255 * 3.5 : 0;
        const g0 = glowLut[Math.min(255, Math.max(0, glow[j] + n) | 0)] / 255;
        const g1 = glowLut[Math.min(255, Math.max(0, glow[j + 1] + n) | 0)] / 255;
        const g2 = glowLut[Math.min(255, Math.max(0, glow[j + 2] + n) | 0)] / 255;
        /* «Экран», потом уровни с гаммой 0,7 на весь результат: экшен так возвращает кадру плотность */
        const s0 = Math.pow(1 - (1 - Math.min(1, Math.max(0, r / 255))) * (1 - g0), 1 / 0.7);
        const s1 = Math.pow(1 - (1 - Math.min(1, Math.max(0, g / 255))) * (1 - g1), 1 / 0.7);
        const s2 = Math.pow(1 - (1 - Math.min(1, Math.max(0, b / 255))) * (1 - g2), 1 / 0.7);
        r += (255 * s0 - r) * gl;
        g += (255 * s1 - g) * gl;
        b += (255 * s2 - b) * gl;
      }
      /* резкость: нерезкая маска с радиусом и порогом, как «Контурная резкость» */
      if (sharpBlur) {
        const e0 = o0 - sharpBlur[j], e1 = o1 - sharpBlur[j + 1], e2 = o2 - sharpBlur[j + 2];
        if (Math.abs(e0) + Math.abs(e1) + Math.abs(e2) > kT * 3) {
          r += e0 * k; g += e1 * k; b += e2 * k;
        }
      }
      if (vmap) {
        const m = vmap[p] * Math.abs(vg) * 0.85;
        if (vg > 0) { r *= 1 - m; g *= 1 - m; b *= 1 - m; }
        else { r += (255 - r) * m; g += (255 - g) * m; b += (255 - b) * m; }
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    /* сдвиг каналов: красный уезжает вправо на ca пикселей (в долях, с плавным переходом) */
    const ca = num('ca') * scale;
    if (ca) {
      const whole = Math.floor(ca);
      const frac = ca - whole;
      const red = new Uint8ClampedArray(w * h);
      for (let p = 0, i = 0; p < red.length; p++, i += 4) red[p] = d[i];
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const x0 = Math.max(0, x - whole);
          const x1 = Math.max(0, x - whole - 1);
          d[(row + x) * 4] = red[row + x0] * (1 - frac) + red[row + x1] * frac;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    if (Number(a.fl)) drawFlash(ctx, w, h, a);
    if (Number(a.lkA)) drawLeak(ctx, w, h, a);
    if (Number(a.spA)) drawSparkles(ctx, w, h, a);
    if (STAMP_TYPES.includes(a.ds)) drawStamp(ctx, w, h, a);
  }

  /* Готовые шаблоны цвета. adjust: значения ползунков при силе 100%. */
  const LOOKS = [
    { id: 'film', name: 'Плёнка', adjust: { c: -8, f: 30, w: 8, t: 4, s: -12, tsC: '#2a6b6b', tsA: 30, thC: '#ffcf9e', thA: 22, g: 25 } },
    { id: 'flash', name: 'Вспышка', adjust: { fl: 70, s: -6, w: -4, v: 10, g: 18 } },
    { id: 'warm', name: 'Тёплый вечер', adjust: { w: 30, t: 6, s: 10, hl: -20, thC: '#ffb36b', thA: 28, v: 18 } },
    { id: 'cold', name: 'Холодное утро', adjust: { w: -28, t: -4, b: 6, s: -15, f: 12, tsC: '#3a5f9e', tsA: 28 } },
    { id: 'bw', name: 'Ч/б с зерном', adjust: { s: -100, c: 18, g: 40, v: 15 } },
    { id: 'faded', name: 'Выцветший', adjust: { f: 55, c: -18, s: -25, w: 6, hl: -10 } },
    { id: 'teal', name: 'Бирюза и персик', adjust: { c: 10, s: 5, tsC: '#16756f', tsA: 45, thC: '#ffb58a', thA: 32 } },
    { id: 'pink', name: 'Розовая дымка', adjust: { t: 18, w: 8, f: 25, hl: -15, s: -5, thC: '#ffb3d1', thA: 28 } },
    { id: 'greenFilm', name: 'Зелёная плёнка', adjust: { t: -14, w: -4, f: 28, s: -10, tsC: '#1d4a2f', tsA: 35, g: 30 } },
    { id: 'noir', name: 'Нуар', adjust: { s: -100, c: 40, b: -8, sh: -20, v: 40, k: 30 } },
    { id: 'dream', name: 'Мечта', adjust: { b: 8, c: -12, f: 20, k: -40, hl: -10, thC: '#ffe0f0', thA: 20, s: -8 } },
    /* по экшенам Фотошопа: Glow — Soft Lens Focus (Studio 2am), darkshadow-natura #1 и #2, diamond sharpen 2 */
    { id: 'glowNoise', name: 'Мягкое свечение', adjust: { gl: 100, glR: 40, glN: 7 } },
    { id: 'glowClean', name: 'Свечение чистое', adjust: { gl: 100, glR: 40 } },
    { id: 'glowSoft', name: 'Свечение слабее', adjust: { gl: 100, glR: 0 } },
    { id: 'natura1', name: 'Тёмная природа 1', adjust: { cl: 61, ca: 1, k: 24, kR: 8 } },
    { id: 'diamond', name: 'Алмазная резкость', adjust: { k: 90, kR: 6, kT: 6 } },
    { id: 'natura2', name: 'Тёмная природа 2', adjust: { g: 8, ca: 1, stC: '#e1d3b3', stA: 15, k: 30, kR: 8 } },
    /* по фильтрам Polarr: цвет из таблицы js/luts.js, свечение, засветка, блёстки и виньетка движком */
    { id: 'pAngelic', name: 'Blue angelic', adjust: { lut: 'angelic', lutA: 100, c: 22, sh: -30, tsC: '#2a4fa0', tsA: 55, thC: '#ffe2bd', thA: 45, s: 12 } },
    { id: 'pBlueBlue', name: 'BlueBlue', adjust: { lut: 'blueblue', lutA: 100, spA: 55 } },
    { id: 'pAccendio', name: 'Accendio', adjust: { lut: 'accendio', lutA: 100, g: 30, v: 22, k: -15 } },
    { id: 'pSweetheart', name: 'Sweetheart', adjust: { lut: 'sweetheart', lutA: 100, lkA: 80, lkC: '#ff9a2e', lkS: 'right', g: 25 } },
    { id: 'p1994', name: '1994 memories', adjust: { lut: 'memories1994', lutA: 100, gl: 45, glR: 70, v: 28, g: 15 } },
    { id: 'pSoftReflection', name: 'Soft reflection', adjust: { lut: 'softReflection', lutA: 100, gl: 18, glR: 50 } },
    { id: 'pNightfall', name: 'Nightfall', adjust: { lut: 'nightfall', lutA: 100, v: 18 } },
    { id: 'pLixie', name: 'Lixie dust', adjust: { lut: 'lixie', lutA: 100, k: -30 } },
    { id: 'pAika', name: 'Aika', adjust: { lut: 'aika', lutA: 100, k: -30, spA: 35 } },
    { id: 'pOceanGlow', name: 'Ocean glow', adjust: { lut: 'oceanGlow', lutA: 100, c: 22, sh: -28, gl: 60, glR: 35, v: 22, s: 10 } },
    { id: 'pCinematic', name: 'Cinematic night', adjust: { lut: 'cinematicNight', lutA: 100 } },
    { id: 'pNightDriving', name: 'Night driving', adjust: { lut: 'nightDriving', lutA: 100 } },
    { id: 'pScifi', name: 'Sci-fi', adjust: { lut: 'scifi', lutA: 100 } },
    { id: 'pGreenToBlue', name: 'Green water to blue', adjust: { lut: 'greenToBlue', lutA: 100, cl: 30, k: 20, kR: 8 } },
    { id: 'pWarmDigicam', name: 'Warm digicam', adjust: { lut: 'warmDigicam', lutA: 100 } },
    /* у этих двух на странице Polarr нет картинки «до»: собраны настройками по виду готового фото */
    { id: 'pOcean', name: 'Ocean', adjust: { f: 35, s: -25, c: -10, w: 6, t: -4, hl: -15, b: 4, tsC: '#3a6b78', tsA: 25 } },
    { id: 'pVxlvxtk', name: 'Vxlvxtkisses', adjust: { b: 22, c: -6, f: 15, s: -5, gl: 50, glR: 30, thC: '#ffc8dc', thA: 55, tsC: '#7a68b8', tsA: 45, ca: 4, k: -15 } },
  ];

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
  /* Готовое фото запоминаем: пока снимок, кадрирование, размер и цвет те же, второй раз не считаем.
     Тяжёлый цвет (свечение, резкость) иначе пересчитывался бы на каждый сдвиг стикера. Видео и камера меняются сами, их не запоминаем. */
  const photoMemo = new Map();
  const srcIds = new WeakMap();
  let srcCount = 0;
  const srcId = (src) => {
    if (!src) return 0;
    if (!srcIds.has(src)) srcIds.set(src, ++srcCount);
    return srcIds.get(src);
  };
  function drawPhoto(s0, slots, w, h, name) {
    /* в видео с блёстками фото обрабатывается один раз, а блёстки рисуются поверх в каждом кадре */
    const twinkle = sparkClock != null && Number(s0.adjust.spA) > 0;
    const s = twinkle ? { ...s0, adjust: { ...s0.adjust, spA: 0 } } : s0;
    const base = drawPhotoBase(s, slots, w, h, name);
    if (!twinkle) return base;
    const top = buffer(`${name}-spark`, base.width, base.height);
    top.x.clearRect(0, 0, base.width, base.height);
    top.x.drawImage(base, 0, 0);
    drawSparkles(top.x, base.width, base.height, s0.adjust);
    return top.c;
  }
  function drawPhotoBase(s, slots, w, h, name) {
    const bname = neutral(s.adjust) ? name : `${name}-read`;
    const still = slots.every((sl) => !sl.src || (sl.src.kind !== 'video' && sl.src.kind !== 'live'));
    const key = still ? JSON.stringify([Math.round(w), Math.round(h), s.adjust, slots.map((sl) => [srcId(sl.src), sl.x, sl.y, sl.zoom, sl.flip, sl.turn, sl.tilt || 0])]) : null;
    if (key && photoMemo.get(bname) === key && buffers.has(bname)) return buffers.get(bname).c;
    const { c, x } = buffer(bname, w, h, { willReadFrequently: !neutral(s.adjust) });
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
      x.rotate(((slot.turn + (slot.flip ? -(slot.tilt || 0) : slot.tilt || 0)) * Math.PI) / 180);
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
    if (key) photoMemo.set(bname, key);
    else photoMemo.delete(bname);
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
    /* в ролике строки подписи появляются по очереди; размер считается по полной строке, чтобы не прыгал */
    const line = (str, x, y) => {
      const a = textStep(s, u, str.length, true);
      if (!a) return;
      ctx.save();
      ctx.translate(x, y);
      a.apply(ctx);
      ctx.fillText(a.cut(str), 0, 0);
      ctx.restore();
    };
    if (n.title) {
      ctx.textAlign = 'left';
      titleSize = fitText(ctx, n.title, font, textW, (meta ? 66 : 80) * u * scale);
      line(n.title, pad, bh / 2 + (meta ? -4 * u : titleSize * 0.34));
    }
    if (meta) {
      ctx.textAlign = 'left';
      const small = { ...font, weight: Math.min(font.weight, 500) };
      const size = fitText(ctx, meta, small, textW, 32 * u * scale);
      line(meta, pad, n.title ? bh / 2 + size + 16 * u : bh / 2 + size * 0.34);
    }
    const stamp = n.mood ? textStep(s, u, n.mood.length, true) : null;
    if (n.mood && stamp) {
      /* настроение печатается штампом в углу полосы */
      ctx.shadowBlur = 0;
      const size = fitText(ctx, n.mood, FONTS.find((f) => f.id === 'mono'), moodW - 56 * u, 30 * u);
      const tw = ctx.measureText(n.mood).width;
      const sw = tw + 44 * u;
      const sh = size + 34 * u;
      ctx.translate(bw - pad - sw / 2, bh / 2);
      ctx.rotate(-0.07);
      stamp.apply(ctx);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5 * u;
      ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(stamp.cut(n.mood), 0, 2 * u);
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
    /* подложка шаблона между ячейками: например окно капчи поверх фото-фона, под клетками */
    let under = !geo.under;
    const drawUnder = () => {
      if (under) return;
      under = true;
      ctx.save();
      geo.under(ctx, u, opt);
      ctx.restore();
    };
    geo.cells.forEach((base, i) => {
      if (i === (geo.underAt || 0)) drawUnder();
      /* скрытая ячейка: только источник для кусочков и место для касания */
      if (base.hidden) return;
      const slot = slots[base.slot ?? i];
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
        if (cell.mono) ctx.filter = 'grayscale(1) contrast(1.2)';
        ctx.drawImage(photo, -cell.w / 2, -cell.h / 2, cell.w, cell.h);
        ctx.filter = 'none';
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

    drawUnder();
    /* вырезки: на фото на месте кусочка видна бумага, сам кусочек лежит в другом месте */
    /* кусочки берутся из ячейки-источника (source) или из первой */
    const si = Math.max(0, geo.cells.findIndex((c) => c.source));
    const base = geo.cells[si];
    const from = base && slots[base.slot ?? si];
    const source = geo.pieces.length && from && from.src ? drawPhoto(s, [from], base.w, base.h, `cell${si}`) : null;
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

  /* Область фото, на которую ложится эффект: у коллажа вся карточка. */
  function fxRect(s, W, H) {
    if (s.collage && window.Collages.byId(s.collage)) return { x: 0, y: 0, w: W, h: H };
    const L = layout(s, W, H);
    const a = L.photo || L.pieces;
    return { x: a.x, y: a.y, w: a.w, h: a.h };
  }

  function renderCard(ctx, s, slots, assets = {}) {
    textIdx = 0;
    renderCardBody(ctx, s, slots, assets);
    if (sparkClock != null && s.motion && s.motion.wipe) drawWipe(ctx, s, slots, assets);
    drawSign(ctx, s, assets, ctx.canvas.width, ctx.canvas.height);
  }

  /* ---------- ролик «до / после»: шторка ездит по кадру, слева исходное фото, справа обработка ---------- */
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  /* доля кадра, которую занимает «до»: держим «до», ведём к «после», держим «после», возвращаем */
  function wipeAt(t, len) {
    const p = (t % len) / len;
    if (p < 0.12) return 1;
    if (p < 0.5) return 1 - smooth((p - 0.12) / 0.38);
    if (p < 0.78) return 0;
    return smooth((p - 0.78) / 0.22);
  }
  const plainOf = (s) => ({ ...s, fx: { ...s.fx, id: '' }, fx2: { ...s.fx2, id: '' }, scan: { ...s.scan, on: false }, adjust: {}, motion: { ...s.motion, wipe: false } });
  const tr = (text) => (window.I18n ? window.I18n.t(text) : text);
  function drawWipe(ctx, s, slots, assets) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const x = Math.round(W * wipeAt(sparkClock, Math.max(1, Number(s.motion.dur) || 5)));
    const u = Math.min(W, H) / 1080;
    if (x > 0) {
      const keep = textIdx;
      const before = buffer('wipe', W, H);
      before.x.clearRect(0, 0, W, H);
      textIdx = 0;
      renderCardBody(before.x, plainOf(s), slots, assets);
      textIdx = keep;
      ctx.drawImage(before.c, 0, 0, x, H, 0, 0, x, H);
    }
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 8 * u;
    if (x > 0 && x < W) {
      ctx.fillRect(x - 2 * u, 0, 4 * u, H);
      ctx.beginPath();
      ctx.arc(x, H / 2, 22 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#111111';
      ctx.font = `600 ${20 * u}px "Golos Text", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('‹›', x, H / 2 + u);
    }
    ctx.shadowBlur = 0;
    const tag = (text, tx, right) => {
      ctx.font = `600 ${26 * u}px "Golos Text", system-ui, sans-serif`;
      const w = ctx.measureText(text).width + 28 * u;
      const left = right ? tx - w : tx;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(left, 24 * u, w, 44 * u);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, left + w / 2, 46 * u + u);
    };
    if (x > 150 * u) tag(tr('ДО'), x - 18 * u, true);
    if (x < W - 150 * u) tag(tr('ПОСЛЕ'), x + 18 * u, false);
    ctx.restore();
  }

  /* ---------- надписи появляются по ходу ролика ----------
     motion.txt: '' сразу, 'type' печатается, 'fade' проявляется, 'rise' выезжает снизу, 'pop' выпрыгивает.
     k-я надпись на карточке начинается через txtAt + k·txtGap секунд. txtAll: стикеры тоже появляются. */
  let textIdx = 0;
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeBack = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
  function textStep(s, u, chars, isText) {
    const m = s && s.motion;
    const same = { apply() {}, cut: (str) => str, cutLines: (lines) => lines };
    if (sparkClock == null || !m || !m.txt || (!isText && !m.txtAll)) return same;
    const k = textIdx++;
    const mode = m.txt === 'type' && !isText ? 'pop' : m.txt;
    const start = (Number(m.txtAt) || 0) + k * (Number(m.txtGap) || 0.7);
    const len = mode === 'type' ? Math.max(0.4, Math.min(2.5, chars * 0.06)) : 0.6;
    const p = Math.min(1, (sparkClock - start) / len);
    if (p <= 0) return null;
    const total = Math.ceil(chars * p);
    return {
      apply(ctx) {
        if (mode === 'fade') ctx.globalAlpha *= easeOut(p);
        if (mode === 'rise') {
          ctx.globalAlpha *= easeOut(p);
          ctx.translate(0, (1 - easeOut(p)) * 60 * u);
        }
        if (mode === 'pop') {
          const k2 = Math.max(0.01, 0.3 + 0.7 * easeBack(p));
          ctx.globalAlpha *= Math.min(1, p * 3);
          ctx.scale(k2, k2);
        }
      },
      cut: (str) => (mode === 'type' ? str.slice(0, total) : str),
      cutLines: (lines) => {
        if (mode !== 'type') return lines;
        let left = total;
        return lines.map((ln) => {
          const part = ln.slice(0, Math.max(0, left));
          left -= ln.length;
          return part;
        });
      },
    };
  }
  /* мой ник из «Моего набора» в углу карточки. s.sign: на этой карточке да или нет; не задан — как в наборе */
  function drawSign(ctx, s, assets, W, H) {
    const b = assets && assets.brand;
    const text = b && String(b.handle || '').trim();
    if (!text || !(s.sign ?? b.auto)) return;
    const u = Math.min(W, H) / 1080;
    const size = 30 * u * (Number(b.size) || 1);
    const f = window.Effects && window.Effects.fonts().find((x) => x.id === b.font);
    const pos = b.pos || 'br';
    const pad = 40 * u;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0.1, (Number(b.alpha) || 90) / 100));
    ctx.font = `600 ${size}px ${f ? f.css : '"Golos Text", system-ui, sans-serif'}`;
    ctx.textAlign = pos.endsWith('l') ? 'left' : pos.endsWith('r') ? 'right' : 'center';
    ctx.textBaseline = pos.startsWith('t') ? 'top' : 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 6 * u;
    ctx.shadowOffsetY = u;
    ctx.fillStyle = b.color || '#ffffff';
    ctx.fillText(text, pos.endsWith('l') ? pad : pos.endsWith('r') ? W - pad : W / 2, pos.startsWith('t') ? pad : H - pad);
    ctx.restore();
  }
  function renderCardBody(ctx, s, slots, assets = {}) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const L = layout(s, W, H);
    const u = Math.min(W, H) / 1080;

    const paper = drawPaper(s.paper === 'own' ? 'smooth' : s.paper, s.paperColor, W, H);
    ctx.drawImage(paper, 0, 0);
    if (s.paper === 'own' && assets.bg) drawCover(ctx, assets.bg, assets.bg.naturalWidth, assets.bg.naturalHeight, W, H);
    if (s.collage && window.Collages.byId(s.collage)) {
      renderCollage(ctx, s, slots, W, H, u, paper);
      if (window.Effects) { window.Effects.draw(ctx, s, W, H); window.Effects.draw(ctx, s, W, H, null, 'fx2'); }
      if (window.Scanner) window.Scanner.draw(ctx, s, W, H);
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
      /* вразброс: кусочки на своих местах, но внутри каждого случайная часть снимка */
      x.drawImage(s.scatter ? scatterContent(second, mask, s.seed) : second, 0, 0, cut.width, cut.height);
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

    if (window.Effects) { window.Effects.draw(ctx, s, W, H, fxRect(s, W, H)); window.Effects.draw(ctx, s, W, H, fxRect(s, W, H), 'fx2'); }
    if (window.Scanner) window.Scanner.draw(ctx, s, W, H, fxRect(s, W, H));
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
    if (l.card) {
      if (l.card === 'player') return { w: size * 14, h: size * 7.28, size };
      const f = layerFont(l); ctx.font = `${f.weight} ${size}px ${f.css}`;
      const lines = [];
      String(l.text || ' ').split('\n').forEach(paragraph => {
        let line = '';
        for (const word of paragraph.split(/\s+/)) {
          const next = line ? `${line} ${word}` : word;
          if (line && ctx.measureText(next).width > size * 10.2) { lines.push(line); line = ''; }
          if (ctx.measureText(word).width > size * 10.2) {
            for (const char of word) {
              if (line && ctx.measureText(line + char).width > size * 10.2) { lines.push(line); line = ''; }
              line += char;
            }
          } else line = line ? `${line} ${word}` : word;
        }
        lines.push(line);
      });
      const header = l.card === 'window' ? size * 1.5 : l.card === 'voice' ? size * 1.8 : 0;
      const bodyH = Math.max(size * 3.2, lines.length * size * 1.25 + size * 1.7) + header;
      const tail = ['bubble', 'pixel'].includes(l.card) ? size * 0.9 : 0;
      return { w: size * 12, h: bodyH + tail, bodyH, tail, size, lines, header };
    }
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
  function dieCut(art, w, h, stroke, key, color = '#ffffff') {
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
      x.fillStyle = color || '#ffffff';
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

  /* ---------- готовые значки-стикеры: рисуются кодом, цвет меняется ---------- */
  const VECTORS = [
    { id: 'starEarbuds', name: 'Звёздные наушники', color: '#ffffff', size: 0.6 },
    { id: 'starEarbudsLoop', name: 'Звёздные наушники с петлёй', color: '#ffffff', size: 0.7 },
    { id: 'pixelLove', name: 'Пиксельное сердечко', color: '#e7a9be' },
    { id: 'loveMail', name: 'Конверт с сердцем', color: '#d699b1' },
    { id: 'loveFolder', name: 'Папка с сердцем', color: '#d699b1' },
    { id: 'pixelKitten', name: 'Котик с бантом', color: '#252226' },
    { id: 'scope', name: 'Прицел', color: '#ff1a1a' },
    { id: 'target', name: 'Мишень', color: '#ff1a1a' },
    { id: 'focus', name: 'Фокус', color: '#ffffff' },
    { id: 'frameTicks', name: 'Видоискатель', color: '#ffffff' },
    { id: 'cross', name: 'Крестик', color: '#ff1a1a' },
    { id: 'plus', name: 'Плюс', color: '#ffffff' },
    { id: 'arrow', name: 'Стрелка', color: '#39ff6a' },
    { id: 'ring', name: 'Обвести', color: '#ff1a1a' },
    { id: 'burst', name: 'Вспышка', color: '#f5c518' },
    { id: 'rec', name: 'Запись', color: '#ff1a1a' },
    { id: 'warn', name: 'Внимание', color: '#39ff6a' },
    { id: 'heartLine', name: 'Сердце контуром', color: '#ff1a1a' },
    { id: 'retroWin', name: 'Ретро-окно', color: '#ffffff' },
    { id: 'retroDialog', name: 'Окошко сообщения', color: '#ffffff' },
    { id: 'storyboard', name: 'Кадр с ярлыком', color: '#ffffff' },
    { id: 'squares', name: 'Квадратики', color: '#ffffff' },
  ];
  /* значок в квадрате size с центром cx, cy */
  function drawVector(ctx, id, cx, cy, size, color) {
    const s = size / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'butt';
    const line = (w, pts) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[2], pts[3]); ctx.stroke(); };
    const ring = (r, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); };
    switch (id) {
      case 'pixelLove': {
        const rows = ['01100110', '11111111', '11111111', '01111110', '00111100', '00011000'];
        rows.forEach((row, iy) => [...row].forEach((bit, ix) => { if (bit === '1') ctx.fillRect((ix - 4) * s * 0.2, (iy - 3) * s * 0.2, s * 0.2 + 0.1, s * 0.2 + 0.1); }));
        break;
      }
      case 'loveMail':
      case 'loveFolder': {
        ctx.lineWidth = s * 0.04; ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.18; ctx.fillRect(-s * 0.85, -s * 0.48, s * 1.7, s * 1.1); ctx.globalAlpha = 1;
        ctx.strokeRect(-s * 0.85, -s * 0.48, s * 1.7, s * 1.1);
        ctx.beginPath();
        if (id === 'loveMail') { ctx.moveTo(-s * 0.85, -s * 0.48); ctx.lineTo(0, s * 0.12); ctx.lineTo(s * 0.85, -s * 0.48); }
        else { ctx.moveTo(-s * 0.85, -s * 0.48); ctx.lineTo(-s * 0.85, -s * 0.7); ctx.lineTo(-s * 0.22, -s * 0.7); ctx.lineTo(-s * 0.07, -s * 0.48); }
        ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, s * 0.36);
        ctx.bezierCurveTo(-s * 0.49, s * 0.05, -s * 0.21, -s * 0.17, 0, s * 0.02); ctx.bezierCurveTo(s * 0.21, -s * 0.17, s * 0.49, s * 0.05, 0, s * 0.36); ctx.fill();
        break;
      }
      case 'pixelKitten': {
        const rows = ['100000001', '110000011', '111111111', '111111111', '110111011', '111111111', '011111110', '001111100', '001111100', '011101110'];
        rows.forEach((row, iy) => [...row].forEach((bit, ix) => { if (bit === '1') ctx.fillRect((ix - 4.5) * s * 0.15, (iy - 5) * s * 0.15, s * 0.15 + 0.1, s * 0.15 + 0.1); }));
        ctx.fillStyle = '#e9b4c8'; ctx.beginPath(); ctx.moveTo(0, s * 0.32); ctx.lineTo(-s * 0.25, s * 0.17); ctx.lineTo(-s * 0.22, s * 0.43); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, s * 0.32); ctx.lineTo(s * 0.25, s * 0.17); ctx.lineTo(s * 0.22, s * 0.43); ctx.closePath(); ctx.fill();
        break;
      }
      case 'starEarbuds':
      case 'starEarbudsLoop': {
        ctx.scale(s, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 0.014;
        const loop = id === 'starEarbudsLoop';
        const stars = loop ? [[-0.38, -0.81, 0.115, -0.16], [0.48, -0.85, 0.115, 0.18]] : [[-0.35, -0.81, 0.12, 0.18], [0.64, -0.48, 0.12, -0.12]];
        ctx.beginPath();
        if (loop) {
          ctx.moveTo(-0.38, -0.75); ctx.bezierCurveTo(-0.40, -0.59, -0.22, -0.26, -0.02, -0.05);
          ctx.moveTo(0.47, -0.78); ctx.bezierCurveTo(0.37, -0.53, 0.17, -0.29, -0.02, -0.05);
          ctx.moveTo(-0.02, 0.02); ctx.bezierCurveTo(-0.01, 0.16, 0.04, 0.33, -0.11, 0.43);
          ctx.bezierCurveTo(-0.37, 0.63, -0.73, 0.61, -0.64, 0.43);
          ctx.bezierCurveTo(-0.56, 0.28, -0.32, 0.42, -0.30, 0.57);
          ctx.bezierCurveTo(-0.25, 1.14, 0.20, 0.65, 0.54, 0.62);
          ctx.bezierCurveTo(0.75, 0.58, 0.65, 0.83, 0.67, 0.95);
        } else {
          ctx.moveTo(-0.35, -0.74); ctx.bezierCurveTo(-0.49, -0.35, -0.18, -0.12, -0.10, 0.17);
          ctx.moveTo(0.59, -0.43); ctx.bezierCurveTo(0.47, -0.14, 0.06, -0.05, -0.10, 0.17);
          ctx.moveTo(-0.12, 0.27); ctx.bezierCurveTo(-0.20, 0.53, -0.31, 0.98, -0.70, 0.88);
        }
        ctx.stroke();
        stars.forEach(([x, y, r, rot]) => {
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + rot + i * Math.PI / 5;
            const rr = r * (i % 2 ? 0.35 : 1) * (i % 3 === 0 ? 1.08 : 1);
            ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          }
          ctx.closePath(); ctx.fill();
        });
        ctx.save(); ctx.translate(loop ? -0.02 : -0.10, loop ? -0.025 : 0.215); ctx.rotate(0.2);
        ctx.beginPath(); ctx.roundRect(-0.026, -0.057, 0.052, 0.114, 0.014);
        if (loop) ctx.fill(); else ctx.stroke();
        ctx.restore();
        break;
      }
      case 'scope': {
        ring(s * 0.8, s * 0.05);
        ring(s * 0.59, s * 0.012);
        /* толстые концы снаружи, тонкие линии внутри и штрихи у центра */
        [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
          line(s * 0.04, [dx * s * 0.98, dy * s * 0.98, dx * s * 0.47, dy * s * 0.47]);
          line(s * 0.012, [dx * s * 0.47, dy * s * 0.47, 0, 0]);
          line(s * 0.04, [dx * s * 0.08, dy * s * 0.08, dx * s * 0.18, dy * s * 0.18]);
        });
        break;
      }
      case 'target':
        ring(s * 0.85, s * 0.06);
        ring(s * 0.55, s * 0.06);
        ring(s * 0.25, s * 0.06);
        ctx.beginPath(); ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2); ctx.fill();
        break;
      case 'focus':
        ctx.lineWidth = s * 0.05;
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([dx, dy]) => {
          ctx.beginPath();
          ctx.moveTo(dx * s * 0.9, dy * s * 0.5);
          ctx.lineTo(dx * s * 0.9, dy * s * 0.9);
          ctx.lineTo(dx * s * 0.5, dy * s * 0.9);
          ctx.stroke();
        });
        ctx.beginPath(); ctx.arc(0, 0, s * 0.05, 0, Math.PI * 2); ctx.fill();
        break;
      case 'frameTicks':
        ctx.lineWidth = s * 0.025;
        ctx.strokeRect(-s * 0.9, -s * 0.65, s * 1.8, s * 1.3);
        line(s * 0.025, [-s * 0.15, 0, s * 0.15, 0]);
        line(s * 0.025, [0, -s * 0.15, 0, s * 0.15]);
        for (let k = -3; k <= 3; k++) line(s * 0.02, [k * s * 0.22, s * 0.65, k * s * 0.22, s * 0.55]);
        break;
      case 'cross':
        ctx.lineCap = 'round';
        line(s * 0.16, [-s * 0.6, -s * 0.6, s * 0.6, s * 0.6]);
        line(s * 0.16, [s * 0.6, -s * 0.6, -s * 0.6, s * 0.6]);
        break;
      case 'plus':
        line(s * 0.06, [-s * 0.7, 0, s * 0.7, 0]);
        line(s * 0.06, [0, -s * 0.7, 0, s * 0.7]);
        break;
      case 'arrow':
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.9);
        ctx.lineTo(s * 0.5, -s * 0.3);
        ctx.lineTo(s * 0.17, -s * 0.3);
        ctx.lineTo(s * 0.17, s * 0.9);
        ctx.lineTo(-s * 0.17, s * 0.9);
        ctx.lineTo(-s * 0.17, -s * 0.3);
        ctx.lineTo(-s * 0.5, -s * 0.3);
        ctx.closePath();
        ctx.fill();
        break;
      case 'ring': {
        /* обводка от руки: чуть больше оборота, неровная */
        ctx.lineWidth = s * 0.07;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2.15; a += 0.05) {
          const r = s * (0.78 + 0.06 * Math.sin(a * 3) + a * 0.012);
          const x = Math.cos(a - 0.6) * r * 1.1, y = Math.sin(a - 0.6) * r * 0.8;
          if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        break;
      }
      case 'burst':
        ctx.beginPath();
        for (let k = 0; k < 32; k++) {
          const a = (k * Math.PI) / 16;
          const r = k % 2 ? s * 0.55 : s * 0.95;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 'rec':
        ctx.beginPath(); ctx.arc(-s * 0.55, 0, s * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.font = `700 ${s * 0.5}px "JetBrains Mono", monospace`;
        ctx.textBaseline = 'middle';
        ctx.fillText('REC', -s * 0.25, s * 0.03);
        break;
      case 'warn':
        ctx.lineWidth = s * 0.08;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.8);
        ctx.lineTo(s * 0.85, s * 0.7);
        ctx.lineTo(-s * 0.85, s * 0.7);
        ctx.closePath();
        ctx.stroke();
        ctx.font = `700 ${s * 0.75}px "Golos Text", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, s * 0.25);
        break;
      case 'heartLine':
        ctx.lineWidth = s * 0.07;
        ctx.beginPath();
        ctx.moveTo(0, s * 0.75);
        ctx.bezierCurveTo(-s * 1.1, -s * 0.05, -s * 0.55, -s * 0.95, 0, -s * 0.4);
        ctx.bezierCurveTo(s * 0.55, -s * 0.95, s * 1.1, -s * 0.05, 0, s * 0.75);
        ctx.stroke();
        break;
      case 'retroWin':
      case 'retroDialog': {
        /* окно старого компьютера: двойная рамка, полоски в шапке, квадратики-кнопки; у большого окна полоса прокрутки */
        const big = id === 'retroWin';
        const w = big ? s * 1.3 : s * 1.9;
        const h = big ? s * 1.9 : s * 0.9;
        const x = -w / 2, y = -h / 2;
        const bar = s * (big ? 0.11 : 0.13);
        const lw = Math.max(1, s * 0.012);
        ctx.lineWidth = lw;
        ctx.strokeRect(x, y, w, h);
        ctx.strokeRect(x + lw * 2.5, y + lw * 2.5, w - lw * 5, h - lw * 5);
        ctx.beginPath();
        ctx.moveTo(x, y + bar); ctx.lineTo(x + w, y + bar);
        for (let k = 1; k < 5; k++) {
          const yy = y + (bar * k) / 5;
          ctx.moveTo(x + w * 0.22, yy); ctx.lineTo(x + w * 0.4, yy);
          ctx.moveTo(x + w * 0.6, yy); ctx.lineTo(x + w * 0.96, yy);
        }
        ctx.stroke();
        const q = bar * 0.55;
        [0, 1, 2].slice(0, big ? 3 : 1).forEach((k) => ctx.strokeRect(x + w * 0.03 + k * q * 1.4, y + (bar - q) / 2, q, q));
        /* название окна в середине шапки: два штриха, как буквы */
        ctx.fillRect(x + w * 0.44, y + bar * 0.38, w * 0.12, bar * 0.24);
        if (big) {
          const sw = s * 0.08;
          ctx.strokeRect(x + w - sw - lw * 3, y + bar * 1.6, sw, h - bar * 1.6 - lw * 3);
          ctx.fillRect(x + w - sw - lw * 3, y + bar * 1.6 + (h - bar * 1.6) * 0.62, sw, (h - bar * 1.6) * 0.03);
          ctx.beginPath();
          ctx.moveTo(x + lw * 3, y + bar * 1.5); ctx.lineTo(x + w - lw * 3, y + bar * 1.5);
          ctx.stroke();
        } else {
          /* строки текста в окошке */
          ctx.globalAlpha = 0.85;
          [0.42, 0.62].forEach((f, k) => ctx.fillRect(x + w * 0.06, y + h * f, w * (k ? 0.45 : 0.7), lw * 1.6));
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'storyboard': {
        /* тонкий квадрат кадра и белый ярлык над левым углом */
        ctx.lineWidth = Math.max(1, s * 0.018);
        ctx.strokeRect(-s * 0.8, -s * 0.7, s * 1.6, s * 1.5);
        ctx.fillRect(-s * 0.8, -s * 0.9, s * 1.05, s * 0.2);
        break;
      }
      case 'squares': {
        /* белые квадратики вразброс, два слиплись ступенькой */
        const q = s * 0.17;
        [[-0.85, -0.6], [-0.45, -0.85], [0.2, -0.75], [0.36, -0.59], [0.75, -0.95], [0.6, -0.2], [-0.95, 0.05], [-0.2, 0.55], [0.3, 0.5], [0.1, 0.8], [0.85, 0.35], [-0.6, 0.85]]
          .forEach(([dx, dy]) => ctx.fillRect(dx * s - q / 2, dy * s - q / 2, q, q));
        break;
      }
      default: break;
    }
    ctx.restore();
  }
  function vectorBitmap(id, color, size) {
    const c = canvas(size, size);
    drawVector(c.getContext('2d'), id, size / 2, size / 2, size * 0.94, color);
    return c;
  }

  const CARDS = [
    { id: 'message', name: 'Сообщение', kind: 'bubble', text: 'Ты — моё любимое уведомление', bg: '#fffdfb', color: '#242126' },
    { id: 'pixelMessage', name: 'Пиксельный пузырь', kind: 'pixel', text: '♡ ♡ ♡', bg: '#ffe7ef', color: '#b86686' },
    { id: 'quoteCard', name: 'Карточка с цитатой', kind: 'quote', text: 'В комнате, полной искусства,\nя всё равно смотрю на тебя.', bg: '#fae7e9', color: '#482a34' },
    { id: 'messageWindow', name: 'Окошко с сообщением', kind: 'window', text: 'У тебя новое сообщение!', bg: '#fff2f5', color: '#b6758e' },
    { id: 'voiceMessage', name: 'Голосовое сообщение', kind: 'voice', text: 'для тебя · 0:24', bg: '#fff8fa', color: '#292428' },
    { id: 'musicPlayer', name: 'Плеер', kind: 'player', text: 'Название песни\nИсполнитель', bg: '#333335', color: '#ffffff' },
  ];

  /* Общий плеер для стикера и коллажа. Обложка в коллаже рисуется отдельной ячейкой. */
  function drawMusicPlayer(ctx, x, y, w, h, opt = {}) {
    ctx.save(); ctx.translate(x, y);
    const ink = opt.color || '#ffffff';
    const face = opt.font || '"Golos Text", sans-serif';
    ctx.fillStyle = opt.bg || '#333335'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, h * 0.1); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(w * 0.04, h * 0.09, w * 0.43, h * 0.82, w * 0.025); ctx.clip();
    if (opt.cover) {
      ctx.translate(w * 0.04, h * 0.09);
      drawCover(ctx, opt.cover, opt.cover.naturalWidth || opt.cover.width, opt.cover.naturalHeight || opt.cover.height, w * 0.43, h * 0.82);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = ink; ctx.globalAlpha = 0.45; ctx.font = `500 ${h * 0.22}px "Golos Text", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♫', w * 0.255, h * 0.5);
    }
    ctx.restore();
    const parts = String(opt.text || 'Название песни\nИсполнитель').split('\n');
    ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${w * 0.031}px ${face}`; ctx.fillText(parts[0] || '♫', w * 0.53, h * 0.21, w * 0.41);
    ctx.font = `400 ${w * 0.023}px ${face}`; ctx.globalAlpha = 0.78; ctx.fillText(parts.slice(1).join(' · '), w * 0.53, h * 0.31, w * 0.41); ctx.globalAlpha = 1;
    const line = (x1, y1, x2, y2, a = 1) => { ctx.globalAlpha = a; ctx.strokeStyle = ink; ctx.lineWidth = w * 0.0035; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.globalAlpha = 1; };
    const progress = Math.max(0, Math.min(1, Number(opt.progress ?? 0.45)));
    line(w * 0.53, h * 0.46, w * 0.94, h * 0.46, 0.3); line(w * 0.53, h * 0.46, w * (0.53 + progress * 0.41), h * 0.46);
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(w * (0.53 + progress * 0.41), h * 0.46, w * 0.005, 0, Math.PI * 2); ctx.fill();
    ctx.font = `400 ${w * 0.018}px ${face}`; ctx.fillText(opt.elapsed || '1:03', w * 0.53, h * 0.51);
    ctx.textAlign = 'right'; ctx.fillText(opt.duration || '2:22', w * 0.94, h * 0.51);
    const triangle = (cx, cy, side) => { ctx.beginPath(); ctx.moveTo(cx - side * w * 0.012, cy - h * 0.025); ctx.lineTo(cx + side * w * 0.012, cy); ctx.lineTo(cx - side * w * 0.012, cy + h * 0.025); ctx.closePath(); ctx.fill(); };
    triangle(w * 0.60, h * 0.65, -1); triangle(w * 0.62, h * 0.65, -1);
    triangle(w * 0.85, h * 0.65, 1); triangle(w * 0.87, h * 0.65, 1);
    ctx.fillRect(w * 0.72, h * 0.612, w * 0.011, h * 0.076); ctx.fillRect(w * 0.742, h * 0.612, w * 0.011, h * 0.076);
    line(w * 0.57, h * 0.82, w * 0.91, h * 0.82, 0.5); ctx.beginPath(); ctx.arc(w * 0.86, h * 0.82, w * 0.005, 0, Math.PI * 2); ctx.fill();
    line(w * 0.65, h * 0.94, w * 0.83, h * 0.94, 0.65);
    ctx.restore();
  }

  function drawTextCard(ctx, l, b, assets) {
    if (l.card === 'player') {
      drawMusicPlayer(ctx, -b.w / 2, -b.h / 2, b.w, b.h, { bg: l.bg, color: l.color, text: l.text, cover: assets.stickers?.[l.cover], progress: l.progress, elapsed: l.elapsed, duration: l.duration, font: layerFont(l).css }); return;
    }
    const { w, size } = b, h = b.bodyH, x = -w / 2, y = -b.h / 2, f = layerFont(l);
    ctx.fillStyle = l.bg || '#fff1f5'; ctx.strokeStyle = l.color || '#33252c'; ctx.lineWidth = size * 0.045;
    ctx.beginPath();
    if (l.card === 'pixel') {
      const q = size * 0.35;
      [[x + q, y], [x + w - q, y], [x + w - q, y + q], [x + w, y + q], [x + w, y + h - q], [x + w - q, y + h - q], [x + w - q, y + h], [x + q, y + h], [x + q, y + h - q], [x, y + h - q], [x, y + q], [x + q, y + q]].forEach(([px, py], i) => ctx[i ? 'lineTo' : 'moveTo'](px, py)); ctx.closePath();
    } else ctx.roundRect(x, y, w, h, l.card === 'quote' ? size * 0.1 : l.card === 'window' ? size * 0.25 : size * 1.0);
    ctx.fill();
    if (l.card === 'bubble' || l.card === 'pixel') {
      const bottom = y + h;
      ctx.beginPath(); ctx.moveTo(w * 0.25, bottom - size * 0.15);
      if (l.card === 'pixel') { ctx.lineTo(w * 0.25, bottom + size * 0.85); ctx.lineTo(w * 0.30, bottom + size * 0.85); ctx.lineTo(w * 0.30, bottom + size * 0.45); ctx.lineTo(w * 0.35, bottom + size * 0.45); ctx.lineTo(w * 0.35, bottom); }
      else { ctx.quadraticCurveTo(w * 0.27, bottom + size * 0.65, w * 0.40, bottom + size * 0.90); ctx.lineTo(w * 0.38, bottom - size * 0.12); }
      ctx.closePath(); ctx.fill();
    }
    if (l.card === 'quote') { ctx.fillStyle = l.color; ctx.globalAlpha = 0.22; ctx.fillRect(x, y, size * 0.32, h); ctx.globalAlpha = 1; }
    if (l.card === 'window' || l.card === 'pixel') { ctx.strokeRect(x + size * 0.10, y + size * 0.10, w - size * 0.20, h - size * 0.20); }
    if (l.card === 'window') {
      ctx.beginPath(); ctx.moveTo(x, y + size * 1.2); ctx.lineTo(x + w, y + size * 1.2); ctx.stroke();
      ctx.fillStyle = l.color; ctx.font = `500 ${size * 0.5}px ${f.css}`; ctx.textAlign = 'left'; ctx.fillText('MESSAGE FOR YOU', x + size * 0.5, y + size * 0.8);
      for (let i = 0; i < 3; i++) ctx.strokeRect(w / 2 - size * (0.75 + i * 0.75), y + size * 0.35, size * 0.45, size * 0.45);
    }
    if (l.card === 'voice') {
      ctx.fillStyle = l.color; ctx.beginPath(); ctx.moveTo(x + size, y + size * 0.8); ctx.lineTo(x + size * 2, y + size * 1.4); ctx.lineTo(x + size, y + size * 2); ctx.closePath(); ctx.fill();
      const rng = makeRng(830); ctx.lineCap = 'round'; ctx.lineWidth = size * 0.13;
      for (let i = 0; i < 35; i++) { const xx = x + size * 2.6 + i * size * 0.24, hh = size * (0.2 + rng() * 1.15); ctx.beginPath(); ctx.moveTo(xx, y + size * 1.4 - hh / 2); ctx.lineTo(xx, y + size * 1.4 + hh / 2); ctx.stroke(); }
    }
    ctx.font = `${f.weight} ${size}px ${f.css}`; ctx.fillStyle = l.color || '#33252c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    b.lines.forEach((line, i) => ctx.fillText(line, 0, (i - (b.lines.length - 1) / 2) * size * 1.25 + b.header / 2 - b.tail / 2, w - size * 1.4));
  }

  function drawLayers(ctx, s, assets, W, H) {
    const u = Math.min(W, H) / 1080;
    (s.layers || []).forEach((l) => {
      const b = layerBox(ctx, l, assets, W, H);
      /* в ролике надпись или стикер появляется в свою очередь */
      const a = textStep(s, u, l.type === 'text' ? (b.lines || []).join('').length : 0, l.type === 'text');
      if (!a) return;
      ctx.save();
      ctx.translate(l.x * W, l.y * H);
      ctx.rotate(l.rot || 0);
      if (l.flip) ctx.scale(-1, 1);
      ctx.globalAlpha = l.opacity ?? 1;
      a.apply(ctx);
      if (l.card) {
        layerShadow(ctx, l, 'none', b.size * 12); drawTextCard(ctx, l, b, assets);
      } else if (l.type === 'text') {
        const f = layerFont(l);
        layerShadow(ctx, l, 'none', b.size * 1.6);
        if (l.style === 'plaque') {
          ctx.fillStyle = l.bg || '#ffffff';
          ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        }
        ctx.font = `${f.weight} ${b.size}px ${f.css}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        const shown = a.cutLines(b.lines);
        b.lines.forEach((full, i) => {
          const ln = shown[i];
          if (!ln) return;
          const y = (i - (b.lines.length - 1) / 2) * b.size * 1.2;
          if (l.style === 'outline') {
            ctx.strokeStyle = l.bg || '#ffffff';
            ctx.lineWidth = b.size * 0.16;
            ctx.strokeText(ln, 0, y);
          }
          ctx.fillStyle = l.color || '#111111';
          ctx.fillText(ln, 0, y);
        });
      } else if (l.die || (l.fx && l.fx.id)) {
        /* стикер с эффектом или эффектом наклейки рисуется картинкой: эффект только внутри контура,
           потом обводка по контуру с бликом */
        const key = `${l.img || l.emoji || l.vec + l.color}|${Math.round(b.w)}|${Math.round(b.h)}`;
        let art = stickerArt(l, b);
        if (l.fx && l.fx.id) art = stickerFx(art, l.fx, `${key}|${l.fx.id}|${l.fx.amount ?? 1}|${l.fx.seed ?? 1}`);
        const bmp = l.die
          ? dieCut(art, b.w, b.h, (l.dieW ?? 0.05) * b.size, `${key}|${l.dieW ?? 0.05}|${l.dieColor || '#ffffff'}|${l.fx ? l.fx.id + (l.fx.amount ?? 1) + (l.fx.seed ?? 1) : ''}`, l.dieColor)
          : art;
        layerShadow(ctx, l, l.die ? 'die' : b.img ? 'img' : l.emoji ? 'emoji' : 'none', b.size);
        ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
      } else if (b.img) {
        /* своя картинка: мягкая тень, как у наклейки */
        layerShadow(ctx, l, 'img', b.size);
        ctx.drawImage(b.img, -b.w / 2, -b.h / 2, b.w, b.h);
      } else if (l.vec) {
        layerShadow(ctx, l, 'none', b.size);
        drawVector(ctx, l.vec, 0, 0, b.size, l.color || '#ff1a1a');
      } else if (l.emoji) {
        layerShadow(ctx, l, 'emoji', b.size);
        ctx.font = `${b.size * 0.86}px ${EMOJI_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(l.emoji, 0, b.size * 0.04);
      }
      ctx.restore();
    });
  }

  /* миниатюра одного слоя для списка слоёв: слой во весь квадрат, без поворота */
  function layerThumb(l, assets, n) {
    const c = canvas(n, n);
    const x = c.getContext('2d');
    const W = 1000, H = 1000;
    const one = { ...l, x: 0, y: 0, rot: 0, flip: false, opacity: 1 };
    const b = layerBox(x, one, assets, W, H);
    const k = (n * 0.8) / Math.max(b.w, b.h, 1);
    x.translate(n / 2, n / 2);
    x.scale(k, k);
    drawLayers(x, { layers: [one] }, assets, W, H);
    return c;
  }

  /* Тень стикера. «Как было» у каждого вида своя (у значков её нет), можно выключить или сделать мягкой либо резкой. */
  const SHADOWS = {
    die: [0.32, 0.05, 0.03], img: [0.28, 0.04, 0.02], emoji: [0.22, 0.05, 0.025], none: null,
    soft: [0.3, 0.09, 0.03], hard: [0.55, 0.008, 0.045],
  };
  function layerShadow(ctx, l, auto, size) {
    const mode = l.shadow || 'auto';
    const p = mode === 'auto' ? SHADOWS[auto] : mode === 'none' ? null : SHADOWS[mode];
    if (!p) return;
    ctx.shadowColor = `rgba(0,0,0,${p[0]})`;
    ctx.shadowBlur = size * p[1];
    ctx.shadowOffsetY = size * p[2];
    if (mode === 'hard') ctx.shadowOffsetX = size * p[2] * 0.6;
  }

  /* картинка стикера ровно в его размер: своя картинка, значок или эмодзи */
  function stickerArt(l, b) {
    if (b.img) {
      const c = canvas(Math.max(1, Math.round(b.w)), Math.max(1, Math.round(b.h)));
      c.getContext('2d').drawImage(b.img, 0, 0, c.width, c.height);
      return c;
    }
    if (l.vec) {
      const n = Math.max(1, Math.round(b.size));
      const c = canvas(n, n);
      drawVector(c.getContext('2d'), l.vec, n / 2, n / 2, n, l.color || '#ff1a1a');
      return c;
    }
    return emojiBitmap(l.emoji, b.size);
  }

  /* Эффекты для стикера. Простые (ч/б, два цвета, негатив) красят пиксели сами, остальные берутся из «Эффектов»
     с подходящим видом. style: вид эффекта, который хорошо смотрится на маленькой картинке. */
  const STICKER_FX = [
    { id: 'bw', name: 'Ч/б' }, { id: 'duo', name: 'Два цвета' }, { id: 'invert', name: 'Негатив' },
    { id: 'pixelate', name: 'Пикселизация', style: 'all' }, { id: 'lego', name: 'Лего', style: 'photo' },
    { id: 'mosaic', name: 'Клетки', style: 'paper' }, { id: 'ascii', name: 'ASCII', style: 'full' },
    { id: 'hatch', name: 'Штриховка', style: 'diag' }, { id: 'glitch', name: 'Глитч', style: 'shift' },
    { id: 'blocks', name: 'Пиксельные блоки', style: 'plain' },
  ];
  const stickerFxCache = lruCache(32);
  function stickerFx(art, fx, key) {
    return stickerFxCache(key, () => {
      const W = art.width, H = art.height;
      const c = canvas(W, H);
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(art, 0, 0);
      const def = STICKER_FX.find((f) => f.id === fx.id);
      if (fx.id === 'bw' || fx.id === 'duo' || fx.id === 'invert') {
        const img = x.getImageData(0, 0, W, H);
        const d = img.data;
        /* два цвета: тени тёмно-синие, света розовые; сила сдвигает границу */
        const k = fx.amount ?? 1;
        for (let i = 0; i < d.length; i += 4) {
          const v = Math.min(1, Math.max(0, ((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255 - 0.5) * k + 0.5));
          if (fx.id === 'bw') d[i] = d[i + 1] = d[i + 2] = v * 255;
          else if (fx.id === 'invert') { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
          else { d[i] = 31 + v * (255 - 31); d[i + 1] = 38 + v * (158 - 38); d[i + 2] = 138 + v * (199 - 138); }
        }
        x.putImageData(img, 0, 0);
      } else if (def && window.Effects) {
        /* клетки эффекта считаются от размера стикера: около дюжины клеток поперёк при силе 1 */
        const unit = Math.max(W, H) * 2.7;
        window.Effects.draw(x, { fx: { id: fx.id, style: def.style, amount: fx.amount ?? 1, seed: fx.seed ?? 1, color: '', text: '', boxes: [], mask: 'all' }, scan: { on: false } }, unit, unit, { x: 0, y: 0, w: W, h: H });
      }
      /* эффект остаётся только там, где есть сам стикер */
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(art, 0, 0);
      x.globalCompositeOperation = 'source-over';
      return c;
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
    RATIOS, PAPERS, FONTS, VECTORS, CARDS, drawMusicPlayer, STICKER_FX, LOOKS, applyAdjust, loadLut, registerLut,
    onLut: (fn) => { lutListener = fn; }, layerThumb, drawLayers, drawVector, canvas, layout, slotFrame, coverGeom, fxRect, paintPaper, renderCard, sampleScene, luminance, drawCover, layerBox,
    clearMasks: () => maskCache.clear(),
    /* время для мерцания блёсток в видео; null — неподвижная картинка */
    setClock: (t) => { sparkClock = t; },
  };
})();
