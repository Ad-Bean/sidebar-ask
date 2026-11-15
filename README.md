# Sidebar Ask

<p align="center">
  <img src="icons/icon128.png" width="96" alt="Sidebar Ask icon">
</p>

<p align="center">
  A tiny sidebar for DeepSeek. Select text on any page, right-click, and it drops straight into the input box — press Enter to send.
  <br>
  <sub><a href="README.zh-CN.md">中文说明</a></sub>
</p>

---

## Install

Requires Edge / Chrome **116+**.

1. Download `sidebar-ask-v*.zip` from [Releases](../../releases) and unzip it.
2. Open `edge://extensions/` (Chrome: `chrome://extensions/`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the unzipped folder — the one that contains `manifest.json`.
5. Pin the icon to the toolbar.

You may need to sign in once inside the sidebar — see [Notes](#notes).

## Usage

| Action | Result |
|---|---|
| Click the toolbar icon | Toggle the sidebar |
| Select text → right-click → **Ask DeepSeek about “…”** | Text is written into the input box, focused, caret at the end |
| The input box already has a draft | Appended, not overwritten |
| Right-click an empty area → **Open sidebar** | Opens only, carries no text |

It never sends for you. Sending spends quota and can't be undone — press Enter yourself.

## Notes

- **Sign in once.** Browsers partition storage for third-party sites embedded in extension pages, so a login from a normal tab may not carry over.
- **Response headers are stripped for embedding.** `chat.deepseek.com` sends `frame-ancestors 'none'`, so `rules.json` removes `X-Frame-Options` and CSP from its sub-frame responses. The rule is scoped to that domain, but it applies whenever any page frames it.
- **Text waits up to 2 minutes** while signed out — the sign-in page has no input box. It lands in the box once you're through.
- **No styling is injected** into the site.
- **If the site refuses to embed,** the panel offers a separate window, where it loads as a top-level page.

## Privacy

No data collected, no analytics, no network requests of its own. See [PRIVACY.md](PRIVACY.md).

## Development

```bash
python tools/package.py   # builds dist/sidebar-ask-v<version>.zip
```

Reload the extension from the extensions page to pick up changes.

## License

[MIT](LICENSE)

---

Not affiliated with DeepSeek. “DeepSeek” is a trademark of its owner, used here only to describe what this tool works with.
