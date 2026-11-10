/* Эффекты поверх фото: рамки слежения, метки, светящиеся точки, буквы, пиксели, ASCII, азбука Морзе.
   Эффект не режет снимок, а рисует слой сверху и сам смотрит на картинку: где края, где светло, где тёмно.
   Рамки берутся из state.fx.boxes (найденные или поставленные рукой), а если их нет, из самых контрастных мест. */
window.Effects = (function () {
  const MONO = '"JetBrains Mono", ui-monospace, monospace';
  const SANS = '"Golos Text", system-ui, sans-serif';
  const SERIF = '"Times New Roman", Georgia, serif';
  /* Шрифт, выбранный в панели. Пустой: у каждого эффекта свой. */
  let custom = null;
  const face = (def) => (custom ? custom.css : def);
  const wt = (def) => (custom ? custom.weight || 400 : def);
  const fonts = () => [{ id: 'times', name: 'Газета', css: SERIF, weight: 400 }, ...((window.Render && window.Render.FONTS) || [])];

  const EFFECTS = [
    { id: 'detect', name: 'Распознавание', color: '#f5c518', boxes: true, text: 'Person',
      styles: [{ id: 'plate', name: 'Плашки' }, { id: 'tab', name: 'Флажки', color: '#ff2020' }] },
    { id: 'objects', name: 'Объекты', color: '#ffffff', boxes: true, text: 'Object' },
    { id: 'hud', name: 'Координаты', color: '#ffffff', boxes: true, text: '',
      styles: [{ id: 'lines', name: 'Лучи' }, { id: 'arcs', name: 'Дуги', color: '#ff3b3b' }] },
    { id: 'tags', name: 'Метки', color: '#39ff6a', boxes: true, text: 'online, AFK, searching…, online, where am i, a way out ???, online' },
    { id: 'points', name: 'Точки', color: '#ff5a1f', text: '' },
    { id: 'frameLetters', name: 'Буквы рамкой', color: '#ffffff', text: '' },
    { id: 'colLetters', name: 'Буквы столбцами', color: '#ffffff', text: '' },
    { id: 'pixels', name: 'Пиксели', color: '#e01b1b', text: 'SUNBURN' },
    { id: 'ascii', name: 'ASCII', color: '#c4161c', text: '' },
    { id: 'morse', name: 'Морзе', color: '#ffffff', text: 'STAY' },
    { id: 'threads', name: 'Слова на нитях', color: '#ffffff', text: 'One step at a time' },
    { id: 'graph', name: 'График', color: '#ffffff', text: 'JFMAMJJASOND' },
    { id: 'circle', name: 'Круг', color: '#ffffff', text: 'Body, Bees, Plants, Space, Water, Soil, Poop, Babies' },
    { id: 'chart', name: 'Диаграмма', color: '#ffffff', text: '' },
    { id: 'vwords', name: 'Слова столбиками', color: '#ffffff', text: 'where the tall trees keep the quiet of everything we never said out loud and the light comes down slowly to find us' },
    { id: 'formula', name: 'Формула', color: '#ffffff', text: 'e^(-x^2) [-2.5, 2.5]',
      styles: [
        { id: 'bell', name: 'Колокол', text: 'e^(-x^2) [-2.5, 2.5]' },
        { id: 'peak', name: 'Вершина', text: '-4/5*abs(x) [-5, 5]' },
        { id: 'drop', name: 'Капля', text: 'x = 2*sin(t) - sin(2*t)/50; y = cos(t) - cos(2*t)/3' },
        { id: 'wave', name: 'Волна', text: 'sin(x)/x [-12, 12]' },
        { id: 'heart', name: 'Сердце', text: 'x = 16*sin(t)^3; y = 13*cos(t) - 5*cos(2*t) - 2*cos(3*t) - cos(4*t)' },
      ] },
  ];
  const byId = (id) => EFFECTS.find((e) => e.id === id) || null;
  /* вид эффекта: первый из списка, если не выбран */
  const styleOf = (def, fx) => (def.styles ? def.styles.find((x) => x.id === fx.style) || def.styles[0] : null);
  const usesBoxes = (id) => !!(byId(id) && byId(id).boxes);

  function makeRng(seed) {
    let a = (seed * 2654435761) >>> 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- взгляд на картинку: яркость и края на маленькой копии ---------- */
  const probe = document.createElement('canvas');
  function analyze(ctx, W, H, r) {
    const gw = 160;
    const gh = Math.max(1, Math.round((gw * H) / W));
    probe.width = gw;
    probe.height = gh;
    const p = probe.getContext('2d', { willReadFrequently: true });
    p.drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, gw, gh);
    const d = p.getImageData(0, 0, gw, gh).data;
    const lum = new Float32Array(gw * gh);
    for (let i = 0; i < lum.length; i++) lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    const edge = new Float32Array(gw * gh);
    let max = 0.0001;
    for (let y = 1; y < gh - 1; y++) {
      for (let x = 1; x < gw - 1; x++) {
        const i = y * gw + x;
        const gx = lum[i - gw + 1] + 2 * lum[i + 1] + lum[i + gw + 1] - lum[i - gw - 1] - 2 * lum[i - 1] - lum[i + gw - 1];
        const gy = lum[i + gw - 1] + 2 * lum[i + gw] + lum[i + gw + 1] - lum[i - gw - 1] - 2 * lum[i - gw] - lum[i - gw + 1];
        edge[i] = Math.hypot(gx, gy);
        if (edge[i] > max) max = edge[i];
      }
    }
    for (let i = 0; i < edge.length; i++) edge[i] /= max;
    return { gw, gh, lum, edge, sx: W / gw, sy: H / gh };
  }

  const lumAt = (A, x, y) => {
    const gx = Math.min(A.gw - 1, Math.max(0, Math.floor(x / A.sx)));
    const gy = Math.min(A.gh - 1, Math.max(0, Math.floor(y / A.sy)));
    return A.lum[gy * A.gw + gx];
  };

  /* Рамки без поиска: клетки, где больше всего краёв, с небольшим разбросом. Доли карточки. */
  function autoBoxes(A, n, rng, W, H, gap) {
    const cols = 9;
    const rows = Math.max(6, Math.round((cols * H) / W));
    const cw = A.gw / cols;
    const ch = A.gh / rows;
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let e = 0;
        for (let y = Math.floor(r * ch); y < Math.floor((r + 1) * ch); y++) {
          for (let x = Math.floor(c * cw); x < Math.floor((c + 1) * cw); x++) e += A.edge[y * A.gw + x];
        }
        cells.push({ r, c, e: e / (cw * ch) + rng() * 0.04 });
      }
    }
    cells.sort((a, b) => b.e - a.e);
    const out = [];
    const taken = new Set();
    for (const cell of cells) {
      if (out.length >= n) break;
      const key = `${cell.r},${cell.c}`;
      if (taken.has(key)) continue;
      taken.add(key);
      [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(([dr, dc]) => { if (rng() < 0.5) taken.add(`${cell.r + dr},${cell.c + dc}`); });
      const span = rng() < 0.3 ? 2 : 1;
      const w = (span * (0.7 + rng() * 0.5)) / cols;
      const h = (span * (0.8 + rng() * 0.9)) / rows;
      const x = (cell.c + 0.5) / cols - w / 2 + (rng() - 0.5) * 0.3 / cols;
      const y = (cell.r + 0.5) / rows - h / 2 + (rng() - 0.5) * 0.3 / rows;
      const b = { x: Math.max(0.01, Math.min(0.99 - w, x)), y: Math.max(0.01, Math.min(0.99 - h, y)), w, h };
      /* рамки не налезают друг на друга, иначе подписи сливаются */
      const g = gap || 0;
      if (out.some((o) => b.x < o.x + o.w + g && o.x < b.x + b.w + g && b.y < o.y + o.h + g * 1.6 && o.y < b.y + b.h + g * 1.6)) continue;
      out.push(b);
    }
    return out;
  }

  const words = (text, def) => {
    const list = String(text || def || '').split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
    return list.length ? list : [''];
  };

  function plate(ctx, text, x, y, size, bg, fg, pad) {
    ctx.font = `${wt(600)} ${size}px ${face(SANS)}`;
    const w = ctx.measureText(text).width + pad * 2;
    const h = size * 1.35;
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + pad, y + h / 2 + size * 0.04);
    return { w, h };
  }

  /* ---------- эффекты с рамками ---------- */
  function detect(ctx, boxes, W, H, u, col, fx, rng) {
    if (fx.style === 'tab') {
      /* тонкая рамка и залитый флажок на верхнем крае справа */
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 1.6 * u;
      boxes.forEach((b) => {
        const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
        ctx.strokeRect(x, y, w, h);
        const tw = Math.max(28 * u, w * (0.35 + rng() * 0.2));
        const th = Math.max(9 * u, Math.min(18 * u, h * 0.12));
        ctx.fillRect(x + w - tw, y - th, tw, th);
      });
      return;
    }
    const name = words(fx.text, 'Person');
    ctx.lineWidth = 2.2 * u;
    boxes.forEach((b, i) => {
      const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
      ctx.strokeStyle = col;
      ctx.strokeRect(x, y, w, h);
      const pct = b.score != null ? Math.round(b.score * 100) : Math.round(11 + rng() * 80);
      const label = `${b.label && !fx.own ? b.label : name[i % name.length]} ${pct}%`;
      plate(ctx, label, x - 1 * u, y - 30 * u, 22 * u, col, '#111', 6 * u);
    });
  }

  function objects(ctx, boxes, W, H, u, col, fx, rng) {
    const name = words(fx.text, 'Object')[0];
    const c = boxes.map((b) => [(b.x + b.w / 2) * W, (b.y + b.h / 2) * H]);
    ctx.save();
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.8 * u;
    ctx.setLineDash([7 * u, 6 * u]);
    ctx.beginPath();
    c.forEach((p, i) => {
      const near = c.map((q, j) => [j, Math.hypot(q[0] - p[0], q[1] - p[1])]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
      near.slice(0, 2).forEach(([j]) => { if (j > i || rng() < 0.4) { ctx.moveTo(p[0], p[1]); ctx.lineTo(c[j][0], c[j][1]); } });
      if (rng() < 0.25 && c.length > 3) { const j = Math.floor(rng() * c.length); ctx.moveTo(p[0], p[1]); ctx.lineTo(c[j][0], c[j][1]); }
    });
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.6 * u;
    boxes.forEach((b, i) => {
      const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
      ctx.strokeRect(x, y, w, h);
      plate(ctx, `${name} ${i + 1}`.trim(), x, y, 19 * u, col, '#111', 5 * u);
    });
  }

  function hudArcs(ctx, boxes, W, H, u, col, fx, rng) {
    const c = boxes.map((b) => [(b.x + b.w / 2) * W, (b.y + b.h / 2) * H]);
    ctx.save();
    /* пунктирные дуги со стрелками между рамками */
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.4 * u;
    ctx.setLineDash([6 * u, 5 * u]);
    const arc = (a, b, lift) => {
      const mx = (a[0] + b[0]) / 2;
      const my = Math.min(a[1], b[1]) - lift;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(mx, my, b[0], b[1]);
      ctx.stroke();
      /* стрелка в вершине дуги */
      const tx = 0.25 * a[0] + 0.5 * mx + 0.25 * b[0];
      const ty = 0.25 * a[1] + 0.5 * my + 0.25 * b[1];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.save();
      ctx.setLineDash([]);
      ctx.translate(tx, ty);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-5 * u, -4 * u);
      ctx.lineTo(2 * u, 0);
      ctx.lineTo(-5 * u, 4 * u);
      ctx.stroke();
      ctx.restore();
    };
    c.forEach((p, i) => {
      if (rng() < 0.55) {
        const j = Math.floor(rng() * c.length);
        if (j !== i) arc(p, c[j], H * (0.04 + rng() * 0.16));
      }
    });
    if (c.length > 1) {
      const xs = c.slice().sort((a, b) => a[0] - b[0]);
      arc(xs[0], xs[xs.length - 1], H * 0.45);
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1.3 * u;
    /* пара длинных линий через весь кадр, как направляющие */
    if (c.length) {
      const g = boxes[Math.floor(rng() * boxes.length)];
      ctx.beginPath();
      ctx.moveTo(0, g.y * H);
      ctx.lineTo(W, g.y * H);
      ctx.moveTo(g.x * W + g.w * W * 2, 0);
      ctx.lineTo(g.x * W + g.w * W * 2, H);
      ctx.stroke();
    }
    ctx.font = `${wt(400)} ${12 * u}px ${face(MONO)}`;
    ctx.textBaseline = 'bottom';
    boxes.forEach((b) => {
      const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
      ctx.strokeStyle = col;
      ctx.strokeRect(x, y, w, h);
      ctx.fillRect(x + w / 2 - 2.5 * u, y + h / 2 - 2.5 * u, 5 * u, 5 * u);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`x: ${Math.round(x * 2.4)}  y: ${Math.round(y * 2.4)}`, x, y - 3 * u);
      ctx.fillStyle = col;
    });
    ctx.restore();
  }

  function hud(ctx, boxes, W, H, u, col, fx, rng) {
    if (fx.style === 'arcs') return hudArcs(ctx, boxes, W, H, u, col, fx, rng);
    const cx = W / 2, cy = H * 0.42;
    const hub = 46 * u;
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    /* столбики цифр, как бегущие данные */
    ctx.globalAlpha = 0.55;
    ctx.font = `${wt(400)} ${12 * u}px ${face(MONO)}`;
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
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.1 * u;
    ctx.beginPath();
    boxes.forEach((b) => {
      const bx = (b.x + b.w / 2) * W, by = (b.y + b.h / 2) * H;
      ctx.moveTo(cx, cy);
      ctx.lineTo(bx, by);
    });
    ctx.stroke();
    ctx.lineWidth = 1.5 * u;
    ctx.strokeRect(cx - hub / 2, cy - hub * 0.35, hub, hub * 0.7);
    ctx.font = `${wt(400)} ${15 * u}px ${face(MONO)}`;
    ctx.textBaseline = 'alphabetic';
    boxes.forEach((b) => {
      const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
      const s = Math.min(w, h) * (0.35 + rng() * 0.4);
      const bx = x + w / 2, by = y + h / 2;
      ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(bx - s / 2, by - s / 2, s, s);
      ctx.fillRect(bx - 2.5 * u, by - 2.5 * u, 5 * u, 5 * u);
      if (rng() < 0.35) { ctx.lineWidth = 1 * u; ctx.strokeRect(x, y, w, h); }
      const label = `x: ${Math.round(bx)} y: ${Math.round(by)}`;
      ctx.fillText(label, bx + s / 2 + 5 * u, by - s / 2 + 12 * u);
    });
    ctx.restore();
  }

  function tags(ctx, boxes, W, H, u, col, fx, rng) {
    const list = words(fx.text, byId('tags').text);
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 14 * u;
    ctx.lineWidth = 5 * u;
    ctx.font = `${wt(300)} ${38 * u}px ${face(SANS)}`;
    ctx.textBaseline = 'top';
    boxes.forEach((b, i) => {
      const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
      const word = list[i % list.length];
      const leader = word.includes('?') || (i % 4 === 3);
      ctx.strokeRect(x, y, w, h);
      const tw = ctx.measureText(word).width;
      if (leader) {
        const lx = Math.max(16 * u, Math.min(W - tw - 16 * u, x - tw * 0.6));
        const ly = Math.min(H - 50 * u, y + h + 70 * u);
        ctx.lineWidth = 4 * u;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(lx + tw * 0.6, ly - 6 * u);
        ctx.stroke();
        ctx.lineWidth = 5 * u;
        ctx.fillText(word, lx, ly);
      } else {
        const lx = Math.max(10 * u, Math.min(W - tw - 10 * u, x + w - tw));
        ctx.fillText(word, lx, Math.min(H - 46 * u, y + h + 8 * u));
      }
    });
    ctx.restore();
  }

  /* ---------- точки по краям ---------- */
  let dotSprite = null;
  let dotColor = '';
  function sprite(col) {
    if (dotSprite && dotColor === col) return dotSprite;
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, '#fff6e0');
    g.addColorStop(0.18, col);
    g.addColorStop(0.45, col + '66');
    g.addColorStop(1, col + '00');
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
    dotSprite = c;
    dotColor = col;
    return c;
  }

  function grain(ctx, W, H, amount, rng) {
    const n = document.createElement('canvas');
    n.width = n.height = 128;
    const x = n.getContext('2d');
    const img = x.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rng() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = amount;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(n, 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function points(ctx, A, W, H, u, col, fx, rng) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,10,12,.35)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    grain(ctx, W, H, 0.35, rng);
    const cand = [];
    for (let i = 0; i < A.edge.length; i++) if (A.edge[i] > 0.28) cand.push(i);
    const n = Math.round(220 * (fx.amount || 1));
    const spr = sprite(col.length === 7 ? col : '#ff5a1f');
    const r = 12 * u;
    const picked = [];
    for (let k = 0; k < n && cand.length; k++) {
      const i = cand[Math.floor(rng() * cand.length)];
      const x = ((i % A.gw) + rng()) * A.sx;
      const y = (Math.floor(i / A.gw) + rng()) * A.sy;
      picked.push([x, y]);
      ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
    }
    /* две рамки-прицела на самых густых местах */
    const best = (skip) => {
      let bi = -1, be = -1;
      picked.forEach(([x, y], i) => {
        if (skip && Math.hypot(x - skip[0], y - skip[1]) < W * 0.3) return;
        let e = 0;
        picked.forEach(([a, b]) => { if (Math.abs(a - x) < 60 * u && Math.abs(b - y) < 60 * u) e++; });
        if (e > be) { be = e; bi = i; }
      });
      return picked[bi];
    };
    const a = best(null);
    const b = a && best(a);
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    [[a, 150 * u], [b, 80 * u]].forEach(([p, s], k) => {
      if (!p) return;
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(p[0] - s / 2, p[1] - s / 2, s, s);
      ctx.fillRect(p[0] - s / 2 - 4 * u, p[1] - s / 2 - 4 * u, 8 * u, 8 * u);
      const q = s * 0.22;
      ctx.strokeRect(p[0] - q / 2, p[1] - q / 2, q, q);
      ctx.lineWidth = 2.4 * u;
      ctx.beginPath();
      ctx.moveTo(p[0] + q / 2, p[1] - q / 2);
      ctx.lineTo(k === 0 ? W * 0.94 : p[0] + s * 1.6, k === 0 ? p[1] - H * 0.12 : p[1] - s * 0.9);
      ctx.stroke();
    });
    ctx.restore();
  }

  /* ---------- буквы ---------- */
  /* по умолчанию латиница: строчные чаще, немного заглавных и цифр */
  const GLYPHS = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ69';
  function glyph(ctx, ch, x, y, size, rng) {
    const flip = rng() < 0.3;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.rotate(Math.PI);
    ctx.font = `${wt(400)} ${size}px ${face(SERIF)}`;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  }

  function letterField(ctx, W, H, u, col, fx, rng, inBand) {
    const step = 36 * u / Math.sqrt(fx.amount || 1);
    const cols = Math.floor(W / step);
    const rows = Math.floor(H / (step * 1.15));
    const word = String(fx.text || '').replace(/\s+/g, '').split('');
    ctx.save();
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let wi = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = inBand(c / cols, r / rows);
        if (p <= 0) continue;
        const x = (c + 0.5) * step + (W - cols * step) / 2;
        const y = (r + 0.5) * step * 1.15 + (H - rows * step * 1.15) / 2;
        /* своё слово прячется по порядку среди случайных букв */
        if (word.length && wi < word.length && rng() < 0.08 * p) {
          ctx.save();
          ctx.font = `${wt(600)} ${28 * u}px ${face(SERIF)}`;
          ctx.fillText(word[wi++], x, y);
          ctx.restore();
          continue;
        }
        if (rng() > p) continue;
        glyph(ctx, GLYPHS[Math.floor(rng() * GLYPHS.length)], x, y, (22 + rng() * 8) * u, rng);
      }
    }
    ctx.restore();
  }

  function frameLetters(ctx, W, H, u, col, fx, rng) {
    letterField(ctx, W, H, u, col, fx, rng, (fx0, fy0) => {
      const ix = 0.12, iy = 0.1, band = 0.11;
      if (fx0 < ix || fx0 > 1 - ix || fy0 < iy || fy0 > 1 - iy) return 0;
      const d = Math.min(fx0 - ix, 1 - ix - fx0, (fy0 - iy) * (H / W), (1 - iy - fy0) * (H / W));
      if (d > band) return 0.04;
      return d < 0.03 ? 0.9 : 0.5 - d * 2;
    });
  }

  function colLetters(ctx, W, H, u, col, fx, rng) {
    const n = 5 + Math.floor(rng() * 4);
    const colsX = Array.from({ length: n }, () => 0.06 + rng() * 0.88);
    const spans = colsX.map(() => [rng() * 0.3, 0.55 + rng() * 0.4]);
    letterField(ctx, W, H, u, col, fx, rng, (fx0, fy0) => {
      for (let i = 0; i < n; i++) {
        if (Math.abs(fx0 - colsX[i]) < 0.035 && fy0 > spans[i][0] && fy0 < spans[i][1]) return 0.55;
      }
      return 0.008;
    });
  }

  /* ---------- пиксели со словом ---------- */
  function pixels(ctx, W, H, u, col, fx, rng) {
    const S = 50 * u / Math.sqrt(fx.amount || 1);
    const x0 = W * 0.13, y0 = H * 0.18;
    const cols = Math.floor((W * 0.74) / S);
    const rows = Math.floor((H * 0.64) / S);
    const on = new Set();
    const walks = Math.round(cols * rows * 0.035);
    for (let k = 0; k < walks; k++) {
      let c = Math.floor(rng() * cols), r = Math.floor(rng() * rows);
      const dc = rng() < 0.5 ? 1 : -1;
      const len = rng() < 0.35 ? 1 : 2 + Math.floor(rng() * 4);
      for (let i = 0; i < len; i++) {
        if (c >= 0 && c < cols && r >= 0 && r < rows) on.add(r * cols + c);
        if (rng() < 0.75) c += dc;
        r += rng() < 0.85 ? 1 : 0;
      }
    }
    const cells = [...on].sort((a, b) => a - b);
    const word = String(fx.text || '').toUpperCase().replace(/\s+/g, '').split('');
    const marks = new Map();
    word.forEach((ch, i) => {
      if (!cells.length) return;
      const k = Math.floor(((i + 0.5) / word.length) * cells.length);
      marks.set(cells[Math.min(cells.length - 1, k)], ch);
    });
    ctx.save();
    ctx.fillStyle = col;
    cells.forEach((i) => {
      const x = x0 + (i % cols) * S;
      const y = y0 + Math.floor(i / cols) * S;
      ctx.fillRect(x + 0.6 * u, y + 0.6 * u, S - 1.2 * u, S - 1.2 * u);
    });
    ctx.fillStyle = '#ffffff';
    ctx.font = `${wt(700)} ${S * 0.5}px ${face(SANS)}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    marks.forEach((ch, i) => {
      ctx.fillText(ch, x0 + (i % cols) * S + S / 2, y0 + Math.floor(i / cols) * S + S / 2 + S * 0.03);
    });
    ctx.restore();
  }

  /* ---------- ASCII ---------- */
  const RAMP = '@%#$&8B*+=~^;:-,.` ';
  const JUNK = '()<>{}[]¥$§±×÷¿¡©®µ°ÆØÔÛ%#@&';
  function ascii(ctx, A, W, H, u, col, fx, rng) {
    const step = 19 * u / Math.sqrt(fx.amount || 1);
    let lo = 1, hi = 0;
    A.lum.forEach((v) => { if (v < lo) lo = v; if (v > hi) hi = v; });
    const span = Math.max(0.05, hi - lo);
    const edgeX = (y) => W * (0.42 + 0.2 * Math.sin(y / H * 5.2 + rng() * 0.3));
    ctx.save();
    ctx.fillStyle = col;
    ctx.textBaseline = 'middle';
    ctx.font = `${wt(600)} ${step * 1.05}px ${face(MONO)}`;
    for (let y = step / 2; y < H; y += step * 1.1) {
      const lim = edgeX(y);
      for (let x = step / 2; x < W; x += step * 0.62) {
        const fade = 1 - Math.max(0, (x - lim) / (W * 0.18));
        if (fade <= 0 || rng() > fade) continue;
        const l = (lumAt(A, x, y) - lo) / span;
        const dark = 1 - l;
        if (dark < 0.25 || rng() > dark * 0.95) continue;
        const ch = rng() < 0.25 ? JUNK[Math.floor(rng() * JUNK.length)] : RAMP[Math.min(RAMP.length - 1, Math.floor(l * RAMP.length))];
        ctx.globalAlpha = Math.min(1, 0.25 + dark * 0.75);
        ctx.fillText(ch, x, y);
      }
    }
    ctx.restore();
  }

  /* ---------- азбука Морзе со звёздами на нитях ---------- */
  const MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
    N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
    А: '.-', Б: '-...', В: '.--', Г: '--.', Д: '-..', Е: '.', Ё: '.', Ж: '...-', З: '--..', И: '..', Й: '.---', К: '-.-', Л: '.-..', М: '--',
    Н: '-.', О: '---', П: '.--.', Р: '.-.', С: '...', Т: '-', У: '..-', Ф: '..-.', Х: '....', Ц: '-.-.', Ч: '---.', Ш: '----', Щ: '--.-',
    Ъ: '--.--', Ы: '-.--', Ь: '-..-', Э: '..-..', Ю: '..--', Я: '.-.-',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  };
  function sparkle(ctx, x, y, r) {
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const rr = k % 2 ? r * 0.35 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  function morse(ctx, W, H, u, col, fx, rng) {
    const text = String(fx.text || 'STAY').toUpperCase().slice(0, 14);
    const dot = 9 * u, dash = 38 * u, gap = 8 * u, letterGap = 24 * u;
    const items = [];
    let x = 0;
    [...text].forEach((ch) => {
      if (ch === ' ') { x += letterGap; return; }
      const code = MORSE[ch];
      if (!code) return;
      [...code].forEach((m) => {
        const w = m === '.' ? dot * 2 : dash;
        items.push({ x, w, m });
        x += w + gap;
      });
      x += letterGap - gap;
    });
    const total = Math.max(1, x - letterGap);
    const k = Math.min(1, (W * 0.72) / total);
    const left = W * 0.17;
    const base = H * 0.86;
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    items.forEach((it) => {
      const cx = left + (it.x + it.w / 2) * k;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.1 * u;
      ctx.beginPath();
      ctx.moveTo(cx, rng() < 0.45 ? 0 : H * (0.1 + rng() * 0.3));
      ctx.lineTo(cx, base);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (rng() < 0.85) sparkle(ctx, cx, H * (0.12 + rng() * 0.32), 9 * u);
      if (it.m === '.') {
        ctx.beginPath();
        ctx.arc(cx, base, dot * k + 1.5 * u, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(left + it.x * k, base - 5 * u, it.w * k, 10 * u);
      }
    });
    /* подпись мелко внизу */
    ctx.font = `${wt(500)} ${15 * u}px ${face(MONO)}`;
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 0.9;
    ctx.fillText([...text].join(' '), left, base + 40 * u);
    ctx.restore();
  }

  /* ---------- слова на нитях: нить тянется от слова вниз до первого края на фото ---------- */
  function threads(ctx, A, W, H, u, col, fx, rng) {
    const list = String(fx.text || '').trim().split(/\s+/).filter(Boolean).slice(0, 12);
    if (!list.length) return;
    const top = H * (0.3 + rng() * 0.12);
    const left = W * 0.26;
    const right = W * 0.74;
    ctx.save();
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.font = `${wt(700)} ${24 * u}px ${face(SANS)}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 2 * u;
    list.forEach((word, i) => {
      const x = list.length === 1 ? W / 2 : left + ((right - left) * i) / (list.length - 1);
      const gx = Math.min(A.gw - 2, Math.max(1, Math.round(x / A.sx)));
      /* яркость полоской в 5 клеток; мелкие блики вроде звёзд не считаются, нужен устойчивый перепад */
      const band = (gy) => {
        let v = 0;
        for (let dx = -2; dx <= 2; dx++) v += A.lum[gy * A.gw + Math.min(A.gw - 1, Math.max(0, gx + dx))];
        return v / 5;
      };
      let end = H * (0.55 + rng() * 0.2);
      const start = Math.round((top + 30 * u) / A.sy);
      let base = 0;
      for (let k = 0; k < 4; k++) base += band(start + k);
      base /= 4;
      for (let gy = start + Math.round((H * 0.06) / A.sy); gy < A.gh - 4; gy++) {
        if (Math.abs(band(gy) - base) > 0.16 && Math.abs(band(gy + 2) - base) > 0.16 && Math.abs(band(gy + 4) - base) > 0.16) { end = gy * A.sy; break; }
        base = base * 0.97 + band(gy) * 0.03;
      }
      ctx.fillText(word, x, top);
      ctx.beginPath();
      ctx.moveTo(x, top + 12 * u);
      ctx.lineTo(x, end);
      ctx.stroke();
    });
    ctx.restore();
  }

  /* ---------- научный график: панели с осями и точками по месяцам ---------- */
  function graph(ctx, W, H, u, col, fx, rng) {
    const raw = String(fx.text || '');
    const ticks = raw.includes(',') ? raw.split(',').map((x) => x.trim()) : [...raw.replace(/\s+/g, '')];
    const cols = 2;
    const rows = (fx.amount || 1) > 1.3 ? 4 : (fx.amount || 1) < 0.7 ? 2 : 3;
    const x0 = W * 0.16, x1 = W * 0.86, y0 = H * 0.08, y1 = H * 0.88;
    const pw = (x1 - x0) / cols, ph = (y1 - y0) / rows;
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.beginPath();
    for (let c = 1; c < cols; c++) { ctx.moveTo(x0 + c * pw, y0); ctx.lineTo(x0 + c * pw, y1); }
    for (let r = 1; r < rows; r++) { ctx.moveTo(x0, y0 + r * ph); ctx.lineTo(x1, y0 + r * ph); }
    ctx.stroke();
    const vals = ['0,4', '0,2', '0', '-0,2', '-0,4'];
    let letter = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = x0 + c * pw, py = y0 + r * ph;
        const mid = py + ph / 2;
        const k = (ph * 0.42) / 0.45;
        ctx.lineWidth = 1.4 * u;
        ctx.beginPath();
        ctx.moveTo(px, mid);
        ctx.lineTo(px + pw, mid);
        ctx.stroke();
        if (c === 0) {
          ctx.font = `${wt(500)} ${12 * u}px ${face(SANS)}`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          vals.forEach((v, i) => {
            const y = mid - (0.4 - i * 0.2) * k;
            ctx.fillText(v, px - 12 * u, y);
            ctx.fillRect(px - 7 * u, y - 0.7 * u, 7 * u, 1.4 * u);
          });
        }
        ctx.font = `${wt(500)} ${24 * u}px ${face(SANS)}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(String.fromCharCode(65 + letter++), px + 12 * u, py + 10 * u);
        /* точки идут плавной волной с небольшим шумом */
        const n = Math.max(2, ticks.length || 12);
        const amp = 0.15 + rng() * 0.25;
        const ph0 = rng() * Math.PI * 2;
        const trend = (rng() - 0.5) * 0.4;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const v = Math.max(-0.45, Math.min(0.45, amp * Math.sin(ph0 + t * Math.PI * 1.6) + trend * (t - 0.5) + (rng() - 0.5) * 0.12));
          ctx.beginPath();
          ctx.arc(px + pw * (0.06 + t * 0.88), mid - v * k, 3.6 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.font = `${wt(700)} ${15 * u}px ${face(SANS)}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let c = 0; c < cols; c++) {
      ticks.forEach((tk, i) => {
        const t = ticks.length > 1 ? i / (ticks.length - 1) : 0.5;
        ctx.fillText(tk, x0 + c * pw + pw * (0.06 + t * 0.88), y1 + 10 * u);
      });
    }
    ctx.restore();
  }

  /* ---------- круг со спицами и подписями по краям ---------- */
  function circle(ctx, A, W, H, u, col, fx, rng) {
    const list = words(fx.text, '').slice(0, 12);
    const k = Math.ceil(list.length / 2);
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) * 0.4;
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    /* точки внутри круга, гуще там, где на фото есть детали */
    const n = Math.round(260 * (fx.amount || 1));
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * R * 0.95;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const gx = Math.min(A.gw - 1, Math.floor(x / A.sx)), gy = Math.min(A.gh - 1, Math.floor(y / A.sy));
      if (rng() > 0.35 + A.edge[gy * A.gw + gx] * 1.5) continue;
      ctx.beginPath();
      ctx.arc(x, y, (1.5 + rng() * 3) * u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 3.2 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    const size = 30 * u;
    ctx.font = `${wt(400)} ${size}px ${face(SANS)}`;
    ctx.textAlign = 'center';
    const topY = Math.max(size * 1.2, cy - R - size * 1.4);
    const botY = Math.min(H - size * 0.5, cy + R + size * 1.6);
    const xs = Array.from({ length: k }, (_, i) => (k === 1 ? cx : W * (0.1 + (0.8 * i) / (k - 1))));
    ctx.lineWidth = 1.6 * u;
    xs.forEach((x, i) => {
      const top = list[i];
      const bottom = list[k + (k - 1 - i)];
      const ax = x, ay = topY + 10 * u;
      const bx = 2 * cx - x, by = 2 * cy - ay;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.textBaseline = 'bottom';
      if (top) ctx.fillText(top, ax, topY);
      ctx.textBaseline = 'top';
      if (bottom) ctx.fillText(bottom, bx, by + 6 * u);
    });
    void botY;
    ctx.restore();
  }

  /* ---------- диаграмма: сетка, косые линии, кривые и шкалы ---------- */
  function chart(ctx, W, H, u, col, fx, rng) {
    const x0 = W * 0.2, x1 = W * 0.84, y0 = H * 0.05, y1 = H * 0.92;
    const w = x1 - x0, h = y1 - y0;
    const step = (w / 16) / Math.sqrt(fx.amount || 1);
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1 * u;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = y0; y <= y1 + 1; y += step * 1.5) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
    /* косые линии */
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    const slope = 0.8 + rng() * 0.5;
    for (let k = -h; k < w + h; k += step * 2.2) {
      ctx.moveTo(x0 + k, y0);
      ctx.lineTo(x0 + k - h / slope, y1);
    }
    ctx.stroke();
    /* кривые, расходятся веером снизу слева */
    ctx.lineWidth = 1.6 * u;
    for (let i = 1; i <= 9; i++) {
      ctx.beginPath();
      for (let t = 0; t <= 1.001; t += 0.02) {
        const x = x0 + t * w;
        const y = y1 - h * (i / 9) * 1.1 * Math.pow(t, 0.55 + i * 0.05);
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = 1.6 * u;
    ctx.strokeRect(x0, y0, w, h);
    /* толстый пунктир по диагонали */
    ctx.lineWidth = 5 * u;
    ctx.setLineDash([14 * u, 7 * u]);
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.05, y0 + h * 0.86);
    ctx.lineTo(x1, y0 + h * 0.53);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `${wt(400)} ${13 * u}px ${face(SANS)}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 14; i++) ctx.fillText(String(45 - i * 5), x0 - 8 * u, y0 + (h * i) / 14);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ['0,000', '0,005', '0,010', '0,015'].forEach((v, i) => ctx.fillText(v, x0 + (w * i) / 3.3, y0 - 4 * u));
    /* небольшой блок «условных обозначений» */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lines = [fx.text || 'SYMBOLS', 'h = enthalpy, kJ/kg', 'x = moisture, kg/kg', 'φ = relative humidity', 't = dry-bulb, °C'];
    lines.forEach((l, i) => {
      ctx.font = `${wt(i ? 400 : 700)} ${(i ? 12 : 15) * u}px ${face(SANS)}`;
      ctx.fillText(l, x0 + w * 0.6, y0 + h * 0.74 + i * 18 * u);
    });
    ctx.restore();
  }

  /* ---------- слова столбиками: каждое слово повёрнуто и стоит в своей колонке ---------- */
  function vwords(ctx, W, H, u, col, fx, rng) {
    const list = String(fx.text || '').trim().toUpperCase().split(/\s+/).filter(Boolean).slice(0, 40);
    if (!list.length) return;
    const step = (W * 0.92) / list.length;
    const size = Math.min(30 * u, step * 0.62) * Math.sqrt(fx.amount || 1);
    const top = H * (0.3 + rng() * 0.1);
    ctx.save();
    ctx.fillStyle = col;
    ctx.font = `${wt(700)} ${size}px ${face(SANS)}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${size * 0.35}px`;
    ctx.textBaseline = 'middle';
    list.forEach((w, i) => {
      ctx.save();
      ctx.translate(W * 0.04 + step * (i + 0.5), top);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(w, 0, 0);
      ctx.restore();
    });
    ctx.restore();
  }

  /* ---------- формула: свой разбор выражений без eval ---------- */
  const FUNCS = { sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, log: Math.log10, floor: Math.floor, round: Math.round };
  function compile(src) {
    const toks = String(src).toLowerCase().replace(/π/g, 'pi').replace(/,/g, '.').match(/\d*\.?\d+(?:e[-+]?\d+)?|[a-z]+|[-+*/^()|]/g) || [];
    let i = 0;
    const peek = () => toks[i];
    const take = () => toks[i++];
    function primary() {
      const tk = take();
      if (tk === undefined) throw new Error('end');
      if (/^[\d.]/.test(tk)) { const v = parseFloat(tk); return () => v; }
      if (tk === '(') { const e = expr(); if (take() !== ')') throw new Error(')'); return e; }
      if (tk === '|') { const e = expr(); if (take() !== '|') throw new Error('|'); return (v) => Math.abs(e(v)); }
      if (tk === '-') { const e = power(); return (v) => -e(v); }
      if (tk === '+') return power();
      if (tk === 'pi') return () => Math.PI;
      if (tk === 'e') return () => Math.E;
      if (tk === 'x' || tk === 't') return (v) => v;
      if (FUNCS[tk]) { const f = FUNCS[tk]; const a = primary(); return (v) => f(a(v)); } /* sin(t)^3 = (sin t)^3 */
      throw new Error(tk);
    }
    function power() {
      const b = primary();
      if (peek() === '^') { take(); const ex = unary(); return (v) => Math.pow(b(v), ex(v)); }
      return b;
    }
    function unary() {
      if (peek() === '-') { take(); const e = unary(); return (v) => -e(v); }
      return power();
    }
    function term() {
      let a = unary();
      for (;;) {
        const op = peek();
        if (op === '*' || op === '/') {
          take();
          const b = unary();
          const l = a;
          a = op === '*' ? (v) => l(v) * b(v) : (v) => l(v) / b(v);
        } else if (op !== undefined && /^[\d.a-z(]/.test(op) && !(op === '|')) {
          /* неявное умножение: 2x, 2sin(x), (x+1)(x-1) */
          const b = unary();
          const l = a;
          a = (v) => l(v) * b(v);
        } else return a;
      }
    }
    function expr() {
      let a = term();
      while (peek() === '+' || peek() === '-') {
        const op = take();
        const b = term();
        const l = a;
        a = op === '+' ? (v) => l(v) + b(v) : (v) => l(v) - b(v);
      }
      return a;
    }
    const f = expr();
    if (i < toks.length) throw new Error('rest');
    return f;
  }

  /* Разбор поля: «выражение [a, b]» или «x = …; y = …» для кривой по t. */
  function parseFormula(text) {
    const src = String(text || '').trim();
    const m = src.match(/\[\s*([^,\]]+?)\s*[,;]\s*([^\]]+?)\s*\]\s*$/);
    let body = m ? src.slice(0, m.index).trim() : src;
    const num = (v, d) => { try { return compile(v)(0); } catch { return d; } };
    const range = m ? [num(m[1], -5), num(m[2], 5)] : null;
    const px = body.match(/x\s*=\s*([^;]+)/i);
    const py = body.match(/y\s*=\s*([^;]+)/i);
    if (px && py) {
      return { kind: 'param', fx: compile(px[1]), fy: compile(py[1]), a: range ? range[0] : 0, b: range ? range[1] : Math.PI * 2, xs: px[1].trim(), ys: py[1].trim() };
    }
    body = body.replace(/^\s*(f\s*\(\s*x\s*\)|y)\s*=\s*/i, '');
    return { kind: 'fn', f: compile(body), a: range ? range[0] : -5, b: range ? range[1] : 5, body, range: m ? `[${m[1]}, ${m[2]}]` : '' };
  }

  /* Красивая запись: степень мелко сверху, |x| вместо abs, π, без звёздочек. */
  function prettyParts(src) {
    let s = String(src).replace(/\s+/g, ' ').replace(/abs\(([^()]*)\)/g, '|$1|').replace(/\bpi\b/g, 'π').replace(/sqrt/g, '√').replace(/\s*\*\s*/g, '');
    s = s.replace(/(\d)\.(\d)/g, '$1,$2');
    const parts = [];
    let i = 0;
    let buf = '';
    while (i < s.length) {
      if (s[i] === '^') {
        if (buf) parts.push([buf, false]);
        buf = '';
        i++;
        let sup = '';
        if (s[i] === '(') {
          let depth = 0;
          for (; i < s.length; i++) {
            if (s[i] === '(') depth++;
            if (s[i] === ')') depth--;
            sup += s[i];
            if (depth === 0) { i++; break; }
          }
          sup = sup.slice(1, -1);
        } else {
          while (i < s.length && /[\w.,]/.test(s[i])) sup += s[i++];
        }
        parts.push([sup, true]);
      } else buf += s[i++];
    }
    if (buf) parts.push([buf, false]);
    return parts;
  }

  function drawPretty(ctx, parts, x, y, size, center) {
    const font = (sup) => `italic ${wt(400)} ${sup ? size * 0.6 : size}px ${face(SERIF)}`;
    const width = parts.reduce((w, [t, sup]) => { ctx.font = font(sup); return w + ctx.measureText(t).width; }, 0);
    let cx = center ? x - width / 2 : x;
    parts.forEach(([t, sup]) => {
      ctx.font = font(sup);
      ctx.fillText(t, cx, sup ? y - size * 0.42 : y);
      cx += ctx.measureText(t).width;
    });
    return width;
  }

  const niceStep = (span, n) => {
    const raw = span / n;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const k = raw / p;
    return (k < 1.5 ? 1 : k < 3.5 ? 2 : k < 7.5 ? 5 : 10) * p;
  };
  const fmt = (v) => String(Math.round(v * 1000) / 1000).replace('.', ',');

  function formula(ctx, W, H, u, col, fx) {
    let F;
    try { F = parseFormula(fx.text); } catch { F = null; }
    const gx0 = W * 0.05, gx1 = W * 0.95;
    const gy0 = H * 0.2, gy1 = H * 0.76;
    /* точки кривой */
    const pts = [];
    if (F) {
      const n = 600;
      for (let i = 0; i <= n; i++) {
        const t = F.a + ((F.b - F.a) * i) / n;
        const p = F.kind === 'fn' ? [t, F.f(t)] : [F.fx(t), F.fy(t)];
        pts.push(Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p : null);
      }
    }
    const ok = pts.filter(Boolean);
    let xmin = F && F.kind === 'fn' ? F.a : Math.min(...ok.map((p) => p[0]));
    let xmax = F && F.kind === 'fn' ? F.b : Math.max(...ok.map((p) => p[0]));
    let ymin = Math.min(...ok.map((p) => p[1]));
    let ymax = Math.max(...ok.map((p) => p[1]));
    if (!ok.length) { xmin = -2; xmax = 2; ymin = -1; ymax = 1; }
    if (ymax - ymin < 1e-6) { ymin -= 1; ymax += 1; }
    if (F && F.kind === 'param') { const px = (xmax - xmin) * 0.25; xmin -= px; xmax += px; }
    const pad = (ymax - ymin) * 0.6;
    ymin -= pad;
    ymax += pad;
    const X = (v) => gx0 + ((v - xmin) / (xmax - xmin)) * (gx1 - gx0);
    const Y = (v) => gy1 - ((v - ymin) / (ymax - ymin)) * (gy1 - gy0);
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    /* сетка: мелкие и основные линии */
    const sx = niceStep(xmax - xmin, 8);
    const sy = niceStep(ymax - ymin, 5);
    const lines = (stepX, stepY, alpha, lw) => {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let v = Math.ceil(xmin / stepX) * stepX; v <= xmax + 1e-9; v += stepX) { ctx.moveTo(X(v), gy0); ctx.lineTo(X(v), gy1); }
      for (let v = Math.ceil(ymin / stepY) * stepY; v <= ymax + 1e-9; v += stepY) { ctx.moveTo(gx0, Y(v)); ctx.lineTo(gx1, Y(v)); }
      ctx.stroke();
    };
    lines(sx / 4, sy / 4, 0.28, 0.8 * u);
    lines(sx, sy, 0.55, 1 * u);
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    ctx.font = `${wt(400)} ${13 * u}px ${face(SANS)}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = Math.ceil(ymin / sy) * sy; v <= ymax + 1e-9; v += sy) ctx.fillText(fmt(v), gx0 + 18 * u, Y(v) - 8 * u);
    for (let v = Math.ceil(xmin / sx) * sx; v <= xmax + 1e-9; v += sx) {
      ctx.save();
      ctx.translate(X(v), gy1 - 6 * u);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'left';
      ctx.fillText(fmt(v), 0, 0);
      ctx.restore();
    }
    /* кривая */
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2.4 * u;
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    ctx.clip();
    ctx.beginPath();
    let pen = false;
    pts.forEach((p) => {
      if (!p) { pen = false; return; }
      if (pen) ctx.lineTo(X(p[0]), Y(p[1]));
      else ctx.moveTo(X(p[0]), Y(p[1]));
      pen = true;
    });
    ctx.stroke();
    ctx.restore();
    /* подпись формулы */
    const size = 40 * u;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (!F) {
      ctx.font = `italic ${size * 0.7}px ${face(SERIF)}`;
      ctx.textAlign = 'center';
      ctx.fillText('?', W / 2, gy1 + size * 2);
    } else if (F.kind === 'fn') {
      const parts = [['f(x) = ', false], ...prettyParts(F.body), [F.range ? `    ${F.range.replace(/\./g, ',').replace(/\bpi\b/gi, 'π')}` : '', false]];
      drawPretty(ctx, parts, W / 2, gy1 + size * 2, size, true);
    } else {
      const s2 = size * 0.75;
      const yA = gy0 - s2 * 2.2;
      drawPretty(ctx, [['x = ', false], ...prettyParts(F.xs)], W / 2, yA, s2, true);
      drawPretty(ctx, [['y = ', false], ...prettyParts(F.ys)], W / 2, yA + s2 * 1.3, s2, true);
    }
    ctx.restore();
  }

  /* lastBoxes помнит рамки, показанные на карточке, чтобы их можно было сразу двигать рукой. */
  const api = { EFFECTS, byId, usesBoxes, fonts, styleOf, lastBoxes: [] };

  /* rect: где лежит фото на карточке. Эффект рисуется только там, рамки в долях этой области. */
  api.draw = function (ctx, s, CW, CH, rect) {
    if (!s.fx || !s.fx.id) return;
    const def = byId(s.fx.id);
    if (!def) return;
    /* пустое поле текста значит «как в эффекте» */
    const st0 = styleOf(def, s.fx);
    const fx = { ...s.fx, text: s.fx.text || (st0 && st0.text) || def.text, own: !!s.fx.text };
    custom = fx.font ? fonts().find((f) => f.id === fx.font) || null : null;
    const r = rect || { x: 0, y: 0, w: CW, h: CH };
    const W = r.w;
    const H = r.h;
    const u = Math.min(CW, CH) / 1080;
    const st = styleOf(def, s.fx);
    if (st) fx.style = st.id;
    const col = fx.color || (st && st.color) || def.color;
    const rng = makeRng((fx.seed || 1) * 31 + 7);
    const A = analyze(ctx, W, H, r);
    const box = () => {
      const list = fx.boxes && fx.boxes.length ? fx.boxes : autoBoxes(A, Math.round((def.id === 'tags' ? 6 : fx.style === 'arcs' ? 16 : 10) * (fx.amount || 1)), makeRng(fx.seed || 1), W, H, def.id === 'tags' ? 0.05 : def.id === 'objects' ? -0.02 : 0.01);
      api.lastBoxes = list;
      return list;
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.translate(r.x, r.y);
    switch (fx.id) {
      case 'detect': detect(ctx, box(), W, H, u, col, fx, rng); break;
      case 'objects': objects(ctx, box(), W, H, u, col, fx, rng); break;
      case 'hud': hud(ctx, box(), W, H, u, col, fx, rng); break;
      case 'tags': tags(ctx, box(), W, H, u, col, fx, rng); break;
      case 'points': points(ctx, A, W, H, u, col, fx, rng); break;
      case 'frameLetters': frameLetters(ctx, W, H, u, col, fx, rng); break;
      case 'colLetters': colLetters(ctx, W, H, u, col, fx, rng); break;
      case 'pixels': pixels(ctx, W, H, u, col, fx, rng); break;
      case 'ascii': ascii(ctx, A, W, H, u, col, fx, rng); break;
      case 'morse': morse(ctx, W, H, u, col, fx, rng); break;
      case 'threads': threads(ctx, A, W, H, u, col, fx, rng); break;
      case 'graph': graph(ctx, W, H, u, col, fx, rng); break;
      case 'circle': circle(ctx, A, W, H, u, col, fx, rng); break;
      case 'chart': chart(ctx, W, H, u, col, fx, rng); break;
      case 'vwords': vwords(ctx, W, H, u, col, fx, rng); break;
      case 'formula': formula(ctx, W, H, u, col, fx); break;
      default: break;
    }
    ctx.restore();
  };

  return api;
})();
