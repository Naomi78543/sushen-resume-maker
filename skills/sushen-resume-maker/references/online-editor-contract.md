# 在线编辑器交付约定

在线编辑器不直接修改 PDF 二进制文件。把 `resume-data.json` 作为唯一可持续编辑的内容源，使用同一份 `assets/resume_template.html` 实时渲染并重新导出 HTML/PDF。

## 在线深度拷打台

GitHub Pages 根目录先进入 `interrogation/`，再进入 `editor/`。拷打台在浏览器本地完成：

1. 输入目标 JD 与经历文本；
2. 按每轮 1–3 题确认角色、指标、交付状态与岗位缺口；
3. 人工确认 Claim 的验证状态、个人角色和时态；
4. 导出 `claim-ledger.json`、`jd-matrix.json` 与 `interview-defense.json`；
5. 把三个 JSON 交给 Skill 校验并生成 `resume-data.json`，再进入编辑器。

纯静态页面不得声称能够调用 AI 完成事实判断或简历改写。自动关键词匹配只能标记为安全初筛；默认使用 `transferable`、`weak` 或 `gap`，不能把相关词命中自动升级为直接强匹配。

## Skill 交付要求

每次生成简历时同时交付：

1. `resume-data.json`：在线编辑器导入源文件；
2. `resume.html`：当前内容的自包含网页；
3. `resume.pdf`：当前内容的打印版；
4. `claim-ledger.json`：真实性审计源；
5. `interview-defense.json`：面试防御源。

不得只交付 PDF，否则在线编辑器无法稳定恢复字段、层级、证据映射和分页结构。

## 数据兼容

- 顶层结构遵循 [resume-schema.md](resume-schema.md)。
- 可见 bullet 保留 `verification`、`source_note` 与 `claim_ids`。
- 在线编辑器允许修改可见文本与排序，但不能自动判断新内容是否真实。
- 用户新增指标、强角色词、项目状态或市场信息后，重新运行 Ledger、Matrix 与 Interview Defense 校验。

## 隐私

- 默认在浏览器本地使用 `localStorage` 自动保存，不上传服务器。
- 不在公开仓库提交用户的 `resume-data.json`、PDF、HTML、后台截图或业务数据。
- 提供“清除本地草稿”和下载 JSON 的能力。

## 导出

- JSON：导出当前结构化源文件，供后续继续编辑或重新校验。
- HTML：把当前 JSON 写入冻结的 ASU 模板，生成自包含文件。
- PDF：调用浏览器打印当前预览；打印样式以 ASU 模板为准。

## PDF 导入边界

如果用户只有 PDF，先说明不能保证结构化还原。优先寻找同批生成的 `resume-data.json` 或 HTML；仅在用户明确接受版式和字段可能丢失时，才使用 PDF 文本提取重建新的 JSON，并重新进行真实性校验。
