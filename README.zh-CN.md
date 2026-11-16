# Sidebar Ask

<p align="center">
  <img src="icons/icon128.png" width="96" alt="Sidebar Ask icon">
</p>

<p align="center">
  极简 DeepSeek 侧边栏。选中任意文字右键，内容直接落进输入框，按 Enter 即发。
  <br>
  <sub><a href="README.md">English</a></sub>
</p>

---

## 安装

需要 Edge / Chrome **116+**。

1. 从 [Releases](../../releases) 下载 `sidebar-ask-v*.zip` 并解压
2. 打开 `edge://extensions/`（Chrome 用 `chrome://extensions/`）
3. 打开「开发人员模式」
4. 点「加载解压缩的扩展」，选择解压出的目录 —— 里面能直接看到 `manifest.json`
5. 建议把图标固定到工具栏

首次使用可能需要在侧边栏内登录一次，见[注意事项](#注意事项)。

## 用法

| 操作 | 结果 |
|---|---|
| 点工具栏图标 | 开关侧边栏 |
| 选中文字 → 右键 →「问 DeepSeek：「…」」 | 文字写入输入框，已聚焦，光标在末尾 |
| 输入框已有草稿 | **追加**，不覆盖 |
| 空白处右键 →「打开侧边栏」 | 仅打开，不带文字 |

不会替你发送 —— 发送消耗额度且不可撤回，留给你按 Enter。

## 注意事项

- **需要登录一次。** 浏览器对扩展页内嵌的第三方站点做存储分区，普通标签页里的登录态可能带不过来。
- **为内嵌而移除响应头。** `chat.deepseek.com` 发送 `frame-ancestors 'none'`，因此 `rules.json` 会移除其子框架响应里的 `X-Frame-Options` 与 CSP。规则限定在该域名，但任何页面嵌入它时都会生效。
- **未登录时文字最多等待 2 分钟** —— 登录页没有输入框，登录完成后才会落进输入框。
- **不注入任何样式**去改造站点。
- **站点拒绝内嵌时**，面板会提供独立窗口，以顶层页面的方式加载。

## 隐私

不收集、不上传、不统计任何数据，扩展自身不发起网络请求。详见 [PRIVACY.zh-CN.md](PRIVACY.zh-CN.md)。

## 开发

```bash
python tools/validate.py  # 校验清单、语言包、key 引用、JS 语法
python tools/package.py   # 生成 dist/sidebar-ask-v<version>.zip
```

改完代码后在扩展管理页点「刷新」生效。

> **不要删掉 `manifest.json` 里的 `key` 字段。** 它把扩展 ID 固定为
> `mmcfeeiniomkadholndcenjijnjejcej`，不再随安装路径变化 —— 多台机器安装时需要它，
> 将来上架商店也能沿用同一个 ID。`rules.json` 的规则正是按这个 ID 限定作用域的，
> 换掉 key 会导致内嵌失效。

改完代码后在扩展管理页点「刷新」生效。

## 许可

[MIT](LICENSE)

---

本项目与 DeepSeek 官方无关。「DeepSeek」为其权利人的商标，此处仅用于说明本工具的适用对象。
