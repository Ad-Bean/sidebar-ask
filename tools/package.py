"""Build the release zip.

Only runtime files are packed, with manifest.json at the zip root so the
archive can be uploaded to an extension store as-is.

Usage:
    python tools/package.py
Output:
    dist/<slug>-v<version>.zip
"""
import json
import os
import zipfile

SLUG = "sidebar-ask"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")

# Explicit list on purpose: keeps README/LICENSE/tools out of the archive.
FILES = [
    "manifest.json",
    "rules.json",
    "background.js",
    "content.js",
    "sidepanel.html",
    "sidepanel.css",
    "sidepanel.js",
    "_locales/en/messages.json",
    "_locales/zh_CN/messages.json",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
]


def read_json(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return json.load(f)


def main():
    manifest = read_json("manifest.json")
    version = manifest["version"]

    # name/description live in _locales now, so resolve the display name there
    display_name = read_json("_locales", "en", "messages.json")["extName"]["message"]

    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, f"{SLUG}-v{version}.zip")

    missing = [p for p in FILES if not os.path.isfile(os.path.join(ROOT, p))]
    if missing:
        raise SystemExit(f"missing files: {missing}")

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in FILES:
            z.write(os.path.join(ROOT, rel), rel)

    size = os.path.getsize(out)
    print(f"built {out}  ({size / 1024:.1f} KB, {len(FILES)} files)")

    # read back: archive must be valid and self-consistent
    with zipfile.ZipFile(out) as z:
        bad = z.testzip()
        if bad:
            raise SystemExit(f"corrupt entry: {bad}")
        inner = json.loads(z.read("manifest.json").decode("utf-8"))
        assert inner["version"] == version, "version mismatch"
        assert inner.get("default_locale"), "default_locale missing"
        assert "_locales/en/messages.json" in z.namelist(), "_locales not packed"
        print(f"verified: {display_name} v{inner['version']}")


if __name__ == "__main__":
    main()
