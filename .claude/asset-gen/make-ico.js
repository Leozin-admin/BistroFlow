// Constrói favicon.ico manualmente: 3 entradas PNG (16, 32, 48) com header correto.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..', 'BistroFlow');
const SVG = path.join(ROOT, 'assets', 'img', 'icon.svg');
const OUT = path.join(ROOT, 'favicon.ico');
const SIZES = [16, 32, 48];

// CRC32 (necessário para cada chunk PNG)
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

// Constrói um PNG RGBA cru de N×N a partir de um RGBA buffer de N×N×4
function makeRawPng(width, height, rgba) {
  // filtra byte (0 = None) por linha
  const stride = width * 4;
  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0;
    rgba.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const compressed = zlib.deflateSync(filtered);

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);   // bit depth
  ihdr.writeUInt8(6, 9);   // color type RGBA
  ihdr.writeUInt8(0, 10);  // compression
  ihdr.writeUInt8(0, 11);  // filter
  ihdr.writeUInt8(0, 12);  // interlace

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

(async () => {
  try {
    // Rasteriza o SVG uma vez em alta resolução e downsample pra cada tamanho com
    // redimensionamento bicúbico (qualidade) e fundo transparente.
    const master = await sharp(SVG, { density: 512 })
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const masterW = master.info.width, masterH = master.info.height, masterData = master.data;

    // Função nearest-neighbor downsample de master (256) pra N
    function downsample(n) {
      const out = Buffer.alloc(n * n * 4);
      for (let y = 0; y < n; y++) {
        const sy = Math.floor((y + 0.5) * masterH / n);
        for (let x = 0; x < n; x++) {
          const sx = Math.floor((x + 0.5) * masterW / n);
          const si = (sy * masterW + sx) * 4;
          const di = (y * n + x) * 4;
          out[di]     = masterData[si];
          out[di + 1] = masterData[si + 1];
          out[di + 2] = masterData[si + 2];
          out[di + 3] = masterData[si + 3];
        }
      }
      return out;
    }

    const entries = SIZES.map(s => ({ size: s, png: makeRawPng(s, s, downsample(s)) }));

    // Header ICONDIR
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);                    // reserved
    header.writeUInt16LE(1, 2);                    // type = icon
    header.writeUInt16LE(entries.length, 4);       // count

    // ICONDIRENTRY (16 bytes cada)
    const dirSize = 16 * entries.length;
    let dataOffset = 6 + dirSize;
    const dir = Buffer.alloc(dirSize);
    entries.forEach((e, i) => {
      const o = i * 16;
      dir.writeUInt8(e.size === 256 ? 0 : e.size, o + 0); // width
      dir.writeUInt8(e.size === 256 ? 0 : e.size, o + 1); // height
      dir.writeUInt8(0, o + 2);                            // color count
      dir.writeUInt8(0, o + 3);                            // reserved
      dir.writeUInt16LE(1, o + 4);                         // planes
      dir.writeUInt16LE(32, o + 6);                        // bit count
      dir.writeUInt32LE(e.png.length, o + 8);              // size
      dir.writeUInt32LE(dataOffset, o + 12);               // offset
      dataOffset += e.png.length;
    });

    const ico = Buffer.concat([header, dir, ...entries.map(e => e.png)]);
    fs.writeFileSync(OUT, ico);
    console.log('favicon.ico', ico.length, 'bytes, sizes:', SIZES.join('+'));

    // Validação: re-ler e decodificar
    const check = fs.readFileSync(OUT);
    const n = check.readUInt16LE(4);
    console.log('Header check -> entries:', n);
    for (let i = 0; i < n; i++) {
      const w = check.readUInt8(6 + i * 16) || 256;
      const h = check.readUInt8(7 + i * 16) || 256;
      const sz = check.readUInt32LE(14 + i * 16);
      const o = check.readUInt32LE(18 + i * 16);
      const realW = check.readUInt32BE(o + 16);
      const realH = check.readUInt32BE(o + 20);
      console.log(`  #${i}: hdr=${w}x${h} payload=${sz}B PNG-real=${realW}x${realH}`);
    }
  } catch (err) {
    console.error('FAIL:', err);
    process.exit(1);
  }
})();
