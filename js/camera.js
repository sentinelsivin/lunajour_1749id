/* Работа с камерой: поток, снимок, запись клипа, вспышка. */
(function () {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');

  let stream = null;
  let facing = 'environment';
  let torchOn = false;

  /* Instagram не принимает webm, поэтому mp4 идёт первым, если браузер умеет его писать. */
  function videoMime() {
    const list = ['video/mp4;codecs=avc1.42E01F', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  const track = () => (stream ? stream.getVideoTracks()[0] : null);

  function stop() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    torchOn = false;
    video.srcObject = null;
  }

  async function start() {
    stop();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('unsupported');
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    video.srcObject = stream;
    await video.play();
    if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadeddata', r, { once: true }));
    return { kind: 'live', el: video, sw: video.videoWidth, sh: video.videoHeight };
  }

  async function switchFacing() {
    facing = facing === 'user' ? 'environment' : 'user';
    return start();
  }

  function snapshot() {
    const c = window.Render.canvas(video.videoWidth, video.videoHeight);
    c.getContext('2d').drawImage(video, 0, 0);
    return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
  }

  function canTorch() {
    const t = track();
    return !!(t && t.getCapabilities && t.getCapabilities().torch);
  }

  async function toggleTorch() {
    torchOn = !torchOn;
    await track().applyConstraints({ advanced: [{ torch: torchOn }] });
    return torchOn;
  }

  /* Пишет клип до ms миллисекунд; вернёт объект с .stop() и обещанием .done с файлом. */
  function record(ms) {
    const mimeType = videoMime();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType }));
    });
    rec.start();
    const timer = setTimeout(() => rec.state !== 'inactive' && rec.stop(), ms);
    return {
      done,
      stop() {
        clearTimeout(timer);
        if (rec.state !== 'inactive') rec.stop();
      },
    };
  }

  window.Camera = {
    start, stop, switchFacing, snapshot, canTorch, toggleTorch, record, videoMime,
    get active() { return !!stream; },
    get mirrored() { return facing === 'user'; },
  };
})();
