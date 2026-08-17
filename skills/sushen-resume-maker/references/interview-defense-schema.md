# 面试防御数据规范

面试防御层把最终简历、Claim Ledger 和 JD Matrix 转换为可追溯的问题清单。它用于准备，不是背诵标准答案；不得补写用户没有提供的事实。

## 顶层结构

```json
{
  "schema_version": "1.0",
  "case_id": "CASE-001",
  "job_id": "JOB-001",
  "generated_from": {
    "claim_ledger": "claim-ledger.json",
    "jd_matrix": "jd-matrix.json",
    "resume_data": "resume-data.json"
  },
  "questions": [],
  "summary": {}
}
```

`case_id` 必须与 Ledger、Matrix 一致；`job_id` 必须与 Matrix 一致。没有目标 JD 时可以省略 `job_id` 和 `jd_matrix`。

## Question

```json
{
  "question_id": "IQ-001",
  "category": "metric_attribution",
  "claim_ids": ["C-001"],
  "requirement_ids": ["JD-001"],
  "resume_anchor": "页面调整期间转化率由2.3%升至3.0%",
  "primary_question": "这个转化率的定义、时间窗和样本量是什么？",
  "follow_ups": [
    "2.3%和3.0%分别对应哪一组流量？",
    "如何排除投放、价格和促销变化的影响？"
  ],
  "interviewer_intent": "判断候选人是否真的理解指标口径与因果边界",
  "answer_framework": [
    "先定义统计系统、分子、分母和时间窗",
    "说明本人负责的页面模块与同期其他变量",
    "只陈述能够证明的相关变化，不夸大因果"
  ],
  "evidence_to_prepare": ["Shopify或GA截图", "实验/调整记录", "页面版本对比"],
  "safe_boundary": "缺少严格对照时使用‘调整期间变化’，不回答为个人单独带来30%增长。",
  "risk_level": "high",
  "status": "prepare"
}
```

## category

允许：

- `resume_claim`：围绕简历原句核实事实。
- `role_scope`：个人边界、协作对象和决策权。
- `metric_attribution`：指标口径、统计方法与归因。
- `method_decision`：方法选择、取舍和方案合理性。
- `failure_reflection`：失败、复盘和下一次改进。
- `jd_case`：目标岗位的业务场景题。
- `behavioral`：推进、冲突、优先级和自驱力。
- `language_tool`：英语、Excel、SQL 或平台实操。

## 字段约束

- `claim_ids`：至少一个，必须存在于 Ledger；纯 JD Case 可以为空，但必须引用 `requirement_ids`。
- `requirement_ids`：有 JD 时至少一个，必须存在于 Matrix。
- `resume_anchor`：写简历中会触发追问的原句或经历标题；纯 JD Case 可写岗位要求。
- `follow_ups`：1–3 个，从角色、口径、决策、异常或复盘继续施压。
- `answer_framework`：2–5 步，只给组织框架，不补事实。
- `evidence_to_prepare`：可以是后台截图、文档、版本记录、邮件、SOP、公式、作品或口头可说明的事实链。
- `safe_boundary`：明确不能升级的角色、数据、市场、因果或项目状态。
- `risk_level`：`high`、`medium`、`low`。
- `status`：`prepare`、`ready`、`needs_evidence`、`drop_claim`。

## 覆盖规则

必须生成问题的 Claim：

- 带有 `risk_flags`；
- 包含指标对象；
- `role_scope` 为 `module_owner`、`project_owner` 或 `project_coordinator`；
- 使用 Owner、0→1、主导、上线、提升等强词；
- 被多个高权重 Requirement 引用。

必须生成问题的 Requirement：

- 权重为 4–5 且匹配为 `gap` 或 `weak`；
- 权重为 4–5 且只有可迁移经验；
- 面试中很可能要求现场实操或语言展示。

## Markdown 输出顺序

`面试问题清单.md` 按以下顺序组织：

1. 最危险的 5 道题；
2. 按经历分组的简历追问；
3. JD 场景题；
4. 英语与工具实操题；
5. 面试前证据准备清单；
6. 不可越过的回答边界。

每题展示：主问题、压力追问、回答骨架、证据准备和安全边界。不要提供一段看似完整但事实未经用户确认的“标准答案”。

## 必过检查

- 所有 ID 唯一且引用有效。
- 每题至少关联 Claim 或 Requirement。
- 每题都有压力追问、面试官意图、回答骨架和安全边界。
- 高风险 Claim 与高权重缺口得到覆盖。
- 问题不把可迁移经验预设为直接经验。
- 安全边界不会与 Ledger 中的角色、时态或归因相冲突。
