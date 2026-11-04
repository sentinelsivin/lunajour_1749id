/* Языки интерфейса. Ключ перевода это сам русский текст: если перевода нет, остаётся русский.
   Новая строка в интерфейсе: пиши её по-русски, в коде оборачивай в t(), а перевод добавляй в EN. */
window.I18n = (function () {
  const EN = {
    /* съёмка */
    'пример': 'sample',
    'Пример': 'Sample',
    'Карточка на весь экран': 'Card full screen',
    'Панель на весь экран': 'Panel full screen',
    'Режим съёмки': 'Capture mode',
    'Фото': 'Photo',
    'Видео 5 с': 'Video 5 s',
    'Будка': 'Booth',
    'Галерея': 'Gallery',
    'Снять': 'Shoot',
    'Камера': 'Camera',
    'Вспышка': 'Flash',
    'Новый снимок': 'New shot',
    'Готово': 'Done',
    'Карточка': 'Card',

    /* вкладки */
    'Настройки карточки': 'Card settings',
    'Фигуры': 'Shapes',
    'Бумага': 'Paper',
    'Кадр': 'Crop',
    'Цвет': 'Colour',
    'Подпись': 'Caption',
    'Формат': 'Format',

    /* фигуры */
    'Своё слово': 'Your word',
    'Загрузить картинку для выреза': 'Upload a cut-out image',
    'Подойдёт PNG с прозрачностью или чёрная фигура на белом фоне.': 'Use a transparent PNG or a black shape on white.',
    'Добавить фигуру': 'Add a shape',
    'Перетаскивай фигуры прямо на карточке. Нажми на фигуру, чтобы изменить её размер и поворот.': 'Drag shapes right on the card. Tap a shape to change its size and rotation.',
    'Размер фигуры': 'Shape size',
    'Поворот': 'Rotation',
    'Копия': 'Copy',
    'Удалить': 'Delete',
    'Очистить': 'Clear',
    'Перемешать': 'Shuffle',
    'Размер': 'Size',
    'Плотность': 'Density',
    'Фото вокруг фигур': 'Photo around shapes',
    'Края': 'Edges',
    'Ровные': 'Clean',
    'Тень': 'Shadow',
    'Наоборот: фигуры закрывают фото': 'Reverse: shapes cover the photo',
    'В этом шрифте только латиница.': 'This font has Latin letters only.',
    'В этом шрифте только кириллица.': 'This font has Cyrillic letters only.',

    /* бумага */
    'Загрузить свой фон': 'Upload your background',
    'Цвет бумаги': 'Paper colour',
    'Свой цвет': 'Custom colour',
    'Гладкая': 'Plain',
    'Кружево': 'Lace',
    'Мятая': 'Crumpled',
    'Мятая клетка': 'Crumpled grid',
    'Вязание': 'Crochet',
    'Мятая в точку': 'Crumpled dots',
    'Дамаск': 'Damask',
    'Цветение': 'Blossom',
    'Крафт': 'Kraft',
    'В клетку': 'Grid',
    'В линейку': 'Lined',
    'Своя картинка': 'Your image',
    'Ночь': 'Night',

    /* кадр и цвет */
    'Двигай снимок прямо на карточке. На компьютере масштаб меняется колесом мыши.': 'Drag the photo right on the card. On a computer, zoom with the mouse wheel.',
    'Какой снимок': 'Which photo',
    'Первый': 'First',
    'Второй': 'Second',
    'Влево и вправо': 'Left and right',
    'Вверх и вниз': 'Up and down',
    'Масштаб': 'Zoom',
    'Отразить': 'Mirror',
    'Сбросить': 'Reset',
    'Яркость': 'Brightness',
    'Контраст': 'Contrast',
    'Насыщенность': 'Saturation',
    'Теплота': 'Warmth',
    'Зерно': 'Grain',
    'Сбросить цвет': 'Reset colour',

    /* подпись */
    'Место': 'Place',
    'Дата': 'Date',
    'Штамп настроения': 'Mood stamp',
    'Шрифт': 'Font',
    'Цвет текста': 'Text colour',
    'Авто': 'Auto',
    'Обычный': 'Regular',
    'От руки': 'Handwritten',
    'Журнал': 'Magazine',
    'Машинка': 'Typewriter',
    'Плакат': 'Poster',

    /* формат */
    'Где лежит бумага': 'Where the paper goes',
    'Снизу': 'Below',
    'Сверху': 'Above',
    'Слева': 'Left',
    'Справа': 'Right',
    'Только бумага': 'Paper only',
    'Только фото': 'Photo only',
    'Размер карточки': 'Card size',

    /* экспорт */
    'Куда отправить карточку': 'Where should the card go?',
    'Закрыть': 'Close',
    'Сохранить карточку': 'Save card',
    'Сохранить для сторис 9:16': 'Save for Stories 9:16',
    'Сохранить видео 5 с': 'Save 5 s video',
    'Поделиться': 'Share',
    'Собираю файл…': 'Preparing the file…',
    'Файл сохранён в загрузки.': 'Saved to your downloads.',
    'Этот браузер не умеет записывать видео. Сохрани карточку как картинку.': 'This browser can’t record video. Save the card as an image.',
    'Не получилось поделиться. Сохрани файл и отправь его вручную.': 'Sharing failed. Save the file and send it yourself.',
    'Записываю видео': 'Recording video',

    /* сообщения */
    'Нет доступа к камере. Разреши его в настройках браузера или загрузи фото.': 'No camera access. Allow it in your browser settings or upload a photo.',
    'Камера не запустилась. Загрузи фото из галереи.': 'The camera didn’t start. Upload a photo from your gallery.',
    'Для будки нужны фотографии.': 'The booth needs photos.',
    'Осталось выбрать второй снимок.': 'Now pick the second photo.',
    'Этот файл не открывается. Попробуй JPG, PNG или MP4.': 'This file won’t open. Try JPG, PNG or MP4.',
    'Эта картинка не открывается.': 'This image won’t open.',
    'Есть незаконченная карточка.': 'You have an unfinished card.',
    'Продолжить': 'Continue',
    'Черновик не открылся.': 'The draft didn’t open.',
    'Добавить': 'Add',
    'Язык': 'Language',

    /* категории */
    'Все': 'All',
    'Расставить': 'Arrange',
    'Звёзды': 'Stars',
    'Точки': 'Dots',
    'Природа': 'Nature',
    'Сердца': 'Hearts',
    'Окна': 'Windows',
    'Пиксели': 'Pixels',
    'Вышивка': 'Stitch',
    'Слова': 'Words',
    'Моё': 'Mine',

    /* символы */
    'Звезда': 'Star',
    'Искра': 'Sparkle',
    'Облако': 'Cloud',
    'Луна': 'Moon',
    'Сердце': 'Heart',

    /* названия фигур */
    'Своя раскладка': 'My layout',
    'Стайка': 'Little flock',
    'Ночной ливень': 'Night shower',
    'Россыпь': 'Scatter',
    'Вспышка': 'Flash',
    'Главная звезда': 'Main star',
    'Блёстки': 'Glitter',
    'Искры': 'Sparks',
    'Звёздная спираль': 'Star spiral',
    'Лёгкая спираль': 'Light spiral',
    'Звёздный венок': 'Star wreath',
    'Венок из искр': 'Spark wreath',
    'Лунный круг': 'Moon circle',
    'Полумесяц': 'Crescent',
    'Горох': 'Polka dots',
    'Пузыри': 'Bubbles',
    'Капель': 'Drip',
    'Прибой': 'Surf',
    'Кольца': 'Rings',
    'Планета': 'Planet',
    'Луг': 'Meadow',
    'Один цветок': 'One flower',
    'Листопад': 'Falling leaves',
    'Венок': 'Wreath',
    'Дождь': 'Rain',
    'Солнце': 'Sun',
    'Косяк рыб': 'School of fish',
    'Гроза': 'Storm',
    'Птичий круг': 'Bird circle',
    'Стая': 'Flock',
    'Снегопад': 'Snowfall',
    'Снежный венок': 'Snow wreath',
    'Облака': 'Clouds',
    'Облачный день': 'Cloudy day',
    'Сердечки': 'Little hearts',
    'Влюблённый дождь': 'Love rain',
    'Большое сердце': 'Big heart',
    'Обои': 'Wallpaper',
    'Марка': 'Stamp',
    'Плёнка': 'Film',
    'Арка': 'Arch',
    'Жалюзи': 'Blinds',
    'Шахматы': 'Checkers',
    'Три иллюминатора': 'Three portholes',
    'Осколки': 'Shards',
    'Пиксель-сердце': 'Pixel heart',
    'Кот': 'Cat',
    'Гриб': 'Mushroom',
    'Призрак': 'Ghost',
    'Улыбка': 'Smile',
    'Клетчатая спираль': 'Pixel spiral',
    'Звёзды и снежинки': 'Stars and snowflakes',
    'Сонные глаза': 'Sleepy eyes',
    'Птичка': 'Little bird',
    'Тюльпан': 'Tulip',
    'Вышитое сердце': 'Stitched heart',
    'Бабочка': 'Butterfly',
    'Бант': 'Bow',
    'Цветок': 'Flower',
    'Птица': 'Bird',
    'Своё слово, лентой': 'Your word, ribbon',
    'Своя фигура': 'Your shape',
  };

  const KEY = 'lunajour-lang';
  const saved = () => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  };
  let lang = saved() || ((navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en');

  const t = (ru) => (lang === 'en' ? EN[ru] ?? ru : ru);

  /* Текст из index.html запоминаем один раз, потом подставляем нужный язык. */
  const texts = [];
  const attrs = [];
  function capture() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const ru = walker.currentNode.nodeValue.trim();
      if (/[а-яё]/i.test(ru)) texts.push([walker.currentNode, ru]);
    }
    document.querySelectorAll('[aria-label],[title]').forEach((el) => {
      ['aria-label', 'title'].forEach((name) => {
        const ru = el.getAttribute(name);
        if (ru && /[а-яё]/i.test(ru)) attrs.push([el, name, ru]);
      });
    });
  }

  function apply() {
    document.documentElement.lang = lang;
    texts.forEach(([node, ru]) => { node.nodeValue = t(ru); });
    attrs.forEach(([el, name, ru]) => el.setAttribute(name, t(ru)));
  }

  function set(next) {
    lang = next;
    try { localStorage.setItem(KEY, next); } catch { /* язык просто не запомнится */ }
    apply();
  }

  return { t, capture, apply, set, EN, get lang() { return lang; } };
})();
