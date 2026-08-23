(() => {
  "use strict";

  const STORAGE_KEY = "sushen-interrogation-v1";
  const HANDOFF_KEY = "sushen-evidence-handoff-v1";
  const CASE_ID = "CASE-LOCAL";
  const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.min.mjs";
  const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs";
  const PDFJS_ASSET_ROOT = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/";
  const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_PDF_PAGES = 20;
  const STEPS = ["intake", "questions", "claims", "matrix", "defense"];
  const STEP_META = {
    intake: ["材料与目标 JD", "粘贴真实经历，先拆事实再开始追问"],
    questions: ["能力深挖", "从业务难度、判断、分析、推动、沉淀和结果中补出原简历遗漏的竞争力"],
    claims: ["亮点素材库 · Claim Ledger", "把原始事实与新挖出的能力素材放在一起，最后再做准确性校对"],
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
  let pdfJsPromise = null;
  let tesseractPromise = null;
  let importBusy = false;
  let state = loadState();
  let activeStep = state.activeStep || "intake";

  function blankState() {
    return {
      version: 1,
      activeStep: "intake",
      target: { title: "", company: "", experience: "", jd: "" },
      material: "",
      sources: [],
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
    form.append(element("p", { className: "field-help", text: "支持 PDF、PNG、JPG、WebP、TXT、MD 和 resume-data.json；可一次选择多个文件。" }));
    if ((state.sources || []).length) {
      const sources = element("div", { className: "source-list" });
      state.sources.forEach(source => sources.append(element("span", { className: "source-item" }, [element("b", { text: source.name }), document.createTextNode(`${source.method} · ${source.characters} 字`)])));
      form.append(sources);
    }
    const importStatus = element("div", { className: "import-status" });
    importStatus.id = "importStatus";
    importStatus.hidden = true;
    importStatus.append(element("div", { className: "import-status-text", text: "正在读取材料…" }));
    const track = element("div", { className: "progress-track" });
    const bar = element("div", { className: "progress-bar" });
    bar.id = "importProgressBar";
    track.append(bar);
    importStatus.append(track);
    form.append(importStatus);
    form.append(element("div", { className: "ocr-notice", text: "PDF 文本和 OCR 可能出现错字、断行或漏字。识别完成后必须先校对文本，再开始 Claim Ledger；扫描件识别首次会下载中文/英文 OCR 模型。" }));
    const actions = element("div", { className: "button-row" });
    actions.append(
      button("上传 PDF / 图片 / 文本", "soft", () => { if (!importBusy) materialFile.click(); }),
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

  function createClaim(text, index, verification, origin = "material") {
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
      selected: !strongRole(text),
      origin
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
    state.claims = lines.map((line, index) => createClaim(line, index, undefined, "material"));
    state.requirements = parseRequirements(state.target.jd);
    refreshRequirementMatches();
    state.rounds = [];
    state.currentRound = 0;
    state.stopped = false;
    ensureRound(0);
    saveState();
    navigate("questions");
  }

  function experienceOpportunityCandidates() {
    const candidates = [];
    state.claims.filter(claim => claim.origin === "material").forEach(claim => {
      const text = claim.normalized_claim;
      if (/数据|分析|指标|下钻|Excel|透视|函数|SQL|转化率|漏斗|复盘/i.test(text)) {
        candidates.push({ key: `insight-${claim.claim_id}`, dimension: "分析与洞察", category: "insight", claimId: claim.claim_id, priority: 124, prompt: `你写了“${shorten(text)}”。当时具体看了哪些数据或反馈？你发现了什么问题，这个发现最终改变了哪个运营动作或决策？`, hint: "重点不是罗列后台，而是“看到了什么—如何判断—推动了什么变化”。" });
      }
      if (/SOP|流程|审核|规范|机制|标准|清单/i.test(text)) {
        candidates.push({ key: `system-${claim.claim_id}`, dimension: "流程沉淀", category: "systemization", claimId: claim.claim_id, priority: 122, prompt: `关于“${shorten(text)}”：做这套流程前最混乱、最耗时或最容易出错的环节是什么？你设计了哪些关键节点，后来谁在使用？`, hint: "这里可能藏着流程设计、标准化和规模化协作能力。" });
      }
      if (/沟通|协作|跨团队|供应商|旅行社|合作方|机构|推进|协调/i.test(text)) {
        candidates.push({ key: `influence-${claim.claim_id}`, dimension: "沟通与推动", category: "influence", claimId: claim.claim_id, priority: 120, prompt: `“${shorten(text)}”背后最难协调的一次需求或冲突是什么？你如何分类需求、统一标准或推动对方行动，最后形成了什么结果？`, hint: "挖的是影响力、优先级判断和复杂协作，不只是“日常沟通”。" });
      }
      if (/直播|内容|脚本|口播|出镜|选题|创作者|达人/i.test(text)) {
        candidates.push({ key: `content-${claim.claim_id}`, dimension: "用户与内容判断", category: "decision", claimId: claim.claim_id, priority: 118, prompt: `在“${shorten(text)}”中，你如何判断受众、商品卖点和内容节奏？有没有一次基于表现或反馈调整脚本/直播方案的具体例子？`, hint: "这里可能藏着用户洞察、内容策略和快速迭代能力。" });
      }
      if (/电商|Shopify|TikTok|独立站|商品页|转化|GMV|投放/i.test(text)) {
        candidates.push({ key: `commerce-${claim.claim_id}`, dimension: "经营与转化", category: "insight", claimId: claim.claim_id, priority: 116, prompt: `针对“${shorten(text)}”，你会怎样拆解从流量到成交的链路？实际发现过哪个关键卡点，并做过什么页面、内容或运营调整？`, hint: "挖出经营意识、漏斗分析和动作闭环。" });
      }
      if (/AI|数字人|工具|自动化|产品|需求|测试|JobPilot/i.test(text)) {
        candidates.push({ key: `product-${claim.claim_id}`, dimension: "产品与创新", category: "method_decision", claimId: claim.claim_id, priority: 114, prompt: `“${shorten(text)}”解决的是谁的什么问题？你如何定义流程、设计测试、收集反馈并决定下一步迭代？`, hint: "挖出需求判断、产品化思维和从想法到验证的能力。" });
      }
    });
    return candidates;
  }

  function hiddenJdCandidates() {
    return state.requirements.filter(req => req.weight >= 4 && ["gap", "weak"].includes(req.match_level)).map(req => ({
      key: `hidden-jd-${req.requirement_id}`,
      dimension: "岗位潜力",
      category: /英文|英语|Excel|SQL|工具/.test(req.original_text) ? "language_tool" : "jd_case",
      requirementId: req.requirement_id,
      priority: 88 + req.weight,
      prompt: `目标岗位重视“${shorten(req.original_text, 54)}”。回想你的课程、项目、实习或个人尝试，有没有一个原简历没写、但能证明这项能力的真实案例？`,
      hint: "可以是小案例，重点写清你如何思考和解决问题；没有就跳过，不硬凑。"
    }));
  }

  function generalAbilityCandidates(roundIndex) {
    if (roundIndex === 0) return [
      { key: "hardest-general", dimension: "复杂问题", category: "complexity", priority: 112, prompt: "这段经历里最难、最复杂、最需要你动脑的一件事是什么？为什么难，你是怎样一步步拆解的？", hint: "不要挑工作量最大的一件事，挑最能体现判断和解决问题能力的一件事。" },
      { key: "initiative-general", dimension: "主动性", category: "initiative", priority: 110, prompt: "有没有一件事不是别人明确交代，而是你自己发现问题、提出优化并推动发生的？当时你看到了什么信号？", hint: "这里经常能挖出自驱力、业务敏感度和改进意识。" },
      { key: "beyond-execution-general", dimension: "判断与取舍", category: "decision", priority: 108, prompt: "在这段经历中，你做过哪些不只是“照着执行”的判断或取舍？为什么选择这个方案，而不是其他做法？", hint: "比较方案、约束和取舍，能把执行经历写出思考含量。" }
    ];
    if (roundIndex === 1) return [
      { key: "method-general", dimension: "方法论", category: "method_decision", priority: 106, prompt: "挑一个你反复做过的任务：你后来有没有总结出一套更高效的方法、模板或检查清单？它比最初做法好在哪里？", hint: "挖出方法沉淀、学习速度和可复制性。" },
      { key: "influence-general", dimension: "影响力", category: "influence", priority: 104, prompt: "有没有一次你没有正式决策权，却需要让同事、合作方或其他团队接受你的方案？你用了什么信息或方式推动？", hint: "挖出无权影响、沟通策略和推进结果。" },
      { key: "learning-general", dimension: "快速学习", category: "learning", priority: 102, prompt: "为了完成这段经历中的任务，你最快补上的一项新知识或新工具是什么？你如何学、如何验证自己真的会用？", hint: "不要只写“学习能力强”，要找真实的学习—应用闭环。" }
    ];
    return [
      { key: "impact-general", dimension: "业务影响", category: "impact", priority: 104, prompt: "如果没有漂亮的增长数字，这段经历还有哪些结果能证明价值：覆盖范围、采用情况、交付速度、错误减少、协作效率或用户反馈？", hint: "真实的定性结果也能形成有竞争力的简历 bullet。" },
      { key: "asset-general", dimension: "可复用资产", category: "systemization", priority: 102, prompt: "这段经历最终留下了哪些别人可以继续使用的东西？例如 SOP、分析框架、模板、脚本、内容方法、项目机制或知识沉淀。", hint: "可复用资产能把一次性执行升级为体系化能力。" },
      { key: "headline-general", dimension: "核心竞争力", category: "summary", priority: 100, prompt: "如果面试官只能记住这段经历的一点，你希望是哪项能力？请用一个具体事实证明，而不是只写能力词。", hint: "答案会成为简历中最值得保留的核心 bullet 候选。" }
    ];
  }

  function finalAccuracyCandidate() {
    const risky = state.claims.find(claim => claim.origin === "material" && (strongRole(claim.normalized_claim) || claim.claim_type === "metric_result"));
    if (!risky) return [];
    return [{
      key: `accuracy-${risky.claim_id}`,
      dimension: "准确性校对",
      category: "accuracy_check",
      claimId: risky.claim_id,
      priority: 70,
      prompt: `最后为了把亮点写得有分量又准确，请补充“${shorten(risky.normalized_claim)}”中你真正做出的关键贡献、数据来源或可确认范围。`,
      hint: "这是最后的事实校对，不是本轮能力深挖的重点；不确定部分可以明确删掉或降级。"
    }];
  }

  function shorten(text, max = 42) {
    const clean = String(text || "").trim();
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
  }

  function answerFollowupCandidates() {
    const answers = state.rounds.flatMap(round => round.questions).map(question => question.answer || "").join("\n");
    const candidates = [];
    if (/数据|指标|分析|后台|转化|漏斗/.test(answers)) candidates.push({ key: "followup-insight", dimension: "分析到决策", category: "insight", priority: 130, prompt: "你刚才提到了数据或指标。请挑一个最关键的发现：它与原先判断有什么不同，你据此做了什么决策，后来怎样验证方向是对的？", hint: "把“会看数据”升级成“能用数据发现问题并推动决策”。" });
    if (/沟通|协调|供应商|合作方|跨团队|同事/.test(answers)) candidates.push({ key: "followup-influence", dimension: "推动与影响", category: "influence", priority: 128, prompt: "你刚才提到多人协作。哪一次推进最能体现你的影响力？对方最初为什么不配合，你用了什么方法让事情继续向前？", hint: "补出阻力、策略和结果，而不是停留在“负责沟通”。" });
    if (/SOP|流程|模板|清单|规范|标准|沉淀/.test(answers)) candidates.push({ key: "followup-system", dimension: "体系化", category: "systemization", priority: 126, prompt: "你刚才提到流程或沉淀。它解决了哪些重复问题？关键规则是谁提出的，后来被多少人或哪些场景持续使用？", hint: "把一次性交付挖成可复制的流程建设能力。" });
    if (/用户|客户|受众|反馈|需求|达人|商家/.test(answers)) candidates.push({ key: "followup-user", dimension: "用户洞察", category: "insight", priority: 124, prompt: "你刚才提到了用户或需求。你怎样判断真实需求，而不是只接收表面反馈？有没有因此调整方案的例子？", hint: "补出洞察来源、判断逻辑和方案变化。" });
    return candidates;
  }

  function pickDiverseQuestions(candidates, count) {
    const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
    const picked = [];
    const dimensions = new Set();
    sorted.forEach(item => {
      if (picked.length >= count || dimensions.has(item.dimension)) return;
      picked.push(item);
      dimensions.add(item.dimension);
    });
    sorted.forEach(item => {
      if (picked.length >= count || picked.includes(item)) return;
      picked.push(item);
    });
    return picked;
  }

  function ensureRound(index) {
    if (state.rounds[index]) return;
    const asked = new Set(state.rounds.flatMap(round => round.questions.map(question => question.key)));
    const experience = experienceOpportunityCandidates();
    const jd = hiddenJdCandidates();
    let candidates;
    if (index === 0) candidates = [...experience, ...generalAbilityCandidates(0), ...jd];
    else if (index === 1) candidates = [...answerFollowupCandidates(), ...generalAbilityCandidates(1), ...experience, ...jd];
    else candidates = [...generalAbilityCandidates(2), ...answerFollowupCandidates(), ...finalAccuracyCandidate()];
    candidates = candidates.filter(item => !asked.has(item.key));
    if (!candidates.length) {
      candidates = [
        { key: `background-${index}`, dimension: "业务理解", category: "context", priority: 50, prompt: "这项工作为什么存在？真正服务的对象是谁，对业务最重要的问题是什么？", hint: "补出业务背景，避免简历只剩任务清单。" },
        { key: `decision-${index}`, dimension: "主动判断", category: "decision", priority: 49, prompt: "过程中哪一个判断最能体现你的思考，而不是照着执行？你当时有哪些约束和备选方案？", hint: "补出选择依据和解决问题能力。" },
        { key: `result-${index}`, dimension: "实际影响", category: "impact", priority: 48, prompt: "除了数字，这项工作还带来了哪些真实变化：被采用、减少返工、缩短周期、提升协作或改善体验？", hint: "定性结果也可以有竞争力，但必须具体。" }
      ];
    }
    const picked = pickDiverseQuestions(candidates, 3);
    state.rounds.push({ round: index + 1, questions: picked.map((item, qIndex) => ({ ...item, id: `Q-${index + 1}-${qIndex + 1}`, answer: "", skipped: false })) });
  }

  function renderQuestions() {
    ensureRound(state.currentRound);
    const round = state.rounds[state.currentRound];
    const banner = element("div", { className: "round-banner" });
    const copy = element("div");
    copy.append(element("strong", { text: `第 ${round.round} 轮 · ${round.questions.length} 个高价值问题` }));
    copy.append(element("p", { text: "优先回忆具体案例，把原简历没写出的判断、方法、复杂度和影响补出来。" }));
    banner.append(copy, element("span", { className: "chip", text: state.stopped ? "已停止深挖" : "回答会沉淀为新亮点" }));
    contentPanel.append(banner);

    round.questions.forEach((question, index) => {
      const card = element("article", { className: "question-card" });
      const head = element("div", { className: "question-head" });
      const title = element("div", { className: "question-title" });
      title.append(element("h3", { text: question.prompt }), element("p", { text: question.hint }));
      head.append(element("span", { className: "question-number", text: String(index + 1) }), title, element("span", { className: "chip", text: question.dimension || question.category }));
      const answer = element("textarea", { className: "answer-box" });
      answer.value = question.answer || "";
      answer.placeholder = "尽量写一个具体场景：当时的问题、你的判断和动作、最后发生了什么。暂时想不到可以跳过。";
      answer.disabled = question.skipped;
      answer.addEventListener("input", () => { question.answer = answer.value; saveState(); });
      const tools = element("div", { className: "question-tools" });
      const skip = element("label", { className: "check-label" });
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!question.skipped;
      checkbox.addEventListener("change", () => { question.skipped = checkbox.checked; answer.disabled = checkbox.checked; if (checkbox.checked) question.answer = ""; saveState(); });
      skip.append(checkbox, document.createTextNode("暂时想不到，跳过这一题"));
      tools.append(skip, element("span", { text: question.claimId || question.requirementId || "能力挖掘题" }));
      card.append(head, answer, tools);
      contentPanel.append(card);
    });

    const actions = element("div", { className: "button-row" });
    actions.append(
      button("返回修改材料", "", () => navigate("intake")),
      button("先停止深挖，按现有素材继续", "soft", stopQuestions),
      button(state.currentRound >= 2 ? "完成深挖，整理亮点素材" : "保存回答并继续深挖", "primary", nextRound)
    );
    contentPanel.append(actions);
  }

  function negativeAnswer(text) {
    return /不知道|不清楚|没有数据|无法确认|记不清|没有证据/.test(text);
  }

  function hypotheticalAnswer(question, text) {
    return ["jd_case", "language_tool"].includes(question.category) && /如果|假设|应该会|我会先|可能会/.test(text);
  }

  function normalizedAnswerKey(text) {
    return String(text || "").replace(/\\s+/g, "").replace(/[，。；、,.!?！？：:]/g, "").toLowerCase();
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
        linked.notes = [linked.notes, `第 ${round.round} 轮「${question.dimension || question.category}」补充：${answer}`].filter(Boolean).join("\n");
        if (negativeAnswer(answer)) { linked.verification = "unknown"; linked.selected = false; }
        else if (linked.verification === "unknown") linked.verification = "user_attested";
      }

      if (negativeAnswer(answer) || hypotheticalAnswer(question, answer)) return;
      const duplicate = state.claims.some(claim => normalizedAnswerKey(claim.normalized_claim) === normalizedAnswerKey(answer));
      if (duplicate) return;
      const discovered = createClaim(answer, state.claims.length, "user_attested", "interview");
      discovered.notes = `由第 ${round.round} 轮「${question.dimension || question.category}」能力深挖补充；请改写为“行动＋方法＋结果”的简历表达。`;
      discovered.selected = true;
      state.claims.push(discovered);
    });
    round.absorbed = true;
  }

  function nextRound() {
    const round = state.rounds[state.currentRound];
    const completed = round.questions.some(question => question.skipped || String(question.answer || "").trim().length >= 4);
    if (!completed) return showToast("请至少回答或跳过一个问题", true);
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
    const discoveredCount = state.claims.filter(claim => claim.origin === "interview").length;
    const materialCount = state.claims.length - discoveredCount;
    const intro = element("div", { className: "round-banner" });
    const copy = element("div");
    copy.append(element("strong", { text: `原始素材 ${materialCount} 条 · 深挖新增 ${discoveredCount} 条` }));
    copy.append(element("p", { text: "这里把回答沉淀成简历亮点素材。优先保留能证明判断、方法、推动和影响的内容，再做一次准确性校对。" }));
    intro.append(copy, element("span", { className: "chip", text: "目标：发现原简历遗漏的竞争力" }));
    contentPanel.append(intro);

    state.claims.forEach((claim, index) => {
      const usable = ["source_grounded", "user_attested"].includes(claim.verification) && claim.selected;
      const discovered = claim.origin === "interview";
      const card = element("article", { className: `claim-card ${usable ? "is-usable" : "is-risky"} ${discovered ? "is-discovered" : ""}` });
      const headCopy = element("div");
      headCopy.append(element("h3", { text: `${claim.claim_id} · ${discovered ? "深挖新增亮点" : "原始材料事实"}` }));
      headCopy.append(element("p", { text: usable ? (discovered ? "已进入候选池，可继续压缩为有竞争力的简历 bullet" : "已进入候选池，可与深挖答案组合改写") : "待确认后再纳入简历" }));
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
      const abilityTags = discovered ? concepts(claim.normalized_claim).slice(0, 4) : [];
      abilityTags.forEach(tag => risks.append(element("span", { className: "ability-chip", text: tag })));
      (claim.risk_flags.length ? claim.risk_flags : ["准确性校对通过"]).forEach(risk => risks.append(element("span", { className: "risk-chip", text: risk })));
      const notes = field("访谈补充 / 证据位置", claim.notes, value => { claim.notes = value; }, { multiline: true, placeholder: "例如：Shopify 后台截图、SOP 文档、周报；不要上传隐私文件。" });
      card.append(head, text, meta, selected, risks, notes);
      contentPanel.append(card);
    });

    const actions = element("div", { className: "button-row" });
    actions.append(
      button("＋ 新增事实", "", addClaim),
      button("返回继续深挖", "soft", () => navigate("questions")),
      button("确认亮点，生成 JD 矩阵", "primary", () => { refreshRequirementMatches(); saveState(); navigate("matrix"); })
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
      button("返回亮点素材库", "soft", () => navigate("claims")),
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
    state.sources = [{ name: "脱敏示例", method: "内置文本", characters: state.material.length }];
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

  function setImportStatus(message, progress = 0, isError = false) {
    const box = document.getElementById("importStatus");
    if (!box) return;
    box.hidden = false;
    box.classList.toggle("is-error", isError);
    const label = box.querySelector(".import-status-text");
    const bar = document.getElementById("importProgressBar");
    if (label) label.textContent = message;
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }

  async function ensurePdfJs() {
    if (!pdfJsPromise) {
      pdfJsPromise = import(PDFJS_URL).then(module => {
        module.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return module;
      });
    }
    return pdfJsPromise;
  }

  function loadExternalScript(url) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-library-url="${url}"]`);
      if (existing) {
        if (window.Tesseract) resolve();
        else existing.addEventListener("load", resolve, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.dataset.libraryUrl = url;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error("OCR 组件加载失败，请检查网络后重试")), { once: true });
      document.head.append(script);
    });
  }

  async function ensureTesseract() {
    if (!tesseractPromise) {
      tesseractPromise = loadExternalScript(TESSERACT_URL).then(() => {
        if (!window.Tesseract) throw new Error("OCR 组件初始化失败");
        return window.Tesseract;
      });
    }
    return tesseractPromise;
  }

  function translateOcrStatus(status) {
    const labels = {
      "loading tesseract core": "加载 OCR 核心",
      "initializing tesseract": "初始化 OCR",
      "loading language traineddata": "下载中英文识别模型",
      "initializing api": "准备识别引擎",
      "recognizing text": "识别文字"
    };
    return labels[status] || status || "正在识别";
  }

  async function createOcrWorker(workerContext, totalFiles) {
    const Tesseract = await ensureTesseract();
    return Tesseract.createWorker(["chi_sim", "eng"], 1, {
      logger: event => {
        const within = Number(event.progress || 0);
        const overall = ((workerContext.position + within) / totalFiles) * 100;
        setImportStatus(`${translateOcrStatus(event.status)} · ${Math.round(within * 100)}%`, overall);
      }
    });
  }

  function textFromPdfItems(items) {
    return items.map(item => `${item.str || ""}${item.hasEOL ? "\n" : " "}`).join("").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
  }

  async function renderPdfPage(page) {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.4, 2200 / Math.max(1, base.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas;
  }

  async function extractPdf(file, workerContext, filePosition, totalFiles) {
    const pdfjs = await ensurePdfJs();
    setImportStatus(`解析 PDF：${file.name}`, (filePosition / totalFiles) * 100);
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: `${PDFJS_ASSET_ROOT}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_ASSET_ROOT}standard_fonts/`,
      wasmUrl: `${PDFJS_ASSET_ROOT}wasm/`
    }).promise;
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`PDF 共 ${pdf.numPages} 页，超过在线识别上限 ${MAX_PDF_PAGES} 页`);
    const pages = [];
    let ocrPages = 0;
    for (let index = 1; index <= pdf.numPages; index += 1) {
      setImportStatus(`读取 ${file.name} · 第 ${index}/${pdf.numPages} 页`, ((filePosition + (index - 1) / pdf.numPages) / totalFiles) * 100);
      const page = await pdf.getPage(index);
      const direct = textFromPdfItems((await page.getTextContent()).items || []);
      if (direct.replace(/\s/g, "").length >= 30) {
        pages.push(`【第 ${index} 页】\n${direct}`);
      } else {
        workerContext.position = filePosition;
        if (!workerContext.worker) workerContext.worker = await createOcrWorker(workerContext, totalFiles);
        const canvas = await renderPdfPage(page);
        const result = await workerContext.worker.recognize(canvas);
        pages.push(`【第 ${index} 页 · OCR】\n${String(result.data?.text || "").trim()}`);
        ocrPages += 1;
      }
      page.cleanup();
    }
    return { text: pages.join("\n\n"), method: ocrPages ? `PDF文本+OCR（${ocrPages}/${pdf.numPages}页）` : `PDF文本提取（${pdf.numPages}页）` };
  }

  async function extractImage(file, workerContext, filePosition, totalFiles) {
    workerContext.position = filePosition;
    if (!workerContext.worker) workerContext.worker = await createOcrWorker(workerContext, totalFiles);
    setImportStatus(`OCR 识别图片：${file.name}`, (filePosition / totalFiles) * 100);
    const result = await workerContext.worker.recognize(file);
    return { text: String(result.data?.text || "").trim(), method: "图片 OCR" };
  }

  async function extractFile(file, workerContext, filePosition, totalFiles) {
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} 超过 20MB 上限`);
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return extractPdf(file, workerContext, filePosition, totalFiles);
    if (file.type.startsWith("image/") || /\.(?:png|jpe?g|webp|bmp)$/i.test(file.name)) return extractImage(file, workerContext, filePosition, totalFiles);
    const raw = await file.text();
    if (file.type === "application/json" || /\.json$/i.test(file.name)) {
      const parsed = JSON.parse(raw);
      return { text: textFromResumeJson(parsed) || raw, method: "结构化 JSON" };
    }
    return { text: raw, method: "文本读取" };
  }

  async function importMaterials(files) {
    const list = [...files].slice(0, 10);
    if (!list.length || importBusy) return;
    importBusy = true;
    const workerContext = { worker: null, position: 0 };
    const extracted = [];
    const errors = [];
    try {
      for (let index = 0; index < list.length; index += 1) {
        const file = list[index];
        try {
          const result = await extractFile(file, workerContext, index, list.length);
          if (!result.text.replace(/\s/g, "")) throw new Error(`${file.name} 未识别出文字`);
          extracted.push({ file, ...result });
        } catch (error) {
          errors.push(error.message || `${file.name} 读取失败`);
        }
      }
    } finally {
      if (workerContext.worker) await workerContext.worker.terminate();
      importBusy = false;
      materialFile.value = "";
    }
    extracted.forEach(item => {
      const block = `【来源：${item.file.name}｜${item.method}】\n${item.text.trim()}`;
      state.material = [state.material.trim(), block].filter(Boolean).join("\n\n");
      state.sources.push({ name: item.file.name, method: item.method, characters: item.text.trim().length });
    });
    saveState();
    render();
    if (errors.length) {
      setImportStatus(`已完成 ${extracted.length} 个文件；${errors.join("；")}`, extracted.length ? 100 : 0, true);
      showToast(`部分文件未完成：${errors[0]}`, true);
    } else {
      setImportStatus(`已识别 ${extracted.length} 个文件，请先校对文本再开始拷打`, 100);
      showToast("材料识别完成，请先校对文本");
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
  materialFile.addEventListener("change", () => { if (materialFile.files.length) importMaterials(materialFile.files); });

  render();
})();
