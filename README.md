# Frontend Browser Analysis

A Codex skill for investigating real web applications through your logged-in Chrome session—with `agent-browser` first, lower token usage, and Chrome DevTools only when necessary.

## What is it for?

When you ask an AI to explain a page, a field, a table, or an unexpected frontend behavior, screenshots and source code are often not enough. The answer may depend on the current route, account, component state, API response, frontend formatting, or data cached in the browser.

This skill lets Codex inspect the page you already have open and answer questions such as:

- Which API provides the data in this table?
- Why is this field displayed as “Unknown”?
- Why is this button disabled for the current account?
- Which response field becomes this value on the page?
- Are the selected filters actually included in the request?

It is especially useful for authenticated applications, internal systems, admin consoles, and complex single-page applications where the real behavior can only be understood from a live browser session.

## Why `agent-browser`?

The main feature of this skill is that it uses [`agent-browser`](https://github.com/vercel-labs/agent-browser) as the default way to access Chrome.

Compared with sending large DOM trees, runtime objects, and complete network logs to the model, `agent-browser` makes it easier to inspect only what matters. In practice, this means:

- less irrelevant browser output;
- lower token consumption;
- faster investigation for common frontend questions;
- more focused answers with a clear evidence chain.

The skill also reuses a dedicated Chrome profile, so you can log in and navigate normally while Codex inspects the current page with the correct account and session context.

The dedicated browser is reusable by default, but it is not meant to be uncloseable. Its launch command disables Chrome Smart Restart for this profile, and the skill includes a guarded shutdown helper that verifies the debug port and profile before closing the automation session and terminating only that Chrome process.

## What about Chrome DevTools?

Chrome DevTools is a fallback, not the default.

If `agent-browser` cannot provide enough information and the problem genuinely requires lower-level DOM, runtime, performance, or network debugging, Codex can use a compatible Chrome DevTools MCP server—if the user has installed one.

This fallback is intentionally used sparingly. Chrome DevTools MCP can be slower and may return much larger amounts of data, which increases token usage without necessarily improving the answer.

## How it works

1. Open the target page in the dedicated Chrome profile.
2. Log in and navigate to the exact page or business context you want to investigate.
3. Ask Codex a concrete question about what you see.
4. Codex uses `agent-browser` to inspect the relevant page state and data flow.
5. Chrome DevTools MCP is considered only if the normal inspection path is insufficient.

You remain in control of login, navigation, and any action that may change data. The skill is designed for collaborative investigation, not unattended browser automation.

## Requirements

- Codex
- Google Chrome
- [`agent-browser`](https://github.com/vercel-labs/agent-browser)
- A dedicated Chrome profile with remote debugging enabled
- Optional: a compatible Chrome DevTools MCP server for difficult edge cases

## Installation

Ask Codex to install this repository as a skill, or clone/symlink it into your Codex skills directory. After installation, start a new Codex session so the skill can be discovered.

The instructions used by Codex are defined in [`SKILL.md`](./SKILL.md).

---

# 前端浏览器分析

一个通过已登录 Chrome 会话排查真实 Web 应用的 Codex Skill：优先使用 `agent-browser`，减少 token 消耗，只在必要时才使用 Chrome DevTools。

## 它是做什么的？

当你让 AI 解释页面上的某个字段、表格或异常行为时，只看截图和源代码往往不够。真正的原因可能藏在当前路由、登录账号、组件状态、接口响应、前端格式化逻辑或者浏览器缓存数据里。

这个 Skill 可以让 Codex 检查你已经打开的页面，回答这类问题：

- 这个表格的数据来自哪个接口？
- 为什么这个字段显示为“未知”？
- 为什么当前账号下这个按钮被禁用了？
- 接口里的哪个字段最终变成了页面上的这个值？
- 页面选择的筛选条件是否真的传给了接口？

它特别适合需要登录的应用、内部系统、管理后台和复杂单页应用。这些系统的真实行为通常只有在浏览器实际运行起来以后才能看清楚。

## 为什么使用 `agent-browser`？

这个 Skill 最主要的特色，就是默认通过 [`agent-browser`](https://github.com/vercel-labs/agent-browser) 访问 Chrome。

相比把大段 DOM、运行时对象和完整网络日志全部交给模型，`agent-browser` 更容易只检查当前问题真正需要的信息。实际使用中，这意味着：

- 更少的无关浏览器输出；
- 更低的 token 消耗；
- 更快地排查常见前端问题；
- 回答更加聚焦，而且能给出清晰的证据链路。

它还会复用一个专用 Chrome Profile。你可以像平时一样登录和操作页面，Codex 则在正确的账号和会话上下文中检查当前页面。

专用浏览器默认可以长期复用，但并不是不能关闭。启动命令会针对这个 Profile 禁用 Chrome Smart Restart；Skill 也提供了带身份校验的退出脚本，确认调试端口和 Profile 后，只关闭对应的自动化会话和 Chrome 进程。

## Chrome DevTools 怎么用？

Chrome DevTools 是兜底方案，不是默认方案。

如果 `agent-browser` 无法提供足够信息，而问题确实需要更底层的 DOM、运行时、性能或网络调试，那么在用户已经安装兼容 Chrome DevTools MCP Server 的情况下，Codex 可以继续使用它排查。

这个兜底能力会尽量少用。Chrome DevTools MCP 往往更慢，也可能返回大量数据，消耗更多 token，却不一定能让答案更好。

## 使用方式

1. 使用专用 Chrome Profile 打开目标页面。
2. 完成登录，并进入需要排查的准确页面或业务上下文。
3. 向 Codex 提出一个关于当前页面的具体问题。
4. Codex 通过 `agent-browser` 检查相关页面状态和数据链路。
5. 只有常规检查仍然无法解决时，才考虑使用 Chrome DevTools MCP。

登录、业务导航以及任何可能修改数据的操作仍由用户控制。这个 Skill 面向的是人与 Codex 协作排查问题，而不是无人值守的浏览器自动化。

## 使用条件

- Codex
- Google Chrome
- [`agent-browser`](https://github.com/vercel-labs/agent-browser)
- 一个启用了远程调试的专用 Chrome Profile
- 可选：用于处理疑难场景的兼容 Chrome DevTools MCP Server

## 安装

可以直接让 Codex 将这个 GitHub 仓库安装为 Skill，也可以将仓库克隆或软链接到 Codex 的 Skills 目录。安装后重新开始一个 Codex 会话，让 Skill 被正确发现。

Codex 实际读取和执行的说明位于 [`SKILL.md`](./SKILL.md)。
