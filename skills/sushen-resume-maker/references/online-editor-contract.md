# 在线编辑器交付约定

在线编辑器不直接修改 PDF 二进制文件。把 `resume-data.json` 作为唯一可持续编辑的内容源，使用同一份 `assets/resume_template.html` 实时渲染并重新导出 HTML/PDF。

## 在线深度拷打台

GitHub Pages 根目录先进入 `interrogation/`，再进入 `editor/`。拷打台在浏览器本地完成：

1. 输入目标 JD 与经历文本；
2. 从经历中识别复杂问题、判断、方法、推动、体系化与影响等潜在线索；
3. 每轮只问 1–3 个与材料相关的问题，并把有效回答沉淀成“深挖新增亮点” Claim；
4. 在亮点形成后，人工确认 Claim 的验证状态、个人角色和时态；
5. 导出 `claim-ledger.json`、`jd-matrix.json` 与 `interview-defense.json`；
6. 把三个 JSON 交给 Skill 校验并生成 `resume-data.json`，再进入编辑器。

Owner、责任边界和数字归因不得成为连续追问主题。只有当某条新增亮点准备进入简历且确实含强角色词、强因果或指标时，才追加一次准确性校对。

材料入口允许 PDF、扫描版 PDF、PNG、JPG、WebP、TXT、Markdown 和 `resume-data.json`：

- PDF 优先使用 PDF.js 提取原生文本；单页无足够文本时才渲染为图片并 OCR。
- 图片与扫描页使用 Tesseract.js 中英文 OCR，单批最多 10 个文件、单文件不超过 20MB、PDF 不超过 20 页。
- 文件内容不得上传项目服务器；第三方库和 OCR 模型可以通过公共 CDN 下载到浏览器。
- OCR 文字属于未校对候选材料。用户校对之前不得自动标记为 `source_grounded`，也不得据此生成最终简历事实。

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
- 一键酥神化必须先让用户确认公司内的项目拆分以及每条来源事实的归属，再生成优化稿。
- A4 实习经历按项目显示四层：`background` 为背景，`impact` 为指标与效果，`responsibilities + actions` 合并为我的职责，`keywords` 独立成行；`missingMetrics` 仅作编辑器提示。
- 原始 bullet 保持完整语义，不得按逗号或分号机械切分；编辑器可调整分组和表达，但不得改变来源事实。
- `highlights[]` 只允许引用对应文本中真实存在的片段，由模板通过安全文本节点和 `<strong>` 节点渲染。
- `experience.links[]`、`profile.photo` 与 `endorsements[]` 必须保留来源和验证状态；未确认照片、无来源链接和无证据外部认可不得进入正式简历。
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

`transform/` 必须执行以下门禁：

1. 逐页优先提取 PDF 原生文字；质量检测不通过的页面自动切换中英文 OCR。
2. 显示乱码率、异常字符率、有效中文比例和识别行数，不得只按字符数量判断解析成功。
3. 把解析文字放入可编辑的原文校对区；用户确认前不得建立只读 `sourceResume`。
4. 校对后再次运行质量检测；不通过时阻止结构识别和一键酥神化。
5. 将解析方法、质量报告和 `user_confirmed: true` 保存到 `sourceResume.source_file`，供事实追溯。

