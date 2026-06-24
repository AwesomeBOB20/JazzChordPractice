// Crops the chosen store screenshots to a Play-safe aspect ratio (<= 2:1) by trimming the phone's
// top status bar and bottom Android nav bar. Source 1080x2316 (2.14:1) -> 1080x2154 (~1.99:1).
const Jimp = require('jimp');
const fs = require('fs');

const PICKS = ['1', '8', '9', '10', '3', '5', '11', '12']; // recommended order
const TOP_CROP = 70;     // remove status bar (clock/battery)
const BOTTOM_CROP = 92;  // remove Android nav buttons

(async () => {
  const outDir = 'store-assets/screenshots-ready';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  let n = 1;
  for (const p of PICKS) {
    const src = `store-assets/screenshots/pic (${p}).jpg`;
    const img = await Jimp.read(src);
    const { width, height } = img.bitmap;
    const newH = height - TOP_CROP - BOTTOM_CROP;
    img.crop(0, TOP_CROP, width, newH);
    const ratio = (Math.max(width, newH) / Math.min(width, newH)).toFixed(3);
    const out = `${outDir}/${String(n).padStart(2, '0')}-pic${p}.jpg`;
    await img.quality(92).writeAsync(out);
    console.log(`${out}  ${width}x${newH}  ratio ${ratio}:1`);
    n++;
  }
})().catch(e => { console.error(e); process.exit(1); });
