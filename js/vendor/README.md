Сторонний код без изменений.

- mediapipe/: MediaPipe Tasks Vision 1.2.0 (https://github.com/google-ai-edge/mediapipe), лицензия Apache-2.0: vision_bundle.mjs и wasm/vision_wasm_internal.* из npm-пакета @mediapipe/tasks-vision, модель selfie_segmenter.tflite (float16) из хранилища моделей MediaPipe. Находит человека для автообводки (js/outline.js), грузится только по кнопке «Обвести человека». Служебную статистику библиотеки js/outline.js в сеть не пускает.
- mediabunny.min.mjs: mediabunny 1.64.0 (https://github.com/Vanilagy/mediabunny), лицензия MPL-2.0, текст в mediabunny.LICENSE.txt. Читает видео кадр за кадром и собирает MP4 для быстрой записи влога (js/vlog-fast.js). Грузится только при сохранении ролика.
