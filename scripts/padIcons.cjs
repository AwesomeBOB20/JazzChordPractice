// Generates safe-zone-padded icon assets from assets/logo.png so Android's
// adaptive-icon mask and Android 12 splash circle don't clip the artwork.
//   adaptive-icon.png : logo scaled to 70% of the canvas, centered (Android home icon)
//   splash-icon.png   : logo scaled to 55% of the canvas, centered (splash screen)
// Background is the brand navy (#0f0f1e) so the padding blends with the baked-in logo bg.
const Jimp = require('jimp');

const SIZE = 1024;
const BG = 0x0f0f1eff; // #0f0f1e opaque
const TARGETS = [
  { out: 'assets/adaptive-icon.png', scale: 0.70 },
  { out: 'assets/splash-icon.png',   scale: 0.55 },
];

(async () => {
  const logo = await Jimp.read('assets/logo.png');
  for (const { out, scale } of TARGETS) {
    const inner = Math.round(SIZE * scale);
    const scaled = logo.clone().resize(inner, inner, Jimp.RESIZE_BICUBIC);
    const canvas = new Jimp(SIZE, SIZE, BG);
    const off = Math.round((SIZE - inner) / 2);
    canvas.composite(scaled, off, off);
    await canvas.writeAsync(out);
    console.log('wrote', out, `(logo @ ${Math.round(scale * 100)}%)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
