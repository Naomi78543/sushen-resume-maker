# 语义角色门禁、项目重写与 A4 压缩

本规则位于 Claim Ledger 与最终简历之间。目标是让每句项目表达都能回到原始事实，同时把有限的一页空间留给最有岗位价值的信息。

## 一、语义角色校验

对每条 Claim 联合判断：

1. `subject`：个人明确、个人＋团队、团队／协同、主语隐含；
2. `action_strength`：执行、参与、协调、限定模块负责、项目闭环；
3. `decision_signal`：是否存在判断、方案选择、优先级或资源取舍；
4. `delivery_signal`：是否存在真实交付、采用、上线或复盘闭环；
5. `tense`：已交付、进行中、测试中、规划中；
6. `attribution`：个人结果、团队结果含个人模块、相关性或未知。

输出字段：

```json
{
  "claim_id": "C-001",
  "subject": "个人＋团队",
  "current_role": "project_owner",
  "max_role": "module_owner",
  "status": "blocked",
  "reasons": ["当前角色强度高于句内可支持上限"],
  "allowed_wording": "负责限定模块，不升级为整体项目 Owner",
  "needs_question": true
}
```

`status` 允许 `pass`、`review`、`blocked`。语义规则只能给出支持上限、降级措辞或追问建议，不能自动提升角色。纯静态网页必须明确这是可解释的本地规则校验，不得声称使用 AI 完成事实判断。

## 二、针对性拷打

问题由两类信号共同排序：

- 能力增量：复杂问题、关键判断、分析到决策、无权推动、流程沉淀、真实影响；
- 门禁缺口：个人模块不清、团队结果归因不清、指标口径不清、规划与交付时态冲突。

每轮 1–3 题，且同轮问题应覆盖不同能力维度。角色问题只询问“亲自完成的模块、关键判断与交付物”，不得连续审讯是否为 Owner。有效回答新增为 `origin=interview` Claim，假设性回答不进入 Ledger。

## 三、项目级重写

只有 `source_grounded` 或 `user_attested` 且未被角色门禁阻断、被用户选中的 Claim 才能进入项目稿。每条 Claim 只能归入一个确认后的项目。

项目输出：

```json
{
  "project_id": "P-001",
  "name": "供应商入驻与商品审核流程",
  "generated_label": true,
  "label_source_claim_ids": ["C-003"],
  "background": [],
  "responsibilities": [],
  "impact": [],
  "missingMetrics": []
}
```

- `background`：只使用事实源已经说明的业务对象、问题或项目状态；缺失时留空。
- `responsibilities`：合并个人动作、方法和交付物，必须保存 `claim_ids`。
- `impact`：只使用真实量化结果或可确认的定性采用结果。
- `missingMetrics`：仅编辑阶段提示，不进入正式 A4。

## 四、A4 内容压缩

压缩评分至少包含：JD 相关性、证据强度、业务价值、责任清晰度、信息增量、风险与长度成本。评分只决定排序，不代表事实真假或录用概率。

压缩顺序：

1. 排除未验证、冲突、规划冒充交付和角色阻断 Claim；
2. 项目内合并语义重复内容；
3. 优先保留高权重 JD 证据、真实指标、关键交付物和方法闭环；
4. 每个核心项目最多保留一条背景，职责与指标按剩余预算排序；
5. 达到字符预算后停止，不通过缩小字体塞入更多内容；
6. 输出每条 Claim 的分数、字符数、保留状态和删除原因。

压缩后的每个可见条目仍需保留 `verification`、`source_note`、`claim_ids` 和 `highlights`。压缩不得新建公司、岗位、项目、时间、数字、角色或业务结果。

