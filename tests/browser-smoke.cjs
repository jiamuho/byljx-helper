// 在独立测试浏览器的演示页验证界面与 DOM 行为，不连接真实官网、不使用学习账号。
// 扩展 API 使用模拟实现；扩展安装和隔离世界仍需商店提交前的人工验收。
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('../tools/dependencies.cjs')('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs', 'assets');
const results = path.join(root, 'test-results');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(results, { recursive: true });
const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#f0f4f0;color:#294438;font-family:system-ui,"Microsoft YaHei",sans-serif}header{padding:26px 48px;background:#fff;border-bottom:1px solid #dce5dc;display:flex;align-items:center;justify-content:space-between}h1{font-size:20px;margin:0}header span{font-size:13px;color:#7d8e80}main{margin:30px 48px;display:grid;grid-template-columns:1fr 250px;gap:22px}.player{height:545px;border-radius:14px;background:#1e3a30;position:relative;overflow:hidden}video{width:100%;height:100%;object-fit:contain}.subjectList___demo{background:white;border-radius:14px;padding:20px}.subjectList___demo div{padding:17px 12px;margin:0 0 10px;font-size:13px;border-radius:9px;color:#789184;cursor:pointer}.subjectList___demo .playerText___demo{background:#e8f4ed;color:#237657;font-weight:600}.tip{margin:0 48px;color:#7f9185;font-size:12px}
</style></head><body><header><h1>课件播放 · 演示环境</h1><span>界面演示，不连接真实学习记录</span></header><main><div class="player"><video playsinline></video></div><aside class="subjectList___demo"><div class="playerText___demo">01 · 课程导览</div><div class="unPlayerText___demo">02 · 重点内容</div><div class="unPlayerText___demo">03 · 回顾与总结</div></aside></main><p class="tip">示意课件画面 · 不包含账号或真实课程内容</p><canvas width="1100" height="650" style="position:fixed;left:0;top:0;width:110px;height:65px"></canvas><script>
const canvas=document.querySelector('canvas'),c=canvas.getContext('2d');
function draw(){c.fillStyle='#1e3a30';c.fillRect(0,0,1100,650);c.fillStyle='#9dbeac';c.font='18px system-ui';c.fillText('COURSE PREVIEW / 界面演示',80,115);c.fillStyle='#f2f8ee';c.font='bold 52px system-ui';c.fillText('让课件播放更省心',80,245);c.fillStyle='#b5ceba';c.font='24px system-ui';c.fillText('自动连播 · 静音控制 · 本地日志',80,305);c.fillStyle='#a2bc84';c.fillRect(80,370,80,5);c.fillStyle='#9dbeac';c.font='17px system-ui';c.fillText('演示视频，不产生学习记录',80,440);}
draw(); const v=document.querySelector('video');v.volume=.4;v.poster=canvas.toDataURL();canvas.remove();
// 本机生成 4 秒静音 PCM 媒体，使用浏览器原生播放、暂停和倍速，无编码器依赖。
const pcm=new ArrayBuffer(44+16000*4*2),dv=new DataView(pcm);function str(offset,s){for(let i=0;i<s.length;i++)dv.setUint8(offset+i,s.charCodeAt(i));}
str(0,'RIFF');dv.setUint32(4,pcm.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,16000,true);dv.setUint32(28,32000,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);str(36,'data');dv.setUint32(40,pcm.byteLength-44,true);v.loop=true;v.src=URL.createObjectURL(new Blob([pcm],{type:'audio/wav'}));
for(const row of document.querySelector('[class*="subjectList"]').children)row.onclick=()=>{for(const el of row.parentElement.children)el.className='unPlayerText___demo';row.className='playerText___demo';};
</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BYL_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    await context.route('https://byljxjy.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
    const page = await context.newPage(), failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.addInitScript(() => {
      const memory = {};
      window.chrome = { runtime: { getManifest: () => ({ version: '1.2.0' }) }, storage: { local: { get: async key => ({ [key]: memory[key] }), set: async value => Object.assign(memory, value) } } };
    });
    await page.goto('https://byljxjy.com/demo-extension');
    await page.waitForFunction(() => document.querySelector('video').readyState >= 2, null, { timeout: 10000 }).catch(async error => {
      console.error(await page.evaluate(() => { const v=document.querySelector('video');return {state:v.readyState,error:v.error?.message}; }));
      throw error;
    });
    await page.addScriptTag({ path: path.join(root, 'extension/content.js') });
    await page.locator('#byljx-extension-helper').waitFor();
    await page.getByRole('button', { name: '开始连播', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('video').paused);
    await page.getByLabel('静音播放').check();
    await page.waitForFunction(() => document.querySelector('video').volume === 0);
    await page.locator('summary').filter({ hasText: '播放设置' }).click();
    await page.getByLabel('播放速度', { exact: true }).selectOption('2');
    assert.equal(await page.locator('video').evaluate(v => v.playbackRate), 2);
    await page.locator('summary').filter({ hasText: '播放设置' }).click();
    await page.screenshot({ path: path.join(out, 'preview-compact.png') });
    // 模拟播放器取消 muted，实际音量仍为零。
    await page.locator('video').evaluate(v => { v.muted = false; v.dispatchEvent(new Event('volumechange')); });
    assert.equal(await page.locator('video').evaluate(v => v.volume), 0);
    await page.getByRole('button', { name: '暂停连播', exact: true }).click();
    assert.equal(await page.locator('video').evaluate(v => v.paused), true);
    await page.getByRole('button', { name: '开始连播', exact: true }).click();
    // 用受控媒体状态验证延迟切课，无学习记录请求。
    await page.locator('video').evaluate(v => { Object.defineProperties(v, { ended: { configurable: true, value: true }, duration: { configurable: true, value: 60 }, currentTime: { configurable: true, value: 60 } }); v.dispatchEvent(new Event('ended')); });
    await page.waitForFunction(() => document.querySelector('.subjectList___demo').children[1].className === 'playerText___demo', { timeout: 10000 });
    await page.locator('video').evaluate(v => { Object.defineProperty(v, 'error', { configurable: true, value: { code: 2, message: 'SECRET' } }); v.dispatchEvent(new Event('error')); });
    await page.locator('summary').filter({ hasText: '帮助与日志' }).click();
    await page.getByText('VIDEO_NETWORK', { exact: false }).waitFor();
    await page.screenshot({ path: path.join(out, 'preview-logs.png') });
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出日志', exact: true }).click()]);
    const saved = path.join(os.tmpdir(), 'byljx-browser-smoke-log.txt'); await download.saveAs(saved);
    const report = fs.readFileSync(saved, 'utf8'); assert.match(report, /VIDEO_NETWORK/); assert.doesNotMatch(report, /SECRET|https:\/\/|课程导览/);
    await page.getByRole('button', { name: '清空日志', exact: true }).click();
    assert.equal(await page.locator('#byljx-extension-helper').locator('#logs').textContent(), '暂无日志');
    // 窄屏下不能超出窗口。
    await page.setViewportSize({ width: 390, height: 760 });
    const bounds = await page.locator('#byljx-extension-helper').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    assert.deepEqual(failures, []);
    const popup = await context.newPage();
    await popup.addInitScript(() => { window.chrome = { runtime: { getManifest: () => ({ version: '1.2.0' }) }, tabs: { create: async value => { window.__openedUrl = value.url; } } }; });
    await popup.goto(require('node:url').pathToFileURL(path.join(root, 'extension/popup.html')).href);
    assert.equal(await popup.locator('#version').textContent(), '1.2.0');
    await popup.getByRole('button', { name: '打开白玉兰学习网站' }).click();
    assert.equal(await popup.evaluate(() => window.__openedUrl), 'https://byljxjy.com/');
    await popup.locator('body').screenshot({ path: path.join(results, 'preview-popup.png') });
    await popup.goto(require('node:url').pathToFileURL(path.join(root, 'extension/privacy.html')).href);
    assert.match(await popup.locator('h1').textContent(), /隐私说明/);
    fs.writeFileSync(path.join(results, 'browser-test-result.json'), JSON.stringify({ browser: await browser.version(), date: '2026-11-03', api: 'mock chrome API on a local fixture; not a loaded extension', checks: ['media playback', 'mute and volume restoration behavior', 'rate', 'pause', 'delayed next lesson', 'error log', 'download report without identifiers', 'clear logs', 'narrow viewport', 'no uncaught page errors', 'popup and open-site action', 'privacy page'], passed: true }, null, 2));
    console.log('Browser fixture checks passed; two 1280x800 previews saved. Extension API is simulated; native store installation still needs acceptance.');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
