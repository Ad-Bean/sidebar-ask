/**
 * DeepSeek Sidebar Lite — background service worker
 *
 * 职责只有两件：
 *   1. 维护右键菜单
 *   2. 把选中文字写进 storage，然后打开侧边栏
 *
 * 不做任何网络请求，不采集任何数据。
 */

const MENU_ASK = 'ds-lite-ask';
const MENU_OPEN = 'ds-lite-open';
const PENDING_KEY = 'dsPending';
const LAST_KEY = 'dsLastText';
const CHAT_URL = 'https://chat.deepseek.com/';

/* ---------- 安装 / 启动 ---------- */

function ensureUi() {
  // 右键菜单：先清空再重建，避免重复 id 与升级残留
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ASK,
      // %s 会被替换为选中的文字，和系统自带菜单一致
      title: '问 DeepSeek：「%s」',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: MENU_OPEN,
      title: '打开 DeepSeek 侧边栏',
      contexts: ['page']
    });
  });

  // 点击工具栏图标 = 开关侧边栏
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.warn('[ds-lite] setPanelBehavior:', err));
  }
}

chrome.runtime.onInstalled.addListener(ensureUi);
chrome.runtime.onStartup.addListener(ensureUi);
ensureUi();

/* ---------- 菜单点击 ---------- */

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const isAsk = info.menuItemId === MENU_ASK;
  const isOpen = info.menuItemId === MENU_OPEN;
  if (!isAsk && !isOpen) return;

  if (isAsk) {
    const text = (info.selectionText || '').trim();
    if (text) {
      const now = Date.now();
      // 先落盘再开面板：内容脚本可能在 iframe 加载完成时立刻读取。
      // 注意不要 await —— 用户手势必须留给下面的 sidePanel.open()。
      //
      // target: 'iframe' 用来避免独立窗口/普通标签页里的同域页面
      // 抢走本该送进侧边栏的那一条。
      chrome.storage.local
        .set({
          [PENDING_KEY]: { text, ts: now, nonce: now, target: 'iframe' },
          [LAST_KEY]: { text, ts: now }
        })
        .catch((err) => console.warn('[ds-lite] storage.set:', err));
    }
  }

  openPanel(tab);
});

/* ---------- 开面板 ---------- */

async function openPanel(tab) {
  const windowId =
    tab && tab.windowId != null ? tab.windowId : chrome.windows.WINDOW_ID_CURRENT;

  try {
    if (!chrome.sidePanel || !chrome.sidePanel.open) {
      throw new Error('sidePanel API 不可用');
    }
    await chrome.sidePanel.open({ windowId });
  } catch (err) {
    // 侧边栏打不开时不要静默失败：退化为贴右边缘的独立窗口，功能一致。
    console.warn('[ds-lite] sidePanel.open 失败，改用独立窗口:', err);
    await openStandaloneWindow(windowId);
  }
}

async function openStandaloneWindow(windowId) {
  try {
    // 待处理文本原本是给 iframe 的，独立窗口是顶层文档，需要改投递目标
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
      if (win) bounds = { left: win.left || 0, top: win.top || 0, width: win.width || 1440, height: win.height || 900 };
    } catch (_) { /* 拿不到就退回默认值 */ }

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
    console.warn('[ds-lite] 独立窗口也失败了:', err);
  }
}
