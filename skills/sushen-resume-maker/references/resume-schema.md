# 来源驱动简历数据格式

## 顶层字段

```json
{
  "mode": "source_grounded",
  "source_title": "经历来源名称",
  "profile": {},
  "endorsements": [],
  "education": [],
  "experience": [],
  "open_source": [],
  "projects": [],
  "awards": [],
  "skills": []
}
```

成品不使用 `display_notice`、`show_watermark`、`watermark_text` 或 `footer_note` 等免责声明字段。

## 可见条目

所有教育、背景、指标、职责、开源和项目 bullet 使用对象：

```json
{
  "text": "将固定 Search Workflow 演进为基于 ReAct 的搜索策略架构。",
  "verification": "source_grounded",
  "source_note": "晋升材料 / Search Agent 章节",
  "claim_ids": ["C-001", "C-002"],
  "highlights": ["Search Workflow", "ReAct"]
}
```

`highlights` 只能引用 `text` 中真实存在的连续词组。模板用安全文本节点和 `<strong>` 渲染，不解析用户提供的 HTML；数字、GMV、CTR、CVR、SQL、AI Agent、SOP 等可自动识别，编辑器允许人工增删。

## 基本信息、照片与外部认可

```json
{
  "profile": {
    "name": "张三",
    "headline": "策略运营｜数据分析 × AI 应用",
    "summary": {
      "text": "策略运营方向候选人，具备 SQL、Excel 与 SOP 沉淀能力。",
      "verification": "source_grounded",
      "source_note": "由已确认岗位与技能字段组合",
      "claim_ids": [],
      "highlights": ["SQL", "Excel", "SOP"]
    },
    "photo": {
      "src": "data:image/jpeg;base64,...",
      "crop": {"x": 50, "y": 50, "zoom": 1},
      "confirmed": true
    }
  },
  "endorsements": [
    {
      "text": "获得校级一等奖学金",
      "source": "获奖证书 / 原始简历",
      "verification": "source_grounded",
      "source_note": "原始简历·荣誉奖项",
      "claim_ids": ["C-010"],
      "highlights": ["一等奖学金"]
    }
  ]
}
```

- 从 PDF / DOCX 提取的图片只能作为候选，必须由用户选择后才能设为 `confirmed: true`；未确认或无法识别时隐藏照片。
- 照片只允许 PNG、JPEG 或 WebP 数据 URL；`crop` 控制水平位置、垂直位置和 1–2 倍缩放。
- `endorsements` 只接受 `source_grounded` 或 `user_attested`，并必须包含具体 `source`。没有外部认可证据时使用 `profile.summary` 展示事实型候选人定位，不能伪装成第三方评价。

`verification` 可取：

- `source_grounded`：用户提供的文档、简历或公开资料明确支持；
- `user_attested`：用户本人确认的内部经历；
- `planned`：当前方向或未来规划，正文必须使用规划时态。

`source_note` 必填，用于内部追踪，不展示在成品中。

`claim_ids` 在本技能中必填，用于把最终简历原句映射回 Claim Ledger，并生成对应的面试问题、压力追问与回答边界。多个 Claim 只有在共同支持同一句话时才能合并引用。

## 指标

```json
{
  "text": "主评测集准确率提升至 98.27%，SGLang 将平均耗时从 1310ms 降至 407ms。",
  "verification": "source_grounded",
  "source_note": "晋升材料 / Scheduler 章节",
  "metric": {
    "baseline": 1310,
    "result": 407,
    "unit": "ms",
    "window": "项目阶段"
  }
}
```

如果同时提供 `numerator`、`denominator`、`displayed_percent`，校验器会重算百分比；不一致会直接失败。

## 教育与经历

教育条目保留真实 `institution`、`degree`、`dates`。`program` 可放 2–4 个经官网核验的学校 Title；Title 对应的官方 URL 写入 bullet 的 `source_note`。合作学校只有在来源明确为联合项目时才使用 `partner`。

项目的 `subtitle` 优先使用 `限定模块 Owner / 0→1 / 架构演进 / 大 Scope` 结构。只有来源为独立负责或主要负责时才能写 Owner；参与项使用 `共建者/核心参与者`。

经历条目结构：

```json
{
  "company": "字节跳动",
  "companyNormalizedName": "ByteDance",
  "team": "Aily · 大模型应用算法",
  "dates": "2025.02 - 2026.06",
  "brand": "blue",
  "tags": ["NL2SQL", "Search Agent", "Harness"],
  "links": [
    {"label": "作品集", "url": "https://example.com", "verification": "user_attested"}
  ],
  "projects": [
    {
      "name": "NL2SQL",
      "subtitle": "训练、强化学习与量化部署",
      "background": [],
      "impact": [],
      "responsibilities": [],
      "actions": [],
      "keywords": []
    }
  ]
}
```

`actions` 用于承载可由原始材料直接支持的关键动作与方法，例如分析、拆解、设计、搭建、推动和复盘；不得为了补齐区块而推断原文没有的方法。`background`、`impact`、`responsibilities` 与 `actions` 均使用上文的可见条目对象，并保留同一来源映射。

A4 经历区只显示三个区块：`background` 映射为“背景与目标”，`responsibilities + actions` 合并为“我的职责”，`impact` 映射为“数据与指标”。`missingMetrics` 只在编辑器中提示，不进入正式简历。

`links` 显示在公司名称或岗位旁，只能来自原始简历或用户补充。兼容读取旧的单个 `link` 字段，但编辑器保存时统一迁移为 `links[]`；禁止自动生成 URL。

`companyNormalizedName` 为可选标准化公司名，只用于本地 Logo 匹配，不替代可见的真实公司名称。当前 A4 模板通过 `resolveCompanyLogo(companyNormalizedName || company)` 在本地 `companyLogoMap` 中匹配；找不到或资源加载失败时直接隐藏 Logo。不要把 Logo URL 写入简历正文，也不要因此改写公司事实。

`brand` 只允许 `red`、`blue`、`green`、`gray`。`page_break_before: true` 仅影响 PDF 分页。

