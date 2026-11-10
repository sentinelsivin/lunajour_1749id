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
    if (frame === 'border') {
      const b = w * (cell.bw || 0.03);
      ctx.fillStyle = cell.color || '#7b8040';
      ctx.fillRect(-w / 2 - b, -h / 2 - b, w + b * 2, h + b * 2);
    } else if (frame === 'white' || frame === 'whiteRounded') {
      const b = w * 0.03;
      shadow(() => {
        ctx.fillStyle = cell.color || '#fbfaf6';
        ctx.beginPath();
        ctx.roundRect(-w / 2 - b, -h / 2 - b, w + b * 2, h + b * 2, frame === 'white' ? 0 : w * 0.14);
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
    else if (cell.shape === 'rounded') ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.12);
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
      choices: [{ key: 'brace', name: 'Скобки', def: '()', options: [['()', '( )'], ['{}', '{ }'], ['none', 'Без скобок']] }],
      layout(W, H, env) {
        const m = Math.min(W, H);
        const f = flowText(env.text || this.sample, { x: W * 0.04, y: H * 0.3, w: W * 0.92, h: H * 0.38 }, {
          size: m * 0.075, weight: 400, css: SANS, winScale: 0.85, aspects: [1.6], pad: 0.55, brace: env.pick('brace', '()'), color: env.pick('text', '#d64545'),
        });
        return { cells: [{ x: 0, y: 0, w: W, h: H, rot: 0 }, ...f.wins.map((c) => ({ ...c, inline: true }))], items: f.items };
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
  window.Collages = { COLLAGES, COLORABLE, hasColorFrame, paletteOf, count, byId, geometry, cellAt, cellOf, drawFrame, drawOver, clipBox, clipCell };
})();
