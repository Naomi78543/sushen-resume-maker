---
name: sushen-resume-maker
description: 将真实中文求职材料重构为“酥神/ASU 式”高信息密度简历，并在生成前完成经历深挖、Claim Ledger 事实审计与 JD Matrix 岗位匹配，在生成后依据简历中的每个强表述、指标和岗位缺口产出面试问题、压力追问、证据准备与安全回答边界，同时交付可导入在线编辑器的结构化源文件。用于简历优化、深度拷打、JD 定向改写、中文 HTML/PDF 简历、在线修改与重新导出 PDF、面试题预测和面试防御；前端固定使用随技能提供的 ASU 源模板，不得重做视觉风格，不得虚构经历、职责、数据、Title、项目状态或成果。
---

# 酥神简历制作与面试防御

把“视觉风格”和“求职推理能力”分开：简历前端复用随技能提供的 ASU 模板；差异化集中在挖出原简历遗漏的个人能力、把回答转成高价值亮点、依据 JD 取舍内容，并在最后完成事实校对和面试防御。

## 必须执行的顺序

`读取材料 → 初始 Claim Ledger → JD Matrix → 能力深挖 → 新增亮点 Claim → 事实校对与重新匹配 → resume-data.json → ASU 模板渲染 → interview-defense.json → 面试问题清单`

- 未建立 `claim-ledger.json`，不得写简历。
- 用户提供 JD 时必须建立 `jd-matrix.json`。
- 任一校验器出现错误时，不得进入渲染。
- 最终简历只使用通过验证且被选中的 Claim。
- 不因用户要求“写厉害一点”而提升角色、归因、时态或数字强度。
- 用户要求停止追问时，立即停止；对缺口采用降级措辞、排除 Claim 或在面试清单中标明准备边界。

## 1. 建立事实层

完整读取 [references/claim-ledger-schema.md](references/claim-ledger-schema.md)，把经历拆成身份、角色、动作、方法、交付物、结果和因果归因等原子 Claim。

重点区分：

- 个人动作与团队结果；
- 模块负责与项目总负责；
- 已上线、测试中、规划中；
- 指标相关性与可证明因果；
- 直接经验与跨市场、跨对象的可迁移经验。

运行：

```bash
python scripts/validate_claim_ledger.py path/to/claim-ledger.json
```

## 2. 建立 JD 匹配层

有目标 JD 时完整读取 [references/jd-matrix-schema.md](references/jd-matrix-schema.md)。把职责、硬要求、加分项和业务场景拆成原子 Requirement，只引用 Ledger 中存在的 Claim。

- 区分 `direct`、`transferable`、`credential_only`、`self_reported` 与 `none`。
- 不把供应商协作改写成 MCN 机构运营，不把相邻国家经验改写成目标国家经验。
- 匹配分只用于排序内容和追问，不表示录用概率。

运行：

```bash
python scripts/validate_jd_matrix.py path/to/jd-matrix.json --ledger path/to/claim-ledger.json
```

## 3. 定向拷打经历

完整读取 [references/question-tree.md](references/question-tree.md) 与 [references/evidence-and-roles.md](references/evidence-and-roles.md)。拷打的主要目标是发现原简历没有写出的竞争力，不是反复审计用户是不是 Owner。每轮只问 1–3 个最有机会产出新亮点的问题，优先级为：

1. 经历中的复杂问题、主动发现、关键判断与取舍；
2. 数据或反馈如何转化为洞察、动作与验证；
3. 沟通推动、无权影响、流程设计和可复用资产；
4. 原简历遗漏、但能证明高权重 JD 能力的真实案例；
5. 结果、采用范围、效率、质量、用户反馈等可确认影响；
6. 仅在候选亮点形成后，对角色、归因、数字和项目状态做一次必要校对。

每个有效回答都要转成新的 `origin=interview` Claim，标注对应能力维度，再与原始 Claim 组合成“行动＋方法＋结果”的 bullet 候选。追问应引用用户的实际材料和上一轮回答；禁止连续询问 Owner、最终决策权、团队归因或证据边界。不能回答的内容直接跳过，不得用假设性答案补成事实。

用户回答后更新 Ledger、Matrix 与 Selection，再运行两个校验器。真实性门禁仍然存在，但应作为亮点形成后的最后校对，而不是深挖过程的主题。

## 4. 生成简历数据

完整读取 [references/resume-schema.md](references/resume-schema.md) 和 [references/style-guide.md](references/style-guide.md)，生成 `resume-data.json`。

- 每个可见 bullet 必须有 `verification`、`source_note`，并增加 `claim_ids` 以便反推面试问题。
- 重点项目使用模板原有的“背景 / 指标与效果 / 我的职责 / 技术关键词”。
- 运营岗位的“技术关键词”应写真实平台、指标体系、分析方法、协作机制与 SOP，不得为了密度虚构算法或工程术语。
- `Owner`、`0→1` 与强因果表述必须满足角色与证据规则；不满足时使用“负责限定模块、参与、协同、形成交付物”等准确措辞。

## 5. 固定前端渲染

`assets/resume_template.html`、`scripts/render_resume.py` 与 `references/style-guide.md` 来自用户指定的 ASU 简历源包，是冻结的前端母版。

- 必须使用母版及其渲染脚本；不得另做卡片式、仪表盘式或其他视觉风格。
- 保留象牙白纸张、蓝色衬线标题、浅红/浅蓝/浅绿经历条，以及固定项目字段。
- 事实审计、Ledger 分数和面试提示不得显示在简历页面中。
- 只允许为分页、文字溢出或必要的中文字体兼容做最小修复；不得改变整体视觉语言。

运行：

```bash
python scripts/render_resume.py \
  --input path/to/resume-data.json \
  --html path/to/resume.html \
  --pdf path/to/resume.pdf

python scripts/validate_resume.py \
  --data path/to/resume-data.json \
  --html path/to/resume.html \
  --pdf path/to/resume.pdf
```

渲染后把 PDF 每页转成图片，检查中文缺字、裁切、孤行、分页失衡和色块打印效果。

## 6. 交付在线编辑源

完整读取 [references/online-editor-contract.md](references/online-editor-contract.md)。每次生成 PDF 时必须同时保留 `resume-data.json` 和自包含 HTML，使用户能够在 GitHub Pages 在线编辑器中继续修改并重新导出 PDF。

- 不把 PDF 二进制文件作为编辑源。
- 保持 `verification`、`source_note` 和 `claim_ids`，避免在线修改后失去证据映射。
- 用户在线新增数字、Owner、主导、0→1、上线或跨市场表述后，提示重新运行事实与面试防御校验。
- 默认使用浏览器本地存储，不要求上传候选人数据。
- 仓库包含 `interrogation/` 在线深度拷打台：用于本地完成 JD 输入、能力线索识别、分轮深挖、新增亮点 Claim、JD Matrix 初筛和 Interview Defense 导出。
- 拷打台允许导入 PDF、扫描版 PDF 和简历图片；PDF 先提取原生文本，无文本页和图片使用浏览器端 OCR。OCR 结果只能作为候选材料，必须经用户校对后再建立 Claim。
- 在线拷打台是规则化能力挖掘与事实整理界面，不得把自动关键词匹配解释为 AI 判断或直接事实；最终简历仍须读取并校验三个 JSON 后生成。

## 7. 生成面试防御层

完整读取 [references/interview-defense-schema.md](references/interview-defense-schema.md)，生成 `interview-defense.json` 和面向用户的 `面试问题清单.md`。

每个问题必须能追溯到以下至少一类来源：

- 简历中出现的强角色词、指标、方法或关键交付物；
- Claim Ledger 中的风险标记或证据缺口；
- JD Matrix 中权重为 4–5 的职责与缺口；
- 经历与目标岗位之间的迁移边界。

问题分为：

1. 简历原句追问；
2. 角色边界与协作追问；
3. 指标口径与归因追问；
4. 方法、决策与失败复盘；
5. JD 场景题与业务 Case；
6. 行为面试、英语或工具实操。

每题必须包含主问题、1–3 个压力追问、面试官意图、回答骨架、证据准备和安全边界。回答骨架只能组织已有事实，不得代替用户编造答案。

运行：

```bash
python scripts/validate_interview_defense.py path/to/interview-defense.json \
  --ledger path/to/claim-ledger.json \
  --matrix path/to/jd-matrix.json
```

## 默认交付

1. `claim-ledger.json`
2. `jd-matrix.json`（有 JD 时）
3. `resume-data.json`
4. `resume.html`
5. `resume.pdf`
6. `interview-defense.json`
7. `面试问题清单.md`
8. 简短诊断：优势、关键缺口、被追问风险和证据准备优先级
9. 在线编辑说明：使用 `resume-data.json` 导入编辑器，修改后重新导出 HTML/PDF

## 最终门禁

- 三个 JSON 的 ID 唯一、引用有效，校验器无错误。
- 简历每个可见 bullet 都能映射回 Claim。
- 团队结果没有被个人独占，计划项目没有写成已交付。
- 指标基线、结果、时间窗、分母、统计系统和归因边界没有被偷换。
- 可迁移经验没有被写成目标市场或目标对象的直接经验。
- 每个高风险或强表述 Claim 至少有一道面试题。
- 每个高权重 JD 缺口至少有一道场景题或能力证明题。
- 面试问题清单不提供虚构答案，只提供事实组织框架和安全边界。

## 资源

- [references/claim-ledger-schema.md](references/claim-ledger-schema.md)：事实与证据结构。
- [references/jd-matrix-schema.md](references/jd-matrix-schema.md)：JD 拆解、匹配与选择。
- [references/question-tree.md](references/question-tree.md)：生成前的经历拷打。
- [references/evidence-and-roles.md](references/evidence-and-roles.md)：角色、指标与时态门禁。
- [references/resume-schema.md](references/resume-schema.md)：前端数据格式。
- [references/style-guide.md](references/style-guide.md)：冻结的 ASU 视觉规则。
- [references/interview-defense-schema.md](references/interview-defense-schema.md)：生成后的面试问题与回答边界。
- [references/online-editor-contract.md](references/online-editor-contract.md)：在线修改、隐私和重新导出约定。
- `assets/resume_template.html`：用户指定的前端母版。
- `scripts/render_resume.py`：原前端渲染脚本。
- `scripts/validate_resume.py`：简历数据与文件校验器。
- `scripts/validate_claim_ledger.py`：事实层校验器。
- `scripts/validate_jd_matrix.py`：岗位匹配层校验器。
- `scripts/validate_interview_defense.py`：面试防御层校验器。
