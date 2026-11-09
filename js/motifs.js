/* Каталог мотивов: фигуры, через которые видно фото.
   Чтобы добавить новый мотив, допиши одну строку в список MOTIFS внизу файла.
   draw(ctx, w, h, rng, opt) рисует белым по прозрачному, opt = {size, density, text}. */
(function () {
  const TAU = Math.PI * 2;

  /* ---------- случайные числа с зерном: одна и та же раскладка в превью и в экспорте ---------- */
  function makeRng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (lo, hi) => lo + next() * (hi - lo);
    next.gauss = () => Math.sqrt(-2 * Math.log(next() || 1e-6)) * Math.cos(TAU * next());
    return next;
  }

  /* ---------- фигуры: контур вокруг (0,0) радиусом 1 ---------- */
  function poly(c, pts) {
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }
  function starPts(n, inner) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? inner : 1;
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }
  const SHAPES = {
    star: (c) => poly(c, starPts(5, 0.42)),
    fatstar: (c) => poly(c, starPts(5, 0.6)),
    thinstar: (c) => poly(c, starPts(5, 0.3)),
    spark: (c) => {
      c.moveTo(0, -1);
      c.quadraticCurveTo(0.08, -0.08, 1, 0);
      c.quadraticCurveTo(0.08, 0.08, 0, 1);
      c.quadraticCurveTo(-0.08, 0.08, -1, 0);
      c.quadraticCurveTo(-0.08, -0.08, 0, -1);
      c.closePath();
    },
    sun: (c) => poly(c, starPts(12, 0.68)),
    dot: (c) => c.arc(0, 0, 1, 0, TAU),
    heart: (c) => {
      c.moveTo(0, 0.9);
      c.bezierCurveTo(-1.5, -0.1, -0.85, -1.15, 0, -0.42);
      c.bezierCurveTo(0.85, -1.15, 1.5, -0.1, 0, 0.9);
      c.closePath();
    },
    moon: (c) => {
      /* Рога лежат точно на пересечении внешней окружности и внутренней (центр 0.5, радиус 0.82). */
      c.arc(0, 0, 1, 0.955, TAU - 0.955);
      c.arc(0.5, 0, 0.82, -1.476, 1.476, true);
      c.closePath();
    },
    petal: (c) => {
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6;
        c.moveTo(Math.cos(a) * 0.6 + 0.4, Math.sin(a) * 0.6);
        c.arc(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.4, 0, TAU);
      }
      c.moveTo(0.45, 0);
      c.arc(0, 0, 0.45, 0, TAU);
    },
    leaf: (c) => {
      c.moveTo(0, -1);
      c.bezierCurveTo(0.85, -0.45, 0.7, 0.5, 0, 1);
      c.bezierCurveTo(-0.7, 0.5, -0.85, -0.45, 0, -1);
      c.closePath();
    },
    drop: (c) => {
      c.moveTo(0, -1);
      c.bezierCurveTo(0.2, -0.4, 0.72, -0.1, 0.72, 0.32);
      c.arc(0, 0.32, 0.72, 0, Math.PI);
      c.bezierCurveTo(-0.72, -0.1, -0.2, -0.4, 0, -1);
      c.closePath();
    },
    bolt: (c) => poly(c, [[0.2, -1], [-0.55, 0.12], [-0.05, 0.12], [-0.25, 1], [0.55, -0.2], [0.05, -0.2], [0.42, -1]]),
    fish: (c) => {
      c.moveTo(-1, 0);
      c.quadraticCurveTo(-0.2, -0.75, 0.55, 0);
      c.lineTo(1, -0.42);
      c.lineTo(1, 0.42);
      c.lineTo(0.55, 0);
      c.quadraticCurveTo(-0.2, 0.75, -1, 0);
      c.closePath();
    },
    cloud: (c) => {
      [[-0.55, 0.2, 0.42], [0, -0.12, 0.52], [0.55, 0.22, 0.38]].forEach(([x, y, r]) => {
        c.moveTo(x + r, y);
        c.arc(x, y, r, 0, TAU);
      });
      c.rect(-0.55, 0.1, 1.1, 0.5);
    },
    flake: (c) => {
      const bar = (a, x0, y0, x1, y1) => {
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        poly(c, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [x * ca - y * sa, x * sa + y * ca]));
      };
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6;
        bar(a, 0, -0.07, 1, 0.07);
        bar(a + 0.8, 0, -0.05, 0.34, 0.05);
      }
    },
    bird: (c) => {
      c.moveTo(1, -0.05);
      c.quadraticCurveTo(0.55, -0.35, 0.2, -0.2);
      c.quadraticCurveTo(-0.1, -0.9, -0.75, -1);
      c.quadraticCurveTo(-0.45, -0.45, -0.35, -0.1);
      c.lineTo(-1, 0.15);
      c.quadraticCurveTo(-0.6, 0.12, -0.4, 0.15);
      c.lineTo(-0.95, 0.55);
      c.quadraticCurveTo(-0.2, 0.45, 0.2, 0.2);
      c.quadraticCurveTo(0.6, 0.15, 1, -0.05);
      c.closePath();
    },
    maple: (c) => {
      /* правая половина листа сверху вниз, левая получается зеркалом */
      const right = [
        [0, -1], [0.1, -0.76], [0.2, -0.8], [0.15, -0.5], [0.2, -0.3],
        [0.42, -0.48], [0.48, -0.62], [0.6, -0.5], [0.95, -0.56], [0.8, -0.32], [0.9, -0.22], [0.6, -0.04],
        [0.42, 0.06], [0.66, 0.2], [0.68, 0.42], [0.48, 0.36], [0.4, 0.5], [0.24, 0.36],
        [0.04, 0.5], [0.05, 1], [0.01, 1],
      ];
      const left = right.slice(1, -2).reverse().map(([x, y]) => [-x, y]);
      poly(c, [...right, [-0.02, 0.5], ...left]);
    },
    arch: (c) => {
      c.moveTo(-0.72, 1);
      c.lineTo(-0.72, -0.28);
      c.arc(0, -0.28, 0.72, Math.PI, 0);
      c.lineTo(0.72, 1);
      c.closePath();
    },
  };

  function stamp(ctx, shape, x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.scale(r, r);
    ctx.beginPath();
    SHAPES[shape](ctx);
    ctx.fill();
    ctx.restore();
  }

  /* ---------- раскладки: как разбросать фигуры по карточке ---------- */
  const LAYOUTS = {
    /* плотная стая в центре, к краям фигуры мельче */
    flock(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      const n = Math.round(170 * o.density);
      for (let i = 0; i < n; i++) {
        const gx = rng.gauss() * 0.2;
        const gy = rng.gauss() * 0.2;
        const dist = Math.hypot(gx, gy);
        const r = m * 0.03 * o.size * Math.max(0.3, 1.25 - dist * 2.2) * rng.range(0.6, 1.2);
        stamp(ctx, shape, w / 2 + gx * w, h / 2 + gy * h, r, rng.range(-0.6, 0.6));
      }
    },
    /* падают сверху вниз и растут */
    fall(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      const n = Math.round(90 * o.density);
      for (let i = 0; i < n; i++) {
        const t = Math.pow(rng(), 0.7);
        const x = rng() * w + (t - 0.5) * w * 0.25;
        stamp(ctx, shape, x, t * h, m * (0.012 + t * 0.055) * o.size * rng.range(0.7, 1.15), rng.range(-0.5, 0.5));
      }
    },
    /* ровное конфетти по всей площади */
    scatter(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      const step = (m * 0.13) / Math.sqrt(o.density);
      for (let y = step / 2; y < h; y += step) {
        for (let x = step / 2; x < w; x += step) {
          const r = m * 0.042 * o.size * rng.range(0.4, 1.1);
          stamp(ctx, shape, x + rng.range(-0.5, 0.5) * step, y + rng.range(-0.5, 0.5) * step, r, rng() * TAU);
        }
      }
    },
    /* лучи из центра */
    flare(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      const rays = Math.round(26 * Math.sqrt(o.density));
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * TAU + rng.range(-0.05, 0.05);
        const steps = Math.round(rng.range(5, 9));
        for (let k = 1; k <= steps; k++) {
          const d = (k / steps) * m * 0.62;
          stamp(ctx, shape, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, m * 0.008 * o.size * (2 + k * 0.9), a);
        }
      }
    },
    /* несколько колец вокруг центра */
    orbit(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      for (let ring = 1; ring <= 4; ring++) {
        const d = ring * m * 0.115;
        const n = Math.round(ring * 9 * o.density);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + ring;
          stamp(ctx, shape, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, m * (0.05 - ring * 0.008) * o.size, a);
        }
      }
    },
    /* правильная сетка в шахматном порядке */
    polka(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      const step = (m * 0.15) / Math.sqrt(o.density);
      let row = 0;
      for (let y = 0; y < h + step; y += step * 0.87, row++) {
        for (let x = row % 2 ? step / 2 : 0; x < w + step; x += step) {
          stamp(ctx, shape, x, y, step * 0.36 * o.size, 0);
        }
      }
    },
    /* одна большая фигура и мелкие спутники */
    solo(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      stamp(ctx, shape, w / 2, h / 2, m * 0.36 * o.size, 0);
      const n = Math.round(16 * o.density);
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU;
        const d = m * rng.range(0.44, 0.7);
        stamp(ctx, shape, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, m * rng.range(0.015, 0.05) * o.size, rng() * TAU);
      }
    },
    /* фигуры раскручиваются от центра и растут */
    spiral(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      const n = Math.round(90 * o.density);
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / n;
        const a = t * TAU * 2.7;
        const d = m * (0.05 + 0.38 * t);
        stamp(ctx, shape, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, m * (0.008 + 0.03 * t) * o.size * rng.range(0.75, 1.2), a);
      }
    },
    /* та же спираль, но редкая и из крупных фигур */
    spiralWide(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      const n = Math.round(34 * o.density);
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / n;
        const a = t * TAU * 1.8;
        const d = m * (0.08 + 0.34 * t);
        stamp(ctx, shape, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, m * (0.02 + 0.035 * t) * o.size, a + rng.range(-0.4, 0.4));
      }
    },
    /* венок: фигуры идут по кругу и смотрят вдоль него */
    ring(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      const n = Math.round(16 * o.density);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const d = m * 0.34 * rng.range(0.97, 1.03);
        stamp(ctx, shape, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, m * rng.range(0.04, 0.078) * o.size, a + Math.PI / 2 + rng.range(-0.25, 0.25));
      }
    },
    /* волна поперёк карточки */
    wave(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      const n = Math.round(150 * o.density);
      for (let i = 0; i < n; i++) {
        const t = rng();
        const y = h / 2 + Math.sin(t * TAU * 1.5) * h * 0.24 + rng.gauss() * h * 0.05;
        stamp(ctx, shape, t * w, y, m * rng.range(0.012, 0.04) * o.size, rng() * TAU);
      }
    },
    /* одна фигура по центру, без спутников */
    single(ctx, w, h, rng, o, shape) {
      stamp(ctx, shape, w / 2, h / 2, Math.min(w, h) * 0.32 * o.size, 0);
    },
    /* звёздное небо: стоят прямо, не налезают друг на друга */
    sky(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      const n = Math.round(60 * o.density);
      const gap = m * 0.075 / Math.sqrt(o.density);
      const pts = [];
      for (let tries = 0; pts.length < n && tries < n * 30; tries++) {
        const x = rng() * w;
        const y = rng() * h;
        if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < gap)) continue;
        pts.push([x, y]);
        stamp(ctx, shape, x, y, m * 0.026 * o.size * rng.range(0.75, 1.15), rng.range(-0.3, 0.3));
      }
    },
    /* вихрь: широкая спираль из звёзд разного размера и мелких точек */
    whirl(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      const n = Math.round(150 * o.density);
      for (let i = 0; i < n; i++) {
        const t = Math.sqrt(rng());
        const a = t * TAU * 2.1 + rng.range(-0.15, 0.15);
        const d = m * (0.04 + 0.36 * t) + rng.gauss() * m * 0.022;
        const x = w / 2 + Math.cos(a) * d;
        const y = h / 2 + Math.sin(a) * d;
        if (rng() < 0.3) stamp(ctx, 'dot', x, y, m * 0.006 * o.size, 0);
        else stamp(ctx, shape, x, y, m * o.size * (rng() < 0.15 ? rng.range(0.035, 0.05) : rng.range(0.01, 0.026)), rng() * TAU);
      }
    },
    /* туманность: плотное ядро из мелких звёзд и редкий ореол, больше вверх */
    nebula(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      const core = Math.round(160 * o.density);
      for (let i = 0; i < core; i++) {
        stamp(ctx, shape, w / 2 + rng.gauss() * m * 0.15, h * 0.55 + rng.gauss() * m * 0.08, m * 0.014 * o.size * rng.range(0.7, 1.2), rng.range(-0.5, 0.5));
      }
      const halo = Math.round(80 * o.density);
      for (let i = 0; i < halo; i++) {
        const y = h * 0.55 - Math.abs(rng.gauss()) * m * 0.3 + rng.gauss() * m * 0.05;
        stamp(ctx, shape, w / 2 + rng.gauss() * m * 0.26, y, m * 0.008 * o.size * rng.range(0.6, 1.2), rng() * TAU);
      }
    },
    /* хоровод: звёзды одного размера ровно по кругу, стоят прямо */
    crown(ctx, w, h, rng, o, shape) {
      const m = Math.min(w, h);
      const n = Math.max(5, Math.round(12 * o.density));
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / n) * TAU;
        stamp(ctx, shape, w / 2 + Math.cos(a) * m * 0.32, h / 2 + Math.sin(a) * m * 0.32, m * 0.05 * o.size, 0);
      }
    },
  };
  const scatterMotif =(shape, layout) => (ctx, w, h, rng, o) => LAYOUTS[layout](ctx, w, h, rng, o, shape);

  /* ---------- окна: одна крупная вырубка ---------- */
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }
  /* Марка по центру. Без ratio повторяет пропорции карточки, с ratio (ширина к высоте) держит свою форму. */
  const stampWindow = (ratio) => (ctx, w, h, rng, o) => {
    let pw = w * 0.74 * o.size;
    let ph = h * 0.74 * o.size;
    if (ratio) {
      ph = Math.min(h * 0.8, (w * 0.8) / ratio) * o.size;
      pw = ph * ratio;
    }
    const x = (w - pw) / 2;
    const y = (h - ph) / 2;
    perforatedRect(ctx, x, y, pw, ph, Math.min(w, h) * 0.024);
  };
  function perforatedRect(ctx, x, y, pw, ph, tooth) {
    ctx.fillRect(x, y, pw, ph);
    {
      /* выгрызаем зубцы по краю, как у почтовой марки */
      const nx = Math.round(pw / (tooth * 2.6));
      const ny = Math.round(ph / (tooth * 2.6));
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i <= nx; i++) {
        const px = x + (i / nx) * pw;
        for (const py of [y, y + ph]) { ctx.beginPath(); ctx.arc(px, py, tooth, 0, TAU); ctx.fill(); }
      }
      for (let i = 0; i <= ny; i++) {
        const py = y + (i / ny) * ph;
        for (const px of [x, x + pw]) { ctx.beginPath(); ctx.arc(px, py, tooth, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
  }
  const WINDOWS = {
    perforated: stampWindow(),
    stampTall: stampWindow(0.78),
    stampSquare: stampWindow(1),
    film(ctx, w, h, rng, o) {
      const n = Math.max(2, Math.round(3 * o.density));
      const fw = w * 0.62 * o.size;
      const x = (w - fw) / 2;
      const gap = h * 0.025;
      const fh = (h * 0.86 - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) rrect(ctx, x, h * 0.07 + i * (fh + gap), fw, fh, w * 0.012);
      const hole = w * 0.03;
      for (let y = h * 0.04; y < h * 0.96; y += hole * 2) {
        rrect(ctx, x - hole * 2.1, y, hole, hole * 1.2, hole * 0.2);
        rrect(ctx, x + fw + hole * 1.1, y, hole, hole * 1.2, hole * 0.2);
      }
    },
    blinds(ctx, w, h, rng, o) {
      const n = Math.round(9 * o.density);
      const band = h / n;
      for (let i = 0; i < n; i++) ctx.fillRect(0, i * band, w, band * 0.62 * o.size);
    },
    checker(ctx, w, h, rng, o) {
      const step = (Math.min(w, h) * 0.16) / Math.sqrt(o.density);
      for (let y = 0, r = 0; y < h; y += step, r++) {
        for (let x = r % 2 ? step : 0; x < w; x += step * 2) ctx.fillRect(x, y, step * o.size, step * o.size);
      }
    },
    trio(ctx, w, h, rng, o) {
      const r = Math.min(w, h) * 0.26 * o.size;
      [[0.5, 0.3], [0.32, 0.64], [0.68, 0.64]].forEach(([x, y]) => stamp(ctx, 'dot', w * x, h * y, r, 0));
    },
    shards(ctx, w, h, rng, o) {
      const n = Math.round(12 * o.density);
      for (let i = 0; i < n; i++) {
        const cx = rng() * w;
        const cy = rng() * h;
        const r = Math.min(w, h) * rng.range(0.08, 0.2) * o.size;
        const k = 3 + Math.floor(rng() * 3);
        ctx.beginPath();
        for (let j = 0; j < k; j++) {
          const a = (j / k) * TAU + rng.range(-0.4, 0.4);
          const d = r * rng.range(0.6, 1.2);
          ctx[j ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * d, cy + Math.sin(a) * d);
        }
        ctx.closePath();
        ctx.fill();
      }
    },
  };

  /* ---------- пиксели: рисунок прямо строками, # это закрашенная клетка ---------- */
  const SPRITES = {
    heart: ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'],
    cat: ['#.......#', '##.....##', '#########', '#.##.##.#', '#########', '###.#.###', '.#######.', '..#####..'],
    shroom: ['...####...', '.########.', '##.####.##', '##########', '.#.####.#.', '...####...', '...####...', '..######..'],
    ghost: ['..#####..', '.#######.', '##.###.##', '##.###.##', '#########', '#########', '#########', '#.##.##.#'],
    smile: ['..#####..', '.#######.', '##.###.##', '#########', '#.#####.#', '##.###.##', '.##...##.', '..#####..'],
    bird: ['.........###..', '........#####.', '###....#####..', '.####.######..', '..###########.', '...##########.', '....########..', '.....######...', '......#..#....', '.....##.##....'],
    tulip: ['...#...#...', '..###.###..', '..#######..', '..#######..', '...#####...', '....###....', '.....#.....', '.##..#..##.', '..##.#.##..', '...#####...', '.....#.....', '.....#.....'],
    eyes: ['#.....#...#.....#', '.#...#.....#...#.', '..###.......###..', '.#.#.#.....#.#.#.'],
    butterfly: ['.###.....###.', '#####...#####', '######.######', '######.######', '.#####.#####.', '..####.####..', '.#####.#####.', '#####...#####', '#####...#####', '.###.....###.'],
    bow: ['##.........##', '####.....####', '######.######', '#############', '######.######', '####.....####', '##.........##'],
    bigheart: ['..###...###..', '.#####.#####.', '#############', '#############', '#############', '.###########.', '..#########..', '...#######...', '....#####....', '.....###.....', '......#......'],
    spark: ['..#..', '.###.', '#####', '.###.', '..#..'],
    flake: ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#'],
    /* кот потягивается: голова и лапы слева внизу, попа и хвост справа вверху */
    catStretch: [
      '.............####.........',
      '............##..##........',
      '...........##.....#.......',
      '...................##.....',
      '....................##....',
      '....................##....',
      '....................##....',
      '...................###....',
      '..................####....',
      '.................#####....',
      '.#..#...........######....',
      '.####.........########....',
      '.#####......##########....',
      '.##################.###...',
      '..################..###...',
      '...##############...###...',
      '.#########..........###...',
      '##########..........##....',
    ],
    plus: ['.#.', '###', '.#.'],
    box: ['###', '#.#', '###'],
    /* заяц смотрит вправо: разбег, полёт, приземление */
    hare1: [
      '.............##.......',
      '..............##......',
      '...............##.....',
      '.......######.#####...',
      '.....###############..',
      '..#.################..',
      '...##############.....',
      '....###########.......',
      '...####...###.###.....',
      '..###....##....##.....',
      '.##.....##......##....',
    ],
    hare2: [
      '.............##.......',
      '..............##......',
      '...............###....',
      '......########.#####..',
      '..#.###############.##',
      '...###############....',
      '....#############.....',
      '...###.......####.....',
      '.###...........###....',
      '##...............###..',
      '......................',
    ],
    hare3: [
      '##....................',
      '.###..............#.#.',
      '..#####...........#.#.',
      '...#######........#.#.',
      '....##########....###.',
      '.....############.###.',
      '.......###############',
      '.........########.####',
      '...........######.###.',
      '.............##...##..',
      '............##...##...',
    ],
  };
  function sprite(ctx, rows, cx, cy, cell) {
    const ox = cx - (rows[0].length * cell) / 2;
    const oy = cy - (rows.length * cell) / 2;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '#') ctx.fillRect(Math.round(ox + x * cell), Math.round(oy + y * cell), Math.ceil(cell), Math.ceil(cell));
      }
    });
  }
  const pixelMotif = (name) => (ctx, w, h, rng, o) => {
    const m = Math.min(w, h);
    sprite(ctx, SPRITES[name], w / 2, h / 2, (m * 0.72 * o.size) / SPRITES[name][0].length);
    const n = Math.round(22 * o.density);
    const cell = m * 0.012 * o.size;
    for (let i = 0; i < n; i++) {
      const x = rng() * w;
      const y = rng() * h;
      if (Math.abs(x - w / 2) < m * 0.42 && Math.abs(y - h / 2) < m * 0.34) continue;
      ctx.fillRect(x, y, cell * 2, cell * 2);
    }
  };

  /* Спираль на клетках: точки кривой округляются до сетки. */
  function pixelSpiral(ctx, w, h, rng, o) {
    const m = Math.min(w, h);
    const cell = m * 0.03 * o.size;
    const seen = new Set();
    for (let a = 0; a < 23; a += 0.02) {
      const r = 0.9 + a * 0.62;
      const gx = Math.round(Math.cos(a) * r);
      const gy = Math.round(Math.sin(a) * r);
      const key = `${gx}:${gy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ctx.fillRect(Math.round(w / 2 + gx * cell), Math.round(h / 2 + gy * cell), Math.ceil(cell), Math.ceil(cell));
    }
    const n = Math.round(9 * o.density);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      const d = m * rng.range(0.42, 0.56);
      sprite(ctx, SPRITES.spark, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, cell * 0.6);
    }
  }

  /* Спираль на клетках с крестиками и квадратиками вокруг. */
  function pixelSpiralCross(ctx, w, h, rng, o) {
    const m = Math.min(w, h);
    const cell = m * 0.022 * o.size;
    const seen = new Set();
    for (let a = 0; a < 20; a += 0.02) {
      const r = 0.6 + a * 0.62;
      const gx = Math.round(Math.cos(a) * r);
      const gy = Math.round(Math.sin(a) * r);
      const key = `${gx}:${gy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ctx.fillRect(Math.round(w / 2 + gx * cell), Math.round(h / 2 + gy * cell), Math.ceil(cell), Math.ceil(cell));
    }
    const n = Math.round(7 * o.density);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      const d = m * rng.range(0.42, 0.56);
      sprite(ctx, rng() < 0.7 ? SPRITES.plus : SPRITES.box, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, cell);
    }
  }

  /* Пиксельный рисунок из круглых точек, как светодиодное табло. */
  function dotSprite(ctx, rows, cx, cy, cell) {
    const ox = cx - (rows[0].length * cell) / 2;
    const oy = cy - (rows.length * cell) / 2;
    ctx.beginPath();
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '#') continue;
        const px = ox + (x + 0.5) * cell;
        const py = oy + (y + 0.5) * cell;
        ctx.moveTo(px + cell * 0.44, py);
        ctx.arc(px, py, cell * 0.44, 0, TAU);
      }
    });
    ctx.fill();
  }
  /* Три зайца в прыжке: разбег, полёт, приземление. */
  function hares(ctx, w, h, rng, o) {
    const frames = [SPRITES.hare1, SPRITES.hare2, SPRITES.hare3];
    const cols = frames[0][0].length;
    const cell = (w * 0.98 * o.size) / (cols * 3 + 4);
    frames.forEach((rows, i) => {
      dotSprite(ctx, rows, w / 2 + (i - 1) * (cols + 2) * cell, h / 2 + (i === 1 ? -cell * 1.5 : 0), cell);
    });
  }

  /* Бантик из точек, как на светодиодном табло. Сначала рисуем ленту бантика на маленьком холсте,
     потом в каждую закрашенную клетку ставим точку. Петли плоские и полые, хвостики длинные, бантик чуть наклонён. */
  const BOW_GRID = 34;
  function bowRibbon(c, s) {
    /* единица: ширина бантика; узелок в (0,0) */
    const lobe = (k, wide) => {
      c.moveTo(0, 0);
      c.bezierCurveTo(k * 0.14 * s, -0.13 * s, k * wide * 0.9 * s, -0.16 * s, k * wide * s, -0.05 * s);
      c.bezierCurveTo(k * wide * 1.03 * s, 0.05 * s, k * 0.22 * s, 0.07 * s, 0, 0);
    };
    c.beginPath();
    lobe(-1, 0.48);
    lobe(1, 0.52);
    c.moveTo(-0.03 * s, 0.03 * s);
    c.bezierCurveTo(-0.07 * s, 0.2 * s, -0.04 * s, 0.38 * s, -0.12 * s, 0.6 * s);
    c.moveTo(0.04 * s, 0.03 * s);
    c.bezierCurveTo(0.08 * s, 0.22 * s, 0.06 * s, 0.42 * s, 0.14 * s, 0.66 * s);
    c.stroke();
    c.beginPath();
    c.ellipse(0, 0.01 * s, 0.045 * s, 0.035 * s, 0, 0, TAU);
    c.fill();
  }
  function dotBow(ctx, x, y, s, rot) {
    const cell = s / BOW_GRID;
    const n = BOW_GRID + 8;
    const low = document.createElement('canvas');
    low.width = n;
    low.height = n;
    const c = low.getContext('2d');
    c.translate(n / 2, n * 0.3);
    c.rotate(rot);
    c.strokeStyle = '#fff';
    c.fillStyle = '#fff';
    c.lineWidth = 1.7;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    bowRibbon(c, BOW_GRID);
    const d = c.getImageData(0, 0, n, n).data;
    const ox = x - (n / 2) * cell;
    const oy = y - n * 0.3 * cell;
    const r = cell * 0.4;
    ctx.beginPath();
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        if (d[(gy * n + gx) * 4 + 3] < 110) continue;
        const px = ox + (gx + 0.5) * cell;
        const py = oy + (gy + 0.5) * cell;
        ctx.moveTo(px + r, py);
        ctx.arc(px, py, r, 0, TAU);
      }
    }
    ctx.fill();
  }
  /* Два бантика из точек, вокруг искорки-звёздочки и ромбики. */
  function dotBows(ctx, w, h, rng, o) {
    const m = Math.min(w, h);
    const s = m * 0.44 * o.size;
    dotBow(ctx, w / 2 - m * 0.17 * o.size, h / 2 - m * 0.16 * o.size, s, -0.18);
    dotBow(ctx, w / 2 + m * 0.17 * o.size, h / 2 - m * 0.01 * o.size, s, -0.14);
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1, m * 0.004);
    const n = Math.round(9 * o.density);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      const d = m * rng.range(0.3, 0.48);
      const x = w / 2 + Math.cos(a) * d;
      const y = h / 2 + Math.sin(a) * d * 0.85;
      const r = m * rng.range(0.01, 0.02);
      if (i % 2) {
        /* ромбик контуром */
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.7, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.7, y);
        ctx.closePath();
        ctx.stroke();
      } else {
        /* тонкая четырёхлучевая искорка */
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r * 0.1, y - r * 0.1, x + r * 0.8, y);
        ctx.quadraticCurveTo(x + r * 0.1, y + r * 0.1, x, y + r);
        ctx.quadraticCurveTo(x - r * 0.1, y + r * 0.1, x - r * 0.8, y);
        ctx.quadraticCurveTo(x - r * 0.1, y - r * 0.1, x, y - r);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* Симметричный пиксельный узор: рисуем четверть кривыми по клеткам и отражаем. */
  function pixelOrnament(ctx, w, h, rng, o) {
    const cells = new Set();
    const put = (x, y) => cells.add(`${Math.round(x)}:${Math.round(y)}`);
    const curl = (cx, cy, r0, r1, a0, turns) => {
      const end = a0 + turns * TAU;
      for (let a = a0; Math.abs(a - a0) < Math.abs(end - a0); a += Math.sign(turns) * 0.03) {
        const r = r0 + (r1 - r0) * Math.abs((a - a0) / (end - a0));
        put(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
    };
    const line = (x0, y0, x1, y1) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
      for (let i = 0; i <= n; i++) put(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
    };
    /* верхний завиток и его хвост к центру: вместе с отражением выходит сердце */
    curl(-4, -8, 3.4, 0.9, 0.5, -1.3);
    line(-1, -6.3, 0, -4);
    /* боковой завиток и рука от него к центру */
    curl(-12.5, -4, 3, 0.8, 1.2, 1.3);
    line(-11.5, -1.2, -6, -1);
    /* диагональ: с отражением получается крест */
    line(-9.5, -7.5, -3.5, -2);
    /* маленькие кольца у центра и ромбик сверху */
    curl(-3, 0, 1.5, 1.5, 0, 1);
    put(0, -1); put(0, 0);
    put(0, -12); put(-1, -11); put(0, -10);
    [[-8, -11], [-15, -9], [-17, -1], [-6, -13], [-14, -12], [-7, -5]].forEach(([x, y]) => put(x, y));

    const m = Math.min(w, h);
    const cell = (m * 0.9 * o.size) / 36;
    const draw = new Set();
    cells.forEach((k) => {
      const [x, y] = k.split(':').map(Number);
      [[x, y], [-x, y], [x, -y], [-x, -y]].forEach(([a, b]) => draw.add(`${a}:${b}`));
    });
    draw.forEach((k) => {
      const [x, y] = k.split(':').map(Number);
      ctx.fillRect(Math.round(w / 2 + (x - 0.5) * cell), Math.round(h / 2 + (y - 0.5) * cell), Math.ceil(cell), Math.ceil(cell));
    });
    /* редкие пиксели вокруг */
    const n = Math.round(8 * o.density);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      const d = m * rng.range(0.44, 0.6);
      ctx.fillRect(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, cell, cell);
    }
  }

  /* Сбой: три пиксельные искры в столбик, строки сдвинуты, как на сломанном экране. */
  function glitchSparks(ctx, w, h, rng, o) {
    const m = Math.min(w, h);
    const cell = Math.max(1, Math.round(m * 0.014));
    const lw = Math.ceil(w / cell);
    const lh = Math.ceil(h / cell);
    const low = document.createElement('canvas');
    low.width = lw;
    low.height = lh;
    const lx = low.getContext('2d');
    lx.fillStyle = ctx.fillStyle;
    const s = (m / cell) * o.size;
    /* вытянутая искра, искра поменьше и тонкая звезда */
    [[0.3, 0.12, 1.7, 'spark', 0.1], [0.5, 0.09, 1.2, 'spark', -0.25], [0.71, 0.15, 1, 'thinstar', 0.3]].forEach(([y, r, stretch, shape, rot]) => {
      lx.save();
      lx.translate(lw / 2, lh * (0.5 + (y - 0.5) * o.size));
      lx.scale(stretch, 1);
      stamp(lx, shape, 0, 0, s * r, rot + rng.range(-0.2, 0.2));
      lx.restore();
    });
    /* без полутонов: клетка либо вырезана, либо нет */
    const img = lx.getImageData(0, 0, lw, lh);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 110 ? 255 : 0;
    lx.putImageData(img, 0, 0);

    /* режем на полосы и сдвигаем их вбок; иногда полоса оставляет след */
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < lh;) {
      const band = 1 + Math.floor(rng() * 3);
      const roll = rng();
      const shift = roll < 0.5 ? Math.round(rng.range(-3, 3)) : roll < 0.62 ? Math.round(rng.range(-9, 9)) : 0;
      ctx.drawImage(low, 0, y, lw, band, shift * cell, y * cell, lw * cell, band * cell);
      if (rng() < 0.08) ctx.drawImage(low, 0, y, lw, 1, (shift + Math.round(rng.range(4, 10)) * (rng() < 0.5 ? -1 : 1)) * cell, y * cell, lw * cell, cell);
      y += band;
    }
    ctx.restore();
  }

  /* Россыпь пиксельных звёзд и снежинок на неровной сетке. */
  function pixelMix(ctx, w, h, rng, o) {
    const m = Math.min(w, h);
    const step = (m * 0.26) / Math.sqrt(o.density);
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const flake = rng() > 0.5;
        const rows = flake ? SPRITES.flake : SPRITES.spark;
        const cell = (m * rng.range(0.012, 0.024) * o.size * 7) / rows.length;
        sprite(ctx, rows, x + rng.range(-0.3, 0.3) * step, y + rng.range(-0.3, 0.3) * step, cell);
      }
    }
  }

  /* Вышивка крестиком: каждая клетка рисунка это два диагональных стежка. */
  function crosses(ctx, x, y, cell) {
    const a = cell * 0.14;
    ctx.moveTo(x + a, y + a);
    ctx.lineTo(x + cell - a, y + cell - a);
    ctx.moveTo(x + cell - a, y + a);
    ctx.lineTo(x + a, y + cell - a);
  }
  const stitchMotif = (name) => (ctx, w, h, rng, o) => {
    const rows = SPRITES[name];
    const m = Math.min(w, h);
    const cell = (m * 0.8 * o.size) / Math.max(rows[0].length, rows.length);
    const ox = w / 2 - (rows[0].length * cell) / 2;
    const oy = h / 2 - (rows.length * cell) / 2;
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineWidth = cell * 0.3;
    ctx.beginPath();
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === '#') crosses(ctx, ox + x * cell, oy + y * cell, cell);
    });
    const n = Math.round(10 * o.density);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      const d = m * rng.range(0.46, 0.62);
      crosses(ctx, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, cell);
    }
    ctx.stroke();
  };

  /* ---------- вещи: силуэт предмета, детали прорезаны бумагой ---------- */
  /* Рисуем в своих единицах: центр карточки это (0,0), единица это 0.42 короткой стороны. */
  const thing = (fn) => (ctx, w, h, rng, o) => {
    const S = Math.min(w, h) * 0.42 * o.size;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(S, S);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    fn(ctx, rng, o);
    ctx.restore();
  };
  /* всё, что нарисовано внутри cut, вырезает уже нарисованное */
  function cut(c, fn) {
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    fn();
    c.restore();
  }
  const circle = (c, x, y, r) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); };
  const ring = (c, x, y, r, lw) => { c.beginPath(); circle(c, x, y, r); c.lineWidth = lw; c.stroke(); };
  /* зубцы по контуру: полукруглые выемки через равные промежутки */
  function perforate(c, pts, step, r) {
    cut(c, () => {
      let next = 0;
      let run = 0;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const L = Math.hypot(x1 - x0, y1 - y0);
        while (next <= run + L) {
          const t = (next - run) / L;
          circle(c, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r);
          next += step;
        }
        run += L;
      }
      c.fill();
    });
  }
  /* бусины по кривой Безье */
  function beads(c, p0, p1, p2, n, r0, r1, rng) {
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = (1 - t) * (1 - t) * p0[0] + 2 * t * (1 - t) * p1[0] + t * t * p2[0];
      const y = (1 - t) * (1 - t) * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1];
      circle(c, x, y, rng ? rng.range(r0, r1) : r0);
    }
    c.fill();
  }
  function spiralLine(c, x, y, R, turns, lw) {
    c.beginPath();
    for (let t = 0; t <= 1; t += 0.01) {
      const a = t * turns * TAU;
      c[t ? 'lineTo' : 'moveTo'](x + Math.cos(a) * R * t, y + Math.sin(a) * R * t);
    }
    c.lineWidth = lw;
    c.stroke();
  }
  const octagon = (x, y, r) => Array.from({ length: 8 }, (_, i) => [x + Math.cos(Math.PI / 8 + (i * TAU) / 8) * r, y + Math.sin(Math.PI / 8 + (i * TAU) / 8) * r]);

  const THINGS = {
    /* марка в форме цветка сакуры, со штемпелем */
    sakuraStamp(c) {
      const pts = [];
      for (let i = 0; i <= 500; i++) {
        const t = (i / 500) * TAU;
        const r = 0.95 * (0.6 + 0.4 * Math.pow(Math.abs(Math.cos(2.5 * t)), 0.5));
        pts.push([Math.cos(t - Math.PI / 2) * r, Math.sin(t - Math.PI / 2) * r]);
      }
      c.beginPath();
      poly(c, pts);
      c.fill();
      perforate(c, pts, 0.07, 0.024);
    },
    /* прямоугольная марка с двойной рамкой и штемпелем в углу */
    frameStamp(c) {
      const W = 0.7;
      const H = 0.9;
      c.fillRect(-W, -H, W * 2, H * 2);
      perforate(c, [[-W, -H], [W, -H], [W, H], [-W, H], [-W, -H]], 0.085, 0.03);
      cut(c, () => {
        c.lineWidth = 0.014;
        c.strokeRect(-W + 0.12, -H + 0.14, (W - 0.12) * 2, (H - 0.14) * 2);
        c.lineWidth = 0.007;
        c.strokeRect(-W + 0.145, -H + 0.165, (W - 0.145) * 2, (H - 0.165) * 2);
        c.beginPath();
        circle(c, -0.5, 0.5, 0.34);
        circle(c, -0.5, 0.5, 0.27);
        c.lineWidth = 0.016;
        c.stroke();
      });
    },
    /* телефон-раскладушка со звёздочкой на цепочке */
    flipPhone(c) {
      c.beginPath();
      c.roundRect(-0.4, -0.64, 0.8, 1.52, 0.2);
      c.roundRect(-0.38, -0.88, 0.15, 0.4, 0.06);
      c.fill();
      cut(c, () => {
        c.lineWidth = 0.022;
        c.moveTo(-0.4, 0.42); c.lineTo(0.4, 0.42);
        c.stroke();
        c.beginPath();
        for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) circle(c, -0.18 + k * 0.06, 0.6 + r * 0.055, 0.014);
        c.fill();
      });
      beads(c, [0.3, -0.62], [0.42, -0.82], [0.56, -0.95], 8, 0.018);
      stamp(c, 'fatstar', 0.62, -1.06, 0.15, 0.2);
    },
    /* клевер, звёзды и две спиральки */
    clover(c) {
      const cx = -0.15;
      const cy = -0.2;
      c.lineWidth = 0.055;
      c.beginPath();
      c.moveTo(cx, cy);
      c.quadraticCurveTo(cx + 0.12, cy + 0.55, cx + 0.42, cy + 1.0);
      c.stroke();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        const lx = cx + Math.cos(a) * 0.27;
        const ly = cy + Math.sin(a) * 0.27;
        stamp(c, 'heart', lx, ly, 0.32, a + Math.PI / 2);
        /* светлая полоска внутри листа, как у настоящего клевера */
        cut(c, () => {
          c.save();
          c.translate(lx, ly);
          c.rotate(a + Math.PI / 2);
          c.scale(0.16, 0.16);
          SHAPES.heart(c);
          c.restore();
          c.lineWidth = 0.022;
          c.stroke();
        });
      }
      [[0.55, -0.72, 0.2, 0.2], [-0.62, 0.05, 0.06, 0], [0.78, -0.3, 0.08, 0.4], [-0.5, 0.5, 0.09, -0.3]].forEach(([x, y, r, rot]) => stamp(c, 'fatstar', x, y, r, rot));
      spiralLine(c, 0.52, 0.25, 0.22, 2.4, 0.075);
      spiralLine(c, -0.32, 0.78, 0.2, 2.4, 0.07);
    },
    /* фотоаппарат-мыльница спереди: объектив кольцами, вспышка, кнопка сверху; сбоку свисает ремешок из бусин */
    camera(c, rng) {
      c.beginPath();
      c.roundRect(-0.75, -0.48, 1.3, 0.78, 0.1);
      c.roundRect(-0.6, -0.56, 0.22, 0.12, 0.03);
      c.fill();
      cut(c, () => {
        c.lineWidth = 0.022;
        circle(c, 0.1, -0.09, 0.3);
        c.stroke();
        c.beginPath();
        c.lineWidth = 0.016;
        circle(c, 0.1, -0.09, 0.22);
        circle(c, 0.1, -0.09, 0.13);
        c.stroke();
        c.beginPath();
        circle(c, 0.1, -0.09, 0.05);
        c.roundRect(-0.64, -0.38, 0.2, 0.1, 0.02);
        circle(c, 0.42, -0.36, 0.022);
        c.fill();
        c.beginPath();
        c.lineWidth = 0.014;
        c.moveTo(-0.6, 0.18); c.lineTo(-0.3, 0.18);
        c.stroke();
      });
      /* петелька и ремешок: бусины разного размера, внизу подвеска-яблочко */
      c.lineWidth = 0.016;
      c.beginPath();
      c.moveTo(0.55, -0.3); c.quadraticCurveTo(0.68, -0.32, 0.7, -0.2);
      c.stroke();
      const p0 = [0.7, -0.2];
      const p1 = [0.95, 0.5];
      const p2 = [0.2, 0.75];
      c.beginPath();
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        const x = (1 - t) * (1 - t) * p0[0] + 2 * t * (1 - t) * p1[0] + t * t * p2[0];
        const y = (1 - t) * (1 - t) * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1];
        circle(c, x, y, i % 3 === 1 ? rng.range(0.05, 0.06) : rng.range(0.028, 0.04));
      }
      c.fill();
      c.beginPath();
      c.moveTo(0.2, 0.75); c.lineTo(0.12, 0.84);
      c.stroke();
      c.beginPath();
      circle(c, 0.06, 0.95, 0.1);
      c.fill();
      stamp(c, 'leaf', 0.12, 0.82, 0.05, 0.8);
    },
    /* карманный питомец в виде яйца на шариковой цепочке */
    pocketPet(c) {
      c.beginPath();
      c.moveTo(0, -0.62);
      c.bezierCurveTo(0.42, -0.62, 0.58, -0.05, 0.55, 0.25);
      c.bezierCurveTo(0.52, 0.62, 0.25, 0.75, 0, 0.75);
      c.bezierCurveTo(-0.25, 0.75, -0.52, 0.62, -0.55, 0.25);
      c.bezierCurveTo(-0.58, -0.05, -0.42, -0.62, 0, -0.62);
      c.fill();
      ring(c, 0, -0.67, 0.06, 0.04);
      cut(c, () => {
        c.lineWidth = 0.026;
        c.strokeRect(-0.24, -0.26, 0.48, 0.44);
        c.beginPath();
        c.lineWidth = 0.014;
        c.moveTo(-0.5, -0.2);
        [[-0.38, -0.36], [-0.24, -0.3], [-0.1, -0.42], [0.05, -0.32], [0.2, -0.42], [0.34, -0.32], [0.5, -0.22]].forEach(([x, y]) => c.lineTo(x, y));
        c.stroke();
        c.beginPath();
        c.save();
        c.translate(0, -0.03);
        c.scale(0.17, 0.17);
        poly(c, starPts(5, 0.45));
        c.restore();
        c.lineWidth = 0.012;
        c.stroke();
        c.beginPath();
        [-0.18, 0, 0.18].forEach((x) => circle(c, x, 0.44, 0.055));
        c.lineWidth = 0.02;
        c.stroke();
      });
      beads(c, [0.04, -0.74], [0.5, -1.2], [0.86, -0.45], 22, 0.026);
      c.beginPath();
      c.roundRect(0.82, -0.47, 0.06, 0.14, 0.02);
      c.fill();
    },
    /* аудиокассета */
    cassette(c) {
      c.beginPath();
      c.roundRect(-0.85, -0.53, 1.7, 1.06, 0.05);
      c.fill();
      cut(c, () => {
        [[-0.78, -0.46], [0.78, -0.46], [-0.78, 0.46], [0.78, 0.46], [0, 0.46]].forEach(([x, y]) => circle(c, x, y, 0.026));
        c.roundRect(-0.15, -0.16, 0.3, 0.12, 0.02);
        c.fill();
        c.beginPath();
        circle(c, -0.33, -0.1, 0.085);
        circle(c, 0.33, -0.1, 0.085);
        c.lineWidth = 0.04;
        c.stroke();
        c.beginPath();
        c.lineWidth = 0.014;
        c.roundRect(-0.72, -0.43, 1.44, 0.64, 0.04);
        c.moveTo(-0.72, 0.1); c.lineTo(0.72, 0.1);
        c.moveTo(-0.58, 0.53); c.lineTo(-0.48, 0.3); c.lineTo(0.48, 0.3); c.lineTo(0.58, 0.53);
        c.stroke();
        c.beginPath();
        c.lineWidth = 0.02;
        c.moveTo(-0.3, -0.31);
        for (let x = -0.3; x <= 0.3; x += 0.03) c.lineTo(x, -0.31 + Math.sin(x * 40) * 0.02);
        c.stroke();
        c.beginPath();
        [-0.3, -0.2, 0.2, 0.3].forEach((x) => circle(c, x, 0.43, 0.03));
        c.fill();
      });
    },
    /* мордочка кота растром: размер точки зависит от тени, вокруг кайма наклейки */
    halftoneCat(c) {
      const head = new Path2D();
      head.moveTo(-0.62, -0.05);
      head.lineTo(-0.6, -0.78);
      head.lineTo(-0.28, -0.47);
      head.quadraticCurveTo(0, -0.57, 0.28, -0.47);
      head.lineTo(0.6, -0.78);
      head.lineTo(0.62, -0.05);
      head.bezierCurveTo(0.7, 0.35, 0.4, 0.62, 0, 0.62);
      head.bezierCurveTo(-0.4, 0.62, -0.7, 0.35, -0.62, -0.05);
      head.closePath();
      c.save();
      c.clip(head);
      const step = 0.046;
      c.beginPath();
      for (let y = -0.8; y < 0.65; y += step) {
        for (let x = -0.7; x < 0.7; x += step) {
          let d = 0.1 + 0.55 * Math.min(1, Math.hypot(x / 0.65, (y - 0.05) / 0.6) ** 3);
          if (y < -0.08) d += 0.35 * Math.max(0, Math.sin(x * 16)) * Math.min(1, (-0.08 - y) * 4);
          for (const s of [-1, 1]) {
            const ex = (x - s * 0.28) / 0.16;
            if (Math.abs(ex) < 1 && Math.abs(y - (0.02 - 0.05 * ex * ex)) < 0.035) d = 1;
          }
          if (Math.hypot(x / 0.26, (y - 0.28) / 0.17) < 1) d *= 0.3;
          if (Math.hypot(x / 0.07, (y - 0.2) / 0.04) < 1) d = 0.9;
          if (Math.abs(y - 0.36) < 0.025 && Math.abs(x) < 0.07) d = 0.8;
          if (d > 0.04) circle(c, x, y, step * 0.6 * Math.sqrt(Math.min(1, d)));
        }
      }
      c.fill();
      c.restore();
      c.save();
      c.scale(1.08, 1.08);
      c.lineWidth = 0.022;
      c.stroke(head);
      c.restore();
    },
    /* раскрытый блокнот сверху: страницы прогибаются к корешку, на них линейка, снизу ленточка, сбоку ручка */
    notebook(c) {
      const page = (s) => {
        c.moveTo(0, -0.5);
        c.quadraticCurveTo(s * 0.35, -0.62, s * 0.78, -0.56);
        c.lineTo(s * 0.78, 0.5);
        c.quadraticCurveTo(s * 0.35, 0.44, 0, 0.56);
        c.closePath();
      };
      /* обложка чуть больше страниц */
      c.beginPath();
      c.roundRect(-0.84, -0.6, 1.68, 1.22, 0.05);
      c.fill();
      cut(c, () => {
        c.lineWidth = 0.016;
        page(-1);
        page(1);
        c.stroke();
        c.beginPath();
        c.lineWidth = 0.008;
        for (let i = 1; i < 10; i++) {
          const t = i / 10;
          for (const s of [-1, 1]) {
            c.moveTo(s * 0.08, -0.5 + t * 1.04);
            c.quadraticCurveTo(s * 0.38, -0.6 + t * 1.04, s * 0.7, -0.54 + t * 1.02);
          }
        }
        c.stroke();
        /* резинка на правой странице */
        c.beginPath();
        c.lineWidth = 0.012;
        c.moveTo(0.6, -0.6); c.lineTo(0.6, 0.62);
        c.moveTo(0.66, -0.6); c.lineTo(0.66, 0.62);
        c.stroke();
      });
      /* ленточка-закладка с раздвоенным концом */
      c.beginPath();
      c.moveTo(-0.02, 0.56);
      c.quadraticCurveTo(0.02, 0.75, -0.12, 0.92);
      c.lineTo(-0.16, 0.86);
      c.lineTo(-0.2, 0.9);
      c.quadraticCurveTo(-0.06, 0.74, -0.07, 0.56);
      c.closePath();
      c.fill();
      /* ручка справа */
      c.beginPath();
      c.roundRect(0.9, -0.55, 0.075, 1.0, 0.035);
      c.fill();
      c.beginPath();
      c.moveTo(0.9, 0.45); c.lineTo(0.9375, 0.58); c.lineTo(0.975, 0.45);
      c.fill();
      cut(c, () => {
        c.lineWidth = 0.012;
        c.moveTo(0.9, 0.3); c.lineTo(0.975, 0.3);
        c.stroke();
      });
    },
    /* два яблока с хвостиками и бантиками: в одном прорезана искра, в другом сердечко */
    apples(c) {
      const apple = (x, y, k, rot, inside) => {
        c.save();
        c.translate(x, y);
        c.rotate(rot);
        c.scale(k, k);
        c.beginPath();
        c.moveTo(0, -0.52);
        c.bezierCurveTo(0.25, -0.75, 0.75, -0.6, 0.72, -0.05);
        c.bezierCurveTo(0.7, 0.45, 0.45, 0.75, 0.2, 0.72);
        c.quadraticCurveTo(0, 0.64, -0.2, 0.72);
        c.bezierCurveTo(-0.45, 0.75, -0.7, 0.45, -0.72, -0.05);
        c.bezierCurveTo(-0.75, -0.6, -0.25, -0.75, 0, -0.52);
        c.fill();
        c.lineWidth = 0.055;
        c.beginPath();
        c.moveTo(0, -0.5);
        c.quadraticCurveTo(-0.02, -0.7, 0.04, -0.9);
        c.stroke();
        c.lineWidth = 0.03;
        c.beginPath();
        c.moveTo(0.03, -0.62);
        c.bezierCurveTo(0.35, -1.05, 0.62, -0.85, 0.06, -0.62);
        c.quadraticCurveTo(0.45, -0.55, 0.62, -0.32);
        c.stroke();
        cut(c, () => {
          c.save();
          if (inside === 'spark') {
            c.scale(0.22, 0.3);
            SHAPES.spark(c);
          } else {
            c.translate(0, 0.02);
            c.scale(0.14, 0.14);
            SHAPES.heart(c);
          }
          c.restore();
          c.fill();
        });
        c.restore();
      };
      apple(-0.42, -0.12, 0.62, -0.08, 'spark');
      apple(0.45, 0.22, 0.56, 0.12, 'heart');
      stamp(c, 'spark', 0.12, -0.78, 0.09, 0);
      stamp(c, 'spark', 0.98, -0.12, 0.06, 0);
      stamp(c, 'spark', 0.82, 0.78, 0.05, 0);
    },
    /* бумажные наушники и молнии */
    headphones(c) {
      c.lineJoin = 'miter';
      c.lineWidth = 0.18;
      c.beginPath();
      [[-0.55, 0.2], [-0.62, -0.3], [-0.42, -0.66], [-0.1, -0.82], [0.25, -0.8], [0.52, -0.6], [0.64, -0.25], [0.58, 0.2]].forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x, y));
      c.stroke();
      c.beginPath();
      poly(c, octagon(-0.64, 0.36, 0.3));
      poly(c, octagon(-0.48, 0.42, 0.34));
      poly(c, octagon(0.68, 0.34, 0.3));
      poly(c, octagon(0.52, 0.42, 0.34));
      c.fill();
      cut(c, () => {
        poly(c, octagon(-0.48, 0.42, 0.34));
        poly(c, octagon(0.52, 0.42, 0.34));
        c.lineWidth = 0.018;
        c.stroke();
        c.beginPath();
        c.moveTo(-0.48, 0.08); c.lineTo(-0.48, 0.76);
        c.moveTo(0.52, 0.08); c.lineTo(0.52, 0.76);
        c.lineWidth = 0.01;
        c.stroke();
      });
      stamp(c, 'bolt', -0.92, -0.42, 0.26, -0.7);
      stamp(c, 'bolt', -0.6, -0.86, 0.2, -0.4);
      stamp(c, 'bolt', -0.25, -1.02, 0.17, -0.15);
    },
  };

  /* ---------- слова: буквы тоже становятся окнами ---------- */
  /* Шрифты для слов. Новый шрифт: подключи его в index.html или style.css и допиши сюда строку. */
  const WORD_FONTS = [
    { id: 'sexsmith', name: 'Sexsmith', css: '"Sexsmith", Georgia, serif', weight: 400 },
    { id: 'stezhok', name: 'Stezhok', css: '"Stezhok", Georgia, serif', weight: 400, only: 'cyrillic', sample: 'ТВОЁ СЛОВО' },
    { id: 'cethik', name: 'Cethik', css: '"Cethik", Georgia, serif', weight: 400, only: 'latin' },
    { id: 'drowner', name: 'Drowner', css: '"Drowner", Georgia, serif', weight: 400, only: 'latin' },
    { id: 'dreamer', name: 'Dreamer', css: '"Dreamer TM", Georgia, serif', weight: 400, only: 'latin' },
    { id: 'retrogression', name: 'Retrogression', css: '"Retrogression", Georgia, serif', weight: 400 },
  ];
  const wordFont = (id) => WORD_FONTS.find((f) => f.id === id) || WORD_FONTS[0];

  function fitWord(ctx, text, maxW, maxH, font) {
    let size = maxH;
    ctx.font = `${font.weight} ${size}px ${font.css}`;
    const measured = ctx.measureText(text).width || 1;
    size = Math.min(size, (size * maxW) / measured);
    ctx.font = `${font.weight} ${size}px ${font.css}`;
    return size;
  }
  const wordBig = (word) => (ctx, w, h, rng, o) => {
    const font = wordFont(o.font);
    const text = (o.text || font.sample || word).trim() || word;
    const lines = text.split(/\s+/);
    const lineH = (h * 0.8) / lines.length;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      fitWord(ctx, line, w * 0.92 * o.size, lineH, font);
      ctx.fillText(line, w / 2, h * 0.1 + lineH * (i + 0.5));
    });
  };
  const wordRepeat = (word) => (ctx, w, h, rng, o) => {
    const font = wordFont(o.font);
    const text = (o.text || font.sample || word).trim() || word;
    const rows = Math.max(3, Math.round(7 * o.density));
    const rowH = h / rows;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `${font.weight} ${rowH * 0.95 * o.size}px ${font.css}`;
    const unit = ctx.measureText(text + ' ').width || 1;
    for (let r = 0; r < rows; r++) {
      for (let x = -((r * unit) / 3) % unit - unit; x < w; x += unit) ctx.fillText(text, x, rowH * (r + 0.5));
    }
  };

  /* Клавиши: каждая буква на своей клавише, клавиши в почти квадратной сетке.
     Клавиша вырезана, буква и край верхней грани остаются бумагой. Пробел становится клавишей со звёздочкой. */
  const keycaps = (word) => (ctx, w, h, rng, o) => {
    const font = wordFont(o.font);
    const text = ((o.text || word).trim() || word).toUpperCase();
    /* несколько коротких слов: каждое в своём ряду, короткие ряды спереди добираем звёздочками.
       иначе: сплошная почти квадратная сетка, пробел становится звёздочкой */
    const words = text.split(/\s+/);
    const longest = Math.max(...words.map((t) => [...t].length));
    let keys;
    let cols;
    if (words.length > 1 && longest <= 8) {
      cols = longest;
      keys = words.flatMap((t) => [...'*'.repeat(cols - [...t].length), ...t]);
    } else {
      keys = [...text.replace(/\s+/g, '*')];
      cols = Math.ceil(Math.sqrt(keys.length));
    }
    const rows = Math.ceil(keys.length / cols);
    const size = Math.min((w * 0.88) / cols, (h * 0.88) / rows) * o.size;
    const gap = size * 0.05;
    const k = size - gap;
    const ox = w / 2 - (cols * size) / 2 + gap / 2;
    const oy = h / 2 - (rows * size) / 2 + gap / 2;
    ctx.save();
    keys.forEach((ch, i) => {
      const x = ox + (i % cols) * size;
      const y = oy + Math.floor(i / cols) * size;
      ctx.beginPath();
      ctx.roundRect(x, y, k, k, k * 0.1);
      ctx.fill();
      /* верхняя грань меньше основания и сдвинута вверх, между ними скос */
      const fx = x + k * 0.14;
      const fy = y + k * 0.07;
      const fw = k * 0.72;
      const fh = k * 0.7;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = Math.max(1, k * 0.022);
      ctx.beginPath();
      ctx.roundRect(fx, fy, fw, fh, k * 0.09);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, k * 0.014);
      ctx.beginPath();
      [[x, y, fx, fy], [x + k, y, fx + fw, fy], [x, y + k, fx, fy + fh], [x + k, y + k, fx + fw, fy + fh]].forEach(([a, b, c2, d]) => {
        ctx.moveTo(a + (c2 - a) * 0.25, b + (d - b) * 0.25);
        ctx.lineTo(c2 - (c2 - a) * 0.15, d - (d - b) * 0.15);
      });
      ctx.stroke();
      if (ch === '*') {
        stamp(ctx, 'spark', fx + fw * 0.3, fy + fh * 0.72, k * 0.09, 0);
      } else {
        ctx.font = `${font.weight} ${fh * 0.58}px ${font.css}`;
        const mw = ctx.measureText(ch).width || 1;
        if (mw > fw * 0.8) ctx.font = `${font.weight} ${(fh * 0.58 * fw * 0.8) / mw}px ${font.css}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ch, fx + fw / 2, fy + fh * 0.48);
      }
      ctx.restore();
    });
    ctx.restore();
  };

  /* Игральная карта-туз: карта вырезана, сквозь неё видно фото.
     Бумагой остаются буква и сердечко в углах, большое сердце в центре и твой текст над и под ним.
     Текст делится на две строки по знаку / или пополам по словам. */
  const playingCard = (phrase) => (ctx, w, h, rng, o) => {
    const font = wordFont(o.font);
    const text = (o.text || phrase).trim() || phrase;
    let lines = text.split('/').map((t) => t.trim()).filter(Boolean);
    if (lines.length === 1) {
      const words = text.split(/\s+/);
      const half = Math.ceil(words.length / 2);
      lines = words.length > 1 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : [text];
    }
    const S = Math.min(w / 1.4, h / 1.95) * o.size;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.05);
    ctx.scale(S, S);
    ctx.beginPath();
    ctx.roundRect(-0.62, -0.87, 1.24, 1.74, 0.07);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    /* текст рисуем в пикселях: крошечный кегль внутри масштаба некоторые браузеры округляют */
    const label = (str, x, y, size, maxW, css, weight, rot = 0) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(1 / S, 1 / S);
      let px = size * S;
      ctx.font = `${weight} ${px}px ${css}`;
      const mw = ctx.measureText(str).width || 1;
      if (mw > maxW * S) {
        px *= (maxW * S) / mw;
        ctx.font = `${weight} ${px}px ${css}`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(str, 0, 0);
      ctx.restore();
    };
    for (const [x, y, rot] of [[-0.48, -0.66, 0], [0.48, 0.66, Math.PI]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      label('A', 0, 0, 0.2, 0.2, 'Georgia, "Times New Roman", serif', 700);
      stamp(ctx, 'heart', 0, 0.2, 0.075, 0);
      ctx.restore();
    }
    stamp(ctx, 'heart', 0, 0.03, 0.22, 0);
    if (lines[0]) label(lines[0], 0, -0.3, 0.12, 0.96, font.css, font.weight);
    if (lines[1]) label(lines[1], 0, 0.36, 0.12, 0.96, font.css, font.weight);
    ctx.restore();
  };

  /* Созвездие: цепочка звёзд разного размера, соединённых тонкой линией. «Перемешать» даёт новое. */
  function constellation(ctx, w, h, rng, o) {
    const m = Math.min(w, h);
    const n = Math.max(5, Math.round(12 * o.density));
    const pts = [];
    /* каждая следующая звезда не ближе minGap ко всем прежним, иначе две сливаются в одну пару */
    const minGap = Math.min(w * 0.6 / n, m * 0.12);
    let y = h * rng.range(0.25, 0.45);
    for (let i = 0; i < n; i++) {
      let x;
      let ny;
      for (let tries = 0; tries < 20; tries++) {
        x = w * (0.1 + (0.8 * i) / (n - 1)) + rng.range(-0.03, 0.03) * w;
        ny = Math.min(h * 0.82, Math.max(h * 0.18, y + rng.range(-0.2, 0.2) * h));
        if (pts.every(([px, py]) => Math.hypot(px - x, py - ny) >= minGap)) break;
      }
      y = ny;
      pts.push([x, y]);
    }
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1, m * 0.0035);
    ctx.beginPath();
    pts.forEach(([x, py], i) => ctx[i ? 'lineTo' : 'moveTo'](x, py));
    ctx.stroke();
    ctx.restore();
    pts.forEach(([x, py]) => stamp(ctx, 'star', x, py, m * rng.range(0.022, 0.042) * o.size, rng.range(-0.3, 0.3)));
    starWords(ctx, pts, o, m);
  }

  /* ---------- текст на созвездиях: слова из поля «Своё слово» встают рядом со звёздами ---------- */
  function textWords(o) {
    return (o.text || '').trim().split(/\s+/).filter(Boolean);
  }
  function label(ctx, text, x, y, size, o, align = 'left') {
    const font = wordFont(o.font);
    ctx.font = `${font.weight} ${size}px ${font.css}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }
  /* слова раскладываются по звёздам через равный шаг, справа сверху от звезды */
  function starWords(ctx, pts, o, m) {
    const list = textWords(o);
    if (!list.length || !pts.length) return;
    const step = Math.max(1, Math.floor(pts.length / list.length));
    list.forEach((wd, i) => {
      const [x, y] = pts[Math.min(pts.length - 1, i * step + Math.floor(step / 2))];
      label(ctx, wd, x + m * 0.04, y - m * 0.035, m * 0.05 * o.size, o);
    });
  }

  /* Несколько отдельных созвездий с ветками: каждая новая звезда цепляется к одной из прежних. */
  function constellationWeb(ctx, w, h, rng, o) {
    const m = Math.min(w, h);
    const groups = Math.max(2, Math.round(3 * o.density));
    const all = [];
    const lines = [];
    const spots = [[0.25, 0.3], [0.72, 0.28], [0.3, 0.72], [0.72, 0.7], [0.5, 0.5]];
    for (let g = 0; g < groups; g++) {
      const [sx, sy] = spots[g % spots.length];
      const pts = [[w * sx + rng.range(-0.05, 0.05) * w, h * sy + rng.range(-0.05, 0.05) * h]];
      const n = 4 + Math.floor(rng() * 4);
      for (let i = 1; i < n; i++) {
        const from = pts[Math.floor(rng() * pts.length)];
        const a = rng() * Math.PI * 2;
        const d = m * rng.range(0.1, 0.2);
        const p = [Math.min(w * 0.95, Math.max(w * 0.05, from[0] + Math.cos(a) * d)), Math.min(h * 0.95, Math.max(h * 0.05, from[1] + Math.sin(a) * d))];
        pts.push(p);
        lines.push([from, p]);
      }
      all.push(...pts);
    }
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1, m * 0.003);
    ctx.beginPath();
    lines.forEach(([a, b]) => { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); });
    ctx.stroke();
    ctx.restore();
    all.forEach(([x, y]) => stamp(ctx, 'star', x, y, m * o.size * (rng() < 0.25 ? rng.range(0.038, 0.05) : rng.range(0.018, 0.032)), rng.range(-0.3, 0.3)));
    starWords(ctx, all, o, m);
  }

  /* Сеть: звёзды по всей карточке, каждая связана с двумя ближайшими и одной дальней, линии пересекаются.
     Слова встают на середины линий. */
  function starNetwork(ctx, w, h, rng, o) {
    const m = Math.min(w, h);
    const n = Math.max(8, Math.round(15 * o.density));
    const pts = [];
    for (let tries = 0; pts.length < n && tries < n * 40; tries++) {
      const p = [w * rng.range(0.07, 0.93), h * rng.range(0.07, 0.93)];
      if (pts.every(([x, y]) => Math.hypot(x - p[0], y - p[1]) > m * 0.13)) pts.push(p);
    }
    const edges = new Set();
    pts.forEach((p, i) => {
      const order = pts.map((q, j) => [Math.hypot(q[0] - p[0], q[1] - p[1]), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]);
      [order[0], order[1], order[2 + Math.floor(rng() * 3)]].filter(Boolean).forEach(([, j]) => edges.add(i < j ? `${i}-${j}` : `${j}-${i}`));
    });
    const pairs = [...edges].map((k) => k.split('-').map(Number));
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1, m * 0.0028);
    ctx.beginPath();
    pairs.forEach(([a, b]) => { ctx.moveTo(pts[a][0], pts[a][1]); ctx.lineTo(pts[b][0], pts[b][1]); });
    ctx.stroke();
    ctx.restore();
    pts.forEach(([x, y]) => stamp(ctx, 'star', x, y, m * rng.range(0.022, 0.032) * o.size, rng.range(-0.25, 0.25)));
    const list = textWords(o);
    if (!list.length) return;
    const step = Math.max(1, Math.floor(pairs.length / list.length));
    list.forEach((wd, i) => {
      const [a, b] = pairs[(i * step) % pairs.length];
      label(ctx, wd, (pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2 - m * 0.02, m * 0.045 * o.size, o, 'center');
    });
  }

  /* Слова-созвездие: каждое слово это точка, точки соединены по порядку, слово подписано рядом. */
  const wordConstellation = (phrase) => (ctx, w, h, rng, o) => {
    const m = Math.min(w, h);
    const list = textWords(o).length ? textWords(o) : phrase.split(' ');
    /* расстояние от точки до отрезка: новая точка не должна лечь на старую линию, а новая линия не должна пройти через старую точку */
    const segDist = ([px, py], [ax, ay], [bx, by]) => {
      const vx = bx - ax;
      const vy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
      return Math.hypot(px - ax - vx * t, py - ay - vy * t);
    };
    const pts = [];
    for (let i = 0; i < list.length; i++) {
      let p;
      for (let tries = 0; tries < 120; tries++) {
        p = [w * rng.range(0.12, 0.82), h * rng.range(0.15, 0.85)];
        const prev = pts[pts.length - 1];
        const near = prev ? Math.hypot(prev[0] - p[0], prev[1] - p[1]) : m * 0.3;
        if (near > m * 0.42) continue;
        if (!pts.every(([x, y]) => Math.hypot(x - p[0], y - p[1]) > m * 0.16)) continue;
        const clearOfLines = pts.slice(0, -1).every((a, k) => segDist(p, a, pts[k + 1]) > m * 0.07);
        const clearOfPoints = !prev || pts.slice(0, -1).every((q) => segDist(q, prev, p) > m * 0.07);
        if (clearOfLines && clearOfPoints) break;
      }
      pts.push(p);
    }
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1.5, m * 0.006 * o.size);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
    ctx.stroke();
    ctx.restore();
    const size = m * 0.075 * o.size;
    ctx.beginPath();
    pts.forEach(([x, y]) => { ctx.moveTo(x + m * 0.014, y); ctx.arc(x, y, m * 0.014 * o.size, 0, Math.PI * 2); });
    ctx.fill();
    /* подпись встаёт с противоположной стороны от соседних точек, чтобы не лечь на линии */
    pts.forEach(([x, y], i) => {
      const near = [pts[i - 1], pts[i + 1]].filter(Boolean);
      let dx = 0;
      let dy = 0;
      near.forEach(([nx, ny]) => {
        const len = Math.hypot(nx - x, ny - y) || 1;
        dx += (nx - x) / len;
        dy += (ny - y) / len;
      });
      let len = Math.hypot(dx, dy);
      if (len < 0.2) { dx = 0; dy = -1; len = 1; }
      const ux = -dx / len;
      const uy = -dy / len;
      ctx.font = `${wordFont(o.font).weight} ${size}px ${wordFont(o.font).css}`;
      const tw = ctx.measureText(list[i]).width;
      const lx = Math.min(w - tw / 2 - size * 0.2, Math.max(tw / 2 + size * 0.2, x + ux * (tw / 2 + size * 0.35)));
      const ly = Math.min(h - size * 0.6, Math.max(size * 0.6, y + uy * size * 0.75));
      label(ctx, list[i], lx, ly, size, o, 'center');
    });
  };

  /* Звезда как вырезанная руками: 4 или 5 лучей разной длины, вогнутые стороны, кончики чуть скошены. */
  function cutStar(ctx, x, y, r, rot, rng) {
    const k = rng() < 0.3 ? 5 : 4;
    const tips = Array.from({ length: k }, (_, i) => {
      const a = rot + (i / k) * Math.PI * 2 + rng.range(-0.18, 0.18);
      return [a, r * rng.range(0.78, 1.15)];
    });
    const inner = r * rng.range(0.22, 0.3);
    ctx.beginPath();
    tips.forEach(([a, len], i) => {
      const tx = x + Math.cos(a) * len;
      const ty = y + Math.sin(a) * len;
      const next = tips[(i + 1) % k];
      const mid = (a + next[0] + (i === k - 1 ? Math.PI * 2 : 0)) / 2;
      if (!i) ctx.moveTo(tx, ty);
      /* вогнутая сторона: изгиб через точку у середины между лучами */
      ctx.quadraticCurveTo(x + Math.cos(mid) * inner, y + Math.sin(mid) * inner, x + Math.cos(next[0]) * next[1], y + Math.sin(next[0]) * next[1]);
    });
    ctx.closePath();
    ctx.fill();
  }

  /* Гирлянда: неровные звёзды по кругу, нитка провисает дугой от звезды к звезде, сверху справа разрыв. */
  function sparkGarland(ctx, w, h, rng, o) {
    const m = Math.min(w, h);
    const r = m * 0.25 * o.size;
    const n = Math.max(6, Math.round(12 * o.density));
    const start = -Math.PI * 0.32;
    const span = Math.PI * 2 - 0.55;
    const stars = Array.from({ length: n }, (_, i) => {
      const a = start + (i / (n - 1)) * span + rng.range(-0.06, 0.06);
      const rr = r * rng.range(0.94, 1.06);
      /* слева и снизу звёзды крупнее, как в оригинале */
      const heavy = 0.5 + 0.5 * Math.cos(a - Math.PI * 0.75);
      const size = m * o.size * (0.024 + 0.024 * heavy * rng.range(0.7, 1.2) + (rng() < 0.2 ? 0.008 : 0));
      return { x: w / 2 + Math.cos(a) * rr, y: h / 2 + Math.sin(a) * rr, size, rot: rng.range(-0.6, 0.6) };
    });
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1, m * 0.0035);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < n - 1; i++) {
      const p = stars[i];
      const q = stars[i + 1];
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      /* провис наружу от центра круга, у каждой дуги свой */
      const ox = mx - w / 2;
      const oy = my - h / 2;
      const len = Math.hypot(ox, oy) || 1;
      const sag = m * rng.range(0.01, 0.03);
      if (!i) ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(mx + (ox / len) * sag, my + (oy / len) * sag, q.x, q.y);
    }
    ctx.stroke();
    ctx.restore();
    stars.forEach((s) => cutStar(ctx, s.x, s.y, s.size, s.rot, rng));
  }

  /* Гибискус из точек: цветок рисуется на маленьком холсте, жилки и тычинки вырезаются,
     потом каждая клетка становится вытянутой точкой с мягким свечением. */
  function hibiscus(c, cx, cy, R, rot) {
    c.save();
    c.translate(cx, cy);
    c.rotate(rot);
    c.fillStyle = '#fff';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      c.save();
      c.rotate(a);
      c.beginPath();
      for (let t = 0; t <= 1; t += 0.02) {
        const th = t * Math.PI * 2;
        const frill = 1 + 0.07 * Math.sin(th * 9);
        const x = R * 0.46 + Math.cos(th) * R * 0.54 * frill;
        const y = Math.sin(th) * R * 0.47 * frill;
        c[t ? 'lineTo' : 'moveTo'](x, y);
      }
      c.fill();
      c.restore();
    }
    /* жилки: светлые лучи от середины к краям лепестков */
    c.globalCompositeOperation = 'destination-out';
    c.strokeStyle = '#000';
    c.lineWidth = Math.max(1, R * 0.07);
    c.lineCap = 'round';
    c.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + Math.PI / 5;
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.75);
    }
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    /* тычинка торчит из середины наружу, на конце крапинки */
    c.strokeStyle = '#fff';
    c.lineWidth = Math.max(1, R * 0.06);
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(R * 0.4, -R * 0.5, R * 0.95, -R * 1.05);
    c.stroke();
    for (let i = 0; i < 7; i++) {
      c.beginPath();
      c.arc(R * (0.85 + Math.sin(i * 2.1) * 0.18), -R * (1.05 + Math.cos(i * 1.7) * 0.18), R * 0.045, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
  function hibiscusDots(ctx, w, h, rng, o) {
    const m = Math.min(w, h);
    const cell = m * 0.011 * o.size;
    const gw = Math.ceil(w / cell);
    const gh = Math.ceil(h / cell);
    const low = document.createElement('canvas');
    low.width = gw;
    low.height = gh;
    const c = low.getContext('2d');
    const R = (m * 0.2 * o.size) / cell;
    hibiscus(c, gw * 0.38, gh * 0.42, R, -0.3);
    hibiscus(c, gw * 0.63, gh * 0.6, R * 0.95, 0.5);
    const d = c.getImageData(0, 0, gw, gh).data;
    ctx.save();
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = cell * 2.5;
    ctx.beginPath();
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        if (d[(gy * gw + gx) * 4 + 3] < 110) continue;
        ctx.roundRect(gx * cell + cell * 0.2, gy * cell + cell * 0.06, cell * 0.6, cell * 0.88, cell * 0.3);
      }
    }
    ctx.fill();
    ctx.restore();
  }

  /* Нарисованные от руки звёзды, как карандашом по бумаге: чёткий контур и полупрозрачная заливка,
     так что фото внутри звезды видно слабее, чем по краю. Звёзды лежат стайкой внахлёст:
     каждая следующая сначала стирает под собой то, что уже нарисовано, и ложится сверху. */
  function handStars(ctx, w, h, rng, o) {
    const m = Math.min(w, h);
    const n = Math.max(5, Math.round(10 * o.density));
    const stars = [];
    for (let i = 0; i < n; i++) {
      const R = m * o.size * (i < 2 ? rng.range(0.11, 0.14) : rng.range(0.045, 0.085));
      let cx;
      let cy;
      for (let tries = 0; tries < 30; tries++) {
        cx = w / 2 + rng.range(-0.3, 0.3) * m;
        cy = h / 2 + rng.range(-0.12, 0.12) * m;
        if (stars.every((s) => Math.hypot(s.cx - cx, s.cy - cy) > (s.R + R) * 0.75)) break;
      }
      stars.push({ cx, cy, R, rot: rng.range(-0.4, 0.4), skinny: i >= 2 && rng() < 0.2 });
    }
    const lw = Math.max(1, m * 0.006 * o.size);
    stars.forEach(({ cx, cy, R, rot, skinny }) => {
      const k = skinny ? 4 : 5;
      const inner = skinny ? 0.22 : rng.range(0.4, 0.5);
      const path = new Path2D();
      for (let j = 0; j < k * 2; j++) {
        const a = -Math.PI / 2 + (j * Math.PI) / k + rng.range(-0.07, 0.07) + rot;
        const r = (j % 2 ? inner : 1) * rng.range(0.9, 1.08) * R;
        /* у тонкой звезды вертикальные лучи длиннее */
        const ry = skinny && j % 2 === 0 && j % 4 === 0 ? 1.5 : 1;
        path[j ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r * ry);
      }
      path.closePath();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill(path);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fill(path);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = lw;
      ctx.lineJoin = 'round';
      ctx.stroke(path);
      ctx.restore();
    });
    /* вокруг стайки мелкие искорки и точки */
    for (let i = 0; i < 9; i++) {
      const a = rng() * TAU;
      const d = m * rng.range(0.34, 0.48);
      const x = w / 2 + Math.cos(a) * d;
      const y = h / 2 + Math.sin(a) * d * 0.75;
      if (rng() < 0.45) stamp(ctx, 'spark', x, y, m * rng.range(0.014, 0.022) * o.size, 0);
      else stamp(ctx, 'dot', x, y, m * 0.004 * o.size, 0);
    }
  }

  /* Мягкая звезда: те же пять лучей, но концы скруглены. */
  function softStar(ctx, x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(r, r);
    ctx.beginPath();
    poly(ctx, starPts(5, 0.5));
    ctx.fill();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.28;
    ctx.stroke();
    ctx.restore();
  }
  /* Пиксельный кот потягивается, вокруг три мягкие звезды. */
  function pixelCatStretch(ctx, w, h, rng, o) {
    const m = Math.min(w, h);
    const rows = SPRITES.catStretch;
    sprite(ctx, rows, w / 2 + m * 0.05, h / 2, (m * 0.7 * o.size) / rows[0].length);
    [[-0.32, -0.28, 0.075, 0.2], [0.42, -0.22, 0.055, -0.3], [-0.22, 0.38, 0.042, 0.4]].forEach(([dx, dy, r, rot]) => {
      softStar(ctx, w / 2 + dx * m, h / 2 + dy * m, m * r * o.size, rot);
    });
  }

  /* ---------- каталог ---------- */
  const CATEGORIES = [
    { id: 'all', name: 'Все' },
    { id: 'hand', name: 'Расставить' },
    { id: 'stars', name: 'Звёзды' },
    { id: 'dots', name: 'Точки' },
    { id: 'nature', name: 'Природа' },
    { id: 'love', name: 'Сердца' },
    { id: 'windows', name: 'Окна' },
    { id: 'pixels', name: 'Пиксели' },
    { id: 'stitch', name: 'Вышивка' },
    { id: 'things', name: 'Вещи' },
    { id: 'words', name: 'Слова' },
    { id: 'mine', name: 'Моё' },
  ];

  /* Символы из «Полки» в сетке 24 × 24: их расставляют на карточке вручную. */
  const starPath = () => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 5 : 12;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      d += `${i ? 'L' : 'M'}${(12 + r * Math.cos(a)).toFixed(2)} ${(12.8 + r * Math.sin(a)).toFixed(2)}`;
    }
    return `${d}Z`;
  };
  const SYMBOLS = {
    star: { name: 'Звезда', d: starPath() },
    sparkle: { name: 'Искра', d: 'M12 0C12.8 7.6 16.4 11.2 24 12C16.4 12.8 12.8 16.4 12 24C11.2 16.4 7.6 12.8 0 12C7.6 11.2 11.2 7.6 12 0Z' },
    cloud: { name: 'Облако', d: 'M1 15a5 5 0 1 1 10 0a5 5 0 1 1-10 0ZM6 10a6 6 0 1 1 12 0a6 6 0 1 1-12 0ZM14 15a4.5 5 0 1 1 9 0a4.5 5 0 1 1-9 0ZM6 13h13v7H6Z' },
    moon: { name: 'Луна', d: 'M10.998 2.050A10 10 0 1 0 21.346 15.556A8 9 0 0 1 10.998 2.050Z' },
    heart: { name: 'Сердце', d: 'M12 22C3 15 1 11 1 7.5C1 4 3.6 2 6.6 2C8.8 2 10.8 3.2 12 5.4C13.2 3.2 15.2 2 17.4 2C20.4 2 23 4 23 7.5C23 11 21 15 12 22Z' },
  };
  const DEMO_PIECES = [
    { shape: 'star', x: 0.3, y: 0.3, size: 0.42, rot: 0 },
    { shape: 'cloud', x: 0.7, y: 0.36, size: 0.44, rot: 0 },
    { shape: 'moon', x: 0.34, y: 0.72, size: 0.36, rot: 0 },
    { shape: 'heart', x: 0.72, y: 0.74, size: 0.3, rot: 0 },
    { shape: 'sparkle', x: 0.52, y: 0.52, size: 0.2, rot: 0 },
  ];
  const paths = {};
  function placed(ctx, w, h, rng, o) {
    const m = Math.min(w, h);
    (o.pieces || []).forEach((p) => {
      paths[p.shape] = paths[p.shape] || new Path2D(SYMBOLS[p.shape].d);
      ctx.save();
      ctx.translate(p.x * w, p.y * h);
      ctx.rotate(p.rot);
      ctx.scale((p.size * m) / 24, (p.size * m) / 24);
      ctx.translate(-12, -12);
      ctx.fill(paths[p.shape]);
      ctx.restore();
    });
  }

  /* Своя картинка как вырез: вписываем её в окно по центру. */
  function ownImage(ctx, w, h, rng, o) {
    if (!o.image) return stamp(ctx, 'fatstar', w / 2, h / 2, Math.min(w, h) * 0.3, 0);
    const k = Math.min(w / o.image.width, h / o.image.height) * o.size;
    const dw = o.image.width * k;
    const dh = o.image.height * k;
    ctx.drawImage(o.image, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  const MOTIFS = [
    { id: 'hand-place', name: 'Своя раскладка', cat: 'hand', usesPieces: true, draw: placed },

    { id: 'star-flock', name: 'Стайка', cat: 'stars', draw: scatterMotif('star', 'flock') },
    { id: 'star-fall', name: 'Ночной ливень', cat: 'stars', draw: scatterMotif('star', 'fall') },
    { id: 'star-scatter', name: 'Россыпь', cat: 'stars', draw: scatterMotif('fatstar', 'scatter') },
    { id: 'star-flare', name: 'Вспышка', cat: 'stars', draw: scatterMotif('star', 'flare') },
    { id: 'star-solo', name: 'Главная звезда', cat: 'stars', draw: scatterMotif('fatstar', 'solo') },
    { id: 'spark-flock', name: 'Блёстки', cat: 'stars', draw: scatterMotif('spark', 'flock') },
    { id: 'spark-scatter', name: 'Искры', cat: 'stars', draw: scatterMotif('spark', 'scatter') },
    { id: 'star-spiral', name: 'Звёздная спираль', cat: 'stars', draw: scatterMotif('star', 'spiral') },
    { id: 'star-spiral-wide', name: 'Лёгкая спираль', cat: 'stars', draw: scatterMotif('fatstar', 'spiralWide') },
    { id: 'star-ring', name: 'Звёздный венок', cat: 'stars', draw: scatterMotif('star', 'ring') },
    { id: 'spark-ring', name: 'Венок из искр', cat: 'stars', draw: scatterMotif('spark', 'ring') },
    { id: 'star-sky', name: 'Звёздное небо', cat: 'stars', draw: scatterMotif('star', 'sky') },
    { id: 'star-whirl', name: 'Звёздный вихрь', cat: 'stars', draw: scatterMotif('star', 'whirl') },
    { id: 'star-nebula', name: 'Туманность', cat: 'stars', draw: scatterMotif('star', 'nebula') },
    { id: 'star-crown', name: 'Хоровод звёзд', cat: 'stars', draw: scatterMotif('star', 'crown') },
    { id: 'star-constellation', name: 'Созвездие', cat: 'stars', usesText: true, draw: constellation },
    { id: 'star-web', name: 'Созвездия', cat: 'stars', usesText: true, draw: constellationWeb },
    { id: 'star-network', name: 'Сеть звёзд', cat: 'stars', usesText: true, draw: starNetwork },
    { id: 'spark-garland', name: 'Гирлянда искр', cat: 'stars', draw: sparkGarland },
    { id: 'star-hand', name: 'Рисованные звёзды', cat: 'stars', draw: handStars },
    { id: 'moon-orbit', name: 'Лунный круг', cat: 'stars', draw: scatterMotif('moon', 'orbit') },
    { id: 'moon-solo', name: 'Полумесяц', cat: 'stars', draw: scatterMotif('moon', 'solo') },

    { id: 'dot-polka', name: 'Горох', cat: 'dots', draw: scatterMotif('dot', 'polka') },
    { id: 'dot-flock', name: 'Пузыри', cat: 'dots', draw: scatterMotif('dot', 'flock') },
    { id: 'dot-fall', name: 'Капель', cat: 'dots', draw: scatterMotif('dot', 'fall') },
    { id: 'dot-wave', name: 'Прибой', cat: 'dots', draw: scatterMotif('dot', 'wave') },
    { id: 'dot-orbit', name: 'Кольца', cat: 'dots', draw: scatterMotif('dot', 'orbit') },
    { id: 'dot-solo', name: 'Планета', cat: 'dots', draw: scatterMotif('dot', 'solo') },

    { id: 'petal-scatter', name: 'Луг', cat: 'nature', draw: scatterMotif('petal', 'scatter') },
    { id: 'petal-solo', name: 'Один цветок', cat: 'nature', draw: scatterMotif('petal', 'solo') },
    { id: 'leaf-fall', name: 'Листопад', cat: 'nature', draw: scatterMotif('leaf', 'fall') },
    { id: 'leaf-flare', name: 'Венок', cat: 'nature', draw: scatterMotif('leaf', 'flare') },
    { id: 'maple-single', name: 'Кленовый лист', cat: 'nature', draw: scatterMotif('maple', 'single') },
    { id: 'maple-fall', name: 'Кленопад', cat: 'nature', draw: scatterMotif('maple', 'fall') },
    { id: 'drop-fall', name: 'Дождь', cat: 'nature', draw: scatterMotif('drop', 'fall') },
    { id: 'sun-solo', name: 'Солнце', cat: 'nature', draw: scatterMotif('sun', 'solo') },
    { id: 'fish-wave', name: 'Косяк рыб', cat: 'nature', draw: scatterMotif('fish', 'wave') },
    { id: 'bolt-scatter', name: 'Гроза', cat: 'nature', draw: scatterMotif('bolt', 'scatter') },
    { id: 'bird-ring', name: 'Птичий круг', cat: 'nature', draw: scatterMotif('bird', 'ring') },
    { id: 'bird-flock', name: 'Стая', cat: 'nature', draw: scatterMotif('bird', 'flock') },
    { id: 'flake-scatter', name: 'Снегопад', cat: 'nature', draw: scatterMotif('flake', 'scatter') },
    { id: 'flake-ring', name: 'Снежный венок', cat: 'nature', draw: scatterMotif('flake', 'ring') },
    { id: 'cloud-scatter', name: 'Облака', cat: 'nature', draw: scatterMotif('cloud', 'scatter') },
    { id: 'cloud-fall', name: 'Облачный день', cat: 'nature', draw: scatterMotif('cloud', 'fall') },

    { id: 'heart-flock', name: 'Сердечки', cat: 'love', draw: scatterMotif('heart', 'flock') },
    { id: 'heart-fall', name: 'Влюблённый дождь', cat: 'love', draw: scatterMotif('heart', 'fall') },
    { id: 'heart-solo', name: 'Большое сердце', cat: 'love', draw: scatterMotif('heart', 'solo') },
    { id: 'heart-polka', name: 'Обои', cat: 'love', draw: scatterMotif('heart', 'polka') },

    { id: 'win-stamp', name: 'Марка', cat: 'windows', draw: WINDOWS.perforated },
    { id: 'win-stamp-tall', name: 'Марка вертикальная', cat: 'windows', draw: WINDOWS.stampTall },
    { id: 'win-stamp-square', name: 'Марка квадратная', cat: 'windows', draw: WINDOWS.stampSquare },
    { id: 'win-film', name: 'Плёнка', cat: 'windows', draw: WINDOWS.film },
    { id: 'win-arch', name: 'Арка', cat: 'windows', draw: (c, w, h, r, o) => stamp(c, 'arch', w / 2, h / 2, Math.min(w, h * 0.8) * 0.5 * o.size, 0) },
    { id: 'win-blinds', name: 'Жалюзи', cat: 'windows', draw: WINDOWS.blinds },
    { id: 'win-checker', name: 'Шахматы', cat: 'windows', draw: WINDOWS.checker },
    { id: 'win-trio', name: 'Три иллюминатора', cat: 'windows', draw: WINDOWS.trio },
    { id: 'win-shards', name: 'Осколки', cat: 'windows', draw: WINDOWS.shards },

    { id: 'px-heart', name: 'Пиксель-сердце', cat: 'pixels', draw: pixelMotif('heart') },
    { id: 'px-cat', name: 'Кот', cat: 'pixels', draw: pixelMotif('cat') },
    { id: 'px-shroom', name: 'Гриб', cat: 'pixels', draw: pixelMotif('shroom') },
    { id: 'px-ghost', name: 'Призрак', cat: 'pixels', draw: pixelMotif('ghost') },
    { id: 'px-smile', name: 'Улыбка', cat: 'pixels', draw: pixelMotif('smile') },
    { id: 'px-spiral', name: 'Клетчатая спираль', cat: 'pixels', draw: pixelSpiral },
    { id: 'px-mix', name: 'Звёзды и снежинки', cat: 'pixels', draw: pixelMix },
    { id: 'px-eyes', name: 'Сонные глаза', cat: 'pixels', draw: pixelMotif('eyes') },
    { id: 'px-bird', name: 'Птичка', cat: 'pixels', draw: pixelMotif('bird') },
    { id: 'px-tulip', name: 'Тюльпан', cat: 'pixels', draw: pixelMotif('tulip') },
    { id: 'px-cat-stretch', name: 'Кот потягивается', cat: 'pixels', draw: pixelCatStretch },
    { id: 'px-glitch', name: 'Сбой', cat: 'pixels', draw: glitchSparks },
    { id: 'px-ornament', name: 'Узор', cat: 'pixels', draw: pixelOrnament },
    { id: 'px-hares', name: 'Зайцы', cat: 'pixels', draw: hares },
    { id: 'px-dot-bows', name: 'Бантики из точек', cat: 'pixels', draw: dotBows },
    { id: 'px-hibiscus', name: 'Гибискус из точек', cat: 'pixels', draw: hibiscusDots },
    { id: 'px-spiral-cross', name: 'Спираль с крестиками', cat: 'pixels', draw: pixelSpiralCross },

    { id: 'st-heart', name: 'Вышитое сердце', cat: 'stitch', draw: stitchMotif('bigheart') },
    { id: 'st-butterfly', name: 'Бабочка', cat: 'stitch', draw: stitchMotif('butterfly') },
    { id: 'st-bow', name: 'Бант', cat: 'stitch', draw: stitchMotif('bow') },
    { id: 'st-tulip', name: 'Цветок', cat: 'stitch', draw: stitchMotif('tulip') },
    { id: 'st-cat', name: 'Кот', cat: 'stitch', draw: stitchMotif('cat') },
    { id: 'st-bird', name: 'Птица', cat: 'stitch', draw: stitchMotif('bird') },

    { id: 'th-sakura', name: 'Марка-сакура', cat: 'things', draw: thing(THINGS.sakuraStamp) },
    { id: 'th-stamp', name: 'Марка с рамкой', cat: 'things', draw: thing(THINGS.frameStamp) },
    { id: 'th-phone', name: 'Раскладушка', cat: 'things', draw: thing(THINGS.flipPhone) },
    { id: 'th-clover', name: 'Клевер', cat: 'things', draw: thing(THINGS.clover) },
    { id: 'th-camera', name: 'Мыльница', cat: 'things', draw: thing(THINGS.camera) },
    { id: 'th-pet', name: 'Питомец-брелок', cat: 'things', draw: thing(THINGS.pocketPet) },
    { id: 'th-cassette', name: 'Кассета', cat: 'things', draw: thing(THINGS.cassette) },
    { id: 'th-cat', name: 'Растровый кот', cat: 'things', draw: thing(THINGS.halftoneCat) },
    { id: 'th-notebook', name: 'Блокнот', cat: 'things', draw: thing(THINGS.notebook) },
    { id: 'th-apples', name: 'Яблоки', cat: 'things', draw: thing(THINGS.apples) },
    { id: 'th-headphones', name: 'Наушники', cat: 'things', draw: thing(THINGS.headphones) },

    { id: 'w-own', name: 'Своё слово', cat: 'words', usesText: true, draw: wordBig('YOUR WORD') },
    { id: 'w-keys', name: 'Клавиши', cat: 'words', usesText: true, draw: keycaps('WISH YOU WERE HERE') },
    { id: 'w-card', name: 'Туз', cat: 'words', usesText: true, draw: playingCard('you are / my lucky card') },
    { id: 'w-constellation', name: 'Слова-созвездие', cat: 'words', usesText: true, draw: wordConstellation('I love you to the moon and back') },
    { id: 'w-own-repeat', name: 'Своё слово, лентой', cat: 'words', usesText: true, draw: wordRepeat('YOURS') },

    { id: 'own-mask', name: 'Своя фигура', cat: 'mine', usesImage: true, draw: ownImage },
  ];

  window.Motifs = { CATEGORIES, MOTIFS, SYMBOLS, DEMO_PIECES, WORD_FONTS, makeRng, byId: (id) => MOTIFS.find((m) => m.id === id) || MOTIFS[0] };
})();
