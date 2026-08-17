# ASU 式真实技术履历风格

## 视觉骨架

- 姓名使用大号衬线体，身份主线使用蓝色粗体。
- `教育经历 / 实习与工作经历 / 技术项目与沉淀 / 奖项与技能` 使用蓝色标题和细横线。
- 公司条采用浅红、浅蓝、浅绿背景；公司、部门、日期、方向标签挤在同一行。
- 正文用紧凑行距和两级 bullet，形成接近技术设计文档的信息密度。
- 不显示水印、免责声明或“虚构”标签。

## 固定项目语法

每个项目依次写：

1. `背景：` 业务问题、任务边界与真实难点；
2. `指标与效果：` 基线、结果、口径和部署形态；
3. `我的职责：` 个人角色与完整技术链；
4. `技术关键词：` 与正文存在逻辑关系的模型、框架和方法。

## 专业名词密度

每个重点项目至少覆盖三类术语：

| 类别 | 示例 |
|---|---|
| 数据/输入 | OCR、ASR、Schema、Hard Sample、Hive、Event Log |
| 模型/训练 | CLIP、BERT、Full SFT、LoRA、GRPO、DPO、Short COT |
| 系统/部署 | SGLang、AWQ、Prefill、Decoding、Runtime、Session |
| Agent/上下文 | ReAct、Tool Use、Memory、Context Engine、Checkpoint、Compaction |
| 评测/质量 | Benchmark、Suite、Case、Grader、Transcript、Outcome、Artifact |

不要单纯罗列；用箭头或因果关系连接：

```text
Query -> Schema Linking -> Structured Short COT -> GRPO Execution Reward -> AWQ -> SGLang Serving
```

## Owner、0→1 与大 Scope

每个项目先找“可拥有的最小闭环”，再向外展开真实覆盖面：

```text
多模态营销理解算法链路 Owner：从 0→1 串联 Title/OCR/ASR -> LanguageBind -> VideoLLaVA -> Random Forest -> Hive 日级生产，覆盖多模态表征、意图总结、商品判别与 T+0/T+2 召回。
```

来源为独立负责时用 `Owner`；主要负责时用 `策略架构 Owner`；仅参与时用 `系统级共建者`。不要把模块 Owner 写成平台总 Owner。

`0→1` 只用于新建闭环。优化存量系统时使用 `26.9%→78%`、`Fixed Workflow→ReAct`、`File-based Memory→Structured Observation` 等演进箭头。

## 学校 Title 工程

标题形式：

```text
上海大学｜国家“双一流”｜原“211工程”｜教育部与上海市人民政府共建｜本科
悉尼大学｜澳大利亚第一所大学（1850）｜Group of Eight 创始成员｜研究生
```

仅使用学校官网、教育主管部门或正式高校联盟支持的标签。可以高密度并列，但不能改换国家、学位类型、直属关系或合作性质。

## 阿酥式措辞，但不造事实

### 宏观阶段标题

```text
从模型节点正确率到 Agent 长程状态连续性
从 Fixed Workflow 到 ReAct，再到 Context/Memory/Harness
```

### 密集职责链

```text
数据清洗 -> 结构化短 COT -> 真实 Server GRPO -> AWQ 量化 -> Prefill/Decoding 拆解 -> SGLang 部署
```

### 失败分类叙事

```text
将失败拆为召回、规划轨迹、证据选择、Writer 使用和最终答案五层，形成可定位的评测口径。
```

### 角色写法

把角色限定到模块：

- `NL2SQL ModelOps 全链路 Owner｜从 0→1 打通训练—强化学习—量化—部署`；
- `Search Agent 策略架构 Owner｜Fixed Workflow→ReAct 端到端演进`；
- `参与通用 Agent 的 Memory、Context 与 Harness 共建`；
- `当前聚焦 Coding Agent 长程压缩和续跑评测`。

不能把最后两项升级为整个项目 Owner。

## 幽默来源

幽默来自真实技术跨度和措辞反差：

- `从“模型有没有答对”一路管到“Agent 压缩以后还记不记得自己在干什么”`；
- `既检查 Transcript，也检查 Agent 嘴上说完成以后外部对象到底变没变`；
- `把线上 badcase 从一次性事故沉淀成可以反复重现的 Case`。

避免使用假百分比、假 Title、虚构学校合作或不存在的开源角色。

## 发布检查

- 真实名称与用户授权范围一致；
- 内部数据是否适合公开由用户决定，默认只使用其主动提供的材料；
- 所有强角色词都能回到来源中的“独立负责/主要负责/参与”；
- 规划项目明确写“当前方向/计划”；
- 不加入来源之外的项目和成果。
