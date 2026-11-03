// ==UserScript==
// @name         白玉兰课件连播助手（开源版）
// @namespace    https://github.com/jiamuho/byljx-helper
// @version      1.2.0
// @description  白玉兰远程医学网学习辅助：课件自动连播、静音、倍速和本地错误日志；与浏览器扩展界面一致。
// @author       jiamuho
// @match        https://byljxjy.com/*
// @match        https://www.byljxjy.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// @license      MIT
// @homepageURL  https://github.com/jiamuho/byljx-helper
// @supportURL   https://github.com/jiamuho/byljx-helper/issues
// @downloadURL  https://raw.githubusercontent.com/jiamuho/byljx-helper/main/byljx-helper.user.js
// @updateURL    https://raw.githubusercontent.com/jiamuho/byljx-helper/main/byljx-helper.user.js
// ==/UserScript==

// Generated from src/helper.js. Edit the shared source, then run npm run build.
/* 白玉兰课件连播助手 · 本地执行，不读取或提交账号、学习、考试数据。 */
function runByljxHelper(platform) {
  'use strict';
  if (window.top !== window.self || globalThis.__BYL_HELPER_STARTED__ || document.getElementById('byljx-extension-helper')) return;
  globalThis.__BYL_HELPER_STARTED__ = true;
  const VERSION = platform.version;
  const PLAYER = '.player, [class*="vedioBox"], [class*="videoWrap"]';
  const state = { running: false, muted: false, rate: 1, autoNext: true, audioConfigured: false };
  const rates = [0.5, 1, 1.25, 1.5, 2, 3, 4];
  const bound = new WeakSet(), observed = new WeakSet(), mutedBefore = new WeakMap();
  const audioLocks = new WeakSet(), endKeys = new WeakMap();
  const rows = [];
  const dedupe = new Map();
  let host, ui, scanTimer, pending = null, switchUntil = 0, lastPage = location.href;
  let statusText = '打开课件后，点击开始即可。';
  let latestIssue = '';
  const messages = {
    READY: ['info', '助手已就绪'], START: ['info', '已开启连播'], STOP: ['info', '已暂停连播'],
    MUTED: ['info', '已开启静音'], UNMUTED: ['info', '已取消静音'], RATE: ['info', '已调整播放速度'],
    NEXT: ['info', '已点击下一课'], LAST: ['info', '已到当前列表最后一课'],
    AUTOPLAY: ['warn', '浏览器未允许自动播放，请点击视频播放键'],
    PLAY_FAILED: ['error', '播放失败，请检查播放器或重新打开课件'],
    VIDEO_NETWORK: ['error', '视频网络错误，请检查网络后重试'],
    VIDEO_DECODE: ['error', '视频解码失败，请重新打开课件'],
    VIDEO_UNSUPPORTED: ['error', '当前视频格式或地址无法播放'],
    VIDEO_ABORTED: ['warn', '视频加载已中止，请检查课件是否正在切换'],
    VIDEO_UNKNOWN: ['error', '视频加载失败，请重新打开课件'],
    AUDIO_FAILED: ['error', '静音设置失败，请使用播放器音量按钮'],
    RATE_FAILED: ['warn', '播放器拒绝该倍速，请尝试较低速度'],
    NO_VIDEO: ['warn', '没有找到可控制的视频，请进入课件播放页'],
    NO_LIST: ['warn', '未识别课件列表，请手动选择下一课'],
    DIALOG: ['warn', '官网有提示或验证，请手动处理并选择下一课'],
    NEXT_FAILED: ['warn', '未确认切课成功，请检查右侧课件列表'],
    STORAGE_READ: ['warn', '未能读取设置，本次使用默认设置'],
    STORAGE_WRITE: ['error', '设置保存失败，刷新后可能恢复默认值'],
    EXPORT_FAILED: ['error', '日志导出失败，请截图帮助与日志区域'],
    INTERNAL: ['error', '助手遇到异常，请刷新页面后重试'],
    NAVIGATION: ['info', '页面已切换，连播已暂停'],
    LEGACY: ['warn', '检测到旧脚本面板，请停用油猴旧脚本并刷新页面']
  };
  // 仅记录预定义消息和事件代码；不采集网页错误、URL、课件名或原始异常对象。
  function log(code) {
    if (!messages[code]) code = 'INTERNAL';
    const [level, message] = messages[code];
    const now = Date.now();
    if (dedupe.has(code) && now - dedupe.get(code) < 4000) return;
    dedupe.set(code, now);
    rows.push({ time: new Date(now).toISOString(), level, code, message });
    if (rows.length > 200) rows.shift();
    if (level !== 'info') latestIssue = message;
    renderLogs();
  }
  function guard(fn) {
    return (...args) => { try { return fn(...args); } catch (_) { log('INTERNAL'); setStatus('助手遇到异常，请打开帮助与日志。'); } };
  }
  const later = (fn, delay) => setTimeout(guard(fn), delay);
  function setText(el, value) { if (el && el.textContent !== value) el.textContent = value; }
  function $(id) { return ui?.getElementById(id); }
  function setStatus(value) { statusText = value; setText($('status'), value); }
  function docs() {
    const result = [], seen = new Set();
    function visit(doc) {
      if (!doc || seen.has(doc)) return;
      seen.add(doc); result.push(doc);
      for (const frame of doc.querySelectorAll('iframe')) {
        try { visit(frame.contentDocument); } catch (_) {}
      }
    }
    visit(document); return result;
  }
  function isCourseVideo(video) {
    try {
      if (video.ownerDocument === document) return Boolean(video.closest(PLAYER));
      let win = video.ownerDocument.defaultView;
      while (win && win !== window) {
        const frame = win.frameElement;
        if (!frame) return false;
        if (frame.ownerDocument === document) return Boolean(frame.closest(PLAYER));
        win = frame.ownerDocument.defaultView;
      }
    } catch (_) {}
    return false;
  }
  const allVideos = () => docs().flatMap(doc => [...doc.querySelectorAll('video')]);
  const videos = () => allVideos().filter(isCourseVideo);
  function visibleDialog() {
    return [...document.querySelectorAll('[role="dialog"], .ant-modal-wrap')]
      .some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  }
  function lesson() {
    for (const box of document.querySelectorAll('[class*="subjectList"]')) {
      const items = [...box.children].filter(el => [...el.classList].some(c => /^(?:unPlayerText|playerText)(?:___|$)/.test(c)));
      const index = items.findIndex(el => [...el.classList].some(c => /^playerText(?:___|$)/.test(c)));
      if (index >= 0) return { items, index, current: items[index] };
    }
    return null;
  }
  function cancelNext() { if (pending !== null) clearTimeout(pending); pending = null; }
  function stop(code = 'STOP', pauseMedia = true) {
    state.running = false; cancelNext();
    if (pauseMedia) for (const video of videos()) { try { video.pause(); } catch (_) { log('INTERNAL'); } }
    setText($('toggle'), '开始连播');
    setStatus(code === 'NAVIGATION' ? '页面已切换，点击开始继续。' : '已暂停，点击开始继续。');
    log(code); renderState();
  }
  function save() {
    const value = { muted: state.muted, rate: state.rate, autoNext: state.autoNext };
    Promise.resolve().then(() => platform.setPreferences(value)).catch(() => log('STORAGE_WRITE'));
  }
  function applyAudio(video) {
    if (!isCourseVideo(video) || audioLocks.has(video)) return;
    audioLocks.add(video);
    try {
      if (state.muted) {
        const first = !mutedBefore.has(video);
        if (first) mutedBefore.set(video, video.volume);
        const audible = video.volume !== 0;
        if (audible) video.volume = 0;
        if (first || audible) video.muted = true;
      } else {
        if (mutedBefore.has(video) && video.volume === 0) video.volume = mutedBefore.get(video);
        if (video.muted) video.muted = false;
        mutedBefore.delete(video);
      }
    } catch (_) { log('AUDIO_FAILED'); }
    finally { audioLocks.delete(video); }
  }
  function apply(video) {
    if (!isCourseVideo(video)) return;
    if (state.audioConfigured || state.running) applyAudio(video);
    if (!state.running) return;
    try { if (video.playbackRate !== state.rate) video.playbackRate = state.rate; }
    catch (_) { log('RATE_FAILED'); }
  }
  function play(video) {
    if (!state.running || !isCourseVideo(video) || video.ended || visibleDialog()) return;
    apply(video);
    try {
      const promise = video.play();
      promise?.catch(error => {
        if (!state.running || !video.isConnected || error?.name === 'AbortError') return;
        const code = error?.name === 'NotAllowedError' ? 'AUTOPLAY' : 'PLAY_FAILED';
        log(code); setStatus(messages[code][1]);
      });
    } catch (_) { log('PLAY_FAILED'); setStatus(messages.PLAY_FAILED[1]); }
  }
  function onEnded(video) {
    if (!state.running || !isCourseVideo(video) || !video.ended || Date.now() < switchUntil) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.currentTime < video.duration - 1) return;
    const current = lesson();
    // 源地址仅在内存中用于去重，不进入日志或导出。
    const key = { source: video.currentSrc, row: current?.current };
    const previous = endKeys.get(video);
    if (previous?.source === key.source && previous?.row === key.row) return;
    endKeys.set(video, key);
    if (!state.autoNext) { setStatus('本课已播完，请手动选择下一课。'); return; }
    if (!current) { log('NO_LIST'); setStatus(messages.NO_LIST[1]); return; }
    const next = current.items[current.index + 1];
    if (!next) { stop('LAST', false); setStatus('本列表已播完，请到官网检查学习记录。'); return; }
    if (pending !== null) return;
    const url = location.href;
    setStatus('本课已播完，5 秒后切换下一课。');
    pending = later(() => {
      pending = null;
      if (!state.running || !state.autoNext || location.href !== url) return;
      const fresh = lesson();
      if (fresh?.current !== current.current || !next.isConnected) return;
      if (visibleDialog()) { log('DIALOG'); setStatus(messages.DIALOG[1]); return; }
      switchUntil = Date.now() + 5000;
      next.scrollIntoView({ block: 'nearest' }); next.click();
      log('NEXT'); setStatus('正在加载下一课…');
      for (const delay of [1500, 3500]) later(() => {
        if (state.running && location.href === url) scan(true);
      }, delay);
      later(() => {
        if (state.running && location.href === url && lesson()?.current === current.current) {
          log('NEXT_FAILED'); setStatus(messages.NEXT_FAILED[1]);
        }
      }, 9000);
    }, 5000);
  }
  function diagnostics() {
    const targets = videos();
    let inaccessible = 0;
    for (const doc of docs()) for (const frame of doc.querySelectorAll('iframe')) {
      try { if (!frame.contentDocument) inaccessible++; } catch (_) { inaccessible++; }
    }
    const lines = [`版本：${VERSION}`, `连播：${state.running ? '开启' : '暂停'}`, `静音：${state.muted}`, `可读取视频：${allVideos().length}`, `课件视频：${targets.length}`, `不可读取的框架：${inaccessible}`];
    targets.forEach((video, index) => lines.push(`视频${index + 1}：音量=${Math.round(video.volume * 100)}% muted=${video.muted} 倍速=${video.playbackRate}`));
    return lines.join('\n');
  }
  function renderState() {
    if (!ui) return;
    setText($('toggle'), state.running ? '暂停连播' : '开始连播');
    const targets = videos();
    const silent = targets.length > 0 && targets.every(video => video.muted || video.volume === 0);
    setText($('audio'), state.muted ? (silent ? '已静音' : '静音待生效') : '声音开启');
    setText($('speed'), targets.length ? `实际 ${targets[0].playbackRate}×` : `设定 ${state.rate}×`);
    setText($('compact'), state.running ? '● 连播中 · 展开' : '课件助手 · 展开');
    if ($('help').open) setText($('diagnostics'), diagnostics());
  }
  function renderLogs() {
    if (!ui) return;
    const issues = rows.filter(row => row.level !== 'info').length;
    setText($('help-title'), issues ? `帮助与日志 · ${issues} 条提醒` : '帮助与日志');
    setText($('issue'), latestIssue);
    $('issue').hidden = !latestIssue;
    if (!$('help').open) return;
    const labels = { info: '记录', warn: '提醒', error: '错误' };
    const text = rows.length ? [...rows].reverse().map(row => `${new Date(row.time).toLocaleTimeString()} [${labels[row.level]}] ${row.message} (${row.code})`).join('\n') : '暂无日志';
    setText($('logs'), text);
  }
  function exportLogs() {
    let url;
    try {
      const text = ['白玉兰课件连播助手 · 问题报告', diagnostics(), '', '本报告不包含账号、页面地址和课件名称。', '', ...rows.map(row => `${row.time} [${row.level}] ${row.code} ${row.message}`)].join('\n');
      url = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `课件助手日志-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(link); link.click(); link.remove();
      later(() => URL.revokeObjectURL(url), 1000);
    } catch (_) { if (url) URL.revokeObjectURL(url); log('EXPORT_FAILED'); }
  }
  function mount() {
    if (host?.isConnected || !document.body) return;
    host = document.createElement('div'); host.id = 'byljx-extension-helper';
    host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:22px;z-index:2147483647;max-width:calc(100vw - 24px)';
    ui = host.attachShadow({ mode: 'open' });
    ui.innerHTML = `<style>
      :host{font:14px/1.55 system-ui,"Microsoft YaHei",sans-serif;color:#20342f;color-scheme:light}
      *{box-sizing:border-box} [hidden]{display:none!important}
      section,#compact{font:14px/1.55 system-ui,"Microsoft YaHei",sans-serif;color:#20342f;text-align:left} section{width:292px;max-width:calc(100vw - 24px);max-height:calc(100vh - 50px);overflow:auto;background:#fff;border:1px solid #d9e5de;border-radius:18px;box-shadow:0 12px 42px #122f2426;padding:18px}
      header{display:flex;align-items:center;gap:9px;margin-bottom:15px} .mark{display:grid;place-items:center;background:#e7f3ed;color:#20755a;border-radius:11px;width:35px;height:35px;font-size:20px;font-weight:bold}
      h2{font-size:16px;line-height:1.3;margin:0} small{font-size:11px;color:#7c8d85} button,select{font:inherit} button{cursor:pointer;border:1px solid #d9e5de;border-radius:10px;background:#f7faf8;color:#365247;padding:8px 11px} button:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #8ad2b3;outline-offset:2px}
      #collapse{margin-left:auto;padding:2px 8px;font-size:20px;background:white;border:0} #toggle{width:100%;background:#237657;color:white;border:0;font-weight:650;padding:11px;margin-bottom:13px}
      .muteline{display:flex;align-items:center;gap:7px} input{accent-color:#237657;width:16px;height:16px} .muteline span{margin-left:auto;color:#72867b;font-size:12px}
      #status{font-size:13px;color:#546c60;margin:12px 0;overflow-wrap:anywhere} #issue{font-size:12px;padding:9px;border-radius:8px;background:#fff7e7;color:#8c5912;margin:10px 0;overflow-wrap:anywhere}
      details{border-top:1px solid #edf1ee;padding-top:10px;margin-top:10px} summary{cursor:pointer;font-size:12px;color:#61796b;list-style-position:inside} .setting{display:flex;align-items:center;justify-content:space-between;margin:11px 0;font-size:13px} select{padding:4px;border:1px solid #d9e5de;border-radius:7px;background:#fff} #speed{font-size:11px;color:#7c8d85;margin-left:6px} .note{font-size:11px;color:#7c8d85;margin:10px 0 0}
      pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.65 ui-monospace,Consolas,monospace;background:#f5f8f6;border-radius:8px;padding:9px;margin:10px 0;max-height:150px;overflow:auto} .actions{display:flex;gap:8px}.actions button{font-size:12px} #compact{border-radius:25px;background:#237657;color:#fff;padding:11px 17px;box-shadow:0 4px 18px #122f2426}
    </style><button id="compact" hidden>课件助手 · 展开</button><section id="panel" aria-label="课件连播助手">
      <header><span class="mark" aria-hidden="true">▷</span><div><h2>课件连播助手</h2><small>白玉兰适用 · v${VERSION}</small></div><button id="collapse" title="收起面板，连播继续" aria-label="收起面板">−</button></header>
      <button id="toggle">开始连播</button>
      <label class="muteline"><input id="muted" type="checkbox">静音播放<span id="audio">声音开启</span></label>
      <p id="status" role="status" aria-live="polite"></p><p id="issue" role="status" hidden></p>
      <details id="settings"><summary>播放设置</summary>
        <label class="setting">播放速度<div><select id="rate" aria-label="播放速度">${rates.map(rate => `<option value="${rate}">${rate}×</option>`).join('')}</select><span id="speed"></span></div></label>
        <label class="setting">播完切下一课<input id="next" type="checkbox"></label>
        <p class="note">倍速是否计入学习时长，以官网规则为准。</p>
      </details>
      <details id="help"><summary id="help-title">帮助与日志</summary>
        <p class="note">无法播放时，先点播放器播放键。验证和官网提示请手动处理。</p><pre id="diagnostics"></pre><pre id="logs"></pre>
        <div class="actions"><button id="export">导出日志</button><button id="clear">清空日志</button></div>
        <p class="note">日志仅在当前页面内存中保留最近 200 条，刷新后清除。导出由你主动发起，不自动上传。</p>
      </details><p class="note">非官方工具 · 学习记录以官网为准</p>
    </section>`;
    document.body.appendChild(host);
    $('muted').checked = state.muted; $('rate').value = String(state.rate); $('next').checked = state.autoNext;
    $('toggle').onclick = guard(() => {
      if (document.getElementById('byljx-local-helper')) { log('LEGACY'); setStatus(messages.LEGACY[1]); return; }
      if (state.running) { stop(); return; }
      if (!videos().length) { log('NO_VIDEO'); setStatus(messages.NO_VIDEO[1]); return; }
      if (visibleDialog()) { log('DIALOG'); setStatus(messages.DIALOG[1]); return; }
      state.running = true; log('START'); setText($('toggle'), '暂停连播'); setStatus('正在准备播放…'); scan(true);
    });
    $('muted').onchange = guard(() => {
      state.muted = $('muted').checked; state.audioConfigured = true; save();
      videos().forEach(applyAudio); log(state.muted ? 'MUTED' : 'UNMUTED');
      if (!videos().length) log('NO_VIDEO'); renderState();
    });
    $('rate').onchange = guard(() => {
      const rate = Number($('rate').value);
      if (!rates.includes(rate)) return;
      state.rate = rate; save(); videos().forEach(apply); log('RATE'); renderState();
    });
    $('next').onchange = guard(() => { state.autoNext = $('next').checked; save(); if (!state.autoNext) cancelNext(); });
    $('help').ontoggle = guard(() => { renderState(); renderLogs(); });
    $('export').onclick = guard(exportLogs);
    $('clear').onclick = guard(() => { rows.length = 0; dedupe.clear(); latestIssue = ''; renderLogs(); });
    $('collapse').onclick = () => { $('panel').hidden = true; $('compact').hidden = false; renderState(); };
    $('compact').onclick = () => { $('panel').hidden = false; $('compact').hidden = true; };
    setStatus(statusText); renderState(); renderLogs();
  }
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = later(() => { scanTimer = null; scan(); }, 250);
  }
  function scan(start = false) {
    if (lastPage !== location.href) {
      lastPage = location.href;
      if (state.running) stop('NAVIGATION', false);
      else cancelNext();
    }
    const coursePage = Boolean(document.querySelector('[class*="subjectList"], ' + PLAYER));
    if (coursePage) mount();
    if (document.getElementById('byljx-local-helper')) { log('LEGACY'); setStatus(messages.LEGACY[1]); return; }
    if (host) host.hidden = !coursePage;
    for (const doc of docs()) {
      if (doc.body && !observed.has(doc)) {
        observed.add(doc);
        new MutationObserver(scheduleScan).observe(doc.body, { childList: true, subtree: true });
      }
      for (const video of doc.querySelectorAll('video')) {
        if (!isCourseVideo(video)) continue;
        const isNew = !bound.has(video);
        if (isNew) {
          bound.add(video);
          video.addEventListener('ended', guard(() => onEnded(video)));
          video.addEventListener('loadedmetadata', guard(() => { endKeys.delete(video); apply(video); play(video); renderState(); }));
          video.addEventListener('playing', guard(() => {
            if (state.audioConfigured || state.running) applyAudio(video);
            if (state.running) setStatus(state.autoNext ? '正在连播 · 播完自动切换' : '正在播放 · 自动切课已关闭'); renderState();
          }));
          video.addEventListener('volumechange', guard(() => {
            if (state.muted && (state.audioConfigured || state.running) && video.volume !== 0) applyAudio(video);
            renderState();
          }));
          video.addEventListener('ratechange', guard(renderState));
          video.addEventListener('error', guard(() => {
            const code = ({ 1: 'VIDEO_ABORTED', 2: 'VIDEO_NETWORK', 3: 'VIDEO_DECODE', 4: 'VIDEO_UNSUPPORTED' })[video.error?.code] || 'VIDEO_UNKNOWN';
            log(code); setStatus(messages[code][1]);
          }));
        }
        if (isNew || start) { apply(video); play(video); }
      }
    }
    if (state.muted && state.audioConfigured) videos().forEach(applyAudio);
    renderState();
  }
  async function init() {
    try {
      const value = (await platform.getPreferences()) || {};
      state.rate = rates.includes(value.rate) ? value.rate : 1;
      state.muted = value.muted === true;
      state.autoNext = value.autoNext !== false;
      state.audioConfigured = state.muted;
    } catch (_) { log('STORAGE_READ'); }
    log('READY'); scan();
    setInterval(guard(() => scan()), 2000);
    window.addEventListener('pagehide', cancelNext);
    window.addEventListener('popstate', scheduleScan);
    window.addEventListener('hashchange', scheduleScan);
  }
  init().catch(() => log('INTERNAL'));
}
runByljxHelper({
  version: '1.2.0',
  getPreferences: async () => GM_getValue('playbackPreferences', {}),
  setPreferences: async value => GM_setValue('playbackPreferences', value)
});
