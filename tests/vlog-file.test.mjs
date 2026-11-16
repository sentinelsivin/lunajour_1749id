// Влог файлом: сохранить и открыть обратно, новые номера файлов при открытии.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { VlogFile } = load('vlog-file.js');

const project = () => ({
  v: 1,
  ratio: '9:16',
  clips: [
    { id: 'c1', media: 'a', kind: 'image', in: 0, out: 3000, speed: 1, shape: { motif: 'own-mask', mask: 'mask' } },
    { id: 'c2', media: 'b', kind: 'video', in: 0, out: 2000, speed: 1 },
  ],
  overlays: [{ id: 'o1', start: 0, end: 1000, layer: { type: 'sticker', img: 'st' } }, { id: 'o2', start: 0, end: 1000, layer: { type: 'text', text: 'hi' } }],
  media: {
    a: { id: 'a', kind: 'image' }, b: { id: 'b', kind: 'video' }, st: { id: 'st', kind: 'sticker' },
    mask: { id: 'mask', kind: 'mask' }, mus: { id: 'mus', kind: 'audio' },
  },
  music: { track: '', fileId: 'mus', vol: 80 },
});
const blobs = {
  a: new Blob(['фото-а'], { type: 'image/png' }),
  b: new Blob([new Uint8Array(70000).fill(7)], { type: 'video/mp4' }),
  st: new Blob(['стикер'], { type: 'image/png' }),
  mask: new Blob(['маска']),
  mus: new Blob(['музыка'], { type: 'audio/mpeg' }),
};

test('сохранить и открыть: проект, название и все файлы те же', async () => {
  const file = await VlogFile.pack(project(), 'Поездка', async (id) => blobs[id] || null);
  const back = await VlogFile.unpack(new File([file], 'x.lunavlog'));
  assert.equal(back.name, 'Поездка');
  assert.deepEqual(back.project, project());
  assert.equal(back.files.length, 5);
  for (const f of back.files) {
    assert.deepEqual(new Uint8Array(await f.blob.arrayBuffer()), new Uint8Array(await blobs[f.id].arrayBuffer()), f.id);
    assert.equal(f.blob.type, blobs[f.id].type);
  }
});

test('файла нет в памяти: влог всё равно сохраняется без него', async () => {
  const file = await VlogFile.pack(project(), '', async (id) => (id === 'b' ? null : blobs[id]));
  const back = await VlogFile.unpack(file);
  assert.deepEqual(back.files.map((f) => f.id).sort(), ['a', 'mask', 'mus', 'st']);
});

test('чужой или обрезанный файл не открывается', async () => {
  await assert.rejects(VlogFile.unpack(new Blob(['просто текст, а не влог'])));
  const file = await VlogFile.pack(project(), '', async (id) => blobs[id]);
  await assert.rejects(VlogFile.unpack(file.slice(0, file.size - 10)));
});

test('новые номера файлов: все ссылки проекта переходят на них', () => {
  const map = { a: 'A', b: 'B', st: 'ST', mask: 'MASK', mus: 'MUS' };
  const q = VlogFile.remap(project(), map);
  assert.deepEqual(Object.keys(q.media).sort(), ['A', 'B', 'MASK', 'MUS', 'ST']);
  assert.equal(q.media.A.id, 'A');
  assert.deepEqual(q.clips.map((c) => c.media), ['A', 'B']);
  assert.equal(q.clips[0].shape.mask, 'MASK');
  assert.equal(q.overlays[0].layer.img, 'ST');
  assert.equal(q.overlays[1].layer.img, undefined);
  assert.equal(q.music.fileId, 'MUS');
  /* исходный проект не меняется */
  assert.equal(project().clips[0].media, 'a');
});
