/* Влог файлом: весь проект вместе с клипами, фото, музыкой и картинками в одном файле .lunavlog.
   Нужен как резервная копия (всё остальное живёт только в памяти браузера) и чтобы перенести влог на другое устройство.
   Устройство файла: «LUNAVLOG1\n», 4 байта длины заголовка, заголовок JSON, потом файлы подряд.
   Файлы не читаются в память целиком: при открытии каждый берётся кусочком файла (slice), большие видео тоже. */
(function (root) {
  const MAGIC = 'LUNAVLOG1\n';
  const EXT = 'lunavlog';

  /* все ссылки проекта на файлы: клипы, картинки-стикеры, своя фигура, своя музыка, озвучка */
  function mediaIds(p) {
    return Object.keys(p.media || {});
  }

  /* Новые номера файлов при открытии: если открыть тот же влог дважды, у копий не должно быть общих файлов,
     иначе удаление одной копии стёрло бы клипы другой. map: старый номер → новый. */
  function remap(p, map) {
    const id = (v) => (v && map[v]) || v;
    const q = JSON.parse(JSON.stringify(p));
    q.media = {};
    Object.entries(p.media || {}).forEach(([k, m]) => { q.media[id(k)] = { ...m, id: id(k) }; });
    q.clips.forEach((c) => {
      c.media = id(c.media);
      if (c.shape && c.shape.mask) c.shape.mask = id(c.shape.mask);
    });
    (q.overlays || []).forEach((o) => {
      if (o.layer && o.layer.img) o.layer.img = id(o.layer.img);
      if (o.layer && o.layer.media) o.layer.media = id(o.layer.media);
    });
    if (q.music && q.music.fileId) q.music.fileId = id(q.music.fileId);
    return q;
  }

  /* blobOf(id) → Blob файла или null (такой файл в влоге пропускаем, клип останется без картинки) */
  async function pack(p, name, blobOf) {
    const files = [];
    const parts = [];
    for (const id of mediaIds(p)) {
      const b = await blobOf(id);
      if (!b) continue;
      files.push({ id, size: b.size, type: b.type || '' });
      parts.push(b);
    }
    const head = new TextEncoder().encode(JSON.stringify({ v: 1, name: name || '', project: p, files }));
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, head.length, true);
    return new Blob([MAGIC, len, head, ...parts], { type: 'application/octet-stream' });
  }

  /* → { name, project, files: [{ id, blob }] }; ошибка, если это не файл влога */
  async function unpack(file) {
    const magicLen = MAGIC.length;
    const start = new Uint8Array(await file.slice(0, magicLen + 4).arrayBuffer());
    if (new TextDecoder().decode(start.slice(0, magicLen)) !== MAGIC) throw new Error('not a vlog file');
    const headLen = new DataView(start.buffer).getUint32(magicLen, true);
    const headAt = magicLen + 4;
    const head = JSON.parse(new TextDecoder().decode(await file.slice(headAt, headAt + headLen).arrayBuffer()));
    if (!head || head.v !== 1 || !head.project || !Array.isArray(head.project.clips)) throw new Error('bad vlog file');
    let at = headAt + headLen;
    const files = head.files.map((f) => {
      const blob = file.slice(at, at + f.size, f.type);
      at += f.size;
      return { id: f.id, blob };
    });
    if (at > file.size) throw new Error('vlog file is cut');
    return { name: head.name || '', project: head.project, files };
  }

  root.VlogFile = { pack, unpack, remap, EXT };
})(typeof window !== 'undefined' ? window : globalThis);
