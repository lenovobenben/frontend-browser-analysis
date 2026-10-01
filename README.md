# Frontend Browser Analysis

A Codex skill for investigating real web applications through a persistent logged-in Chrome profile without bringing the running browser to the foreground.

## What is it for?

When you ask an AI to explain a page, a field, a table, or an unexpected frontend behavior, screenshots and source code are often not enough. The answer may depend on the current route, account, component state, API response, frontend formatting, or data cached in the browser.

This skill lets Codex inspect the page you already have open and answer questions such as:

- Which API provides the data in this table?
- Why is this field displayed as “Unknown”?
- Why is this button disabled for the current account?
- Which response field becomes this value on the page?
- Are the selected filters actually included in the request?

It is especially useful for authenticated applications, internal systems, admin consoles, and complex single-page applications where the real behavior can only be understood from a live browser session.

## Why background CDP?

On a running dedicated Chrome, `agent-browser` can create or activate a tab while attaching. This skill instead connects to the selected existing page through its local CDP target. Its inspection helper reads page state without activation; its action helper opens page-derived links in background tabs, navigates existing tabs, and clicks known low-risk in-page controls.

The helpers return bounded output, so routine analysis can focus on the relevant route, visible state, and request data without dumping large objects or logs. This means:

- less irrelevant browser output;
- lower token consumption;
- faster investigation for common frontend questions;
- more focused answers with a clear evidence chain.

The skill also reuses a dedicated Chrome profile, so you can log in and navigate normally while Codex inspects the current page with the correct account and session context.

The dedicated browser is reusable by default, but it is not meant to be uncloseable. Its launch command disables Chrome Smart Restart for this profile, and the skill includes a guarded shutdown helper that verifies the debug port and profile before closing the automation session and terminating only that Chrome process.

## What about deeper debugging?

The bundled helpers use CDP directly. More specialized debugging may need additional target-scoped CDP inspection, but it must not activate the browser or select a foreground target.

If a step cannot be performed without bringing Chrome forward, Codex leaves that step to the user. High-risk business actions still require explicit approval.

## How it works

1. Open the target page in the dedicated Chrome profile.
2. Log in and navigate to the exact page or business context you want to investigate.
3. Ask Codex a concrete question about what you see.
4. Codex inspects the existing page through background CDP and uses background navigation when needed.
5. Codex reports the relevant evidence and any step that still needs your manual interaction.

You remain in control of login, business-specific navigation, and any action that may change data. The skill is designed for collaborative investigation, not unattended browser automation.

## Requirements

- Codex
- Google Chrome
- A dedicated Chrome profile with remote debugging enabled
- Node.js with built-in `fetch` and `WebSocket` support

## Installation

Ask Codex to install this repository as a skill, or clone/symlink it into your Codex skills directory. After installation, start a new Codex session so the skill can be discovered.

The instructions used by Codex are defined in [`SKILL.md`](./SKILL.md).

---

# 前端浏览器分析

一个通过常驻的已登录 Chrome 排查真实 Web 应用、同时避免将浏览器带到前台的 Codex Skill。

## 它是做什么的？

当你让 AI 解释页面上的某个字段、表格或异常行为时，只看截图和源代码往往不够。真正的原因可能藏在当前路由、登录账号、组件状态、接口响应、前端格式化逻辑或者浏览器缓存数据里。

这个 Skill 可以让 Codex 检查你已经打开的页面，回答这类问题：

- 这个表格的数据来自哪个接口？
- 为什么这个字段显示为“未知”？
- 为什么当前账号下这个按钮被禁用了？
- 接口里的哪个字段最终变成了页面上的这个值？
- 页面选择的筛选条件是否真的传给了接口？

它特别适合需要登录的应用、内部系统、管理后台和复杂单页应用。这些系统的真实行为通常只有在浏览器实际运行起来以后才能看清楚。

## 为什么使用后台 CDP？

对已经运行的专用 Chrome，`agent-browser` 在连接时可能创建或激活标签页。这个 Skill 改为直接连接选中的本地 CDP 页面目标：检查脚本只读页面且不激活它；操作脚本可以把页面已有链接开到后台标签页、在现有标签页导航，以及点击已确认的低风险页面内控件。

脚本会限制输出范围，不必把大段 DOM、运行时对象或完整网络日志交给模型。这意味着：

- 更少的无关浏览器输出；
- 更低的 token 消耗；
- 更快地排查常见前端问题；
- 回答更加聚焦，而且能给出清晰的证据链路。

它还会复用一个专用 Chrome Profile。你可以像平时一样登录和操作页面，Codex 则在正确的账号和会话上下文中检查当前页面。

专用浏览器默认可以长期复用，但并不是不能关闭。启动命令会针对这个 Profile 禁用 Chrome Smart Restart；Skill 也提供了带身份校验的退出脚本，确认调试端口和 Profile 后，只关闭对应的自动化会话和 Chrome 进程。

## 深入调试怎么办？

随附脚本本身就使用 CDP。更复杂的排查可以使用其他限定在同一页面目标的 CDP 能力，但不能激活浏览器或选择会前置窗口的目标。

如果某一步无法在后台安全完成，Codex 会留给用户手动操作；有业务副作用的高风险操作仍需明确批准。

## 使用方式

1. 使用专用 Chrome Profile 打开目标页面。
2. 完成登录，并进入需要排查的准确页面或业务上下文。
3. 向 Codex 提出一个关于当前页面的具体问题。
4. Codex 通过后台 CDP 检查现有页面，必要时在后台导航。
5. Codex 汇报证据，以及仍需用户手动完成的步骤。

登录、需要业务判断的导航以及任何可能修改数据的操作仍由用户控制。这个 Skill 面向的是人与 Codex 协作排查问题，而不是无人值守的浏览器自动化。

## 使用条件

- Codex
- Google Chrome
- 一个启用了远程调试的专用 Chrome Profile
- 支持内置 `fetch` 和 `WebSocket` 的 Node.js

## 安装

可以直接让 Codex 将这个 GitHub 仓库安装为 Skill，也可以将仓库克隆或软链接到 Codex 的 Skills 目录。安装后重新开始一个 Codex 会话，让 Skill 被正确发现。

Codex 实际读取和执行的说明位于 [`SKILL.md`](./SKILL.md)。
