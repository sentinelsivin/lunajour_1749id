/* Влог: субтитры из речи. Распознаёт Whisper прямо в браузере (transformers.js, WebAssembly):
   звук никуда не отправляется, из сети скачивается только сама модель, один раз (дальше она в кэше браузера).
   Библиотека и модель грузятся только по кнопке «Сделать субтитры». */
window.VlogSubs = (function () {
  const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js';
  const MODEL = 'onnx-community/whisper-base';
  /* примерный размер модели для предупреждения */
  const MODEL_MB = 80;
  const SR = 16000;

  let asr = null;
  function load(onProgress) {
    if (!asr) {
      const files = new Map();
      asr = import(LIB).then((T) => {
        T.env.allowLocalModels = false;
        return T.pipeline('automatic-speech-recognition', MODEL, {
          dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
          device: 'wasm',
          progress_callback: (e) => {
            if (e.status !== 'progress' || !e.total) return;
            files.set(e.file, [e.loaded, e.total]);
            let got = 0;
            let all = 0;
            files.forEach(([l, tt]) => { got += l; all += tt; });
            onProgress(all ? got / all : 0);
          },
        });
      }).catch((err) => { asr = null; throw err; });
    }
    return asr;
  }

  /* AudioBuffer → 16 кГц моно, как ждёт Whisper */
  async function to16k(buf) {
    const n = Math.max(1, Math.ceil(buf.duration * SR));
    const oc = new OfflineAudioContext(1, n, SR);
    const s = oc.createBufferSource();
    s.buffer = buf;
    s.connect(oc.destination);
    s.start(0);
    return (await oc.startRendering()).getChannelData(0);
  }

  /* Где в ролике речь: громкость по кусочкам 20 мс, порог от громкости самой речи (как в «Без пауз»).
     → [{ from, to }] в мс. Модель сама ставит время неточно, особенно после тишины, поэтому время берём отсюда. */
  function speechRegions(audio) {
    const STEP = 20;
    const per = Math.round((SR * STEP) / 1000);
    const level = [];
    for (let i = 0; i < audio.length; i += per) {
      let sum = 0;
      const e = Math.min(audio.length, i + per);
      for (let j = i; j < e; j++) sum += audio[j] * audio[j];
      level.push(Math.sqrt(sum / Math.max(1, e - i)));
    }
    const sorted = [...level].sort((x, y) => x - y);
    const loud = sorted[Math.floor(sorted.length * 0.95)] || 0;
    if (loud < 0.003) return [];
    return window.VlogData.keepRanges(level, STEP, { threshold: Math.max(0.003, loud * 0.1), minGap: 700, pad: 150, minKeep: 250 });
  }

  /* lang: '' — язык определит сама модель; иначе 'russian', 'english' и т. п.
     → [{ start, end, text }] в мс, уже порезанные на строки субтитров */
  async function transcribe(buf, lang, onProgress) {
    const pipe = await load((k) => onProgress('load', k));
    onProgress('run', 0);
    const audio = await to16k(buf);
    const regions = speechRegions(audio);
    const out = [];
    for (let k = 0; k < regions.length; k++) {
      const r = regions[k];
      const part = audio.subarray(Math.floor((r.from / 1000) * SR), Math.ceil((r.to / 1000) * SR));
      const res = await pipe(part, {
        ...(lang ? { language: lang } : {}),
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const chunks = res.chunks || [{ timestamp: [0, (r.to - r.from) / 1000], text: res.text }];
      if (r.to - r.from <= 30000) {
        /* короткий кусок: текст целиком на время куска, строки по числу знаков */
        out.push({ start: r.from, end: r.to, text: chunks.map((c) => c.text || '').join(' ') });
      } else {
        chunks.forEach((c) => {
          const s = r.from + (c.timestamp[0] ?? 0) * 1000;
          const e = r.from + (c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 2) * 1000;
          out.push({ start: Math.max(r.from, s), end: Math.min(r.to, e), text: c.text || '' });
        });
      }
      onProgress('run', (k + 1) / regions.length);
    }
    return window.VlogData.subLines(out, 42);
  }

  return { transcribe, MODEL_MB };
})();
