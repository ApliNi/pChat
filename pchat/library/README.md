
## pChat Library

pChat 聊天模板库, 您可以在 pChat 中制作聊天模板, 然后使用 `Config > [EXPORT_THIS_CHAT]` 功能导出为文件.

### 规范

1. 添加目录

您需要在 `/pchat/library/index.json` 中添加您的模板信息:
```json
[ { "name": "示例对话文件", "info": "", "url": "#/__Example.json" } ]
```

其中, `url` 中的 `#` 表示 `/pchat/library/data` 目录.

2. 添加文件

将导出的文件按照此规则命名: `用户名.模板类名小驼峰.json`.
