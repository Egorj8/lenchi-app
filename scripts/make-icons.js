// Генерация иконок Lenchi Studio: жёлтый флакон лака с рукописной «L» (шрифт Pristina из Windows).
// Запуск из корня проекта: npx -p sharp node scripts/make-icons.js .
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const app = process.argv[2];
const assets = path.join(app, 'assets');
const pub = path.join(app, 'public');
fs.mkdirSync(pub, { recursive: true });

// Флакон в координатах 0..64 (как на визитке)
const bottle = (fill = 'url(#polish)', cap = 'url(#cap)', neck = '#5a5d63', shine = true) => `
  <rect x="25" y="4" width="14" height="22" rx="3" fill="${cap}"/>
  <rect x="22" y="24" width="20" height="6" rx="2" fill="${neck}"/>
  <path d="M16 36c0-4 3-7 7-7h18c4 0 7 3 7 7v16c0 5-4 8-8 8H24c-4 0-8-3-8-8V36z" fill="${fill}"/>
  ${shine ? `<path d="M19.5 37c0-2 1.5-3.5 3.5-3.5h2.5v4.5h-6z" fill="#fff" opacity="0.4"/>
  <circle cx="42" cy="55" r="1" fill="#fff" opacity="0.6"/>
  <text x="32" y="54.5" text-anchor="middle" font-family="Pristina" font-size="27"
    fill="#1a1b1e" stroke="#1a1b1e" stroke-width="0.35" stroke-linejoin="round">L</text>` : ''}`;

const defs = `
  <defs>
    <linearGradient id="polish" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe36e"/><stop offset="0.55" stop-color="#ffc61a"/><stop offset="1" stop-color="#f0a500"/>
    </linearGradient>
    <linearGradient id="cap" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#55585f"/><stop offset="0.5" stop-color="#8a8d94"/><stop offset="1" stop-color="#45474d"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.62" r="0.5">
      <stop offset="0" stop-color="#ffc61a" stop-opacity="0.35"/><stop offset="1" stop-color="#ffc61a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2c30"/><stop offset="1" stop-color="#1a1b1e"/>
    </linearGradient>
  </defs>`;

// scale — доля холста под флакон; withBg — тёмный фон со свечением
function svg(size, { scale = 0.7, withBg = true, round = 0, mono = false } = {}) {
  const s = (size * scale) / 64;
  const off = (size - 64 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${defs}
    ${withBg ? `<rect width="${size}" height="${size}" rx="${round}" fill="url(#bg)"/>
    <rect width="${size}" height="${size}" rx="${round}" fill="url(#glow)"/>` : ''}
    <g transform="translate(${off} ${off}) scale(${s})">
      ${mono ? bottle('#fff', '#fff', '#fff', false) : bottle()}
    </g>
  </svg>`;
}

const out = (file, data) => sharp(Buffer.from(data)).png().toFile(file);

(async () => {
  await out(path.join(assets, 'icon.png'), svg(1024));
  await out(path.join(assets, 'splash-icon.png'), svg(1024, { withBg: false, scale: 0.7 }));
  // адаптивная иконка Android: содержимое в безопасной зоне ~60%
  await out(path.join(assets, 'android-icon-foreground.png'), svg(512, { withBg: false, scale: 0.56 }));
  await out(path.join(assets, 'android-icon-background.png'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${defs}<rect width="512" height="512" fill="url(#bg)"/><rect width="512" height="512" fill="url(#glow)"/></svg>`);
  await out(path.join(assets, 'android-icon-monochrome.png'), svg(432, { withBg: false, scale: 0.5, mono: true }));
  await out(path.join(assets, 'favicon.png'), svg(48, { scale: 0.8, round: 10 }));
  // веб / iPhone
  await out(path.join(pub, 'apple-touch-icon.png'), svg(180));
  await out(path.join(pub, 'logo192.png'), svg(192));
  await out(path.join(pub, 'logo512.png'), svg(512));
  console.log('icons done');
})();
