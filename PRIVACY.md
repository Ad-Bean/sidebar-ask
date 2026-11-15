# Privacy

Last updated: 2026-11-15

## Short version

This extension collects nothing, stores nothing of yours, and sends nothing to any server. There is no backend, no analytics, no telemetry.

## Details

**The extension makes no network requests of its own.** The only network activity is `chat.deepseek.com` loading its own resources and submitting your messages while you use the sidebar — exactly what happens when you visit the site in a normal tab. The extension does not intercept, record, or forward any of it.

**It does not read page content.** The content script is injected only into `chat.deepseek.com`, and does one thing: writes the text you selected via the context menu into that page's input box.

**What is stored locally.** A single pending-text entry (`dsPending`) is kept in the browser's extension storage, just long enough to hand the selected text to the sidebar. It is deleted as soon as the text is written into the input box, and expires after 2 minutes regardless. Nothing else is stored.

**Permissions.**

| Permission | Why |
|---|---|
| `sidePanel` | Display the sidebar |
| `contextMenus` | Provide the “Ask DeepSeek about …” menu item |
| `storage` | Pass the selected text from the context menu to the sidebar |
| `declarativeNetRequestWithHostAccess` | Remove `X-Frame-Options` / `Content-Security-Policy` from `chat.deepseek.com` sub-frame responses, without which the site refuses to be embedded |
| `host_permissions: chat.deepseek.com` | Restrict script injection and header modification to that one site |

**What it does not do.** No browsing history, no reading of other sites, no analytics scripts, no ads, no affiliate links, no third-party data sharing.

## Contact

Open an issue in this repository.
