// Generates Google Play store graphics from assets/logo.png:
//   - play-icon-512.png        (512x512 app icon)
//   - feature-graphic-1024x500.png (1024x500 banner: logo + name + tagline on the app's dark bg)
const Jimp = require('jimp');

(async () => {
  const fs = require('fs');
  if (!fs.existsSync('store-assets')) fs.mkdirSync('store-assets');

  const logo = await Jimp.read('assets/logo.png');

  // 1) App icon — 512x512
  await logo.clone().resize(512, 512).writeAsync('store-assets/play-icon-512.png');

  // 2) Feature graphic — 1024x500 on the app's dark background (#0f0f1e)
  const BG = 0x0f0f1eff; // #0f0f1e, fully opaque
  const fg = new Jimp(1024, 500, BG);

  const logoSize = 360;
  const logoY = Math.round((500 - logoSize) / 2); // vertically centered
  fg.composite(logo.clone().resize(logoSize, logoSize), 80, logoY);

  const fontBig = await Jimp.loadFont(Jimp.FONT_SANS_128_WHITE);
  const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  fg.print(fontBig, 500, 165, 'Kordal');
  fg.print(fontSmall, 505, 305, 'Chords / Scales / Tuner');

  await fg.writeAsync('store-assets/feature-graphic-1024x500.png');
  console.log('Wrote store-assets/play-icon-512.png and store-assets/feature-graphic-1024x500.png');
})().catch(e => { console.error(e); process.exit(1); });
