# Multi-site support — scoping plan

Status: **not started.** This document exists so the decision can be made on
evidence rather than optimism.

## What "multi-site" means here

One extension, one sidebar, several chat services behind it. The user picks a
service; right-clicking text still drops it into that service's input box.

## The hard part is not the selector

It is tempting to think this is a `querySelector` table. It is not. Three
independent obstacles decide whether a site can work at all:

### 1. Can the page be framed?

`chat.deepseek.com` sends `frame-ancestors 'none'`, which we strip with
declarativeNetRequest. Every other site needs the same treatment, and how much
has to be stripped varies.

| Site | Frame headers | Probed here? |
|---|---|---|
| `chat.deepseek.com` | `frame-ancestors 'none'` — stripped, **works** | yes, verified |
| `claude.ai` | `x-frame-options: SAMEORIGIN` + CSP **report-only** | yes — looks strippable |
| `chatgpt.com` | unknown | no — 502 from this network |
| `gemini.google.com` | unknown | no — 502 from this network |
| `grok.com` | unknown | no — 502 from this network |

### 2. Can the user sign in inside a frame?

This is the actual blocker, and it is not something we can strip our way out of.

Google's sign-in pages refuse to be framed. Any service that leans on
"Sign in with Google" will show a dead login box inside the sidebar. DeepSeek
works because it has its own login form.

Consequence: **Gemini is probably not viable in frame mode at all** (its whole
login is Google). ChatGPT and Claude offer email login, so they are plausible —
but this must be confirmed by actually trying it, not reasoned about.

*Confidence: high on the Google behaviour, not verified from this network.*

### 3. What kind of input element is it?

Our injection relies on the native `textarea` value setter plus a bubbling
`input` event. That works for DeepSeek because its composer is a controlled
`<textarea>`. Sites built on ProseMirror / Lexical / Slate use a
`contenteditable` div, where that approach does nothing — they need
`document.execCommand('insertText')` or a synthesised `beforeinput`/`InputEvent`
with `inputType: 'insertText'`.

Claude's composer is a ProseMirror editor, so it falls into this second group.
That is not hard, but it is a different code path that has to be written and
tested per site.

## The escape hatch that makes this tractable

The panel already falls back to a standalone window when framing fails, and the
window path needs no header stripping and no framing at all. So framing is a
*quality* question per site, not a blocker for shipping:

- frame mode where it works (better UX: docked, persistent)
- window mode everywhere else (already implemented)

This means multi-site can ship incrementally, site by site, without waiting for
every site to pass the framing test.

## Proposed shape

```
content.js            → engine: TTL, nonce, target routing, retry loop
content/adapters/
    deepseek.js       → { findInput, kind, signedOutPath }
    claude.js
    chatgpt.js
```

Adapter contract:

```js
{
  id: 'deepseek',
  matches: ['https://chat.deepseek.com/*'],
  panelUrl: 'https://chat.deepseek.com/',
  signedOutPath: /\/sign_in/,
  kind: 'textarea',              // or 'contenteditable'
  findInput() { ... },           // returns the element or null
}
```

The engine keeps everything it already does: nonce de-duplication, the
append-not-overwrite rule, the 2-minute window, the stall notice, and the
`target: iframe | window` routing. Only two things become per-site: how to find
the input, and how to write into it.

`rules.json` collapses into a single rule using `requestDomains: [...]`, so
adding a site does not add another rule.

## Work breakdown

Assumes one developer already familiar with this codebase.

| Item | Scope | Estimate |
|---|---|---|
| Adapter abstraction | split `content.js` into engine + adapter, keep DeepSeek behaviour identical, regression test it | 2–3 h |
| Embeddability probe, per site | headers, real-browser iframe, login flow, send a message | 0.5–1 h |
| Input discovery + injection, per site | selector or `contenteditable` strategy; handle React re-render clobbering | 0.5–2 h |
| Panel site switcher | one-time UI + persisted choice + per-site panel URL | 1–2 h |
| DNR + manifest expansion | `requestDomains`, `host_permissions`, content script matches | 0.5 h |
| Regression pass, per site | login, inject, no double-append, draft preserved | 1 h |
| Store/README copy update | permission justification for each added domain | 0.5 h |

**One-time cost: roughly 4–7 hours.**
**Per additional site: roughly 2.5–4.5 hours.**

Three extra sites: **12–20 hours total**, and the spread is dominated by
per-site investigation, not by code.

## Risks

1. **Store review.** Each added domain widens `host_permissions` and the header
   stripping. More domains means more scrutiny of the "remove security headers"
   rule. A single-site extension is much easier to defend.
2. **Silent breakage.** Each site changes markup independently. With N sites
   you get N times the breakage surface, and the failure is invisible unless the
   user reads the notice. The diagnostics view added in v1.0.2 is what makes
   this survivable — keep it.
3. **Login flows are not testable offline.** These have to be checked by hand,
   in a real browser, per site.
4. **Scope creep into "a general AI sidebar".** That category is crowded and
   the maintenance cost is permanent.

## Recommendation

Do **one** site first, and pick `claude.ai` — it is the only non-DeepSeek site
with evidence that framing can work, and it forces the `contenteditable`
injection path to be built, which is the harder of the two.

If the adapter abstraction survives that (i.e. adding Claude touches one new
file plus manifest entries, and nothing in the engine), the design is sound and
the remaining sites are mechanical.

If it does not, the abstraction is wrong and it is cheaper to find that out
with one site than with four.
