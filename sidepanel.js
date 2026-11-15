/**
 * Sidebar Ask — panel logic
 *
 * No bottom banner, no rate prompt, no analytics.
 * Three jobs: load the iframe, check whether it is actually alive, and offer a
 * standalone window as a fallback.
 */

const CHAT_URL = 'https://chat.deepseek.com/';
const PING_INTERVAL = 600;
const GIVE_UP_MS = 7000;

/* ---------- localization ---------- */

const t = (key, fallback) => {
  try {
    return chrome.i18n.getMessage(key) || fallback;
  } catch (_) {
    return fallback;
  }
};

function localize() {
  const uiLang = (chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || 'en';
  document.documentElement.lang = uiLang;

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const msg = t(el.dataset.i18n, '');
    if (msg) el.textContent = msg;
  }

  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    const msg = t(el.dataset.i18nTitle, '');
    if (!msg) continue;
    el.title = msg;
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', msg);
  }
}

localize();

let frame = document.getElementById('frame');
const fallbackEl = document.getElementById('fallback');
const statusEl = document.getElementById('status');
const noticeEl = document.getElementById('notice');
const noticeText = document.getElementById('noticeText');
const diagEl = document.getElementById('diag');
const diagBody = document.getElementById('diagBody');

let alive = false;
let startedAt = 0;
let timer = null;
let lastDiag = null;
let noticeReason = null;

/* ---------- status dot ---------- */

function setAlive(v) {
  alive = v;
  statusEl.classList.toggle('on', v);
  statusEl.title = v ? t('statusReady', 'Ready') : t('statusIdle', 'Not connected');
}

/* ---------- liveness probe ----------
   A blocked iframe still fires `load`, so load cannot be used as a success
   signal. The frame counts as alive only once the content script actually ran
   and answered with a pong. */

function ping() {
  try {
    frame.contentWindow.postMessage({ __dsLite: true, type: 'ping' }, '*');
  } catch (_) {
    /* iframe not ready yet */
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

/* ---------- fallback layer ---------- */

function showFallback() {
  if (alive) return;
  fallbackEl.hidden = false;
}

function hideFallback() {
  fallbackEl.hidden = true;
}

/* ---------- failure notice ----------
   A green dot only proves the content script is reachable. It says nothing
   about whether the text landed, so failures get an explicit notice. */

const REASON_KEY = {
  'signed-out': 'noticeSignIn',
  'no-input': 'noticeNoInput',
  failed: 'noticeFailed'
};

function showNotice(reason) {
  // "signed out" is the more precise diagnosis; don't let a later generic
  // "no input box" overwrite it.
  if (noticeReason === 'signed-out' && reason === 'no-input') return;

  noticeReason = reason;
  noticeText.textContent = t(REASON_KEY[reason] || 'noticeFailed', 'Couldn’t place the text');
  noticeEl.hidden = false;
}

function hideNotice() {
  noticeEl.hidden = true;
  diagEl.hidden = true;
  noticeReason = null;
}

function renderDiag(diag) {
  const lines = [];
  const push = (k, v) => lines.push(`${k.padEnd(13)}${v}`);

  push('version', chrome.runtime.getManifest().version);
  push('ui language', document.documentElement.lang || '?');
  push('panel width', `${Math.round(window.innerWidth)}px`);

  if (diag) {
    push('frame url', diag.href || '?');
    push('in frame', diag.inFrame ? 'yes' : 'no');
    push('signed out', diag.signedOut ? 'yes' : 'no');
    push('page title', diag.title || '?');
    push('selector', diag.primarySel || '?');
    push('  matches', String(diag.primaryCount ?? '?'));
    push('textareas', String(diag.textareaCount ?? '?'));
    push('  visible', String(diag.visibleCount ?? '?'));
  } else {
    push('frame info', 'unavailable — no response from the page');
  }

  push('time', new Date().toISOString());
  diagBody.textContent = lines.join('\n');
}

/* ---------- messages from the content script ---------- */

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

  if (d.type === 'inject-stalled') {
    lastDiag = d.diag || lastDiag;
    showNotice(d.reason);
    return;
  }

  if (d.type === 'inject-result') {
    lastDiag = d.diag || lastDiag;
    if (d.ok) {
      hideNotice();
      flash();
    } else {
      showNotice('failed');
    }
  }
});

/* Tiny confirmation that text landed — no toast, no trace left behind */
function flash() {
  const mark = document.querySelector('.mark');
  if (!mark) return;
  mark.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
    { duration: 260, easing: 'ease-out' }
  );
}

/* ---------- load / reload ---------- */

function bindFrame() {
  frame.addEventListener('load', () => {
    ping();
    // The content script sometimes lands after `load`, so follow up twice
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
  hideNotice();
  startWatchdog();
}

/* ---------- standalone window (fallback path) ----------
   As a top-level document, chat.deepseek.com is not subject to
   frame-ancestors there, and the content script always gets injected. */

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
    console.warn('[sidebar-ask] popOut failed:', err);
    chrome.tabs.create({ url: CHAT_URL });
  }
}

/* ---------- wiring ---------- */

document.getElementById('btnReload').addEventListener('click', reloadFrame);
document.getElementById('btnPopout').addEventListener('click', popOut);
document.getElementById('fbRetry').addEventListener('click', () => {
  reloadFrame();
});
document.getElementById('fbPopout').addEventListener('click', popOut);

document.getElementById('noticeDetails').addEventListener('click', () => {
  renderDiag(lastDiag);
  diagEl.hidden = false;
});

document.getElementById('noticeClose').addEventListener('click', hideNotice);

document.getElementById('diagClose').addEventListener('click', () => {
  diagEl.hidden = true;
});

document.getElementById('diagCopy').addEventListener('click', async () => {
  const btn = document.getElementById('diagCopy');
  try {
    await navigator.clipboard.writeText(diagBody.textContent || '');
    btn.textContent = t('diagCopied', 'Copied');
  } catch (_) {
    // Clipboard blocked: the text is still selectable, so point at that
    btn.textContent = 'Ctrl+C';
  }
  setTimeout(() => {
    btn.textContent = t('diagCopy', 'Copy');
  }, 1400);
});

bindFrame();
startWatchdog();
