"""Static checks for the extension. Run before every commit; CI runs it too.

Catches the mistakes that are invisible until runtime:
  - a __MSG_key__ in manifest.json with no matching locale entry
  - a data-i18n key in the HTML that neither locale defines
  - a getMessage()/t() key used in JS that the locales do not have
  - locales drifting apart (missing keys on one side)
  - a file listed in package.py that no longer exists
  - JS syntax errors (when node is available)

Usage:
    python tools/validate.py
Exit code 0 = clean, 1 = problems found.
"""
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCALES_DIR = os.path.join(ROOT, "_locales")
DEFAULT_LOCALE = "en"

JS_FILES = ["background.js", "content.js", "sidepanel.js"]
HTML_FILES = ["sidepanel.html"]

problems = []


def fail(msg):
    problems.append(msg)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def load_json(rel):
    try:
        return json.loads(read(os.path.join(ROOT, rel)))
    except Exception as exc:  # noqa: BLE001
        fail(f"{rel}: invalid JSON — {exc}")
        return None


def main():
    # ---- locales -------------------------------------------------------
    locales = {}
    for name in sorted(os.listdir(LOCALES_DIR)):
        rel = f"_locales/{name}/messages.json"
        data = load_json(rel)
        if data is None:
            continue
        locales[name] = {k: v.get("message", "") for k, v in data.items()}

    if DEFAULT_LOCALE not in locales:
        fail(f"missing default locale: _locales/{DEFAULT_LOCALE}/messages.json")
        report()
        return

    base_keys = set(locales[DEFAULT_LOCALE])
    for name, msgs in locales.items():
        if name == DEFAULT_LOCALE:
            continue
        missing = base_keys - set(msgs)
        extra = set(msgs) - base_keys
        if missing:
            fail(f"_locales/{name}: missing keys {sorted(missing)}")
        if extra:
            fail(f"_locales/{name}: keys not in default locale {sorted(extra)}")

    for name, msgs in locales.items():
        for key, value in msgs.items():
            if not value.strip():
                fail(f"_locales/{name}: empty message for '{key}'")

    # ---- manifest ------------------------------------------------------
    manifest = load_json("manifest.json")
    if manifest:
        for field in ("manifest_version", "name", "version", "description", "default_locale"):
            if field not in manifest:
                fail(f"manifest.json: missing '{field}'")
        if manifest.get("default_locale") != DEFAULT_LOCALE:
            fail(f"manifest.json: default_locale is {manifest.get('default_locale')!r}, "
                 f"expected {DEFAULT_LOCALE!r}")

        # every __MSG_key__ must resolve
        raw = read(os.path.join(ROOT, "manifest.json"))
        for key in set(re.findall(r"__MSG_([A-Za-z0-9_]+)__", raw)):
            if key not in base_keys:
                fail(f"manifest.json: __MSG_{key}__ has no entry in {DEFAULT_LOCALE} locale")

    # ---- html ----------------------------------------------------------
    for rel in HTML_FILES:
        html = read(os.path.join(ROOT, rel))
        for key in re.findall(r'data-i18n(?:-title)?="([^"]+)"', html):
            if key not in base_keys:
                fail(f"{rel}: data-i18n key '{key}' missing from locales")

    # ---- js ------------------------------------------------------------
    for rel in JS_FILES:
        src = read(os.path.join(ROOT, rel))
        used = set(re.findall(r"getMessage\(\s*['\"]([A-Za-z0-9_]+)['\"]", src))
        used |= set(re.findall(r"\bt\(\s*['\"]([A-Za-z0-9_]+)['\"]", src))
        for key in sorted(used):
            if key not in base_keys:
                fail(f"{rel}: message key '{key}' missing from locales")
        if re.search(r"__MSG_[A-Za-z0-9_]+__", src):
            fail(f"{rel}: unresolved __MSG_ placeholder in script")

    # ---- unreferenced keys --------------------------------------------
    # Reverse direction: a key nobody mentions is either dead or was renamed
    # on one side only. Keys reached through a lookup table (e.g. REASON_KEY)
    # still show up here as string literals, so this catches those too.
    sources = ""
    for rel in ["manifest.json"] + HTML_FILES + JS_FILES:
        sources += read(os.path.join(ROOT, rel))
    for key in sorted(base_keys):
        if key not in sources:
            fail(f"locale key '{key}' is never referenced by manifest/html/js")

    # ---- packaged files exist -----------------------------------------
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    try:
        import package  # noqa: PLC0415

        for rel in package.FILES:
            if not os.path.isfile(os.path.join(ROOT, rel)):
                fail(f"tools/package.py lists a missing file: {rel}")
        for name in locales:
            if f"_locales/{name}/messages.json" not in package.FILES:
                fail(f"tools/package.py does not pack _locales/{name}/messages.json")
    except Exception as exc:  # noqa: BLE001
        fail(f"could not import tools/package.py — {exc}")

    # ---- js syntax -----------------------------------------------------
    node = shutil.which("node")
    if node:
        for rel in JS_FILES:
            proc = subprocess.run(
                [node, "--check", os.path.join(ROOT, rel)],
                capture_output=True, text=True
            )
            if proc.returncode != 0:
                fail(f"{rel}: syntax error — {proc.stderr.strip().splitlines()[-1:] or ''}")
    else:
        print("note: node not found, skipping syntax check")

    report()


def report():
    if problems:
        print(f"\n{len(problems)} problem(s):\n")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)

    print("all checks passed")


if __name__ == "__main__":
    main()
