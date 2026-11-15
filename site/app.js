/* =========================================================
   шторКа — логика лендинга (чистый JS, без зависимостей)
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
    { raw: '+79849268771', label: '+7 984 926-87-71' }, // ПРОВЕРИТЬ
    { raw: '+79843582582', label: '+7 984 358-25-82' }, // ПРОВЕРИТЬ
  ],
  whatsapp: '79849268771',                // номер для wa.me без «+»
  telegram: 'shtorka_irk',                // ЗАМЕНИТЬ: username Telegram без «@»
  max: 'https://max.ru/',                 // ЗАМЕНИТЬ: ссылка на профиль/чат в MAX
  maps: {
    yandex: 'https://yandex.ru/maps/63/irkutsk/?text=%D1%88%D1%82%D0%BE%D1%80%D0%9A%D0%B0%20%D0%A4.%20%D0%AD%D0%BD%D0%B3%D0%B5%D0%BB%D1%8C%D1%81%D0%B0%2034', // ЗАМЕНИТЬ на карточку организации
    gis: 'https://2gis.ru/irkutsk/search/%D1%88%D1%82%D0%BE%D1%80%D0%9A%D0%B0',       // ЗАМЕНИТЬ на карточку организации
  },
  api: {
    // Серверный прокси (например, Yandex Cloud Function). Ключи нейросети и токен бота — ТОЛЬКО на сервере.
    refine: '/api/refine',          // POST → { image: url|dataURL }
    detectWindow: '/api/detect-window', // POST → { corners: [[x,y]×4] } в долях 0..1
    lead: '/api/lead',              // POST → { ok: true }
  },
  demoMode: true,          // true — сервера ещё нет: формы и нейросеть работают как имитация
  demoPhoto: '',           // путь к демо-фото комнаты для примерочной, например 'assets/demo-room.jpg'
  showSampleMarks: true,   // метка «образец» на отзывах-заглушках; выключить, когда вставите реальные отзывы
  toastDelay: 1500,        // через сколько мс после открытия штор показать «Дарим 1000 ₽»
};

/* ---------- 1. ДАННЫЕ ---------- */
// Хиты салона. Меняйте свободно: cat — curtains | bedding | plaids | kids; badge — hit | stock | kids | new
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
const BUSINESS = {
  cafe: {
    tag: 'Кафе и рестораны', title: 'Текстиль для кафе', price: 'от 25 000 ₽', term: 'от 10 дней',
    desc: 'Шторы, скатерти и салфетки в стиле заведения. Подбираем ткани, которые выдерживают частые стирки и не впитывают запахи.',
    items: [
      { name: 'Шторы для зала', price: 'от 4 500 ₽/окно', text: 'Огнестойкие и износостойкие ткани' },
      { name: 'Скатерти и дорожки', price: 'от 1 200 ₽/шт.', text: 'Пропитка от пятен' },
      { name: 'Салфетки', price: 'от 250 ₽/шт.', text: 'Хлопок и смесовые ткани' },
    ],
    includes: ['Выезд и замер', 'Подбор тканей под интерйер', 'Пошив партии', 'Навеска и отпаривание'],
    examples: ['Кофейня на 6 окон — римские шторы и салфетки в цвет логотипа', 'Ресторан — портьеры для VIP-зала с затемнением'],
  },
  office: {
    tag: 'Офисы', title: 'Шторы для офиса', price: 'от 18 000 ₽', term: 'от 7 дней',
    desc: 'Рулонные и римские шторы, которые защищают мониторы от бликов и выглядят аккуратно. Работаем по договору, с закрывающими документами.',
    items: [
      { name: 'Рулонные шторы', price: 'от 2 900 ₽/шт.', text: 'Блэкаут и «день-ночь»' },
      { name: 'Римские шторы', price: 'от 3 800 ₽/шт.', text: 'Для переговорных и кабинетов' },
      { name: 'Портьеры для переговорной', price: 'от 6 000 ₽/окно', text: 'Полное затемнение для презентаций' },
    ],
    includes: ['Замер всех помещений', 'Смета и договор', 'Пошив и монтаж в нерабочее время', 'Гарантия на работы'],
    examples: ['IT-офис: 24 рулонные шторы за выходные', 'Переговорная: блэкаут на моторизованном карнизе'],
  },
  hotel: {
    tag: 'Гостиницы и хостелы', title: 'Текстиль для гостиниц', price: 'от 40 000 ₽', term: 'от 14 дней',
    desc: 'Бельё, полотенца, покрывала и шторы для номеров — одной партией, в одной стилистике и с запасом на ротацию.',
    items: [
      { name: 'Комплекты белья', price: 'от 2 600 ₽/компл.', text: 'Страйп-сатин и перкаль' },
      { name: 'Полотенца', price: 'от 450 ₽/шт.', text: 'Махра 450–550 г/м²' },
      { name: 'Шторы блэкаут', price: 'от 5 500 ₽/номер', text: 'Для крепкого сна гостей' },
      { name: 'Покрывала и пледы', price: 'от 3 500 ₽/шт.', text: 'Под стиль номеров' },
    ],
    includes: ['Расчёт на номерной фонд', 'Образцы до заказа', 'Поставка партиями', 'Дозаказ в тех же цветах'],
    examples: ['Мини-отель на 12 номеров — полный комплект текстиля', 'Хостел — шторы-перегородки для кроватей'],
  },
  salon: {
    tag: 'Салоны и клиники', title: 'Текстиль для салонов и клиник', price: 'от 15 000 ₽', term: 'от 7 дней',
    desc: 'Шторы, ширмы и полотенца, которые легко стираются и выглядят опрятно каждый день.',
    items: [
      { name: 'Шторы и ширмы', price: 'от 3 500 ₽/шт.', text: 'Моющиеся ткани' },
      { name: 'Полотенца с вышивкой', price: 'от 600 ₽/шт.', text: 'Логотип салона' },
      { name: 'Пледы для зоны ожидания', price: 'от 2 200 ₽/шт.', text: 'Мягкие и практичные' },
    ],
    includes: ['Подбор под санитарные требования', 'Вышивка логотипа', 'Пошив и навеска'],
    examples: ['Стоматология — шторы-ширмы в кабинеты', 'Салон красоты — полотенца с логотипом'],
  },
  gifts: {
    tag: 'Корпоративные подарки', title: 'Подарки сотрудникам и партнёрам', price: 'от 2 000 ₽/набор', term: 'от 5 дней',
    desc: 'Пледы, полотенца и наборы для дома в фирменной упаковке. Можно добавить вышивку или открытку.',
    items: [
      { name: 'Плед в упаковке', price: 'от 2 500 ₽', text: 'С лентой и открыткой' },
      { name: 'Набор полотенец', price: 'от 2 000 ₽', text: 'Вышивка по запросу' },
      { name: 'Комплект белья', price: 'от 5 900 ₽', text: 'Подарочная коробка' },
    ],
    includes: ['Подбор под бюджет', 'Упаковка и открытки', 'Доставка в офис по Иркутску'],
    examples: ['50 пледов с вышивкой к Новому году', 'Наборы полотенец для партнёров'],
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
const REVIEWS = {
  yandex: [
    { name: 'Анна', date: 'октябрь 2026', stars: 5, text: 'Заказывали шторы в спальню: помогли подобрать ткань, приехали на замер, через неделю всё повесили. Качество пошива отличное.' },
    { name: 'Марина', date: 'сентябрь 2026', stars: 5, text: 'Очень приятный салон, большой выбор белья. Девушки-консультанты подсказали размер одеяла и подобрали комплект в тон.' },
    { name: 'Сергей', date: 'сентябрь 2026', stars: 5, text: 'Нужны были шторы на эркер, в двух местах отказали. Здесь сделали карниз по форме и сшили всё аккуратно.' },
    { name: 'Ольга', date: 'август 2026', stars: 4, text: 'Хороший тюль и адекватные цены. Пришлось подождать навеску пару дней, но результат понравился.' },
  ],
  gis: [
    { name: 'Екатерина', date: 'октябрь 2026', stars: 5, text: 'Отправила фото комнаты в WhatsApp — в тот же день прислали варианты и цену. Очень удобно.' },
    { name: 'Дмитрий', date: 'октябрь 2026', stars: 5, text: 'Покупали плед и полотенца в подарок, красиво упаковали. Рекомендую.' },
    { name: 'Наталья', date: 'сентябрь 2026', stars: 5, text: 'Шили римские шторы на кухню. Всё по размеру, ткань не выгорает. Буду заказывать ещё в детскую.' },
    { name: 'Ирина', date: 'июль 2026', stars: 5, text: 'Уютный салон в «Октябрьском», всегда есть новинки. Бонусы в UDS — приятный плюс.' },
  ],
};
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
  const weak = cores <= 4 || mem <= 3 || navigator.connection?.saveData;
  if (weak) html.classList.add('lite');                 // упрощённое стекло
  else if (isChromium && !reduceMotion()) html.classList.add('refract'); // преломление через SVG-фильтр
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
  process: [{ t: 'blob', x: 10, y: 55, s: 48, c: '#BFE6DA' }, { t: 'blob', x: 85, y: 30, s: 46, c: '#FAD2BB' }],
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
  const links = $$('.nav a');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  ['hits', 'tryon', 'process', 'reviews', 'gifts', 'contacts'].forEach((id) => { const s = document.getElementById(id); if (s) io.observe(s); });
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

// Хореография первого экрана: панель → метка → заголовок по словам → текст → кнопки; карточки фото — следом
function revealHero() {
  const words = $$('.hero__title .w').length;
  const tTitle = 160, tAfter = tTitle + words * 55 + 120;
  const plan = [
    ['.hero__text', 0], ['.hero .chip', 90], ['.hero__title', tTitle],
    ['.hero__lead', tAfter], ['.hero__actions', tAfter + 110], ['.hero .rating-badge', tAfter + 220],
    ['.hero .m1', 320], ['.hero .m2', 470], ['.hero .m3', 620],
  ];
  plan.forEach(([sel, d]) => { const el = $(sel); if (el) el.style.setProperty('--d', reduceMotion() ? '0ms' : `${d}ms`); });
  $$('.hero .reveal').forEach((el) => el.classList.add('is-in'));
}

// Шторы с физикой (curtains.js). Если модуль не загрузился — просто показываем первый экран
function initCurtains(onDone) {
  splitHeroTitle();
  const canvas = $('#curtain-canvas');
  if (!window.Curtains || !canvas) { revealHero(); onDone?.(); return; }
  window.Curtains.init({
    canvas,
    onOpenStart: revealHero,          // шторы разошлись на треть — проявляется текст
    onSettled: onDone,
  });
}

function initToast() {
  const toast = $('#toast');
  if (store.get('toast-closed')) return;
  setTimeout(() => { toast.hidden = false; }, reduceMotion() ? 1500 : CONFIG.toastDelay);
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
}

// Ссылки мессенджеров. text — готовое сообщение (например, «Есть ли в наличии …?»)
function messengerLinks(text = '') {
  const t = encodeURIComponent(text);
  return [
    { key: 'wa', label: 'WhatsApp', icon: 'i-wa', href: `https://wa.me/${CONFIG.whatsapp}${text ? `?text=${t}` : ''}` },
    { key: 'tg', label: 'Telegram', icon: 'i-tg', href: `https://t.me/${CONFIG.telegram}`, copy: !!text }, // Telegram не подставляет текст в личный чат — копируем в буфер
    { key: 'max', label: 'MAX', icon: 'i-max', href: CONFIG.max, copy: !!text },
    { key: 'phone', label: 'Позвонить', icon: 'i-phone', href: `tel:${CONFIG.phones[0].raw}` },
  ];
}
function renderMessengers(container, text = '') {
  container.innerHTML = messengerLinks(text).map((m) =>
    `<a class="msgr msgr--${m.key}" href="${m.href}" ${m.key !== 'phone' ? 'target="_blank" rel="noopener"' : ''} ${m.copy ? 'data-copy' : ''}>${icon(m.icon)}<span>${m.label}</span></a>`
  ).join('');
}

function openContact(text = '', title = 'Напишите нам', lead = 'Ответим в течение 15 минут в рабочее время') {
  const dlg = $('#contact-modal');
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

function renderProducts(cat) {
  const wrap = $('#products');
  const list = PRODUCTS.filter((p) => p.cat === cat);
  wrap.innerHTML = list.map((p, i) => {
    const [label, cls] = BADGES[p.badge] || BADGES.hit;
    return `<button class="product glass" type="button" data-i="${PRODUCTS.indexOf(p)}" style="animation-delay:${i * 60}ms">
      <span class="badge ${cls}">${label}</span>
      <span class="ph" data-label="${esc(p.photo)}"></span>
      <span class="product__body">
        <span class="product__name">${esc(p.name)}</span>
        <span class="product__row">
          <span class="product__price">от ${rub(p.price)} ${p.unit ? `<small>${esc(p.unit)}</small>` : ''}</span>
          <span class="product__cta" aria-hidden="true">Отложить</span>
        </span>
      </span>
    </button>`;
  }).join('');
}

function initHits() {
  renderProducts('curtains');
  initSeg($('#hits-tabs'), (btn) => renderProducts(btn.dataset.cat));
  $('#products').addEventListener('click', (e) => {
    const card = e.target.closest('.product');
    if (!card) return;
    const p = PRODUCTS[+card.dataset.i];
    const [label, cls] = BADGES[p.badge] || BADGES.hit;
    $('#product-badge').className = 'badge ' + cls;
    $('#product-badge').textContent = label;
    $('#product-title').textContent = p.name;
    $('#product-price').textContent = `от ${rub(p.price)}${p.unit ? ' ' + p.unit : ''}`;
    $('#product-desc').textContent = p.desc;
    $('#product-ph').dataset.label = p.photo;
    $('#product-ask').onclick = () => {
      closeModal($('#product-modal'));
      openContact(`Здравствуйте! Есть ли в наличии «${p.name}»?`, 'Спросить о наличии', 'Сообщение уже готово — выберите мессенджер');
    };
    openModal($('#product-modal'));
  });
}

/* ---------- 7. Экран 3 — примерочная ---------- */
/*
  Слой 1 — ручная подгонка, всё в браузере:
  - фото рисуется в <canvas>, поверх — текстура штор, сгенерированная кодом под выбранный тип/ткань;
  - текстура натягивается на 4 угла (перспективная трансформация через гомографию + разбиение на треугольники),
    поэтому итоговую картинку можно выгрузить одним toDataURL() и отправить с заявкой.
  Слой 2 — нейросеть: refineWithAI() и detectWindowAI() (заглушки, см. ниже).
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
    $('#ai-result').hidden = true;
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
      $('#ai-result').hidden = true;
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
    $('#ai-result').hidden = true;
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

  $('#btn-ai').addEventListener('click', async () => {
    const loader = $('#ai-loader');
    loader.hidden = false;
    $('#btn-ai').disabled = true;
    try {
      const result = await refineWithAI(buildAIPayload());
      if (result?.image) {
        const ai = $('#ai-result');
        ai.src = result.image;
        ai.hidden = false;
        tryon.aiImage = result.image;
      }
    } catch (err) {
      console.error(err);
      notice('Не получилось улучшить фото. Попробуйте ещё раз или оставьте заявку — дизайнер пришлёт эскиз вручную.');
    } finally {
      loader.hidden = true;
      $('#btn-ai').disabled = false;
    }
  });

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

// Маска окна: белый четырёхугольник на чёрном, тот же размер, что у фото
function buildMask() {
  const c = document.createElement('canvas');
  c.width = tryon.photo.width; c.height = tryon.photo.height;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.beginPath();
  tryon.corners.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, x * c.width, y * c.height));
  g.closePath(); g.fill();
  return c.toDataURL('image/png');
}

function buildAIPayload() {
  return {
    photo: tryon.photo.toDataURL('image/jpeg', 0.9),  // исходное фото без штор
    mask: buildMask(),                                 // где рисовать (зона окна)
    corners: tryon.corners,                            // углы окна в долях 0..1 (TL, TR, BR, BL)
    preview: $('#tryon-canvas').toDataURL('image/jpeg', 0.8), // ручная примерка — подсказка по композиции
    curtain: {
      type: tryon.type,                                // portieres | tulle | combo | roman | roller
      fabric: { name: tryon.fabric.name, color: tryon.fabric.color, kind: tryon.fabric.kind },
      fullness: tryon.fullness,
      lift: tryon.lift,
      tulleOpacity: tryon.tulleOpacity,
    },
  };
}

/**
 * refineWithAI(payload) — доработка примерки нейросетью (слой 2).
 *
 * ВАЖНО: ключи API нейросети на фронтенде НЕ храним. Запрос идёт на свой серверный прокси
 * (CONFIG.api.refine), например Yandex Cloud Function / свой Node-сервер. Прокси:
 *   1) проверяет размер и тип картинок, ставит лимит запросов по IP (защита от накрутки);
 *   2) вызывает модель inpainting/image-edit (например, Stable Diffusion + ControlNet, FLUX Fill,
 *      YandexART или аналог), передавая:
 *        - image  = payload.photo   (исходное фото),
 *        - mask   = payload.mask    (белое — зона окна, где можно рисовать),
 *        - prompt = собирается на сервере из payload.curtain, например:
 *          "photorealistic {type} curtains, {fabric.kind} fabric, color {fabric.color},
 *           natural folds, soft daylight from window, realistic shadows, curtain rod, interior photo";
 *        - control/reference = payload.preview (ручная примерка задаёт композицию);
 *   3) возвращает JSON { image: "https://…/result.jpg" } или dataURL.
 *
 * Время ответа 10–30 с — поэтому на фронте показывается индикатор #ai-loader.
 */
async function refineWithAI(payload) {
  if (CONFIG.demoMode) {
    // Имитация: сервера ещё нет — ждём и возвращаем ручную примерку
    await new Promise((r) => setTimeout(r, 2500));
    console.info('[demo] refineWithAI payload:', { ...payload, photo: '…', mask: '…', preview: '…' });
    return { image: payload.preview, demo: true };
  }
  const res = await fetch(CONFIG.api.refine, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('refine failed: ' + res.status);
  return res.json(); // { image }
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
function initBusiness() {
  const pills = $('#biz-pills');
  pills.innerHTML = Object.entries(BUSINESS).map(([k, b]) => `<button type="button" data-biz="${k}" aria-haspopup="dialog">${b.tag}</button>`).join('');
  pills.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-biz]');
    if (!btn) return;
    const b = BUSINESS[btn.dataset.biz];
    $('#biz-body').innerHTML = `
      <span class="biz__tag">${b.tag}</span>
      <h2 class="biz__title" id="biz-title">${b.title} — ${b.price}</h2>
      <p class="biz__meta">Сроки: ${b.term} <span class="todo">· цены уточнить</span></p>
      <p class="biz__desc">${b.desc}</p>
      <h3 class="biz__h">Что можно заказать</h3>
      <div class="biz__items">${b.items.map((it) => `<div class="biz__item"><b>${it.name}</b><p class="price">${it.price}</p><p>${it.text}</p></div>`).join('')}</div>
      <div class="biz__cols">
        <div><h3 class="biz__h">Что входит</h3><ul class="ticks">${b.includes.map((t) => `<li>${icon('i-check')}<span>${t}</span></li>`).join('')}</ul></div>
        <div><h3 class="biz__h">Примеры задач</h3><ul class="cases-mini">${b.examples.map((t) => `<li>${t}</li>`).join('')}</ul></div>
      </div>
      <button class="btn btn--pearl btn--lg" type="button" id="biz-cta" style="margin-top:20px">Обсудить проект${icon('i-arrow')}</button>`;
    $('#biz-cta').addEventListener('click', () => {
      closeModal($('#biz-modal'));
      openContact(`Здравствуйте! Интересует оформление текстилем: ${b.tag.toLowerCase()}. Хочу обсудить проект.`, 'Обсудить проект', 'Сообщение уже готово — выберите мессенджер');
    });
    openModal($('#biz-modal'));
  });
}

/* ---------- 9. Экран 5 — кейсы до/после ---------- */
function initCases() {
  const track = $('#cases-track');
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
  $('#review-list').innerHTML = REVIEWS[platform].map((r, i) => `
    <article class="review" style="animation-delay:${i * 70}ms">
      <div class="review__head"><span class="review__name">${esc(r.name)}</span>${stars(r.stars)}</div>
      <span class="review__date">${esc(r.date)}</span> ${sampleMark()}
      <p>${esc(r.text)}</p>
    </article>`).join('');
}
function initReviews() {
  renderReviews('yandex');
  initSeg($('#platform-tabs'), (b) => renderReviews(b.dataset.platform));
  $('#messages').innerHTML = PERSONAL.map((m) => `
    <article class="message glass reveal">
      <p>${esc(m.text)}</p>
      <div class="message__meta"><span>${esc(m.from)} · ${esc(m.via)} ${sampleMark()}</span><span>${esc(m.time)}</span></div>
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
