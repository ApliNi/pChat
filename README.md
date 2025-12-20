# [ pChat - AI Chat Terminal ]

这是一个轻量级本地化 AI 聊天终端, 在浏览器上可用: https://pchat.ipacel.cc/

<img width="1318" height="838" alt="image" src="https://github.com/user-attachments/assets/b312a52d-171b-446f-8166-6f344e87f077" />

## 特性
- 免费: 无需注册, 无需登录, 无需支付. 支持通过 Puter.js 和 OpenAI-API 提供模型服务.
- 本地存储: 所有聊天记录通过 IndexedDB 存储在浏览器本地, 除 AI 推理外, 不上传到任何服务器.

## 界面
- 模型切换: 点击右上角下拉菜单切换模型. 记忆上次使用的模型.
- 会话管理: 左侧边栏选择支持 新建/切换/删除, 双击或长按标题可重命名. 记忆上次打开的会话.
- 设置: 点击左侧边栏下方的 [CONFIG] 按钮进入设置页面.
- 置顶窗口: 点击左侧边栏下方的 [PIP] 按钮打开画中画窗口.
- 小地图: 界面右侧的小地图可以快速定位到消息位置.

## 消息框
- 身份显示:
- 系统提示词显示为 SYSTEM (蓝色消息框)
- 用户消息显示为 USER (绿色消息框)
- AI 消息显示为对应模型的名称 (灰色消息框).
- 切换格式: 点击右上角 [RENDER] / [RAW] 切换渲染消息或原始内容.
- 折叠消息: 点击右上角 [+] / [-] 切换折叠消息, 同时小地图中的对应消息框会变为半透明.
- 重新生成: 点击左下角 [REGEN] 按钮重新生成 AI 消息.
- 分支消息: 点击左下角 [FORK] 按钮从这里创建新聊天.
- 删除消息: 点击左下角 [DEL] 按钮删除这条消息, 不影响其他消息.

## 消息渲染
- 默认仅自动渲染 AI 消息.
- 折叠的消息将在打开时渲染.
- 记忆每条消息的渲染和折叠状态.
- 思考模型的思考内容渲染在蓝色 [THINK] 折叠框内.

## 设置页面
- 导入导出: 支持将聊天导出到 JSON 文件, 导入时与当前会话合并, 覆盖 ID 相同的会话.
- 模型服务:
	- "Puter.js": 支持清除 puter.js 身份验证信息和缓存.
	- "OpenAI-API": 支持配置标准 API 服务.

## 前端库
- [Puter.js](https://github.com/heyPuter/puter) - 提供 AI 服务
- [DOMPurify](https://github.com/cure53/DOMPurify) - XSS 过滤器
- [Highlight.js](https://github.com/highlightjs/highlight.js) - 代码高亮
- [KaTeX](https://github.com/KaTeX/KaTeX) - LaTeX 公式渲染
- [Marked](https://github.com/markedjs/marked) - Markdown 文档渲染
- [MarkedHighlight](https://github.com/markedjs/marked-highlight) - Markdown 代码高亮
- [MarkedKatex](https://github.com/UziTech/marked-katex-extension) - Markdown LaTeX 公式渲染
- [Morphdom](https://github.com/patrick-steele-idem/morphdom) - DOM 差异更新

## 字体
- [HarmonyOS Sans](https://developer.huawei.com/consumer/cn/doc/design-guides-V1/font-0000001157868583-V1) - 全局中文字体
- [JetBrainsMono](https://www.jetbrains.com/lp/mono/) - 全局等宽字体
- [Ubuntu](https://design.ubuntu.com/font) - 标题字体

- ---

## 更新计划
- [x] 基本功能
- [ ] 图片上传 / 绘图
- [ ] 文档上传
- [x] 导入导出
- [x] 置顶显示
- [x] 标准模型服务
