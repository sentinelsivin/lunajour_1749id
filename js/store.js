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
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  window.Store = {
    get: (key) => run('readonly', (s) => s.get(key)).catch(() => null),
    set: (key, value) => run('readwrite', (s) => s.put(value, key)).catch(() => null),
    del: (key) => run('readwrite', (s) => s.delete(key)).catch(() => null),
  };
})();
