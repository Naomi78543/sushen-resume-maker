# Claim Ledger 数据规范

Claim Ledger 是简历生成前的事实层。先将用户材料拆成来源、经历和原子主张，再进行 JD 匹配、追问和简历改写。禁止绕过 Ledger 直接把未确认内容写入最终简历。

## 顶层结构

```json
{
  "schema_version": "1.0",
  "case_id": "CASE-001",
  "sources": [],
  "experiences": [],
  "claims": [],
  "conflicts": [],
  "evidence_gaps": []
}
```

- `case_id` 使用匿名任务编号，不使用电话、邮箱等个人信息。
- `sources` 保存材料来源。
- `experiences` 保存经历身份和时间。
- `claims` 保存原子事实主张。
- `conflicts` 保存来源之间的直接冲突。
- `evidence_gaps` 保存需要追问的缺口。

## Source

```json
{
  "source_id": "S-001",
  "source_type": "resume_pdf",
  "title": "用户原始简历",
  "locator": "第1页",
  "provided_by": "user",
  "reliability": "candidate_self_statement",
  "contains_private_data": true,
  "notes": ""
}
```

`source_type` 允许：

- `resume_pdf`、`resume_docx`、`screenshot`、`project_document`
- `portfolio`、`repository`、`official_webpage`、`metric_dashboard`
- `certificate`、`user_interview`、`other`

`reliability` 允许：

- `official_record`
- `system_record`
- `candidate_self_statement`
- `public_project_record`
- `third_party_commentary`
- `unknown`

来源等级只表示证据性质，不自动代表事实真假。

## Experience

```json
{
  "experience_id": "EXP-001",
  "experience_type": "internship",
  "organization": "滔搏运动 TOP SPORTS",
  "team": "",
  "role": "跨境电商运营实习生",
  "start_date": "2025-08",
  "end_date": "2025-12",
  "status": "completed",
  "source_ids": ["S-001"]
}
```

`experience_type` 允许：`education`、`internship`、`employment`、`project`、`research`、`open_source`、`entrepreneurship`、`content_creator`、`award`、`other`。

`status` 允许：`completed`、`ongoing`、`planned`、`unknown`。

## Claim 拆分原则

一条 Claim 只表达一个能够独立判断真假的事实。把角色、动作、方法、交付物、结果和因果关系分开。

例如，不要把下面整句作为一个 Claim：

> 主导商品页优化项目，通过 A/B 测试使页面转化率由 2.3% 提升至 3%。

应拆成：

1. 候选人负责商品页优化模块。
2. 候选人使用了 A/B 测试。
3. 页面转化率由 2.3% 变为 3%。
4. 该变化可归因于候选人的页面优化。

前 3 条可能已有证据；第 4 条因果归因需要实验设计和责任边界支持。

## Claim

```json
{
  "claim_id": "C-001",
  "experience_id": "EXP-001",
  "claim_type": "metric_result",
  "raw_claim": "使页面转化率由2.3%提升至3%，提升约30%",
  "normalized_claim": "商品页转化率由2.3%提升至3%",
  "action": "优化商品详情页",
  "methods": ["Google Analytics", "A/B测试"],
  "business_object": "Shopify海外独立站商品页",
  "deliverables": ["商品页信息结构", "购买流程调整"],
  "result": "商品页转化率由2.3%提升至3%",
  "role_scope": "module_owner",
  "tense": "delivered",
  "verification": "user_attested",
  "source_refs": [
    {
      "source_id": "S-001",
      "support_type": "supports",
      "locator": "实习经历 / TOP SPORTS / 第2条",
      "excerpt": "页面转化率由2.3%提升至3%"
    }
  ],
  "metric": {
    "name": "商品页转化率",
    "baseline": 2.3,
    "result": 3.0,
    "unit": "%",
    "absolute_change": 0.7,
    "relative_change": 30.43,
    "numerator": null,
    "denominator": null,
    "window": null,
    "measurement_system": "Shopify",
    "attribution_scope": "team_result_with_personal_module"
  },
  "risk_flags": ["missing_time_window", "missing_denominator"],
  "notes": ""
}
```

### claim_type

允许：

- `identity`
- `responsibility`
- `action`
- `method`
- `deliverable`
- `metric_result`
- `qualitative_result`
- `status`
- `causal_attribution`
- `credential`
- `other`

### role_scope

允许：

- `executor`：执行明确任务。
- `module_contributor`：参与模块但不独立负责。
- `module_owner`：独立或主要负责限定模块。
- `project_coordinator`：负责排期、协同或项目推进。
- `project_owner`：负责问题、方案、资源与结果闭环。
- `team_result_only`：只有团队结果，个人范围不明确。
- `unknown`

使用 `主导`、`Owner`、`从0到1` 至少要求 `module_owner`。使用 `project_owner` 时，必须存在决策、交付和结果验证证据。

### tense

允许：`delivered`、`ongoing`、`tested`、`planned`、`unknown`。

`planned` 不得使用“已上线、已落地、取得、提升至”等完成时态。

### verification

允许：

- `source_grounded`：材料或一手来源明确支持。
- `user_attested`：用户本人补充确认。
- `planned`：仅处于规划阶段。
- `unknown`：当前信息不足。
- `contradicted`：可靠来源之间存在直接冲突。

只有 `source_grounded` 和 `user_attested` 可以进入求职版最终简历。`planned` 只能进入明确标注为规划或探索的内容。`unknown` 和 `contradicted` 不得进入最终简历。

## Source Reference

```json
{
  "source_id": "S-001",
  "support_type": "supports",
  "locator": "项目经历 / 第2条",
  "excerpt": "设计双账号+双货盘+分时段测试方案"
}
```

`support_type` 允许：`supports`、`partially_supports`、`contradicts`、`context_only`。

每个可用于最终简历的 Claim 至少需要一个 `supports` 或 `partially_supports` 来源。

## Metric

只有可量化 Claim 才添加 `metric`。百分比从 2.3% 变为 3% 时：

- `absolute_change = 3.0 - 2.3 = 0.7` 个百分点。
- `relative_change = (3.0 - 2.3) / 2.3 × 100 = 30.43%`。

不得混淆百分点变化与相对提升。

`attribution_scope` 允许：

- `personal_result`
- `team_result_with_personal_module`
- `team_result`
- `correlated_only`
- `unknown`

没有对照、实验设计或责任边界时，不得自动生成强因果表述。

## Risk Flag

允许：

- `missing_source`、`missing_role_scope`
- `missing_baseline`、`missing_result`、`missing_time_window`
- `missing_denominator`、`missing_measurement_method`
- `team_result_attribution`、`causality_not_established`
- `strong_role_term`、`planned_as_delivered`
- `cross_market_inflation`、`cross_domain_inflation`
- `conflicting_dates`、`conflicting_role`
- `private_information`、`other`

风险标记影响追问、措辞强度和是否进入简历，但不等于事实为假。

## Conflict

```json
{
  "conflict_id": "CON-001",
  "claim_ids": ["C-007", "C-008"],
  "conflict_type": "date_conflict",
  "description": "简历与用户回答中的项目时间不一致",
  "status": "unresolved",
  "resolution": null
}
```

冲突解决前，相关 Claim 不得作为已确认事实进入最终简历。

## Evidence Gap

```json
{
  "gap_id": "GAP-001",
  "claim_id": "C-001",
  "missing_fields": ["metric.window", "metric.denominator"],
  "impact": "无法确认指标口径和实验有效性",
  "recommended_question": "2.3%到3%的数据对应哪个时间段，转化率分母是什么？",
  "priority": "high",
  "status": "open"
}
```

`priority` 允许：`high`、`medium`、`low`。深挖阶段优先追问能补出复杂度、判断、方法、推动、可复用成果和真实影响的缺口；强角色词、指标口径和因果归因放在候选亮点形成后的准确性校对。

## 输出顺序

1. 建立 Source。
2. 建立 Experience。
3. 拆分原子 Claim。
4. 关联证据并区分个人动作、团队结果与因果归因。
5. 计算可重算指标。
6. 标记角色、时态、验证状态和风险。
7. 记录 Conflict 与 Evidence Gap。
8. 运行 `scripts/validate_claim_ledger.py`。
9. 校验通过后再生成 JD Matrix 和最终简历。

## 必过检查

- 所有 ID 唯一且引用有效。
- 每个 Claim 只表达一个主要事实。
- 可用 Claim 有支持性来源。
- 强角色词与 `role_scope` 一致。
- 规划内容没有伪装成已交付结果。
- 指标重算一致。
- 团队结果没有默认归因给个人。
- 未解决冲突、未知内容和跨市场夸大没有进入最终简历。
