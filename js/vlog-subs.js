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

  /* lang: '' — язык определит сама модель; иначе 'russian', 'english' и т. п.
     → [{ start, end, text }] в мс, уже порезанные на строки субтитров */
  async function transcribe(buf, lang, onProgress) {
    const pipe = await load((k) => onProgress('load', k));
    onProgress('run', 0);
    const audio = await to16k(buf);
    const out = await pipe(audio, {
      ...(lang ? { language: lang } : {}),
      task: 'transcribe',
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const chunks = (out.chunks || []).map((c) => ({
      start: Math.round((c.timestamp[0] ?? 0) * 1000),
      end: Math.round((c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 2) * 1000),
      text: c.text || '',
    }));
    return window.VlogData.subLines(chunks, 42);
  }

  return { transcribe, MODEL_MB };
})();
