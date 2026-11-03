const fs = require('node:fs');
const path = require('node:path');
const sharp = require('./dependencies.cjs')('sharp');
const root = path.resolve(__dirname, '..');
const extension = path.join(root, 'extension');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect x="16" y="16" width="96" height="96" rx="25" fill="#237657"/><path d="M35 44q17-5 29 4 12-9 29-4v39q-17-5-29 4-12-9-29-4z" fill="#f5fbf6"/><path d="M64 48v39" stroke="#b8d8c5" stroke-width="3"/><circle cx="83" cy="80" r="19" fill="#d9efc9" stroke="#237657" stroke-width="4"/><path d="m79 71 12 9-12 9z" fill="#237657"/></svg>`;
(async () => {
  fs.mkdirSync(path.join(extension, 'icons'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'assets'), { recursive: true });
  for (const size of [16, 32, 48, 128]) await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(extension, 'icons', `icon${size}.png`));
  fs.copyFileSync(path.join(extension, 'privacy.html'), path.join(root, 'docs', 'privacy.html'));
  fs.copyFileSync(path.join(extension, 'icons', 'icon128.png'), path.join(root, 'docs', 'assets', 'icon.png'));
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3 || JSON.stringify(manifest.permissions) !== '["storage"]') throw Error('Unexpected manifest permissions');
  for (const file of ['content.js', 'popup.html', 'popup.js', 'popup.css', 'privacy.html', ...Object.values(manifest.icons)]) {
    if (!fs.existsSync(path.join(extension, file))) throw Error(`Missing packaged file: ${file}`);
  }
  console.log(`Extension ${manifest.version}: icons and privacy page prepared; package files validated.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
