'use strict';
document.getElementById('version').textContent = chrome.runtime.getManifest().version;
document.getElementById('open').onclick = () => {
  chrome.tabs.create({ url: 'https://byljxjy.com/' }).catch(() => {
    document.getElementById('open').textContent = '请手动打开 byljxjy.com';
  });
};
