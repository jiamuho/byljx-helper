const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { version } = require('../package.json');
const core = fs.readFileSync(path.join(root, 'src/helper.js'), 'utf8').trim();
const repo = 'https://github.com/jiamuho/byljx-helper';
const raw = 'https://raw.githubusercontent.com/jiamuho/byljx-helper/main/byljx-helper.user.js';
const header = `// Generated from src/helper.js. Edit the shared source, then run npm run build.\n`;
const extensionAdapter = `runByljxHelper({
  version: chrome.runtime.getManifest().version,
  getPreferences: async () => (await chrome.storage.local.get('playbackPreferences')).playbackPreferences,
  setPreferences: value => chrome.storage.local.set({ playbackPreferences: value })
});`;
const metadata = `// ==UserScript==
// @name         白玉兰课件连播助手（开源版）
// @namespace    ${repo}
// @version      ${version}
// @description  白玉兰远程医学网学习辅助：课件自动连播、静音、倍速和本地错误日志；与浏览器扩展界面一致。
// @author       jiamuho
// @match        https://byljxjy.com/*
// @match        https://www.byljxjy.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// @license      MIT
// @homepageURL  ${repo}
// @supportURL   ${repo}/issues
// @downloadURL  ${raw}
// @updateURL    ${raw}
// ==/UserScript==
`;
const userscriptAdapter = `runByljxHelper({
  version: '${version}',
  getPreferences: async () => GM_getValue('playbackPreferences', {}),
  setPreferences: async value => GM_setValue('playbackPreferences', value)
});`;
fs.writeFileSync(path.join(root, 'extension/content.js'), header + core + '\n' + extensionAdapter + '\n');
fs.writeFileSync(path.join(root, 'byljx-helper.user.js'), metadata + '\n' + header + core + '\n' + userscriptAdapter + '\n');
const manifestPath = path.join(root, 'extension/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = version;
manifest.homepage_url = repo;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const privacyPath = path.join(root, 'extension/privacy.html');
let privacy = fs.readFileSync(privacyPath, 'utf8').replace(/适用版本：[\d.]+/, `适用版本：${version}`);
privacy = privacy.replace('请使用本扩展商店详情页的开发者支持入口联系发布者。', `请通过 <a href="${repo}/issues" target="_blank" rel="noopener">GitHub Issues</a> 或本扩展商店详情页的开发者支持入口联系发布者。`);
fs.writeFileSync(privacyPath, privacy);
require('./build-extension.cjs');
console.log(`Shared interface built for extension and userscript ${version}.`);
