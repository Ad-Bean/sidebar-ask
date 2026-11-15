/**
 * DeepSeek Sidebar Lite — 侧边栏逻辑
 *
 * 没有底部横幅、没有评分提示、没有埋点。
 * 只做三件事：载入 iframe、探测它是否真的活着、提供独立窗口作为兜底。
 */

const CHAT_URL = 'https://chat.deepseek.com/';
const PING_INTERVAL = 600;
const GIVE_UP_MS = 7000;

let frame = document.getElementById('frame');
const fallbackEl = document.getElementById('fallback');
const statusEl = document.getElementById('status');

let alive = false;
let startedAt = 0;
let timer = null;

/* ---------- 状态灯 ---------- */

function setAlive(v) {
  alive = v;
  statusEl.classList.toggle('on', v);
  statusEl.title = v ? '已就绪' : '未连接';
}

/* ---------- 存活探测 ----------
   iframe 被 X-Frame-Options 拦住时，load 事件依然会触发，
   所以不能靠 load 判断成功。只有内容脚本真的跑起来了、
   回了 pong，才算活着。 */

function ping() {
  try {
    frame.contentWindow.postMessage({ __dsLite: true, type: 'ping' }, '*');
  } catch (_) {
    /* iframe 尚未成型 */
  }
}

function startWatchdog() {
  setAlive(false);
  hideFallback();
  startedAt = Date.now();
  clearInterval(timer);
  timer = setInterval(() => {
    if (alive) {
      clearInterval(timer);
      timer = null;
      return;
    }
    ping();
    if (Date.now() - startedAt > GIVE_UP_MS) {
      clearInterval(timer);
      timer = null;
      showFallback();
    }
  }, PING_INTERVAL);
  ping();
}

/* ---------- 兜底层 ---------- */

function showFallback() {
  if (alive) return;
  fallbackEl.hidden = false;
}

function hideFallback() {
  fallbackEl.hidden = true;
}

/* ---------- 来自内容脚本的消息 ---------- */

window.addEventListener('message', (ev) => {
  const d = ev.data;
  if (!d || d.__dsLite !== true) return;

  if (d.type === 'pong') {
    if (!alive) setAlive(true);
    hideFallback();
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    return;
  }

  if (d.type === 'inject-result' && d.ok) {
    flash();
  }
});

/* 注入成功后给个极短反馈，不弹窗、不留痕 */
function flash() {
  const mark = document.querySelector('.mark');
  if (!mark) return;
  mark.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
    { duration: 260, easing: 'ease-out' }
  );
}

/* ---------- 载入 / 重载 ---------- */

function bindFrame() {
  frame.addEventListener('load', () => {
    ping();
    // 有些情况下内容脚本注入晚于 load，再补两拍
    setTimeout(ping, 400);
    setTimeout(ping, 1200);
  });
}

function reloadFrame() {
  const fresh = frame.cloneNode(false);
  fresh.removeAttribute('id');
  fresh.id = 'frame';
  frame.replaceWith(fresh);
  frame = fresh;
  bindFrame();
  startWatchdog();
}

/* ---------- 独立窗口（兜底路径）----------
   独立窗口里 chat.deepseek.com 是顶层文档，不受 frame-ancestors 限制，
   内容脚本也一定注入得进去。 */

async function popOut() {
  try {
    const { dsLastText } = await chrome.storage.local.get('dsLastText');
    const last = dsLastText && dsLastText.text ? dsLastText : null;
    const fresh = last && Date.now() - (last.ts || 0) < 120000;

    if (fresh) {
      chrome.storage.local.set({
        dsPending: { text: last.text, ts: Date.now(), nonce: Date.now(), target: 'window' }
      });
    }

    const width = 480;
    const screenW = (window.screen && window.screen.availWidth) || 1920;
    const screenH = (window.screen && window.screen.availHeight) || 1040;

    chrome.windows.create({
      url: CHAT_URL,
      type: 'popup',
      width,
      height: Math.max(600, screenH - 40),
      left: Math.max(0, screenW - width),
      top: 0,
      focused: true
    });
  } catch (err) {
    console.warn('[ds-lite] popOut failed:', err);
    chrome.tabs.create({ url: CHAT_URL });
  }
}

/* ---------- 绑定 ---------- */

document.getElementById('btnReload').addEventListener('click', reloadFrame);
document.getElementById('btnPopout').addEventListener('click', popOut);
document.getElementById('fbRetry').addEventListener('click', () => {
  reloadFrame();
});
document.getElementById('fbPopout').addEventListener('click', popOut);

bindFrame();
startWatchdog();
