const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../tools/dependencies.cjs')('jsdom');
const extension = path.resolve(__dirname, '../extension');
for (const target of ['extension', 'userscript']) {
const source = fs.readFileSync(target === 'extension' ? path.join(extension, 'content.js') : path.resolve(__dirname, '../byljx-helper.user.js'), 'utf8');
const check = (name, fn) => test(`${target}: ${name}`, fn);
async function setup(options = {}) {
  const dom = new JSDOM(`<div class="player"><video></video></div><div class="subjectList___abc">${Array.from({ length: options.count || 3 }, (_, i) => `<div class="${i ? 'unPlayerText' : 'playerText'}___abc">私密课件 ${i}</div>`).join('')}</div>`, { url: 'https://byljxjy.com/course/private?token=SECRET', runScripts: 'outside-only' });
  const w = dom.window, tasks = new Map();
  let serial = 0, plays = 0, pauses = 0, clicks = 0, saved, exported, now = 1800000000000;
  w.Date.now = () => now;
  w.setTimeout = (fn, delay) => { const id = ++serial; tasks.set(id, { fn, delay }); return id; };
  w.clearTimeout = id => tasks.delete(id); w.setInterval = () => 0;
  w.chrome = { runtime: { getManifest: () => ({ version: '1.2.0' }) }, storage: { local: {
    get: async () => { if (options.readError) throw Error('SECRET'); return { playbackPreferences: options.saved || {} }; },
    set: async value => { if (options.writeError) throw Error('SECRET'); saved = value; }
  } } };
  w.GM_getValue = async () => { if (options.readError) throw Error('SECRET'); return options.saved || {}; };
  w.GM_setValue = async (key, value) => { if (options.writeError) throw Error('SECRET'); saved = { [key]: value }; };
  w.HTMLMediaElement.prototype.play = function () { plays++; return options.playError ? Promise.reject({ name: options.playError, message: 'SECRET https://secret.example' }) : Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = () => pauses++;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLAnchorElement.prototype.click = () => {};
  w.URL.createObjectURL = blob => { exported = blob.parts.join(''); return 'blob:test'; }; w.URL.revokeObjectURL = () => {};
  w.Blob = class { constructor(parts) { this.parts = parts; } };
  const video = w.document.querySelector('video');
  let complete = false;
  Object.defineProperties(video, { ended: { get: () => complete }, duration: { value: 60 }, currentSrc: { value: 'https://secret.example/SECRET.mp4' } });
  video.currentTime = 25; video.volume = 0.4;
  const lessons = [...w.document.querySelector('[class*="subjectList"]').children];
  lessons.forEach(row => row.addEventListener('click', () => { clicks++; if (!options.noSwitch) { lessons.forEach(item => item.className = 'unPlayerText___abc'); row.className = 'playerText___abc'; } }));
  if (options.legacy) { const el = w.document.createElement('div'); el.id = 'byljx-local-helper'; w.document.body.append(el); }
  w.eval(source); await new Promise(resolve => setImmediate(resolve));
  const ui = w.document.getElementById('byljx-extension-helper')?.shadowRoot;
  return { w, ui, video, lessons, get plays() { return plays; }, get pauses() { return pauses; }, get clicks() { return clicks; }, get saved() { return saved; }, get exported() { return exported; },
    start: () => ui.getElementById('toggle').click(),
    mute: value => { const el = ui.getElementById('muted'); el.checked = value; el.dispatchEvent(new w.Event('change')); },
    end: () => { complete = true; video.currentTime = 60; video.dispatchEvent(new w.Event('ended')); },
    run: delay => { for (const [id, task] of [...tasks]) if (task.delay === delay) { tasks.delete(id); task.fn(); } },
    tick: () => { now += 5000; },
    export: () => ui.getElementById('export').click(),
    close: () => dom.window.close() };
}
check('MV3 仅请求 storage，匹配两个明确域名，所有代码本地打包', () => {
  const m = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
  assert.equal(m.manifest_version, 3); assert.deepEqual(m.permissions, ['storage']);
  assert.deepEqual(m.content_scripts[0].matches, ['https://byljxjy.com/*', 'https://www.byljxjy.com/*']);
  assert.equal(m.host_permissions, undefined); assert.equal(m.web_accessible_resources, undefined);
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|eval\s*\(|new Function|submitWatchVideoRecord|submitStudentExam/);
});
check('首次加载不播放，主界面折叠高级设置与日志', async () => {
  const s = await setup(); assert.equal(s.plays, 0); assert.equal(s.ui.getElementById('settings').open, false); assert.equal(s.ui.getElementById('help').open, false); s.start(); assert.equal(s.plays, 1); assert.equal(s.video.currentTime, 25); s.close();
});
check('静音独立生效；播放器取消 muted 后仍无声，取消后恢复原音量', async () => {
  const s = await setup(); s.mute(true); assert.equal(s.video.volume, 0); s.video.muted = false; s.video.dispatchEvent(new s.w.Event('volumechange')); assert.equal(s.video.volume, 0); assert.equal(s.ui.getElementById('audio').textContent, '已静音');
  s.video.volume = 0.7; s.video.dispatchEvent(new s.w.Event('volumechange')); assert.equal(s.video.volume, 0); s.mute(false); assert.equal(s.video.volume, 0.4); assert.equal(s.video.muted, false); assert.equal(s.plays, 0); s.close();
});
check('存储只保存三个偏好，没有账号、课程或地址', async () => {
  const s = await setup(); s.mute(true); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(JSON.parse(JSON.stringify(s.saved)), { playbackPreferences: { muted: true, rate: 1, autoNext: true } }); s.close();
});
check('设置恢复与损坏值回退，刷新不自动开始连播', async () => {
  const s = await setup({ saved: { rate: 99, muted: true, autoNext: false } }); assert.equal(s.ui.getElementById('rate').value, '1'); assert.equal(s.ui.getElementById('next').checked, false); assert.equal(s.video.volume, 0); assert.equal(s.plays, 0); s.close();
});
check('同一 ended 重复触发仍只切一次课，保持播放进度', async () => {
  const s = await setup(); s.start(); s.end(); s.end(); s.run(5000); assert.equal(s.clicks, 1); assert.equal(s.video.currentTime, 60); s.close();
});
check('暂停、关闭自动切课、用户手动切课都取消旧任务', async () => {
  for (const mode of ['pause', 'setting', 'manual']) {
    const s = await setup(); s.start(); s.end();
    if (mode === 'pause') s.start();
    if (mode === 'setting') { const el = s.ui.getElementById('next'); el.checked = false; el.dispatchEvent(new s.w.Event('change')); }
    if (mode === 'manual') s.lessons[2].click();
    s.run(5000); assert.equal(s.clicks, mode === 'manual' ? 1 : 0); s.close();
  }
});
check('最后一课自动停止，无循环重播', async () => {
  const s = await setup({ count: 1 }); s.start(); s.end(); s.run(5000); assert.equal(s.clicks, 0); assert.equal(s.ui.getElementById('toggle').textContent, '开始连播'); assert.match(s.ui.getElementById('status').textContent, /本列表已播完/); s.close();
});
check('官网弹窗阻止切课并记提醒', async () => {
  const s = await setup(); s.start(); s.end(); const dialog = s.w.document.createElement('div'); dialog.setAttribute('role', 'dialog'); dialog.getClientRects = () => [{}]; s.w.document.body.append(dialog); s.run(5000); assert.equal(s.clicks, 0); s.export(); assert.match(s.exported, /DIALOG/); s.close();
});
check('切课没有成功时不虚报完成', async () => {
  const s = await setup({ noSwitch: true }); s.start(); s.end(); s.run(5000); s.run(9000); s.export(); assert.match(s.exported, /NEXT_FAILED/); s.close();
});
check('自动播放拦截与媒体网络错误分别记录，不泄露原异常', async () => {
  const s = await setup({ playError: 'NotAllowedError' }); s.start(); await new Promise(resolve => setImmediate(resolve));
  Object.defineProperty(s.video, 'error', { value: { code: 2, message: 'SECRET' } }); s.video.dispatchEvent(new s.w.Event('error')); s.export();
  assert.match(s.exported, /AUTOPLAY/); assert.match(s.exported, /VIDEO_NETWORK/); assert.doesNotMatch(s.exported, /SECRET|secret\.example|私密课件|token=/); s.close();
});
check('读取和写入设置失败均有可见提示与日志', async () => {
  const s = await setup({ readError: true, writeError: true }); s.mute(true); await new Promise(resolve => setImmediate(resolve)); s.export(); assert.match(s.exported, /STORAGE_READ/); assert.match(s.exported, /STORAGE_WRITE/); assert.equal(s.ui.getElementById('issue').hidden, false); s.close();
});
check('仅捕获助手错误，不采集网页全局错误', async () => {
  const s = await setup(); s.w.dispatchEvent(new s.w.ErrorEvent('error', { message: 'SECRET' })); s.export(); assert.doesNotMatch(s.exported, /SECRET/); s.close();
});
check('日志有界、可导出、可清空', async () => {
  const s = await setup(); for (let i = 0; i < 230; i++) { s.tick(); s.start(); } s.export();
  const lines = s.exported.split('\n').filter(line => /\[(info|warn|error)\]/.test(line)); assert.equal(lines.length, 200);
  s.ui.getElementById('clear').click(); s.export(); assert.doesNotMatch(s.exported, /\[(info|warn|error)\]/); s.close();
});
check('收起面板不会停止连播，可以重新展开', async () => {
  const s = await setup(); s.start(); s.ui.getElementById('collapse').click(); assert.equal(s.ui.getElementById('panel').hidden, true); assert.equal(s.pauses, 0); s.ui.getElementById('compact').click(); assert.equal(s.ui.getElementById('panel').hidden, false); s.close();
});
check('站内导航取消待切课并暂停连播；无关 message 无效', async () => {
  const s = await setup(); s.start(); s.end(); s.w.history.pushState({}, '', '/other'); s.w.dispatchEvent(new s.w.PopStateEvent('popstate')); s.run(250); s.run(5000);
  assert.equal(s.clicks, 0); assert.equal(s.ui.getElementById('toggle').textContent, '开始连播'); s.w.dispatchEvent(new s.w.MessageEvent('message', { data: { type: 'AUTO_NEXT_LESSON' } })); assert.equal(s.clicks, 0); s.close();
});
check('检测到旧版脚本时显示冲突提示，不同时控制播放器', async () => {
  const s = await setup({ legacy: true }); assert.ok(s.ui); assert.match(s.ui.getElementById('issue').textContent, /旧脚本/); s.start(); assert.equal(s.plays, 0); s.export(); assert.match(s.exported, /LEGACY/); s.close();
});

}
