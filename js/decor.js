/* Украшения интерфейса: символы, строчка-орнамент под названием и зерно. Контуры те же, что в «Полке». */
(function () {
  const FLOATERS = [
    ['sparkle', 8, 18, 26, 0, 6], ['star', 78, 10, 15, 2, 7.5], ['cloud', 52, 30, 26, 1.6, 7.5], ['moon', 88, 42, 20, 3, 6],
    ['sparkle', 22, 55, 13, 1, 5], ['star', 70, 68, 22, 0.4, 5], ['cloud', 10, 80, 20, 2.4, 6], ['sparkle', 58, 90, 17, 1.2, 6],
  ];
  const DECO = [['sparkle', 5], ['sparkle', 11], ['cloud', 12], ['sparkle', 7], ['star', 12]];

  function symbol(name, size) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', window.Motifs.SYMBOLS[name].d);
    svg.append(path);
    return svg;
  }

  window.Decor = { symbol };

  DECO.forEach(([name, size]) => document.getElementById('deco').append(symbol(name, size)));

  FLOATERS.forEach(([name, x, y, size, delay, period]) => {
    const el = symbol(name, size);
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.setProperty('--t', `${period}s`);
    el.style.setProperty('--d', `-${delay}s`);
    document.getElementById('floaters').append(el);
  });

  const tile = window.Render.canvas(256, 256);
  const x = tile.getContext('2d');
  const img = x.createImageData(256, 256);
  const rng = window.Motifs.makeRng(7);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = rng() * 255;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--grain', `url(${tile.toDataURL()})`);
})();
