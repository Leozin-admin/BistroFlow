// Gera PNGs (180, 192, 512) e favicon.ico multi-size a partir de assets/img/icon.svg
const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');
const toIco = require('to-ico');

const ROOT = path.resolve(__dirname, '..', '..', 'BistroFlow');
const SVG = path.join(ROOT, 'assets', 'img', 'icon.svg');

const OUT_PNG_192 = path.join(ROOT, 'assets', 'img', 'icon-192.png');
const OUT_PNG_512 = path.join(ROOT, 'assets', 'img', 'icon-512.png');
const OUT_PNG_180 = path.join(ROOT, 'apple-touch-icon.png');
const OUT_ICO    = path.join(ROOT, 'favicon.ico');

const ICO_SIZES = [16, 32, 48];

async function makePng(size, out) {
  const buf = await sharp(SVG, { density: 384 }) // alta densidade p/ nitidez no downscale
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await fs.writeFile(out, buf);
  console.log(`PNG ${size}px  ->  ${path.relative(ROOT, out)}  (${buf.length} bytes)`);
}

async function makeIco() {
  const buffers = [];
  for (const s of ICO_SIZES) {
    const buf = await sharp(SVG, { density: 384 })
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    buffers.push(buf);
  }
  const ico = await toIco(buffers, { sizes: ICO_SIZES });
  await fs.writeFile(OUT_ICO, ico);
  console.log(`ICO ${ICO_SIZES.join('+')}  ->  ${path.relative(ROOT, OUT_ICO)}  (${ico.length} bytes)`);
}

(async () => {
  try {
    await makePng(192, OUT_PNG_192);
    await makePng(512, OUT_PNG_512);
    await makePng(180, OUT_PNG_180);
    await makeIco();
    console.log('OK');
  } catch (err) {
    console.error('FAIL:', err);
    process.exit(1);
  }
})();
