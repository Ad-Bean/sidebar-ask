/**
 * Sidebar Ask — content script
 *
 * Runs on chat.deepseek.com — inside the sidebar iframe, a standalone window,
 * or an ordinary tab. Its only job: write the pending text into DeepSeek's
 * input box.
 *
 * The injection mirrors the site's own setValue implementation (main.js): assign
 * through the native HTMLTextAreaElement `value` setter, then dispatch a bubbling
 * `input` event, so React's controlled component picks the change up.
 * A plain `el.value = x` is swallowed by React's value tracker.
 */

(() => {
  'use strict';

  if (window.__dsLiteInjected) return;
  window.__dsLiteInjected = true;

  const PENDING_KEY = 'dsPending';
  const TTL_MS = 120000;   // how long a pending entry stays valid: 2 minutes
  const FAST_MS = 12000;   // poll quickly for the first 12s (while the SPA mounts)
  const STALL_MS = 10000;  // after this long with no input box, tell the panel
  const MAX_WRITES = 4;    // cap writes per text so a retry never appends twice
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
    // Fallback in case the site renames the field
    for (const el of document.querySelectorAll('textarea')) {
      if (usable(el)) return el;
    }
    return null;
  }

  /** Snapshot of what we can see, sent to the panel so the user can self-diagnose */
  function snapshot() {
    const primary = document.querySelectorAll(PRIMARY_SEL);
    const all = document.querySelectorAll('textarea');
    let visible = 0;
    for (const el of all) {
      if (usable(el)) visible += 1;
    }
    return {
      href: location.href,
      inFrame: window.parent !== window,
      signedOut: /\/sign_in/.test(location.pathname),
      primarySel: PRIMARY_SEL,
      primaryCount: primary.length,
      textareaCount: all.length,
      visibleCount: visible,
      title: document.title
    };
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
      /* setSelectionRange can throw in some states; harmless here */
    }
  }

  /** Append to an existing draft rather than replacing it — never eat the user's typing */
  function compose(current, incoming) {
    const base = (current || '').replace(/\s+$/, '');
    return base ? `${base}\n\n${incoming}` : incoming;
  }

  /**
   * @param {string} text
   * @param {number} deadline stop trying after this timestamp
   */
  async function inject(text, deadline) {
    if (injecting) return false;
    injecting = true;

    let writes = 0;
    let stalled = false;
    const t0 = Date.now();

    try {
      while (Date.now() < deadline) {
        // Don't leave the user staring at nothing for two minutes: report early,
        // then keep retrying quietly in the background.
        if (!stalled && Date.now() - t0 > STALL_MS) {
          stalled = true;
          const snap = snapshot();
          if (!snap.visibleCount) {
            notifyParent({ type: 'inject-stalled', reason: 'no-input', diag: snap });
          }
        }

        const el = findInput();

        if (el) {
          // Already in the box — finish here, so a retry never appends twice
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

            // React may overwrite the value from its own state on the next
            // frame, so wait one tick and verify. Retry if it got clobbered.
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
    if (Date.now() - ts > TTL_MS) return;            // stale entries must not resurface
    if (p.nonce && p.nonce === handledNonce) return; // handle each entry once

    // Only inject where it was addressed: 'iframe' for the sidebar,
    // 'window' for the standalone window. Otherwise a DeepSeek tab the user
    // happens to have open would swallow the text.
    const inFrame = !!(window.parent && window.parent !== window);
    if (p.target === 'iframe' && !inFrame) return;
    if (p.target === 'window' && inFrame) return;

    handledNonce = p.nonce || 0;

    // Signed out is diagnosable right away — say so instead of waiting it out.
    // Retrying still continues for the full TTL, so the text lands once the
    // user is through the login screen.
    const pre = snapshot();
    if (pre.signedOut) {
      notifyParent({ type: 'inject-stalled', reason: 'signed-out', diag: pre });
    }

    const ok = await inject(p.text, ts + TTL_MS);

    if (ok) {
      try { await chrome.storage.local.remove(PENDING_KEY); } catch (_) {}
    }

    notifyParent({ type: 'inject-result', ok, diag: snapshot() });
  }

  function notifyParent(msg) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ __dsLite: true, ...msg }, '*');
      }
    } catch (_) {}
  }

  /* With the panel already open, a storage change is the only delivery path */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[PENDING_KEY]) return;
    consumePending();
  });

  /* First read, for a freshly loaded panel iframe */
  consumePending();

  /* Liveness probe: the panel pings, we pong — that's how it knows we're really here */
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.__dsLite !== true) return;
    if (d.type === 'ping') {
      notifyParent({ type: 'pong', href: location.href });
    }
  });
})();
