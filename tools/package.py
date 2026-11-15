"""打包发布用 zip：只含运行时文件，manifest.json 位于 zip 根部，可直接上传商店。

用法：
    python tools/package.py
产物：
    dist/sidebar-ask-v<version>.zip
"""
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")

# 运行时需要的文件，顺序无关，但显式列出可防止把 README/LICENSE 之类打进去
FILES = [
    "manifest.json",
    "rules.json",
    "background.js",
    "content.js",
    "sidepanel.html",
    "sidepanel.css",
    "sidepanel.js",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
]


def main():
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    version = manifest["version"]
    name = manifest["name"].lower().replace(" ", "-")

    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, f"{name}-v{version}.zip")

    missing = [p for p in FILES if not os.path.isfile(os.path.join(ROOT, p))]
    if missing:
        raise SystemExit(f"缺少文件: {missing}")

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in FILES:
            z.write(os.path.join(ROOT, rel), rel)

    size = os.path.getsize(out)
    print(f"已生成 {out}  ({size / 1024:.1f} KB, {len(FILES)} 个文件)")

    # 回读校验：确认 zip 里的 manifest 能解析、版本一致
    with zipfile.ZipFile(out) as z:
        bad = z.testzip()
        if bad:
            raise SystemExit(f"zip 损坏: {bad}")
        inner = json.loads(z.read("manifest.json").decode("utf-8"))
        assert inner["version"] == version, "版本不一致"
        print(f"校验通过：{inner['name']} v{inner['version']}")


if __name__ == "__main__":
    main()
