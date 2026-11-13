/* Шаблоны коллажей: несколько ячеек, в каждой свой снимок.
   Чтобы добавить шаблон, допиши его в список COLLAGES внизу файла.

   Ячейка: x, y, w, h в единицах коробки шаблона, rot в градусах.
   page: true значит, что ячейка размечена по всему листу в долях карточки: либо x, y, w, h,
   либо центр cx, cy, ширина w и пропорция aspect (ширина к высоте), тогда форма не искажается.
   shape: rect | round | rounded | heart | bumps | wavy.
   frame (рамка вокруг снимка): polaroid | stamp | ring | border | white | whiteRounded | thin |
   window | mac | file | bumps | wavy | lace | ovalLace. color задаёт цвет цветной рамки.
   label: подпись над ячейкой, clip: зажим сверху, stitch: вышитые завитки в углах.
   box: [ширина, высота] коробки. Коробка вписывается в карточку целиком, пропорции ячеек не искажаются.
   fill: true растягивает коробку на всё место, для сеток это лучше: ячейки повторяют форму карточки.
   deco(ctx, box, u, geo) рисует подложку под ячейками, overlay(ctx, geo, u, opt) украшения поверх.
   noNote: подпись не печатается полосой внизу, её текст идёт в бирки и пузыри шаблона (sample, если пусто). */
(function () {
  const TAU = Math.PI * 2;

  /* ---------- подложки ---------- */
  /* Лента рисуется на своём холсте: дырочки перфорации прорезаются в ленте, а под ними видна бумага. */
  let filmCanvas = null;
  function filmStrip(ctx, b, u) {
    filmCanvas = filmCanvas || document.createElement('canvas');
    const c = filmCanvas;
    c.width = Math.max(1, Math.round(b.w));
    c.height = Math.max(1, Math.round(b.h));
    const x = c.getContext('2d');
    x.fillStyle = '#141414';
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-out';
    const hole = c.width * 0.045;
    x.beginPath();
    for (let y = hole; y < c.height - hole * 1.2; y += hole * 2.1) {
      for (const hx of [c.width * 0.035, c.width * (1 - 0.035) - hole]) x.roundRect(hx, y, hole, hole * 1.3, hole * 0.25);
    }
    x.fill();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 18 * u;
    ctx.shadowOffsetY = 8 * u;
    ctx.drawImage(c, b.x, b.y, b.w, b.h);
    ctx.restore();
  }

  function boothStrip(ctx, b, u) {
    ctx.save();
    ctx.fillStyle = '#fbfaf6';
    ctx.shadowColor = 'rgba(0,0,0,.28)';
    ctx.shadowBlur = 20 * u;
    ctx.shadowOffsetY = 8 * u;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.restore();
  }

  /* ---------- рамки вокруг ячейки: рисуются в осях ячейки, центр в (0,0) ---------- */
  function perforated(ctx, x, y, w, h, tooth) {
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const nx = Math.max(2, Math.round(w / (tooth * 2.6)));
    const ny = Math.max(2, Math.round(h / (tooth * 2.6)));
    ctx.beginPath();
    for (let i = 0; i <= nx; i++) {
      for (const py of [y, y + h]) { ctx.moveTo(x + (i / nx) * w + tooth, py); ctx.arc(x + (i / nx) * w, py, tooth, 0, TAU); }
    }
    for (let i = 0; i <= ny; i++) {
      for (const px of [x, x + w]) { ctx.moveTo(px + tooth, y + (i / ny) * h); ctx.arc(px, y + (i / ny) * h, tooth, 0, TAU); }
    }
    ctx.fill();
    ctx.restore();
  }

  /* ---------- фигурные края ---------- */
  /* Точки по краю прямоугольника w × h с центром в (0,0). На каждой стороне целое число волн длиной около wave,
     поэтому в углах волны сходятся. f(t) даёт отступ наружу для доли волны t. */
  function rectEdge(w, h, wave, f) {
    const pts = [];
    const edges = [[-w / 2, -h / 2, 1, 0, w, 0, -1], [w / 2, -h / 2, 0, 1, h, 1, 0], [w / 2, h / 2, -1, 0, w, 0, 1], [-w / 2, h / 2, 0, -1, h, -1, 0]];
    for (const [x0, y0, dx, dy, L, nx, ny] of edges) {
      const n = Math.max(2, Math.round(L / wave));
      const lam = L / n;
      const step = Math.max(0.5, lam / 14);
      for (let t = 0; t < L; t += step) {
        const o = f(t / lam);
        pts.push([x0 + dx * t + nx * o, y0 + dy * t + ny * o]);
      }
    }
    return pts;
  }
  /* То же по овалу: n фестонов по кругу. */
  function ovalEdge(rx, ry, n, f) {
    const pts = [];
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * TAU;
      const o = f((i / 360) * n);
      pts.push([Math.cos(a) * (rx + o), Math.sin(a) * (ry + o)]);
    }
    return pts;
  }
  /* Лесенка из клеток: края идут только по горизонтали и вертикали, как в пиксельной графике. */
  function pixelate(pts, g) {
    const out = [];
    for (const [x, y] of pts) {
      const p = [Math.round(x / g) * g, Math.round(y / g) * g];
      const last = out[out.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) continue;
      if (last && last[0] !== p[0] && last[1] !== p[1]) out.push([p[0], last[1]]);
      out.push(p);
    }
    return out;
  }
  function tracePts(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  const scallop = (a) => (t) => a * Math.abs(Math.sin(Math.PI * t));
  const wave = (a) => (t) => a * Math.sin(TAU * t);
  /* Сердце в осях ячейки: кончик внизу, впадинка сверху. Точки по двум кривым Безье. */
  const HEART = [
    [[0, 0.48], [-0.78, -0.02], [-0.48, -0.62], [0, -0.28]],
    [[0, -0.28], [0.48, -0.62], [0.78, -0.02], [0, 0.48]],
  ];
  function heartPts(w, h, n = 60) {
    const pts = [];
    for (const [p0, p1, p2, p3] of HEART) {
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const k = [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
        pts.push([(k[0] * p0[0] + k[1] * p1[0] + k[2] * p2[0] + k[3] * p3[0]) * w, (k[0] * p0[1] + k[1] * p1[1] + k[2] * p2[1] + k[3] * p3[1]) * h]);
      }
    }
    return pts;
  }

  const shapePts = {
    bumps: (w, h) => pixelate(rectEdge(w * 0.9, h * 0.9, w * 0.17, scallop(w * 0.045)), Math.max(1, w * 0.022)),
    wavy: (w, h) => rectEdge(w, h, w * 0.13, wave(w * 0.016)),
    /* облачко: овал с крупными полукруглыми фестонами */
    cloud: (w, h) => ovalEdge(w / 2 - w * 0.05, h / 2 - w * 0.05, 12, scallop(w * 0.05)),
    heartCell: (w, h) => heartPts(w, h),
  };

  /* Рамка рисуется на отдельном холсте: зубцы марки вырезаются только из неё, не из карточки. */
  function drawFrame(ctx, cell, u, buffer) {
    const { w, h, frame } = cell;
    if (!frame) return;
    const shadow = (fn) => {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.3)';
      ctx.shadowBlur = 14 * u;
      ctx.shadowOffsetY = 6 * u;
      fn();
      ctx.restore();
    };
    const color = cell.color || '#c0392b';
    if (frame === 'book') {
      const p = w * 0.035;
      shadow(() => { ctx.fillStyle = '#e4e2db'; ctx.fillRect(-w / 2 - p, -h / 2 - p, w + p * 2, h + p * 2); });
      ctx.strokeStyle = '#b6b8b6'; ctx.lineWidth = Math.max(0.5, p * 0.14);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(-w / 2 - p * (0.25 + i * 0.25), -h / 2);
        ctx.lineTo(-w / 2 - p * (0.25 + i * 0.25), h / 2); ctx.stroke();
      }
      ctx.fillStyle = '#faf9f2'; ctx.fillRect(-w / 2 - p * 1.2, -h / 2, p * 0.35, h);
    } else if (frame === 'border') {
      const b = w * (cell.bw || 0.03);
      ctx.fillStyle = cell.color || '#7b8040';
      ctx.fillRect(-w / 2 - b, -h / 2 - b, w + b * 2, h + b * 2);
    } else if (frame === 'white' || frame === 'whiteRounded') {
      const b = w * 0.03;
      shadow(() => {
        ctx.fillStyle = cell.color || '#fbfaf6';
        ctx.beginPath();
        ctx.roundRect(-w / 2 - b, -h / 2 - b, w + b * 2, h + b * 2, frame === 'white' ? 0 : w * (cell.corner ?? 0.14));
        ctx.fill();
      });
    } else if (frame === 'window' || frame === 'mac') {
      const mac = frame === 'mac';
      const bar = Math.max(14 * u, w * (mac ? 0.1 : 0.065));
      const p = mac ? w * 0.012 : 0;
      shadow(() => {
        ctx.fillStyle = mac ? '#f1f1f1' : '#ececec';
        ctx.beginPath();
        ctx.roundRect(-w / 2 - p, -h / 2 - bar, w + p * 2, h + bar + p, mac ? bar * 0.45 : 0);
        ctx.fill();
      });
      const y = -h / 2 - bar / 2;
      ctx.fillStyle = '#2b2b2b';
      ctx.strokeStyle = '#2b2b2b';
      ctx.textBaseline = 'middle';
      if (mac) {
        ctx.fillStyle = '#b9b9b9';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(-w / 2 + bar * (0.55 + i * 0.6), y, bar * 0.2, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#2b2b2b';
        ctx.textAlign = 'center';
        ctx.font = `500 ${bar * 0.48}px "Golos Text", system-ui, sans-serif`;
        ctx.fillText(cell.title || '03.jpg', 0, y);
        ctx.lineWidth = Math.max(1, bar * 0.06);
        ctx.strokeRect(w / 2 - bar * 0.95, y - bar * 0.12, bar * 0.5, bar * 0.24);
      } else {
        ctx.textAlign = 'left';
        ctx.font = `500 ${bar * 0.5}px "JetBrains Mono", ui-monospace, monospace`;
        ctx.fillText(cell.title || 'img000.jpg', -w / 2 + bar * 0.35, y);
        ctx.lineWidth = Math.max(1, bar * 0.07);
        const s = bar * 0.26;
        const xs = [w / 2 - bar * 2.3, w / 2 - bar * 1.45, w / 2 - bar * 0.6];
        ctx.beginPath();
        ctx.moveTo(xs[0] - s, y + s); ctx.lineTo(xs[0] + s, y + s);
        ctx.rect(xs[1] - s, y - s, s * 2, s * 2);
        ctx.moveTo(xs[2] - s, y - s); ctx.lineTo(xs[2] + s, y + s);
        ctx.moveTo(xs[2] + s, y - s); ctx.lineTo(xs[2] - s, y + s);
        ctx.stroke();
        ctx.fillRect(xs[1] - s, y - s, s * 2, s * 0.6);
      }
    } else if (frame === 'file') {
      /* значок файла: лист с загнутым уголком, сверху тип файла, внизу снимок */
      const p = w * 0.09;
      const top = h * 0.55;
      const x0 = -w / 2 - p;
      const y0 = -h / 2 - top;
      const fw = w + p * 2;
      const fh = h + top + p;
      const fold = fw * 0.2;
      shadow(() => {
        ctx.fillStyle = '#f4f4f4';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + fw - fold, y0);
        ctx.lineTo(x0 + fw, y0 + fold);
        ctx.lineTo(x0 + fw, y0 + fh);
        ctx.lineTo(x0, y0 + fh);
        ctx.closePath();
        ctx.fill();
      });
      ctx.fillStyle = '#dcdcdc';
      ctx.beginPath();
      ctx.moveTo(x0 + fw - fold, y0);
      ctx.lineTo(x0 + fw - fold, y0 + fold);
      ctx.lineTo(x0 + fw, y0 + fold);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1f1f1f';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `500 ${top * 0.5}px "Golos Text", system-ui, sans-serif`;
      ctx.fillText(cell.title || 'PNG', x0 + p, y0 + top * 0.5);
    } else if (frame === 'wavy') {
      const b = w * 0.045;
      ctx.fillStyle = color;
      ctx.beginPath();
      tracePts(ctx, rectEdge(w + b * 2, h + b * 2, w * 0.13, wave(w * 0.016)));
      ctx.fill();
    } else if (frame === 'lace' || frame === 'ovalLace') {
      /* кружевной край: фестоны цветом рамки, в каждом белая дырочка */
      const oval = frame === 'ovalLace';
      const b = w * 0.05;
      const holes = [];
      ctx.fillStyle = color;
      ctx.beginPath();
      if (oval) {
        tracePts(ctx, ovalEdge(w / 2 + b, h / 2 + b, 34, scallop(b * 0.6)));
        for (let i = 0; i < 34; i++) {
          const a = ((i + 0.5) / 34) * TAU;
          holes.push([Math.cos(a) * (w / 2 + b * 0.75), Math.sin(a) * (h / 2 + b * 0.75)]);
        }
      } else {
        const lam = w * 0.075;
        tracePts(ctx, rectEdge(w + b * 2, h + b * 2, lam, scallop(b * 0.55)));
        rectEdge(w + b, h + b, lam, () => 0).forEach((p, i) => { if (i % 14 === 7) holes.push(p); });
      }
      ctx.fill();
      ctx.fillStyle = '#fbfaf6';
      ctx.beginPath();
      holes.forEach(([x, y]) => { ctx.moveTo(x + b * 0.17, y); ctx.arc(x, y, b * 0.17, 0, TAU); });
      ctx.fill();
    } else if (frame === 'heartLace') {
      /* сердце с кружевным краем: кружочки по контуру и белые дырочки в них */
      const outline = heartPts(w * 1.12, h * 1.12, 22);
      const r = w * 0.045;
      ctx.fillStyle = color;
      ctx.beginPath();
      tracePts(ctx, heartPts(w * 1.12, h * 1.12));
      outline.forEach(([x, y]) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); });
      ctx.fill();
      ctx.fillStyle = '#fbfaf6';
      ctx.beginPath();
      outline.forEach(([x, y]) => { ctx.moveTo(x + r * 0.3, y); ctx.arc(x, y, r * 0.3, 0, TAU); });
      ctx.fill();
    } else if (frame === 'mirrorLace') {
      /* овальное кружево как у зеркальца: фестоны по краю, внутри полоса узора дырочками */
      const b = w * 0.17;
      const lace = cell.color || '#ffffff';
      shadow(() => {
        ctx.fillStyle = lace;
        ctx.beginPath();
        tracePts(ctx, ovalEdge(w / 2 + b * 0.8, h / 2 + b * 0.8, 46, scallop(b * 0.22)));
        ctx.fill();
      });
      ctx.fillStyle = 'rgba(0,0,0,.07)';
      ctx.strokeStyle = 'rgba(0,0,0,.08)';
      ctx.lineWidth = Math.max(1, w * 0.003);
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU;
        const rx = w / 2 + b * 0.42;
        const ry = h / 2 + b * 0.42;
        const x = Math.cos(a) * rx;
        const y = Math.sin(a) * ry;
        /* цветочек из пяти лепестков и завиток рядом */
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const pa = (k / 5) * TAU + a;
          ctx.moveTo(x + Math.cos(pa) * b * 0.12 + b * 0.05, y + Math.sin(pa) * b * 0.12);
          ctx.arc(x + Math.cos(pa) * b * 0.12, y + Math.sin(pa) * b * 0.12, b * 0.05, 0, TAU);
        }
        ctx.fill();
        ctx.beginPath();
        ctx.arc(Math.cos(a + 0.08) * (rx + b * 0.25), Math.sin(a + 0.08) * (ry + b * 0.25), b * 0.07, 0, Math.PI * 1.5);
        ctx.stroke();
      }
      ctx.fillStyle = lace;
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2 + b * 0.12, h / 2 + b * 0.12, 0, 0, TAU);
      ctx.fill();
    } else if (frame === 'grid') {
      /* проволочная сетка-органайзер, на ней снимок в белой рамке */
      const px = w * 0.22;
      const py = h * 0.14;
      const gx = -w / 2 - px;
      const gy = -h / 2 - py;
      const gw = w + px * 2;
      const gh = h + py * 2;
      const s = gw / 6;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = 5 * u;
      ctx.shadowOffsetY = 2 * u;
      ctx.strokeStyle = '#8c8c86';
      ctx.lineWidth = Math.max(2, w * 0.016);
      ctx.beginPath();
      for (let x = gx; x <= gx + gw + 1; x += s) { ctx.moveTo(x, gy); ctx.lineTo(x, gy + gh); }
      for (let y = gy; y <= gy + gh + 1; y += s) { ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y); }
      ctx.stroke();
      ctx.restore();
      const b = w * 0.07;
      shadow(() => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-w / 2 - b, -h / 2 - b, w + b * 2, h + b * 2);
      });
    } else if (frame === 'polaroid') {
      const p = w * 0.06;
      shadow(() => {
        ctx.fillStyle = cell.color || '#fbfaf6';
        ctx.fillRect(-w / 2 - p, -h / 2 - p, w + p * 2, h + p + w * 0.24);
      });
    } else if (frame === 'stamp') {
      const p = w * 0.08;
      const fw = w + p * 2;
      const fh = h + p * 2;
      const pad = Math.ceil(20 * u);
      const { c, x } = buffer('stamp-frame', fw + pad * 2, fh + pad * 2);
      x.fillStyle = cell.color || '#fbfaf6';
      perforated(x, pad, pad, fw, fh, w * 0.035);
      shadow(() => ctx.drawImage(c, -fw / 2 - pad, -fh / 2 - pad));
    } else if (frame === 'ring') {
      shadow(() => {
        ctx.fillStyle = '#fbfaf6';
        ctx.beginPath();
        ctx.ellipse(0, 0, w / 2 + w * 0.035, h / 2 + h * 0.035, 0, 0, TAU);
        ctx.fill();
      });
    }
  }

  /* Сердце в единицах коробки: от (0,0) до (1,1). */
  function heartPath(ctx, b) {
    const X = (v) => b.x + v * b.w;
    const Y = (v) => b.y + v * b.h;
    ctx.moveTo(X(0.5), Y(0.98));
    ctx.bezierCurveTo(X(-0.28), Y(0.48), X(0.02), Y(-0.12), X(0.5), Y(0.22));
    ctx.bezierCurveTo(X(0.98), Y(-0.12), X(1.28), Y(0.48), X(0.5), Y(0.98));
    ctx.closePath();
  }

  /* Обрезка ячейки по форме. Для сердца путь общий на всю коробку, поэтому ставится до поворота ячейки. */
  function clipBox(ctx, cell, box) {
    if (cell.shape !== 'heart') return;
    ctx.beginPath();
    heartPath(ctx, box);
    ctx.clip();
  }
  function clipCell(ctx, cell) {
    const { w, h } = cell;
    ctx.beginPath();
    if (cell.shape === 'round') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
    else if (cell.shape === 'rounded') ctx.roundRect(-w / 2, -h / 2, w, h, w * (cell.corner ?? 0.12));
    else if (cell.shape === 'heart') ctx.rect(-w / 2, -h / 2, w, h);
    else if (shapePts[cell.shape]) tracePts(ctx, shapePts[cell.shape](w, h));
    else ctx.rect(-w / 2, -h / 2, w, h);
    ctx.clip();
  }

  /* Вышивка крестиком по кривой: крестик в каждой точке. */
  function crossesAlong(ctx, pts, s) {
    ctx.beginPath();
    pts.forEach(([x, y]) => {
      ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
    });
    ctx.stroke();
  }
  /* Завиток-вьюнок вдоль края: волна с петлями, точки через равный шаг. */
  function vinePts(x0, y0, dx, dy, len, amp, step) {
    const pts = [];
    for (let t = 0; t <= len; t += step) {
      const k = t / len;
      const loop = Math.sin(k * Math.PI * 3);
      const o = amp * loop;
      pts.push([x0 + dx * t - dy * o, y0 + dy * t + dx * o]);
      /* в гребне волны маленькая петля */
      if (Math.abs(loop) > 0.995) {
        for (let a = 0; a < TAU; a += 0.7) pts.push([x0 + dx * t - dy * o + Math.cos(a) * amp * 0.45, y0 + dy * t + dx * o + Math.sin(a) * amp * 0.45]);
      }
    }
    return pts;
  }

  /* Что рисуется поверх снимка: контур пиксельной рамки, тонкая рамка, номер, зажим, вышивка. */
  function drawOver(ctx, cell, u, ink) {
    const { w, h } = cell;
    if (cell.frame === 'bumps') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, w * 0.02);
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      tracePts(ctx, shapePts.bumps(w, h));
      ctx.stroke();
    }
    if (cell.inner) {
      /* тонкая тёмная рамка по краю картинки марки */
      ctx.strokeStyle = cell.innerColor || '#2b2b2b';
      ctx.lineWidth = Math.max(1.5, w * 0.006);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
    if (cell.frame === 'thin') {
      ctx.strokeStyle = cell.color || '#a33a3a';
      ctx.lineWidth = Math.max(2, w * 0.012);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
    if (cell.label) {
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = `400 ${Math.max(12 * u, w * 0.11)}px "Golos Text", system-ui, sans-serif`;
      ctx.fillText(cell.label, 0, -h / 2 - w * 0.04);
    }
    if (cell.tape) {
      /* полоска полупрозрачного скотча поперёк верхнего края */
      ctx.save();
      ctx.translate(0, -h / 2);
      ctx.rotate(-0.06);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = cell.tapeColor || '#eca0b9';
      ctx.fillRect(-w * 0.22, -w * 0.06, w * 0.44, w * 0.12);
      ctx.restore();
    }
    if (cell.pin) pin(ctx, 0, -h / 2 + w * 0.02, w * 0.06, cell.pinColor);
    if (cell.heartClip) {
      /* скрепка-сердечко у верхнего левого угла */
      ctx.save();
      ctx.translate(-w * 0.18, -h / 2 - w * 0.02);
      ctx.strokeStyle = '#c4c4c4';
      ctx.lineWidth = Math.max(2, w * 0.018);
      ctx.beginPath();
      tracePts(ctx, heartPts(w * 0.42, w * 0.32, 20));
      ctx.stroke();
      ctx.restore();
    }
    if (cell.clip) {
      /* канцелярский зажим по центру верхнего края */
      const cw = w * 0.2;
      const g = ctx.createLinearGradient(-cw / 2, 0, cw / 2, 0);
      g.addColorStop(0, '#9c8a6a');
      g.addColorStop(0.5, '#e6d8bb');
      g.addColorStop(1, '#8f7d5d');
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = 8 * u;
      ctx.shadowOffsetY = 3 * u;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(-cw / 2, -h / 2 - w * 0.09, cw, cw * 0.55, cw * 0.08);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#8f7d5d';
      ctx.lineWidth = Math.max(2, cw * 0.06);
      ctx.beginPath();
      ctx.moveTo(-cw * 0.35, -h / 2 - w * 0.09);
      ctx.lineTo(-cw * 0.25, -h / 2 - w * 0.18);
      ctx.lineTo(cw * 0.25, -h / 2 - w * 0.18);
      ctx.lineTo(cw * 0.35, -h / 2 - w * 0.09);
      ctx.stroke();
    }
    if (cell.stitch) {
      /* белые вышитые вьюнки: от верхнего левого угла вправо и вниз, от нижнего правого влево и вверх */
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = Math.max(1, w * 0.004);
      const s = w * 0.008;
      const step = w * 0.02;
      const a = w * 0.035;
      const m = w * 0.06;
      crossesAlong(ctx, vinePts(-w / 2 + m, -h / 2 + m, 1, 0, w * 0.6, a, step), s);
      crossesAlong(ctx, vinePts(-w / 2 + m, -h / 2 + m, 0, 1, h * 0.55, a, step), s);
      crossesAlong(ctx, vinePts(w / 2 - m, h / 2 - m, -1, 0, w * 0.6, a, step), s);
      crossesAlong(ctx, vinePts(w / 2 - m, h / 2 - m, 0, -1, h * 0.4, a, step), s);
    }
  }

  /* ---------- украшения поверх коллажа ---------- */
  function words(opt, fallback) {
    const text = (opt.title || '').trim() || fallback;
    return text.split(/\s+/).filter(Boolean);
  }
  /* бирка: прямоугольник бумаги со словом */
  function tag(ctx, x, y, text, size, rot, style = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.font = `${style.weight || 500} ${size}px ${style.font || '"JetBrains Mono", ui-monospace, monospace'}`;
    const tw = ctx.measureText(text).width;
    const px = size * 0.35;
    const py = size * 0.28;
    ctx.fillStyle = style.bg || '#ffffff';
    ctx.fillRect(-tw / 2 - px, -size / 2 - py, tw + px * 2, size + py * 2);
    ctx.fillStyle = style.fg || '#111111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, size * 0.05);
    ctx.restore();
  }
  /* облачко сообщения со хвостиком слева снизу */
  function bubble(ctx, x, y, text, size) {
    ctx.save();
    ctx.font = `500 ${size}px "Golos Text", system-ui, sans-serif`;
    const tw = ctx.measureText(text).width;
    const w = tw + size * 1.6;
    const h = size * 1.9;
    ctx.fillStyle = '#ebebeb';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    /* хвостик отдельной фигурой: в общем пути он закручен в другую сторону и вырезал бы дырку */
    const left = x - w / 2;
    ctx.beginPath();
    ctx.moveTo(left + h * 0.3, y + h * 0.1);
    ctx.quadraticCurveTo(left + h * 0.25, y + h * 0.5, left - h * 0.02, y + h * 0.62);
    ctx.quadraticCurveTo(left + h * 0.45, y + h * 0.62, left + h * 0.75, y + h * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#151515';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + size * 0.05);
    ctx.restore();
  }
  /* рамка выделения с квадратными ручками и стрелка курсора у угла */
  function selection(ctx, x, y, w, h, u, cursor) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.lineWidth = Math.max(1, 1.6 * u);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#ffffff';
    const s = 9 * u;
    [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]].forEach(([a, b]) => ctx.fillRect(x + a * w - s / 2, y + b * h - s / 2, s, s));
    if (cursor) {
      const cx = x + w + 4 * u;
      const cy = y + h + 4 * u;
      const k = 26 * u;
      ctx.beginPath();
      [[0, 0], [0, 1], [0.27, 0.76], [0.45, 1.15], [0.6, 1.08], [0.42, 0.7], [0.75, 0.7]].forEach(([a, b], i) => ctx[i ? 'lineTo' : 'moveTo'](cx + a * k, cy + b * k));
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(1, 1.5 * u);
      ctx.stroke();
    }
    ctx.restore();
  }
  /* голубая папка */
  function folder(ctx, x, y, w) {
    const h = w * 0.72;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.2)';
    ctx.shadowBlur = w * 0.05;
    ctx.shadowOffsetY = w * 0.02;
    ctx.fillStyle = '#8fb8e6';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.06, y, w * 0.45, h * 0.3, w * 0.04);
    ctx.fill();
    const g = ctx.createLinearGradient(0, y + h * 0.18, 0, y + h);
    g.addColorStop(0, '#b4d8fb');
    g.addColorStop(1, '#6d9fd6');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y + h * 0.18, w, h * 0.82, w * 0.04);
    ctx.fill();
    ctx.restore();
  }
  function starPath(ctx, x, y, r, rot) {
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }
  /* звёзды по заданным местам в долях листа */
  function stars(ctx, geo, list, color, u) {
    ctx.fillStyle = color;
    ctx.beginPath();
    list.forEach(([x, y, r, rot]) => starPath(ctx, x * geo.W, y * geo.H, r * 40 * u, rot || 0));
    ctx.fill();
  }
  /* точки в горошек по прямоугольнику */
  function polka(ctx, x, y, w, h, step, r, color, jitter) {
    ctx.fillStyle = color;
    ctx.beginPath();
    let row = 0;
    for (let py = y + step / 2; py < y + h + r; py += step * 0.87, row++) {
      for (let px = x + (row % 2 ? step / 2 : 0); px < x + w + r; px += step) {
        const k = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453;
        const j = jitter ? (k - Math.floor(k) - 0.5) * jitter : 0;
        ctx.moveTo(px + j + r, py - j);
        ctx.arc(px + j, py - j, r, 0, TAU);
      }
    }
    ctx.fill();
  }

  /* ---------- шаблоны ---------- */
  const grid = (cols, rows, gap) => {
    const cells = [];
    const w = (1 - gap * (cols - 1)) / cols;
    const h = (1 - gap * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ x: c * (w + gap), y: r * (h + gap), w, h });
    return cells;
  };

  const COLLAGES = [
    { id: 'duo', name: 'Два кадра', fill: true, cells: grid(1, 2, 0.03) },
    { id: 'grid4', name: 'Сетка 2 × 2', fill: true, cells: grid(2, 2, 0.03) },
    { id: 'mosaic', name: 'Мозаика', fill: true, cells: [{ x: 0, y: 0, w: 1, h: 0.6 }, { x: 0, y: 0.63, w: 0.485, h: 0.37 }, { x: 0.515, y: 0.63, w: 0.485, h: 0.37 }] },
    {
      id: 'film', name: 'Плёнка', box: [0.62, 1], deco: filmStrip, under: 'dark',
      cells: [0, 1, 2].map((i) => ({ x: 0.1, y: 0.035 + i * 0.315, w: 0.42, h: 0.29 })),
    },
    {
      id: 'booth', name: 'Фотобудка', box: [0.42, 1], deco: boothStrip, under: 'light',
      cells: [0, 1, 2, 3].map((i) => ({ x: 0.03, y: 0.03 + i * 0.215, w: 0.36, h: 0.2 })),
    },
    {
      id: 'polaroids', name: 'Полароиды', box: [1, 1.12],
      cells: [
        { x: 0.05, y: 0.06, w: 0.42, h: 0.42, rot: -7, frame: 'polaroid' },
        { x: 0.53, y: 0.15, w: 0.4, h: 0.4, rot: 5, frame: 'polaroid' },
        { x: 0.27, y: 0.6, w: 0.42, h: 0.42, rot: -2, frame: 'polaroid' },
      ],
    },
    {
      id: 'stamps', name: 'Марки', box: [1, 1],
      cells: [
        { x: 0.08, y: 0.07, w: 0.36, h: 0.36, rot: -3, frame: 'stamp' },
        { x: 0.56, y: 0.09, w: 0.36, h: 0.36, rot: 2, frame: 'stamp' },
        { x: 0.07, y: 0.56, w: 0.36, h: 0.36, rot: 2, frame: 'stamp' },
        { x: 0.55, y: 0.55, w: 0.36, h: 0.36, rot: -2, frame: 'stamp' },
      ],
    },
    {
      id: 'circles', name: 'Иллюминаторы', box: [1, 1],
      cells: [
        { x: 0.04, y: 0.04, w: 0.56, h: 0.56, shape: 'round', frame: 'ring' },
        { x: 0.6, y: 0.3, w: 0.36, h: 0.36, shape: 'round', frame: 'ring' },
        { x: 0.2, y: 0.64, w: 0.32, h: 0.32, shape: 'round', frame: 'ring' },
      ],
    },
    {
      id: 'heart', name: 'Сердце', box: [1, 0.92],
      cells: grid(2, 2, 0.02).map((c) => ({ ...c, shape: 'heart' })),
    },
  ];
  /* канцелярская кнопка: шляпка с бликом и тенью */
  function pin(ctx, x, y, r, color = '#c9c4bc') {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)';
    ctx.shadowBlur = r * 0.8;
    ctx.shadowOffsetX = r * 0.25;
    ctx.shadowOffsetY = r * 0.35;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, color);
    g.addColorStop(1, 'rgba(60,55,50,.9)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  /* пружина блокнота: дырочки и проволочные петли вдоль линии; vertical ставит её столбиком */
  function spiralBind(ctx, from, to, at, s, vertical) {
    ctx.save();
    if (vertical) {
      ctx.translate(at, 0);
      ctx.rotate(Math.PI / 2);
      ctx.translate(0, -at);
    }
    const y = at;
    const g = ctx.createLinearGradient(0, y - s * 0.5, 0, y + s * 0.2);
    g.addColorStop(0, '#d9d9d9');
    g.addColorStop(0.5, '#9a9a9a');
    g.addColorStop(1, '#5d5d5d');
    for (let x = from + s * 0.3; x < to - s * 0.3; x += s * 0.85) {
      ctx.fillStyle = '#151515';
      ctx.beginPath();
      ctx.arc(x + s * 0.2, y + s * 0.3, s * 0.15, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = g;
      ctx.lineWidth = s * 0.11;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.15);
      ctx.lineTo(x, y - s * 0.2);
      ctx.arc(x + s * 0.17, y - s * 0.2, s * 0.17, Math.PI, 0);
      ctx.lineTo(x + s * 0.34, y + s * 0.22);
      ctx.stroke();
    }
    ctx.restore();
  }
  /* кружевная лента: полоса, по краю фестоны с дырочками. rot поворачивает её вокруг начала */
  function laceBand(ctx, x, y, len, thick, color, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const r = thick * 0.32;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, len, thick);
    ctx.beginPath();
    for (let px = r; px < len + r; px += r * 2) { ctx.moveTo(px + r, thick); ctx.arc(px, thick, r, 0, Math.PI); }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath();
    for (let px = r; px < len + r; px += r * 2) {
      ctx.moveTo(px + r * 0.28, thick + r * 0.35);
      ctx.arc(px, thick + r * 0.35, r * 0.28, 0, TAU);
      ctx.moveTo(px + r * 0.5, thick * 0.45);
      ctx.arc(px, thick * 0.45, r * 0.18, 0, TAU);
    }
    ctx.fill();
    ctx.restore();
  }
  /* открытый конверт: кармашек с клапаном, из которого торчит снимок */
  function envelope(ctx, cx, cy, w, color) {
    const h = w * 0.55;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.18)';
    ctx.shadowBlur = w * 0.04;
    ctx.shadowOffsetY = w * 0.015;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy - h * 0.25);
    ctx.lineTo(cx, cy + h * 0.25);
    ctx.lineTo(cx + w / 2, cy - h * 0.25);
    ctx.lineTo(cx + w / 2, cy + h * 0.5);
    ctx.lineTo(cx - w / 2, cy + h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.lineWidth = Math.max(1, w * 0.006);
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy + h * 0.5);
    ctx.lineTo(cx - w * 0.08, cy + h * 0.12);
    ctx.moveTo(cx + w / 2, cy + h * 0.5);
    ctx.lineTo(cx + w * 0.08, cy + h * 0.12);
    ctx.stroke();
  }
  /* надпись маркером: заливка с тёмным контуром, Caveat */
  function marker(ctx, text, x, y, size, rot, fill, stroke) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.font = `700 ${size}px "Caveat", cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = size * 0.13;
      ctx.strokeText(text, 0, 0);
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  /* каракули белой ручкой */
  function doodle(ctx, kind, x, y, s, color, lw) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'star') starPath(ctx, 0, 0, s, 0.15);
    else if (kind === 'heart') tracePts(ctx, heartPts(s * 2, s * 2, 24));
    else if (kind === 'spiral') {
      for (let t = 0; t <= 1; t += 0.01) {
        const a = t * TAU * 3;
        ctx[t ? 'lineTo' : 'moveTo'](Math.cos(a) * s * t, Math.sin(a) * s * t);
      }
    } else if (kind === 'wave') {
      for (let t = 0; t <= 1; t += 0.01) ctx[t ? 'lineTo' : 'moveTo']((t - 0.5) * s * 3, Math.sin(t * TAU * 3) * s * 0.18);
    } else if (kind === 'loops') {
      for (let t = 0; t <= 1; t += 0.005) {
        const a = t * TAU * 3;
        ctx[t ? 'lineTo' : 'moveTo']((t - 0.5) * s * 2.4 + Math.cos(a) * s * 0.25, Math.sin(a) * s * 0.35);
      }
    } else if (kind === 'sparkle') {
      ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.1, -s * 0.1, s, 0);
      ctx.quadraticCurveTo(s * 0.1, s * 0.1, 0, s);
      ctx.quadraticCurveTo(-s * 0.1, s * 0.1, -s, 0);
      ctx.quadraticCurveTo(-s * 0.1, -s * 0.1, 0, -s);
    }
    ctx.stroke();
    ctx.restore();
  }
  /* звезда-вспышка из штрихов, как мелком */
  function burst(ctx, x, y, r, color, u) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const len = r * (i % 2 ? 0.45 : 1);
      ctx.lineWidth = Math.max(1, (i % 2 ? 2 : 3.2) * u);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.12, y + Math.sin(a) * r * 0.12);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
  }
  /* разноцветное конфетти точками, одно и то же при каждой отрисовке */
  function confetti(ctx, geo, n, colors, r) {
    for (let i = 0; i < n; i++) {
      const k = Math.sin(i * 91.7 + 3.1) * 43758.5453;
      const f = k - Math.floor(k);
      const k2 = Math.sin(i * 37.3 + 1.7) * 24634.6345;
      const f2 = k2 - Math.floor(k2);
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(f * geo.W, f2 * geo.H, r, 0, TAU);
      ctx.fill();
    }
  }
  /* рваный кусок бумаги: края с мелкими зубчиками */
  function tornPaper(ctx, x, y, w, h, color, u) {
    const pts = rectEdge(w, h, w * 0.03, (t) => Math.sin(t * 7.3) * 2.5 * u + Math.sin(t * 2.1) * 2 * u);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.shadowColor = 'rgba(0,0,0,.15)';
    ctx.shadowBlur = 8 * u;
    ctx.fillStyle = color;
    ctx.beginPath();
    tracePts(ctx, pts);
    ctx.fill();
    ctx.restore();
  }
  /* бумажная бирка с дырочкой и надписью в две строки */
  function tallTag(ctx, x, y, w, h, lines, rot, u) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.shadowColor = 'rgba(0,0,0,.25)';
    ctx.shadowBlur = 10 * u;
    ctx.shadowOffsetY = 4 * u;
    ctx.fillStyle = '#e9ebe6';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.shadowColor = 'transparent';
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fbfaf6';
    ctx.beginPath();
    ctx.arc(0, -h / 2 + w * 0.12, w * 0.05, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1d1d1d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = w * 0.3;
    ctx.font = `700 ${size}px "Caveat", cursive`;
    lines.forEach((ln, i) => {
      let fs = size;
      const tw = ctx.measureText(ln).width;
      if (tw > w * 0.86) fs = (size * w * 0.86) / tw;
      ctx.font = `700 ${fs}px "Caveat", cursive`;
      ctx.fillText(ln, 0, (i - (lines.length - 1) / 2) * size * 1.15);
    });
    ctx.restore();
  }
  /* квадратик-«узел» схемы с мягкой заливкой */
  function node(ctx, x, y, s, color) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.15)';
    ctx.shadowBlur = s * 0.2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - s / 2, y - s / 2, s, s, s * 0.12);
    ctx.fill();
    ctx.restore();
  }
  /* бантик из ленточки: две петли, узелок и два хвостика; лента рисуется двумя штрихами для объёма */
  function bow(ctx, x, y, s, rot, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-s * 0.35, -s * 0.45, -s * 0.85, -s * 0.2, -s * 0.55, s * 0.05);
      ctx.bezierCurveTo(-s * 0.4, s * 0.15, -s * 0.15, s * 0.05, 0, 0);
      ctx.bezierCurveTo(s * 0.35, -s * 0.45, s * 0.85, -s * 0.2, s * 0.55, s * 0.05);
      ctx.bezierCurveTo(s * 0.4, s * 0.15, s * 0.15, s * 0.05, 0, 0);
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-s * 0.12, s * 0.3, -s * 0.3, s * 0.55, -s * 0.42, s * 0.85);
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(s * 0.1, s * 0.3, s * 0.28, s * 0.6, s * 0.36, s * 0.9);
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.18)';
    ctx.lineWidth = s * 0.075;
    ctx.translate(s * 0.015, s * 0.025);
    path();
    ctx.stroke();
    ctx.translate(-s * 0.015, -s * 0.025);
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.06;
    path();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.06, s * 0.05, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  /* серебряная объёмная звёздочка */
  function silverStar(ctx, x, y, r, color) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.25)';
    ctx.shadowBlur = r * 0.4;
    ctx.shadowOffsetY = r * 0.15;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.05, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, color);
    g.addColorStop(1, '#8a8a86');
    ctx.fillStyle = g;
    ctx.beginPath();
    starPath(ctx, x, y, r, 0.1);
    ctx.fill();
    ctx.restore();
  }
  /* ромбик-искорка контуром */
  function diamond(ctx, x, y, r, color, lw) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.7, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.7, y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  /* вышивка крестиком: вьюнок с петлями от точки в направлении dir, плюс цветочки-кружки из крестиков */
  function stitchVine(ctx, x, y, dx, dy, len, s, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, s * 0.35);
    crossesAlong(ctx, vinePts(x, y, dx, dy, len, s * 5, s * 2.6), s);
    crossesAlong(ctx, vinePts(x + dy * s * 3, y + dx * s * 3, dx, dy, len * 0.85, s * 4, s * 2.6), s);
    ctx.restore();
  }
  function stitchFlower(ctx, x, y, r, s, color) {
    const pts = [];
    for (let gx = -r; gx <= r; gx += s * 2.4) {
      for (let gy = -r; gy <= r; gy += s * 2.4) {
        const a = Math.atan2(gy, gx);
        const d = Math.hypot(gx, gy);
        if (d < r * (0.55 + 0.45 * Math.abs(Math.cos(a * 2.5))) && d > r * 0.18) pts.push([x + gx, y + gy]);
      }
    }
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, s * 0.35);
    crossesAlong(ctx, pts, s);
    ctx.restore();
  }
  /* большой вышитый цветок на стебле: лепестки, листья и стебель сплошь крестиками */
  function stitchedPlant(ctx, x, y, h, color, u) {
    const s = Math.max(1.5, h * 0.006);
    const step = s * 2.4;
    const pts = [];
    const inEllipse = (px, py, cx, cy, rx, ry, rot) => {
      const dx = px - cx;
      const dy = py - cy;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      return (lx / rx) ** 2 + (ly / ry) ** 2 <= 1;
    };
    const fx = x + h * 0.12;
    const fy = y - h * 0.3;
    for (let px = x - h * 0.45; px < x + h * 0.5; px += step) {
      for (let py = y - h * 0.62; py < y + h * 0.5; py += step) {
        let on = false;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU - 0.4;
          if (inEllipse(px, py, fx + Math.cos(a) * h * 0.13, fy + Math.sin(a) * h * 0.13, h * 0.12, h * 0.07, a)) on = true;
        }
        if (Math.hypot(px - fx, py - fy) < h * 0.04) on = false;
        if (Math.abs(px - (x - (py - y) * 0.15)) < step * 0.8 && py > fy && py < y + h * 0.5) on = true;
        if (inEllipse(px, py, x - h * 0.17, y - h * 0.05, h * 0.16, h * 0.05, -0.7)) on = true;
        if (inEllipse(px, py, x + h * 0.14, y + h * 0.18, h * 0.15, h * 0.045, 0.6)) on = true;
        if (inEllipse(px, py, x - h * 0.25, y - h * 0.32, h * 0.05, h * 0.11, -0.3)) on = true;
        if (on) pts.push([px, py]);
      }
    }
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, s * 0.35);
    crossesAlong(ctx, pts, s);
    ctx.restore();
  }
  /* тиснёная бумага: завитки и листики видны только светом и тенью */
  function embossed(ctx, x, y, w, h, color, u) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const draw = (dx, dy, style) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = Math.max(1.5, 2.6 * u);
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const cx = x + (i + 0.3) * (w / 8.5) + dx;
        const cy = y + h * (0.35 + 0.3 * Math.sin(i * 1.7)) + dy;
        const r = h * 0.22;
        ctx.beginPath();
        for (let t = 0; t <= 1; t += 0.02) {
          const a = t * TAU * 1.6 + i;
          ctx[t ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r * (1 - t * 0.7), cy + Math.sin(a) * r * (1 - t * 0.7));
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx + r * 1.3, cy - r * 0.4, r * 0.35, r * 0.13, -0.6, 0, TAU);
        ctx.stroke();
      }
    };
    draw(1.5 * u, 1.5 * u, 'rgba(0,0,0,.09)');
    draw(-1 * u, -1 * u, 'rgba(255,255,255,.9)');
    ctx.restore();
  }
  /* перфорированная полоса-марка на своём холсте, чтобы зубцы не прорезали карточку */
  let stripCanvas = null;
  function stampBand(ctx, x, y, w, h, tooth, color, u) {
    stripCanvas = stripCanvas || document.createElement('canvas');
    const pad = Math.ceil(tooth * 2);
    stripCanvas.width = Math.ceil(w + pad * 2);
    stripCanvas.height = Math.ceil(h + pad * 2);
    const c = stripCanvas.getContext('2d');
    c.fillStyle = color;
    perforated(c, pad, pad, w, h, tooth);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.22)';
    ctx.shadowBlur = 14 * u;
    ctx.shadowOffsetY = 5 * u;
    ctx.drawImage(stripCanvas, x - pad, y - pad);
    ctx.restore();
  }
  /* слова в несколько строк по n слов, текст печатной машинкой */
  function typed(ctx, list, x, y, size, color, align = 'left', n = 2) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `400 ${size}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    for (let i = 0; i < list.length; i += n) ctx.fillText(list.slice(i, i + n).join(' '), x, y + (i / n) * size * 1.25);
    ctx.restore();
  }
  const half = (list) => [list.slice(0, Math.ceil(list.length / 2)).join(' '), list.slice(Math.ceil(list.length / 2)).join(' ')];

  /* ---------- шаблоны на весь лист: фото под окошками, рамки, слова ---------- */
  const P = (o) => ({ page: true, ...o });
  COLLAGES.push(
    {
      /* слева фото до края, справа белый лист в горошек, поверх окно с вышитыми углами, слова на бирках */
      id: 'tags', name: 'Бирки', noNote: true, sample: 'Flower convo memories worth keeping',
      deco(ctx, box, u, geo) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(geo.W * 0.5, 0, geo.W * 0.5, geo.H);
        polka(ctx, geo.W * 0.5, 0, geo.W * 0.5, geo.H, geo.W * 0.13, geo.W * 0.011, '#111111', geo.W * 0.09);
      },
      cells: [P({ x: 0, y: 0, w: 0.5, h: 1 }), P({ x: 0.34, y: 0.19, w: 0.56, h: 0.62, stitch: true })],
      overlay(ctx, geo, u, opt) {
        const list = words(opt, this.sample);
        const rots = [-6, 0, 4, 0, -5, 3];
        list.slice(0, 7).forEach((wd, i) => {
          const y = geo.H * (0.15 + (0.68 * i) / Math.max(1, Math.min(list.length, 7) - 1));
          tag(ctx, geo.W * (0.2 + (i % 2) * 0.01), y, wd, geo.W * 0.04, rots[i % rots.length]);
        });
      },
    },
    {
      /* рабочий стол: фото на весь лист, поверх окно программы, рамки, папка, облачко и курсор */
      id: 'desktop', name: 'Рабочий стол', noNote: true, sample: 'Holiday snaps',
      cells: [
        P({ x: 0, y: 0, w: 1, h: 1 }),
        P({ cx: 0.5, cy: 0.5, w: 0.42, aspect: 0.78, frame: 'window' }),
        P({ cx: 0.17, cy: 0.15, w: 0.21, aspect: 0.74, frame: 'white' }),
        P({ cx: 0.81, cy: 0.17, w: 0.21, aspect: 1.05, shape: 'bumps', frame: 'bumps' }),
        P({ cx: 0.24, cy: 0.66, w: 0.22, aspect: 0.95, shape: 'rounded', frame: 'whiteRounded' }),
        P({ cx: 0.72, cy: 0.82, w: 0.25, aspect: 0.95, shape: 'bumps', frame: 'bumps' }),
      ],
      overlay(ctx, geo, u, opt) {
        const win = geo.cells[1];
        folder(ctx, win.x + win.w * 0.82, win.y + win.h * 0.82, geo.W * 0.17);
        bubble(ctx, win.x + win.w * 1.0, win.y + win.h * 0.22, words(opt, this.sample).join(' '), geo.W * 0.03);
        selection(ctx, win.x - win.w * 0.05, win.y + win.h * 0.38, win.w * 0.46, win.h * 0.38, u, true);
      },
    },
    {
      /* сверху фото, снизу бумага, на границе две квадратные рамки, под ними подпись в скобках */
      id: 'horizon', name: 'На границе', noNote: true, sample: 'My Self',
      cells: [
        P({ x: 0, y: 0, w: 1, h: 0.45 }),
        P({ cx: 0.5, cy: 0.45, w: 0.38, aspect: 0.93, frame: 'border', bw: 0.035 }),
        P({ cx: 0.5, cy: 0.71, w: 0.38, aspect: 0.93, frame: 'border', bw: 0.035 }),
      ],
      overlay(ctx, geo, u, opt) {
        stars(ctx, geo, [[0.3, 0.02, 0.7], [0.88, 0.14, 0.6, 0.3], [0.14, 0.29, 0.6, -0.2], [0.08, 0.6, 0.6], [0.74, 0.48, 0.6, 0.4], [0.76, 0.68, 0.6], [0.27, 0.8, 0.6, 0.2], [0.83, 0.95, 0.6]], 'rgba(255,255,255,.9)', u);
        const list = words(opt, this.sample);
        const bottom = geo.cells[2].y + geo.cells[2].h;
        const size = geo.W * 0.045;
        const y = bottom + (geo.H - bottom) * 0.45;
        ctx.fillStyle = opt.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `400 ${size}px ${opt.font}`;
        const lines = list.length > 1 ? [list.slice(0, Math.ceil(list.length / 2)).join(' '), list.slice(Math.ceil(list.length / 2)).join(' ')] : list;
        lines.forEach((ln, i) => ctx.fillText(ln, geo.W / 2, y + (i - (lines.length - 1) / 2) * size * 0.9));
        const half = Math.max(...lines.map((ln) => ctx.measureText(ln).width)) / 2;
        ctx.font = `300 ${size * 2.4}px ${opt.font}`;
        ctx.fillText('(', geo.W / 2 - half - size * 1.1, y);
        ctx.fillText(')', geo.W / 2 + half + size * 1.1, y);
      },
    },
    {
      /* фото на весь лист и поверх него полоска из трёх кадров в зелёной рамке */
      id: 'stripOver', name: 'Полоска на фото', noNote: true, sample: 'Precious Things',
      cells: [
        P({ x: 0, y: 0, w: 1, h: 1 }),
        ...[0.3, 0.5, 0.7].map((cy) => P({ cx: 0.55, cy, w: 0.24, aspect: 1.2, frame: 'border', color: '#86c96b', bw: 0.07 })),
      ],
      overlay(ctx, geo, u, opt) {
        const list = words(opt, this.sample);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,.4)';
        ctx.shadowBlur = 6 * u;
        ctx.font = `500 ${geo.W * 0.035}px "Golos Text", system-ui, sans-serif`;
        ctx.fillText(list[0], geo.W * 0.04, geo.H * 0.04);
        ctx.font = `400 ${geo.W * 0.05}px ${opt.font}`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(list.slice(1).join(' '), geo.W * 0.28, geo.H * 0.93);
        ctx.shadowBlur = 0;
        const c = geo.cells[3];
        ctx.fillStyle = '#f2fbe9';
        ctx.beginPath();
        starPath(ctx, c.x, c.y + c.h, geo.W * 0.05, 0.2);
        ctx.fill();
      },
    },
    {
      /* пять кадров с номерами, между ними два слова */
      id: 'numbered', name: 'Номера', noNote: true, sample: 'Memory Photo',
      cells: [[0.27, 0.22], [0.74, 0.2], [0.44, 0.5], [0.27, 0.8], [0.72, 0.78]].map(([cx, cy], i) => P({ cx, cy, w: 0.3, aspect: 1.3, frame: 'thin', label: `(${i + 1})` })),
      overlay(ctx, geo, u, opt) {
        const list = words(opt, this.sample);
        ctx.fillStyle = opt.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `italic 400 ${geo.W * 0.045}px ${opt.font}`;
        if (list[0]) ctx.fillText(list[0], geo.W * 0.6, geo.H * 0.33);
        if (list[1]) ctx.fillText(list.slice(1).join(' '), geo.W * 0.8, geo.H * 0.55);
      },
    },
    {
      id: 'wavy', name: 'Волнистая рамка',
      cells: [P({ cx: 0.5, cy: 0.42, w: 0.74, aspect: 0.82, rot: -2, shape: 'wavy', frame: 'wavy' })],
    },
    {
      /* большой снимок в кружевной рамке с зажимом, слева полароид, справа два маленьких */
      id: 'clipped', name: 'Зажим',
      cells: [
        P({ cx: 0.53, cy: 0.42, w: 0.48, aspect: 0.85, frame: 'lace', clip: true }),
        P({ cx: 0.18, cy: 0.46, w: 0.2, aspect: 0.85, rot: -4, frame: 'polaroid' }),
        P({ cx: 0.85, cy: 0.42, w: 0.17, aspect: 0.95, frame: 'white' }),
        P({ cx: 0.85, cy: 0.6, w: 0.17, aspect: 0.95, frame: 'white' }),
      ],
      overlay(ctx, geo, u, opt) {
        stars(ctx, geo, [[0.07, 0.1, 0.5], [0.32, 0.08, 0.4, 0.3], [0.93, 0.12, 0.45], [0.06, 0.72, 0.4], [0.94, 0.78, 0.5, 0.2], [0.42, 0.78, 0.35]], 'rgba(120,170,90,.85)', u);
      },
    },
    {
      /* сверху фото, ниже овальное окно в кружеве */
      id: 'ovalLace', name: 'Овал в кружеве',
      cells: [P({ x: 0, y: 0, w: 1, h: 0.48 }), P({ cx: 0.5, cy: 0.6, w: 0.62, aspect: 1.55, shape: 'round', frame: 'ovalLace' })],
    },
    {
      /* окна как на компьютере: два снимка, значок файла и слова на серых бирках по фону в горошек */
      id: 'mac', name: 'Окна', noNote: true, sample: "I can't help feeling but",
      deco(ctx, box, u, geo) {
        polka(ctx, 0, 0, geo.W, geo.H, geo.W * 0.12, geo.W * 0.022, 'rgba(120,120,120,.28)', 0);
      },
      cells: [
        P({ cx: 0.62, cy: 0.28, w: 0.54, aspect: 1.4, frame: 'mac' }),
        P({ cx: 0.5, cy: 0.67, w: 0.56, aspect: 1.25, frame: 'mac' }),
        P({ cx: 0.17, cy: 0.47, w: 0.15, aspect: 1.1, frame: 'file' }),
      ],
      overlay(ctx, geo, u, opt) {
        const list = words(opt, this.sample);
        const spots = [[0.21, 0.19, -2], [0.17, 0.25, 0], [0.84, 0.6, 0], [0.14, 0.79, 0], [0.83, 0.92, 0]];
        list.slice(0, spots.length).forEach((wd, i) => {
          const [x, y, rot] = spots[i];
          tag(ctx, geo.W * x, geo.H * y, wd, geo.W * 0.045, rot, { bg: i % 2 ? 'rgba(255,255,255,.85)' : 'rgba(110,110,110,.75)', fg: i % 2 ? '#555555' : '#ffffff', weight: 700, font: '"Golos Text", system-ui, sans-serif' });
        });
      },
    },
  );

  /* ---------- скрапбук: слайды каруселей, мудборд, блокнот ---------- */
  /* точка в единицах коробки шаблона, переведённая в пиксели */
  const at = (geo, x, y) => [geo.box.x + (x * geo.box.w) / geo.tpl.box[0], geo.box.y + (y * geo.box.h) / geo.tpl.box[1]];
  /* полоска кадров под углом: каждый следующий кадр ниже вдоль наклона, белые рамки сливаются в одну ленту */
  function strip(x, y, w, h, n, rotDeg, extra = {}) {
    const a = (rotDeg * Math.PI) / 180;
    return Array.from({ length: n }, (_, k) => {
      const cx = x + w / 2 - Math.sin(a) * k * (h + 0.012);
      const cy = y + h / 2 + Math.cos(a) * k * (h + 0.012);
      return { x: cx - w / 2, y: cy - h / 2, w, h, rot: rotDeg, frame: 'white', clip: k === 0 && extra.clip, ...extra.cell };
    });
  }
  const PINK = '#f4c6cf';

  COLLAGES.push(
    {
      id: 'recap', name: 'Итоги месяца', noNote: true, sample: 'Month Recap.',
      palette: [
        { key: 'band', name: 'Полоса', def: PINK },
        { key: 'frames', name: 'Рамки', def: '#fbfaf6' },
        { key: 'text', name: 'Надпись', def: '#e07b93' },
        { key: 'tape', name: 'Скотч', def: '#eca0b9' },
      ],
      deco(ctx, box, u, geo, opt) {
        ctx.fillStyle = opt.c('band', PINK);
        ctx.fillRect(0, geo.H * 0.52, geo.W, geo.H * 0.48);
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        for (let i = 0; i < 5; i++) ctx.fillRect(0, geo.H * (0.555 + i * 0.014), geo.W, geo.H * 0.005);
      },
      cells: [
        P({ x: 0, y: 0, w: 1, h: 0.55 }),
        P({ cx: 0.47, cy: 0.62, w: 0.22, aspect: 1.15, rot: -8, frame: 'white', tint: 'frames' }),
        P({ cx: 0.8, cy: 0.63, w: 0.18, aspect: 1, rot: 6, frame: 'white', tint: 'frames', tape: true }),
        P({ cx: 0.25, cy: 0.82, w: 0.2, aspect: 1, frame: 'white', tint: 'frames' }),
        P({ cx: 0.66, cy: 0.85, w: 0.21, aspect: 1, rot: 3, frame: 'white', tint: 'frames' }),
      ],
      overlay(ctx, geo, u, opt) {
        const [a, b] = half(words(opt, this.sample));
        const text = opt.c('text', '#e07b93');
        marker(ctx, a, geo.W * 0.74, geo.H * 0.42, geo.W * 0.06, -8, text, 'rgba(255,255,255,.85)');
        if (b) marker(ctx, b, geo.W * 0.8, geo.H * 0.48, geo.W * 0.075, -8, text, 'rgba(255,255,255,.85)');
      },
    },
    {
      id: 'heartLetter', name: 'Сердце в конверте', noNote: true, sample: 'Favorite Moment',
      palette: [
        { key: 'lace', name: 'Кружево', def: '#f2b3c2' },
        { key: 'envelope', name: 'Конверт', def: '#f3b8c6' },
        { key: 'text', name: 'Надписи' },
      ],
      cells: [P({ cx: 0.5, cy: 0.42, w: 0.74, aspect: 0.95, shape: 'heartCell', frame: 'heartLace', color: '#f2b3c2', tint: 'lace' })],
      overlay(ctx, geo, u, opt) {
        const c = geo.cells[0];
        envelope(ctx, geo.W * 0.5, c.y + c.h * 0.9, geo.W * 0.58, opt.c('envelope', '#f3b8c6'));
        const list = words(opt, this.sample);
        ctx.fillStyle = opt.c('text', opt.ink);
        ctx.font = `500 ${geo.W * 0.03}px "Golos Text", system-ui, sans-serif`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(list[0], geo.W * 0.05, geo.H * 0.035);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        if (list.length > 1) ctx.fillText(list.slice(1).join(' '), geo.W * 0.95, geo.H * 0.965);
      },
    },
    {
      id: 'pinboard', name: 'Доска с кнопками',
      palette: [
        { key: 'lace', name: 'Кружево', def: '#f6c3d3' },
        { key: 'frames', name: 'Рамки', def: '#fbfaf6' },
        { key: 'pins', name: 'Кнопки', def: '#c9c4bc' },
      ],
      deco(ctx, box, u, geo, opt) {
        const lace = opt.c('lace', '#f6c3d3');
        laceBand(ctx, 0, 0, geo.W, geo.H * 0.04, lace);
        laceBand(ctx, geo.W, geo.H, geo.W, geo.H * 0.04, lace, Math.PI);
        spiralBind(ctx, 0, geo.H, geo.W * 0.035, geo.W * 0.055, true);
      },
      cells: [[0.32, 0.22, 0.22, -3], [0.6, 0.18, 0.2, 4], [0.84, 0.34, 0.18, -2], [0.56, 0.45, 0.22, 2], [0.29, 0.6, 0.24, -4], [0.75, 0.66, 0.22, 3]]
        .map(([cx, cy, w, rot]) => P({ cx, cy, w, aspect: 1.15, rot, frame: 'white', tint: 'frames', pin: true })),
    },
    {
      id: 'clipStrips', name: 'Ленты на зажимах', box: [1, 1.15],
      cells: [...strip(0.16, 0.08, 0.3, 0.26, 3, -4, { clip: true }), ...strip(0.55, 0.14, 0.3, 0.26, 3, 5, { clip: true })],
    },
    {
      id: 'spiralStamps', name: 'Марки и спираль', noNote: true,
      cells: [
        ...[0.2, 0.5, 0.8].map((cx) => P({ cx, cy: 0.18, w: 0.25, aspect: 1.25, frame: 'stamp', color: '#fbe3ea' })),
        P({ x: 0, y: 0.42, w: 1, h: 0.58 }),
      ],
      overlay(ctx, geo, u) {
        spiralBind(ctx, 0, geo.W, geo.H * 0.42, geo.W * 0.06);
      },
    },
    {
      id: 'twoClouds', name: 'Два облачка', noNote: true,
      deco(ctx, box, u, geo) {
        laceBand(ctx, 0, geo.H, geo.H, geo.W * 0.08, '#ddd0f0', -Math.PI / 2);
      },
      cells: [P({ cx: 0.56, cy: 0.3, w: 0.72, aspect: 1.3, shape: 'cloud' }), P({ cx: 0.56, cy: 0.69, w: 0.72, aspect: 1.3, shape: 'cloud' })],
    },
    {
      id: 'doodles', name: 'Каракули', noNote: true,
      palette: [{ key: 'ink', name: 'Каракули', def: '#f6aacd' }],
      cells: [P({ x: 0, y: 0, w: 1, h: 1 })],
      overlay(ctx, geo, u, opt) {
        const pink = opt.c('ink', '#f6aacd');
        [[0.15, 0.1, 'star', 0.05], [0.88, 0.12, 'sparkle', 0.035], [0.12, 0.55, 'loops', 0.05], [0.86, 0.58, 'star', 0.04], [0.2, 0.87, 'spiral', 0.045], [0.76, 0.9, 'heart', 0.045], [0.5, 0.05, 'wave', 0.04]]
          .forEach(([x, y, k, s]) => doodle(ctx, k, x * geo.W, y * geo.H, s * geo.W, pink, Math.max(2, 3 * u)));
        stars(ctx, geo, [[0.3, 0.2, 0.22], [0.7, 0.3, 0.18], [0.1, 0.35, 0.2], [0.82, 0.44, 0.22], [0.4, 0.75, 0.18], [0.62, 0.68, 0.15]], pink, u);
      },
    },
    {
      id: 'clipTall', name: 'Длинная лента', noNote: true, sample: 'Recap', box: [1, 1.25],
      cells: [
        ...strip(0.05, 0.05, 0.19, 0.15, 6, 0, { clip: true }),
        { x: 0.36, y: 0.08, w: 0.2, h: 0.2, rot: -4, frame: 'white', pin: true },
        { x: 0.7, y: 0.05, w: 0.2, h: 0.2, rot: 3, frame: 'white', pin: true },
        { x: 0.5, y: 0.37, w: 0.22, h: 0.22, rot: 5, frame: 'white', pin: true },
        { x: 0.34, y: 0.7, w: 0.22, h: 0.2, rot: -3, frame: 'white', pin: true },
        { x: 0.7, y: 0.68, w: 0.2, h: 0.2, rot: 4, frame: 'white', pin: true },
      ],
      overlay(ctx, geo, u, opt) {
        const [x, y] = at(geo, 0.78, 0.6);
        marker(ctx, words(opt, this.sample).join(' '), x, y, geo.box.w * 0.07, -4, '#ef7fa6');
      },
    },
    {
      id: 'mindmap', name: 'Схема', noNote: true, sample: 'little moment', box: [1, 1.25],
      palette: [
        { key: 'lines', name: 'Линии и надпись', def: '#ef6fa0' },
        { key: 'nodeA', name: 'Квадратики', def: '#f7b6cc' },
        { key: 'nodeB', name: 'Средний квадратик', def: '#a9c1e6' },
        { key: 'frames', name: 'Рамки', def: '#fbfaf6' },
      ],
      deco(ctx, box, u, geo, opt) {
        const nodes = [at(geo, 0.16, 0.18), at(geo, 0.08, 0.6), at(geo, 0.16, 1.02)];
        const ends = geo.cells.map((c) => [c.x, c.y + c.h / 2]);
        ctx.strokeStyle = opt.c('lines', '#ef6fa0');
        ctx.lineWidth = Math.max(1, 1.6 * u);
        ctx.beginPath();
        nodes.forEach(([x, y], i) => { ctx.moveTo(x, y); ctx.lineTo(ends[i][0], ends[i][1]); });
        ctx.moveTo(...nodes[1]); ctx.lineTo(...nodes[0]);
        ctx.moveTo(...nodes[1]); ctx.lineTo(...nodes[2]);
        ctx.stroke();
        const s = geo.box.w * 0.07;
        node(ctx, ...nodes[0], s, opt.c('nodeA', '#f7b6cc'));
        node(ctx, ...nodes[1], s, opt.c('nodeB', '#a9c1e6'));
        node(ctx, ...nodes[2], s, opt.c('nodeA', '#f7b6cc'));
        spiralBind(ctx, 0, geo.H, geo.W - geo.W * 0.03, geo.W * 0.05, true);
      },
      cells: [
        { x: 0.55, y: 0.04, w: 0.3, h: 0.3, frame: 'polaroid', tint: 'frames' },
        { x: 0.3, y: 0.44, w: 0.3, h: 0.3, frame: 'polaroid', tint: 'frames' },
        { x: 0.56, y: 0.86, w: 0.3, h: 0.3, frame: 'polaroid', tint: 'frames' },
      ],
      overlay(ctx, geo, u, opt) {
        const [a, b] = half(words(opt, this.sample));
        const c = geo.cells[1];
        ctx.fillStyle = opt.c('lines', '#ef6fa0');
        ctx.font = `700 ${geo.box.w * 0.045}px "Golos Text", system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(a, c.x + c.w * 1.12, c.y + c.h * 0.45);
        if (b) ctx.fillText(b, c.x + c.w * 1.12, c.y + c.h * 0.45 + geo.box.w * 0.055);
      },
    },
    {
      id: 'favorite', name: 'Любимое', noNote: true, sample: 'Favorite',
      cells: [
        P({ x: 0, y: 0, w: 1, h: 0.55 }),
        ...[0, 1].flatMap((r) => [0, 1, 2].map((c) => P({ x: c / 3 + 0.005, y: 0.565 + r * 0.22, w: 1 / 3 - 0.01, h: 0.21 }))),
      ],
      overlay(ctx, geo, u, opt) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,.35)';
        ctx.shadowBlur = 8 * u;
        ctx.font = `700 ${geo.W * 0.05}px "Golos Text", system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(words(opt, this.sample).join(' '), geo.W * 0.05, geo.H * 0.53);
        ctx.shadowBlur = 0;
        geo.cells.slice(1).forEach((c) => {
          ctx.fillStyle = 'rgba(255,255,255,.9)';
          ctx.beginPath();
          tracePts(ctx, heartPts(c.w * 0.07, c.w * 0.07, 12).map(([x, y]) => [x + c.x + c.w * 0.08, y + c.y + c.h * 0.9]));
          ctx.fill();
        });
      },
    },
    {
      id: 'stamps6', name: 'Шесть марок', box: [1, 1.35],
      palette: [
        { key: 'stamps', name: 'Марки', def: '#f9d6e1' },
        { key: 'dots', name: 'Конфетти', def: '#f096b4' },
      ],
      cells: [0, 1, 2].flatMap((r) => [0, 1].map((c) => ({ x: 0.1 + c * 0.45, y: 0.05 + r * 0.44, w: 0.35, h: 0.36, rot: (r + c) % 2 ? 2 : -2, frame: 'stamp', color: '#f9d6e1', tint: 'stamps' }))),
      overlay(ctx, geo, u, opt) {
        confetti(ctx, geo, 26, [opt.c('dots', '#f096b4')], Math.max(2, geo.W * 0.006));
      },
    },
    {
      id: 'splitStrip', name: 'Две половины', noNote: true, box: [1, 1.25],
      palette: [
        { key: 'frames', name: 'Полоска', def: '#fbfaf6' },
        { key: 'stars', name: 'Звёздочки', def: '#f7a8c8' },
      ],
      cells: [P({ x: 0, y: 0, w: 1, h: 0.5 }), P({ x: 0, y: 0.5, w: 1, h: 0.5 }), ...strip(0.28, 0.3, 0.24, 0.2, 3, 0, { cell: { tint: 'frames' } })],
      overlay(ctx, geo, u, opt) {
        const c = geo.cells[2];
        const star = opt.c('stars', '#f7a8c8');
        ctx.fillStyle = star;
        ctx.beginPath();
        starPath(ctx, c.x + c.w * 1.05, c.y - c.h * 0.05, c.w * 0.14, 0.2);
        ctx.fill();
        const d = geo.cells[4];
        doodle(ctx, 'sparkle', d.x - d.w * 0.08, d.y + d.h * 1.02, d.w * 0.12, star, Math.max(2, 3 * u));
      },
    },
    {
      id: 'moodboard', name: 'Мудборд', noNote: true, sample: 'Happy day Pretty girl!', box: [1, 1.15],
      palette: [
        { key: 'paper', name: 'Рваная бумага', def: '#f6d6dd' },
        { key: 'tape', name: 'Скотч', def: '#eca0b9' },
        { key: 'dots', name: 'Конфетти' },
        { key: 'text', name: 'Надписи' },
      ],
      deco(ctx, box, u, geo, opt) {
        const dots = opt.c('dots', null);
        confetti(ctx, geo, 70, dots ? [dots] : ['#8fb3d9', '#e7a3b8', '#9cc79a', '#e6c27a', '#b9a3d9'], Math.max(2, geo.W * 0.004));
        const paper = opt.c('paper', '#f6d6dd');
        const c4 = geo.cells[4];
        const c5 = geo.cells[5];
        tornPaper(ctx, c4.x - c4.w * 0.4, c4.y - c4.h * 0.05, c4.w * 1.3, c4.h * 1.55, paper, u);
        ctx.save();
        ctx.globalAlpha = 0.75;
        tornPaper(ctx, c5.x - c5.w * 0.25, c5.y - c5.h * 0.08, c5.w * 1.5, c5.h * 1.16, paper, u);
        ctx.restore();
      },
      cells: [
        { x: 0.22, y: 0.02, w: 0.32, h: 0.34 },
        { x: 0.19, y: 0.2, w: 0.3, h: 0.2 },
        { x: 0.66, y: 0.07, w: 0.27, h: 0.33, tape: true },
        { x: 0.12, y: 0.5, w: 0.25, h: 0.3, frame: 'grid', heartClip: true },
        { x: 0.7, y: 0.45, w: 0.23, h: 0.3 },
        { x: 0.43, y: 0.72, w: 0.3, h: 0.28, clip: true },
      ],
      overlay(ctx, geo, u, opt) {
        const list = words(opt, this.sample);
        const cut = Math.min(2, list.length);
        const [tx, ty] = at(geo, 0.16, 0.18);
        tallTag(ctx, tx, ty, geo.box.w * 0.13, geo.box.w * 0.3, list.slice(0, cut), -2, u);
        if (list.length > cut) {
          const [x, y] = at(geo, 0.18, 0.93);
          ctx.fillStyle = opt.c('text', opt.ink);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `700 ${geo.box.w * 0.055}px "Caveat", cursive`;
          ctx.fillText(list.slice(cut).join(' '), x, y);
        }
        const [sx, sy] = at(geo, 0.56, 0.52);
        doodle(ctx, 'sparkle', sx, sy, geo.box.w * 0.025, opt.c('text', opt.ink), Math.max(1, 1.5 * u));
      },
    },
    {
      id: 'notebookPage', name: 'Блокнот на спирали', noNote: true, sample: 'My fav day just my self',
      deco(ctx, box, u, geo) {
        const c = geo.cells[1];
        ctx.save();
        ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
        ctx.rotate(c.rot);
        ctx.strokeStyle = '#4f6496';
        ctx.lineWidth = Math.max(2, c.w * 0.014);
        ctx.beginPath();
        tracePts(ctx, rectEdge(c.w * 1.3, c.h * 1.42, c.w * 0.15, scallop(c.w * 0.06)));
        ctx.stroke();
        ctx.restore();
      },
      cells: [P({ x: 0, y: 0, w: 1, h: 0.5 }), P({ cx: 0.53, cy: 0.74, w: 0.56, aspect: 1.3, rot: -3, frame: 'polaroid' })],
      overlay(ctx, geo, u, opt) {
        spiralBind(ctx, 0, geo.W, geo.H * 0.5, geo.W * 0.075);
        const [a, b] = half(words(opt, this.sample));
        marker(ctx, a, geo.W * 0.76, geo.H * 0.1, geo.W * 0.075, -14, '#f472b6', '#1e2a5a');
        const c = geo.cells[1];
        if (b) marker(ctx, b, c.x + c.w * 0.15, c.y + c.h * 0.02, geo.W * 0.08, -16, '#f472b6', '#1e2a5a');
        stars(ctx, geo, [[0.12, 0.13, 0.9, 0.2], [0.26, 0.1, 0.8, -0.2], [0.2, 0.2, 0.85, 0.1]], '#f7c948', u);
        burst(ctx, c.x + c.w * 0.92, c.y + c.h * 0.05, geo.W * 0.12, '#f5b400', u);
      },
    },
    {
      id: 'triptych', name: 'Три в ряд', noNote: true,
      cells: [0, 1, 2].map((k) => P({ x: k / 3 + (k ? 0.002 : 0), y: 0, w: 1 / 3 - 0.002, h: 1 })),
      overlay(ctx, geo, u) {
        const white = 'rgba(255,255,255,.92)';
        const lw = Math.max(2, Math.min(geo.W, geo.H) * 0.008);
        const m = Math.min(geo.W, geo.H);
        [[0.06, 0.22, 'star', 0.06], [0.12, 0.8, 'wave', 0.05], [0.33, 0.86, 'spiral', 0.06], [0.67, 0.18, 'heart', 0.06], [0.72, 0.8, 'loops', 0.05], [0.95, 0.65, 'sparkle', 0.05], [0.3, 0.12, 'loops', 0.04]]
          .forEach(([x, y, k, s]) => doodle(ctx, k, x * geo.W, y * geo.H, s * m, white, lw));
      },
    },
    {
      id: 'threeOnFabric', name: 'Три на ткани', noNote: true,
      palette: [
        { key: 'frames', name: 'Рамки', def: '#fbfaf6' },
        { key: 'top', name: 'Звёзды сверху', def: '#f0f0f0' },
        { key: 'bottom', name: 'Звёзды снизу', def: '#7f9f1f' },
      ],
      cells: [
        P({ x: 0, y: 0, w: 1, h: 0.55 }),
        P({ cx: 0.52, cy: 0.64, w: 0.21, aspect: 1, frame: 'white', tint: 'frames' }),
        P({ cx: 0.35, cy: 0.8, w: 0.21, aspect: 1, frame: 'white', tint: 'frames' }),
        P({ cx: 0.73, cy: 0.82, w: 0.21, aspect: 1, frame: 'white', tint: 'frames' }),
      ],
      overlay(ctx, geo, u, opt) {
        stars(ctx, geo, [[0.78, 0.06, 0.6], [0.43, 0.13, 0.6], [0.92, 0.15, 0.6], [0.1, 0.18, 0.6], [0.27, 0.39, 0.6], [0.82, 0.42, 0.6], [0.13, 0.48, 0.6], [0.9, 0.5, 0.6]], opt.c('top', '#f0f0f0'), u);
        stars(ctx, geo, [[0.07, 0.75, 0.55], [0.22, 0.74, 0.55, 0.3], [0.13, 0.85, 0.55], [0.33, 0.94, 0.55], [0.57, 0.79, 0.55], [0.59, 0.9, 0.55], [0.86, 0.92, 0.55], [0.89, 0.78, 0.55]], opt.c('bottom', '#7f9f1f'), u);
      },
    },
  );

  /* ---------- нежные: кружево, бантики, вышивка ---------- */
  COLLAGES.push(
    {
      /* овальное зеркальце в кружеве, бантики по углам, два абзаца машинкой */
      id: 'laceMirror', name: 'Кружевное зеркальце', noNote: true, sample: 'A moment made with love A little cute of forever.',
      palette: [
        { key: 'lace', name: 'Кружево', def: '#ffffff' },
        { key: 'bows', name: 'Бантики', def: '#a9aba3' },
        { key: 'text', name: 'Надписи' },
      ],
      cells: [P({ cx: 0.5, cy: 0.49, w: 0.52, aspect: 0.68, shape: 'round', frame: 'mirrorLace', tint: 'lace' })],
      overlay(ctx, geo, u, opt) {
        const color = opt.c('bows', '#a9aba3');
        bow(ctx, geo.W * 0.86, geo.H * 0.08, geo.W * 0.2, 0.25, color);
        bow(ctx, geo.W * 0.13, geo.H * 0.88, geo.W * 0.2, -0.3, color);
        const [a, b] = half(words(opt, this.sample));
        const size = geo.W * 0.026;
        const text = opt.c('text', opt.ink);
        typed(ctx, a.split(' '), geo.W * 0.07, geo.H * 0.16, size, text, 'left');
        typed(ctx, b.split(' '), geo.W * 0.8, geo.H * 0.79, size, text, 'left');
      },
    },
    {
      /* слева маленький снимок на белом, справа большой до края, на нём белые каракули */
      id: 'diptych', name: 'Два снимка рядом', noNote: true,
      palette: [{ key: 'ink', name: 'Каракули', def: '#ffffff' }],
      cells: [P({ cx: 0.25, cy: 0.5, w: 0.31, aspect: 0.74 }), P({ x: 0.5, y: 0, w: 0.5, h: 1 })],
      overlay(ctx, geo, u, opt) {
        const color = opt.c('ink', '#ffffff');
        const m = Math.min(geo.W, geo.H);
        const lw = Math.max(1.5, m * 0.004);
        doodle(ctx, 'spiral', geo.W * 0.585, geo.H * 0.36, m * 0.018, color, lw);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(geo.W * 0.615, geo.H * 0.345, m * 0.008, 0, TAU);
        ctx.moveTo(geo.W * 0.633 + m * 0.004, geo.H * 0.36);
        ctx.arc(geo.W * 0.633, geo.H * 0.36, m * 0.004, 0, TAU);
        ctx.fill();
        doodle(ctx, 'star', geo.W * 0.67, geo.H * 0.36, m * 0.035, color, lw);
      },
    },
    {
      /* фото на весь лист, поверх белая вышивка по углам, тонкие слова и полоса тиснёной бумаги внизу */
      id: 'stitchOverlay', name: 'Вышивка и тиснение', noNote: true, sample: 'Little Dream',
      palette: [
        { key: 'stitch', name: 'Вышивка', def: '#ffffff' },
        { key: 'band', name: 'Тиснёная полоса', def: '#f7f7f4' },
        { key: 'text', name: 'Надписи', def: '#fff8e6' },
      ],
      cells: [P({ x: 0, y: 0, w: 1, h: 0.83 })],
      overlay(ctx, geo, u, opt) {
        const st = opt.c('stitch', '#ffffff');
        const s = Math.min(geo.W, geo.H) * 0.0045;
        stitchVine(ctx, geo.W * 0.98, geo.H * 0.02, -0.55, 0.83, geo.H * 0.4, s, st);
        stitchFlower(ctx, geo.W * 0.85, geo.H * 0.08, geo.W * 0.06, s, st);
        stitchFlower(ctx, geo.W * 0.9, geo.H * 0.36, geo.W * 0.045, s, st);
        stitchVine(ctx, geo.W * 0.02, geo.H * 0.45, 0.55, 0.83, geo.H * 0.38, s, st);
        stitchFlower(ctx, geo.W * 0.1, geo.H * 0.55, geo.W * 0.06, s, st);
        stitchFlower(ctx, geo.W * 0.2, geo.H * 0.68, geo.W * 0.045, s, st);
        embossed(ctx, 0, geo.H * 0.83, geo.W, geo.H * 0.17, opt.c('band', '#f7f7f4'), u);
        const list = words(opt, this.sample);
        ctx.fillStyle = opt.c('text', '#fff8e6');
        ctx.font = `italic 400 ${geo.W * 0.05}px ${opt.font}`;
        ctx.textAlign = 'left';
        ctx.fillText(list[0], geo.W * 0.1, geo.H * 0.17);
        ctx.textAlign = 'right';
        if (list.length > 1) ctx.fillText(list.slice(1).join(' '), geo.W * 0.88, geo.H * 0.7);
      },
    },
    {
      /* голубая полоса слева, через её край вышитый цветок, крупная надпись и вышитые уголки */
      id: 'sweetThings', name: 'Вышитый цветок', noNote: true, sample: 'Sweet Things',
      palette: [
        { key: 'strip', name: 'Полоса', def: '#b7c8e6' },
        { key: 'stitch', name: 'Вышивка', def: '#ecebe4' },
        { key: 'text', name: 'Надпись', def: '#fbf3ea' },
      ],
      deco(ctx, box, u, geo, opt) {
        ctx.fillStyle = opt.c('strip', '#b7c8e6');
        ctx.fillRect(0, 0, geo.W * 0.25, geo.H);
      },
      cells: [P({ x: 0.25, y: 0, w: 0.75, h: 1 })],
      overlay(ctx, geo, u, opt) {
        const st = opt.c('stitch', '#ecebe4');
        stitchedPlant(ctx, geo.W * 0.2, geo.H * 0.62, geo.H * 0.62, st, u);
        const s = Math.min(geo.W, geo.H) * 0.004;
        stitchVine(ctx, geo.W * 0.97, geo.H * 0.03, -1, 0, geo.W * 0.2, s, st);
        stitchFlower(ctx, geo.W * 0.86, geo.H * 0.06, geo.W * 0.04, s, st);
        stitchVine(ctx, geo.W * 0.97, geo.H * 0.97, -1, 0, geo.W * 0.2, s, st);
        stitchFlower(ctx, geo.W * 0.86, geo.H * 0.93, geo.W * 0.04, s, st);
        const [a, b] = half(words(opt, this.sample));
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = opt.c('text', '#fbf3ea');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `italic 400 ${geo.W * 0.14}px ${opt.font}`;
        ctx.fillText(a, geo.W * 0.14, geo.H * 0.17);
        ctx.font = `italic 400 ${geo.W * 0.1}px ${opt.font}`;
        if (b) ctx.fillText(b, geo.W * 0.42, geo.H * 0.27);
        ctx.restore();
      },
    },
    {
      /* полоска-марка из трёх кадров, вокруг бантики и серебряные звёздочки */
      id: 'stampStrip', name: 'Марка из трёх кадров', noNote: true, sample: 'Forever', box: [0.5, 1.14],
      palette: [
        { key: 'strip', name: 'Марка', def: '#fbfaf6' },
        { key: 'bows', name: 'Бантики', def: '#a9aba3' },
        { key: 'stars', name: 'Звёздочки', def: '#d9d9d6' },
        { key: 'text', name: 'Надпись' },
      ],
      deco(ctx, box, u, geo, opt) {
        stampBand(ctx, box.x, box.y, box.w, box.h, box.w * 0.028, opt.c('strip', '#fbfaf6'), u);
      },
      cells: [0, 1, 2].map((k) => ({ x: 0.05, y: 0.05 + k * 0.355, w: 0.4, h: 0.33 })),
      overlay(ctx, geo, u, opt) {
        const color = opt.c('bows', '#a9aba3');
        const s = geo.W * 0.17;
        [[0.3, 0.03, 0.3], [0.9, 0.12, -0.2], [0.14, 0.33, 0.2], [0.85, 0.48, -0.15], [0.12, 0.7, 0.35], [0.92, 0.75, -0.3], [0.55, 0.97, 0.1]]
          .forEach(([x, y, r]) => bow(ctx, geo.W * x, geo.H * y, s, r, color));
        const st = opt.c('stars', '#d9d9d6');
        [[0.78, 0.02], [0.23, 0.15], [0.83, 0.32], [0.08, 0.51], [0.73, 0.67], [0.22, 0.91]]
          .forEach(([x, y]) => silverStar(ctx, geo.W * x, geo.H * y, geo.W * 0.022, st));
        ctx.fillStyle = opt.c('text', opt.ink);
        ctx.globalAlpha = 0.6;
        ctx.font = `700 ${geo.W * 0.032}px "JetBrains Mono", ui-monospace, monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(words(opt, this.sample).join(' '), geo.W * 0.93, geo.H * 0.94);
        ctx.globalAlpha = 1;
      },
    },
  );

  /* ---------- текст с окошками ---------- */
  /* Фраза разбивается на слова и окошки. () в тексте ставит окошко: отдельно между словами или прямо внутри
     слова, как be()s()t. Если () нет, окошко встаёт после каждого второго слова. */
  function parsePhrase(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const auto = !text.includes('()');
    const out = [];
    words.forEach((wd, i) => {
      const parts = wd.split('()');
      parts.forEach((p, j) => {
        if (p) out.push({ t: 'text', s: p, space: j === 0 && i > 0 });
        if (j < parts.length - 1) out.push({ t: 'win', space: j === 0 && !p && i > 0 });
      });
      if (auto && i % 2 === 1 && i < words.length - 1) out.push({ t: 'win', space: true });
    });
    return out;
  }
  let measureCtx = null;
  /* Раскладывает фразу строками по центру области. Возвращает окошки (wins) и всё, что надо напечатать (items). */
  function flowText(text, region, o) {
    measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
    const mc = measureCtx;
    const tokens = parsePhrase(text);
    const braces = o.brace === '{}' ? ['{', '}'] : o.brace === '()' ? ['(', ')'] : null;
    let size = o.size;
    let lines;
    let lineH;
    const layoutAt = (sz) => {
      mc.font = `${o.weight} ${sz}px ${o.css}`;
      const winH = sz * o.winScale;
      const pad = sz * (o.pad || 0.2);
      const braceW = braces ? mc.measureText(braces[0]).width : 0;
      const spaceW = mc.measureText(' ').width * 1.2;
      let k = 0;
      const sized = tokens.map((tk) => {
        if (tk.t === 'text') return { ...tk, w: mc.measureText(tk.s).width };
        const ww = winH * o.aspects[k++ % o.aspects.length];
        return { ...tk, ww, w: ww + (braces ? (braceW + pad) * 2 : pad * 2), braceW, pad };
      });
      /* склеиваем куски одного слова (be, окошко, s…), переносить можно только между словами */
      const groups = [];
      sized.forEach((tk, i) => {
        if (i === 0 || tk.space) groups.push([]);
        groups[groups.length - 1].push(tk);
      });
      const rows = [[]];
      let x = 0;
      groups.forEach((grp) => {
        const gw = grp.reduce((a, tk) => a + tk.w, 0);
        const gap = rows[rows.length - 1].length ? spaceW : 0;
        if (x + gap + gw > region.w && rows[rows.length - 1].length) {
          rows.push([]);
          x = 0;
        }
        const row = rows[rows.length - 1];
        x += row.length ? spaceW : 0;
        grp.forEach((tk) => {
          row.push({ ...tk, x });
          x += tk.w;
        });
      });
      return { rows, winH, lineH: Math.max(sz * 1.45, winH * (o.lineGap || 1.2)) };
    };
    for (let i = 0; i < 14; i++) {
      ({ rows: lines, lineH } = layoutAt(size));
      if (lines.length * lineH <= region.h) break;
      size *= 0.9;
    }
    const { winH } = layoutAt(size);
    const wins = [];
    const items = [];
    const top = region.y + (region.h - lines.length * lineH) / 2;
    let n = 0;
    lines.forEach((row, r) => {
      const last = row[row.length - 1];
      const rowW = last ? last.x + last.w : 0;
      const x0 = region.x + (o.align === 'left' ? 0 : (region.w - rowW) / 2);
      const cy = top + lineH * (r + 0.5);
      row.forEach((tk) => {
        const x = x0 + tk.x;
        if (tk.t === 'text') {
          items.push({ kind: 'text', s: tk.s, x, y: cy, size, weight: o.weight, css: o.css, color: o.color });
          return;
        }
        const wx = x + (braces ? tk.braceW + tk.pad : tk.pad);
        /* окошко по центру строки или стоит на линии текста, как буква */
        const wy = o.winAlign === 'baseline' ? cy + size * 0.36 - winH : cy - winH / 2;
        wins.push({ x: wx, y: wy, w: tk.ww, h: winH, rot: 0 });
        if (braces) {
          items.push({ kind: 'text', s: braces[0], x, y: cy, size, weight: o.weight, css: o.css, color: o.color });
          items.push({ kind: 'text', s: braces[1], x: wx + tk.ww + tk.pad, y: cy, size, weight: o.weight, css: o.css, color: o.color });
        }
        n += 1;
        if (o.numbered) {
          items.push({ kind: 'text', s: `(${String(n).padStart(2, '0')})`, x: wx + tk.ww / 2, y: wy + winH + size * 0.22, size: size * 0.24, weight: 400, css: o.css, color: o.color, align: 'center' });
        }
      });
    });
    return { wins, items, size };
  }

  /* случайные непересекающиеся прямоугольники заданных размеров внутри области */
  function scatterRects(sizes, area, rng) {
    const placed = [];
    sizes.forEach(([w, h]) => {
      let r = null;
      for (let tries = 0; tries < 80; tries++) {
        const c = { x: area.x + rng() * Math.max(1, area.w - w), y: area.y + rng() * Math.max(1, area.h - h), w, h };
        const pad = Math.min(area.w, area.h) * 0.02;
        if (placed.every((p) => c.x + c.w + pad < p.x || p.x + p.w + pad < c.x || c.y + c.h + pad < p.y || p.y + p.h + pad < c.y)) {
          r = c;
          break;
        }
        r = c;
      }
      placed.push(r);
    });
    return placed;
  }

  const SANS = '"Golos Text", system-ui, sans-serif';
  const MONO = '"JetBrains Mono", ui-monospace, monospace';
  const markWords = (env, sample) => ((env.text || env.title || '').trim() || sample).split(/\s+/).filter(Boolean);

  COLLAGES.push(
    {
      /* фраза на бумаге, между словами окошки в фигурных скобках, в каждом своё фото */
      id: 'phrase', name: 'Фраза с фото', noNote: true, sample: 'A kaleidoscope () of () painted wings dances () across () the vast and () tranquil cerulean () sky.',
      palette: [{ key: 'text', name: 'Текст' }],
      choices: [{ key: 'brace', name: 'Скобки', def: '{}', options: [['{}', '{ }'], ['()', '( )'], ['none', 'Без скобок']] }],
      layout(W, H, env) {
        const m = Math.min(W, H);
        const f = flowText(env.text || this.sample, { x: W * 0.07, y: H * 0.08, w: W * 0.86, h: H * 0.84 }, {
          size: m * 0.05, weight: 400, css: SANS, winScale: 1.9, aspects: [1.3, 1, 1.5, 0.75, 1.5, 0.75], brace: env.pick('brace', '{}'), color: env.pick('text', env.ink),
        });
        return { cells: f.wins.map((c) => ({ ...c, inline: true })), items: f.items };
      },
    },
    {
      /* крупные буквы, окошки стоят прямо в словах, под ними номера */
      id: 'phraseLetters', name: 'Буквы и фото', noNote: true, sample: 'Th()e be()s()t of() (June)',
      palette: [{ key: 'text', name: 'Текст' }],
      choices: [{ key: 'nums', name: 'Номера', def: 'on', options: [['on', 'С номерами'], ['off', 'Без номеров']] }],
      layout(W, H, env) {
        const m = Math.min(W, H);
        const f = flowText(env.text || this.sample, { x: W * 0.06, y: H * 0.12, w: W * 0.88, h: H * 0.72 }, {
          size: m * 0.16, weight: 500, css: SANS, winScale: 1.15, aspects: [1, 1, 0.75, 1.05, 0.9], winAlign: 'baseline', lineGap: 1.45, pad: 0.04,
          brace: 'none', numbered: env.pick('nums', 'on') === 'on', color: env.pick('text', env.ink),
        });
        return { cells: f.wins.map((c) => ({ ...c, inline: true })), items: f.items };
      },
    },
    {
      /* фото на весь лист, поверх крупная фраза цветом и маленькие окошки в скобках */
      id: 'phraseOver', name: 'Фраза поверх фото', noNote: true, sample: 'i am () () () () made of () memories ()',
      palette: [{ key: 'text', name: 'Текст', def: '#d64545' }],
      choices: [
        { key: 'brace', name: 'Скобки', def: '()', options: [['()', '( )'], ['{}', '{ }'], ['none', 'Без скобок']] },
        { key: 'shape', name: 'Окошки', def: 'rect', options: [['rect', 'Прямоугольные'], ['round', 'Круглые']] },
        { key: 'nums', name: 'Номера', def: 'off', options: [['off', 'Без номеров'], ['on', 'С номерами']] },
      ],
      layout(W, H, env) {
        const m = Math.min(W, H);
        /* круглые окошки крупнее, как кружки-фото между словами */
        const round = env.pick('shape', 'rect') === 'round';
        const f = flowText(env.text || this.sample, { x: W * 0.04, y: H * 0.3, w: W * 0.92, h: H * 0.38 }, {
          size: m * 0.075, weight: 400, css: SANS, winScale: round ? 1.5 : 0.85, aspects: round ? [1] : [1.6], pad: round ? 0.3 : 0.55, lineGap: round ? 1.15 : 1.2,
          brace: env.pick('brace', '()'), color: env.pick('text', '#d64545'), numbered: env.pick('nums', 'off') === 'on',
        });
        return { cells: [{ x: 0, y: 0, w: W, h: H, rot: 0 }, ...f.wins.map((c) => ({ ...c, inline: true, shape: round ? 'round' : undefined }))], items: f.items };
      },
    },
    {
      /* одно фото: сверху фраза, в окошках кусочки фото, а на самом фото внизу на их месте дырки */
      id: 'cutouts', name: 'Вырезки', noNote: true, shuffle: true, sample: 'Warm () lanterns glow like luminous () blossoms against the () cool indigo () of () a deepening () sky. ()',
      palette: [{ key: 'text', name: 'Текст' }],
      choices: [
        { key: 'brace', name: 'Скобки', def: '()', options: [['()', '( )'], ['{}', '{ }'], ['none', 'Без скобок']] },
        { key: 'side', name: 'Фото', def: 'bottom', options: [['bottom', 'Снизу'], ['top', 'Сверху']] },
      ],
      layout(W, H, env) {
        const m = Math.min(W, H);
        const top = env.pick('side', 'bottom') === 'top';
        const photo = { x: 0, y: top ? 0 : H * 0.5, w: W, h: H * 0.5 };
        const textArea = { x: W * 0.07, y: top ? H * 0.53 : H * 0.05, w: W * 0.86, h: H * 0.42 };
        const f = flowText(env.text || this.sample, textArea, {
          size: m * 0.042, weight: 400, css: SANS, winScale: 1.9, aspects: [0.6, 1, 1.2, 1.5, 0.8, 0.6, 1.1], brace: env.pick('brace', '()'), color: env.pick('text', env.ink),
        });
        /* дырки того же размера, что окошки, в случайных местах фото */
        const holes = scatterRects(f.wins.map((w) => [w.w, w.h]), { x: photo.x + W * 0.04, y: photo.y + H * 0.03, w: W * 0.92, h: H * 0.44 }, env.rng);
        const pieces = f.wins.map((w, i) => ({ ...w, from: { x: holes[i].x - photo.x, y: holes[i].y - photo.y, w: holes[i].w, h: holes[i].h } }));
        return { cells: [{ ...photo, rot: 0 }], items: f.items, holes, pieces };
      },
    },
    {
      /* фото на весь лист, на нём рамки вокруг людей с подписями: плашкой, номером или облаком слов */
      id: 'marked', name: 'Разметка', noNote: true, marks: true, sample: 'Traveller-1 Traveller-2 Traveller-3 Traveller-4',
      demoMarks: [{ x: 0.3, y: 0.42, w: 0.16, h: 0.3 }, { x: 0.52, y: 0.34, w: 0.18, h: 0.36 }],
      palette: [
        { key: 'boxA', name: 'Рамки 1, 3, 5', def: '#ff2d6f' },
        { key: 'boxB', name: 'Рамки 2, 4, 6', def: '#39e26a' },
      ],
      choices: [
        { key: 'labels', name: 'Подписи', def: 'plaque', options: [['plaque', 'Плашкой'], ['number', '(1) слово'], ['none', 'Без подписей']] },
        { key: 'echo', name: 'Облако слов', def: 'on', options: [['on', 'Есть'], ['off', 'Нет']] },
        { key: 'stars', name: 'Звёздочки *', def: 'on', options: [['on', 'Есть'], ['off', 'Нет']] },
      ],
      layout(W, H, env) {
        const cell = { x: 0, y: 0, w: W, h: H, rot: 0 };
        return { cells: [cell], marks: env.marks.map((mk) => ({ x: mk.x * W, y: mk.y * H, w: mk.w * W, h: mk.h * H })) };
      },
      overlay(ctx, geo, u, opt) {
        const list = markWords(opt, this.sample);
        const style = opt.c('labels', 'plaque');
        const m = Math.min(geo.W, geo.H);
        geo.marks.forEach((b, i) => {
          const color = i % 2 ? opt.c('boxB', '#39e26a') : opt.c('boxA', '#ff2d6f');
          const word = list[i % list.length];
          const rng = Motifs.makeRng(i * 31 + 5);
          if (opt.c('echo', 'on') === 'on') {
            /* то же слово много раз вокруг рамки, разного размера, как гул голосов */
            ctx.fillStyle = color;
            ctx.textBaseline = 'middle';
            for (let k = 0; k < 16; k++) {
              const a = Math.PI + rng() * Math.PI * (i % 2 ? 0.9 : 1.1) - (i % 2 ? 0 : 0.1);
              const d = rng.range(0.45, 0.85);
              const s = m * rng.range(0.012, 0.032);
              ctx.font = `600 ${s}px Georgia, "Times New Roman", serif`;
              ctx.textAlign = 'center';
              const side = i % 2 ? 1 : -1;
              ctx.fillText(word.replace(/-?\d+$/, '') || word, b.x + b.w / 2 + side * Math.abs(Math.cos(a)) * b.w * (0.6 + d), b.y + b.h * 0.15 + Math.sin(a) * b.h * d * 0.6 + rng.range(-0.3, 0.6) * b.h);
            }
          }
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(2, 3 * u);
          ctx.strokeRect(b.x, b.y, b.w, b.h);
          if (opt.c('stars', 'on') === 'on') {
            ctx.fillStyle = i % 2 ? '#e64be6' : '#4fd8ff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let k = 0; k < 3; k++) {
              ctx.font = `700 ${m * rng.range(0.025, 0.06)}px ${SANS}`;
              ctx.fillText('*', b.x + b.w * rng.range(0.2, 0.8), b.y + b.h * rng.range(0.1, 0.45));
            }
          }
          if (style === 'plaque') {
            const s = m * 0.026;
            ctx.font = `600 ${s}px ${SANS}`;
            const tw = ctx.measureText(word).width;
            ctx.fillStyle = color;
            ctx.fillRect(b.x - ctx.lineWidth / 2, b.y - s * 1.5, tw + s * 0.8, s * 1.5);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(word, b.x + s * 0.4, b.y - s * 0.72);
          } else if (style === 'number') {
            const s = m * 0.034;
            ctx.fillStyle = color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = `400 ${s * 0.8}px ${SANS}`;
            ctx.fillText(`(${i + 1})`, b.x + b.w + s * 0.4, b.y + s * 0.2);
            ctx.font = `700 ${s}px ${SANS}`;
            ctx.fillText(word, b.x + b.w + s * 1.8, b.y + s * 0.2);
          }
        });
      },
    },
    {
      /* сверху фото с рамками вокруг людей, снизу заливка: вырезанные рамки на тех же местах, связанные линиями */
      id: 'markedNet', name: 'Сеть людей', noNote: true, marks: true, sample: "maybe we're all main character just crossing paths in each other's stories",
      demoMarks: [[0.1, 0.3], [0.2, 0.62], [0.33, 0.4], [0.45, 0.7], [0.55, 0.32], [0.68, 0.58], [0.8, 0.36], [0.9, 0.72], [0.25, 0.85], [0.62, 0.85]]
        .map(([x, y]) => ({ x, y, w: 0.05, h: 0.12 })),
      palette: [
        { key: 'fill', name: 'Заливка', def: '#1557d6' },
        { key: 'boxes', name: 'Рамки на фото', def: '#4f7fe6' },
        { key: 'top', name: 'Слова на фото', def: '#1f5ad8' },
        { key: 'lines', name: 'Линии и слова', def: '#ffffff' },
      ],
      deco(ctx, box, u, geo, opt) {
        ctx.fillStyle = opt.c('fill', '#1557d6');
        ctx.fillRect(0, geo.H * 0.5, geo.W, geo.H * 0.5);
        /* каждая вырезка связана с двумя ближайшими и одной подальше */
        const ps = geo.pieces.map((p) => [p.x + p.w / 2, p.y + p.h / 2]);
        ctx.strokeStyle = opt.c('lines', '#ffffff');
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = Math.max(1, 1.3 * u);
        ctx.beginPath();
        ps.forEach((p, i) => {
          const order = ps.map((q, j) => [Math.hypot(q[0] - p[0], q[1] - p[1]), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]);
          [order[0], order[1], order[3]].filter(Boolean).forEach(([, j]) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(ps[j][0], ps[j][1]); });
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
      },
      layout(W, H, env) {
        const cell = { x: 0, y: 0, w: W, h: H * 0.5, rot: 0 };
        const marks = env.marks.map((mk) => ({ x: mk.x * cell.w, y: mk.y * cell.h, w: mk.w * cell.w, h: mk.h * cell.h }));
        const area = { x: W * 0.03, y: H * 0.55, w: W * 0.94, h: H * 0.4 };
        const pieces = marks.map((b) => {
          const w = b.w * 0.85;
          const h = b.h * 0.85;
          return { x: area.x + (b.x + b.w / 2) / cell.w * area.w - w / 2, y: area.y + (b.y + b.h / 2) / cell.h * area.h - h / 2, w, h, border: '#ffffff', from: { ...b } };
        });
        return { cells: [cell], marks, pieces };
      },
      overlay(ctx, geo, u, opt) {
        const list = markWords(opt, this.sample);
        const cut = Math.max(1, Math.round(list.length * 0.42));
        ctx.strokeStyle = opt.c('boxes', '#4f7fe6');
        ctx.lineWidth = Math.max(1, 1.5 * u);
        geo.marks.forEach((b) => ctx.strokeRect(b.x, b.y, b.w, b.h));
        const s = Math.min(geo.W, geo.H) * 0.034;
        const put = (wd, n, x, y, color) => {
          ctx.fillStyle = color;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.font = `400 ${s * 0.8}px ${SANS}`;
          ctx.fillText(`(${n})`, x, y);
          ctx.font = `700 ${s}px ${SANS}`;
          ctx.fillText(wd, x + s * 1.6, y);
        };
        const topSpots = [[0.15, 0.18], [0.27, 0.25], [0.5, 0.27], [0.66, 0.29], [0.76, 0.37], [0.12, 0.38], [0.4, 0.4]];
        list.slice(0, cut).forEach((wd, i) => put(wd, i + 1, geo.W * topSpots[i % topSpots.length][0], geo.H * topSpots[i % topSpots.length][1], opt.c('top', '#1f5ad8')));
        const botSpots = [[0.07, 0.535], [0.48, 0.58], [0.74, 0.61], [0.12, 0.89], [0.27, 0.945], [0.52, 0.955], [0.8, 0.95], [0.4, 0.9]];
        list.slice(cut).forEach((wd, i) => put(wd, i + 1, geo.W * botSpots[i % botSpots.length][0], geo.H * botSpots[i % botSpots.length][1], opt.c('lines', '#ffffff')));
      },
    },
  );

  /* ---------- лист марок на весь лист ---------- */
  /* Марки идут сеткой до краёв и дальше: крайние обрезаются, как на листе марок под стеклом.
     Своих снимков меньше, чем марок: центральные марки получают разные снимки, крайние повторяют их.
     Текст из «Подписи» печатается на каждой марке по-разному: мелко, крупно или во всю марку. */
  const STAMP_GRIDS = {
    big: { sw: 0.47, cx: 0.235, cy: 0.27, n: 4 },
    sheet: { sw: 0.36, cx: 0.5, cy: 0.12, n: 6 },
    neat: { sw: 0.36, cx: 0.29, cy: 0.2, n: 6, rows: 3, cols: 2 },
  };
  COLLAGES.push({
    id: 'stampSheet', name: 'Лист марок', noNote: true, sample: 'BUT WHY ?',
    palette: [
      { key: 'bg', name: 'Фон между марками', def: '#0a0a0a' },
      { key: 'stamps', name: 'Марки', def: '#efe6d8' },
      { key: 'line', name: 'Рамка картинки', def: '#2b2b2b' },
      { key: 'text', name: 'Текст', def: '#2b2b2b' },
    ],
    choices: [
      { key: 'grid', name: 'Расположение', def: 'big', options: [['big', 'Крупно, 2 × 2'], ['sheet', 'Лист до краёв'], ['neat', 'Ровно, 2 × 3']] },
      { key: 'words', name: 'Текст на марках', def: 'on', options: [['on', 'Есть'], ['off', 'Нет']] },
    ],
    deco(ctx, box, u, geo, opt) {
      ctx.fillStyle = opt.c('bg', '#0a0a0a');
      ctx.fillRect(0, 0, geo.W, geo.H);
    },
    layout(W, H, env) {
      const g = STAMP_GRIDS[env.pick('grid', 'big')] || STAMP_GRIDS.big;
      const sw = g.sw * W;
      const sh = sw / 1.36;
      const gap = W * 0.035;
      const px = sw * 1.16 + gap;
      const py = sh + sw * 0.16 + gap;
      const list = [];
      if (g.rows) {
        for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) list.push([g.cx * W + c * px, g.cy * H + r * py]);
      } else {
        /* сетка от опорной марки во все стороны, пока покрывает лист с запасом */
        const c0 = Math.ceil((g.cx * W + px / 2) / px);
        const r0 = Math.ceil((g.cy * H + py / 2) / py);
        for (let r = -r0; g.cy * H + r * py - py / 2 < H; r++) {
          for (let c = -c0; g.cx * W + c * px - px / 2 < W; c++) list.push([g.cx * W + c * px, g.cy * H + r * py]);
        }
      }
      /* ближние к центру марки получают разные снимки, дальние повторяют их по кругу */
      const order = list.map((p, k) => [Math.hypot(p[0] - W / 2, (p[1] - H / 2) * 0.8), k]).sort((a, b) => a[0] - b[0]);
      const slotOf = new Map(order.map(([, k], rank) => [k, rank % g.n]));
      const stamps = env.pick('stamps', '#efe6d8');
      const line = env.pick('line', '#2b2b2b');
      const cells = list.map(([cx, cy], k) => ({
        x: cx - sw / 2, y: cy - sh / 2, w: sw, h: sh, rot: 0, frame: 'stamp', color: stamps, inner: true, innerColor: line, slot: slotOf.get(k), style: k,
      }));
      return { cells };
    },
    overlay(ctx, geo, u, opt) {
      if (opt.c('words', 'on') === 'off') return;
      const text = words(opt, this.sample).join(' ');
      const color = opt.c('text', '#2b2b2b');
      geo.cells.forEach((c) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(c.x, c.y, c.w, c.h);
        ctx.clip();
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        /* у каждой марки своя подача текста; узкое начертание как у плакатного шрифта */
        const v = [
          { size: 0.13, x: 0.5, y: 0.2, align: 'center' },
          { size: 0.3, x: 0.93, y: 0.5, align: 'right' },
          { size: 0.95, x: -0.12, y: 0.62, align: 'left' },
          { size: 0.11, x: 0.5, y: 0.78, align: 'center' },
          { size: 0.18, x: 0.08, y: 0.32, align: 'left' },
        ][c.style % 5];
        ctx.translate(c.x + c.w * v.x, c.y + c.h * v.y);
        ctx.scale(0.78, 1);
        ctx.font = `700 ${c.h * v.size}px ${SANS}`;
        ctx.textAlign = v.align;
        ctx.fillText(text, 0, 0);
        ctx.restore();
      });
    },
  });

  const byId = (id) => COLLAGES.find((c) => c.id === id) || null;
  /* Рамки, у которых можно поменять цвет. */
  const COLORABLE = ['border', 'thin', 'wavy', 'lace', 'ovalLace', 'stamp', 'heartLace'];
  const hasColorFrame = (id) => !!byId(id) && (byId(id).cells || []).some((c) => COLORABLE.includes(c.frame));
  /* Что в шаблоне можно перекрасить. Свой список у шаблона в palette: key, name и def (цвет по умолчанию,
     пусто значит «как получится само», например текст под цвет бумаги). У шаблонов без списка,
     но с цветными рамками, один пункт «Цвет рамки». */
  function paletteOf(id) {
    const tpl = byId(id);
    if (!tpl) return [];
    if (tpl.palette) return tpl.palette;
    return hasColorFrame(id) ? [{ key: 'frame', name: 'Цвет рамки' }] : [];
  }

  /* Где что лежит на карточке W × H: коробка шаблона, ячейки в пикселях и полоса для подписи снизу. */
  /* s: состояние карточки, нужно шаблонам, которые раскладывают себя по тексту, рамкам и зерну. */
  function geometry(id, W, H, s = {}, ink = '#1b2522') {
    const tpl = byId(id);
    if (!tpl) return null;
    if (tpl.layout) {
      const chosen = (s.tints && s.tints[id]) || {};
      const fonts = window.Render ? window.Render.FONTS : [];
      const font = fonts.find((f) => f.id === (s.note && s.note.font)) || { css: SANS, weight: 400 };
      const env = {
        text: ((s.note && s.note.title) || '').trim(),
        date: (s.note && s.note.date) || '',
        place: ((s.note && s.note.place) || '').trim(),
        font,
        ink,
        pick: (key, def) => (chosen[key] && chosen[key] !== 'auto' ? chosen[key] : def),
        rng: Motifs.makeRng((s.seed || 7) * 13 + 1),
        marks: (s.marks && s.marks[id]) || tpl.demoMarks || [],
      };
      const out = tpl.layout(W, H, env);
      return { tpl, box: { x: 0, y: 0, w: W, h: H }, W, H, note: null, items: [], pieces: [], holes: [], marks: [], ...out };
    }
    const unit = Math.min(W, H);
    const m = Math.round(unit * 0.06);
    const t = tpl.noNote ? m : Math.round(unit * 0.15);
    const area = { x: m, y: m, w: W - m * 2, h: H - m - t };
    let box;
    let sx;
    let sy;
    if (tpl.fill || !tpl.box) {
      box = area;
      sx = area.w;
      sy = area.h;
    } else {
      const [bw, bh] = tpl.box;
      const k = Math.min(area.w / bw, area.h / bh);
      box = { x: area.x + (area.w - bw * k) / 2, y: area.y + (area.h - bh * k) / 2, w: bw * k, h: bh * k };
      sx = sy = k;
    }
    const cells = tpl.cells.map((c) => {
      let r;
      if (c.page && c.cx !== undefined) {
        const cw = c.w * W;
        const ch = cw / c.aspect;
        r = { x: c.cx * W - cw / 2, y: c.cy * H - ch / 2, w: cw, h: ch };
      } else if (c.page) {
        r = { x: c.x * W, y: c.y * H, w: c.w * W, h: c.h * H };
      } else {
        r = { x: box.x + c.x * sx, y: box.y + c.y * sy, w: c.w * sx, h: c.h * sy };
      }
      return { ...c, ...r, rot: ((c.rot || 0) * Math.PI) / 180 };
    });
    return { tpl, box, cells, W, H, items: [], pieces: [], holes: [], marks: [], note: tpl.noNote ? null : { x: m, y: H - t, w: W - m * 2, h: t } };
  }

  /* Какая ячейка под точкой: проверяем с учётом поворота, сверху вниз. */
  function cellAt(geo, px, py) {
    for (let i = geo.cells.length - 1; i >= 0; i--) {
      const c = geo.cells[i];
      const dx = px - (c.x + c.w / 2);
      const dy = py - (c.y + c.h / 2);
      const lx = dx * Math.cos(-c.rot) - dy * Math.sin(-c.rot);
      const ly = dx * Math.sin(-c.rot) + dy * Math.cos(-c.rot);
      if (Math.abs(lx) <= c.w / 2 && Math.abs(ly) <= c.h / 2) return c.slot ?? i;
    }
    return -1;
  }
  /* ячейка, где лежит снимок номер i: у листа марок один снимок повторяется в нескольких ячейках */
  const cellOf = (geo, i) => geo.cells.find((c, k) => (c.slot ?? k) === i);

  /* сколько снимков нужно шаблону: у фраз это зависит от текста */
  const count = (id, s) => {
    const tpl = byId(id);
    if (!tpl) return 1;
    if (!tpl.layout) return tpl.cells.length;
    const cells = geometry(id, 1080, 1350, s).cells;
    return cells.reduce((n, c, k) => Math.max(n, (c.slot ?? k) + 1), 0);
  };

  /* ---------- лента снимков поверх лица, красные блоки ---------- */
  const Q = (o) => ({ page: true, ...o });
  COLLAGES.push(
    {
      /* фото на весь лист, на уровне глаз лента из разных снимков */
      id: 'eyeStrip', name: 'Лента снимков', noNote: true,
      cells: [
        Q({ x: 0, y: 0, w: 1, h: 1 }),
        Q({ x: 0, y: 0.235, w: 0.12, h: 0.225 }),
        Q({ x: 0.12, y: 0.235, w: 0.24, h: 0.265 }),
        Q({ x: 0.36, y: 0.235, w: 0.16, h: 0.225 }),
        Q({ x: 0.52, y: 0.235, w: 0.24, h: 0.225 }),
        Q({ x: 0.76, y: 0.235, w: 0.14, h: 0.265 }),
        Q({ x: 0.9, y: 0.235, w: 0.1, h: 0.32 }),
      ],
    },
    {
      /* фото на весь лист и одна широкая полоса другого снимка поперёк */
      id: 'eyeBand', name: 'Полоса поперёк', noNote: true,
      cells: [Q({ x: 0, y: 0, w: 1, h: 1 }), Q({ x: 0, y: 0.14, w: 1, h: 0.24 })],
    },
    {
      /* ряд из четырёх снимков, в середине просвет на основное фото */
      id: 'gallery', name: 'Галерея', noNote: true,
      deco(ctx, box, u, geo, opt) {
        ctx.fillStyle = opt.c('bg', '#151210');
        ctx.fillRect(0, 0, geo.W, geo.H);
      },
      palette: [{ key: 'bg', name: 'Фон', def: '#151210' }],
      cells: [
        Q({ x: 0.4, y: 0.27, w: 0.2, h: 0.4 }),
        Q({ x: 0.02, y: 0.28, w: 0.18, h: 0.38 }),
        Q({ x: 0.21, y: 0.28, w: 0.18, h: 0.38 }),
        Q({ x: 0.61, y: 0.28, w: 0.18, h: 0.38 }),
        Q({ x: 0.8, y: 0.28, w: 0.18, h: 0.38 }),
      ],
    },
    {
      /* девять чёрно-белых квадратиков на цветном листе */
      id: 'nineBits', name: 'Девять кусочков', noNote: true,
      palette: [{ key: 'bg', name: 'Фон', def: '#e3241f' }],
      choices: [{ key: 'tone', name: 'Снимки', def: 'mono', options: [['mono', 'Чёрно-белые'], ['color', 'Цветные']] }],
      deco(ctx, box, u, geo, opt) {
        ctx.fillStyle = opt.c('bg', '#e3241f');
        ctx.fillRect(0, 0, geo.W, geo.H);
        /* потёртости бумаги */
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,.12)';
        ctx.lineWidth = 1.2 * u;
        let a = 7;
        const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 26; i++) {
          const x = rnd() * geo.W, y = rnd() * geo.H;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (rnd() - 0.5) * geo.W * 0.3, y + (rnd() - 0.5) * geo.H * 0.06);
          ctx.stroke();
        }
        ctx.restore();
      },
      layout(W, H, env) {
        const s = Math.min(W, H) * 0.155;
        const gap = s * 0.38;
        const x0 = W / 2 - s * 1.5 - gap, y0 = H / 2 - s * 1.5 - gap;
        const mono = env.pick('tone', 'mono') === 'mono';
        const tilt = [-1.5, 1, 0.5, 1.5, -0.5, -1, 1, 0, -1.5];
        const cells = [];
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const k = r * 3 + c;
            cells.push({ x: x0 + c * (s + gap), y: y0 + r * (s + gap), w: s, h: s, rot: (tilt[k] * Math.PI) / 180, mono });
          }
        }
        return { cells };
      },
    },
    {
      /* три снимка рядом, поверх красные плашки; открыта только полоса глаз */
      id: 'redBlocks', name: 'Красные плашки', noNote: true,
      palette: [{ key: 'red', name: 'Цвет плашек', def: '#d42027' }],
      choices: [{ key: 'tone', name: 'Снимки', def: 'mono', options: [['mono', 'Чёрно-белые'], ['color', 'Цветные']] }],
      layout(W, H, env) {
        const mono = env.pick('tone', 'mono') === 'mono';
        return {
          cells: [
            { x: 0, y: 0, w: W * 0.3, h: H, rot: 0, mono },
            { x: W * 0.3, y: 0, w: W * 0.41, h: H, rot: 0, mono },
            { x: W * 0.71, y: 0, w: W * 0.29, h: H, rot: 0, mono },
          ],
        };
      },
      overlay(ctx, geo, u, opt) {
        const { W, H } = geo;
        ctx.save();
        ctx.fillStyle = opt.c('red', '#d42027');
        ctx.fillRect(W * 0.3, 0, W * 0.41, H * 0.33);
        ctx.fillRect(W * 0.3, H * 0.52, W * 0.41, H * 0.48);
        ctx.fillRect(0, H * 0.33, W * 0.3, H * 0.19);
        /* сгибы старой бумаги */
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.lineWidth = 1.5 * u;
        ctx.beginPath();
        [0.33, 0.52, 0.7].forEach((y) => { ctx.moveTo(0, H * y); ctx.lineTo(W, H * y); });
        ctx.moveTo(W * 0.3, 0); ctx.lineTo(W * 0.3, H);
        ctx.moveTo(W * 0.71, 0); ctx.lineTo(W * 0.71, H);
        ctx.stroke();
        ctx.restore();
      },
    },
  );

  /* ---------- итоги месяца: россыпь, скобки, календарь, капча, слова вразброс, листалка ---------- */
  let textCtx = null;
  /* ширина строки заданным шрифтом */
  function measure(text, font) {
    textCtx = textCtx || document.createElement('canvas').getContext('2d');
    textCtx.font = font;
    return textCtx.measureText(text).width;
  }
  const hits = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
  /* копия списка, перемешанная зерном шаблона: кнопка «Перемешать» даёт новую раскладку */
  function shuffled(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /* значок: звезда, сердце или искра с четырьмя лучами */
  function mark(ctx, kind, x, y, r) {
    ctx.beginPath();
    if (kind === 'heart') tracePts(ctx, heartPts(r * 2.1, r * 1.9, 24).map(([px, py]) => [px + x, py + y]));
    else if (kind === 'spark') {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const rr = i % 2 ? r * 0.24 : r;
        ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
    } else starPath(ctx, x, y, r, 0);
    ctx.fill();
  }
  /* скобка высотой h у края x: side -1 открывающая слева от фото, 1 закрывающая справа. Возвращает ширину. */
  function bracket(ctx, kind, x, cy, h, side, u) {
    const t = h * 0.035;
    if (kind === '()') {
      /* серп: толще в середине, тоньше к концам */
      const a = h * 0.16;
      ctx.beginPath();
      ctx.moveTo(x, cy - h / 2);
      ctx.quadraticCurveTo(x + side * a * 2, cy, x, cy + h / 2);
      ctx.quadraticCurveTo(x + side * (a * 2 - t * 3.4), cy, x, cy - h / 2);
      ctx.fill();
      return a + t;
    }
    if (kind === '[]') {
      const a = h * 0.1;
      const lw = Math.max(1.5, t * 0.8);
      ctx.fillRect(side < 0 ? x - a : x + a - lw, cy - h / 2, lw, h);
      ctx.fillRect(side < 0 ? x - a : x, cy - h / 2, a, lw);
      ctx.fillRect(side < 0 ? x - a : x, cy + h / 2 - lw, a, lw);
      return a;
    }
    ctx.font = `300 ${h * 0.95}px ${SANS}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = side < 0 ? 'right' : 'left';
    ctx.fillText(kind === '{}' ? (side < 0 ? '{' : '}') : '', x, cy - h * 0.05);
    return ctx.measureText('{').width;
  }
  /* стрелка листания: < или > тонкой линией */
  function chevron(ctx, x, y, a, dir, lw) {
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - (dir * a) / 2, y - a);
    ctx.lineTo(x + (dir * a) / 2, y);
    ctx.lineTo(x - (dir * a) / 2, y + a);
    ctx.stroke();
  }
  /* месяц из даты подписи: сколько дней, с какой клетки недели он начинается, имя месяца */
  function monthOf(iso, fromMonday) {
    let d = iso ? new Date(iso + 'T12:00:00') : new Date();
    if (isNaN(d)) d = new Date();
    const y = d.getFullYear();
    const mo = d.getMonth();
    const first = new Date(y, mo, 1).getDay();
    return {
      y, mo, days: new Date(y, mo + 1, 0).getDate(), offset: fromMonday ? (first + 6) % 7 : first,
      name: new Date(y, mo, 1).toLocaleDateString('en-GB', { month: 'long' }),
    };
  }
  /* короткие имена дней недели; 1 января 2023 года было воскресенье */
  function weekNames(fromMonday) {
    const names = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i, 12).toLocaleDateString('en-GB', { weekday: 'short' }));
    return fromMonday ? [...names.slice(1), names[0]] : names;
  }

  COLLAGES.push(
    {
      /* снимки по клеткам вразброс, у каждого номер, вокруг квадратики; крупная надпись уходит за правый край
         и выходит из левого. «Перемешать» переставляет снимки, номера и квадратики. */
      id: 'scatterGrid', name: 'Россыпь кадров', noNote: true, shuffle: true, sample: 'June so faaaaaar',
      palette: [{ key: 'accent', name: 'Надпись и квадратики', def: '#0b1fae' }],
      choices: [
        { key: 'count', name: 'Снимков', def: '9', options: [['6', '6'], ['9', '9'], ['13', '13']] },
        { key: 'order', name: 'Раскладка', def: 'loose', options: [['loose', 'Вразброс'], ['grid', 'Ровной сеткой']] },
        { key: 'squares', name: 'Квадратики', def: 'on', options: [['on', 'Есть'], ['off', 'Нет']] },
        { key: 'nums', name: 'Номера', def: '()', options: [['()', '( 1 )'], ['[]', '[ 1 ]'], ['none', 'Без номеров']] },
      ],
      layout(W, H, env) {
        const m = Math.min(W, H);
        const n = Number(env.pick('count', '9'));
        const rng = env.rng;
        const color = env.pick('accent', '#0b1fae');
        const loose = env.pick('order', 'loose') === 'loose';
        const nums = env.pick('nums', '()');
        const words = (env.text || this.sample).split(/\s+/).filter(Boolean);
        const items = [];
        const busy = [];
        const say = (s, x, y, size, align = 'left', weight = 800) => items.push({ kind: 'text', s, x, y, size, weight, css: SANS, color, align });
        const numText = (k) => (nums === 'none' ? '' : nums === '[]' ? `[ ${k} ]` : `( ${k} )`);
        let rects;
        let s;
        if (loose) {
          /* надпись: первое слово, ниже остальные; что не влезло справа, продолжается слева ниже */
          const big = m * 0.135;
          const font = `800 ${big}px ${SANS}`;
          const lines = [words[0], words.slice(1).join(' ')].filter(Boolean);
          const x = W * 0.63;
          lines.forEach((ln, k) => {
            const y = H * 0.16 + k * big * 0.8;
            const w = measure(ln, font);
            say(ln, x, y, big);
            busy.push({ x, y: y - big * 0.5, w: Math.min(w, W - x), h: big });
            if (x + w > W) {
              const yw = H * 0.36 + k * big * 0.8;
              say(ln, x - W, yw, big);
              busy.push({ x: 0, y: yw - big * 0.5, w: x + w - W, h: big });
            }
          });
          s = Math.min(W * 0.145, H * 0.17);
          const stride = s * 1.06;
          const rowStride = s * 1.3;
          const cols = Math.max(3, Math.min(8, Math.floor((W * 0.86 - s) / stride) + 1));
          const rows = Math.max(2, Math.floor((H * 0.84 - H * 0.12 - s) / rowStride) + 1);
          const all = [];
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) all.push({ r, c, x: W * 0.07 + c * stride, y: H * 0.12 + r * rowStride, w: s, h: s });
          const free = shuffled(all.filter((p) => busy.every((b) => !hits(p, b, s * 0.12))), rng);
          const rest = shuffled(all.filter((p) => !free.includes(p)), rng);
          rects = [...free, ...rest].slice(0, n).sort((a, b) => a.r - b.r || a.c - b.c);
          /* номер у левого края снимка, сверху или снизу: у соседей по ряду они не сталкиваются */
          /* если под снимком сосед, номер сверху, если сверху сосед, снизу */
          const has = (r, c) => rects.some((o) => o.r === r && o.c === c);
          rects.forEach((p) => {
            const up = has(p.r - 1, p.c);
            const down = has(p.r + 1, p.c);
            p.at = down ? 'tl' : up ? 'bl' : rng() < 0.5 ? 'tl' : 'bl';
          });
        } else {
          /* ровная сетка, номера под снимками, надпись сверху */
          say(words.join(' '), W * 0.06, H * 0.09, m * 0.08);
          const cols = n === 13 ? 4 : 3;
          const rows = Math.ceil(n / cols);
          const gap = W * 0.025;
          const lab = m * 0.06;
          const area = { x: W * 0.06, y: H * 0.16, w: W * 0.88, h: H * 0.73 };
          const cw = (area.w - gap * (cols - 1)) / cols;
          const ch = Math.min(cw, (area.h - rows * lab) / rows);
          s = cw;
          rects = Array.from({ length: n }, (_, k) => ({
            x: area.x + (k % cols) * (cw + gap), y: area.y + Math.floor(k / cols) * (ch + lab), w: cw, h: ch, at: 'b',
          }));
        }
        const cells = rects.map((p, k) => ({ x: p.x, y: p.y, w: p.w, h: p.h, rot: 0, num: numText(k + 1), at: p.at }));
        /* квадратики садятся на углы клеток: часть ложится на снимки, часть на бумагу */
        const squares = [];
        if (env.pick('squares', 'on') === 'on') {
          const q = Math.min(s * 0.2, m * 0.032);
          for (let k = 0, tries = 0; k < 3 + Math.round(n * 0.35) && tries < 200; tries++) {
            const base = rects[Math.floor(rng() * rects.length)];
            const sq = {
              x: base.x + (rng() < 0.5 ? -q * 0.5 : base.w - q * 0.5) + (rng() < 0.4 ? (rng() < 0.5 ? -1 : 1) * base.w * 1.5 : 0),
              y: base.y + (rng() < 0.5 ? -q * 0.6 : base.h - q * 0.4), s: q,
            };
            const box = { x: sq.x, y: sq.y, w: q, h: q };
            if (sq.x < 0 || sq.x + q > W || busy.some((b) => hits(box, b)) || squares.some((o) => hits(box, { x: o.x, y: o.y, w: o.s, h: o.s }, q))) continue;
            squares.push(sq);
            k++;
          }
        }
        /* внизу место из подписи и месяц */
        const M = monthOf(env.date, true);
        if (env.place) say(env.place, W * 0.07, H * 0.94, m * 0.032, 'left', 500);
        say(`${M.name} ${M.y}`, W * 0.93, H * 0.94, m * 0.032, 'right', 500);
        return { cells, items, squares };
      },
      overlay(ctx, geo, u, opt) {
        const color = opt.c('accent', '#0b1fae');
        ctx.fillStyle = color;
        geo.squares.forEach((q) => ctx.fillRect(q.x, q.y, q.s, q.s));
        ctx.textBaseline = 'middle';
        geo.cells.forEach((c) => {
          if (!c.num) return;
          const size = Math.max(11 * u, Math.min(c.w, c.h) * 0.12);
          ctx.font = `400 ${size}px ${SANS}`;
          const below = c.at === 'b' || c.at === 'bl' || c.at === 'br';
          const y = below ? c.y + c.h + size * 0.95 : c.y - size * 0.95;
          ctx.textAlign = c.at === 'b' ? 'center' : c.at === 'tl' || c.at === 'bl' ? 'left' : 'right';
          const x = c.at === 'b' ? c.x + c.w / 2 : ctx.textAlign === 'left' ? c.x : c.x + c.w;
          ctx.fillText(c.num, x, y);
        });
      },
    },
    {
      /* маленькое фото в больших скобках, по бокам два слова, сверху и снизу значки; большое фото сверху или снизу */
      id: 'bracketed', name: 'Фото в скобках', noNote: true, sample: 'month favs',
      palette: [
        { key: 'text', name: 'Скобки и слова' },
        { key: 'marks', name: 'Значки' },
      ],
      choices: [
        { key: 'photo', name: 'Большое фото', def: 'top', options: [['top', 'Сверху'], ['bottom', 'Снизу'], ['none', 'Нет']] },
        { key: 'brace', name: 'Скобки', def: '()', options: [['()', '( )'], ['[]', '[ ]'], ['{}', '{ }'], ['none', 'Без скобок']] },
        { key: 'mark', name: 'Значки', def: 'star', options: [['star', 'Звёзды'], ['heart', 'Сердца'], ['spark', 'Искры'], ['none', 'Нет']] },
      ],
      layout(W, H, env) {
        const where = env.pick('photo', 'top');
        const zone = where === 'top' ? { y: H * 0.53, h: H * 0.47 } : where === 'bottom' ? { y: 0, h: H * 0.47 } : { y: 0, h: H };
        const ph = Math.min(zone.h * (where === 'none' ? 0.4 : 0.5), W * 0.4);
        const pw = ph * 0.76;
        /* главный снимок в скобках, большое фото идёт вторым */
        const focus = { x: W / 2 - pw / 2, y: zone.y + zone.h / 2 - ph / 2, w: pw, h: ph, rot: 0, slot: 0 };
        const cells = where === 'none' ? [focus] : [{ x: 0, y: where === 'top' ? 0 : H * 0.53, w: W, h: H * 0.47, rot: 0, slot: 1 }, focus];
        return { cells, focus, words: (env.text || this.sample).split(/\s+/).filter(Boolean) };
      },
      overlay(ctx, geo, u, opt) {
        const f = geo.focus;
        const ink = opt.c('text', opt.ink);
        const brace = opt.c('brace', '()');
        const cy = f.y + f.h / 2;
        const gap = f.w * 0.12;
        ctx.fillStyle = ink;
        ctx.textBaseline = 'middle';
        let reach = gap * 1.5;
        if (brace !== 'none') {
          const bw = bracket(ctx, brace, f.x - gap, cy, f.h * 1.15, -1, u);
          bracket(ctx, brace, f.x + f.w + gap, cy, f.h * 1.15, 1, u);
          reach = gap * 2.2 + bw;
        }
        const list = geo.words;
        const half = Math.ceil(list.length / 2);
        const left = list.slice(0, half).join(' ');
        const right = list.slice(half).join(' ');
        let size = Math.min(geo.W, geo.H) * 0.036;
        const room = f.x - reach - geo.W * 0.04;
        const widest = Math.max(measure(left, `400 ${size}px ${opt.font}`), measure(right, `400 ${size}px ${opt.font}`));
        if (widest > room && room > 0) size *= room / widest;
        ctx.font = `400 ${size}px ${opt.font}`;
        ctx.textAlign = 'right';
        ctx.fillText(left, f.x - reach, cy);
        ctx.textAlign = 'left';
        ctx.fillText(right, f.x + f.w + reach, cy);
        const kind = opt.c('mark', 'star');
        if (kind !== 'none') {
          ctx.fillStyle = opt.c('marks', ink);
          const r = f.w * 0.11;
          mark(ctx, kind, f.x + f.w / 2, f.y - f.h * 0.2, r);
          mark(ctx, kind, f.x + f.w / 2, f.y + f.h * 1.2, r);
        }
      },
    },
    {
      /* календарь месяца из даты в «Подписи»: снимки встают в дни. Вид сеткой, кружками или шахматкой.
         Если снимков меньше, чем дней, «Перемешать» выбирает другие дни. */
      id: 'calendar', name: 'Календарь', noNote: true, shuffle: true,
      palette: [
        { key: 'lines', name: 'Линии и числа' },
        { key: 'squares', name: 'Клетки и звёзды', def: '#8e2a20' },
      ],
      choices: [
        { key: 'style', name: 'Вид', def: 'grid', options: [['grid', 'Сетка'], ['circles', 'Кружки'], ['chess', 'Шахматка']] },
        { key: 'count', name: 'Снимков', def: '12', options: [['7', '7'], ['12', '12'], ['all', 'Каждый день']] },
        { key: 'bg', name: 'Фото-фон', def: 'auto', options: [['auto', 'Как в виде'], ['full', 'На весь лист'], ['top', 'Сверху'], ['none', 'Нет']] },
        { key: 'week', name: 'Неделя с', def: 'mon', options: [['mon', 'Понедельника'], ['sun', 'Воскресенья']] },
      ],
      layout(W, H, env) {
        const style = env.pick('style', 'grid');
        const fromMon = env.pick('week', 'mon') === 'mon';
        const M = monthOf(env.date, fromMon);
        let bg = env.pick('bg', 'auto');
        if (bg === 'auto') bg = { grid: 'full', circles: 'top', chess: 'none' }[style];
        const rows = Math.ceil((M.offset + M.days) / 7);
        const top = bg === 'top' ? H * 0.42 : 0;
        const region = bg === 'top' ? { y: top + H * 0.05, h: H - top - H * 0.08 } : { y: H * 0.06, h: H * 0.88 };
        /* сверху место под заголовок и дни недели, в клетках календаря */
        const headK = style === 'circles' && bg === 'top' ? 0.7 : 1.6;
        const maxW = { grid: W * 0.7, circles: W * 0.84, chess: W * 0.96 }[style];
        const cs = Math.min(maxW / 7, region.h / (rows + headK));
        const gx = (W - cs * 7) / 2;
        const gy = region.y + (region.h - cs * (rows + headK)) / 2 + cs * headK;
        const want = env.pick('count', '12');
        const n = want === 'all' ? M.days : Math.min(M.days, Number(want));
        const days = shuffled(Array.from({ length: M.days }, (_, i) => i + 1), env.rng).slice(0, n).sort((a, b) => a - b);
        const cells = [];
        if (bg !== 'none') cells.push({ x: 0, y: 0, w: W, h: bg === 'top' ? top : H, rot: 0 });
        days.forEach((d) => {
          const k = M.offset + d - 1;
          const x = gx + (k % 7) * cs;
          const y = gy + Math.floor(k / 7) * cs;
          const i = style === 'circles' ? cs * 0.08 : style === 'grid' ? Math.max(1, cs * 0.012) : 0;
          cells.push({ x: x + i, y: y + i, w: cs - i * 2, h: cs - i * 2, rot: 0, shape: style === 'circles' ? 'round' : undefined });
        });
        const title = env.text || (style === 'chess' ? 'core memories.' : `${M.name.toLowerCase()} dump`);
        return { cells, cal: { style, bg, top, rows, cs, gx, gy, M, photo: new Set(days), title, fromMon } };
      },
      overlay(ctx, geo, u, opt) {
        const { style, bg, top, rows, cs, gx, gy, M, photo, title, fromMon } = geo.cal;
        const line = opt.c('lines', bg === 'full' ? '#ffffff' : opt.ink);
        const accent = opt.c('squares', '#8e2a20');
        const at = (d) => {
          const k = M.offset + d - 1;
          return [gx + (k % 7) * cs, gy + Math.floor(k / 7) * cs, Math.floor(k / 7), k % 7];
        };
        const names = weekNames(fromMon);
        const lift = (on) => {
          ctx.shadowColor = on ? 'rgba(0,0,0,.45)' : 'transparent';
          ctx.shadowBlur = on ? 5 * u : 0;
        };
        ctx.textBaseline = 'middle';
        if (style === 'grid') {
          ctx.strokeStyle = line;
          ctx.lineWidth = Math.max(1, 1.6 * u);
          ctx.beginPath();
          for (let r = 0; r <= rows; r++) { ctx.moveTo(gx, gy + r * cs); ctx.lineTo(gx + 7 * cs, gy + r * cs); }
          for (let c = 0; c <= 7; c++) { ctx.moveTo(gx + c * cs, gy); ctx.lineTo(gx + c * cs, gy + rows * cs); }
          ctx.stroke();
          ctx.fillStyle = line;
          ctx.textAlign = 'left';
          ctx.font = `400 ${cs * 0.17}px ${SANS}`;
          for (let d = 1; d <= M.days; d++) {
            const [x, y] = at(d);
            lift(photo.has(d));
            ctx.fillText(String(d), x + cs * 0.1, y + cs * 0.17);
          }
          lift(false);
          ctx.textAlign = 'center';
          ctx.font = `400 ${cs * 0.2}px ${SANS}`;
          names.forEach((nm, i) => ctx.fillText(nm.toLowerCase(), gx + (i + 0.5) * cs, gy - cs * 0.4));
          ctx.font = `400 ${cs * 0.42}px ${opt.font}`;
          ctx.fillText(title, gx + 3.5 * cs, gy - cs * 1.1);
        } else if (style === 'circles') {
          if (bg === 'top') spiralBind(ctx, 0, geo.W, top, geo.W * 0.075);
          ctx.fillStyle = line;
          ctx.textAlign = 'center';
          ctx.font = `500 ${cs * 0.24}px ${SANS}`;
          names.forEach((nm, i) => ctx.fillText(nm, gx + (i + 0.5) * cs, gy - cs * 0.35));
          ctx.font = `400 ${cs * 0.26}px ${SANS}`;
          for (let d = 1; d <= M.days; d++) {
            if (photo.has(d)) continue;
            const [x, y] = at(d);
            ctx.globalAlpha = 0.1;
            ctx.beginPath();
            ctx.arc(x + cs / 2, y + cs / 2, cs * 0.42, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillText(String(d), x + cs / 2, y + cs / 2);
          }
          if (bg === 'top') {
            ctx.fillStyle = '#ffffff';
            lift(true);
            ctx.textAlign = 'left';
            ctx.font = `400 ${geo.W * 0.065}px ${opt.font}`;
            ctx.fillText(title, geo.W * 0.06, top * 0.78);
            lift(false);
          } else {
            ctx.font = `400 ${cs * 0.34}px ${opt.font}`;
            ctx.fillText(title, gx + 3.5 * cs, gy - cs * 1.1);
          }
        } else {
          /* шахматка: пустые дни через один залиты цветом, числа на светлых клетках */
          for (let d = 1; d <= M.days; d++) {
            const [x, y, r, c] = at(d);
            if (photo.has(d)) {
              ctx.fillStyle = '#ffffff';
              lift(true);
              ctx.textAlign = 'left';
              ctx.font = `500 ${cs * 0.2}px ${SANS}`;
              ctx.fillText(String(d), x + cs * 0.08, y + cs * 0.84);
              lift(false);
              continue;
            }
            const dark = (r + c) % 2 === 1;
            ctx.fillStyle = dark ? accent : 'rgba(255,255,255,.45)';
            ctx.fillRect(x, y, cs, cs);
            if (dark) continue;
            ctx.fillStyle = line;
            ctx.textAlign = 'left';
            ctx.font = `400 ${cs * 0.32}px ${SANS}`;
            ctx.fillText(String(d), x + cs * 0.08, y + cs * 0.78);
          }
          ctx.fillStyle = accent;
          ctx.beginPath();
          /* звёзды в пустых клетках до первого и после последнего дня, а если их мало, за сеткой */
          const tail = rows * 7 - M.offset - M.days;
          if (M.offset >= 2) starPath(ctx, gx + (M.offset / 2) * cs, gy + cs * 0.5, cs * Math.min(1, M.offset * 0.42), 0.15);
          else starPath(ctx, gx + cs * 6.4, gy - cs * 0.45, cs * 0.9, 0.15);
          if (tail >= 2) starPath(ctx, gx + (7 - tail / 2) * cs, gy + (rows - 0.5) * cs, cs * Math.min(1, tail * 0.42), -0.2);
          else starPath(ctx, gx + cs * 0.4, gy + rows * cs + cs * 0.75, cs * 0.9, -0.2);
          ctx.fill();
          /* подпись в овале слева сверху */
          let size = cs * 0.22;
          const maxW = cs * 4.2;
          const w = measure(title, `400 ${size}px ${opt.font}`);
          if (w > maxW) size *= maxW / w;
          ctx.font = `400 ${size}px ${opt.font}`;
          const tw = ctx.measureText(title).width;
          const ox = gx + tw / 2 + cs * 0.35;
          const oy = gy - cs * 0.75;
          ctx.strokeStyle = accent;
          ctx.lineWidth = Math.max(1, 1.8 * u);
          ctx.beginPath();
          ctx.ellipse(ox, oy, tw / 2 + cs * 0.25, size * 1.1, 0, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = accent;
          ctx.textAlign = 'center';
          ctx.fillText(title, ox, oy);
        }
      },
    },
    {
      /* окно «выберите все картинки с …» поверх фото. Клетки режут один снимок, у каждой свой или пустые,
         выбранные клетки сжимаются и получают галочку. Слово в шапке берётся из подписи. */
      id: 'captcha', name: 'Капча', noNote: true, shuffle: true, sample: 'me',
      palette: [{ key: 'blue', name: 'Шапка и кнопка', def: '#4a86e8' }],
      choices: [
        { key: 'grid', name: 'Клеток', def: '3', options: [['3', '3 × 3'], ['4', '4 × 4']] },
        { key: 'tiles', name: 'В клетках', def: 'one', options: [['one', 'Одно фото'], ['many', 'Разные фото'], ['black', 'Пусто']] },
        { key: 'bg', name: 'Фон', def: 'same', options: [['same', 'То же фото'], ['other', 'Другое фото'], ['paper', 'Бумага']] },
        { key: 'checks', name: 'Галочки', def: 'off', options: [['off', 'Нет'], ['on', 'Есть']] },
        { key: 'button', name: 'Кнопка', def: 'VERIFY', options: [['VERIFY', 'Verify'], ['SKIP', 'Skip']] },
      ],
      layout(W, H, env) {
        const n = Number(env.pick('grid', '3'));
        const tiles = env.pick('tiles', 'one');
        let bg = env.pick('bg', 'same');
        if (tiles === 'black' && bg === 'other') bg = 'same';
        const button = env.pick('button', 'VERIFY');
        /* окно: поля, синяя шапка, квадрат клеток, низ с кнопкой */
        const k = 1 + 0.025 * 3 + 0.3 + 0.19 - 0.05;
        const pw = Math.min(W * 0.78, (H * 0.9) / k);
        const pad = pw * 0.025;
        const head = pw * 0.3;
        const foot = pw * 0.19;
        const gs = pw - pad * 2;
        const ph = pad * 2 + head + gs + foot;
        const px = (W - pw) / 2;
        const py = (H - ph) / 2;
        const grid = { x: px + pad, y: py + pad * 2 + head, w: gs, h: gs };
        const gap = pw * 0.009;
        const ts = (gs - gap * (n - 1)) / n;
        const picked = env.pick('checks', 'off') === 'on' ? new Set(shuffled([...Array(n * n).keys()], env.rng).slice(0, Math.max(2, Math.round((n * n) / 3)))) : new Set();
        const rects = [];
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            const on = picked.has(r * n + c);
            const i = on ? ts * 0.1 : 0;
            rects.push({ x: grid.x + c * (ts + gap) + i, y: grid.y + r * (ts + gap) + i, w: ts - i * 2, h: ts - i * 2, on });
          }
        }
        const full = { x: 0, y: 0, w: W, h: H, rot: 0 };
        const cells = [];
        let pieces = [];
        let underAt;
        if (tiles === 'many') {
          if (bg === 'same') cells.push({ ...full, slot: 0 });
          if (bg === 'other') cells.push({ ...full, slot: n * n });
          underAt = cells.length;
          rects.forEach((t, i) => cells.push({ x: t.x, y: t.y, w: t.w, h: t.h, rot: 0, slot: i }));
        } else if (bg === 'same') {
          /* клетки показывают тот же снимок чуть крупнее, чем фон под окном */
          cells.push({ ...full, slot: 0, source: true });
          underAt = 1;
          const zoom = 1.25;
          const cx = grid.x + grid.w / 2;
          const cy = grid.y + grid.h / 2;
          if (tiles === 'one') pieces = rects.map((t) => ({ ...t, from: { x: cx + (t.x - cx) / zoom, y: cy + (t.y - cy) / zoom, w: t.w / zoom, h: t.h / zoom } }));
        } else {
          /* снимок целиком в квадрате клеток; сама ячейка не видна, её кусочки ложатся в клетки */
          if (bg === 'other') cells.push({ ...full, slot: 1 });
          underAt = cells.length;
          cells.push({ ...grid, rot: 0, slot: 0, hidden: true, source: true });
          if (tiles === 'one') pieces = rects.map((t) => ({ ...t, from: { x: t.x - grid.x, y: t.y - grid.y, w: t.w, h: t.h } }));
        }
        const word = env.text || this.sample;
        const lines = [n === 4 ? 'Select all squares with' : 'Select all images with', word, button === 'SKIP' ? 'If there are none, click skip' : 'Click verify once there are none left.'];
        const under = (ctx, u, opt) => {
          const blue = opt.c('blue', '#4a86e8');
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,.25)';
          ctx.shadowBlur = 16 * u;
          ctx.shadowOffsetY = 4 * u;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px, py, pw, ph);
          ctx.restore();
          ctx.strokeStyle = '#d3d3d3';
          ctx.lineWidth = Math.max(1, 1.5 * u);
          ctx.strokeRect(px, py, pw, ph);
          ctx.fillStyle = blue;
          ctx.fillRect(px + pad, py + pad, pw - pad * 2, head);
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const tx = px + pad + pw * 0.06;
          const room = pw - pad * 2 - pw * 0.12;
          ctx.font = `400 ${pw * 0.04}px ${SANS}`;
          ctx.fillText(lines[0], tx, py + pad + head * 0.24);
          let big = pw * 0.085;
          const ww = measure(lines[1], `700 ${big}px ${SANS}`);
          if (ww > room) big *= room / ww;
          ctx.font = `700 ${big}px ${SANS}`;
          ctx.fillText(lines[1], tx, py + pad + head * 0.53);
          ctx.font = `400 ${pw * 0.036}px ${SANS}`;
          ctx.fillText(lines[2], tx, py + pad + head * 0.8);
          /* низ: черта, три значка и кнопка */
          const fy = grid.y + grid.h + pad;
          ctx.fillStyle = '#e2e2e2';
          ctx.fillRect(px, fy, pw, Math.max(1, 1.5 * u));
          const iy = fy + (foot - pad) / 2;
          const ir = foot * 0.16;
          ctx.strokeStyle = '#555555';
          ctx.fillStyle = '#555555';
          ctx.lineWidth = Math.max(1.5, ir * 0.22);
          ctx.lineCap = 'round';
          let ix = px + pad + pw * 0.06;
          ctx.beginPath();
          ctx.arc(ix, iy, ir, -Math.PI * 0.35, Math.PI * 1.45);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ix + ir * 0.95, iy - ir * 1.05);
          ctx.lineTo(ix + ir * 0.5, iy - ir * 0.3);
          ctx.lineTo(ix + ir * 1.25, iy - ir * 0.2);
          ctx.closePath();
          ctx.fill();
          ix += pw * 0.13;
          ctx.beginPath();
          ctx.arc(ix, iy + ir * 0.15, ir, Math.PI, 0);
          ctx.stroke();
          ctx.fillRect(ix - ir * 1.15, iy, ir * 0.55, ir * 0.95);
          ctx.fillRect(ix + ir * 0.6, iy, ir * 0.55, ir * 0.95);
          ix += pw * 0.13;
          ctx.beginPath();
          ctx.arc(ix, iy, ir, 0, TAU);
          ctx.stroke();
          ctx.fillRect(ix - ir * 0.1, iy - ir * 0.15, ir * 0.2, ir * 0.65);
          ctx.beginPath();
          ctx.arc(ix, iy - ir * 0.45, ir * 0.13, 0, TAU);
          ctx.fill();
          const bw = pw * 0.3;
          const bh = foot * 0.55;
          ctx.fillStyle = blue;
          ctx.fillRect(px + pw - pad * 2 - bw, iy - bh / 2, bw, bh);
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.font = `600 ${bh * 0.36}px ${SANS}`;
          ctx.fillText(button, px + pw - pad * 2 - bw / 2, iy);
        };
        return { cells, pieces, under, underAt, cap: { rects, black: tiles === 'black' } };
      },
      overlay(ctx, geo, u, opt) {
        const { rects, black } = geo.cap;
        if (black) {
          ctx.fillStyle = '#000000';
          rects.forEach((t) => ctx.fillRect(t.x, t.y, t.w, t.h));
        }
        const blue = opt.c('blue', '#4a86e8');
        rects.filter((t) => t.on).forEach((t) => {
          const r = Math.max(t.w, t.h) * 0.14;
          const x = t.x + r * 0.35;
          const y = t.y + r * 0.35;
          ctx.fillStyle = blue;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(1.5, r * 0.14);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.lineWidth = Math.max(1.5, r * 0.2);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(x - r * 0.45, y);
          ctx.lineTo(x - r * 0.1, y + r * 0.35);
          ctx.lineTo(x + r * 0.5, y - r * 0.3);
          ctx.stroke();
        });
      },
    },
    {
      /* слова рассыпаны по бумаге, но читаются сверху вниз; рядом большое фото, среди слов может лежать ещё одно.
         Число со скобкой в начале, как «8)», встаёт к левому краю. */
      id: 'scatterWords', name: 'Слова вразброс', noNote: true, shuffle: true, sample: '8) free oolong-tea with cream i got from a sustainability campaign',
      palette: [{ key: 'text', name: 'Слова', def: '#7d7458' }],
      choices: [
        { key: 'side', name: 'Большое фото', def: 'bottom', options: [['bottom', 'Снизу'], ['top', 'Сверху'], ['none', 'Нет']] },
        { key: 'mid', name: 'Фото среди слов', def: 'off', options: [['off', 'Нет'], ['on', 'Есть']] },
        { key: 'size', name: 'Слова', def: 'm', options: [['s', 'Мелкие'], ['m', 'Средние'], ['l', 'Крупные']] },
      ],
      layout(W, H, env) {
        const m = Math.min(W, H);
        const side = env.pick('side', 'bottom');
        const mid = env.pick('mid', 'off') === 'on' || side === 'none';
        const cells = [];
        let region = { x: W * 0.08, y: H * 0.07, w: W * 0.84, h: H * 0.86 };
        if (side !== 'none') {
          const ph = H * 0.45;
          cells.push({ x: 0, y: side === 'top' ? 0 : H - ph, w: W, h: ph, rot: 0 });
          region = { x: W * 0.08, y: side === 'top' ? ph + H * 0.06 : H * 0.07, w: W * 0.84, h: H - ph - H * 0.13 };
        }
        let hole = null;
        if (mid) {
          const hh = region.h * 0.62;
          const hw = Math.min(region.w * 0.4, hh * 0.9);
          hole = { x: W / 2 - hw / 2, y: region.y + (region.h - hh) / 2, w: hw, h: hh };
          cells.push({ ...hole, rot: 0 });
        }
        const size = m * { s: 0.03, m: 0.038, l: 0.05 }[env.pick('size', 'm')];
        const css = env.font.css;
        const weight = env.font.weight || 400;
        const color = env.pick('text', '#7d7458');
        const font = `${weight} ${size}px ${css}`;
        const list = (env.text || this.sample).split(/\s+/).filter(Boolean);
        const rng = env.rng;
        /* слова идут строками сверху вниз; если строк не хватает, в строке несколько слов, каждое в своей доле ширины */
        const rowH = size * 1.9;
        const fit = Math.max(1, Math.floor(region.h / rowH));
        const perRow = Math.ceil(list.length / fit);
        const used = Math.ceil(list.length / perRow);
        const gapX = size * 0.6;
        const items = list.map((wd, i) => {
          const r = Math.floor(i / perRow);
          const k = i % perRow;
          const y = region.y + (region.h * (r + 0.5)) / used + (rng() - 0.5) * rowH * 0.3;
          const ww = measure(wd, font);
          let lo = region.x + (region.w * k) / perRow;
          let hi = region.x + (region.w * (k + 1)) / perRow;
          if (hole && y > hole.y - size && y < hole.y + hole.h + size) {
            const spans = [[lo, Math.min(hi, hole.x - gapX)], [Math.max(lo, hole.x + hole.w + gapX), hi]].filter(([a, b]) => b - a >= ww);
            [lo, hi] = spans.length ? spans[Math.floor(rng() * spans.length)] : rng() < 0.5 ? [region.x, hole.x - gapX] : [hole.x + hole.w + gapX, region.x + region.w];
          }
          const x = i === 0 && /^\d+[).]$/.test(wd) ? region.x : lo + rng() * Math.max(0, hi - lo - ww);
          return { kind: 'text', s: wd, x, y, size, weight, css, color };
        });
        return { cells, items };
      },
    },
    {
      /* как пост-карусель: большое фото со стрелками и миниатюры с номерами, или стопка снимков со словами по углам */
      id: 'slider', name: 'Листалка', noNote: true, shuffle: true, sample: 'the picture i capture',
      palette: [{ key: 'text', name: 'Стрелки и подписи' }],
      choices: [
        { key: 'view', name: 'Вид', def: 'thumbs', options: [['thumbs', 'Миниатюры'], ['stack', 'Стопка']] },
        { key: 'count', name: 'Снимков', def: '6', options: [['3', '3'], ['6', '6']] },
        { key: 'arrows', name: 'Стрелки', def: 'on', options: [['on', 'Есть'], ['off', 'Нет']] },
      ],
      layout(W, H, env) {
        const n = Number(env.pick('count', '6'));
        const rng = env.rng;
        const m = Math.min(W, H);
        const cells = [];
        const labels = [];
        let arrowY;
        let arrowX;
        if (env.pick('view', 'thumbs') === 'stack') {
          /* нижние снимки повёрнуты сильнее, верхний первый снимок почти ровно */
          const w = Math.min(W * 0.56, H * 0.5);
          const h = w * 1.25;
          for (let k = n - 1; k >= 0; k--) {
            const t = k ? 1 : 0.15;
            cells.push({ x: W / 2 - w / 2 + (rng() - 0.5) * w * 0.08 * t, y: H / 2 - h / 2 + (rng() - 0.5) * h * 0.05 * t, w, h, rot: (rng() - 0.5) * 0.22 * t, slot: k, frame: 'white' });
          }
          const list = (env.text || this.sample).split(/\s+/).filter(Boolean);
          const per = Math.ceil(list.length / 4);
          const spots = [[-0.32, -0.64], [0.32, -0.64], [-0.32, 0.64], [0.32, 0.64]];
          spots.forEach(([dx, dy], i) => {
            const s = list.slice(i * per, (i + 1) * per).join(' ');
            if (s) labels.push({ s, x: W / 2 + dx * w, y: H / 2 + dy * h, size: m * 0.05, align: 'center' });
          });
          arrowY = H / 2;
          arrowX = Math.max(W * 0.07, (W / 2 - w / 2) / 2);
        } else {
          /* миниатюры по столбцам в верхней половине, первая повторяет большое фото */
          const rows = n === 6 ? 2 : 1;
          const tw = W * 0.24;
          const band = { y: H * 0.07, h: H * 0.4 };
          const aspects = shuffled([1.35, 1.05, 0.8, 1.25, 0.9, 1.0], rng);
          for (let k = 0; k < n; k++) {
            const c = rows === 2 ? Math.floor(k / 2) : k;
            const r = rows === 2 ? k % 2 : 0;
            /* не выше своей доли полосы: подписям остаётся место */
            const room = (band.h / rows) * 0.72;
            let ww = tw * (0.85 + rng() * 0.2);
            let hh = ww / aspects[k];
            if (hh > room) { ww *= room / hh; hh = room; }
            const cx = W * (0.2 + c * 0.3) + (rng() - 0.5) * W * 0.03;
            const cy = band.y + (band.h * (r + 0.5)) / rows + (c % 2 ? 0.06 : -0.04) * (band.h / rows);
            const cell = { x: cx - ww / 2, y: cy - hh / 2, w: ww, h: hh, rot: 0, slot: k };
            cells.push(cell);
            /* верхний ряд подписан сверху, нижний снизу */
            const below = rows === 1 || r === 1;
            labels.push({ s: `(${k + 1})`, x: cx, y: below ? cell.y + hh + m * 0.04 : cell.y - m * 0.035, size: m * 0.032, align: 'center' });
          }
          const bw = Math.min(W * 0.64, H * 0.4 * 1.35);
          const bh = bw / 1.35;
          const by = H * 0.53 + (H * 0.44 - bh) / 2;
          cells.push({ x: W / 2 - bw / 2, y: by, w: bw, h: bh, rot: 0, slot: 0 });
          arrowY = by + bh / 2;
          arrowX = Math.max(W * 0.07, (W / 2 - bw / 2) / 2);
        }
        return { cells, labels, arrowX, arrowY };
      },
      overlay(ctx, geo, u, opt) {
        const col = opt.c('text', opt.ink);
        ctx.fillStyle = col;
        ctx.strokeStyle = col;
        ctx.textBaseline = 'middle';
        geo.labels.forEach((l) => {
          ctx.font = `400 ${l.size}px ${opt.font}`;
          ctx.textAlign = l.align;
          ctx.fillText(l.s, l.x, l.y);
        });
        if (opt.c('arrows', 'on') === 'on') {
          const a = Math.min(geo.W, geo.H) * 0.035;
          chevron(ctx, geo.arrowX, geo.arrowY, a, -1, Math.max(2, a * 0.14));
          chevron(ctx, geo.W - geo.arrowX, geo.arrowY, a, 1, Math.max(2, a * 0.14));
        }
      },
    },
  );

  /* Большой отпечаток и плёнка на розовой бумаге. Все координаты — в листе 1080 × 1350. */
  COLLAGES.push({
    id: 'soulFilm', name: 'Плёнка и гербарий', noNote: true, sample: 'SOUL VIBES',
    palette: [
      { key: 'bg', name: 'Фон', def: '#100907' },
      { key: 'paper', name: 'Подложка плёнки', def: '#edc4b8' },
      { key: 'frame', name: 'Рамка фото', def: '#e9e6dc' },
      { key: 'film', name: 'Фотоплёнка', def: '#080808' },
      { key: 'decor', name: 'Декор', def: '#be9296' },
      { key: 'text', name: 'Текст', def: '#f8eee8' },
    ],
    choices: [
      { key: 'count', name: 'Кадров на плёнке', def: '3', options: [['2', '2'], ['3', '3'], ['4', '4']] },
      { key: 'decorations', name: 'Гербарий и мотылёк', def: 'on', options: [['on', 'Есть'], ['off', 'Нет']] },
      { key: 'texture', name: 'Фактура бумаги', def: 'on', options: [['on', 'Есть'], ['off', 'Нет']] },
    ],
    layout(W, H, env) {
      const k = Math.min(W / 1080, H / 1350);
      const ox = (W - 1080 * k) / 2, oy = (H - 1350 * k) / 2;
      const n = Number(env.pick('count', '3'));
      const cell = (x, y, w, h) => ({ x: ox + x * k, y: oy + y * k, w: w * k, h: h * k, rot: 0 });
      const gap = 18, height = (698 - gap * (n - 1)) / n;
      const cells = [cell(140, 207, 632, 770)];
      for (let i = 0; i < n; i++) cells.push(cell(643, 465 + i * (height + gap), 220, height));
      return {
        cells, k, ox, oy, n,
        underAt: 1,
        under(ctx, u, opt) {
          ctx.save(); ctx.translate(ox, oy); ctx.scale(k, k);
          soulPaper(ctx, 543, 420, 412, 783, opt.c('paper', '#edc4b8'), opt.c('texture', 'on') === 'on');
          ctx.fillStyle = opt.c('film', '#080808'); ctx.fillRect(614, 434, 278, 757);
          ctx.fillStyle = opt.c('frame', '#e9e6dc');
          for (let y = 442; y < 1184; y += 31.5) {
            ctx.fillRect(621, y, 10, 10); ctx.fillRect(873, y, 10, 10);
          }
          ctx.restore();
        },
      };
    },
    deco(ctx, box, u, geo, opt) {
      ctx.fillStyle = opt.c('bg', '#100907'); ctx.fillRect(0, 0, geo.W, geo.H);
      ctx.save(); ctx.translate(geo.ox, geo.oy); ctx.scale(geo.k, geo.k);
      soulPaper(ctx, 124, 190, 664, 804, opt.c('frame', '#e9e6dc'), opt.c('texture', 'on') === 'on');
      ctx.restore();
    },
    overlay(ctx, geo, u, opt) {
      ctx.save(); ctx.translate(geo.ox, geo.oy); ctx.scale(geo.k, geo.k);
      const color = opt.c('decor', '#be9296');
      if (opt.c('decorations', 'on') === 'on') {
        /* Полупрозрачная ботаническая карточка. */
        ctx.fillStyle = 'rgba(247,240,214,.85)'; ctx.fillRect(225, 797, 265, 310);
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(429, 1087); ctx.bezierCurveTo(380, 1015, 442, 919, 388, 854); ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const a = i * TAU / 8;
          ctx.beginPath(); ctx.ellipse(387 + Math.cos(a) * 32, 853 + Math.sin(a) * 34, 30, 8, a, 0, TAU); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(420, 1065); ctx.bezierCurveTo(343, 1010, 369, 1084, 312, 1073); ctx.stroke();
        /* Засушенный цветок: стебель, прожилки и тонкие лепестки. */
        ctx.strokeStyle = '#858452'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(327, 1184); ctx.quadraticCurveTo(290, 1074, 207, 1016); ctx.stroke();
        for (let i = 0; i < 7; i++) {
          const x = 310 - i * 12, y = 1140 - i * 18, side = i % 2 ? -1 : 1;
          ctx.fillStyle = i % 2 ? '#686b45' : '#81805a';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + side * 69, y - 2, x + side * 52, y - 74); ctx.quadraticCurveTo(x + side * 9, y - 55, x, y); ctx.fill();
          ctx.strokeStyle = '#a7a279'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + side * 48, y - 68); ctx.stroke();
        }
        for (let i = 0; i < 12; i++) {
          const a = i * 2.4;
          ctx.save(); ctx.translate(188 + Math.cos(a) * 26, 1023 + Math.sin(a) * 20); ctx.rotate(a);
          ctx.fillStyle = i % 2 ? '#be9d8a' : '#d4b7a0'; ctx.strokeStyle = '#9f767b';
          ctx.beginPath(); ctx.ellipse(0, 0, 48, 20, 0, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-40, 0); ctx.quadraticCurveTo(0, -8, 39, 0); ctx.stroke(); ctx.restore();
        }
        /* Мотылёк с жилками, за правым верхним углом плёнки. */
        ctx.save(); ctx.translate(899, 357); ctx.rotate(-0.6);
        ctx.strokeStyle = color; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.6;
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(side * 30, -66, side * 80, -100, side * 88, -83); ctx.bezierCurveTo(side * 87, -20, side * 61, 61, 0, 0); ctx.stroke();
          for (let i = 0; i < 6; i++) {
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(side * (25 + i * 8), -25, side * (30 + i * 10), -76 + i * 12); ctx.stroke();
          }
          ctx.beginPath(); ctx.ellipse(side * 49, -29, 12, 7, side, 0, TAU); ctx.stroke();
        }
        ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, 29); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(-16, -49); ctx.moveTo(0, -25); ctx.lineTo(16, -49); ctx.stroke(); ctx.restore();
        [[83, 984, 13], [265, 951, 13], [338, 997, 12], [868, 291, 12], [952, 258, 11], [480, 1137, 11]].forEach(([x, y, r]) => doodle(ctx, 'sparkle', x, y, r, color, 2));
      }
      const words = (opt.title.trim() || this.sample).split(/\s+/);
      ctx.fillStyle = opt.c('text', '#f8eee8'); ctx.font = `400 21px ${opt.font}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(words[0], 125, 161, 640);
      ctx.textAlign = 'center'; ctx.fillText(words.slice(1).join(' '), 402, 1196, 275);
      ctx.restore();
    },
  });

  /* Повторяемое зерно не мерцает при записи видео и не требует внешних картинок. */
  function soulPaper(ctx, x, y, w, h, color, texture) {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
    if (!texture) return;
    const rng = window.Motifs.makeRng(531);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.22)' : 'rgba(67,40,29,.10)';
      ctx.fillRect(x + rng() * w, y + rng() * h, 0.7 + rng() * 2, 0.5 + rng() * 1.5);
    }
  }

  /* Собственные бумажные рамки: рисунок строится из контуров и повторяемой фактуры. */
  const keepsakeGrain = new Map();
  function keepsakePaper(ctx, W, H, color, fabric) {
    ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
    const key = fabric ? 'fabric' : 'paper';
    if (!keepsakeGrain.has(key)) {
      const c = document.createElement('canvas'); c.width = 540; c.height = 675;
      const x = c.getContext('2d'), pixels = x.createImageData(c.width, c.height);
      const rng = window.Motifs.makeRng(913);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const p = i / 4, px = p % c.width, py = Math.floor(p / c.width);
        const light = rng() > 0.48;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = light ? 255 : 45;
        pixels.data[i + 3] = Math.round(rng() * (fabric && (px % 3 === 0 || py % 3 === 0) ? 48 : 28));
      }
      x.putImageData(pixels, 0, 0);
      if (!fabric) {
        for (let i = 0; i < 18; i++) {
          const px = rng() * 540, py = rng() * 675;
          x.strokeStyle = 'rgba(65,55,40,.035)'; x.lineWidth = 1.5;
          x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 22, py - 17, px + 80, py - 42); x.stroke();
          x.strokeStyle = 'rgba(255,255,255,.13)'; x.translate(0, 1); x.stroke(); x.translate(0, -1);
        }
      }
      keepsakeGrain.set(key, c);
    }
    ctx.drawImage(keepsakeGrain.get(key), 0, 0, W, H);
  }

  function keepsakeStar(ctx, x, y, r, style, color, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); starPath(ctx, 0, 0, r, 0);
    ctx.save();
    ctx.shadowColor = 'rgba(39,32,25,.24)'; ctx.shadowBlur = r * 0.12; ctx.shadowOffsetY = r * 0.09;
    ctx.fillStyle = color; ctx.fill(); ctx.restore();
    ctx.save(); ctx.clip();
    if (style === 'foil') {
      ctx.fillStyle = color; ctx.fillRect(-r, -r, r * 2, r * 2);
      /* Мягкие грани тиснения: свет падает сверху слева, без белой каймы. */
      const shades = ['rgba(255,255,255,.46)', 'rgba(30,25,24,.24)', 'rgba(255,255,255,.22)', 'rgba(30,25,24,.32)', 'rgba(255,255,255,.12)', 'rgba(30,25,24,.18)', 'rgba(255,255,255,.32)', 'rgba(30,25,24,.10)', 'rgba(255,255,255,.52)', 'rgba(30,25,24,.17)'];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, b = a + Math.PI / 5;
        const ra = i % 2 ? r * 0.45 : r, rb = i % 2 ? r : r * 0.45;
        ctx.beginPath(); ctx.moveTo(-r * 0.06, r * 0.04);
        ctx.lineTo(Math.cos(a) * ra, Math.sin(a) * ra); ctx.lineTo(Math.cos(b) * rb, Math.sin(b) * rb); ctx.closePath();
        ctx.fillStyle = shades[i]; ctx.fill();
      }
      const rng = window.Motifs.makeRng(Math.round(r * 313));
      for (let i = 0; i < 420; i++) {
        ctx.fillStyle = i % 3 ? 'rgba(28,26,23,.13)' : 'rgba(255,255,255,.4)';
        ctx.fillRect((rng() * 2 - 1) * r, (rng() * 2 - 1) * r, 0.25 + rng() * 0.6, 0.25 + rng() * 0.4);
      }
    } else {
      ctx.fillStyle = color; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 1;
      for (let k = -r; k <= r; k += r * 0.28) {
        ctx.beginPath(); ctx.moveTo(k, -r); ctx.lineTo(k, r); ctx.moveTo(-r, k); ctx.lineTo(r, k); ctx.stroke();
      }
    }
    ctx.restore();
    ctx.beginPath(); starPath(ctx, 0, 0, r, 0);
    ctx.strokeStyle = style === 'foil' ? 'rgba(53,45,36,.24)' : 'rgba(255,255,255,.8)'; ctx.lineWidth = r * 0.025; ctx.stroke();
    ctx.restore();
  }

  for (const pair of [false, true]) COLLAGES.push({
    id: pair ? 'heirloomPair' : 'heirloomOval', name: pair ? 'Овал и завитки' : 'Бумажный медальон', noNote: true,
    palette: [
      { key: 'paper', name: 'Бумага' },
      ...(pair ? [{ key: 'ornament', name: 'Завитки', def: '#fae1ef' }] : []),
      { key: 'stars', name: 'Звёзды' },
    ],
    choices: [
      { key: 'tone', name: 'Палитра бумаги', def: pair ? 'rose' : 'sage', options: [['sage', 'Шалфей'], ['blue', 'Небесная'], ['rose', 'Розовая'], ['lilac', 'Сиреневая']] },
      { key: 'decor', name: 'Украшения', def: pair ? 'check' : 'foil', options: [['none', 'Без украшений'], ['foil', 'Фольга'], ['silver', 'Серебряная фольга'], ['check', 'Звёзды в клетку'], ['spark', 'Блики и бант']] },
      { key: 'surface', name: 'Фактура', def: 'paper', options: [['paper', 'Бумага'], ['fabric', 'Ткань']] },
    ],
    layout(W, H, env) {
      const k = Math.min(W / 540, H / 675), ox = (W - 540 * k) / 2, oy = (H - 675 * k) / 2;
      const cell = (x, y, w, h, shape) => ({ x: ox + x * k, y: oy + y * k, w: w * k, h: h * k, shape, rot: 0 });
      return { cells: pair ? [cell(77, 28, 386, 270, 'round'), cell(36, 350, 468, 284, 'rect')] : [cell(67, 68, 406, 536, 'round')], k, ox, oy };
    },
    deco(ctx, box, u, geo, opt) {
      const tones = { sage: '#d5dfc8', blue: '#cad9ec', rose: '#ead0d7', lilac: '#d5cef0' };
      keepsakePaper(ctx, geo.W, geo.H, opt.c('paper', tones[opt.c('tone', pair ? 'rose' : 'sage')] || tones.sage), opt.c('surface', 'paper') === 'fabric');
    },
    overlay(ctx, geo, u, opt) {
      ctx.save(); ctx.translate(geo.ox, geo.oy); ctx.scale(geo.k, geo.k);
      if (pair) {
        /* Четыре самостоятельных угловых росчерка вместо копии чужой рамки. */
        for (const [x, y, sx, sy] of [[25, 337, 1, 1], [515, 337, -1, 1], [25, 647, 1, -1], [515, 647, -1, -1]]) {
          ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy);
          const stroke = (color, lw, shift) => {
            ctx.save(); ctx.translate(shift, shift); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(0, 106); ctx.bezierCurveTo(-16, 44, 10, -18, 65, 0);
            ctx.bezierCurveTo(104, 14, 140, 52, 178, 17); ctx.bezierCurveTo(209, -9, 232, 18, 211, 34);
            ctx.bezierCurveTo(196, 44, 186, 26, 201, 23); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(3, 62); ctx.bezierCurveTo(22, 35, 59, 70, 35, 87);
            ctx.bezierCurveTo(16, 96, 13, 72, 27, 75); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(18, 6); ctx.bezierCurveTo(50, -27, 107, 0, 91, 24); ctx.stroke(); ctx.restore();
          };
          stroke('rgba(70,40,77,.2)', 5, 1); stroke(opt.c('ornament', '#fae1ef'), 3, 0);
          ctx.fillStyle = opt.c('ornament', '#fae1ef');
          for (const [dx, dy, r] of [[55, 53, 2.5], [69, 58, 1.5], [127, 9, 2], [8, 121, 2]]) { ctx.beginPath(); ctx.arc(dx, dy, r, 0, TAU); ctx.fill(); }
          ctx.restore();
        }
      }
      const style = opt.c('decor', pair ? 'check' : 'foil');
      if (style === 'spark') {
        bow(ctx, pair ? 114 : 125, pair ? 58 : 105, 44, -0.2, opt.c('stars', '#b08bb5'));
        for (const [x, y, r] of (pair ? [[448, 84, 30], [470, 141, 16], [76, 250, 17]] : [[436, 145, 29], [460, 202, 15], [87, 536, 23]])) {
          doodle(ctx, 'sparkle', x, y, r, '#fffbea', 4); doodle(ctx, 'sparkle', x, y, r + 3, opt.c('stars', '#d7bd78'), 1);
        }
      } else if (style !== 'none') {
        const rng = window.Motifs.makeRng(263);
        const spots = [[37, 31, 14], [98, 39, 10], [148, 29, 8], [62, 83, 9], [127, 89, 17], [27, 135, 12], [91, 156, 8], [463, 507, 11], [503, 552, 15], [436, 565, 8], [397, 604, 16], [466, 639, 10], [352, 643, 9]];
        const n = pair ? 5 : spots.length;
        for (let i = 0; i < n; i++) {
          const bottom = i >= n / 2;
          const x = pair ? (bottom ? 377 + rng() * 127 : 20 + rng() * 142) : spots[i][0];
          const y = pair ? (bottom ? 238 : 22) + rng() * 62 : spots[i][1];
          keepsakeStar(ctx, x, y, pair ? 10 + rng() * 11 : spots[i][2], style === 'silver' ? 'foil' : style, opt.c('stars', style === 'silver' ? '#969ba5' : style === 'check' ? '#edb6ce' : '#bfa15d'), rng() * 1.3 - 0.65);
        }
      }
      ctx.restore();
    },
  });

  /* Палетка: цвет пигмента отделён от рельефа прессованной пудры и отражений. */
  const pigmentCache = new Map();
  const pigmentDefaults = ['#71a8a4', '#253e56', '#80b9b3', '#9aa99b', '#ccd9d5', '#c2c5bc', '#b1d7d0', '#687d87'];
  function pigmentTile(color, finish, seed, worn) {
    const key = `${color}:${finish}:${seed}:${worn}`;
    if (pigmentCache.has(key)) return pigmentCache.get(key);
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    /* Браузер нормализует любой выбранный CSS-цвет в RGB. */
    x.fillStyle = color; x.fillRect(0, 0, 1, 1);
    const rgb = x.getImageData(0, 0, 1, 1).data;
    const linear = (v) => (v / 255 <= 0.04045 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    const srgb = (v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
    const base = [linear(rgb[0]), linear(rgb[1]), linear(rgb[2])];
    const data = x.createImageData(256, 256), rng = window.Motifs.makeRng(seed);
    const coarse = Array.from({ length: 17 * 17 }, () => rng());
    const wearRng = window.Motifs.makeRng(seed * 19);
    const hollows = Array.from({ length: 3 }, () => ({ x: 50 + wearRng() * 160, y: 60 + wearRng() * 150, rx: 25 + wearRng() * 55, ry: 20 + wearRng() * 50, depth: 0.12 + wearRng() * 0.23 }));
    const noise = (px, py) => {
      const ix = Math.floor(px), iy = Math.floor(py), tx = px - ix, ty = py - iy;
      const a = coarse[iy * 17 + ix], b = coarse[iy * 17 + ix + 1];
      const d = coarse[(iy + 1) * 17 + ix], e = coarse[(iy + 1) * 17 + ix + 1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
    };
    for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) {
      const p = (py * 256 + px) * 4;
      const broad = noise(px / 17, py / 17);
      const grain = rng(), glint = rng();
      const edge = Math.min(px, py, 255 - px, 255 - py);
      let rubbed = 0, relief = 0;
      if (worn) for (const h of hollows) {
        const dx = (px - h.x) / h.rx, dy = (py - h.y) / h.ry;
        const bowl = Math.exp(-(dx * dx + dy * dy) * 1.7);
        rubbed += bowl * 0.45;
        relief += bowl * h.depth * (dx * 0.55 + dy * 0.8 - 0.24);
      }
      rubbed = Math.min(0.85, rubbed);
      const press = 0.94 + Math.sin(px * 2.1 + Math.sin(py * 0.027) * 0.4) * 0.055 * (1 - rubbed);
      const roughEdge = worn ? (broad - 0.5) * 9 + Math.sin(py * 0.42 + seed) * 1.2 : 0;
      const shade = (0.78 + broad * (worn ? 0.17 : 0.10) + grain * 0.26 * (1 - rubbed * 0.55) + relief) * press * (0.64 + 0.36 * Math.max(0, Math.min(1, (edge + roughEdge) / 9)));
      const sparkle = (finish === 'glitter' ? (glint > 0.955 ? (glint - 0.955) * 12 : 0) : finish === 'satin' ? (glint > 0.94 ? 0.09 : 0.009) : 0.002) * (1 - rubbed * 0.7);
      const sheen = finish === 'matte' ? 0.003 : Math.max(0, 1 - Math.hypot((px - 72) / 230, (py - 65) / 230)) * 0.035;
      for (let ch = 0; ch < 3; ch++) {
        const diffuse = base[ch] * Math.min(1, shade);
        data.data[p + ch] = srgb(Math.min(1, diffuse + (1 - diffuse) * (sparkle + sheen)));
      }
      data.data[p + 3] = 255;
    }
    x.putImageData(data, 0, 0);
    if (worn) {
      /* Тонкие следы кисти идут разными дугами, а не одинаковым штампом. */
      x.save();
      for (let i = 0; i < 28; i++) {
        const h = hollows[i % hollows.length], offset = (wearRng() - 0.5) * h.ry * 1.2;
        x.strokeStyle = i % 3 ? 'rgba(20,18,15,.028)' : 'rgba(255,255,255,.055)'; x.lineWidth = 0.4 + wearRng() * 0.6;
        x.beginPath(); x.moveTo(h.x - h.rx * 0.7, h.y + offset);
        x.quadraticCurveTo(h.x, h.y + offset + h.ry * 0.22, h.x + h.rx * 0.6, h.y + offset - h.ry * 0.2); x.stroke();
      }
      x.restore();
    }
    if (pigmentCache.size >= 32) pigmentCache.delete(pigmentCache.keys().next().value);
    pigmentCache.set(key, c);
    return c;
  }

  COLLAGES.push({
    id: 'eyeshadow', name: 'Палетка теней', noNote: true,
    palette: [
      ...pigmentDefaults.map((def, i) => ({ key: `shade${i}`, name: `Тени ${i + 1}`, def })),
      { key: 'case', name: 'Корпус палетки', def: '#272b2c' },
    ],
    choices: [
      { key: 'finish', name: 'Финиш теней', def: 'satin', options: [['matte', 'Матовый'], ['satin', 'Сатиновый'], ['glitter', 'Сияющий']] },
      { key: 'wear', name: 'Следы использования', def: 'on', options: [['on', 'Есть'], ['off', 'Нет']] },
    ],
    layout(W, H) {
      const size = Math.min(W, H) * 0.96, x = (W - size) / 2, y = (H - size) / 2;
      const unit = size / 3, gap = size * 0.026;
      return { cells: [{ x: x + unit + gap / 2, y: y + unit + gap / 2, w: unit - gap, h: unit - gap, rot: 0, shape: 'rounded' }], compact: { x, y, size, unit, gap } };
    },
    deco(ctx, box, u, geo, opt) {
      const { x, y, size, unit, gap } = geo.compact;
      ctx.save();
      ctx.fillStyle = opt.c('case', '#272b2c');
      ctx.beginPath(); ctx.roundRect(x, y, size, size, size * 0.025); ctx.fill();
      let index = 0;
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const px = x + col * unit + gap / 2, py = y + row * unit + gap / 2, w = unit - gap;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = gap * 0.45; ctx.shadowOffsetY = gap * 0.2;
        ctx.fillStyle = '#101617'; ctx.beginPath(); ctx.roundRect(px - gap * 0.15, py - gap * 0.15, w + gap * 0.3, w + gap * 0.3, gap); ctx.fill();
        ctx.restore();
        if (row === 1 && col === 1) continue;
        ctx.save(); ctx.beginPath(); ctx.roundRect(px, py, w, w, gap * 0.7); ctx.clip();
        ctx.drawImage(pigmentTile(opt.c(`shade${index}`, pigmentDefaults[index]), opt.c('finish', 'satin'), 719 + index * 137, opt.c('wear', 'on') === 'on'), px, py, w, w);
        ctx.restore();
        ctx.strokeStyle = 'rgba(240,246,237,.32)'; ctx.lineWidth = size * 0.0015;
        ctx.beginPath(); ctx.roundRect(px, py, w, w, gap * 0.7); ctx.stroke();
        index++;
      }
      ctx.restore();
    },
    overlay(ctx, geo, u, opt) {
      if (opt.c('wear', 'on') !== 'on') return;
      const { x, y, size, unit } = geo.compact, rng = window.Motifs.makeRng(1783);
      ctx.save();
      /* Пыль только на перегородках, не поверх снимка или выбранного оттенка. */
      for (let i = 0; i < 850; i++) {
        const vertical = i % 2;
        const along = rng() * size, across = (1 + Math.floor(i / 2) % 2) * unit + (rng() - 0.5) * size * 0.023;
        ctx.fillStyle = i % 4 ? 'rgba(211,222,217,.18)' : 'rgba(255,255,255,.36)';
        ctx.fillRect(x + (vertical ? across : along), y + (vertical ? along : across), size * 0.0015, size * 0.001);
      }
      /* Разноцветная осыпь у своих рефилов и короткие царапины на корпусе. */
      let shadeIndex = 0;
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        if (row === 1 && col === 1) continue;
        const pigment = opt.c(`shade${shadeIndex}`, pigmentDefaults[shadeIndex]);
        const cx = x + (col + 0.25 + rng() * 0.5) * unit, cy = y + (row + 1) * unit - size * 0.008;
        ctx.fillStyle = pigment;
        for (let j = 0; j < 100; j++) {
          const dx = (rng() + rng() + rng() - 1.5) * unit * 0.16;
          const dy = (rng() - 0.5) * size * 0.013;
          ctx.globalAlpha = 0.1 + rng() * 0.36;
          ctx.beginPath(); ctx.ellipse(cx + dx, cy + dy, size * (0.00035 + rng() * 0.0012), size * (0.0003 + rng() * 0.0006), rng() * TAU, 0, TAU); ctx.fill();
        }
        shadeIndex++;
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 45; i++) {
        const horizontal = i % 2, along = rng() * size;
        const across = (1 + Math.floor(i / 2) % 2) * unit;
        const px = x + (horizontal ? along : across), py = y + (horizontal ? across : along);
        ctx.strokeStyle = i % 3 ? 'rgba(210,215,210,.18)' : 'rgba(0,0,0,.3)'; ctx.lineWidth = size * 0.0006;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (horizontal ? 1 : 0.1) * size * (0.003 + rng() * 0.018), py + (horizontal ? 0.1 : 1) * size * 0.012); ctx.stroke();
      }
      ctx.restore();
    },
  });

  COLLAGES.push({
    id: 'stitchedCorners', name: 'Лоскуты и стежки', noNote: true,
    palette: [
      { key: 'clothA', name: 'Ткань 1', def: '#87a9d5' },
      { key: 'clothB', name: 'Ткань 2', def: '#b1ccf7' },
      { key: 'thread', name: 'Цвет ниток', def: '#fcf8ee' },
      { key: 'embroidery', name: 'Вышивка', def: '#1866c7' },
    ],
    choices: [
      { key: 'motif', name: 'Узор вышивки', def: 'mixed', options: [['mixed', 'Цветы и снежинки'], ['flowers', 'Цветы'], ['snow', 'Снежинки'], ['none', 'Без украшений']] },
      { key: 'seams', name: 'Пунктирные швы', def: 'on', options: [['on', 'Есть'], ['off', 'Нет']] },
    ],
    layout(W, H) { return { cells: [{ x: 0, y: 0, w: W, h: H, rot: 0 }] }; },
    overlay(ctx, geo, u, opt) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, geo.W, geo.H); ctx.clip();
      ctx.scale(geo.W / 636, geo.H / 900);
      const a = opt.c('clothA', '#87a9d5'), b = opt.c('clothB', '#b1ccf7');
      const thread = opt.c('thread', '#fcf8ee'), ink = opt.c('embroidery', '#1866c7');
      const patch = (x, y, w, h, color) => {
        ctx.save(); ctx.translate(x + w / 2, y + h / 2);
        ctx.beginPath(); tracePts(ctx, rectEdge(w, h, 24, wave(4.5)));
        ctx.save(); ctx.shadowColor = 'rgba(19,40,76,.17)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5; ctx.fillStyle = color; ctx.fill(); ctx.restore();
        ctx.clip();
        /* Фактура рисуется от локального верхнего левого угла. */
        ctx.translate(-w / 2 - 7, -h / 2 - 7); keepsakePaper(ctx, w + 14, h + 14, color, true);
        ctx.restore();
      };
      patch(-19, -20, 91, 350, a); patch(291, -25, 331, 91, a);
      patch(585, -20, 76, 234, b); patch(-22, 662, 96, 268, b);
      patch(576, 592, 85, 326, a); patch(421, 852, 240, 75, b);
      const stitch = (points, color) => {
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.setLineDash([6, 12]);
        ctx.beginPath(); points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y)); ctx.stroke(); ctx.restore();
      };
      if (opt.c('seams', 'on') === 'on') {
        stitch([[12, 29], [195, 27]], ink); stitch([[430, 25], [647, 28]], thread);
        stitch([[28, 631], [31, 872]], thread); stitch([[605, 543], [603, 799]], ink);
        stitch([[-4, 379], [164, 377]], ink);
      }
      const kind = opt.c('motif', 'mixed');
      if (kind !== 'none') {
        const cross = (x, y, r, color) => {
          ctx.strokeStyle = color; ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
        };
        const snow = (cx, cy, radius) => {
          const step = 6;
          for (let iy = -7; iy <= 7; iy++) for (let ix = -7; ix <= 7; ix++) {
            const x = ix * step, y = iy * step, d = Math.hypot(x, y);
            if (d > radius || d < 3) continue;
            const axis = Math.min(Math.abs(x), Math.abs(y), Math.abs(x - y) * 0.71, Math.abs(x + y) * 0.71);
            const branches = Math.abs(Math.abs(x) + Math.abs(y) - radius * 0.7) < 4;
            if (axis < 2 || (branches && axis < 11)) cross(cx + x, cy + y, 2, ink);
          }
        };
        const flower = (x, y, r) => {
          ctx.save(); ctx.translate(x, y); ctx.strokeStyle = ink; ctx.lineWidth = 2.3; ctx.lineJoin = 'round';
          ctx.beginPath();
          for (let i = 0; i <= 180; i++) {
            const angle = i / 180 * TAU, rr = r * (0.68 + Math.cos(angle * 5) * 0.3);
            ctx[i ? 'lineTo' : 'moveTo'](Math.cos(angle) * rr, Math.sin(angle) * rr);
          }
          ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r * 0.12, 0, TAU); ctx.stroke(); ctx.restore();
        };
        if (kind === 'mixed' || kind === 'snow') [[69, 96, 39], [146, 153, 27], [81, 223, 35], [491, 739, 34], [550, 842, 40]].forEach(([x, y, r]) => snow(x, y, r));
        if (kind === 'mixed' || kind === 'flowers') {
          [[548, 101, 22], [43, 582, 24]].forEach(([x, y, r]) => flower(x, y, r));
          doodle(ctx, 'star', 580, 158, 24, ink, 2); doodle(ctx, 'star', 83, 637, 25, ink, 2);
          doodle(ctx, 'spiral', 102, 849, 38, ink, 2);
          ctx.strokeStyle = ink; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(337, 852);
          ctx.bezierCurveTo(403, 782, 371, 911, 429, 878); ctx.quadraticCurveTo(458, 859, 464, 865); ctx.stroke();
        }
      }
      ctx.restore();
    },
  });

  COLLAGES.push({
    id: 'memoryRoute', name: 'Маршрут воспоминаний', noNote: true, movableStops: true,
    palette: [{ key: 'route', name: 'Маршрут' }, { key: 'pin', name: 'Метки', def: '#e94753' }, { key: 'frame', name: 'Рамки фото', def: '#ffffff' }, { key: 'label', name: 'Подложки подписей', def: '#e0f2fa' }, { key: 'ink', name: 'Цвет текста', def: '#203246' }],
    choices: [
      { key: 'style', name: 'Оформление маршрута', def: 'nav', options: [['nav', 'Навигатор'], ['hand', 'От руки']] },
      { key: 'count', name: 'Остановок', def: '4', options: [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']] },
      { key: 'dim', name: 'Затемнение фона', def: 'medium', options: [['none', 'Нет'], ['light', 'Лёгкое'], ['medium', 'Среднее'], ['dark', 'Сильное']] },
      { key: 'numbers', name: 'Номера остановок', def: 'on', options: [['on', 'Есть'], ['off', 'Нет']] },
    ],
    fields(s) {
      const n = Number(s.tints?.memoryRoute?.count || 4);
      return [{ key: 'heading', name: 'Название маршрута', placeholder: 'Места этого лета' }, ...Array.from({ length: n }, (_, i) => [
        { key: `place${i}`, name: `Остановка ${i + 1}`, placeholder: `Место ${i + 1}` },
        { key: `time${i}`, name: `Заметка ${i + 1}`, placeholder: 'Например: 15 минут' },
      ]).flat()];
    },
    layout(W, H, env) {
      const n = Number(env.pick('count', '4')), m = Math.min(W, H);
      const nav = env.pick('style', 'nav') === 'nav';
      const room = Math.max(H * 0.06, H * (nav ? 0.86 : 1.02) / (n - 1) - m * 0.12);
      const w = Math.min(W * (nav ? 0.19 : 0.25), H * 0.20, room / 1.22), h = Math.min(w * 1.22, H * 0.18);
      const navPositions = [[0.16, 0.395], [0.84, 0.45], [0.34, 0.675], [0.73, 0.755]];
      const stops = Array.from({ length: n }, (_, i) => {
        const saved = env.marks[i];
        const def = nav ? (n === 4 ? navPositions[i] : [i % 2 ? 0.81 : 0.22, 0.36 + i / (n - 1) * 0.43]) : [i % 2 ? 0.76 : 0.24, 0.30 + i / (n - 1) * 0.51];
        const cx = Math.max(w / 2 + W * 0.04, Math.min(W - w / 2 - W * 0.04, (saved?.x ?? def[0]) * W));
        const cy = Math.max(H * 0.25, Math.min(H * 0.84, (saved?.y ?? def[1]) * H));
        return { x: cx - w / 2, y: cy - h / 2, w, h, rot: 0, slot: i + 1, shape: 'rounded', frame: 'whiteRounded', corner: nav ? 0.025 : undefined, tint: 'frame', color: '#ffffff', cx, cy };
      });
      const anchors = stops.map((s, i) => ({ x: s.cx + (i ? (i % 2 ? -1 : 1) * w * 0.27 : 0), y: s.y - m * 0.064 }));
      const road = [anchors[0]], badges = [];
      anchors.slice(1).forEach((s, i) => {
        const prev = anchors[i], dx = s.x - prev.x, dy = s.y - prev.y;
        const shapes = [ [[0.25, 0.35], [0.60, 0.06]], [[0.35, 0.20], [0.44, 0.70], [0.90, 0.95]], [[0.48, 0.66], [0.72, 0.38]] ];
        shapes[i % 3].forEach(([fx, fy]) => {
          /* Первый участок проходит над первым фото даже при большом расстоянии
             до следующей остановки (два или три снимка). */
          const offsetY = i === 0 ? Math.min(dy * fy, m * (fx < 0.5 ? 0.025 : 0.008)) : dy * fy;
          road.push({ x: prev.x + dx * fx, y: prev.y + offsetY });
        });
        road.push(s); badges.push({ x: prev.x + dx * 0.48, y: prev.y + dy * 0.55 + m * 0.035 });
      });
      const headingY = Number(env.pick('headingY', nav ? '21' : '7'));
      const header = { x: W * 0.08, y: H * Math.max(0, Math.min(0.9, headingY / 100)), w: W * 0.84, h: m * 0.075 };
      return { cells: [{ x: 0, y: 0, w: W, h: H, rot: 0, slot: 0 }, ...stops], stops, anchors, badges, road, header, underAt: 1,
        under(ctx, u, opt) {
          ctx.fillStyle = `rgba(0,0,0,${{ none: 0, light: 0.18, medium: 0.35, dark: 0.55 }[opt.c('dim', 'medium')] ?? 0.35})`; ctx.fillRect(0, 0, W, H);
          const hand = opt.c('style', 'nav') === 'hand';
          ctx.strokeStyle = opt.c('route', hand ? '#f5e97a' : '#3187ec');
          ctx.lineCap = hand ? 'round' : 'butt'; ctx.lineJoin = hand ? 'round' : 'miter'; ctx.miterLimit = 4;
          if (hand) {
            /* Непрерывный маркер: рука отклоняется от направления, нажим меняется плавно.
               Рисунок повторяемый, чтобы линия не дрожала в видео. */
            const rng = window.Motifs.makeRng(844);
            stops.slice(1).forEach((s, i) => {
              const prev = stops[i], dx = s.cx - prev.cx, dy = s.cy - prev.cy;
              const len = Math.max(1, Math.hypot(dx, dy)), nx = -dy / len, ny = dx / len;
              const steps = Math.max(36, Math.round(len / m * 110));
              let last = [prev.cx, prev.cy], wobble = 0;
              const phase = rng() * TAU;
              for (let j = 1; j <= steps; j++) {
                const t = j / steps;
                wobble = wobble * 0.65 + (rng() - 0.5) * m * 0.005;
                const drift = Math.sin(Math.PI * t) * (Math.sin(t * 9 + phase) * m * 0.026 + Math.sin(t * 31 + phase) * m * 0.004 + wobble);
                const next = [prev.cx + dx * t + nx * drift, prev.cy + dy * t + ny * drift];
                ctx.lineWidth = m * 0.009 * (0.86 + 0.18 * Math.sin(t * 12 + phase) + rng() * 0.12);
                ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...next); ctx.stroke(); last = next;
              }
            });
          } else {
            /* Как дорога на карте: длинные прямые участки и явные углы, без сглаживания. */
            ctx.lineWidth = m * 0.006; ctx.beginPath();
            road.forEach((s, i) => ctx[i ? 'lineTo' : 'moveTo'](s.x, s.y)); ctx.stroke();
          }
        },
      };
    },
    overlay(ctx, geo, u, opt) {
      const { W, H } = geo, m = Math.min(W, H), hand = opt.c('style', 'nav') === 'hand';
      const ink = opt.c('ink', '#203246'), label = opt.c('label', hand ? '#e0f2fa' : '#f5dfa2'), pin = opt.c('pin', '#e94753');
      const text = (s, x, y, size, width) => { ctx.fillStyle = ink; ctx.font = `500 ${size}px ${hand ? opt.font : SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y, width); };
      const headerY = geo.header.y;
      ctx.fillStyle = '#fffdf9'; ctx.beginPath(); ctx.roundRect(W * 0.08, headerY, W * 0.84, m * 0.075, m * 0.05); ctx.fill();
      ctx.fillStyle = hand ? pin : '#e8d884'; ctx.beginPath(); ctx.arc(W * 0.12, headerY + m * 0.0375, m * 0.012, 0, TAU); ctx.fill();
      text(opt.c('heading', '') || 'Места этого лета', W * 0.51, headerY + m * 0.0375, m * 0.031, W * 0.67);
      geo.stops.forEach((s, i) => {
        const labelH = m * 0.042, ly = s.y + s.h + labelH * 0.85;
        const place = opt.c(`place${i}`, '') || `Место ${i + 1}`;
        if (hand) {
          ctx.fillStyle = label; ctx.beginPath(); ctx.roundRect(s.cx - s.w * 0.64, ly - labelH / 2, s.w * 1.28, labelH, labelH / 2); ctx.fill();
          text(place, s.cx, ly, m * 0.024, s.w * 1.16);
        } else {
          ctx.font = `500 ${m * 0.023}px ${SANS}`;
          const lines = [''];
          place.split(/\s+/).forEach(word => {
            const last = lines.length - 1, next = `${lines[last]} ${word}`.trim();
            if (ctx.measureText(next).width > s.w * 1.35 && lines[last] && lines.length < 2) lines.push(word);
            else lines[last] = next;
          });
          lines.forEach((line, j) => {
            const bw = Math.min(s.w * 1.4, ctx.measureText(line).width + m * 0.01), y = ly - labelH * 0.16 + j * labelH * 0.67;
            ctx.fillStyle = label; ctx.fillRect(s.cx - bw / 2, y - labelH * 0.34, bw, labelH * 0.68);
            text(line, s.cx, y, m * 0.023, bw - m * 0.006);
          });
        }
        const px = s.cx, py = s.y - m * (hand ? 0.025 : 0.055), r = m * (hand ? 0.018 : 0.021);
        if (!hand && i === 0) {
          ctx.fillStyle = opt.c('route', '#3187ec'); ctx.strokeStyle = '#fff'; ctx.lineWidth = m * 0.004;
          ctx.beginPath(); ctx.arc(geo.anchors[0].x, geo.anchors[0].y, m * 0.022, 0, TAU); ctx.fill(); ctx.stroke();
        } else {
        ctx.fillStyle = pin; ctx.beginPath(); ctx.moveTo(px, py + r * 1.8);
        ctx.bezierCurveTo(px - r * 0.3, py + r * 1.2, px - r, py + r * 0.55, px - r, py);
        ctx.arc(px, py, r, Math.PI, TAU);
        ctx.bezierCurveTo(px + r, py + r * 0.55, px + r * 0.3, py + r * 1.2, px, py + r * 1.8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, r * 0.36, 0, TAU); ctx.fill();
        }
        if (opt.c('numbers', 'on') === 'on') {
          const nx = s.x + s.w * (!hand && i % 2 ? 0.99 : 0.01), ny = s.y + s.h * 0.02, nr = m * (hand ? 0.024 : 0.032);
          ctx.fillStyle = opt.c('route', hand ? '#f5e97a' : '#3187ec'); ctx.beginPath(); ctx.arc(nx, ny, nr, 0, TAU); ctx.fill();
          ctx.fillStyle = hand ? '#28313c' : '#fff'; ctx.font = `600 ${nr}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), nx, ny);
        }
        const note = opt.c(`time${i}`, '');
        if (note) {
          if (!hand) {
            const point = geo.badges[i] || { x: geo.anchors[i].x - m * 0.13, y: geo.anchors[i].y - m * 0.025 };
            ctx.font = `500 ${m * 0.023}px ${SANS}`;
            const bw = Math.min(W * 0.29, ctx.measureText(note).width + m * 0.03), bh = m * 0.045;
            ctx.fillStyle = opt.c('route', '#3187ec'); ctx.beginPath(); ctx.roundRect(point.x - bw / 2, point.y - bh / 2, bw, bh, m * 0.006); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(note, point.x, point.y, bw * 0.9);
            return;
          }
          const bw = Math.min(s.w * 1.4, W * 0.34), by = ly + labelH * 0.95;
          ctx.fillStyle = 'rgba(255,253,249,.9)'; ctx.beginPath(); ctx.roundRect(s.cx - bw / 2, by - labelH * 0.4, bw, labelH * 0.8, labelH * 0.15); ctx.fill();
          text(note, s.cx, by, m * 0.019, bw * 0.92);
        }
      });
    },
  });

  const collageApple = new Image();
  const collageGreenApple = new Image();
  const collageCherries = new Image(), collageBlueberries = new Image();
  const fruitImages = { red: collageApple, green: collageGreenApple, cherry: collageCherries, blueberry: collageBlueberries };
  const fruitInk = (id) => ({ red: '#922318', green: '#3f5a27', cherry: '#8e2037', blueberry: '#385475' }[id] || '#922318');
  const collageAssetsReady = Promise.all([[collageApple, 'apple.png'], [collageGreenApple, 'apple-green.png'], [collageCherries, 'cherries.png'], [collageBlueberries, 'blueberries.png']].map(([img, file]) => new Promise(resolve => {
    img.onload = resolve; img.onerror = resolve; img.src = `templates/decor/${file}`;
  })));

  COLLAGES.push({
    id: 'wishBasket', name: 'Список желаний', noNote: true,
    palette: [{ key: 'background', name: 'Фон', def: '#eeedeb' }, { key: 'ink', name: 'Цвет заголовка', def: '#4d657c' }, { key: 'accent', name: 'Цвет бирок', def: '#bfd6ed' }],
    choices: [{ key: 'count', name: 'Книжек', def: '6', options: [['4', '4'], ['6', '6']] }],
    fields() { return [{ key: 'heading', name: 'Заголовок списка', placeholder: 'Wish List' }, { key: 'subtitle', name: 'Подзаголовок списка', placeholder: 'version: books' }, { key: 'legend', name: 'Пояснение под корзинкой', placeholder: '1. Первая книга · 2. Вторая книга…', maxLength: 600 }]; },
    layout(W, H, env) {
      const k = Math.min(W / 736, H / 920), ox = (W - 736 * k) / 2, oy = (H - 920 * k) / 2;
      const n = Number(env.pick('count', '6'));
      const poses = n === 6 ? [[168, 460, -17], [362, 444, 11], [550, 435, 33], [550, 656, -18], [366, 660, -38], [189, 665, 14]] : [[214, 460, -16], [504, 448, 18], [498, 663, -17], [220, 663, 13]];
      return { k, ox, oy, cells: poses.map(([cx, cy, rot]) => ({ x: ox + (cx - 72) * k, y: oy + (cy - 108) * k, w: 144 * k, h: 216 * k, rot: rot * Math.PI / 180, frame: 'book' })) };
    },
    deco(ctx, box, u, geo, opt) {
      ctx.fillStyle = opt.c('background', '#eeedeb'); ctx.fillRect(0, 0, geo.W, geo.H);
      ctx.save(); ctx.translate(geo.ox, geo.oy); ctx.scale(geo.k, geo.k);
      const basket = (color, lw, shift) => {
        ctx.save(); ctx.translate(shift, shift); ctx.strokeStyle = color; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.roundRect(88, 376, 558, 390, 36); ctx.stroke();
        ctx.beginPath(); ctx.roundRect(98, 387, 538, 368, 27); ctx.stroke();
        for (let i = 1; i < 10; i++) {
          const x = 96 + i * 54;
          ctx.beginPath(); ctx.moveTo(x, 390); ctx.lineTo(x - 20, 753); ctx.stroke();
        }
        for (let i = 1; i < 7; i++) { const y = 390 + i * 53; ctx.beginPath(); ctx.moveTo(99, y); ctx.lineTo(635, y); ctx.stroke(); }
        ctx.restore();
      };
      basket('#929b9f', 4.5, 1.5); basket('#f9fcfd', 2.2, -1); basket('#4e626b', 0.8, 0);
      const grip = ctx.createLinearGradient(78, 0, 102, 0); grip.addColorStop(0, '#697f88'); grip.addColorStop(0.45, '#c4d8df'); grip.addColorStop(1, '#58717b');
      ctx.fillStyle = grip; ctx.beginPath(); ctx.roundRect(78, 444, 20, 246, 9); ctx.fill();
      ctx.save(); ctx.translate(558, 0); ctx.fillStyle = grip; ctx.beginPath(); ctx.roundRect(78, 444, 20, 246, 9); ctx.fill(); ctx.restore();
      ctx.restore();
    },
    overlay(ctx, geo, u, opt) {
      ctx.save(); ctx.translate(geo.ox, geo.oy); ctx.scale(geo.k, geo.k);
      const ink = opt.c('ink', '#4d657c'), accent = opt.c('accent', '#bfd6ed');
      const title = opt.c('heading', '') || 'Wish List';
      ctx.fillStyle = ink; ctx.font = 'italic 112px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(title, 368, 192, 570);
      ctx.fillStyle = accent; ctx.fillRect(245, 235, 246, 36);
      ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(245, 229); ctx.lineTo(245, 271); ctx.moveTo(491, 235); ctx.lineTo(491, 277); ctx.stroke();
      ctx.fillStyle = ink; for (const [x, y] of [[245, 229], [491, 277]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#182029'; ctx.font = `23px ${SANS}`; ctx.fillText(opt.c('subtitle', '') || 'version: books', 368, 259, 230);
      geo.cells.forEach((c, i) => {
        const rot = c.rot, rx = -c.w / 2, ry = -c.h / 2;
        const cx = (c.x + c.w / 2 - geo.ox) / geo.k, cy = (c.y + c.h / 2 - geo.oy) / geo.k;
        const x = cx + (rx * Math.cos(rot) - ry * Math.sin(rot)) / geo.k, y = cy + (rx * Math.sin(rot) + ry * Math.cos(rot)) / geo.k;
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x, y - 3, 16, 0, TAU); ctx.fill();
        ctx.fillStyle = '#17202a'; ctx.font = `22px ${SANS}`; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, y - 2);
      });
      const legend = opt.c('legend', '') || ['Мечты', 'Открытия', 'Истории', 'Вдохновение', 'Приключения', 'Любимое'].slice(0, geo.cells.length).map((name, i) => `${i + 1}. ${name}`).join('   ');
      ctx.font = `12px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#222a30';
      let line = '', y = 817;
      legend.split(/\s+/).forEach(word => { if (y > 870) return; const next = `${line} ${word}`.trim(); if (ctx.measureText(next).width > 570 && line) { ctx.fillText(line, 83, y, 570); y += 18; line = word; } else line = next; });
      if (line && y < 895) ctx.fillText(line, 83, y, 570);
      ctx.restore();
    },
  });

  COLLAGES.push({
    id: 'appleBooth', name: 'Фруктовая фотобудка', noNote: true,
    palette: [{ key: 'background', name: 'Фон', def: '#ffffff' }, { key: 'ink', name: 'Рамки и рисунки', def: '#922318' }],
    choices: [
      { key: 'apple', name: 'Фрукты и ягоды', def: 'red', options: [['red', 'Красное яблоко'], ['green', 'Зелёное яблоко'], ['cherry', 'Черешня'], ['blueberry', 'Голубика']] },
      { key: 'count', name: 'Кадров', def: '2', options: [['2', '2'], ['3', '3']] },
      { key: 'mono', name: 'Чёрно-белые фото', def: 'on', options: [['on', 'Есть'], ['off', 'Нет']] },
      { key: 'decor', name: 'Рисунки мелком', def: 'on', options: [['on', 'Есть'], ['off', 'Нет']] },
    ],
    layout(W, H, env) {
      const k = Math.min(W / 736, H / 1308), ox = (W - 736 * k) / 2, oy = (H - 1308 * k) / 2;
      const n = Number(env.pick('count', '2')), gap = 13, h = (552 - (n - 1) * gap) / n;
      return { k, ox, oy, cells: Array.from({ length: n }, (_, i) => ({ x: ox + 145 * k, y: oy + (432 + i * (h + gap)) * k, w: 446 * k, h: h * k, rot: 0, mono: env.pick('mono', 'on') === 'on', frame: 'border', tint: 'ink', color: fruitInk(env.pick('apple', 'red')), bw: 0.006 })) };
    },
    deco(ctx, box, u, geo, opt) {
      ctx.fillStyle = opt.c('background', '#ffffff'); ctx.fillRect(0, 0, geo.W, geo.H);
      const apple = fruitImages[opt.c('apple', 'red')] || collageApple;
      if (!apple.naturalWidth) return;
      ctx.save(); ctx.translate(geo.ox, geo.oy); ctx.scale(geo.k, geo.k);
      const iw = apple.naturalWidth, ih = apple.naturalHeight;
      ctx.drawImage(apple, 0, 0, iw, ih * 0.64, 108, 61, 520, 520 * 0.64);
      ctx.drawImage(apple, 0, ih * 0.64, iw, ih * 0.36, 108, 1005, 520, 520 * 0.36);
      ctx.restore();
    },
    overlay(ctx, geo, u, opt) {
      if (opt.c('decor', 'on') !== 'on') return;
      ctx.save(); ctx.translate(geo.ox, geo.oy); ctx.scale(geo.k, geo.k);
      const ink = opt.c('ink', fruitInk(opt.c('apple', 'red')));
      const petal = (cx, cy, r, seed) => {
        const rng = window.Motifs.makeRng(seed); ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
        for (let i = 0; i <= 140; i++) { const a = i / 140 * TAU, rr = r * (0.66 + Math.cos(a * 5) * 0.3) + rng() * 1.1; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.stroke();
      };
      petal(548, 76, 49, 1); petal(83, 947, 50, 2); petal(58, 1080, 36, 3);
      doodle(ctx, 'star', 650, 183, 47, ink, 3); doodle(ctx, 'spiral', 668, 44, 12, ink, 3);
      burst(ctx, 114, 210, 62, ink, 1.8); burst(ctx, 653, 1166, 43, ink, 1.4); burst(ctx, 563, 1248, 28, ink, 1.2);
      ctx.restore();
    },
  });

  window.Collages = { COLLAGES, ready: collageAssetsReady, COLORABLE, hasColorFrame, paletteOf, count, byId, geometry, cellAt, cellOf, drawFrame, drawOver, clipBox, clipCell };
})();
