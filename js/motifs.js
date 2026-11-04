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
  };
  const scatterMotif = (shape, layout) => (ctx, w, h, rng, o) => LAYOUTS[layout](ctx, w, h, rng, o, shape);

  /* ---------- окна: одна крупная вырубка ---------- */
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }
  const WINDOWS = {
    perforated(ctx, w, h, rng, o) {
      const pw = w * 0.74 * o.size;
      const ph = h * 0.74 * o.size;
      const x = (w - pw) / 2;
      const y = (h - ph) / 2;
      ctx.fillRect(x, y, pw, ph);
      /* выгрызаем зубцы по краю, как у почтовой марки */
      const tooth = Math.min(w, h) * 0.024;
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
    },
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

    { id: 'st-heart', name: 'Вышитое сердце', cat: 'stitch', draw: stitchMotif('bigheart') },
    { id: 'st-butterfly', name: 'Бабочка', cat: 'stitch', draw: stitchMotif('butterfly') },
    { id: 'st-bow', name: 'Бант', cat: 'stitch', draw: stitchMotif('bow') },
    { id: 'st-tulip', name: 'Цветок', cat: 'stitch', draw: stitchMotif('tulip') },
    { id: 'st-cat', name: 'Кот', cat: 'stitch', draw: stitchMotif('cat') },
    { id: 'st-bird', name: 'Птица', cat: 'stitch', draw: stitchMotif('bird') },

    { id: 'w-own', name: 'Своё слово', cat: 'words', usesText: true, draw: wordBig('YOUR WORD') },
    { id: 'w-own-repeat', name: 'Своё слово, лентой', cat: 'words', usesText: true, draw: wordRepeat('YOURS') },

    { id: 'own-mask', name: 'Своя фигура', cat: 'mine', usesImage: true, draw: ownImage },
  ];

  window.Motifs = { CATEGORIES, MOTIFS, SYMBOLS, DEMO_PIECES, WORD_FONTS, makeRng, byId: (id) => MOTIFS.find((m) => m.id === id) || MOTIFS[0] };
})();
