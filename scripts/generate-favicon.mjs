import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Keep the legacy /favicon.ico identical to the scalable App Router icon.
const source = new URL('../app/icon.svg', import.meta.url);
const sizes = [16, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map(size =>
  sharp(fileURLToPath(source)).resize(size, size).png().toBuffer()
));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, index) => {
  const entry = 6 + index * 16;
  header[entry] = size === 256 ? 0 : size;
  header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
});
await fs.writeFile(new URL('../app/favicon.ico', import.meta.url), Buffer.concat([header, ...images]));
console.log(`Generated favicon.ico at ${sizes.join(', ')}px from app/icon.svg`);
