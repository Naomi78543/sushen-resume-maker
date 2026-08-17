# JD Matrix 数据规范

JD Matrix 将招聘要求拆成原子能力项，并只使用 Claim Ledger 中已确认的 Claim 建立匹配。该矩阵用于选择追问、经历排序、关键词和最终简历内容，不表示录用概率。

## 顶层结构

```json
{
  "schema_version": "1.0",
  "case_id": "CASE-001",
  "job": {},
  "requirements": [],
  "questions": [],
  "selection": {},
  "summary": {}
}
```

`case_id` 应与 Claim Ledger 一致。

## Job

```json
{
  "job_id": "JOB-001",
  "title": "MCN机构运营（菲律宾电商）",
  "company": "",
  "source_text": "完整JD原文或文件定位",
  "domain": ["跨境电商", "直播电商", "创作者生态"],
  "target_markets": ["菲律宾"],
  "seniority": "intern"
}
```

`seniority` 允许：`intern`、`new_grad`、`junior`、`mid`、`senior`、`lead`、`unknown`。

## Requirement

```json
{
  "requirement_id": "JD-001",
  "original_text": "协助策略团队展开机构经营分析与数据研究",
  "category": "core_duty",
  "capability": "经营分析",
  "business_context": "MCN机构与达人生态",
  "keywords": ["指标拆解", "数据下钻", "问题定位"],
  "weight": 5,
  "evidence_claim_ids": ["C-001", "C-004"],
  "match_level": "strong",
  "match_type": "direct",
  "rationale": "候选人有直播漏斗和独立站经营数据分析证据",
  "gap": null
}
```

### category

允许：

- `core_duty`：核心工作职责。
- `must_have`：硬性要求。
- `preferred`：加分项。
- `context`：行业、市场或团队背景。

### weight

使用 1–5：

- `5`：核心职责或决定性硬要求。
- `4`：重要硬要求。
- `3`：常规职责或能力。
- `2`：明确加分项。
- `1`：背景信息或低优先级要求。

权重用于证据覆盖率和追问排序，不表示招聘方真实打分。

### match_level

允许：

- `strong`：有直接相关的工作行为与结果。
- `medium`：存在可迁移能力，但场景、对象或市场不同。
- `weak`：只有课程、证书、技能声明或很弱的间接证据。
- `gap`：无证据。
- `conflict`：证据与要求直接冲突。

### match_type

允许：

- `direct`：同类业务场景的直接经验。
- `transferable`：能力可迁移，但行业、市场或对象不同。
- `credential_only`：只有证书、成绩或课程。
- `self_reported`：只有用户本人概括性陈述。
- `none`：没有对应证据。

约束：

- `strong` 必须有 Claim，且 `match_type` 必须为 `direct`。
- `credential_only` 和 `self_reported` 不得标记为 `strong`。
- `gap` 必须使用 `match_type: none`。
- `transferable` 必须明确说明迁移边界和缺口。
- 不得把马来西亚经验写成菲律宾经验，也不得把供应商协作直接写成 MCN 机构运营。

## Question Candidate

```json
{
  "question_id": "Q-001",
  "requirement_id": "JD-003",
  "claim_ids": ["C-012"],
  "question": "你是否在直播、供应商沟通或海外独立站工作中实际使用过英文？请举一个具体任务。",
  "expected_fields": ["business_context", "communication_object", "deliverable", "result"],
  "priority": 0.88,
  "status": "open"
}
```

`status` 允许：`open`、`asked`、`answered`、`skipped`。

优先级建议：

```text
priority = JD权重 × 信息缺失度 × 表述风险 × 可补充概率
```

每轮只选择 1–3 个最高价值问题。

## Selection

```json
{
  "selected_claim_ids": ["C-001", "C-004", "C-007"],
  "excluded_claims": [
    {
      "claim_id": "C-020",
      "reason": "与目标JD相关度低"
    }
  ],
  "selection_policy": "JD相关度40% + 证据完整度25% + 个人责任20% + 结果质量15% - 风险扣分"
}
```

选择规则：

- 只选择 `source_grounded` 或 `user_attested` Claim。
- 不选择未解决冲突、`unknown`、`contradicted` 或未明确标注规划时态的 Claim。
- 单页简历优先覆盖不同的高权重 JD 要求。
- 同一经历通常保留 2–3 条最高价值 Claim。
- 不通过加入无证据关键词提高匹配率。

## Summary

```json
{
  "weighted_coverage": 68.5,
  "strong_count": 2,
  "medium_count": 2,
  "weak_count": 1,
  "gap_count": 1,
  "top_strengths": ["经营数据分析", "直播电商运营"],
  "top_gaps": ["菲律宾MCN直接经验", "英文工作案例"]
}
```

覆盖率按以下系数计算：

- `strong = 1.0`
- `medium = 0.65`
- `weak = 0.30`
- `gap = 0`
- `conflict = 0`

```text
weighted_coverage = Σ(weight × match系数) / Σ(weight) × 100
```

该分数只表示现有证据对 JD 的覆盖程度，不表示候选人被录用的概率。

## 输出顺序

1. 读取完整 JD。
2. 将职责、硬要求、加分项和场景拆成原子 Requirement。
3. 为每个 Requirement 设定 1–5 权重。
4. 仅从已校验 Claim Ledger 选择证据。
5. 标记匹配等级、匹配类型、理由和缺口。
6. 为高权重缺口生成 Question Candidate。
7. 计算覆盖率并选择最终 Claim。
8. 运行 `scripts/validate_jd_matrix.py --ledger <ledger.json> <matrix.json>`。
9. 校验通过后生成定向简历。

## 必过检查

- JD Requirement ID 唯一。
- 所有 Claim 引用都能在 Ledger 中找到。
- `strong` 不是由证书、课程或关键词声明支撑。
- 可迁移经验没有被包装为直接经验。
- `gap` 没有出现在顶部优势或最终 Claim 中。
- 最终选中的 Claim 均可用于求职版简历。
- 覆盖率计算正确。
- 矩阵没有把匹配分数解释为录用概率。

