# Sidebar Ask

<p align="center">
  <img src="icons/icon128.png" width="96" alt="Sidebar Ask icon">
</p>

<p align="center">
  极简侧边栏问答。选中任意文字右键，内容直接落进 DeepSeek 输入框，按 Enter 即发。
  <br>
  <sub>A minimal browser sidebar. Select text anywhere, right-click, and it lands in DeepSeek's input box — ready to send.</sub>
</p>

---

## 它解决的问题

浏览器商店里那类「AI 侧边栏」扩展普遍有三个毛病：底部常年挂一条 Rate us 横幅占掉几十像素、窄宽度下不做适配、右键菜单只是打开侧边栏而不会把选中的文字带进去 —— 你选了一段话，还得自己复制粘贴。

这个扩展只做两件事，并把第二件做到底：

1. **侧边栏** —— 点工具栏图标，DeepSeek 贴在浏览器右侧。
2. **右键带入** —— 选中文字 → 右键 →「问 DeepSeek」，文字**直接写进输入框**，光标停在末尾，按 Enter 就发。

没有评分横幅、没有底部固定栏、没有埋点、不发任何自有网络请求。

## 安装

需要 Edge / Chrome **116+**（`chrome.sidePanel.open()` 自该版本可用）。

1. 下载 [Releases](../../releases) 里的 `sidebar-ask-v*.zip` 并解压
2. 打开 `edge://extensions/`（Chrome 用 `chrome://extensions/`）
3. 打开「开发人员模式」
4. 点「加载解压缩的扩展」，选择解压出来的目录（里面能直接看到 `manifest.json`）
5. 建议把图标固定到工具栏

也可以直接克隆仓库后加载本目录。首次使用时若侧边栏里显示登录页，登录一次即可（原因见[已知限制](#已知限制)第 1 条）。

## 用法

| 操作 | 结果 |
|---|---|
| 点工具栏图标 | 开关侧边栏 |
| 选中文字 → 右键 →「问 DeepSeek」 | 文字写入输入框，已聚焦，光标在末尾 |
| 输入框已有草稿 | **追加**，不覆盖你手打的内容 |
| 页面空白处右键 →「打开侧边栏」 | 仅打开，不带文字 |

刻意**不自动发送**：发送不可撤回还消耗额度，留给你按 Enter 决定。

## 工作原理

三个反直觉的点，都有实测依据。

### 1. 内嵌需要剥响应头

`chat.deepseek.com` 返回 `content-security-policy: frame-ancestors 'none'`，浏览器会直接拒绝任何 iframe 嵌入。`rules.json` 用 declarativeNetRequest 在 `sub_frame` 场景移除 `X-Frame-Options` 与 `Content-Security-Policy`，这是侧边栏能成立的前提。

### 2. 注入必须绕过 React 的 value tracker

输入框是 React 受控组件，选择器为 `textarea[name="user query"]`（`name` 属性不受 CSS 哈希类名改版影响）。

直接 `el.value = text` 会被 React 的 value tracker 吞掉 —— 界面看着有字，点发送却发空。正确做法是取原型上的原生 setter 再派发冒泡的 `input` 事件：

```js
Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, text);
el.dispatchEvent(new Event('input', { bubbles: true }));
```

### 3. iframe 被拦时 `load` 事件照样触发

所以不能用 `load` 判断嵌入是否成功。改为内容脚本回 `pong` 做存活探测：7 秒内没等到，侧边栏显示兜底层并提供「在独立窗口中打开」—— 独立窗口里站点是顶层文档，不受 `frame-ancestors` 限制。若 `chrome.sidePanel.open()` 本身失败，background 也会自动退化为贴右边缘的独立窗口，而不是右键后毫无反应。

### 数据流

```
右键菜单 → background 写入 storage.local 的 dsPending（标记 target: iframe）
        → 打开侧边栏 → content script 读取 → 注入 textarea → 成功后清除
```

单通道（只用 storage，不混 postMessage），用 `nonce` 做幂等，用 `target` 区分「侧边栏 iframe」与「独立窗口」，避免同域标签页抢走本该送进侧边栏的内容。

## 已知限制

1. **首次可能需要重新登录一次。** 浏览器对扩展页内嵌的第三方站点做存储分区，登录态可能与普通标签页隔离；登录一次后在该分区内保持。
2. **剥响应头是全局的。** 静态规则无法按扩展 ID 限定发起方，因此规则对「任何页面把 chat.deepseek.com 嵌入子框架」都生效。影响面仅限该域名的 sub_frame 请求 —— 这是为了换取「规则一定生效」而做的取舍。
3. **不改造站点样式。** DeepSeek 自身在 <440px 会切到移动布局，本扩展不注入 CSS —— 对抗站点的哈希类名既脆弱又容易改坏。
4. **未登录时文字会等待。** 停在 `/sign_in` 时没有输入框，文字会保留 2 分钟，登录完成后自动落进输入框。

## 隐私

不收集、不上传、不统计任何数据。唯一的外部请求就是加载 `chat.deepseek.com` 本身。详见 [PRIVACY.md](PRIVACY.md)。

## 开发

```bash
# 打包发布用的 zip（只含运行时文件，manifest.json 位于 zip 根部）
python tools/package.py
```

改完代码后在扩展管理页点「刷新」即可生效。

## 许可

[MIT](LICENSE)

---

本项目与 DeepSeek 官方无关，仅为第三方工具。「DeepSeek」为其各自权利人的商标，此处仅用于说明本工具的适用对象。
