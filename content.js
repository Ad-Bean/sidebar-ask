/**
 * DeepSeek Sidebar Lite — content script
 *
 * 运行在 chat.deepseek.com（含侧边栏 iframe、独立窗口、普通标签页）。
 * 唯一职责：把 storage 里待处理的文字，塞进 DeepSeek 的输入框。
 *
 * 注入手法取自站点自身的 setValue 实现（main.js）：
 *   用 HTMLTextAreaElement.prototype 的原生 value setter 赋值，
 *   再派发冒泡的 input 事件 —— 这样 React 的受控组件才会同步状态。
 * 直接 el.value = x 会被 React 的 value tracker 吞掉。
 */

(() => {
  'use strict';

  if (window.__dsLiteInjected) return;
  window.__dsLiteInjected = true;

  const PENDING_KEY = 'dsPending';
  const TTL_MS = 120000;   // 待处理文本的生命周期：2 分钟
  const FAST_MS = 12000;   // 前 12 秒高频轮询（等 SPA 挂载），之后降频
  const MAX_WRITES = 4;    // 同一段文本最多写入几次，防止反复追加
  const PRIMARY_SEL = 'textarea[name="user query"]';

  let handledNonce = 0;
  let injecting = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function usable(el) {
    if (!el || !el.isConnected) return false;
    if (el.disabled || el.readOnly) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function findInput() {
    for (const el of document.querySelectorAll(PRIMARY_SEL)) {
      if (usable(el)) return el;
    }
    // 兜底：站点改版后 name 变了也不至于直接失效
    for (const el of document.querySelectorAll('textarea')) {
      if (usable(el)) return el;
    }
    return null;
  }

  function setNativeValue(el, value) {
    const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function caretToEnd(el) {
    try {
      const len = (el.value || '').length;
      el.setSelectionRange(len, len);
    } catch (_) {
      /* 某些状态下 setSelectionRange 会抛错，忽略 */
    }
  }

  /** 已有草稿时追加而不是覆盖 —— 用户手打的字不能丢 */
  function compose(current, incoming) {
    const base = (current || '').replace(/\s+$/, '');
    return base ? `${base}\n\n${incoming}` : incoming;
  }

  /**
   * @param {string} text
   * @param {number} deadline 超过这个时间就不再尝试
   */
  async function inject(text, deadline) {
    if (injecting) return false;
    injecting = true;

    let writes = 0;
    const t0 = Date.now();

    try {
      while (Date.now() < deadline) {
        const el = findInput();

        if (el) {
          // 已经在框里了就直接收工（重试路径下避免重复追加）
          if ((el.value || '').includes(text)) {
            el.focus();
            caretToEnd(el);
            return true;
          }

          if (writes < MAX_WRITES) {
            writes += 1;
            setNativeValue(el, compose(el.value, text));
            el.focus();
            caretToEnd(el);

            // React 受控组件可能在下一帧用内部 state 覆写我们写的值，
            // 等一拍再校验，被覆写就重来。
            await sleep(160);

            if (el.isConnected && (el.value || '').includes(text)) {
              el.focus();
              caretToEnd(el);
              return true;
            }
            continue;
          }
        }

        await sleep(Date.now() - t0 < FAST_MS ? 150 : 1000);
      }
      return false;
    } finally {
      injecting = false;
    }
  }

  async function consumePending() {
    let data;
    try {
      data = await chrome.storage.local.get(PENDING_KEY);
    } catch (_) {
      return;
    }

    const p = data && data[PENDING_KEY];
    if (!p || typeof p.text !== 'string' || !p.text) return;

    const ts = Number(p.ts) || 0;
    if (Date.now() - ts > TTL_MS) return;            // 过期内容不要莫名其妙冒出来
    if (p.nonce && p.nonce === handledNonce) return; // 同一条只处理一次

    // 只有送对了地方才注入：'iframe' 给侧边栏，'window' 给独立窗口。
    // 否则用户开着 DeepSeek 标签页时，内容会被不相干的页面抢走。
    const inFrame = !!(window.parent && window.parent !== window);
    if (p.target === 'iframe' && !inFrame) return;
    if (p.target === 'window' && inFrame) return;

    handledNonce = p.nonce || 0;

    // 未登录时会停在 /sign_in（没有输入框）。此时不要放弃：
    // 给足 2 分钟，用户登录完成后文字仍会自动落进输入框。
    const ok = await inject(p.text, ts + TTL_MS);

    if (ok) {
      try { await chrome.storage.local.remove(PENDING_KEY); } catch (_) {}
    }

    notifyParent({ type: 'inject-result', ok });
  }

  function notifyParent(msg) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ __dsLite: true, ...msg }, '*');
      }
    } catch (_) {}
  }

  /* 面板已开着时，storage 变化是唯一的送达通道 */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[PENDING_KEY]) return;
    consumePending();
  });

  /* 面板刚打开、iframe 刚加载时的首次读取 */
  consumePending();

  /* 存活探测：父级 ping，我们 pong。侧边栏据此判断 iframe 是否真的起来了 */
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.__dsLite !== true) return;
    if (d.type === 'ping') {
      notifyParent({ type: 'pong', href: location.href });
    }
  });
})();
