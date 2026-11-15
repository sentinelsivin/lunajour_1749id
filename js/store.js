/* Черновик хранится в памяти браузера на этом устройстве. Сервер не участвует. */
(function () {
  const DB = 'lunajour';
  const STORE = 'kv';

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function run(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onerror = () => { db.close(); reject(tx.error || req.error); };
      /* когда кончается место, транзакция не падает с ошибкой, а прерывается: без этого запись висела бы вечно */
      tx.onabort = () => { db.close(); reject(tx.error || new Error('aborted')); };
    });
  }

  /* Неудачная запись не должна проходить молча: иначе фото или клип пропадут только после перезагрузки.
     Экран сам решает, как сказать об этом (событие store-error). */
  const isFull = (err) => !!err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err.message || '')));
  function failed(key, err) {
    window.dispatchEvent(new CustomEvent('store-error', { detail: { key, full: isFull(err) } }));
    return false;
  }

  window.Store = {
    get: (key) => run('readonly', (s) => s.get(key)).catch(() => null),
    /* true, если сохранилось; false, если нет (тогда уже отправлено событие store-error) */
    set: (key, value) => run('readwrite', (s) => s.put(value, key)).then(() => true, (err) => failed(key, err)),
    del: (key) => run('readwrite', (s) => s.delete(key)).catch(() => null),
    /* все ключи: для экрана «Память», чтобы посчитать, что сколько занимает */
    keys: () => run('readonly', (s) => s.getAllKeys()).catch(() => []),
    isFull,
  };
})();
