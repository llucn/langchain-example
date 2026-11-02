// Marks files whose path starts with one of the given prefixes as Unix mode 0755 in a zip
// (rewrites the central directory in place). Usage: node zip-set-exec.js <zip> <prefix>...
const fs = require('fs');

const [file, ...prefixes] = process.argv.slice(2);
const buf = fs.readFileSync(file);

let eocd = -1;
for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) {
    eocd = i;
    break;
  }
}
if (eocd < 0) throw new Error('not a zip file');
const entries = buf.readUInt16LE(eocd + 10);
if (entries === 0xffff) throw new Error('zip64 archives are not supported');

let off = buf.readUInt32LE(eocd + 16);
let changed = 0;
for (let n = 0; n < entries; n++) {
  if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('corrupt central directory');
  const nameLen = buf.readUInt16LE(off + 28);
  const extraLen = buf.readUInt16LE(off + 30);
  const commentLen = buf.readUInt16LE(off + 32);
  const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
  if (!name.endsWith('/') && prefixes.some((p) => name.startsWith(p))) {
    buf.writeUInt16LE((3 << 8) | (buf.readUInt16LE(off + 4) & 0xff), off + 4); // host: Unix
    buf.writeUInt32LE(((0o100755 << 16) | 0x20) >>> 0, off + 38);
    changed++;
  }
  off += 46 + nameLen + extraLen + commentLen;
}
fs.writeFileSync(file, buf);
console.log(`marked ${changed} file(s) executable`);
