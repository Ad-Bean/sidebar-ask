/**
 * Sidebar Ask — background service worker
 *
 * Two jobs only:
 *   1. Keep the context menu in place
 *   2. Write the selected text to storage, then open the sidebar
 *
 * No network requests, no data collection.
 */

const MENU_ASK = 'ds-lite-ask';
const MENU_OPEN = 'ds-lite-open';
const PENDING_KEY = 'dsPending';
const LAST_KEY = 'dsLastText';
const CHAT_URL = 'https://chat.deepseek.com/';

/* ---------- install / startup ---------- */

function ensureUi() {
  const t = (key, fallback) => chrome.i18n.getMessage(key) || fallback;

  // Remove then recreate, so a reinstall never leaves duplicate menu ids behind
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ASK,
      // %s is substituted with the selection, same as the built-in menu items
      title: t('menuAsk', 'Ask DeepSeek about “%s”'),
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: MENU_OPEN,
      title: t('menuOpen', 'Open sidebar'),
      contexts: ['page']
    });
  });

  // Toolbar icon click toggles the sidebar
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.warn('[sidebar-ask] setPanelBehavior:', err));
  }
}

chrome.runtime.onInstalled.addListener(ensureUi);
chrome.runtime.onStartup.addListener(ensureUi);
ensureUi();

/* ---------- menu click ---------- */

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const isAsk = info.menuItemId === MENU_ASK;
  const isOpen = info.menuItemId === MENU_OPEN;
  if (!isAsk && !isOpen) return;

  if (isAsk) {
    const text = (info.selectionText || '').trim();
    if (text) {
      const now = Date.now();
      // Persist first, then open: the content script may read it the moment
      // the iframe finishes loading.
      // Deliberately not awaited — the user gesture has to stay available
      // for sidePanel.open() below.
      //
      // target: 'iframe' keeps a same-origin tab or a standalone window from
      // stealing an entry that belongs to the sidebar.
      chrome.storage.local
        .set({
          [PENDING_KEY]: { text, ts: now, nonce: now, target: 'iframe' },
          [LAST_KEY]: { text, ts: now }
        })
        .catch((err) => console.warn('[sidebar-ask] storage.set:', err));
    }
  }

  openPanel(tab);
});

/* ---------- opening the panel ---------- */

async function openPanel(tab) {
  const windowId =
    tab && tab.windowId != null ? tab.windowId : chrome.windows.WINDOW_ID_CURRENT;

  try {
    if (!chrome.sidePanel || !chrome.sidePanel.open) {
      throw new Error('sidePanel API unavailable');
    }
    await chrome.sidePanel.open({ windowId });
  } catch (err) {
    // Never fail silently: fall back to a docked standalone window,
    // which behaves the same from the user's point of view.
    console.warn('[sidebar-ask] sidePanel.open failed, using a window:', err);
    await openStandaloneWindow(windowId);
  }
}

async function openStandaloneWindow(windowId) {
  try {
    // The pending text was addressed to an iframe; a window is a top-level
    // document, so the delivery target has to be rewritten.
    const got = await chrome.storage.local.get(PENDING_KEY);
    const p = got && got[PENDING_KEY];
    if (p) {
      await chrome.storage.local.set({
        [PENDING_KEY]: { ...p, target: 'window', ts: Date.now() }
      });
    }

    let bounds = { left: 0, top: 0, width: 1440, height: 900 };
    try {
      const win = await chrome.windows.get(windowId);
      if (win) {
        bounds = {
          left: win.left || 0,
          top: win.top || 0,
          width: win.width || 1440,
          height: win.height || 900
        };
      }
    } catch (_) { /* fall back to the defaults above */ }

    const width = 480;
    await chrome.windows.create({
      url: CHAT_URL,
      type: 'popup',
      width,
      height: Math.max(600, bounds.height - 40),
      left: Math.max(0, bounds.left + bounds.width - width),
      top: Math.max(0, bounds.top),
      focused: true
    });
  } catch (err) {
    console.warn('[sidebar-ask] standalone window failed too:', err);
  }
}
