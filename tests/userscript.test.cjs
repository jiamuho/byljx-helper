const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('脚本与扩展嵌入相同共享源码、同一版本和同一界面', () => {
  const core = fs.readFileSync(path.join(root, 'src/helper.js'), 'utf8').trim();
  const script = fs.readFileSync(path.join(root, 'byljx-helper.user.js'), 'utf8');
  const extension = fs.readFileSync(path.join(root, 'extension/content.js'), 'utf8');
  const { version } = require('../package.json');
  assert.ok(script.includes(core)); assert.ok(extension.includes(core));
  assert.match(script, new RegExp('@version\\s+' + version.replaceAll('.', '\\.')));
  assert.equal(require('../extension/manifest.json').version, version);
  assert.deepEqual([...script.matchAll(/@grant\s+(\S+)/g)].map(m => m[1]), ['GM_getValue', 'GM_setValue']);
  assert.deepEqual([...script.matchAll(/@match\s+(\S+)/g)].map(m => m[1]), ['https://byljxjy.com/*', 'https://www.byljxjy.com/*']);
  assert.match(script, /@downloadURL\s+https:\/\/raw\.githubusercontent\.com\/jiamuho\/byljx-helper\/main\/byljx-helper\.user\.js/);
});
