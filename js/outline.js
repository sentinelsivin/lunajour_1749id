/* Автообводка человека: модель находит человека на карточке, по маске строится контур с отступом.
   Модель (MediaPipe selfie segmenter) и её движок лежат в js/vendor/mediapipe и грузятся только при первом
   нажатии «Обвести». Всё считается на устройстве: даже служебную статистику библиотеки в сеть не пускаем. */
window.Outline = (function () {
  const BASE = new URL('js/vendor/mediapipe/', document.baseURI).href;
  /* библиотека раз в минуту шлёт в Google статистику работы (без снимков). Lunajour обещает, что ничего не уходит
     с устройства, поэтому этот адрес получает отказ сразу, а библиотека, получив отказ, сама перестаёт слать */
  const BLOCKED = /^https:\/\/odml\.pa\.googleapis\.com\//;
  let guarded = false;
  function guard() {
    if (guarded) return;
    guarded = true;
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (BLOCKED.test(url)) return Promise.resolve(new Response('', { status: 403 }));
      return orig(input, init);
    };
  }

  let ready = null;
  function load() {
    if (!ready) {
      guard();
      ready = (async () => {
        const { ImageSegmenter } = await import(`${BASE}vision_bundle.mjs`);
        return ImageSegmenter.createFromOptions(
          { wasmLoaderPath: `${BASE}wasm/vision_wasm_internal.js`, wasmBinaryPath: `${BASE}wasm/vision_wasm_internal.wasm` },
          {
            // Некоторые WebView предоставляют OffscreenCanvas, но не WebGL на нём.
            canvas: document.createElement('canvas'),
            baseOptions: { modelAssetPath: `${BASE}selfie_segmenter.tflite`, delegate: 'CPU' },
            runningMode: 'IMAGE',
            outputConfidenceMasks: true,
            outputCategoryMask: false,
          },
        );
      })().catch((err) => { ready = null; throw err; });
    }
    return ready;
  }

  /* маска человека: 1 — человек, 0 — фон */
  async function mask(canvas) {
    const seg = await load();
    const res = seg.segment(canvas);
    try {
      const m = res.confidenceMasks?.[0];
      if (!m) return null;
      const { width: w, height: h } = m;
      const f = m.getAsFloat32Array();
      const bin = new Uint8Array(w * h);
      for (let i = 0; i < f.length; i++) bin[i] = f[i] > 0.5 ? 1 : 0;
      return { bin, w, h };
    } finally {
      res.close();
    }
  }

  /* остаётся только самое большое пятно: случайные кусочки фона не обводим */
  function largest(bin, w, h) {
    const label = new Int32Array(w * h);
    let best = 0;
    let bestSize = 0;
    let next = 0;
    const stack = [];
    for (let i = 0; i < bin.length; i++) {
      if (!bin[i] || label[i]) continue;
      next++;
      let size = 0;
      stack.push(i);
      label[i] = next;
      while (stack.length) {
        const p = stack.pop();
        size++;
        const x = p % w;
        const y = (p / w) | 0;
        if (x > 0 && bin[p - 1] && !label[p - 1]) { label[p - 1] = next; stack.push(p - 1); }
        if (x < w - 1 && bin[p + 1] && !label[p + 1]) { label[p + 1] = next; stack.push(p + 1); }
        if (y > 0 && bin[p - w] && !label[p - w]) { label[p - w] = next; stack.push(p - w); }
        if (y < h - 1 && bin[p + w] && !label[p + w]) { label[p + w] = next; stack.push(p + w); }
      }
      if (size > bestSize) { bestSize = size; best = next; }
    }
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = label[i] === best ? 1 : 0;
    return { bin: out, area: bestSize };
  }

  /* отступ: пятно расширяется на r пикселей (расстояние по шахматке 3-4, этого хватает для гладкой линии) */
  function dilate(bin, w, h, r) {
    if (r < 1) return bin;
    const INF = 1e9;
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = bin[i] ? 0 : INF;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!d[i]) continue;
        let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + 3);
        if (y > 0) {
          v = Math.min(v, d[i - w] + 3);
          if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
          if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
        }
        d[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (!d[i]) continue;
        let v = d[i];
        if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
        if (y < h - 1) {
          v = Math.min(v, d[i + w] + 3);
          if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
          if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
        }
        d[i] = v;
      }
    }
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = d[i] <= r * 3 ? 1 : 0;
    return out;
  }

  /* внешний край пятна по порядку точек (обход соседей по часовой стрелке, Мур) */
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  function trace(bin, w, h) {
    let s = -1;
    for (let i = 0; i < bin.length; i++) if (bin[i]) { s = i; break; }
    if (s < 0) return [];
    const fg = (x, y) => x >= 0 && y >= 0 && x < w && y < h && bin[y * w + x] === 1;
    const sx = s % w;
    const sy = (s / w) | 0;
    let cx = sx;
    let cy = sy;
    let bx = sx - 1;
    let by = sy;
    const b0x = bx;
    const b0y = by;
    const pts = [[cx, cy]];
    const limit = w * h * 4;
    for (let step = 0; step < limit; step++) {
      const k0 = DIRS.findIndex(([dx, dy]) => dx === bx - cx && dy === by - cy);
      let moved = false;
      for (let t = 1; t <= 8; t++) {
        const k = (k0 + t) % 8;
        const nx = cx + DIRS[k][0];
        const ny = cy + DIRS[k][1];
        if (fg(nx, ny)) {
          const pk = (k + 7) % 8;
          bx = cx + DIRS[pk][0];
          by = cy + DIRS[pk][1];
          cx = nx;
          cy = ny;
          moved = true;
          break;
        }
      }
      if (!moved) break; /* одиночная точка */
      if (cx === sx && cy === sy && bx === b0x && by === b0y) break;
      pts.push([cx, cy]);
    }
    return pts;
  }

  /* упрощение линии (Рамер — Дуглас — Пекер) и сглаживание углов (Чайкин) */
  function simplify(pts, eps) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = 1;
    keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = pts[a];
      const [bx, by] = pts[b];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      let far = -1;
      let dist = 0;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
        if (d > dist) { dist = d; far = i; }
      }
      if (dist > eps && far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  function chaikin(pts, closed, n = 2) {
    let p = pts;
    for (let k = 0; k < n; k++) {
      const out = closed ? [] : [p[0]];
      const m = closed ? p.length : p.length - 1;
      for (let i = 0; i < m; i++) {
        const [ax, ay] = p[i];
        const [bx, by] = p[(i + 1) % p.length];
        out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
      }
      if (!closed) out.push(p[p.length - 1]);
      p = out;
    }
    return p;
  }

  /* Контур человека на картинке canvas с отступом offset (пиксели этой картинки).
     Где человек уходит за край кадра, линия обрывается, как на рисунках от руки: возвращается незамкнутая линия.
     null — человека не нашли. */
  async function find(canvas, offset) {
    const result = await mask(canvas);
    if (!result) return null;
    const { bin: raw, w, h } = result;
    const { bin, area } = largest(raw, w, h);
    if (area < w * h * 0.01) return null;
    const grown = dilate(bin, w, h, offset);
    const loop = trace(grown, w, h);
    if (loop.length < 8) return null;
    /* точки на краю кадра — разрыв: берём самый длинный кусок контура между ними */
    const edge = ([x, y]) => x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2;
    let closed = !loop.some(edge);
    let line = loop;
    if (!closed) {
      const first = loop.findIndex(edge);
      const rot = [...loop.slice(first), ...loop.slice(0, first)];
      let best = [];
      let run = [];
      rot.forEach((p) => {
        if (edge(p)) { if (run.length > best.length) best = run; run = []; } else run.push(p);
      });
      if (run.length > best.length) best = run;
      line = best;
      if (line.length < 8) return null;
    }
    const k = Math.max(w, h) / 400;
    let out = simplify(line, Math.max(0.8, k));
    out = chaikin(out, closed, 2);
    if (closed) out.push(out[0]);
    return { pts: out, w, h };
  }

  return { load, find };
})();
