# 酥神简历制作与面试防御 Skill

一个能力挖掘优先、证据校对兜底的中文求职 Skill：使用固定的 ASU 高密度简历前端，围绕真实经历追问难点、判断、方法、推动和影响，把原简历遗漏的竞争力沉淀为新亮点，再匹配目标 JD 并生成面试问题。

## 先选一种使用方式

### 方式 A：直接使用在线工作台

适合希望先在网页中梳理经历与目标 JD，逐轮回答深度追问，再把结果交给完整 Skill 生成简历的用户；已有 `resume-data.json` 也可以直接进入编辑器修改并重新导出 PDF。

```text
https://你的用户名.github.io/仓库名/
```

工作台现在有三条清晰路径：

1. **深度拷打**：适合素材不完整、需要追问能力与证据边界的用户；完成后把 Claim Ledger、JD Matrix 和面试防御带入编辑器。
2. **一键酥神化**：适合已有 PDF / DOCX 简历的用户；浏览器本地解析文件，生成只读 sourceResume 与可编辑 optimizedResume，通过事实校验后查看前后对比并进入编辑器微调。
3. **简历编辑器**：适合已有 `resume-data.json` 或需要继续细调的用户；实时预览 ASU 模板并导出 JSON、HTML 或 PDF。

当前的解析、同源结构重组和编辑都在浏览器中完成，不接入 AI API，也不会把候选人文件上传到项目服务器。

### 方式 B：安装完整 Skill

适合希望完成“深度拷打 → 事实校验 → JD 定向简历 → 面试问题 → 在线修改”的用户。

在 Codex 中输入：

```text
使用 $skill-installer 安装：
https://github.com/你的用户名/仓库名/tree/main/skills/sushen-resume-maker
```

也可以下载 GitHub Release 中的 `sushen-resume-maker-skill.zip`，解压到：

```text
$CODEX_HOME/skills/sushen-resume-maker
```

安装后可以这样使用：

```text
使用 $sushen-resume-maker，读取我的原始简历和目标 JD：
先做深度拷打与证据校验，再生成 ASU 风格简历、在线编辑源文件和面试问题清单。
```

## 它和普通简历 Skill 的区别

普通流程通常是“读取简历 → 润色 → 排版”。本项目采用：

```text
读取材料
  → Claim Ledger
  → 语义级角色校验
  → 针对性拷打与新增亮点 Claim
  → 项目级重写
  → A4 内容压缩
  → JD Matrix 复核
  → ASU 前端简历
  → Interview Defense 面试防御
```

- **不是 Owner 审讯**：前三轮优先发现复杂问题、主动判断、数据洞察、推动影响、流程沉淀和可复用成果；角色边界只在亮点成形后做必要校对。
- **回答会变成新素材**：具体、非假设的回答会单独进入“深挖新增亮点”，而不是只成为审计备注。
- **不靠编故事提高匹配度**：团队结果、个人动作、项目状态和数据归因分开记录。
- **不把相近经历包装成直接经验**：跨市场、跨行业和跨合作对象的迁移边界会保留。
- **不只生成简历**：自动生成主问题、压力追问、面试官意图、回答骨架、证据准备和安全边界。
- **前端保持一致**：固定复用仓库内的 ASU 模板，不把审计分数或分析看板画进简历。
- **生成后还能改**：GitHub Pages 在线编辑器支持导入 JSON、实时预览、自动保存、撤销重做，并重新导出 HTML/PDF。

## 在线深度拷打与编辑器

仓库首页会自动进入 `interrogation/`。在线深度拷打台支持：

- 输入目标 JD 与原始经历材料；
- 上传 PDF、扫描版 PDF 或多张简历图片：PDF 优先提取原生文字，无文字页和图片使用中英文 OCR；
- 从原始材料识别数据、流程、协作、内容、产品和用户等可继续深挖的能力线索；
- 联合校验主语、动作强度、责任范围、项目时态和指标归因，只允许降级或触发追问，不自动升级为 Owner；
- 每轮只提出 1–3 个与经历相关的问题，并根据上一轮回答继续追问；
- 把有效回答沉淀为“深挖新增亮点” Claim，再统一做准确性校对；
- 把通过门禁的 Claim 归入真实项目，生成“背景与目标 / 我的职责 / 数据与指标”项目稿；
- 按 JD 相关性、证据强度、业务价值、信息增量和风险执行 A4 内容预算压缩；
- 生成并下载 Claim Ledger、项目重写稿、A4 内容稿、JD Matrix 与 Interview Defense；
- 将拷打结果带到简历编辑器查看和继续处理。

`editor/` 简历编辑器支持：

- 导入 Skill 生成的 `resume-data.json`；
- 结构化编辑基本信息、教育、经历、项目、奖项和技能；
- 增删、排序经历和 bullet；
- 实时复用同一份 ASU 模板预览；
- A4 分页溢出提示；
- 浏览器本地自动保存、撤销与重做；
- 下载 JSON、HTML，或通过打印重新导出 PDF。

`transform/` 一键酥神化支持：

- 上传并解析 PDF（PDF.js）或 DOCX（Mammoth.js），逐页检测乱码率、异常字符率、有效中文比例和识别行数；
- PDF 原生文字质量不合格时自动切换 Tesseract.js 中英文 OCR；
- 在结构识别前校对解析原文并人工确认公司、岗位、时间、数字和 bullet；未确认或质量不合格时禁止继续；
- 抽取基本信息、教育、经历、项目与技能；
- 将原始事实保存为只读 sourceResume，将同源结构重组结果保存为可编辑 optimizedResume；
- 校验公司、学校、岗位、项目、时间和数字，发现新增事实时阻止进入最终简历；
- 查看完整 Before / After 和 ASU 模板预览；
- 一键把结构化结果写入现有编辑器继续调整。
- 先确认公司内项目边界和每条原始事实的归属，再按“背景 / 指标与效果 / 我的职责 / 技术关键词”重组 A4 经历；原始事实不按逗号切碎，缺失指标只在编辑器内提示；
- 自动识别原文中的数字、GMV、CTR、CVR、SQL、AI Agent、SOP 等重点词，并允许在编辑器中手动增删；
- 保留原简历或用户补充的作品集、项目演示、文章和 GitHub 链接，不自动生成链接；
- 尝试提取 PDF / DOCX 图片作为照片候选，由用户确认、裁剪或删除后才显示在姓名区；
- 姓名区下方仅展示同源人设；所有奖项统一放在末尾“奖项与技能”板块，并以通栏信息行排版，不打印内部证据来源。

在线拷打采用本地规则引擎，不冒充 AI 生成器：它负责材料读取、OCR、能力线索识别、自适应提问、亮点沉淀和安全初筛；最终定向改写、ASU 排版与 PDF 由完整 Skill 基于校验通过的 JSON 完成。候选人文件不会被提交到 GitHub 仓库或上传至项目服务器。PDF.js、Tesseract.js 及中英文 OCR 模型通过公共 CDN 加载，识别在当前浏览器中运行；首次 OCR 需要联网下载模型。

## 主要输出

| 文件 | 用途 |
| --- | --- |
| `claim-ledger.json` | 拆解原子事实、来源、角色、指标、冲突与证据缺口 |
| `jd-matrix.json` | 拆解岗位要求、匹配证据、识别高权重缺口 |
| `resume-data.json` | 与 ASU 前端对应的结构化简历数据 |
| `resume.html` | 自包含 ASU 风格网页简历 |
| `resume.pdf` | A4 PDF 简历 |
| `interview-defense.json` | 可校验的结构化面试问题库 |
| `面试问题清单.md` | 面试前直接使用的问题、证据和回答边界 |

## 安装

将 [`skills/sushen-resume-maker`](skills/sushen-resume-maker) 目录复制到 Codex Skills 目录：

```text
$CODEX_HOME/skills/sushen-resume-maker
```

也可以把 GitHub 仓库地址交给 Codex，并要求安装其中的 `skills/sushen-resume-maker`。

## 启用 GitHub Pages

1. 把仓库上传到 GitHub，默认分支设为 `main`。
2. 进入仓库 **Settings → Pages**。
3. 在 **Build and deployment** 中选择 **GitHub Actions**。
4. 推送一次 `main`；`Deploy editor to GitHub Pages` 工作流会发布编辑器。

部署后的地址通常是：

```text
https://你的用户名.github.io/仓库名/
```

## 使用示例

```text
使用 $sushen-resume-maker，基于我的原始简历和目标 JD：
1. 建立 Claim Ledger 和 JD Matrix；
2. 围绕真实经历深挖原简历遗漏的能力、方法与结果，并生成新增亮点 Claim；
3. 用固定 ASU 前端生成中文简历；
4. 生成面试官可能追问的问题、压力追问和安全回答边界。
```

如果不希望继续追问，可以明确说“不要追问，基于现有证据生成”。Skill 会降低或排除证据不足的表述，不会自行补充事实。

## 分享给其他人

发布时只需要分享两个地址：

1. GitHub 仓库：安装 Skill、阅读说明和下载 Release；
2. GitHub Pages：不安装也能使用的在线深度拷打台与简历编辑器。

## 仓库结构

```text
skills/sushen-resume-maker/
├── SKILL.md
├── agents/openai.yaml
├── assets/resume_template.html
├── evals/evals.json
├── references/
│   ├── claim-ledger-schema.md
│   ├── jd-matrix-schema.md
│   ├── interview-defense-schema.md
│   ├── question-tree.md
│   ├── evidence-and-roles.md
│   ├── resume-schema.md
│   └── style-guide.md
└── scripts/
    ├── render_resume.py
    ├── validate_resume.py
    ├── validate_claim_ledger.py
    ├── validate_jd_matrix.py
    └── validate_interview_defense.py

editor/
├── index.html
├── app.js
├── styles.css
└── sample.resume.json

interrogation/
├── index.html
├── app.js
└── styles.css

transform/
├── index.html
├── app.js
└── styles.css
```

## 本地启动网页

在仓库根目录运行静态服务器（不要直接双击 HTML）：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。可依次测试三条路径；一键酥神化建议使用一份脱敏 PDF 和一份 DOCX，确认真实解析、双数据源、事实校验、前后对比和进入编辑器均可用。

## 本地校验

```bash
python skills/sushen-resume-maker/scripts/validate_claim_ledger.py claim-ledger.json

python skills/sushen-resume-maker/scripts/validate_jd_matrix.py \
  jd-matrix.json --ledger claim-ledger.json

python skills/sushen-resume-maker/scripts/validate_interview_defense.py \
  interview-defense.json \
  --ledger claim-ledger.json \
  --matrix jd-matrix.json
```

生成 PDF 需要 `reportlab`；PDF 完整性检查可选用 `pypdf`。

## 隐私与真实性

- 不要把含手机号、邮箱、住址、后台截图或未脱敏业务数据的测试案例提交到公开仓库。
- PDF/OCR 结果可能包含错字、断行或漏字，必须由用户校对后再进入 Claim Ledger。
- 只有 `source_grounded` 或 `user_attested` 的内容可以进入求职简历。
- 未解决冲突、未知事实和未标注的规划内容不得进入最终简历。
- 面试问题清单提供回答结构，不生成未经确认的“标准答案”。

## 许可证说明

本项目以 [MIT License](LICENSE) 发布。生成与审计设计参考了 [Claycui828/ASu-resume-skills](https://github.com/Claycui828/ASu-resume-skills)，前端结构与模板约定参考了 [Hisn00w/ASu-skills](https://github.com/Hisn00w/ASu-skills)；两者均使用 MIT License，原始版权声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

