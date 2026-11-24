// Package a built directory into a zip on stdout-free CI without external tools.
// Usage: node script/zip.mjs <dir> <out.zip>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error('usage: node script/zip.mjs <dir> <out.zip>');
  process.exit(1);
}

function files(root, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const p = path.join(rel, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) out.push(...files(root, p));
    else out.push(p);
  }
  return out;
}

const DOS_TIME = 0;
const DOS_DATE = (() => {
  const d = new Date();
  return ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
})();

const locals = [];
const central = [];
let offset = 0;

for (const name of files(dir).sort()) {
  const data = fs.readFileSync(path.join(dir, name));
  const crc = zlib.crc32(data) >>> 0;
  const compressed = zlib.deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name, 'utf8');

  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  locals.push(header, nameBuf, compressed);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0, 8);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt16LE(DOS_TIME, 12);
  entry.writeUInt16LE(DOS_DATE, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(compressed.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(nameBuf.length, 28);
  entry.writeUInt16LE(0, 30);
  entry.writeUInt16LE(0, 32);
  entry.writeUInt16LE(0, 34);
  entry.writeUInt16LE(0, 36);
  entry.writeUInt32LE(0, 38);
  entry.writeUInt32LE(offset, 42);
  central.push(Buffer.concat([entry, nameBuf]));

  offset += header.length + nameBuf.length + compressed.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(central.length, 8);
end.writeUInt16LE(central.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

fs.writeFileSync(out, Buffer.concat([...locals, centralBuf, end]));
console.log(`wrote ${out} (${fs.statSync(out).size} bytes)`);
