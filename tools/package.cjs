const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const { version } = require('../package.json');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
// 标准无压缩 ZIP，使用 UTF-8 文件名，无外部打包程序依赖。
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipDirectory(directory) {
  const entries = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) entries.push({ name: Buffer.from(path.relative(directory, file).replaceAll('\\', '/')), data: fs.readFileSync(file) });
    }
  }
  visit(directory);
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const crc = crc32(data), local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, name, data); centrals.push(central, name); offset += local.length + name.length + data.length;
  }
  const centralData = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralData.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralData, end]);
}
const zip = `byljx-helper-${version}-chrome-edge.zip`;
fs.writeFileSync(path.join(dist, zip), zipDirectory(path.join(root, 'extension')));
const script = `byljx-helper-${version}.user.js`;
fs.copyFileSync(path.join(root, 'byljx-helper.user.js'), path.join(dist, script));
const lines = [zip, script].map(name => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, name))).digest('hex')}  ${name}`);
fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log(`Release ${version} packaged: extension ZIP, userscript, SHA256SUMS.txt`);
