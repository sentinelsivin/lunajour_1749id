/* «Память на устройстве»: что сколько занимает в памяти браузера и очистка влога.
   Длинные видео с телефона заполняют память быстро, а без места не сохранится ни клип, ни черновик. */
window.Memory = (function () {
  const { Store, I18n } = window;
  const t = (ru) => I18n.t(ru);
  const $ = (id) => document.getElementById(id);

  /* примерный размер того, что лежит в базе: файлы по их размеру, остальное по длине данных */
  function sizeOf(v, depth = 0) {
    if (v == null || depth > 8) return 0;
    if (v instanceof Blob) return v.size;
    if (v instanceof ArrayBuffer) return v.byteLength;
    if (ArrayBuffer.isView(v)) return v.byteLength;
    if (typeof v === 'string') return v.length;
    if (typeof v !== 'object') return 8;
    let sum = 0;
    for (const k in v) sum += k.length + sizeOf(v[k], depth + 1);
    return sum;
  }
  function fmt(bytes) {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1073741824).toFixed(1)} ${t('ГБ')}`;
    if (bytes >= 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} ${t('МБ')}`;
    return `${Math.max(1, Math.round(bytes / 1024))} ${t('КБ')}`;
  }

  /* разделы: какие ключи базы к чему относятся */
  const GROUPS = [
    { id: 'vlog', name: 'Влог', test: (k) => k === 'vlog' || k.startsWith('vlog-m-') },
    { id: 'draft', name: 'Черновик карточки', test: (k) => k === 'draft', note: 'Обновляется сам, пока правишь карточку. «Новый снимок» с нуля его удаляет.' },
    { id: 'styles', name: 'Мои стили', test: (k) => k === 'styles', note: 'Отдельный стиль удаляется в меню ⋯ → Мои стили.' },
    { id: 'feed', name: 'План ленты', test: (k) => k === 'feed', note: 'Посты удаляются в меню ⋯ → План ленты.' },
    { id: 'music', name: 'Своя музыка карточки', test: (k) => k === 'music' },
    { id: 'other', name: 'Настройки и недавнее', test: () => true },
  ];

  async function measure() {
    const keys = await Store.keys();
    const out = GROUPS.map((g) => ({ ...g, bytes: 0, keys: [] }));
    for (const key of keys) {
      const g = out.find((x) => x.test(String(key)));
      g.keys.push(key);
      g.bytes += sizeOf(await Store.get(key));
    }
    const vlog = out.find((g) => g.id === 'vlog');
    const project = await Store.get('vlog');
    vlog.clips = project && Array.isArray(project.clips) ? project.clips.length : 0;
    return out;
  }

  /* удаление в два нажатия: первое спрашивает, второе удаляет */
  function confirmButton(label, sure, run) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small';
    b.textContent = t(label);
    let armed = 0;
    b.onclick = async () => {
      if (!armed) {
        b.textContent = t(sure);
        b.classList.add('danger');
        armed = setTimeout(() => { armed = 0; b.textContent = t(label); b.classList.remove('danger'); }, 4000);
        return;
      }
      clearTimeout(armed);
      b.disabled = true;
      await run();
    };
    return b;
  }

  async function render() {
    const list = $('memoryList');
    const total = $('memoryTotal');
    list.textContent = t('Считаю…');
    total.textContent = '';
    const groups = await measure();
    list.textContent = '';
    groups.filter((g) => g.keys.length).forEach((g) => {
      const row = document.createElement('div');
      row.className = 'memory-row';
      const head = document.createElement('div');
      head.className = 'memory-head';
      const name = document.createElement('b');
      name.textContent = t(g.name);
      const size = document.createElement('span');
      size.textContent = fmt(g.bytes);
      head.append(name, size);
      row.append(head);
      if (g.id === 'vlog') {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = `${t('Клипов в ролике')}: ${g.clips}. ${t('Сохрани ролик файлом, прежде чем очищать.')}`;
        row.append(p, confirmButton('Очистить влог', 'Точно удалить все клипы? Нажми ещё раз', async () => {
          for (const k of g.keys) await Store.del(k);
          if (window.Vlog && window.Vlog.reset) await window.Vlog.reset();
          render();
        }));
      } else if (g.note) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = t(g.note);
        row.append(p);
      }
      list.append(row);
    });
    if (!list.children.length) list.textContent = t('Пока ничего не сохранено.');

    /* всего у сайта и сколько браузер готов дать; «постоянная» память не чистится браузером сама */
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate().catch(() => null) : null;
    const kept = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
    if (est && est.quota) {
      const line = document.createElement('p');
      line.textContent = `${t('Занято')} ${fmt(est.usage || 0)} ${t('из примерно')} ${fmt(est.quota)}`;
      const bar = document.createElement('progress');
      bar.max = 1;
      bar.value = Math.min(1, (est.usage || 0) / est.quota);
      total.append(line, bar);
    }
    if (!kept) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = t('Браузер может сам стереть эту память, если на устройстве кончится место. Добавь Lunajour на главный экран, тогда она надёжнее.');
      total.append(p);
    }
  }

  function open() {
    $('memorySheet').showModal();
    render();
  }

  function bind() {
    $('memoryBtn').onclick = () => {
      const menu = $('moreMenu');
      if (menu) { menu.hidden = true; $('moreBtn').setAttribute('aria-expanded', 'false'); $('moreBtn').classList.remove('primary'); }
      open();
    };
    $('memoryClose').onclick = () => $('memorySheet').close();
  }
  bind();

  return { open, measure };
})();
