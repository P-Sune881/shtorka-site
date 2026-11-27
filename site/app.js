/* =========================================================
   ШторКа — логика лендинга (чистый JS, без зависимостей)
   Блоки:
   0. CONFIG — контакты, адреса API (всё, что меняется, — здесь)
   1. ДАННЫЕ — товары, ткани, бизнес, кейсы, отзывы, подарки
   2. Утилиты
   3. Режим стекла (преломление / упрощённое), фон, шапка
   4. Интро-шторы и тост
   5. Модальные окна, мессенджеры
   6. Экран 2 — хиты
   7. Экран 3 — примерочная (ручная подгонка + нейросеть)
   8. Экран 4 — бизнес
   9. Экран 5 — кейсы до/после
   10. Экран 6 — отзывы
   11. Экран 7 — сертификаты, подарки
   12. Формы и sendLead()
   13. Появление при прокрутке, старт
   ========================================================= */
'use strict';

/* ---------- 0. CONFIG ---------- */
const CONFIG = {
  phones: [
    { raw: '+79246200022', label: '+7 924 620-00-22' },
    { raw: '+79149266771', label: '+7 914 926-67-71', note: 'WhatsApp, Telegram, MAX' },
  ],
  whatsapp: '79149266771',                // номер для wa.me без «+» (к нему привязаны WhatsApp, Telegram и MAX)
  telegram: 'annashtorka',                // username Telegram без «@»
  uds: 'https://shtorka38.uds.app/c/join?ref=cvdd3423', // приглашение в UDS салона (24.11); QR — assets/uds-qr.svg
  max: 'https://max.ru/u/f9LHodD0cOJmiBTZLYf_9ouiZjMFZZjEdf7Y4kJ_MbtwIXwkbE6iPU36UGU', // профиль Анны в MAX (из QR, 24.11); пустая строка скрывает кнопку MAX
  maps: {
    yandex: 'https://yandex.ru/maps/org/shtorka/1105311263/',
    gis: 'https://2gis.ru/irkutsk/firm/70000001036045798',
  },
  api: {
    // Серверный прокси (например, Yandex Cloud Function). Ключи нейросети и токен бота — ТОЛЬКО на сервере.
    refine: 'api/tryon.php',        // ИИ-примерка: POST → { ok, image: url } (локально — tools/serve.ps1, на хостинге — site/api/tryon.php)
    detectWindow: '/api/detect-window', // POST → { corners: [[x,y]×4] } в долях 0..1
    lead: '/api/lead',              // POST → { ok: true }
  },
  demoMode: true,          // true — сервера ещё нет: формы работают как имитация
  aiLive: true,            // true — «Сделать реалистично» идёт в настоящую нейросеть (Polza.ai, ~3 ₽ за раз); false — имитация
  demoPhoto: '',           // путь к демо-фото комнаты для примерочной, например 'assets/demo-room.jpg'
  showSampleMarks: false,       // отзывы с карт — настоящие
  showMessageSampleMarks: true, // «Написали нам лично» — пока образцы; выключить, когда вставим настоящие сообщения   // метка «образец» на отзывах-заглушках; выключить, когда вставите реальные отзывы
  toastDelay: 1200,        // через сколько мс после полной остановки штор показать «Дарим 1000 ₽»
};

/* ---------- 1. ДАННЫЕ ---------- */
// Хиты салона. Меняйте свободно: cat — curtains | bedding | plaids | kids; badge — hit | stock | kids | new
// Блок «Выбрать домашний текстиль»: 6–8 категорий. Настоящее фото — поле img: 'assets/textile/имя.webp' (≈600×750, до 60 КБ).
const TEXTILE = [
  { name: 'Постельное бельё',  photo: 'Фото: комплект постельного белья на кровати' },
  { name: 'Одеяла',            photo: 'Фото: сложенные одеяла' },
  { name: 'Подушки',           photo: 'Фото: подушки разных размеров' },
  { name: 'Пледы',             photo: 'Фото: плед на кресле' },
  { name: 'Покрывала',         photo: 'Фото: покрывало на заправленной кровати' },
  { name: 'Полотенца',         photo: 'Фото: стопка махровых полотенец' },
  { name: 'Детский текстиль',  photo: 'Фото: детский комплект в кроватке' },
  { name: 'Наматрасники',      photo: 'Фото: наматрасник на матрасе' }, // уточнить у клиента, есть ли в ассортименте
];

const PRODUCTS = [
  { cat: 'curtains', name: 'Портьеры блэкаут «Графит»', price: 4900, unit: 'за пару', badge: 'hit', photo: 'Фото: портьеры блэкаут графит в спальне', desc: 'Плотная ткань не пропускает свет — для спален и детских. Сошьём по вашим размерам за 5–7 дней.' },
  { cat: 'curtains', name: 'Тюль «Вуаль молочная»', price: 1900, unit: 'за пог. м', badge: 'stock', photo: 'Фото: молочный тюль на окне днём', desc: 'Лёгкая вуаль мягко рассеивает солнце и не утяжеляет окно. Хорошо сочетается с любыми портьерами.' },
  { cat: 'curtains', name: 'Римская штора из льна', price: 3800, unit: '', badge: 'new', photo: 'Фото: римская штора из льна на кухне', desc: 'Компактно собирается складками, не занимает подоконник. Отличный вариант для кухни и кабинета.' },
  { cat: 'curtains', name: 'Рулонная «День-ночь»', price: 2900, unit: '', badge: 'hit', photo: 'Фото: рулонная штора день-ночь на створке', desc: 'Чередующиеся полосы регулируют свет одним движением. Крепится на створку без сверления.' },
  { cat: 'bedding', name: 'Сатин «Морская соль», 2-сп.', price: 5900, unit: '', badge: 'hit', photo: 'Фото: комплект белья из сатина, бирюзовый', desc: 'Гладкий плотный сатин с мягким блеском, 100% хлопок. Не скатывается после стирок.' },
  { cat: 'bedding', name: 'Страйп-сатин, евро', price: 7400, unit: '', badge: 'stock', photo: 'Фото: белое бельё страйп-сатин в гостиничном стиле', desc: 'Тонкая полоска как в хорошем отеле. Белый и молочный цвета всегда в наличии.' },
  { cat: 'bedding', name: 'Варёный хлопок «Персик»', price: 6800, unit: '', badge: 'new', photo: 'Фото: бельё из варёного хлопка, персиковое', desc: 'Мягкая фактура с эффектом лёгкой небрежности — гладить не нужно.' },
  { cat: 'bedding', name: 'Набор махровых полотенец', price: 2400, unit: '3 шт.', badge: 'stock', photo: 'Фото: стопка махровых полотенец', desc: 'Плотная махра 500 г/м², хорошо впитывает. Можно собрать набор в один цвет с бельём.' },
  { cat: 'plaids', name: 'Плед крупной вязки', price: 3900, unit: '', badge: 'hit', photo: 'Фото: плед крупной вязки на кресле', desc: 'Объёмная вязка, тёплый и лёгкий. Любимый подарок на новоселье.' },
  { cat: 'plaids', name: 'Покрывало стёганое «Лён»', price: 6500, unit: '', badge: 'stock', photo: 'Фото: стёганое покрывало на кровати', desc: 'Защищает бельё днём и делает спальню собранной. Размеры от 160×220 до 240×260.' },
  { cat: 'plaids', name: 'Одеяло всесезонное', price: 4300, unit: '', badge: 'new', photo: 'Фото: одеяло всесезонное в чехле', desc: 'Средняя теплота: не жарко летом и уютно зимой. Гипоаллергенный наполнитель.' },
  { cat: 'plaids', name: 'Плед из микрофибры', price: 2200, unit: '', badge: 'stock', photo: 'Фото: мягкий плед из микрофибры на диване', desc: 'Очень мягкий, быстро сохнет. 12 цветов в салоне.' },
  { cat: 'kids', name: 'Детский комплект, сатин', price: 3900, unit: '1,5-сп.', badge: 'kids', photo: 'Фото: детское бельё с рисунком', desc: 'Нежный сатин и спокойные рисунки. Подходит для чувствительной кожи.' },
  { cat: 'kids', name: 'Шторы в детскую «Звёзды»', price: 4200, unit: 'за пару', badge: 'kids', photo: 'Фото: шторы со звёздами в детской', desc: 'Блэкаут для дневного сна и рисунок, который понравится ребёнку.' },
  { cat: 'kids', name: 'Плед для новорождённых', price: 2100, unit: '', badge: 'kids', photo: 'Фото: вязаный плед для новорождённого', desc: 'Хлопковая вязка, подходит для выписки и прогулок.' },
  { cat: 'kids', name: 'Полотенце-пончо', price: 1800, unit: '', badge: 'hit', photo: 'Фото: детское полотенце-пончо с капюшоном', desc: 'С капюшоном — удобно после ванны и бассейна.' },
];
const BADGES = { hit: ['Хит', ''], stock: ['Есть в салоне', 'badge--stock'], kids: ['Детям', 'badge--kids'], new: ['Новинка', 'badge--new'] };

// Ткани для примерочной: kind — linen | velvet | blackout | jacquard | sheer
const FABRICS = [
  { id: 'milk', name: 'Лён молочный', color: '#EDE6DA', kind: 'linen' },
  { id: 'sand', name: 'Лён песочный', color: '#CDB89A', kind: 'linen' },
  { id: 'sage', name: 'Шалфей', color: '#9EB39C', kind: 'linen' },
  { id: 'teal', name: 'Бархат бирюза', color: '#1F5C5A', kind: 'velvet' },
  { id: 'emerald', name: 'Бархат изумруд', color: '#24533E', kind: 'velvet' },
  { id: 'terracotta', name: 'Бархат терракота', color: '#A65A3A', kind: 'velvet' },
  { id: 'graphite', name: 'Блэкаут графит', color: '#4A4E52', kind: 'blackout' },
  { id: 'navy', name: 'Блэкаут синий', color: '#2B3A55', kind: 'blackout' },
  { id: 'peach', name: 'Жаккард персик', color: '#E9C2A6', kind: 'jacquard' },
  { id: 'grey', name: 'Жаккард серый', color: '#B4B6B3', kind: 'jacquard' },
  { id: 'cream', name: 'Сатин кремовый', color: '#F3EBDD', kind: 'blackout' },
];
const TULLE_COLOR = '#FBFAF6';

// Для бизнеса — данные прайс-окна. ВСЕ ЦЕНЫ И ТЕКСТЫ — ЗАГЛУШКИ, уточнить у клиента
// Для бизнеса: по нажатию — кейс (описание + фото). ПОКА ЗАГЛУШКИ: заменить на реальные объекты и фото салона.
const BUSINESS = {
  cafe: {
    tag: 'Кафе и рестораны', title: 'Кофейня: римские шторы и салфетки в цвет логотипа',
    desc: 'Небольшая кофейня на шесть окон: солнце слепило гостей у витрины, а интерьеру не хватало фирменного цвета. Сшили римские шторы из плотного льна и салфетки в тон логотипа.',
    did: ['6 римских штор точно по размерам окон', 'Салфетки и дорожки на столы в фирменном цвете', 'Навеска рано утром — кофейня не закрывалась'],
    photos: ['Фото: зал кофейни с римскими шторами', 'Фото: салфетки в цвет логотипа', 'Фото: витрина днём'],
  },
  office: {
    tag: 'Офисы', title: 'IT-офис: 24 рулонные шторы за выходные',
    desc: 'В open space мониторы ловили блики, а переговорной нужна была темнота для презентаций. Поставили рулонные шторы «день-ночь» в зале и блэкаут в переговорной — всё за одни выходные.',
    did: ['24 рулонные шторы «день-ночь» на створки', 'Блэкаут в переговорной для проектора', 'Монтаж в выходные — без помех для работы'],
    photos: ['Фото: open space с рулонными шторами', 'Фото: переговорная с блэкаутом', 'Фото: штора на створке крупно'],
  },
  hotel: {
    tag: 'Гостиницы и хостелы', title: 'Мини-отель: номера в одной стилистике',
    desc: 'Мини-отелю на 12 номеров нужно было обновить текстиль перед сезоном. Подобрали шторы, покрывала, бельё и полотенца в единой гамме и отшили одной партией с запасом на смену.',
    did: ['Шторы блэкаут для крепкого сна гостей', 'Комплекты белья и полотенца с запасом на ротацию', 'Покрывала в одной гамме для всех номеров'],
    photos: ['Фото: номер мини-отеля после обновления', 'Фото: стопка белья и полотенец', 'Фото: покрывало и шторы в номере'],
  },
  salon: {
    tag: 'Салоны и клиники', title: 'Салон красоты: шторы и полотенца для кабинетов',
    desc: 'Салону нужны были лёгкие шторы для зала и плотные — для кабинетов, где важна приватность. Добавили полотенца, которые выдерживают частые стирки.',
    did: ['Лёгкий тюль в зал ожидания', 'Плотные шторы в кабинеты', 'Полотенца для ежедневной смены'],
    photos: ['Фото: зал салона со светлым тюлем', 'Фото: кабинет с плотными шторами', 'Фото: полотенца на полке'],
  },
  gifts: {
    tag: 'Корпоративные подарки', title: 'Новогодние наборы для сотрудников',
    desc: 'Компании нужны были тёплые подарки для команды. Собрали наборы из пледа и полотенец, упаковали в коробки с открыткой.',
    did: ['Пледы и полотенца в едином стиле', 'Упаковка и открытка в каждом наборе', 'Доставка к офису к нужной дате'],
    photos: ['Фото: подарочный набор в коробке', 'Фото: плед и полотенца крупно', 'Фото: наборы перед отправкой'],
  },
};

// Сложные окна: по нажатию — фото и короткое описание (фото пока заглушки)
const WINDOWS = {
  erker: {
    tag: 'Сложные окна', title: 'Шторы для эркера',
    desc: 'Карниз повторяет форму эркера или ставится отдельно на каждую грань — ткань идёт ровно, без провисаний на стыках.',
    did: ['Гнутый или составной карниз по замеру', 'Портьеры и тюль единым полотном или по секциям', 'Подхваты, чтобы открыть каждое окно'],
    photos: ['Фото: эркер в гостиной со шторами', 'Фото: карниз на углу эркера', 'Фото: эркер со шторами на подхватах'],
  },
  attic: {
    tag: 'Сложные окна', title: 'Шторы для мансардных окон',
    desc: 'На наклонном окне обычная штора отвисает. Ставим шторы с фиксацией сверху и снизу — они держат наклон и легко открываются.',
    did: ['Плиссе и рулонные шторы с направляющими', 'Блэкаут для спальни под крышей', 'Удобное управление даже высоко'],
    photos: ['Фото: мансардное окно со шторой плиссе', 'Фото: спальня под крышей', 'Фото: фиксация шторы на наклоне'],
  },
  panorama: {
    tag: 'Сложные окна', title: 'Шторы для панорамных окон',
    desc: 'Окна от пола до потолка: шьём длинные полотна без заметных швов и подбираем потолочный карниз, который выдержит вес ткани.',
    did: ['Потолочный карниз под длинные полотна', 'Плотные портьеры и лёгкий тюль в паре', 'Длина точно до пола'],
    photos: ['Фото: гостиная с панорамным окном', 'Фото: портьеры от потолка до пола', 'Фото: тюль на панорамном окне днём'],
  },
  arch: {
    tag: 'Сложные окна', title: 'Шторы для арочных окон',
    desc: 'Повторяем изгиб арки: кроим полотно по шаблону или крепим ткань так, чтобы красивый верх окна оставался открытым.',
    did: ['Крой по шаблону арки', 'Римские и австрийские шторы', 'Подхваты для открытой арки'],
    photos: ['Фото: арочное окно со шторами', 'Фото: крой по форме арки крупно', 'Фото: арка с подхватами'],
  },
  custom: {
    tag: 'Сложные окна', title: 'Окна нестандартных размеров',
    desc: 'Узкие, очень широкие, угловые или с выступами — замеряем на месте и шьём точно по размерам, без «почти подошло».',
    did: ['Замер с образцами тканей', 'Пошив под любую ширину и высоту', 'Крепление под вашу стену и потолок'],
    photos: ['Фото: узкое высокое окно со шторой', 'Фото: угловое окно', 'Фото: очень широкое окно в зале'],
  },
};

// Кейсы до/после (10 шт.). price/term — необязательные поля, сейчас скрыты (showMeta: false)
const CASES = [
  { room: 'Спальня', district: 'Свердловский район', type: 'римские + тюль', price: '', term: '' },
  { room: 'Гостиная', district: 'Октябрьский район', type: 'портьеры + тюль', price: '', term: '' },
  { room: 'Детская', district: 'мкр. Университетский', type: 'блэкаут + тюль', price: '', term: '' },
  { room: 'Кухня', district: 'Правобережный район', type: 'римская штора', price: '', term: '' },
  { room: 'Эркер в гостиной', district: 'мкр. Солнечный', type: 'портьеры на гибком карнизе', price: '', term: '' },
  { room: 'Кабинет', district: 'Ленинский район', type: 'рулонные «день-ночь»', price: '', term: '' },
  { room: 'Мансарда', district: 'пос. Маркова', type: 'шторы на мансардные окна', price: '', term: '' },
  { room: 'Панорамное окно', district: 'мкр. Юбилейный', type: 'тюль на всю стену', price: '', term: '' },
  { room: 'Спальня', district: 'мкр. Первомайский', type: 'портьеры блэкаут', price: '', term: '' },
  { room: 'Кофейня', district: 'центр', type: 'римские шторы для бизнеса', price: '', term: '' },
];
const CASES_SHOW_META = false;

// Отзывы — ОБРАЗЦЫ. Заменить на реальные отзывы с карточек Яндекса и 2ГИС
// Настоящие отзывы с оценкой 5 ★, самые свежие (2ГИС и Яндекс Карты, ноябрь 2026). По просьбе клиента — только имена.
// На Яндексе отзывов за 2026 год с текстом нашёлся один — остальные свежие из 2025 и конца 2024.
// Настоящие отзывы с площадок (собраны 27.11.2026). В каждой четвёрке 3 женщины и 1 мужчина.
// Сначала видны первые 4, остальные — по кнопке «Показать ещё».
const REVIEWS = {
  yandex: [
    { name: 'Ирина', date: 'июль 2026', stars: 5, text: 'Хороший выбор, быстро нашла, что искала, быстро и качественно сшили на заказ 👌' },
    { name: 'Елена', date: 'февраль 2025', stars: 5, text: 'Индивидуальный подход. Отличное качество изделий. Был пошив покрывала и штор в две комнаты. Сделали всё быстро, были на связи, когда возникали вопросы по дизайну. Есть система скидок и сертификаты на приятную скидку до 20%.' },
    { name: 'Ксю', date: 'февраль 2025', stars: 5, text: 'Очень качественные современные ткани. Продавцы грамотные и отзывчивые, помогли выбрать подходящую ткань, рассчитали размер портьер, учли все мои пожелания. Профессиональные мастера. Очень довольна. Рекомендую.' },
    { name: 'Алексей', date: 'июль 2019', stars: 5, text: 'Отличный салон, цены мне очень понравились, продавец приятный, заказал шторы.' },
    { name: 'Лилия', date: 'декабрь 2024', stars: 5, text: 'Очень качественные и хорошие шторы, брали на кухню, помогли выбрать цвет, фасон. Консультант — настоящий специалист, общительный. Обязательно вернёмся ещё раз 😉' },
    { name: 'Анна', date: 'февраль 2020', stars: 5, text: 'Заказывали шторы в спальню и гостиную. Ассортимент хороший — нашли то, что нам подходит, без проблем. Пошили шторы за 4 дня, аккуратно и точно в размер. Цены невысокие, рекомендую.' },
    { name: 'Екатерина', date: 'январь 2023', stars: 5, text: 'Купила себе новую подушку, ну очень клёвая, качество отличное, недорого, очень понравилось сочетание плотности и мягкости. Спасибо, помогли с выбором!' },
    { name: 'Павел', date: 'июнь 2023', stars: 5, text: 'Большой ассортимент, приветливая продавщица.' },
    { name: 'Алёна', date: 'август 2023', stars: 5, text: 'Магазин порадовал ассортиментом и доступными ценами. Купили постельное бельё из сатина и остались очень довольны: сшито качественно, ткань плотная, при стирке не линяет, полностью соответствует размерам. Комплект упакован в красивую коробку — идеальный вариант на подарок! Отдельное спасибо продавцу: очень доброжелательная, всё показала и объяснила.' },
    { name: 'Анна', date: 'февраль 2020', stars: 5, text: 'Спасибо вам за работу и отзывчивость! Выручали меня два раза. Покупала подарки родным в дни праздника. Всё подсказали, рассказали, помогли подобрать именно то, что я хотела. Купила два комплекта постельного белья, плед и очень классный халат. Приду ещё!' },
    { name: 'НиКа', date: 'октябрь 2020', stars: 5, text: 'Уважительное отношение к клиенту, серьёзное отношение к делу, качественные материалы. Спасибо вам!' },
  ],
  gis: [
    { name: 'Анастасия', date: 'август 2026', stars: 5, text: 'Уже не первый раз обращаюсь за пошивом штор: хороший выбор, цены, приятные бонусы и быстро выполняют заказ. Анна всегда посоветует и подскажет, как лучше. Всем рекомендую!' },
    { name: 'Анна', date: 'ноябрь 2026', stars: 5, text: 'Отличный магазин, без покупки не уйти) Большой ассортимент, хорошее качество, доброжелательные продавцы. Если вам нужен подарок, красивые шторы, тёплое одеяло, уютный домашний текстиль — вам точно стоит однажды прийти в этот магазин!' },
    { name: 'Елена', date: 'октябрь 2025', stars: 5, text: 'Заказывали в салоне римские шторы — девочки помогли с подбором ткани и фасона. Доставка и монтаж — в оговоренный день, карнизы установили аккуратно. Ткань соответствует образцу, шторы красиво держат форму. Цена соответствует качеству, персонал вежливый и компетентный. Рекомендую салон друзьям.' },
    { name: 'Антон', date: 'январь 2026', stars: 5, text: 'Молодцы! Сделали всё очень быстро и качественно! Сотрудники вежливые и тактичные, посоветовали, как правильно сделать и в каких тонах. Спасибо огромное! Буду всем советовать ваш салон.' },
    { name: 'Наталья', date: 'ноябрь 2025', stars: 5, text: 'Большое спасибо Анне за консультацию и помощь в выборе штор! Быстро всё выбрали, посчитали, оперативно сшили шторы во всю квартиру. Цены адекватные, качество хорошее.' },
    { name: 'Ольга', date: 'сентябрь 2025', stars: 5, text: 'Отличный салон штор, приветливые менеджеры-консультанты. Сын заказывал шторы во все комнаты и остался очень доволен. Шторы сшиты качественно, сами портьеры высокого качества. Квартира приобрела уют и комфорт. Спасибо менеджеру Ольге за огромную профессиональную работу — от разработки дизайна до пошива!' },
    { name: 'Лера', date: 'ноябрь 2025', stars: 5, text: 'Зашла в ШторКу просто посмотреть ткани, а в итоге сразу купила шторы в спальню. Всё уже было в наличии, не пришлось ждать. Цвет подошёл идеально, дома выглядят даже лучше, чем в салоне. Спасибо девочкам за помощь!' },
    { name: 'Данил', date: 'январь 2026', stars: 5, text: 'Сложно было представить, сколько красивых тканей, оказывается, может быть — впечатлён! Быстро подобрали и сшили мне шторы в квартиру, очень доволен.' },
    { name: 'Арина', date: 'декабрь 2025', stars: 5, text: 'Мне нужны были шторы на кухню, чтобы не просвечивали. Консультант предложил блэкаут отличного качества, всё как я хотела. Рекомендую!' },
    { name: 'Ольга', date: 'декабрь 2025', stars: 5, text: 'Отличный магазин, широкий ассортимент тканей. Всё в наличии, не нужно ждать, помогли с подбором ткани, спасибо! Буду забегать к вам ещё.' },
    { name: 'Дарина', date: 'ноябрь 2025', stars: 5, text: 'Понравился профессиональный подход к шторам: помогли определиться с тканью и моделью, учли все пожелания.' },
    { name: 'Александр', date: 'январь 2026', stars: 5, text: 'Обращаюсь в данную организацию не первый раз. Работу выполняют качественно и очень быстро. Огромная благодарность за созданный уют в доме!' },
    { name: 'Кира', date: 'декабрь 2025', stars: 5, text: 'Покупала постельное бельё и подушки. Очень понравилось качество: мягкие, ничего не торчит, швы аккуратные. Сплю теперь как принцесса)' },
    { name: 'Юлия', date: 'ноябрь 2025', stars: 5, text: 'Прекрасный салон. Покупали постельное бельё неоднократно. Качество превосходное. Позитивный внимательный персонал. Рекомендую всем. Вернусь ещё!' },
    { name: 'Диана', date: 'май 2025', stars: 5, text: 'Сегодня открыли для себя салон домашнего текстиля ШторКа. Понравилось всё — от ассортимента до приятного консультанта! Муж нашёл подушку своей мечты, а я приобрела покрывало для кровати (нигде такого не видела!). Советуем от души это место!' },
    { name: 'Пётр', date: 'декабрь 2025', stars: 5, text: 'Замечательный магазин! Вежливые и грамотные продавцы всегда помогут и подскажут в выборе. Хороший ассортимент, качественный товар! Купили две подушки и комплект постельного белья — мы с женой в восторге! Обязательно придём ещё.' },
    { name: 'Соня', date: 'ноябрь 2025', stars: 5, text: 'Очень оперативно пошили шторы, в оговоренные сроки, что для меня было очень важно.' },
    { name: 'Ева', date: 'ноябрь 2025', stars: 5, text: 'Тут просто рай для любителей уюта. Красивые ткани, внимательные консультанты и отличные цены.' },
    { name: 'Екатерина', date: 'декабрь 2025', stars: 5, text: 'Сшили шторы быстро, мы сразу повесили, уже полгода висят — всё отлично 👌' },
    { name: 'Михаил', date: 'июль 2025', stars: 5, text: 'Приобрёл подушки! Они просто офигенные. Ольга помогла выбрать удобный и нужный мне вариант. Покупкой и сервисом очень доволен. Рекомендую 👍' },
    { name: 'Надежда', date: 'февраль 2025', stars: 5, text: 'Салон «ШторКа» — это просто находка! Я долго искала шторы для детской комнаты, и здесь мне предложили не только красивые, но и безопасные материалы. Ребёнок в восторге, а я довольна, что всё сделано с душой. Отдельное спасибо за оперативность и внимание к деталям!' },
    { name: 'Светлана', date: 'октябрь 2024', stars: 5, text: 'Не первый раз обращаюсь в этот магазин: консультанты работают на отлично, всё расскажут, покажут, правильно помогут снять размеры, все заказы в срок и даже раньше! С удовольствием обращусь ещё!' },
    { name: 'Анастасия', date: 'сентябрь 2024', stars: 5, text: 'Решила обновить шторы в гостиной, девочки-консультанты всё посчитали, предложили, сервис на уровне! Спасибо, всё очень красиво получилось.' },
    { name: 'Алексей', date: 'ноябрь 2025', stars: 5, text: 'Приобретали ткань для пошива штор: очень качественная, стойкая к стирке ткань. Рекомендую.' },
    { name: 'Виктория', date: 'сентябрь 2024', stars: 5, text: 'Заказывали тюлевые шторы для небольшой турбазы: вышло достаточно экономно, современно и, главное, быстро всё пошили. Будем ещё обращаться.' },
    { name: 'Татьяна', date: 'январь 2025', stars: 5, text: 'Очень понравился магазин! Большой выбор тканей и готовых штор. Помогли подобрать идеальный вариант для гостиной. Качество отличное, всё сделали быстро. Спасибо!' },
    { name: 'Мария', date: 'апрель 2026', stars: 5, text: 'Купила два халата, очень приятная девушка посоветовала, подобрала размер.' },
    { name: 'Дмитрий', date: 'январь 2025', stars: 5, text: 'Очень приятный сервис! Купили комплект постельного белья и полотенца на подарки — всё просто замечательно. Огромное спасибо!' },
  ],
};
// «Написали нам лично» — ОБРАЗЦЫ, заменить на настоящие сообщения клиентов (только имя)
const PERSONAL = [
  { from: 'Светлана', via: 'WhatsApp', time: '21:14', text: 'Шторы висят уже неделю, а я всё не нарадуюсь! Спасибо, что уговорили на тюль потоньше — комната стала светлее.' },
  { from: 'Алексей', via: 'Telegram', time: '18:02', text: 'Жена в восторге от комплекта на годовщину. Упаковка — огонь, спасибо за помощь с выбором.' },
  { from: 'Юлия', via: 'WhatsApp', time: '10:37', text: 'Хочу сказать спасибо мастеру, который вешал шторы: всё быстро, чисто и даже пропылесосил за собой.' },
  { from: 'Татьяна', via: 'MAX', time: '13:45', text: 'Римские в детской — лучшее решение. Ребёнок наконец спит днём!' },
];

// Готовые подарочные идеи
const GIFTS = [
  { name: 'Комплект белья в подарочной коробке', price: 5900, photo: 'Фото: комплект белья в коробке с лентой' },
  { name: 'Набор полотенец «Для двоих»', price: 2900, photo: 'Фото: набор полотенец, перевязанный лентой' },
  { name: 'Плед + две декоративные подушки', price: 6200, photo: 'Фото: плед и подушки на диване' },
  { name: 'Детский комплект с пледом', price: 4500, photo: 'Фото: детский комплект и плед' },
  { name: 'Халат и полотенце', price: 4800, photo: 'Фото: махровый халат и полотенце' },
];

/* ---------- 2. Утилиты ---------- */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const rub = (n) => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const icon = (id, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Короткое стеклянное уведомление вместо notice()
function notice(msg) {
  const n = document.createElement('div');
  n.className = 'notice glass';
  n.setAttribute('role', 'alert');
  n.textContent = msg;
  document.body.append(n);
  setTimeout(() => n.remove(), 5000);
}
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* приватный режим */ } },
};

/* ---------- 3. Режим стекла, фон, шапка ---------- */
function initGlassMode() {
  const html = document.documentElement;
  html.classList.add('js');
  const ua = navigator.userAgent;
  const isChromium = /Chrome\/|CriOS|Edg\//.test(ua) && !/Firefox|FxiOS/.test(ua) && !/iPhone|iPad/.test(ua);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  // Видеокарта не задействована (в браузере выключено аппаратное ускорение, старый драйвер) — WebGL рисует процессор.
  // Тогда шторы стоят открытыми без анимации, стекло упрощённое: сайт выглядит так же, но не дёргается.
  const soft = softwareGPU();
  if (soft) html.classList.add('soft-gpu');
  const weak = soft || cores <= 4 || mem <= 3 || navigator.connection?.saveData || store.get('perf-lite');
  if (weak) html.classList.add('lite');                 // упрощённое стекло
  else if (isChromium && !reduceMotion()) html.classList.add('refract'); // преломление через SVG-фильтр
  if (!weak) watchFps();
}
function softwareGPU() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|softpipe|basic render|software/i.test(r);
  } catch { return false; }
}
// Страховка: если на этом устройстве прокрутка идёт рывками (меньше ~35 кадров/с два раза подряд),
// тихо переключаемся на упрощённое стекло без преломления. Запоминаем до конца сессии.
function watchFps() {
  const html = document.documentElement;
  let busy = false, bad = 0, checks = 0;
  const probe = () => {
    if (busy || checks >= 6 || document.hidden || html.classList.contains('cq')) return;
    busy = true; checks++;
    const ts = []; const t0 = performance.now();
    const step = (t) => { ts.push(t); if (t - t0 < 1200) requestAnimationFrame(step); else done(); };
    const done = () => {
      busy = false;
      const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
      const med = d[d.length >> 1] || 0;
      if (med > 28) { if (++bad >= 2) degrade(); } else bad = 0;
    };
    requestAnimationFrame(step);
  };
  const degrade = () => {
    html.classList.remove('refract'); html.classList.add('lite'); store.set('perf-lite', '1');
    removeEventListener('scroll', probe);
  };
  addEventListener('scroll', probe, { passive: true });
}

// Цвет фона перетекает под экран: body[data-theme] = тема секции в центре экрана
function initBackground() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) document.body.dataset.theme = e.target.dataset.theme || 'hero'; });
  }, { rootMargin: '-45% 0px -45% 0px' });
  $$('[data-theme]').forEach((s) => { if (s !== document.body) io.observe(s); });
}

// Декоративные подложки под стеклом: цветные пятна, лоскуты ткани, кольца.
// x/y — в % от секции, s — размер (vmin для пятен, px для ткани), c — цвет (CSS), r — поворот
const DECO = {
  // только мягкие цветные пятна (мята / персик / лаванда / небо) — как в согласованном макете
  hits:    [{ t: 'blob', x: 18, y: 30, s: 52, c: '#BFE6DA' }, { t: 'blob', x: 82, y: 60, s: 50, c: '#FAD2BB' }],
  tryon:   [{ t: 'blob', x: 12, y: 35, s: 50, c: '#FAD2BB' }, { t: 'blob', x: 88, y: 25, s: 44, c: '#DED5F6' }, { t: 'blob', x: 60, y: 85, s: 46, c: '#BFE6DA' }],
  textile: [{ t: 'blob', x: 15, y: 30, s: 46, c: '#FAD2BB' }, { t: 'blob', x: 85, y: 70, s: 48, c: '#BFE6DA' }],
  process: [{ t: 'blob', x: 10, y: 55, s: 48, c: '#BFE6DA' }, { t: 'blob', x: 85, y: 30, s: 46, c: '#FAD2BB' }],
  salon:   [{ t: 'blob', x: 12, y: 30, s: 48, c: '#BFE6DA' }, { t: 'blob', x: 88, y: 70, s: 46, c: '#FAD2BB' }],
  works:   [{ t: 'blob', x: 85, y: 30, s: 46, c: '#DED5F6' }, { t: 'blob', x: 12, y: 70, s: 44, c: '#BFE6DA' }],
  reviews: [{ t: 'blob', x: 45, y: 50, s: 50, c: '#D8E5F7' }, { t: 'blob', x: 88, y: 40, s: 44, c: '#FAD2BB' }],
  gifts:   [{ t: 'blob', x: 12, y: 25, s: 50, c: '#FAD2BB' }, { t: 'blob', x: 80, y: 60, s: 48, c: '#BFE6DA' }, { t: 'blob', x: 45, y: 90, s: 40, c: '#DED5F6' }],
  contacts:[{ t: 'blob', x: 20, y: 40, s: 40, c: '#BFE6DA' }, { t: 'blob', x: 80, y: 50, s: 40, c: '#FAD2BB' }],
};
function initDeco() {
  Object.entries(DECO).forEach(([id, items]) => {
    const sec = document.getElementById(id);
    if (!sec) return;
    const box = document.createElement('div');
    box.className = 'deco';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = items.map((d) => {
      const pos = `left:${d.x}%;top:${d.y}%;--dc:${d.c};`;
      if (d.t === 'blob') return `<span class="deco__blob" style="${pos}width:${d.s}vmin;height:${d.s}vmin;transform:translate(-50%,-50%)"></span>`;
      if (d.t === 'ring') return `<span class="deco__ring" style="${pos}width:${d.s}px;height:${d.s}px;transform:translate(-50%,-50%)"></span>`;
      return `<span class="deco__fabric" style="${pos}width:${d.w}px;height:${d.h}px;transform:translate(-50%,-50%) rotate(${d.r}deg)"></span>`;
    }).join('');
    sec.prepend(box);
  });
}

// Блик на стекле и кнопках следует за курсором; кнопки чуть «притягиваются» к курсору (только мышь)
function initGlassPointer() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || document.documentElement.classList.contains('lite')) return;
  let magnet = null;
  const release = () => { if (magnet) { magnet.style.setProperty('--tx', '0px'); magnet.style.setProperty('--ty', '0px'); magnet = null; } };
  document.addEventListener('pointermove', (e) => {
    const t = e.target;
    if (!t.closest) return;
    const glass = t.closest('.glass, .plate');
    if (glass) {
      const r = glass.getBoundingClientRect();
      glass.style.setProperty('--mx', `${e.clientX - r.left}px`);
      glass.style.setProperty('--my', `${e.clientY - r.top}px`);
    }
    const btn = t.closest('.btn:not(:disabled)');
    if (btn !== magnet) release();
    if (btn) {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      btn.style.setProperty('--mx', `${x}px`);
      btn.style.setProperty('--my', `${y}px`);
      if (!reduceMotion()) {
        btn.style.setProperty('--tx', `${((x / r.width) - 0.5) * 6}px`);
        btn.style.setProperty('--ty', `${((y / r.height) - 0.5) * 4}px`);
      }
      magnet = btn;
    }
  }, { passive: true });
  document.addEventListener('pointerleave', release);

}


// Сильный «магнит» для кнопок .btn--magnet: притягиваются к курсору уже на подлёте (радиус ~90 px).
// Работает и в облегчённом режиме — это дёшево (2 кнопки, один кадр на движение мыши). Только мышь.
function initStrongMagnet() {
  const strong = $$('.btn--magnet');
  if (strong.length && !reduceMotion() && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let raf = 0, px = 0, py = 0;
    const pull = () => {
      raf = 0;
      strong.forEach((b) => {
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = px - cx, dy = py - cy, R = 90;
        const inX = Math.abs(dx) < r.width / 2 + R, inY = Math.abs(dy) < r.height / 2 + R;
        if (inX && inY) {
          b.style.setProperty('--tx', `${Math.max(-14, Math.min(14, dx * 0.12)).toFixed(1)}px`);
          b.style.setProperty('--ty', `${Math.max(-9, Math.min(9, dy * 0.22)).toFixed(1)}px`);
          b.classList.add('is-pulled');
        } else if (b.classList.contains('is-pulled')) {
          b.style.setProperty('--tx', '0px'); b.style.setProperty('--ty', '0px');
          b.classList.remove('is-pulled');
        }
      });
    };
    document.addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; if (!raf) raf = requestAnimationFrame(pull); }, { passive: true });
  }
}

function initHeader() {
  const header = $('#header');
  const burger = $('#burger');
  const sheet = $('#mobile-menu');
  const setOpen = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    sheet.hidden = !open;
  };
  burger.addEventListener('click', () => setOpen(sheet.hidden));
  sheet.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) { setOpen(false); burger.focus(); } });
  document.addEventListener('click', (e) => { if (!sheet.hidden && !header.contains(e.target)) setOpen(false); });

  window.addEventListener('scroll', () => header.classList.toggle('is-scrolled', window.scrollY > 20), { passive: true });

  // подсветка активного пункта меню
  // подсветка активного пункта меню: стеклянная капля переплывает от пункта к пункту (как переключатель 2ГИС / Яндекс)
  const links = $$('.nav a');
  const nav = $('.nav'), navBlob = nav?.querySelector('.nav__blob');
  const placeNav = (a, animate = true) => {
    if (!navBlob) return;
    if (!a || !a.offsetWidth) { nav.classList.remove('has-active'); return; }
    const first = !nav.classList.contains('has-active');
    if (first || !animate) navBlob.style.transition = 'none';
    else { navBlob.classList.remove('is-moving'); void navBlob.offsetWidth; navBlob.classList.add('is-moving'); }
    navBlob.style.width = a.offsetWidth + 'px';
    navBlob.style.transform = `translateX(${a.offsetLeft}px)`;
    nav.classList.add('has-active');
    if (first || !animate) { void navBlob.offsetWidth; navBlob.style.transition = ''; }
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
      placeNav(links.find((a) => a.classList.contains('is-active')));
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  ['top', 'hits', 'process', 'textile', 'tryon', 'salon', 'reviews', 'gifts', 'contacts'].forEach((id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  const placeNavNow = () => placeNav(links.find((a) => a.classList.contains('is-active')), false);
  window.addEventListener('resize', placeNavNow);
  document.fonts?.ready.then(placeNavNow);
}

/* ---------- 4. Интро-шторы и тост ---------- */
// Заголовок первого экрана режем на слова: каждое выезжает из-под маски
function splitHeroTitle() {
  const h = $('.hero__title');
  if (!h || h.classList.contains('is-split')) return 0;
  let n = 0;
  const wrap = (node) => {
    [...node.childNodes].forEach((ch) => {
      if (ch.nodeType === 3) {
        const frag = document.createDocumentFragment();
        ch.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(' '); return; }
          const w = document.createElement('span'); w.className = 'w';
          const i = document.createElement('span'); i.textContent = part; i.style.setProperty('--wd', `${n++ * 55}ms`);
          w.append(i); frag.append(w);
        });
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1) wrap(ch);
    });
  };
  h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
  wrap(h);
  [...h.querySelectorAll('.w')].forEach((w) => w.setAttribute('aria-hidden', 'true'));
  h.classList.add('is-split');
  return n;
}

// Хореография первого экрана: логотип в просвете штор → заголовок по словам → кнопки → строка фактов
function revealHero() {
  const words = $$('.hero__title .w').length;
  const tTitle = 160, tAfter = tTitle + words * 55 + 120;
  const plan = [
    ['.hero__sign', 0], ['.hero__title', tTitle],
    ['.hero__actions', tAfter], ['.hero__rail', tAfter + 180],
  ];
  plan.forEach(([sel, d]) => { const el = $(sel); if (el) el.style.setProperty('--d', reduceMotion() ? '0ms' : `${d}ms`); });
  $$('.hero .reveal').forEach((el) => el.classList.add('is-in'));
}

// Шторы с физикой (curtains.js). Если модуль не загрузился — просто показываем первый экран
function initCurtains(onDone) {
  splitHeroTitle();
  const canvas = $('#curtain-canvas');
  if (!window.Curtains || !canvas) { revealHero(); onDone?.(); return; }
  // «Тихий режим»: пока шторы открываются и покачиваются, стекло, размытия и фоновые анимации выключены (стили, блок 29) —
  // видеокарта занята только тканью. Шторы замерли — эффекты плавно возвращаются, плашка «Дарим 1000 ₽» появляется после.
  const html = document.documentElement;
  html.classList.add('cq');
  let done = false, guard = 0;
  const rest = () => {
    if (done) return; done = true; clearTimeout(guard);
    html.classList.add('cq-out'); html.classList.remove('cq');
    setTimeout(() => html.classList.remove('cq-out'), 900);
    onDone?.();
  };
  window.Curtains.init({
    canvas,
    onOpenStart: () => { revealHero(); guard = setTimeout(rest, 14000); },   // страховка: если шторы ушли с экрана и «не заснули»
    onRest: rest,
  });
}

function initToast() {
  const toast = $('#toast');
  if (store.get('toast-closed')) return;
  setTimeout(() => {
    toast.hidden = false;
    // на телефоне плашка сама прячется через 8 с, чтобы не мешать (покажется снова при следующем заходе)
    if (matchMedia('(max-width: 719px)').matches) setTimeout(() => { toast.hidden = true; }, 8000);
  }, reduceMotion() ? 1500 : CONFIG.toastDelay);
  const close = () => { toast.hidden = true; store.set('toast-closed', '1'); };
  toast.querySelector('.toast__close').addEventListener('click', close);
  $('#toast-link').addEventListener('click', close);
}

/* ---------- 5. Модальные окна и мессенджеры ---------- */
function openModal(dlg) {
  // куда вернуть фокус после закрытия (если окно открыто из другого окна — туда, откуда открыли первое)
  const a = document.activeElement;
  const parent = a?.closest?.('dialog');
  dlg._ret = parent ? parent._ret : a;
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  document.body.classList.add('is-locked');
}
function closeModal(dlg) {
  if (dlg.open) dlg.close();
}
function initModals() {
  $$('dialog.modal').forEach((dlg) => {
    dlg.addEventListener('close', () => {
      if ($$('dialog[open]').length) return; // открыто другое окно — фокус и блокировку не трогаем
      document.body.classList.remove('is-locked');
      dlg._ret?.focus?.({ preventScroll: true });
    });
    // клик по подложке закрывает окно
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) closeModal(dlg);
      if (e.target.closest('[data-close]')) closeModal(dlg);
    });
  });
  $$('[data-open-contact]').forEach((b) => b.addEventListener('click', () => openContact()));
  // «Как мы работаем» → платный путь: мессенджер с готовым текстом про выездной замер
  $$('[data-zamer]').forEach((b) => b.addEventListener('click', () => openContact('Здравствуйте! Хочу записаться на выездной замер.', 'Записаться на замер', 'Сообщение уже готово — выберите мессенджер')));
}

// Ссылки мессенджеров. text — готовое сообщение (например, «Есть ли в наличии …?»)
function messengerLinks(text = '') {
  const t = encodeURIComponent(text);
  return [
    { key: 'wa', label: 'WhatsApp', icon: 'i-wa', href: `https://wa.me/${CONFIG.whatsapp}${text ? `?text=${t}` : ''}` },
    { key: 'tg', label: 'Telegram', icon: 'i-tg', href: `https://t.me/${CONFIG.telegram}`, copy: !!text }, // Telegram не подставляет текст в личный чат — копируем в буфер
    { key: 'max', label: 'MAX', icon: 'i-max', href: CONFIG.max, copy: !!text },
    { key: 'phone', label: 'Позвонить', icon: 'i-phone', href: `tel:${CONFIG.phones[0].raw}` },
  ].filter((m) => m.href); // пустая ссылка (например, MAX без адреса) — кнопку не показываем
}
function renderMessengers(container, text = '') {
  // в подвале — круглые кнопки с анимацией (иконка → стрелка, свечение цветом сети, дуги у соседей)
  if (container.closest('.footer')) return renderSocial(container, text);
  container.innerHTML = messengerLinks(text).map((m) =>
    `<a class="msgr msgr--${m.key}" href="${m.href}" ${m.key !== 'phone' ? 'target="_blank" rel="noopener"' : ''} ${m.copy ? 'data-copy' : ''}>${icon(m.icon)}<span>${m.label}</span></a>`
  ).join('');
}
const SOC_COLORS = { wa: '#25D366', tg: '#2AABEE', max: '#7B61FF', phone: '#A9DFCF' };
function renderSocial(container, text = '') {
  container.classList.add('soc');
  container.innerHTML = messengerLinks(text).map((m) =>
    `<a class="soc__btn" style="--c:${SOC_COLORS[m.key]}" href="${m.href}" ${m.key !== 'phone' ? 'target="_blank" rel="noopener"' : ''} ${m.copy ? 'data-copy' : ''} aria-label="${m.label}" title="${m.label}">` +
    `<span class="soc__arc" aria-hidden="true"></span><span class="soc__ico">${icon(m.icon)}${icon('i-arrow')}</span></a>`
  ).join('');
  const btns = [...container.children];
  const clear = () => { container.classList.remove('is-on'); btns.forEach((b) => b.removeAttribute('data-side')); };
  const on = (b) => {
    const i = btns.indexOf(b);
    btns.forEach((x, j) => {
      if (j === i - 1) x.dataset.side = 'right';      // сосед слева — дуга на его правом боку
      else if (j === i + 1) x.dataset.side = 'left';  // сосед справа — дуга на левом боку
      else x.removeAttribute('data-side');
    });
    container.style.setProperty('--arc', b.style.getPropertyValue('--c'));
    container.classList.add('is-on');
  };
  btns.forEach((b) => {
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') on(b); });
    b.addEventListener('focus', () => { if (b.matches(':focus-visible')) on(b); });
    b.addEventListener('blur', clear);
  });
  container.addEventListener('pointerleave', clear);
}

// Рабочее время салона (как в подвале): ежедневно 10:00–20:00 по Иркутску
const HOURS = { from: 10, to: 20 };
function contactHours() {
  const st = $('#contact-status'), dot = $('#contact-dot');
  if (!st) return;
  let h = new Date().getHours();
  try { h = +new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Irkutsk', hour: 'numeric', hourCycle: 'h23' }).format(new Date()); } catch (e) { /* старый браузер — местное время */ }
  const open = h >= HOURS.from && h < HOURS.to;
  st.textContent = open ? 'сейчас открыто' : `сейчас закрыто — ответим с ${HOURS.from}:00`;
  dot.classList.toggle('is-open', open);
}

function openContact(text = '', title = 'Напишите нам', lead = 'Ответим в течение 15 минут в рабочее время') {
  const dlg = $('#contact-modal');
  contactHours();
  $('#contact-title').textContent = title;
  $('#contact-lead').textContent = lead;
  const preview = $('#contact-preview');
  preview.hidden = !text;
  preview.textContent = text;
  $('#contact-copied').hidden = true;
  const list = $('#contact-list');
  renderMessengers(list, text);
  list.querySelectorAll('[data-copy]').forEach((a) => a.addEventListener('click', () => {
    navigator.clipboard?.writeText(text).then(() => { $('#contact-copied').hidden = false; }).catch(() => {});
  }));
  openModal(dlg);
}

/* ---------- 6. Экран 2 — хиты ---------- */
// Универсальный сегмент-переключатель с «жидкой» каплей
// Если вкладки не помещаются — край переключателя растворяется: видно, что дальше есть ещё (например, «Детское»)
function segOverflow(seg) {
  if (!seg) return;
  const upd = () => {
    seg.classList.toggle('is-scrollable', seg.scrollWidth > seg.clientWidth + 2);
    seg.classList.toggle('at-end', seg.scrollLeft + seg.clientWidth >= seg.scrollWidth - 2);
  };
  seg.addEventListener('scroll', upd, { passive: true });
  window.addEventListener('resize', upd);
  document.fonts?.ready.then(upd);
  upd();
}

function initSeg(seg, onChange) {
  const blob = seg.querySelector('.seg__blob');
  const tabs = $$('[role="tab"]', seg);
  const place = (btn, animate = true) => {
    if (animate) { blob.classList.remove('is-moving'); void blob.offsetWidth; blob.classList.add('is-moving'); }
    blob.style.width = btn.offsetWidth + 'px';
    blob.style.transform = `translateX(${btn.offsetLeft}px)`;
  };
  const select = (btn, focus = false) => {
    tabs.forEach((t) => { t.setAttribute('aria-selected', String(t === btn)); t.tabIndex = t === btn ? 0 : -1; });
    place(btn);
    if (focus) btn.focus();
    btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
    onChange(btn);
  };
  tabs.forEach((t, i) => {
    t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1;
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        select(n, true);
      }
    });
  });
  const current = () => tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
  requestAnimationFrame(() => place(current(), false));
  window.addEventListener('resize', () => place(current(), false));
  document.fonts?.ready.then(() => place(current(), false));
}

/* Хиты салона — бегущая строка с фото товаров.
   Настоящие фото: добавьте товару в PRODUCTS поле img: 'assets/hits/имя.webp' (≈600×750, до 60 КБ) — заглушка заменится сама. */
function initHits() {
  const track = $('#hits-track');
  if (!track) return;
  // перемешиваем категории по кругу, чтобы шторы, бельё, пледы и детское шли вперемешку
  const byCat = {};
  PRODUCTS.forEach((p) => (byCat[p.cat] = byCat[p.cat] || []).push(p));
  const cats = Object.values(byCat), list = [];
  for (let i = 0; cats.some((c) => c[i]); i++) cats.forEach((c) => c[i] && list.push(c[i]));
  const card = (p, hidden) => `<figure class="marquee__item"${hidden ? ' aria-hidden="true"' : ''}>
      ${p.img
        ? `<img src="${esc(p.img)}" alt="${hidden ? '' : esc(p.name)}" width="600" height="750" loading="lazy" decoding="async">`
        : `<span class="ph" data-label="${esc(p.photo)}"></span>`}
      <figcaption>${esc(p.name)}</figcaption>
    </figure>`;
  // два одинаковых набора подряд — лента сдвигается на половину и бесшовно повторяется
  track.innerHTML = list.map((p) => card(p, false)).join('') + list.map((p) => card(p, true)).join('');
  // не крутим анимацию, пока блок не на экране — экономим батарею на телефонах
  const box = $('#hits-marquee');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => box.classList.toggle('is-running', e.isIntersecting), { rootMargin: '100px' }).observe(box);
  } else box.classList.add('is-running');
}

/* ---------- Экран 3.5 — «Выбрать домашний текстиль»: веер из стопки ----------
   Карточки всегда стоят в CSS-сетке (это «разложенное» состояние). В «стопке» каждой карточке
   задаётся сдвиг к центру (--sx/--sy) и поворот (--r) — анимируется только transform, поэтому плавно даже на слабых телефонах. */
function initTextile() {
  const fan = $('#textile-stack'), btn = $('#textile-toggle'), hint = $('#textile-hint');
  if (!fan || !btn) return;
  const n = TEXTILE.length;
  fan.innerHTML = TEXTILE.map((t, i) => `<li class="fan__card" style="--i:${i};--z:${n - i};--r:${((i - (n - 1) / 2) * 5).toFixed(1)}deg">
      <figure>
        ${t.img
          ? `<img src="${esc(t.img)}" alt="${esc(t.name)}" width="600" height="750" loading="lazy" decoding="async">`
          : `<span class="ph${i % 2 ? ' ph--peach' : ''}" data-label="${esc(t.photo)}"></span>`}
        <figcaption>${esc(t.name)}</figcaption>
      </figure>
    </li>`).join('');
  const cards = [...fan.children];
  let open = false, raf = 0;

  const layout = () => {
    const ch = cards[0].offsetHeight, cw = cards[0].offsetWidth;
    const closedH = Math.round(ch + 70);
    const openH = Math.max(...cards.map((c) => c.offsetTop + c.offsetHeight));
    const cx = fan.clientWidth / 2, cy = closedH / 2;
    cards.forEach((c) => {
      c.style.setProperty('--sx', Math.round(cx - (c.offsetLeft + cw / 2)) + 'px');
      c.style.setProperty('--sy', Math.round(cy - (c.offsetTop + ch / 2)) + 'px');
    });
    fan.style.height = (open ? openH : closedH) + 'px';
  };
  const relayout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); };

  const set = (v) => {
    open = v;
    fan.dataset.state = open ? 'open' : 'closed';
    btn.textContent = open ? 'Собрать в стопку' : 'Разложить';
    btn.setAttribute('aria-expanded', String(open));
    hint.textContent = open ? 'Всё это можно потрогать и выбрать в салоне' : 'Целая стопка уюта — разложим?';
    layout();
  };

  layout();
  requestAnimationFrame(() => fan.classList.add('fan--ready')); // анимации включаем после первой расстановки — без рывка при загрузке
  btn.addEventListener('click', () => set(!open));
  fan.addEventListener('click', () => { if (!open) set(true); }); // по самой стопке тоже можно нажать
  window.addEventListener('resize', relayout);
  document.fonts?.ready.then(relayout);
  fan.querySelectorAll('img').forEach((img) => img.addEventListener('load', relayout, { once: true }));
}

/* ---------- 7. Экран 3 — примерочная ---------- */
/*
  Слой 1 — ручная подгонка, всё в браузере:
  - фото рисуется в <canvas>, поверх — текстура штор, сгенерированная кодом под выбранный тип/ткань;
  - текстура натягивается на 4 угла (перспективная трансформация через гомографию + разбиение на треугольники),
    поэтому итоговую картинку можно выгрузить одним toDataURL() и отправить с заявкой.
  Слой 2 — нейросеть: «Сделать реалистично» — раздел 7.1 (runAI → api/tryon.php); detectWindowAI() — пока заглушка.
*/
const tryon = {
  img: null,                 // исходное фото (HTMLImageElement / canvas)
  photo: null,               // уменьшенная копия фото (canvas, макс. 1600 px)
  type: 'portieres',
  fabric: FABRICS[3],
  fullness: 2,
  lift: 30,
  tulleOpacity: 0.55,
  corners: null,             // [[x,y]×4] в долях 0..1: TL, TR, BR, BL
  showAfter: true,
  texture: null,
  dirty: true,
};
const DEFAULT_CORNERS = [[0.25, 0.15], [0.75, 0.15], [0.75, 0.85], [0.25, 0.85]];

// Генерация повторяющейся фактуры ткани (один раз на ткань)
const patternCache = new Map();
function fabricPattern(ctx, kind) {
  if (patternCache.has(kind)) return ctx.createPattern(patternCache.get(kind), 'repeat');
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (kind === 'linen' || kind === 'sheer') {
    // переплетение нитей льна
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.12})`;
      g.beginPath();
      const y = Math.random() * 64;
      if (i % 2) { g.moveTo(0, y); g.lineTo(64, y + (Math.random() - 0.5) * 2); } else { g.moveTo(y, 0); g.lineTo(y + (Math.random() - 0.5) * 2, 64); }
      g.stroke();
    }
  } else if (kind === 'jacquard') {
    // ромбовидный узор
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(32, 4); g.lineTo(60, 32); g.lineTo(32, 60); g.lineTo(4, 32); g.closePath(); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.08)'; g.beginPath(); g.arc(32, 32, 6, 0, Math.PI * 2); g.fill();
  } else {
    // бархат / блэкаут — мелкий шум
    const d = g.createImageData(64, 64);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = kind === 'velvet' ? 22 : 12; }
    g.putImageData(d, 0, 0);
  }
  patternCache.set(kind, c);
  return ctx.createPattern(c, 'repeat');
}

// Одно полотно с вертикальными складками. Нижний край волнистый — как у настоящей ткани
function drawPanel(g, x, y, w, h, color, kind, folds, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  const amp = Math.min(10, w / folds / 4);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w, y + h - amp);
  for (let i = folds * 2; i >= 0; i--) {
    const px = x + (w * i) / (folds * 2);
    g.lineTo(px, y + h - amp + (i % 2 ? amp : 0));
  }
  g.closePath();
  g.clip();
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  // фактура
  g.fillStyle = fabricPattern(g, kind);
  g.fillRect(x, y, w, h);
  // складки: свет/тень по синусу
  const strength = kind === 'velvet' ? 0.42 : kind === 'sheer' ? 0.12 : 0.26;
  const grad = g.createLinearGradient(x, 0, x + w, 0);
  const steps = folds * 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = Math.sin(t * folds * Math.PI * 2);
    grad.addColorStop(t, s > 0 ? `rgba(255,255,255,${(s * strength * 0.7).toFixed(3)})` : `rgba(0,0,0,${(-s * strength).toFixed(3)})`);
  }
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  // объём сверху/снизу
  const v = g.createLinearGradient(0, y, 0, y + h);
  v.addColorStop(0, 'rgba(0,0,0,.18)'); v.addColorStop(0.08, 'rgba(0,0,0,0)'); v.addColorStop(0.85, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.2)');
  g.fillStyle = v;
  g.fillRect(x, y, w, h);
  g.restore();
}

function drawRod(g, w, y) {
  const r = g.createLinearGradient(0, y - 8, 0, y + 8);
  r.addColorStop(0, '#5b5f61'); r.addColorStop(0.5, '#2c2f31'); r.addColorStop(1, '#16191a');
  g.fillStyle = r;
  g.fillRect(0, y - 6, w, 12);
  g.beginPath(); g.arc(8, y, 10, 0, Math.PI * 2); g.arc(w - 8, y, 10, 0, Math.PI * 2); g.fill();
}

// Текстура штор под текущие настройки. Размер — по пропорциям выделенного окна
function buildTexture() {
  const { type, fabric, fullness, lift, tulleOpacity } = tryon;
  const q = quadPx();
  const qw = (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) + Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1])) / 2;
  const qh = (Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]) + Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1])) / 2;
  const W = 900;
  const H = Math.round(clamp(W * (qh / Math.max(qw, 1)), 300, 1800));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rodY = 14;
  const foldsPer = Math.round(fullness * 2.5);

  if (type === 'tulle' || type === 'combo') {
    drawPanel(g, 0, rodY, W, H - rodY, TULLE_COLOR, 'sheer', Math.round(fullness * 6), tulleOpacity);
  }
  if (type === 'portieres' || type === 'combo') {
    const pw = W * (0.17 + (fullness - 1.5) * 0.06); // ширина каждого полотна растёт со сборкой
    drawPanel(g, 0, rodY, pw, H - rodY, fabric.color, fabric.kind, foldsPer);
    drawPanel(g, W - pw, rodY, pw, H - rodY, fabric.color, fabric.kind, foldsPer);
  }
  if (type === 'portieres' || type === 'tulle' || type === 'combo') drawRod(g, W, rodY);

  if (type === 'roman') {
    // римская: полотно с мягкими горизонтальными складками; при подъёме складки собираются стопкой внизу
    const bottom = Math.max(80, H * (1 - lift / 100));
    g.fillStyle = fabric.color; g.fillRect(0, 10, W, bottom);
    g.fillStyle = fabricPattern(g, fabric.kind); g.fillRect(0, 10, W, bottom);
    const band = H / 7;
    for (let y = 10 + band; y < bottom - 20; y += band) {       // линии каркасных палочек
      const sg = g.createLinearGradient(0, y - 8, 0, y + 6);
      sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.7, 'rgba(0,0,0,.14)'); sg.addColorStop(1, 'rgba(255,255,255,.1)');
      g.fillStyle = sg; g.fillRect(0, y - 8, W, 14);
    }
    const stack = lift > 4 ? Math.round((lift / 100) * 5) + 1 : 0;
    for (let k = stack - 1; k >= 0; k--) {                       // стопка складок
      const fh = 30, y = bottom - fh - k * 16;
      g.fillStyle = fabric.color; g.fillRect(0, y, W, fh);
      const pg = g.createLinearGradient(0, y, 0, y + fh);
      pg.addColorStop(0, 'rgba(255,255,255,.22)'); pg.addColorStop(0.5, 'rgba(0,0,0,0)'); pg.addColorStop(1, 'rgba(0,0,0,.35)');
      g.fillStyle = pg; g.fillRect(0, y, W, fh);
    }
    const sh = g.createLinearGradient(0, 0, W, 0);
    sh.addColorStop(0, 'rgba(0,0,0,.12)'); sh.addColorStop(0.5, 'rgba(255,255,255,.06)'); sh.addColorStop(1, 'rgba(0,0,0,.12)');
    g.fillStyle = sh; g.fillRect(0, 10, W, bottom);
    g.fillStyle = '#ECE9E3'; g.fillRect(0, 0, W, 12);            // карниз-планка
  }

  if (type === 'roller') {
    const down = Math.max(30, H * (1 - lift / 100));
    g.fillStyle = fabric.color; g.fillRect(4, 18, W - 8, down);
    g.fillStyle = fabricPattern(g, fabric.kind); g.fillRect(4, 18, W - 8, down);
    const sh = g.createLinearGradient(0, 0, W, 0);
    sh.addColorStop(0, 'rgba(0,0,0,.1)'); sh.addColorStop(0.5, 'rgba(255,255,255,.08)'); sh.addColorStop(1, 'rgba(0,0,0,.1)');
    g.fillStyle = sh; g.fillRect(4, 18, W - 8, down);
    // кассета сверху и утяжелитель снизу
    g.fillStyle = '#F2F0EC'; g.fillRect(0, 0, W, 20);
    g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, 18, W, 3);
    g.fillStyle = '#D8D5CF'; g.fillRect(4, 18 + down - 8, W - 8, 10);
  }
  tryon.texture = c;
}

// Гомография: единичный квадрат (u,v) → четырёхугольник
function squareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let a, b, c, d, e, f, g, h;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0; g = 0; h = 0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0;
    d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
  }
  return (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + c) / w, (d * u + e * v + f) / w]; };
}

// Рисуем текстуру в четырёхугольник: сетка N×N, каждый треугольник — аффинно
function drawWarped(ctx, tex, quad, N = 16) {
  const map = squareToQuad(quad);
  const tw = tex.width, th = tex.height;
  const pts = [];
  for (let j = 0; j <= N; j++) { pts[j] = []; for (let i = 0; i <= N; i++) pts[j][i] = map(i / N, j / N); }
  const tri = (s0, s1, s2, d0, d1, d2) => {
    // слегка расширяем треугольник, чтобы не было швов между соседями
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
    const grow = (p) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * 0.8, p[1] + (dy / l) * 0.8]; };
    const [e0, e1, e2] = [grow(d0), grow(d1), grow(d2)];
    const sx1 = s1[0] - s0[0], sy1 = s1[1] - s0[1], sx2 = s2[0] - s0[0], sy2 = s2[1] - s0[1];
    const det = sx1 * sy2 - sx2 * sy1;
    if (Math.abs(det) < 1e-9) return;
    const du1 = d1[0] - d0[0], dv1 = d1[1] - d0[1], du2 = d2[0] - d0[0], dv2 = d2[1] - d0[1];
    const a = (du1 * sy2 - du2 * sy1) / det, c = (du2 * sx1 - du1 * sx2) / det;
    const b = (dv1 * sy2 - dv2 * sy1) / det, d = (dv2 * sx1 - dv1 * sx2) / det;
    const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b * s0[0] - d * s0[1];
    ctx.save();
    ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.closePath(); ctx.clip();
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(tex, 0, 0);
    ctx.restore();
  };
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u0 = (i / N) * tw, u1 = ((i + 1) / N) * tw, v0 = (j / N) * th, v1 = ((j + 1) / N) * th;
      const p00 = pts[j][i], p10 = pts[j][i + 1], p11 = pts[j + 1][i + 1], p01 = pts[j + 1][i];
      tri([u0, v0], [u1, v0], [u1, v1], p00, p10, p11);
      tri([u0, v0], [u1, v1], [u0, v1], p00, p11, p01);
    }
  }
}

function quadPx() {
  const c = $('#tryon-canvas');
  return (tryon.corners || DEFAULT_CORNERS).map(([x, y]) => [x * c.width, y * c.height]);
}

function renderTryon() {
  if (!tryon.photo || !tryon.dirty) return;
  tryon.dirty = false;
  const c = $('#tryon-canvas');
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(tryon.photo, 0, 0, c.width, c.height);
  if (tryon.showAfter) {
    if (!tryon.texture) buildTexture();
    // мягкая тень от штор на стену (для портьер и тюля)
    if (!['roman', 'roller'].includes(tryon.type)) {
    ctx.save();
    ctx.globalAlpha = 0.14;
    if ('filter' in ctx) ctx.filter = 'blur(12px)';
    const q = quadPx();
    ctx.beginPath(); ctx.moveTo(q[0][0] + 6, q[0][1] + 10); q.slice(1).forEach((p) => ctx.lineTo(p[0] + 6, p[1] + 10)); ctx.closePath();
    ctx.fillStyle = '#000'; ctx.fill();
    ctx.restore();
    }
    drawWarped(ctx, tryon.texture, quadPx(), document.documentElement.classList.contains('lite') ? 10 : 16);
  }
  placeHandles();
}
function requestRender(rebuild = false) {
  if (rebuild) tryon.texture = null;
  tryon.dirty = true;
  requestAnimationFrame(renderTryon);
}

function placeHandles() {
  $$('.handle').forEach((h) => {
    const [x, y] = tryon.corners[+h.dataset.corner];
    h.style.left = `${x * 100}%`;
    h.style.top = `${y * 100}%`;
  });
}

function loadPhoto(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  loadPhotoUrl(url, () => URL.revokeObjectURL(url));
}
function loadPhotoUrl(url, after) {
  const img = new Image();
  img.onload = () => {
    // уменьшаем до 1600 px — быстрее рисуем и меньше весит итог
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const pc = document.createElement('canvas');
    pc.width = Math.round(img.naturalWidth * k);
    pc.height = Math.round(img.naturalHeight * k);
    pc.getContext('2d').drawImage(img, 0, 0, pc.width, pc.height);
    tryon.photo = pc;
    const c = $('#tryon-canvas');
    c.width = pc.width; c.height = pc.height;
    tryon.corners = DEFAULT_CORNERS.map((p) => [...p]);
    tryon.showAfter = true;
    $('#dropzone').hidden = true;
    $('#stage-inner').hidden = false;
    aiAbort?.abort();
    hideAI();
    $('#btn-newphoto').hidden = false;
    ['#btn-reset', '#btn-compare', '#btn-detect', '#btn-ai', '#btn-want'].forEach((s) => { $(s).disabled = false; });
    requestRender(true);
    after?.();
  };
  img.onerror = () => { notice('Не удалось открыть фото. Попробуйте другой файл (JPG или PNG).'); after?.(); };
  img.src = url;
}

function initTryon() {
  // типы штор
  const typePills = $('#type-pills');
  const syncRanges = () => $$('.range').forEach((r) => { r.hidden = !r.dataset.for.split(' ').includes(tryon.type); });
  typePills.addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    $$('[data-type]', typePills).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    tryon.type = b.dataset.type;
    syncRanges();
    requestRender(true);
  });
  radioKeys(typePills);

  // образцы тканей
  const sw = $('#swatches');
  const texCss = { linen: 'repeating-linear-gradient(0deg, rgba(0,0,0,.12) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(255,255,255,.2) 0 1px, transparent 1px 3px)', velvet: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,.35), transparent 60%)', blackout: 'linear-gradient(135deg, rgba(255,255,255,.15), rgba(0,0,0,.15))', jacquard: 'repeating-linear-gradient(45deg, rgba(255,255,255,.25) 0 2px, transparent 2px 7px), repeating-linear-gradient(-45deg, rgba(255,255,255,.25) 0 2px, transparent 2px 7px)' };
  sw.innerHTML = FABRICS.map((f) => `<button class="swatch" role="radio" aria-checked="${f === tryon.fabric}" aria-label="${f.name}" title="${f.name}" data-fabric="${f.id}" style="--c:${f.color};--tex:${texCss[f.kind]}"></button>`).join('');
  $('#fabric-name').textContent = '· ' + tryon.fabric.name;
  sw.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fabric]');
    if (!b) return;
    $$('.swatch', sw).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    tryon.fabric = FABRICS.find((f) => f.id === b.dataset.fabric);
    $('#fabric-name').textContent = '· ' + tryon.fabric.name;
    requestRender(true);
  });
  radioKeys(sw);

  // ползунки
  const bindRange = (id, out, fmt, key, map = (v) => v) => {
    const input = $(id);
    input.addEventListener('input', () => { tryon[key] = map(+input.value); $(out).textContent = fmt(+input.value); requestRender(true); });
  };
  bindRange('#fullness', '#fullness-out', (v) => '×' + v.toFixed(1).replace('.', ','), 'fullness');
  bindRange('#lift', '#lift-out', (v) => v + '%', 'lift');
  bindRange('#tulle-opacity', '#opacity-out', (v) => v + '%', 'tulleOpacity', (v) => v / 100);

  // загрузка фото: кнопка, камера, перетаскивание
  $('#file-input').addEventListener('change', (e) => { loadPhoto(e.target.files[0]); e.target.value = ''; });
  $('#camera-input').addEventListener('change', (e) => { loadPhoto(e.target.files[0]); e.target.value = ''; });
  const dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('is-over'); }));
  dz.addEventListener('drop', (e) => loadPhoto(e.dataTransfer.files[0]));
  if (CONFIG.demoPhoto) { $('#demo-photo').hidden = false; $('#demo-photo').addEventListener('click', () => loadPhotoUrl(CONFIG.demoPhoto)); }
  $('#btn-newphoto').addEventListener('click', () => $('#file-input').click());

  // перетаскивание углов (палец и мышь) + стрелки с клавиатуры
  const inner = $('#stage-inner');
  $$('.handle').forEach((h) => {
    const i = +h.dataset.corner;
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      h.classList.add('is-drag');
      $('#stage-tip').style.opacity = '0';
      hideAI();
    });
    h.addEventListener('pointermove', (e) => {
      if (!h.hasPointerCapture(e.pointerId)) return;
      const r = inner.getBoundingClientRect();
      tryon.corners[i] = [clamp((e.clientX - r.left) / r.width, -0.05, 1.05), clamp((e.clientY - r.top) / r.height, -0.05, 1.05)];
      requestRender();
    });
    const end = (e) => { if (h.hasPointerCapture(e.pointerId)) h.releasePointerCapture(e.pointerId); h.classList.remove('is-drag'); requestRender(true); };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
    h.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.05 : 0.01;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      const [x, y] = tryon.corners[i];
      tryon.corners[i] = [clamp(x + d[0], -0.05, 1.05), clamp(y + d[1], -0.05, 1.05)];
      requestRender(true);
    });
  });

  $('#btn-reset').addEventListener('click', () => {
    tryon.corners = DEFAULT_CORNERS.map((p) => [...p]);
    tryon.showAfter = true;
    $('#btn-compare').setAttribute('aria-pressed', 'false');
    inner.classList.remove('is-before');
    hideAI();
    requestRender(true);
  });
  $('#btn-compare').addEventListener('click', (e) => {
    tryon.showAfter = !tryon.showAfter;
    e.currentTarget.setAttribute('aria-pressed', String(!tryon.showAfter));
    e.currentTarget.textContent = tryon.showAfter ? 'До / после' : 'Показать шторы';
    inner.classList.toggle('is-before', !tryon.showAfter);
    requestRender();
  });

  $('#btn-detect').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('is-loading');
    try {
      const corners = await detectWindowAI(tryon.photo);
      if (corners) { tryon.corners = corners; requestRender(true); }
    } finally { btn.classList.remove('is-loading'); }
  });

  $('#btn-ai').addEventListener('click', runAI);
  initAiResult();

  $('#btn-want').addEventListener('click', () => {
    const wasAfter = tryon.showAfter;
    tryon.showAfter = true; tryon.dirty = true; renderTryon();
    const image = tryon.aiImage && !$('#ai-result').hidden ? tryon.aiImage : $('#tryon-canvas').toDataURL('image/jpeg', 0.85);
    tryon.showAfter = wasAfter; requestRender();
    openLead('tryon', {
      title: 'Хочу так',
      lead: 'Посчитаем стоимость и подберём ткани. Картинку примерки приложим к заявке.',
      preview: image,
      extra: { image, type: tryon.type, fabric: tryon.fabric.name, fullness: tryon.fullness, lift: tryon.lift, tulleOpacity: tryon.tulleOpacity },
    });
  });

  syncRanges();
}

// Стрелки для групп radio-кнопок (aria-checked)
function radioKeys(group) {
  group.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const items = $$('[role="radio"]', group);
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const n = items[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    n.focus(); n.click();
  });
}

/* ---------- 7.1 ИИ-примерка: фото + образец ткани → нейросеть (Nano Banana через свой прокси) ----------
   Ключ нейросети на страницу не попадает: запрос идёт на CONFIG.api.refine (api/tryon.php),
   а уже сервер ходит в Polza.ai. Модель и тексты промптов — в site/api/config.json.
   1 нажатие «Сделать реалистично» = 1 запрос (~3 ₽, ~30 с). Пока ждём — экран загрузки с шагами и прогрессом. */
const CURTAIN_NAMES = { portieres: 'портьеры', tulle: 'тюль', combo: 'портьеры с тюлем', roman: 'римские шторы', roller: 'рулонные шторы' };
const AI_STEPS = [            // [с какой секунды, что пишем]
  [0, 'Изучаем комнату и окно'],
  [5, 'Подбираем ткань под ваш свет'],
  [11, 'Рисуем складки'],
  [18, 'Добавляем мягкие тени'],
  [25, 'Проверяем детали'],
  [33, 'Почти готово, ещё чуть-чуть'],
  [50, 'Нейросеть сегодня задумчивая, ждём ещё немного'],
];
const AI_ERRORS = {
  limit_ip: 'Вы сделали много примерок подряд. Попробуйте через час или нажмите «Хочу так» — подберём шторы вместе.',
  limit_day: 'На сегодня примерки нейросетью закончились. Нажмите «Хочу так» — дизайнер пришлёт эскиз вручную.',
};
let aiAbort = null;           // AbortController текущего запроса (null — нейросеть не работает)

// Фото для нейросети: JPEG не больше 1024 px — быстрее и дешевле
function photoForAI(maxSide = 1024) {
  const src = tryon.photo;
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

// Образец ткани (вторая картинка для нейросети): цвет + фактура выбранной ткани
function fabricSwatch(kind, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 512, 512);
  g.save(); g.scale(2, 2); g.fillStyle = fabricPattern(g, kind); g.fillRect(0, 0, 256, 256); g.restore();
  const light = g.createLinearGradient(0, 0, 512, 512);   // мягкий свет, чтобы читалось как ткань, а не заливка
  light.addColorStop(0, 'rgba(255,255,255,.16)'); light.addColorStop(0.5, 'rgba(255,255,255,0)'); light.addColorStop(1, 'rgba(0,0,0,.12)');
  g.fillStyle = light; g.fillRect(0, 0, 512, 512);
  return c.toDataURL('image/jpeg', 0.9);
}

function buildAIRequest() {
  const tulleOnly = tryon.type === 'tulle';               // у тюля своя белая вуаль, как и в ручной подгонке
  const kind = tulleOnly ? 'sheer' : tryon.fabric.kind;
  const color = tulleOnly ? TULLE_COLOR : tryon.fabric.color;
  return {
    photo: photoForAI(),
    fabric: fabricSwatch(kind, color),
    curtain: { type: tryon.type, kind, color, lift: tryon.lift },
    label: CURTAIN_NAMES[tryon.type] + (tulleOnly ? '' : ', ' + tryon.fabric.name.toLowerCase()),
  };
}

async function refineWithAI(req, signal) {
  if (!CONFIG.aiLive) {        // имитация без денег: ждём и возвращаем ручную подгонку
    await new Promise((ok, no) => { const t = setTimeout(ok, 3000); signal.addEventListener('abort', () => { clearTimeout(t); no(new DOMException('', 'AbortError')); }); });
    return { image: $('#tryon-canvas').toDataURL('image/jpeg', 0.85), demo: true };
  }
  const res = await fetch(CONFIG.api.refine, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo: req.photo, fabric: req.fabric, curtain: req.curtain }),
    signal,
  });
  let data = null;
  try { data = await res.json(); } catch { data = { error: 'not_json', message: 'сервер ответил не JSON — скорее всего, сайт запущен старой версией serve.ps1, перезапустите' }; }
  if (!res.ok || !data?.ok || !data.image) {
    const err = new Error(data?.message || 'HTTP ' + res.status);
    err.code = data?.error || 'http_' + res.status;
    throw err;
  }
  return data;                 // { ok, image: url, seconds, cost }
}

// Дожидаемся, пока картинка реально скачается, — чтобы не показать пустое место
function preloadImage(url, signal) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => ok(url);
    img.onerror = () => no(Object.assign(new Error('image load failed'), { code: 'image' }));
    signal.addEventListener('abort', () => { img.src = ''; no(new DOMException('', 'AbortError')); });
    img.src = url;
  });
}

// Экран ожидания: шаги, секунды, прогресс (плавно ползёт к 95 %, на финише — 100 %)
function startAiLoader() {
  const el = $('#ai-loader'), bar = $('#ai-bar'), stepEl = $('#ai-step'), timeEl = $('#ai-time'), inner = $('#stage-inner');
  const t0 = performance.now();
  let raf = 0, lastStep = -1, lastSec = -1;
  el.classList.remove('is-done');
  bar.style.transform = 'scaleX(0)';
  el.hidden = false;
  inner.classList.add('is-ai-busy');
  const tick = () => {
    const s = (performance.now() - t0) / 1000;
    bar.style.transform = `scaleX(${(0.95 * (1 - Math.exp(-s / 15))).toFixed(4)})`;
    const sec = Math.floor(s);
    if (sec !== lastSec) { lastSec = sec; timeEl.textContent = sec + ' с'; }
    const step = AI_STEPS.filter(([at]) => s >= at).length - 1;
    if (step !== lastStep) { lastStep = step; stepEl.textContent = AI_STEPS[step][1] + '…'; }
    raf = requestAnimationFrame(tick);
  };
  tick();
  return {
    done() {
      cancelAnimationFrame(raf);
      bar.style.transform = 'scaleX(1)';
      stepEl.textContent = 'Готово!';
      el.classList.add('is-done');
      inner.classList.remove('is-ai-busy');
      setTimeout(() => { el.hidden = true; }, 900);
    },
    stop() { cancelAnimationFrame(raf); el.hidden = true; inner.classList.remove('is-ai-busy'); },
  };
}

async function runAI() {
  if (aiAbort || !tryon.photo) return;
  const btn = $('#btn-ai');
  btn.disabled = true;
  hideAI();
  const req = buildAIRequest();
  const ctrl = new AbortController();
  aiAbort = ctrl;
  const loader = startAiLoader();
  try {
    const result = await refineWithAI(req, ctrl.signal);
    await preloadImage(result.image, ctrl.signal);
    loader.done();
    showAI(result.image, req.label);
    if (result.seconds) console.info(`[ИИ-примерка] ${result.seconds} с, ${result.cost ?? '?'} ₽`);
  } catch (err) {
    loader.stop();
    if (err.name === 'AbortError') return;
    console.warn('[ИИ-примерка]', err.code, err.message);
    // на тестовых адресах (localhost, trycloudflare) показываем техническую причину — посетители её не видят
    const debug = /^(localhost|127\.0\.0\.1)$|trycloudflare\.com$/.test(location.hostname) ? ` [для нас: ${err.code} — ${err.message}]` : '';
    notice((AI_ERRORS[err.code] || 'Не получилось сделать реалистичную версию. Попробуйте ещё раз или нажмите «Хочу так» — дизайнер пришлёт эскиз вручную.') + debug);
  } finally {
    if (aiAbort === ctrl) aiAbort = null;
    btn.disabled = !tryon.photo;
  }
}

function showAI(url, label) {
  const ai = $('#ai-result');
  ai.classList.remove('is-in'); void ai.offsetWidth;      // перезапуск анимации проявления
  ai.src = url;
  ai.hidden = false;
  ai.classList.add('is-in');
  tryon.aiImage = url;
  $('#stage-inner').classList.add('has-ai');
  $('#ai-caption').textContent = 'Так это может выглядеть у вас: ' + label;
  const text = `Здравствуйте! Примерил(а) шторы у вас на сайте: ${label}.\nВот как получилось: ${url}\nХочу узнать стоимость.`;
  $('#ai-wa').href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
  $('#ai-actions').hidden = false;
}

// Убрать результат нейросети и вернуться к ручной подгонке
function hideAI() {
  const inner = $('#stage-inner');
  if (inner.classList.contains('is-ai-before')) { tryon.showAfter = true; requestRender(); }
  inner.classList.remove('has-ai', 'is-ai-before');
  $('#ai-result').hidden = true;
  $('#ai-actions').hidden = true;
  const b = $('#ai-before');
  b.setAttribute('aria-pressed', 'false'); b.textContent = 'Было / стало';
}

function initAiResult() {
  $('#ai-cancel').addEventListener('click', () => aiAbort?.abort());
  $('#ai-close').addEventListener('click', hideAI);
  $('#btn-compare').addEventListener('click', () => { if (!$('#ai-result').hidden) hideAI(); }); // «До / после» — про ручную подгонку
  $('#ai-before').addEventListener('click', (e) => {
    const inner = $('#stage-inner');
    const before = !inner.classList.contains('is-ai-before');
    inner.classList.toggle('is-ai-before', before);
    e.currentTarget.setAttribute('aria-pressed', String(before));
    e.currentTarget.textContent = before ? 'Показать шторы' : 'Было / стало';
    tryon.showAfter = !before; tryon.dirty = true; renderTryon();   // «было» — чистое фото без штор
  });
  // сменили тип, ткань или ползунок — старая картинка нейросети уже не про это, убираем
  // (пока нейросеть работает, не трогаем: человек может присматривать следующую ткань)
  const changed = () => { if (!aiAbort && !$('#ai-result').hidden) hideAI(); };
  $('#type-pills').addEventListener('click', (e) => { if (e.target.closest('[data-type]')) changed(); });
  $('#swatches').addEventListener('click', (e) => { if (e.target.closest('[data-fabric]')) changed(); });
  $$('.range input').forEach((r) => r.addEventListener('input', changed));
}

/**
 * detectWindowAI(photoCanvas) — «Найти окно автоматически».
 * Сервер (CONFIG.api.detectWindow) запускает детектор окна (segmentation / keypoints)
 * и возвращает { corners: [[x,y],[x,y],[x,y],[x,y]] } в долях 0..1 — человек затем поправляет углы.
 */
async function detectWindowAI(photo) {
  if (CONFIG.demoMode) {
    await new Promise((r) => setTimeout(r, 1200));
    return [[0.22, 0.12], [0.78, 0.12], [0.78, 0.9], [0.22, 0.9]]; // демо-ответ
  }
  const res = await fetch(CONFIG.api.detectWindow, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo: photo.toDataURL('image/jpeg', 0.8) }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.corners || null;
}

/* ---------- 8. Экран 4 — бизнес ---------- */
// Окно с фото и описанием: общий шаблон для «Сложных окон» и кейсов «Для бизнеса»
function openShowcase(item, { label, cta, msg, stub }) {
  const ph = (t, i) => `<div class="ph ${i === 2 ? 'ph--peach' : ''} show__ph show__ph--${i}" data-label="${t}"></div>`;
  $('#biz-body').innerHTML = `
    <span class="biz__tag">${item.tag}</span>
    <h2 class="biz__title" id="biz-title">${item.title}</h2>
    ${stub ? '<p class="todo">кейс-заглушка — заменить на реальный объект и фото</p>' : ''}
    <div class="show">
      <div class="show__gallery">${item.photos.map(ph).join('')}</div>
      <div class="show__text">
        <p class="biz__desc">${item.desc}</p>
        <h3 class="biz__h">${label}</h3>
        <ul class="ticks">${item.did.map((t) => `<li>${icon('i-check')}<span>${t}</span></li>`).join('')}</ul>
        <button class="btn btn--pearl btn--lg" type="button" id="biz-cta">${cta}${icon('i-arrow')}</button>
      </div>
    </div>`;
  $('#biz-cta').addEventListener('click', () => {
    closeModal($('#biz-modal'));
    openContact(msg, cta, 'Сообщение уже готово — выберите мессенджер');
  });
  openModal($('#biz-modal'));
}

/* ---------- 8. Экран 4 — сложные окна и бизнес ---------- */
function initBusiness() {
  const pills = $('#biz-pills');
  pills.innerHTML = Object.entries(BUSINESS).map(([k, b]) => `<button type="button" data-biz="${k}" aria-haspopup="dialog">${b.tag}</button>`).join('');
  pills.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-biz]');
    if (!btn) return;
    const b = BUSINESS[btn.dataset.biz];
    openShowcase(b, { label: 'Что сделали', cta: 'Обсудить проект', stub: true,
      msg: `Здравствуйте! Интересует оформление текстилем: ${b.tag.toLowerCase()}. Хочу обсудить проект.` });
  });
  $('#win-chips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-win]');
    if (!btn) return;
    const w = WINDOWS[btn.dataset.win];
    openShowcase(w, { label: 'Как решаем', cta: 'Спросить про моё окно',
      msg: `Здравствуйте! У меня ${btn.textContent.trim()} окна — подскажите, какие шторы подойдут?` });
  });
}

/* ---------- 9. Экран 5 — кейсы до/после ---------- */
function initCases() {
  const track = $('#cases-track');
  if (!track) return; // блок «до / после» убран (24.11), на его месте — «Наш салон»
  track.innerHTML = CASES.map((c, i) => `
    <div class="case" role="group" aria-roledescription="слайд" aria-label="${i + 1} из ${CASES.length}">
      <div class="case__card glass">
        <div class="compare" style="--pos:50%">
          <div class="ph" data-label="Фото ДО: ${esc(c.room.toLowerCase())}, без штор"></div>
          <div class="ph compare__after" data-label="Фото ПОСЛЕ: ${esc(c.room.toLowerCase())}, ${esc(c.type)}"></div>
          <span class="compare__label compare__label--before">До</span>
          <span class="compare__label compare__label--after">После</span>
          <button class="compare__handle" type="button" role="slider" aria-label="Сравнение до и после" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
            <span>${icon('i-arrow', 'ico flip')}${icon('i-arrow')}</span>
          </button>
        </div>
        <div class="case__cap">
          <span>${esc(c.room)} · ${esc(c.district)} · ${esc(c.type)}</span>
          <span class="case__meta" ${CASES_SHOW_META && (c.price || c.term) ? '' : 'hidden'}>${esc(c.price)}${c.price && c.term ? ' · ' : ''}${esc(c.term)}</span>
        </div>
      </div>
    </div>`).join('');

  // ползунок сравнения: тянем «штору»
  $$('.compare', track).forEach((cmp) => {
    const handle = $('.compare__handle', cmp);
    const setPos = (p) => { p = clamp(p, 0, 100); cmp.style.setProperty('--pos', p + '%'); handle.setAttribute('aria-valuenow', Math.round(p)); };
    const fromEvent = (e) => { const r = cmp.getBoundingClientRect(); setPos(((e.clientX - r.left) / r.width) * 100); };
    handle.addEventListener('pointerdown', (e) => { e.stopPropagation(); handle.setPointerCapture(e.pointerId); });
    handle.addEventListener('pointermove', (e) => { if (handle.hasPointerCapture(e.pointerId)) fromEvent(e); });
    cmp.addEventListener('click', (e) => { if (!e.target.closest('.compare__handle') && !moved) fromEvent(e); });
    handle.addEventListener('keydown', (e) => {
      const cur = +handle.getAttribute('aria-valuenow');
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPos(cur - 5); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPos(cur + 5); }
    });
  });

  // карусель: стрелки, счётчик, свайп
  let index = 0;
  let moved = false;
  const go = (i) => {
    index = (i + CASES.length) % CASES.length;
    track.style.transform = `translateX(${-index * 100}%)`;
    $('#case-count').textContent = `${index + 1} / ${CASES.length}`;
    $$('.case', track).forEach((s, k) => s.setAttribute('aria-hidden', String(k !== index)));
    $$('.case', track).forEach((s, k) => $$('button', s).forEach((b) => { b.tabIndex = k === index ? 0 : -1; }));
  };
  $('#case-prev').addEventListener('click', () => go(index - 1));
  $('#case-next').addEventListener('click', () => go(index + 1));
  const box = $('#cases');
  let x0 = null, y0 = null;
  box.addEventListener('pointerdown', (e) => { if (e.target.closest('.compare__handle')) return; x0 = e.clientX; y0 = e.clientY; moved = false; });
  box.addEventListener('pointermove', (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 10) moved = true; });
  box.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
    x0 = null;
    setTimeout(() => { moved = false; }, 0);
  });
  box.addEventListener('pointercancel', () => { x0 = null; });
  go(0);
}

/* ---------- 10. Экран 6 — отзывы ---------- */
function stars(n) { return `<span class="stars" aria-label="Оценка ${n} из 5">${Array.from({ length: 5 }, (_, i) => icon('i-star', 'ico' + (i < n ? '' : ' off'))).join('')}</span>`; }
const sampleMark = () => (CONFIG.showSampleMarks ? '<span class="sample-mark">образец</span>' : '');
function renderReviews(platform) {
  $('#reviews-panel').dataset.platform = platform;
  $('#platform-tabs').dataset.platform = platform;
  $('#all-reviews').href = CONFIG.maps[platform];
  // рейтинг площадки (ноябрь 2026): 2ГИС — 4,9, Яндекс Карты — 4,8
  const rate = { gis: ['4,9', 'средняя оценка в 2ГИС'], yandex: ['4,8', 'средняя оценка в Яндекс Картах'] }[platform];
  const num = $('.score__num'), cap = $('.score__cap');
  if (num) { num.textContent = rate[0]; num.setAttribute('aria-label', `Средняя оценка ${rate[0]} из 5`); }
  if (cap) cap.textContent = rate[1];
  const list = REVIEWS[platform];
  let shown = 0;
  const box = $('#review-list');
  box.innerHTML = '';
  let more = $('#reviews-more');
  if (!more) {
    more = document.createElement('button');
    more.type = 'button'; more.id = 'reviews-more'; more.className = 'btn btn--glass btn--sm reviews-more';
    box.after(more);
  }
  const step = () => {
    const part = list.slice(shown, shown + 4);
    box.insertAdjacentHTML('beforeend', part.map((r, i) => `
    <article class="review" style="animation-delay:${i * 70}ms">
      <div class="review__head"><span class="review__name">${esc(r.name)}</span>${stars(r.stars)}</div>
      <span class="review__date">${esc(r.date)}</span> ${sampleMark()}
      <p>${esc(r.text)}</p>
    </article>`).join(''));
    shown += part.length;
    const left = list.length - shown;
    more.hidden = left <= 0;
    more.textContent = `Показать ещё отзывы (${left})`;
  };
  more.onclick = step;
  step();
}
function initReviews() {
  renderReviews('gis');
  initSeg($('#platform-tabs'), (b) => renderReviews(b.dataset.platform));
  const msgBox = $('#messages'); if (!msgBox) return;
  msgBox.innerHTML = PERSONAL.map((m) => `
    <article class="message glass reveal">
      <p>${esc(m.text)}</p>
      <div class="message__meta"><span>${esc(m.from)} · ${esc(m.via)} ${CONFIG.showMessageSampleMarks ? '<span class="sample-mark">образец</span>' : ''}</span><span>${esc(m.time)}</span></div>
    </article>`).join('');
}

/* ---------- 11. Экран 7 — подарки и сертификаты ---------- */
function initGifts() {
  $('#gift-grid').innerHTML = GIFTS.map((g, i) => `
    <button class="gift glass reveal" type="button" data-gift="${i}" style="--d:${i * 70}ms">
      <span class="ph ph--peach" data-label="${esc(g.photo)}"></span>
      <span class="gift__body"><span class="gift__name">${esc(g.name)}</span><span class="gift__price">от ${rub(g.price)}</span></span>
    </button>`).join('');
  $('#gift-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-gift]');
    if (!b) return;
    const g = GIFTS[+b.dataset.gift];
    openContact(`Здравствуйте! Хочу подарок «${g.name}». Подскажите, что есть в наличии?`, 'Заказать подарок', 'Сообщение уже готово — выберите мессенджер');
  });

  // номинал сертификата
  const pills = $('#cert-pills');
  pills.addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (!b) return;
    $$('[data-value]', pills).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    const custom = b.dataset.value === 'custom';
    $('#cert-custom').hidden = !custom;
    if (custom) $('#cert-sum').focus();
  });
  radioKeys(pills);
  $('#cert-btn').addEventListener('click', () => {
    const sel = $('[aria-checked="true"]', pills).dataset.value;
    const sum = sel === 'custom' ? +$('#cert-sum').value : +sel;
    if (sel === 'custom' && (!sum || sum < 500)) { $('#cert-sum').focus(); $('#cert-sum').setCustomValidity('Минимум 500 ₽'); $('#cert-sum').reportValidity(); return; }
    $('#cert-sum').setCustomValidity('');
    openLead('gift-cert', { title: `Сертификат на ${rub(sum)}`, lead: 'Подготовим сертификат к вашему визиту. Оформление и оплата — в салоне.', extra: { amount: sum } });
  });
}

/* ---------- 12. Формы и sendLead() ---------- */
/**
 * sendLead(type, data) — единая отправка заявок.
 * type: 'tryon' | 'coupon' | 'gift-cert' | …; data: { name, contact, consent, ...extra }
 *
 * КУДА ПОДКЛЮЧАТЬ: POST на CONFIG.api.lead — серверная функция (Yandex Cloud Function / свой сервер),
 * которая шлёт сообщение в Telegram-бота владельца:
 *   - текст: тип заявки, имя, контакт, параметры (ткань, тип штор, номинал…);
 *   - если есть data.image — отправить методом sendPhoto (картинка примерки);
 *   - токен бота хранится ТОЛЬКО на сервере (переменная окружения), не в этом файле.
 * Ответ сервера: { ok: true }.
 */
async function sendLead(type, data) {
  const payload = { type, ...data, page: location.href, sentAt: new Date().toISOString() };
  if (CONFIG.demoMode) {
    // TODO: подключить отправку — сейчас заявка никуда не уходит, только в консоль
    console.info('[demo] sendLead', type, { ...payload, image: payload.image ? '(картинка)' : undefined });
    await new Promise((r) => setTimeout(r, 700));
    return { ok: true, demo: true };
  }
  const res = await fetch(CONFIG.api.lead, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('lead failed: ' + res.status);
  return res.json();
}

// Проверка полей с человеческими сообщениями
function validate(form) {
  let ok = true;
  const setErr = (field, msg) => {
    const wrap = field.closest('.field');
    const err = wrap ? $('.field__err', wrap) : $(`[data-err="${field.name}"]`, form);
    wrap?.classList.toggle('is-error', !!msg);
    if (err) err.textContent = msg;
    if (msg && ok) { field.focus(); ok = false; }
  };
  const { elements: el } = form;
  setErr(el.name, el.name.value.trim().length < 2 ? 'Напишите, как к вам обращаться' : '');
  const contact = el.contact.value.trim();
  const isPhone = contact.replace(/\D/g, '').length >= 10;
  const isNick = /^@?[a-zA-Z0-9_]{4,}$/.test(contact);
  setErr(el.contact, !isPhone && !isNick ? 'Укажите телефон или ник в мессенджере, чтобы мы могли ответить' : '');
  setErr(el.consent, !el.consent.checked ? 'Нужно согласие на обработку данных' : '');
  return ok;
}
const formData = (form) => ({ name: form.elements.name.value.trim(), contact: form.elements.contact.value.trim(), consent: form.elements.consent.checked });

let leadContext = { type: 'lead', extra: {} };
function openLead(type, { title, lead, preview, extra = {} }) {
  leadContext = { type, extra };
  $('#lead-title').textContent = title;
  $('#lead-lead').textContent = lead;
  const img = $('#lead-preview');
  img.hidden = !preview;
  if (preview) img.src = preview;
  $('#lead-form').hidden = false;
  $('#lead-done').hidden = true;
  openModal($('#lead-modal'));
}

function initForms() {
  const leadForm = $('#lead-form');
  leadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate(leadForm)) return;
    const btn = $('button[type="submit"]', leadForm);
    btn.classList.add('is-loading'); btn.textContent = 'Отправляем…';
    try {
      await sendLead(leadContext.type, { ...formData(leadForm), ...leadContext.extra });
      leadForm.hidden = true;
      $('#lead-done').hidden = false;
      leadForm.reset();
    } catch {
      notice('Не удалось отправить. Позвоните нам: ' + CONFIG.phones[0].label);
    } finally {
      btn.classList.remove('is-loading'); btn.textContent = 'Отправить';
    }
  });

  const coupon = $('#coupon-form');
  coupon.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate(coupon)) return;
    const btn = $('button[type="submit"]', coupon);
    btn.classList.add('is-loading'); btn.textContent = 'Готовим промокод…';
    // ВРЕМЕННО: код генерируется в браузере. Лучше выдавать его с сервера и проверять в салоне/UDS
    const code = 'SHT-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    try {
      await sendLead('coupon', { ...formData(coupon), code });
      $('#promo-code').textContent = code;
      coupon.hidden = true;
      const promo = $('#promo');
      promo.hidden = false;
      promo.focus();
      store.set('promo', code);
    } catch {
      notice('Не удалось отправить. Позвоните нам: ' + CONFIG.phones[0].label);
    } finally {
      btn.classList.remove('is-loading'); btn.textContent = 'Получить 1000 ₽';
    }
  });
  // если код уже получен в этой сессии — показываем его
  const saved = store.get('promo');
  if (saved) { $('#promo-code').textContent = saved; coupon.hidden = true; $('#promo').hidden = false; }

  // сбрасываем ошибку при вводе
  document.addEventListener('input', (e) => {
    const f = e.target.closest('.field');
    if (f?.classList.contains('is-error')) { f.classList.remove('is-error'); $('.field__err', f).textContent = ''; }
  });
}

/* ---------- 13. Появление при прокрутке и старт ---------- */
function initReveal() {
  const els = $$('.reveal').filter((el) => !el.closest('.hero')); // первый экран раскрывается вместе со шторами
  // поочерёдное появление соседей
  els.forEach((el) => {
    if (el.style.getPropertyValue('--d')) return;
    const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    const i = sibs.indexOf(el);
    if (i > 0) el.style.setProperty('--d', `${Math.min(i, 6) * 70}ms`);
  });
  if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  els.forEach((el) => io.observe(el));
}

function initFooter() {
  $$('[data-messengers]').forEach((c) => renderMessengers(c));
  $('#map-link').href = CONFIG.maps.yandex;
  $('#year').textContent = new Date().getFullYear();
}

initGlassMode();
window.__appReady = true;
document.addEventListener('DOMContentLoaded', () => {
  initBackground();
  initGlassPointer();
  initHeader();
  initModals();
  initHits();
  initTextile();
  initStrongMagnet();
  initTryon();
  initBusiness();
  initCases();
  initReviews();
  initGifts();
  initForms();
  initFooter();
  initDeco();
  initReveal();               // после рендера карточек — чтобы новые .reveal тоже появились
  initCurtains(initToast);
});


// UDS: ставим ссылку из CONFIG.uds; пока ссылки нет — карточка ведёт к контактам в той же вкладке
(() => {
  const a = document.getElementById('uds-link');
  if (!a) return;
  if (CONFIG.uds) { a.href = CONFIG.uds; }
  else { a.href = '#contacts'; a.removeAttribute('target'); a.removeAttribute('rel'); }
})();
