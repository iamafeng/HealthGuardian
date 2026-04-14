/**
 * make-icon.js — download the app PNG and produce a multi-size favicon.ico
 * Run once: node GuardianDesktop/make-icon.js
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const OUT_ICO = path.join(__dirname, '../src/main/resources/static/favicon.ico');
const PNG_URL = 'https://cdn-icons-png.flaticon.com/512/3105/3105807.png';

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Build a minimal .ico that embeds the 512-px PNG directly.
 * ICO spec allows raw PNG for images >= 256x256 (Vista+, which is fine for Electron/Windows 10+).
 * We emit three entries (256, 128, 48) from the same PNG so Windows picks the best size.
 * For the smaller sizes we just embed the same PNG — Windows will scale it.
 */
function buildIco(pngBuffer) {
  // We'll use the raw PNG for all sizes (Windows 10+ handles it)
  const entries = [256, 128, 48]; // widths declared in the directory
  const count   = entries.length;

  const HEADER_SIZE   = 6;
  const DIR_ENTRY     = 16;
  const dirOffset     = HEADER_SIZE;
  const dataStart     = HEADER_SIZE + count * DIR_ENTRY;

  // ICO header
  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt16LE(0,     0); // reserved
  header.writeUInt16LE(1,     2); // type = ICO
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  // All entries point to the SAME PNG blob (Windows picks the right display size from the PNG header)
  for (const w of entries) {
    const e = Buffer.alloc(DIR_ENTRY);
    e.writeUInt8(w === 256 ? 0 : w, 0);  // width  (0 = 256)
    e.writeUInt8(w === 256 ? 0 : w, 1);  // height (0 = 256)
    e.writeUInt8(0, 2);                  // colorCount (0 = no palette)
    e.writeUInt8(0, 3);                  // reserved
    e.writeUInt16LE(1,  4);              // planes
    e.writeUInt16LE(32, 6);              // bitCount
    e.writeUInt32LE(pngBuffer.length, 8);  // size of image data
    e.writeUInt32LE(dataStart, 12);        // offset of image data
    dirEntries.push(e);
  }

  return Buffer.concat([header, ...dirEntries, pngBuffer]);
}

(async () => {
  console.log('⬇  Downloading app icon PNG …');
  const png = await download(PNG_URL);
  console.log(`   Downloaded ${png.length} bytes`);

  const ico = buildIco(png);
  fs.writeFileSync(OUT_ICO, ico);
  console.log(`✅ favicon.ico written → ${OUT_ICO} (${ico.length} bytes)`);
})().catch(err => { console.error('❌', err.message); process.exit(1); });

