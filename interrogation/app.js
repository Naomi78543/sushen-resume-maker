(() => {
  "use strict";

  const STORAGE_KEY = "sushen-interrogation-v1";
  const HANDOFF_KEY = "sushen-evidence-handoff-v1";
  const CASE_ID = "CASE-LOCAL";
  const STEPS = ["intake", "questions", "claims", "matrix", "defense"];
  const STEP_META = {
    intake: ["材料与目标 JD", "粘贴真实经历，先拆事实再开始追问"],
    questions: ["定向深度拷打", "每轮只处理 1–3 个最影响可信度和岗位匹配的问题"],
    claims: ["Claim Ledger 事实台账", "逐条确认角色、状态与证据；未知内容不会进入正式简历"],
    matrix: ["JD Matrix 岗位矩阵", "用已确认 Claim 匹配岗位要求，并明确可迁移边界"],
    defense: ["面试防御", "把强表述、指标和高权重缺口转换成压力追问与安全边界"]
  };

  const ROLE_OPTIONS = [
    ["executor", "执行明确任务"],
    ["module_contributor", "模块参与者"],
    ["module_owner", "限定模块负责人"],
    ["project_coordinator", "项目协调推进"],
    ["project_owner", "项目 Owner"],
    ["team_result_only", "仅团队结果"],
    ["unknown", "尚未确认"]
  ];
  const VERIFICATION_OPTIONS = [
    ["source_grounded", "材料明确支持"],
    ["user_attested", "本人补充确认"],
    ["planned", "仅规划"],
    ["unknown", "未知 / 不进入简历"],
    ["contradicted", "存在冲突"]
  ];
  const TENSE_OPTIONS = [
    ["delivered", "已交付"],
    ["ongoing", "进行中"],
    ["tested", "测试 / 试点"],
    ["planned", "规划中"],
    ["unknown", "未知"]
  ];
  const TYPE_OPTIONS = [
    ["responsibility", "职责"],
    ["action", "动作"],
    ["method", "方法"],
    ["deliverable", "交付物"],
    ["metric_result", "量化结果"],
    ["qualitative_result", "定性结果"],
    ["status", "项目状态"],
    ["causal_attribution", "因果归因"],
    ["credential", "资质"],
    ["other", "其他"]
  ];

  const contentHeader = document.getElementById("contentHeader");
  const contentPanel = document.getElementById("contentPanel");
  const stepList = document.getElementById("stepList");
  const toast = document.getElementById("toast");
  const materialFile = document.getElementById("materialFile");
  let toastTimer = 0;
  let state = loadState();
  let activeStep = state.activeStep || "intake";

  function blankState() {
    return {
      version: 1,
      activeStep: "intake",
      target: { title: "", company: "", experience: "", jd: "" },
      material: "",
      claims: [],
      requirements: [],
      rounds: [],
      currentRound: 0,
      defense: [],
      stopped: false,
      updatedAt: new Date().toISOString()
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return saved && saved.version === 1 ? { ...blankState(), ...saved } : blankState();
    } catch (_) {
      return blankState();
    }
  }

  function saveState() {
    state.activeStep = activeStep;
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateSummary();
  }

  function element(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = options.text;
    if (options.type) node.type = options.type;
    if (options.title) node.title = options.title;
    const list = Array.isArray(children) ? children : [children];
    list.filter(Boolean).forEach(child => node.append(child));
    return node;
  }

  function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast show${isError ? " error" : ""}`;
    toastTimer = window.setTimeout(() => { toast.className = "toast"; }, 2800);
  }

  function button(label, className, handler) {
    const node = element("button", { className: `button${className ? ` ${className}` : ""}`, text: label, type: "button" });
    node.addEventListener("click", handler);
    return node;
  }

  function field(label, value, onInput, options = {}) {
    const wrapper = element("label", { className: "field" });
    wrapper.append(element("span", { text: label }));
    let control;
    if (options.choices) {
      control = element("select");
      options.choices.forEach(([choiceValue, choiceLabel]) => {
        const option = element("option", { text: choiceLabel });
        option.value = choiceValue;
        option.selected = value === choiceValue;
        control.append(option);
      });
      control.addEventListener("change", () => { onInput(control.value, control); saveState(); });
    } else if (options.multiline) {
      control = element("textarea", { className: options.tall ? "tall" : "" });
      control.value = value || "";
      control.placeholder = options.placeholder || "";
      control.addEventListener("input", () => { onInput(control.value, control); saveState(); });
    } else {
      control = element("input");
      control.type = options.inputType || "text";
      control.value = value || "";
      control.placeholder = options.placeholder || "";
      control.addEventListener("input", () => { onInput(control.value, control); saveState(); });
    }
    wrapper.append(control);
    return wrapper;
  }

  function selectControl(value, choices, onChange) {
    const select = element("select");
    choices.forEach(([choiceValue, choiceLabel]) => {
      const option = element("option", { text: choiceLabel });
      option.value = choiceValue;
      option.selected = choiceValue === value;
      select.append(option);
    });
    select.addEventListener("change", () => onChange(select.value, select));
    return select;
  }

  function headerActions(...nodes) {
    return element("div", { className: "header-actions" }, nodes);
  }

  function navigate(step) {
    if (!STEPS.includes(step)) return;
    if (step !== "intake" && !state.claims.length) {
      showToast("请先粘贴材料并开始首轮拷打", true);
      step = "intake";
    }
    activeStep = step;
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderHeader() {
    const [title, description] = STEP_META[activeStep];
    const copy = element("div");
    copy.append(element("span", { className: "eyebrow", text: "SUSHEN RESUME WORKBENCH" }));
    copy.append(element("h2", { text: title }));
    copy.append(element("p", { text: description }));
    const status = element("span", { className: "chip", text: "已自动保存在当前浏览器" });
    contentHeader.replaceChildren(copy, headerActions(status));
  }

  function updateSummary() {
    document.getElementById("claimCount").textContent = String(state.claims.length);
    const answers = state.rounds.flatMap(round => round.questions || []).filter(question => question.answer && question.answer.trim()).length;
    document.getElementById("answerCount").textContent = String(answers);
    document.getElementById("coverageValue").textContent = `${calculateCoverage()}%`;
    stepList.querySelectorAll("button").forEach(node => node.classList.toggle("is-active", node.dataset.step === activeStep));
  }

  function render() {
    renderHeader();
    contentPanel.replaceChildren();
    if (activeStep === "intake") renderIntake();
    else if (activeStep === "questions") renderQuestions();
    else if (activeStep === "claims") renderClaims();
    else if (activeStep === "matrix") renderMatrix();
    else renderDefense();
    updateSummary();
  }

  function renderIntake() {
    const template = document.getElementById("intakeTemplate");
    contentPanel.append(template.content.cloneNode(true));
    const form = element("section", { className: "form-card" });
    const grid = element("div", { className: "form-grid" });
    grid.append(
      field("目标岗位", state.target.title, value => { state.target.title = value; }, { placeholder: "例如：跨境电商运营实习生" }),
      field("目标公司（可选）", state.target.company, value => { state.target.company = value; }, { placeholder: "未确定可留空" })
    );
    form.append(grid);
    form.append(field("本轮重点经历 / 公司与岗位", state.target.experience, value => { state.target.experience = value; }, { placeholder: "例如：某公司 · 独立站运营实习生" }));
    form.append(field("完整目标 JD", state.target.jd, value => { state.target.jd = value; }, { multiline: true, tall: true, placeholder: "粘贴职责、任职要求和加分项。系统会拆成 JD Matrix。" }));
    const materialField = field("原始简历或重点经历材料", state.material, value => { state.material = value; }, { multiline: true, tall: true, placeholder: "建议每条事实单独一行：做了什么、对谁做、用了什么方法、留下什么交付物、结果如何。" });
    form.append(materialField);
    form.append(element("p", { className: "field-help", text: "PDF 无法在纯前端可靠还原结构。可以先复制 PDF 文本，或导入已有 resume-data.json。" }));
    const actions = element("div", { className: "button-row" });
    actions.append(
      button("导入 TXT / MD / JSON", "soft", () => materialFile.click()),
      button("载入脱敏示例", "", loadSample),
      button(state.claims.length ? "重新分析并开始拷打" : "开始首轮拷打", "primary", analyzeMaterial)
    );
    form.append(actions);
    contentPanel.append(form);
  }

  function normalizeLine(line) {
    return line.replace(/^\s*(?:[-*•·]|\d+[.)、]|[一二三四五六七八九十]+[、.])\s*/, "").replace(/\s+/g, " ").trim();
  }

  function splitStatements(text) {
    return String(text || "").split(/\r?\n|[；;]/).map(normalizeLine).filter(line => line.length >= 5).slice(0, 60);
  }

  function strongRole(text) {
    return /主导|Owner|从\s*0\s*(?:到|→|->)\s*1|负责人|lead/i.test(text);
  }

  function deliveredWord(text) {
    return /已上线|已落地|取得|提升至|实现|完成上线|正式发布/.test(text);
  }

  function detectClaimType(text) {
    if (/\d+(?:\.\d+)?\s*(?:%|万|亿|倍|人|家|个|次|天|小时)|提升|增长|降低|转化率|GMV|ROI/.test(text)) return "metric_result";
    if (/SOP|流程|文档|方案|报告|清单|机制|模型|原型|PRD|脚本/.test(text)) return "deliverable";
    if (/上线|测试|试点|规划|计划|落地/.test(text)) return "status";
    if (/负责|主导|参与|协助|统筹|推进/.test(text)) return "responsibility";
    if (/分析|设计|搭建|优化|制定|调研|复盘|执行/.test(text)) return "action";
    return "other";
  }

  function detectRole(text) {
    if (strongRole(text)) return "module_owner";
    if (/协调|统筹|项目推进/.test(text)) return "project_coordinator";
    if (/参与|协助|支持|配合/.test(text)) return "module_contributor";
    if (/执行|完成/.test(text)) return "executor";
    return "unknown";
  }

  function detectTense(text) {
    if (/规划|计划|拟|待上线|方案阶段/.test(text)) return "planned";
    if (/测试中|试点|验证中|灰度/.test(text)) return "tested";
    if (/进行中|持续|负责.*运营/.test(text)) return "ongoing";
    if (deliveredWord(text) || /完成|形成|交付|发布/.test(text)) return "delivered";
    return "unknown";
  }

  function detectRisks(text, role, tense) {
    const risks = [];
    const metric = /\d+(?:\.\d+)?\s*(?:%|万|亿|倍|人|家|个|次|天|小时)|提升|增长|降低|转化率|GMV|ROI/.test(text);
    if (metric) risks.push("missing_time_window", "missing_measurement_method");
    if (/%|转化率|率提升|占比/.test(text)) risks.push("missing_denominator");
    if (strongRole(text)) risks.push("strong_role_term");
    if (role === "unknown") risks.push("missing_role_scope");
    if (/团队|我们|共同|协同/.test(text) && metric) risks.push("team_result_attribution");
    if (/使|带来|驱动|促成|实现.*(?:增长|提升|降低)/.test(text)) risks.push("causality_not_established");
    if (tense === "planned" && deliveredWord(text)) risks.push("planned_as_delivered");
    return [...new Set(risks)];
  }

  function createClaim(text, index, verification) {
    const role = detectRole(text);
    const tense = detectTense(text);
    return {
      claim_id: `C-${String(index + 1).padStart(3, "0")}`,
      raw_claim: text,
      normalized_claim: text,
      claim_type: detectClaimType(text),
      role_scope: role,
      tense,
      verification: strongRole(text) ? "unknown" : (verification || "user_attested"),
      risk_flags: detectRisks(text, role, tense),
      notes: "",
      selected: !strongRole(text)
    };
  }

  const CAPABILITIES = [
    ["经营与数据分析", /数据|分析|指标|下钻|Excel|透视|函数|SQL|转化率|漏斗|复盘/i],
    ["运营执行", /运营|执行|落地|活动|项目推进|策略|增长|用户/i],
    ["电商与直播", /电商|直播|TikTok|Shopify|独立站|商品|GMV|达人|KOL|MCN/i],
    ["沟通与协作", /沟通|协作|跨团队|供应商|合作方|机构|推进|协调/i],
    ["英语工作", /英文|英语|English|跨境|海外/i],
    ["行业研究", /研究|调研|行业|生态|竞品|市场/i],
    ["流程与 SOP", /流程|SOP|审核|规范|机制|标准/i],
    ["内容与策划", /内容|策划|脚本|口播|出镜|选题|创作者/i],
    ["产品与工具", /产品|PRD|原型|需求|AI|工具|自动化|测试/i]
  ];

  function concepts(text) {
    return CAPABILITIES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  }

  function parseRequirements(jd) {
    return splitStatements(jd).slice(0, 24).map((text, index) => {
      const preferred = /优先|加分/.test(text);
      const must = /要求|必须|需|熟练|本科|以上|能够|可以使用|实习\d|每周/.test(text);
      const category = preferred ? "preferred" : must ? "must_have" : "core_duty";
      const caps = concepts(text);
      const weight = preferred ? 2 : /核心|负责|策略|分析|必须|熟练/.test(text) ? 5 : must ? 4 : 3;
      return {
        requirement_id: `JD-${String(index + 1).padStart(3, "0")}`,
        original_text: text,
        category,
        capability: caps[0] || "岗位要求",
        business_context: caps.slice(1).join("、"),
        keywords: caps,
        weight,
        evidence_claim_ids: [],
        match_level: "gap",
        match_type: "none",
        rationale: "尚未找到可用事实证据",
        gap: "需要补充对应案例"
      };
    });
  }

  function refreshRequirementMatches() {
    state.requirements.forEach(requirement => {
      const reqConcepts = new Set(concepts(`${requirement.original_text} ${requirement.capability}`));
      const scored = state.claims.map(claim => {
        const overlap = concepts(claim.normalized_claim).filter(item => reqConcepts.has(item)).length;
        return { claim, overlap };
      }).filter(item => item.overlap > 0).sort((a, b) => b.overlap - a.overlap);
      const usable = scored.filter(item => ["source_grounded", "user_attested"].includes(item.claim.verification));
      requirement.evidence_claim_ids = usable.slice(0, 3).map(item => item.claim.claim_id);
      if (!usable.length) {
        requirement.match_level = "gap";
        requirement.match_type = "none";
        requirement.rationale = scored.length ? "存在相关描述，但事实状态尚未确认" : "现有材料未找到对应证据";
        requirement.gap = "需要补充具体场景、个人动作与结果";
      } else if (usable[0].overlap >= 2 && usable[0].claim.role_scope !== "unknown") {
        requirement.match_level = "medium";
        requirement.match_type = "transferable";
        requirement.rationale = `发现可迁移证据：${requirement.evidence_claim_ids.join("、")}`;
        requirement.gap = "自动匹配不等于同市场直接经验，需人工确认业务对象与场景边界";
      } else {
        requirement.match_level = "weak";
        requirement.match_type = "self_reported";
        requirement.rationale = `只有较弱或概括性证据：${requirement.evidence_claim_ids.join("、")}`;
        requirement.gap = "缺少可验证的方法、交付物或结果";
      }
    });
    state.defense = [];
  }

  function analyzeMaterial() {
    const lines = splitStatements(state.material);
    if (!state.target.jd.trim()) return showToast("请先粘贴目标 JD", true);
    if (!lines.length) return showToast("请至少填写一条真实经历", true);
    if (state.claims.length && !window.confirm("重新分析会覆盖当前 Claim、问题与矩阵，是否继续？")) return;
    state.claims = lines.map((line, index) => createClaim(line, index));
    state.requirements = parseRequirements(state.target.jd);
    refreshRequirementMatches();
    state.rounds = [];
    state.currentRound = 0;
    state.stopped = false;
    ensureRound(0);
    saveState();
    navigate("questions");
  }

  function claimQuestionCandidates() {
    const candidates = [];
    state.claims.forEach(claim => {
      if (claim.risk_flags.includes("strong_role_term") || claim.risk_flags.includes("missing_role_scope")) {
        candidates.push({ key: `role-${claim.claim_id}`, category: "role_scope", claimId: claim.claim_id, priority: 100, prompt: `你写了“${shorten(claim.raw_claim)}”。拆开项目后，你本人具体负责哪些模块？谁做最终决策，谁与你协作？`, hint: "回答个人边界、决策权、协作对象；不能确认就写“无法确认”。" });
      }
      if (claim.claim_type === "metric_result" || claim.risk_flags.some(flag => flag.startsWith("missing_") && flag !== "missing_role_scope")) {
        candidates.push({ key: `metric-${claim.claim_id}`, category: "metric_attribution", claimId: claim.claim_id, priority: 95, prompt: `关于“${shorten(claim.raw_claim)}”：数据来自哪个后台，时间窗、分子分母和基线分别是什么？`, hint: "同时说明这是个人结果、团队结果，还是只能证明同期相关变化。" });
      }
      if (claim.risk_flags.includes("team_result_attribution") || claim.risk_flags.includes("causality_not_established")) {
        candidates.push({ key: `cause-${claim.claim_id}`, category: "metric_attribution", claimId: claim.claim_id, priority: 92, prompt: `这个结果为什么可以归因于你？同期还有投放、价格、促销、流量或其他团队动作吗？`, hint: "如果没有对照实验，请明确使用“调整期间观察到”而不是强因果。" });
      }
      if (["planned", "tested", "unknown"].includes(claim.tense)) {
        candidates.push({ key: `status-${claim.claim_id}`, category: "resume_claim", claimId: claim.claim_id, priority: 86, prompt: `“${shorten(claim.raw_claim)}”目前到底处于规划、测试、灰度、上线还是稳定运行？有什么交付物能证明？`, hint: "写清状态、使用对象、采用范围和证据位置。" });
      }
    });
    return candidates;
  }

  function requirementQuestionCandidates() {
    return state.requirements.filter(req => req.weight >= 4 && ["gap", "weak"].includes(req.match_level)).map(req => ({
      key: `jd-${req.requirement_id}`,
      category: /英文|英语|Excel|SQL|工具/.test(req.original_text) ? "language_tool" : "jd_case",
      requirementId: req.requirement_id,
      priority: 80 + req.weight,
      prompt: `JD 高权重要求“${shorten(req.original_text, 54)}”。你是否有一个真实案例能证明？请写场景、个人动作、交付物和结果。`,
      hint: "没有直接经验可以写可迁移案例，但必须说明市场、对象或工具差异。"
    }));
  }

  function shorten(text, max = 42) {
    const clean = String(text || "").trim();
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
  }

  function ensureRound(index) {
    if (state.rounds[index]) return;
    const asked = new Set(state.rounds.flatMap(round => round.questions.map(question => question.key)));
    let candidates = [...claimQuestionCandidates(), ...requirementQuestionCandidates()].filter(item => !asked.has(item.key));
    if (index >= 1) {
      candidates.push(
        { key: "method-general", category: "method_decision", priority: 70, prompt: "挑一项最重要的工作：你为什么采用这个方法？比较过哪些替代方案，取舍依据是什么？", hint: "不要只描述执行步骤，要说判断和取舍。" },
        { key: "evidence-general", category: "resume_claim", priority: 69, prompt: "这段经历留下了哪些可以在面试中说明的证据：后台截图、SOP、文档、版本记录、作品或事实链？", hint: "不要上传隐私材料，只记录证据名称和所在位置。" }
      );
    }
    if (index >= 2) {
      candidates.push(
        { key: "failure-general", category: "failure_reflection", priority: 68, prompt: "这段经历中最失败或最不确定的一次判断是什么？如果重做，你会调整哪个环节？", hint: "写真实复盘，不必把失败包装成成功。" },
        { key: "scope-general", category: "behavioral", priority: 67, prompt: "遇到跨团队或合作方不配合时，你具体如何推进？请给一个有冲突、有动作、有结果的例子。", hint: "区分你推动的部分与他人最终拍板的部分。" }
      );
    }
    candidates = candidates.filter(item => !asked.has(item.key)).sort((a, b) => b.priority - a.priority);
    if (!candidates.length) {
      candidates = [
        { key: `background-${index}`, category: "resume_claim", priority: 50, prompt: "这项工作为什么存在？服务对象是谁，不做会造成什么影响？", hint: "补充背景、对象和真实痛点。" },
        { key: `deliverable-${index}`, category: "method_decision", priority: 49, prompt: "你具体留下了什么可复用交付物？它被谁、在什么场景中采用？", hint: "例如 SOP、分析表、脚本、流程、方案或内容资产。" },
        { key: `result-${index}`, category: "resume_claim", priority: 48, prompt: "没有量化指标时，是否有覆盖范围、采用状态、效率变化或质量改善可以证明结果？", hint: "没有数字也不要编，可以写真实交付与采用。" }
      ];
    }
    state.rounds.push({ round: index + 1, questions: candidates.slice(0, 3).map((item, qIndex) => ({ ...item, id: `Q-${index + 1}-${qIndex + 1}`, answer: "", skipped: false })) });
  }

  function renderQuestions() {
    ensureRound(state.currentRound);
    const round = state.rounds[state.currentRound];
    const banner = element("div", { className: "round-banner" });
    const copy = element("div");
    copy.append(element("strong", { text: `第 ${round.round} 轮 · ${round.questions.length} 个高价值问题` }));
    copy.append(element("p", { text: "优先回答能明确个人边界、数据口径和高权重 JD 缺口的问题。" }));
    banner.append(copy, element("span", { className: "chip", text: state.stopped ? "已停止追问" : "回答后生成下一轮" }));
    contentPanel.append(banner);

    round.questions.forEach((question, index) => {
      const card = element("article", { className: "question-card" });
      const head = element("div", { className: "question-head" });
      const title = element("div", { className: "question-title" });
      title.append(element("h3", { text: question.prompt }), element("p", { text: question.hint }));
      head.append(element("span", { className: "question-number", text: String(index + 1) }), title, element("span", { className: "chip", text: question.category }));
      const answer = element("textarea", { className: "answer-box" });
      answer.value = question.answer || "";
      answer.placeholder = "只写真实事实。不能确认可以明确写“无法确认 / 没有数据”。";
      answer.disabled = question.skipped;
      answer.addEventListener("input", () => { question.answer = answer.value; saveState(); });
      const tools = element("div", { className: "question-tools" });
      const skip = element("label", { className: "check-label" });
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!question.skipped;
      checkbox.addEventListener("change", () => { question.skipped = checkbox.checked; answer.disabled = checkbox.checked; if (checkbox.checked) question.answer = ""; saveState(); });
      skip.append(checkbox, document.createTextNode("无法确认，降级处理"));
      tools.append(skip, element("span", { text: question.claimId || question.requirementId || "经历通用追问" }));
      card.append(head, answer, tools);
      contentPanel.append(card);
    });

    const actions = element("div", { className: "button-row" });
    actions.append(
      button("返回修改材料", "", () => navigate("intake")),
      button("停止追问，按现有证据继续", "soft", stopQuestions),
      button(state.currentRound >= 2 ? "完成拷打，确认事实台账" : "保存回答并生成下一轮", "primary", nextRound)
    );
    contentPanel.append(actions);
  }

  function negativeAnswer(text) {
    return /不知道|不清楚|没有数据|无法确认|记不清|没有证据/.test(text);
  }

  function absorbRoundAnswers(round) {
    if (round.absorbed) return;
    round.questions.forEach(question => {
      if (question.skipped) {
        const linked = state.claims.find(claim => claim.claim_id === question.claimId);
        if (linked) { linked.verification = "unknown"; linked.selected = false; }
        return;
      }
      const answer = String(question.answer || "").trim();
      if (!answer) return;
      const linked = state.claims.find(claim => claim.claim_id === question.claimId);
      if (linked) {
        linked.notes = [linked.notes, `访谈回答（${question.category}）：${answer}`].filter(Boolean).join("\n");
        if (negativeAnswer(answer)) { linked.verification = "unknown"; linked.selected = false; }
        else if (linked.verification === "unknown") linked.verification = "user_attested";
      } else if (!["jd_case", "language_tool"].includes(question.category) && !negativeAnswer(answer)) {
        state.claims.push(createClaim(answer, state.claims.length, "user_attested"));
      }
    });
    round.absorbed = true;
  }

  function nextRound() {
    const round = state.rounds[state.currentRound];
    const completed = round.questions.some(question => question.skipped || String(question.answer || "").trim().length >= 4);
    if (!completed) return showToast("请至少回答或降级处理一个问题", true);
    absorbRoundAnswers(round);
    refreshRequirementMatches();
    if (state.currentRound >= 2) {
      saveState();
      navigate("claims");
      return;
    }
    state.currentRound += 1;
    ensureRound(state.currentRound);
    saveState();
    render();
  }

  function stopQuestions() {
    absorbRoundAnswers(state.rounds[state.currentRound]);
    state.stopped = true;
    refreshRequirementMatches();
    saveState();
    navigate("claims");
  }

  function renderClaims() {
    const intro = element("div", { className: "round-banner" });
    const copy = element("div");
    copy.append(element("strong", { text: `${state.claims.length} 条原子 Claim 待确认` }));
    copy.append(element("p", { text: "只有“材料明确支持”或“本人补充确认”的 Claim 才能进入正式简历。" }));
    intro.append(copy, element("span", { className: "chip", text: "强词必须有角色边界" }));
    contentPanel.append(intro);

    state.claims.forEach((claim, index) => {
      const usable = ["source_grounded", "user_attested"].includes(claim.verification) && claim.selected;
      const card = element("article", { className: `claim-card ${usable ? "is-usable" : "is-risky"}` });
      const headCopy = element("div");
      headCopy.append(element("h3", { text: `${claim.claim_id} · ${usable ? "可进入简历候选池" : "待补证 / 不选用"}` }));
      headCopy.append(element("p", { text: usable ? "仍需遵守角色、归因和时态边界" : "不会自动写入最终简历" }));
      const remove = element("button", { className: "compact-button danger", text: "删除", type: "button" });
      remove.addEventListener("click", () => {
        if (!window.confirm(`删除 ${claim.claim_id}？`)) return;
        state.claims.splice(index, 1);
        reindexClaims();
        refreshRequirementMatches();
        saveState();
        render();
      });
      const head = element("div", { className: "card-head" }, [headCopy, remove]);
      const text = element("textarea", { className: "claim-text" });
      text.value = claim.normalized_claim;
      text.addEventListener("input", () => {
        claim.normalized_claim = text.value;
        claim.claim_type = detectClaimType(text.value);
        if (strongRole(text.value) && !["module_owner", "project_owner"].includes(claim.role_scope)) {
          claim.role_scope = "module_owner";
          claim.verification = "unknown";
          claim.selected = false;
        }
        if (claim.tense === "planned" && deliveredWord(text.value)) {
          claim.verification = "unknown";
          claim.selected = false;
          claim.tense = "unknown";
        }
        claim.risk_flags = detectRisks(text.value, claim.role_scope, claim.tense);
        saveState();
      });
      const meta = element("div", { className: "meta-grid" });
      meta.append(
        metaSelect("事实类型", claim.claim_type, TYPE_OPTIONS, value => { claim.claim_type = value; }),
        metaSelect("个人角色", claim.role_scope, ROLE_OPTIONS, (value, select) => {
          if (strongRole(claim.normalized_claim) && !["module_owner", "project_owner"].includes(value)) {
            select.value = claim.role_scope;
            return showToast("先删除“主导 / Owner / 负责人”等强词，或确认限定 Owner 边界", true);
          }
          claim.role_scope = value;
          claim.risk_flags = detectRisks(claim.normalized_claim, claim.role_scope, claim.tense);
        }),
        metaSelect("项目状态", claim.tense, TENSE_OPTIONS, (value, select) => {
          if (value === "planned" && deliveredWord(claim.normalized_claim)) {
            select.value = claim.tense;
            return showToast("当前句子含已交付表述，请先改成规划时态", true);
          }
          claim.tense = value;
          if (claim.verification === "planned" && value !== "planned") claim.verification = "unknown";
        }),
        metaSelect("证据状态", claim.verification, VERIFICATION_OPTIONS, (value, select) => {
          if (value === "planned" && deliveredWord(claim.normalized_claim)) {
            select.value = claim.verification;
            return showToast("规划内容不能使用“已上线 / 实现 / 提升至”等完成时态", true);
          }
          claim.verification = value;
          if (value === "planned") claim.tense = "planned";
          if (!["source_grounded", "user_attested"].includes(value)) claim.selected = false;
        })
      );
      const selected = element("label", { className: "check-label" });
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!claim.selected;
      checkbox.disabled = !["source_grounded", "user_attested"].includes(claim.verification);
      checkbox.addEventListener("change", () => { claim.selected = checkbox.checked; saveState(); });
      selected.append(checkbox, document.createTextNode("纳入简历候选池"));
      const risks = element("div", { className: "risk-list" });
      (claim.risk_flags.length ? claim.risk_flags : ["无自动风险标记"]).forEach(risk => risks.append(element("span", { className: "risk-chip", text: risk })));
      const notes = field("访谈补充 / 证据位置", claim.notes, value => { claim.notes = value; }, { multiline: true, placeholder: "例如：Shopify 后台截图、SOP 文档、周报；不要上传隐私文件。" });
      card.append(head, text, meta, selected, risks, notes);
      contentPanel.append(card);
    });

    const actions = element("div", { className: "button-row" });
    actions.append(
      button("＋ 新增事实", "", addClaim),
      button("返回继续追问", "soft", () => navigate("questions")),
      button("确认事实，生成 JD 矩阵", "primary", () => { refreshRequirementMatches(); saveState(); navigate("matrix"); })
    );
    contentPanel.append(actions);
  }

  function metaSelect(label, value, choices, onChange) {
    const wrapper = element("label");
    wrapper.append(element("span", { text: label }));
    wrapper.append(selectControl(value, choices, (next, select) => { onChange(next, select); saveState(); }));
    return wrapper;
  }

  function addClaim() {
    state.claims.push(createClaim("新增事实：请改写为一个可独立判断真假的主张", state.claims.length, "unknown"));
    saveState();
    render();
  }

  function reindexClaims() {
    const mapping = new Map();
    state.claims.forEach((claim, index) => {
      const next = `C-${String(index + 1).padStart(3, "0")}`;
      mapping.set(claim.claim_id, next);
      claim.claim_id = next;
    });
    state.requirements.forEach(req => { req.evidence_claim_ids = req.evidence_claim_ids.map(id => mapping.get(id)).filter(Boolean); });
    state.rounds.forEach(round => round.questions.forEach(question => { if (question.claimId) question.claimId = mapping.get(question.claimId) || null; }));
    state.defense = [];
  }

  function calculateCoverage() {
    if (!state.requirements.length) return 0;
    const factors = { strong: 1, medium: .65, weak: .3, gap: 0, conflict: 0 };
    const total = state.requirements.reduce((sum, req) => sum + Number(req.weight || 0), 0);
    const matched = state.requirements.reduce((sum, req) => sum + Number(req.weight || 0) * (factors[req.match_level] || 0), 0);
    return total ? Math.round(matched / total * 100) : 0;
  }

  function renderMatrix() {
    if (!state.requirements.length) state.requirements = parseRequirements(state.target.jd);
    const overview = element("div", { className: "matrix-overview" });
    const score = element("div", { className: "score-card" });
    score.append(element("div", {}, [element("strong", { text: `${calculateCoverage()}%` }), element("span", { text: "现有证据加权覆盖率 · 不是录用概率" })]));
    const counts = countMatches();
    const copy = element("div", { className: "overview-copy" });
    copy.append(element("h3", { text: "自动匹配只做安全初筛" }));
    copy.append(element("p", { text: `强匹配 ${counts.strong} · 可迁移 ${counts.medium} · 弱证据 ${counts.weak} · 缺口 ${counts.gap}` }));
    copy.append(element("p", { text: "系统默认把相关案例标为可迁移，而不是直接经验；只有人工确认同市场、同对象和真实个人边界后，才适合升级。" }));
    overview.append(score, copy);
    contentPanel.append(overview);

    state.requirements.forEach(requirement => {
      const card = element("article", { className: "requirement-card" });
      const head = element("div", { className: "card-head" });
      const title = element("div");
      title.append(element("h3", { text: `${requirement.requirement_id} · ${requirement.capability}` }));
      title.append(element("p", { text: `权重 ${requirement.weight} / 5 · ${requirement.category}` }));
      head.append(title, element("span", { className: `match-badge match-${requirement.match_level}`, text: requirement.match_level }));
      const original = element("p", { className: "requirement-text", text: requirement.original_text });
      const meta = element("div", { className: "meta-grid" });
      meta.append(
        metaSelect("权重", String(requirement.weight), [["1","1"],["2","2"],["3","3"],["4","4"],["5","5"]], value => { requirement.weight = Number(value); }),
        metaSelect("匹配等级", requirement.match_level, [["strong","strong"],["medium","medium"],["weak","weak"],["gap","gap"],["conflict","conflict"]], value => {
          requirement.match_level = value;
          requirement.match_type = value === "strong" ? "direct" : value === "medium" ? "transferable" : value === "weak" ? "self_reported" : "none";
          state.defense = [];
        }),
        metaSelect("匹配类型", requirement.match_type, [["direct","direct"],["transferable","transferable"],["credential_only","credential_only"],["self_reported","self_reported"],["none","none"]], value => { requirement.match_type = value; }),
        metaSelect("类别", requirement.category, [["core_duty","核心职责"],["must_have","硬性要求"],["preferred","加分项"],["context","背景场景"]], value => { requirement.category = value; })
      );
      const evidence = element("div", { className: "requirement-meta" });
      evidence.append(element("span", { className: "chip", text: requirement.evidence_claim_ids.length ? `证据：${requirement.evidence_claim_ids.join("、")}` : "暂无可用 Claim" }));
      evidence.append(element("span", { className: "chip", text: requirement.rationale }));
      if (requirement.gap) evidence.append(element("span", { className: "risk-chip", text: requirement.gap }));
      card.append(head, original, meta, evidence);
      contentPanel.append(card);
    });

    const actions = element("div", { className: "button-row" });
    actions.append(
      button("重新自动匹配", "", () => { refreshRequirementMatches(); saveState(); render(); }),
      button("返回事实台账", "soft", () => navigate("claims")),
      button("生成压力面试问题", "primary", () => { state.defense = generateDefense(); saveState(); navigate("defense"); })
    );
    contentPanel.append(actions);
  }

  function countMatches() {
    const result = { strong: 0, medium: 0, weak: 0, gap: 0, conflict: 0 };
    state.requirements.forEach(req => { result[req.match_level] = (result[req.match_level] || 0) + 1; });
    return result;
  }

  function defenseForClaim(claim, index) {
    const metric = claim.claim_type === "metric_result" || claim.risk_flags.some(flag => /baseline|result|window|denominator|measurement|attribution|causality/.test(flag));
    const role = ["module_owner", "project_owner", "project_coordinator"].includes(claim.role_scope) || claim.risk_flags.includes("strong_role_term");
    const category = metric ? "metric_attribution" : role ? "role_scope" : "resume_claim";
    const primary = metric
      ? `“${shorten(claim.normalized_claim, 58)}”的数据口径、时间窗、样本量和统计后台是什么？`
      : role
        ? `你在“${shorten(claim.normalized_claim, 58)}”中具体负责到什么程度？`
        : `请用具体场景证明简历中的“${shorten(claim.normalized_claim, 58)}”。`;
    return {
      question_id: `IQ-${String(index + 1).padStart(3, "0")}`,
      category,
      claim_ids: [claim.claim_id],
      requirement_ids: linkedRequirements(claim.claim_id),
      resume_anchor: claim.normalized_claim,
      primary_question: primary,
      follow_ups: metric
        ? ["基线与结果分别对应哪组数据？", "如何排除同期其他变量，为什么能归因于你？"]
        : ["谁做最终决策，谁与你协作？", "留下了什么交付物，如何证明已采用？"],
      interviewer_intent: metric ? "判断候选人是否真正理解指标口径与因果边界" : "核验个人责任边界和经历真实性",
      answer_framework: metric
        ? ["先定义统计系统、分子、分母和时间窗", "说明个人负责模块与团队动作", "只陈述可证明的变化与归因边界"]
        : ["先说业务背景和对象", "拆出个人动作、协作方与决策权", "用真实交付物或结果收尾"],
      evidence_to_prepare: metric ? ["后台截图或统计口径", "版本/调整记录", "同期变量说明"] : ["SOP、文档或作品", "协作与推进记录", "可口头复述的事实链"],
      safe_boundary: metric ? "没有严格对照时只说调整期间观察到的变化，不把团队结果写成个人单独带来的增长。" : "只使用已确认的限定角色，不从模块负责升级为整个项目 Owner。",
      risk_level: metric || role ? "high" : "medium",
      status: claim.verification === "unknown" ? "needs_evidence" : "prepare"
    };
  }

  function linkedRequirements(claimId) {
    return state.requirements.filter(req => req.evidence_claim_ids.includes(claimId)).map(req => req.requirement_id);
  }

  function generateDefense() {
    const questions = [];
    const selected = state.claims.filter(claim => claim.selected && ["source_grounded", "user_attested"].includes(claim.verification));
    selected.filter(claim => claim.risk_flags.length || ["module_owner", "project_owner", "project_coordinator"].includes(claim.role_scope)).forEach(claim => questions.push(defenseForClaim(claim, questions.length)));
    state.requirements.filter(req => req.weight >= 4 && ["gap", "weak"].includes(req.match_level)).forEach(req => {
      questions.push({
        question_id: `IQ-${String(questions.length + 1).padStart(3, "0")}`,
        category: /英文|英语|Excel|SQL|工具/.test(req.original_text) ? "language_tool" : "jd_case",
        claim_ids: req.evidence_claim_ids.slice(0, 2),
        requirement_ids: [req.requirement_id],
        resume_anchor: req.original_text,
        primary_question: `JD 要求“${shorten(req.original_text, 64)}”，你会如何用一个真实案例或现场方案证明？`,
        follow_ups: ["这个案例与目标岗位的市场、对象或工具差异是什么？", "如果入职第一周遇到该场景，你会先看哪些数据、找哪些人？"],
        interviewer_intent: "确认高权重岗位缺口是否能通过可迁移能力补足",
        answer_framework: ["承认直接经验边界", "说明可迁移案例中的方法和结果", "给出目标场景下的落地步骤"],
        evidence_to_prepare: ["相关项目案例", "使用过的工具或分析表", "可解释的业务框架"],
        safe_boundary: "不把相邻市场、供应商或普通合作方经验改写成目标市场的直接 MCN/机构经验。",
        risk_level: req.match_level === "gap" ? "high" : "medium",
        status: "needs_evidence"
      });
    });
    if (!questions.length && selected.length) questions.push(defenseForClaim(selected[0], 0));
    return questions;
  }

  function renderDefense() {
    if (!state.defense.length) state.defense = generateDefense();
    const high = state.defense.filter(question => question.risk_level === "high").length;
    const danger = element("div", { className: "danger-zone" });
    danger.append(element("h3", { text: `最危险问题 ${high} 道 · 总计 ${state.defense.length} 道` }));
    danger.append(element("p", { text: "这些不是标准答案，而是面试前必须准备的事实链、证据和不可越过的回答边界。" }));
    contentPanel.append(danger);

    if (!state.defense.length) {
      const empty = element("div", { className: "empty-state" });
      empty.append(element("h3", { text: "暂无可生成的问题" }), element("p", { text: "请先确认至少一条可用 Claim，或保留一个高权重 JD 缺口。" }));
      contentPanel.append(empty);
    }

    state.defense.forEach((question, index) => {
      const card = element("article", { className: `defense-card ${question.risk_level}` });
      const head = element("div", { className: "card-head" });
      const title = element("div");
      title.append(element("h3", { text: `${index + 1}. ${question.primary_question}` }));
      title.append(element("p", { text: `${question.question_id} · ${question.category} · ${question.claim_ids.concat(question.requirement_ids).join(" / ")}` }));
      head.append(title, element("span", { className: "risk-chip", text: `${question.risk_level} risk` }));
      card.append(head);
      card.append(listSection("压力追问", question.follow_ups));
      card.append(listSection("回答骨架", question.answer_framework, true));
      card.append(listSection("准备证据", question.evidence_to_prepare));
      card.append(element("div", { className: "safe-boundary", text: `安全边界：${question.safe_boundary}` }));
      contentPanel.append(card);
    });

    const handoff = element("section", { className: "handoff-card" });
    handoff.append(element("h3", { text: "把拷打结果交给完整 Skill" }));
    handoff.append(element("p", { text: "在线页面负责结构化提问和事实确认；最终定向改写、ASU 排版与 PDF 仍由 $sushen-resume-maker 读取这三个 JSON 后完成。" }));
    const exports = element("div", { className: "export-grid" });
    exports.append(
      button("下载 Claim Ledger", "", () => downloadJson("claim-ledger.json", buildLedger())),
      button("下载 JD Matrix", "", () => downloadJson("jd-matrix.json", buildMatrix())),
      button("下载面试防御", "", () => downloadJson("interview-defense.json", buildDefense()))
    );
    handoff.append(exports);
    const actions = element("div", { className: "button-row" });
    actions.append(
      button("复制给 Codex 的完整指令", "soft", copyHandoff),
      button("带着拷打结果去编辑器", "primary", sendToEditor)
    );
    handoff.append(actions);
    contentPanel.append(handoff);
  }

  function listSection(title, items, ordered = false) {
    const wrap = element("div");
    wrap.append(element("h4", { text: title }));
    const list = element(ordered ? "ol" : "ul");
    items.forEach(item => list.append(element("li", { text: item })));
    wrap.append(list);
    return wrap;
  }

  function buildLedger() {
    const claims = state.claims.map(claim => {
      let verification = claim.verification;
      let tense = claim.tense;
      if (verification === "planned" && tense !== "planned") tense = "planned";
      if (tense === "planned" && deliveredWord(claim.normalized_claim)) { verification = "unknown"; tense = "unknown"; }
      const role = strongRole(claim.normalized_claim) && !["module_owner", "project_owner"].includes(claim.role_scope) ? "module_owner" : claim.role_scope;
      return {
        claim_id: claim.claim_id,
        experience_id: "EXP-001",
        claim_type: claim.claim_type,
        raw_claim: claim.raw_claim,
        normalized_claim: claim.normalized_claim,
        action: claim.normalized_claim,
        methods: [],
        business_object: "",
        deliverables: [],
        result: claim.claim_type.includes("result") ? claim.normalized_claim : "",
        role_scope: role,
        tense,
        verification,
        source_refs: [{ source_id: claim.notes ? "S-002" : "S-001", support_type: "supports", locator: claim.notes ? "在线拷打回答" : "用户粘贴材料", excerpt: shorten(claim.raw_claim, 120) }],
        risk_flags: [...new Set(claim.risk_flags)],
        notes: claim.notes || ""
      };
    });
    const gaps = claims.flatMap(claim => claim.risk_flags.length ? [{
      gap_id: `GAP-${claim.claim_id.slice(2)}`,
      claim_id: claim.claim_id,
      missing_fields: claim.risk_flags,
      impact: "影响角色、指标、时态或结果表述强度",
      recommended_question: recommendedQuestion(claim),
      priority: claim.risk_flags.some(flag => /strong|attribution|causality|denominator/.test(flag)) ? "high" : "medium",
      status: claim.notes ? "answered" : "open"
    }] : []);
    return {
      schema_version: "1.0",
      case_id: CASE_ID,
      sources: [
        { source_id: "S-001", source_type: "other", title: "用户粘贴的原始求职材料", locator: "在线工作台", provided_by: "user", reliability: "candidate_self_statement", contains_private_data: true, notes: "数据仅保存在当前浏览器" },
        { source_id: "S-002", source_type: "user_interview", title: "在线深度拷打回答", locator: "在线工作台", provided_by: "user", reliability: "candidate_self_statement", contains_private_data: true, notes: "用户本人补充" }
      ],
      experiences: [{ experience_id: "EXP-001", experience_type: "other", organization: state.target.experience || "用户材料中的重点经历", team: "", role: "", start_date: "", end_date: "", status: "unknown", source_ids: ["S-001", "S-002"] }],
      claims,
      conflicts: [],
      evidence_gaps: gaps
    };
  }

  function recommendedQuestion(claim) {
    if (claim.claim_type === "metric_result") return "数据的时间窗、分子分母、统计后台和个人归因边界是什么？";
    if (claim.risk_flags.includes("strong_role_term")) return "本人具体负责哪些模块，谁做决策，谁协作？";
    return "这条主张有什么可说明的来源、交付物或采用结果？";
  }

  function normalizedRequirement(req, claimMap) {
    let level = req.match_level;
    let type = req.match_type;
    const evidence = req.evidence_claim_ids.filter(id => ["source_grounded", "user_attested"].includes(claimMap.get(id)?.verification));
    if (level === "strong" && (!evidence.length || type !== "direct")) { level = evidence.length ? "medium" : "gap"; type = evidence.length ? "transferable" : "none"; }
    if (level === "strong" && evidence.some(id => ["unknown", "team_result_only"].includes(claimMap.get(id)?.role_scope))) { level = "medium"; type = "transferable"; }
    if (level === "gap") type = "none";
    if (type === "none" && !["gap", "conflict"].includes(level)) level = "gap";
    return { ...req, evidence_claim_ids: evidence, match_level: level, match_type: type, gap: type === "transferable" ? (req.gap || "需确认目标场景迁移边界") : req.gap };
  }

  function buildMatrix() {
    const ledger = buildLedger();
    const claimMap = new Map(ledger.claims.map(claim => [claim.claim_id, claim]));
    const requirements = state.requirements.map(req => normalizedRequirement(req, claimMap));
    const factors = { strong: 1, medium: .65, weak: .3, gap: 0, conflict: 0 };
    const total = requirements.reduce((sum, req) => sum + Number(req.weight), 0);
    const score = requirements.reduce((sum, req) => sum + Number(req.weight) * factors[req.match_level], 0);
    const counts = { strong: 0, medium: 0, weak: 0, gap: 0, conflict: 0 };
    requirements.forEach(req => { counts[req.match_level] += 1; });
    const questions = requirements.filter(req => req.weight >= 4 && ["gap", "weak"].includes(req.match_level)).map((req, index) => ({
      question_id: `Q-${String(index + 1).padStart(3, "0")}`,
      requirement_id: req.requirement_id,
      claim_ids: req.evidence_claim_ids,
      question: `请提供一个真实案例证明：${req.original_text}`,
      expected_fields: ["business_context", "role_scope", "deliverable", "result"],
      priority: Math.min(1, .55 + req.weight * .09),
      status: "open"
    }));
    const selected = ledger.claims.filter(claim => {
      const source = state.claims.find(item => item.claim_id === claim.claim_id);
      return source?.selected && ["source_grounded", "user_attested"].includes(claim.verification);
    }).map(claim => claim.claim_id);
    return {
      schema_version: "1.0",
      case_id: CASE_ID,
      job: { job_id: "JOB-001", title: state.target.title || "目标岗位", company: state.target.company || "", source_text: state.target.jd, domain: [...new Set(concepts(state.target.jd))], target_markets: [], seniority: /实习/.test(state.target.jd) ? "intern" : "unknown" },
      requirements,
      questions,
      selection: { selected_claim_ids: selected, excluded_claims: ledger.claims.filter(claim => !selected.includes(claim.claim_id)).map(claim => ({ claim_id: claim.claim_id, reason: "未确认、未选用或与 JD 相关度不足" })), selection_policy: "JD相关度40% + 证据完整度25% + 个人责任20% + 结果质量15% - 风险扣分" },
      summary: { weighted_coverage: total ? Math.round(score / total * 10000) / 100 : 0, strong_count: counts.strong, medium_count: counts.medium, weak_count: counts.weak, gap_count: counts.gap, top_strengths: requirements.filter(req => ["strong", "medium"].includes(req.match_level)).slice(0, 3).map(req => req.capability), top_gaps: requirements.filter(req => ["gap", "weak"].includes(req.match_level)).slice(0, 3).map(req => req.capability) }
    };
  }

  function buildDefense() {
    if (!state.defense.length) state.defense = generateDefense();
    return {
      schema_version: "1.0",
      case_id: CASE_ID,
      job_id: "JOB-001",
      generated_from: { claim_ledger: "claim-ledger.json", jd_matrix: "jd-matrix.json", resume_data: "待由 Skill 生成" },
      questions: state.defense,
      summary: { total: state.defense.length, high_risk: state.defense.filter(item => item.risk_level === "high").length, needs_evidence: state.defense.filter(item => item.status === "needs_evidence").length }
    };
  }

  function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`${filename} 已下载`);
  }

  async function copyHandoff() {
    const prompt = [
      "使用 $sushen-resume-maker，读取以下在线拷打结果：",
      "1. 校验 Claim Ledger 与 JD Matrix；",
      "2. 只使用验证通过且被选中的 Claim；",
      "3. 生成一页中文 ASU 简历、resume-data.json 和面试问题清单；",
      "4. 不得把可迁移经验改写成目标市场直接经验；不能确认的内容降级或删除。",
      "",
      "CLAIM_LEDGER:", JSON.stringify(buildLedger(), null, 2),
      "", "JD_MATRIX:", JSON.stringify(buildMatrix(), null, 2),
      "", "INTERVIEW_DEFENSE:", JSON.stringify(buildDefense(), null, 2)
    ].join("\n");
    try {
      await navigator.clipboard.writeText(prompt);
      showToast("完整指令已复制，可直接粘贴给 Codex");
    } catch (_) {
      downloadJson("sushen-handoff.json", { prompt, ledger: buildLedger(), matrix: buildMatrix(), defense: buildDefense() });
    }
  }

  function sendToEditor() {
    localStorage.setItem(HANDOFF_KEY, JSON.stringify({ target: state.target, ledger: buildLedger(), matrix: buildMatrix(), defense: buildDefense(), created_at: new Date().toISOString() }));
    window.location.href = "../editor/?from=interrogation";
  }

  function loadSample() {
    state.target = {
      title: "跨境电商运营实习生",
      company: "示例公司",
      experience: "示例品牌 · 海外运营实习生",
      jd: "负责跨境电商经营数据分析与核心指标拆解\n推动运营策略执行、跨团队协作和项目复盘\n熟练使用 Excel，能够使用英文作为工作语言\n有直播电商、行业研究或海外市场经验优先"
    };
    state.material = "负责海外独立站商品页面运营，分析访问与转化数据\n参与直播策划和口播脚本撰写，与团队完成单场线索获取\n协同多家外部合作方沟通需求，形成入驻流程 SOP 和内容审核 SOP\n搭建 AI 工具测试流程，目前处于小范围测试阶段";
    state.claims = [];
    state.requirements = [];
    state.rounds = [];
    state.defense = [];
    saveState();
    render();
    showToast("已载入脱敏示例，可直接开始拷打");
  }

  function textFromResumeJson(data) {
    const lines = [];
    (data.experience || []).forEach(exp => {
      if (exp.company || exp.team) lines.push([exp.company, exp.team, exp.dates].filter(Boolean).join(" · "));
      (exp.projects || []).forEach(project => {
        if (project.name || project.subtitle) lines.push([project.name, project.subtitle].filter(Boolean).join("："));
        ["background", "impact", "responsibilities"].forEach(key => (project[key] || []).forEach(item => lines.push(typeof item === "string" ? item : item.text || "")));
      });
    });
    ["projects", "open_source"].forEach(key => (data[key] || []).forEach(item => {
      if (item.name || item.project) lines.push(item.name || item.project);
      (item.bullets || []).forEach(bullet => lines.push(typeof bullet === "string" ? bullet : bullet.text || ""));
    }));
    return lines.filter(Boolean).join("\n");
  }

  async function importMaterial(file) {
    try {
      const text = await file.text();
      if (/\.json$/i.test(file.name)) {
        const parsed = JSON.parse(text);
        state.material = textFromResumeJson(parsed) || text;
      } else state.material = text;
      saveState();
      render();
      showToast("材料已导入");
    } catch (error) {
      showToast(error.message || "导入失败", true);
    } finally {
      materialFile.value = "";
    }
  }

  stepList.addEventListener("click", event => {
    const target = event.target.closest("button[data-step]");
    if (target) navigate(target.dataset.step);
  });
  document.getElementById("clearButton").addEventListener("click", () => {
    if (!window.confirm("清除当前浏览器中的全部拷打记录？此操作无法撤销。")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HANDOFF_KEY);
    state = blankState();
    activeStep = "intake";
    render();
    showToast("本地记录已清除");
  });
  materialFile.addEventListener("change", () => { if (materialFile.files[0]) importMaterial(materialFile.files[0]); });

  render();
})();
