(() => {
  "use strict";

  const TEMPLATE_URL = "../skills/sushen-resume-maker/assets/resume_template.html?v=20260824-awards-skills";
  const EDITOR_STORAGE_KEY = "sushen-resume-editor-v1";
  const SOURCE_STORAGE_KEY = "sushen-source-resume-v1";
  const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.min.mjs";
  const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs";
  const PDFJS_ASSET_ROOT = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/";
  const MAMMOTH_URL = "https://cdn.jsdelivr.net/npm/mammoth@1.10.0/mammoth.browser.min.js";
  const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";
  const ALLOWED_FILE = /\.(pdf|docx)$/i;
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_PDF_PAGES = 20;
  const SECTION_RULES = [
    ["education", /^(教育背景|教育经历|教育)$/i],
    ["experience", /^(实习经历|工作经历|工作经验|职业经历|实践经历|新媒体经历|新媒体经验|自媒体经历|自媒体经验|内容创作经历)$/i],
    ["projects", /^(项目经历|项目经验|科研经历|课题经历|创业经历)$/i],
    ["skills", /^(专业技能|技能证书|技能及证书|技能奖项|技能|语言及技能|能力与技能)$/i],
    ["awards", /^(荣誉奖项|奖项荣誉|获奖经历|奖项|荣誉)$/i]
  ];
  const ROLE_PATTERN = /(产品(?:经理|运营|实习生)?|策略运营|内容运营|用户运营|商业运营|电商运营|独立站运营|跨境(?:电商|运营)|数据分析(?:师)?|市场(?:营销|运营)?|新媒体运营|工程师|设计师|研究员|顾问|编辑|记者|实习生|Intern|Manager|Engineer|Analyst|Designer|Researcher)/i;
  const COMPANY_PATTERN = /(公司|集团|科技|网络|传媒|工作室|事务所|银行|证券|基金|研究院|实验室|中心|平台|字节|腾讯|阿里|美团|携程|亚马逊|Amazon|ByteDance|TikTok|Shopify|Tesla)/i;
  const DEGREE_PATTERN = /(博士|硕士|本科|学士|专科|Ph\.?D|Master|Bachelor|MBA)/i;
  const DATE_PATTERN = /(?:19|20)\d{2}(?:[./年-]\d{1,2})?(?:\s*(?:-|–|—|至|~|～)\s*(?:(?:19|20)?\d{2}(?:[./年-]\d{1,2})?|至今|现在|Present))?/i;
  const NUMBER_PATTERN = /\d+(?:\.\d+)?(?:%|\+|万\+?|亿|次|家|人|个|天|月|年|小时|分钟|分|项|条|份|元|万元|美元|单|场)?/g;
  const TOOL_NAMES = [
    "Excel", "SQL", "Python", "Tableau", "Power BI", "Axure", "Figma", "SPSS",
    "R", "TikTok", "TikTok Shop", "Shopify", "Google Analytics", "GA4", "Coze",
    "ChatGPT", "Codex", "Prompt Engineering", "AIGC", "AI Agent", "Photoshop",
    "Illustrator", "Premiere", "Final Cut Pro", "VLOOKUP"
  ];
  const $ = id => document.getElementById(id);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  let selectedFile = null;
  let originalFileUrl = "";
  let templateHtml = "";
  let sourceResume = null;
  let optimizedResume = null;
  let pdfjsPromise = null;
  let mammothPromise = null;
  let tesseractPromise = null;
  let ocrWorker = null;
  let extractedText = "";
  let extractionReport = null;
  let extractionMethod = "";
  let sourceConfirmed = false;
  let importBusy = false;
  let photoCandidates = [];
  let selectedPhoto = null;
  let projectGroupingDraft = null;
  let projectGroupingConfirmed = false;
  let toastTimer = 0;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
  }

  function revokeOriginalFileUrl() {
    if (!originalFileUrl) return;
    URL.revokeObjectURL(originalFileUrl);
    originalFileUrl = "";
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  function sourceFact(text, fileName, index, verification) {
    return {
      text: text,
      raw_text: text,
      verification: verification || "source_grounded",
      source_note: fileName,
      claim_ids: ["SOURCE-" + String(index).padStart(3, "0")],
      highlights: detectHighlights(text)
    };
  }

  function detectHighlights(text) {
    const values = String(text || "").match(/\d+(?:\.\d+)?(?:%|\+|万\+?|亿|次|家|人|个|天|月|年|小时|分钟|项|条|份|元|万元|美元|单|场)?|GMV|CTR|CVR|SQL|AI Agent|SOP|A\/B Test(?:ing)?|Python|Excel|Prompt Engineering/gi) || [];
    return [...new Set(values.map(item => item.trim()).filter(Boolean))];
  }

  function projectKeywords(facts) {
    const text = (facts || []).map(item => item.text || item).join(" ");
    const values = [...toolMatches(text)];
    const tokens = text.match(/TikTok(?: Live| Shop)?|Shopify|Google Analytics|PCU|ACU|PV|UV|CTR|CVR|GMV|GPM|GPH|DM|WhatsApp|MVP|SOP|A\/B(?:测试| Test(?:ing)?)?|Prompt(?: Engineering)?|AI Agent|Coze Agent|AIGC|用户画像|内容复盘|标题测试|私域转化|内容生产流程/gi) || [];
    tokens.forEach(token => {
      const value = token.trim();
      if (!values.some(item => item.toLowerCase() === value.toLowerCase())) values.push(value);
    });
    (facts || []).forEach(item => {
      const label = String(item.text || item).match(/^([^：:]{3,18})[：:]/);
      if (label && !values.includes(label[1])) values.push(label[1]);
    });
    return values.slice(0, 12);
  }

  function experienceFacts(exp) {
    return (exp.projects || []).flatMap(project => ["background", "impact", "responsibilities", "actions"].flatMap(key => project[key] || []));
  }

  function suggestedProjectName(facts, exp) {
    const text = (facts || []).map(item => item.text || item).join(" ");
    if (/AI|AIGC|Agent|数字人|Prompt|Coze/i.test(text)) return /数字人/.test(text) ? "AI 数字人直播与内容生产探索" : "AI 工具应用与内容生产提效";
    if (/Shopify|独立站/i.test(text)) return "Shopify 独立站转化与履约链路优化";
    if (/直播|TikTok|PCU|ACU|DM|留资/i.test(text)) return "直播增长链路与数据监测闭环";
    if (/小红书|私域|内容增长|用户画像/i.test(text)) return "内容增长与用户运营闭环";
    const label = text.match(/^([^：:]{3,22})[：:]/);
    return label ? label[1] : (exp.team || exp.company || "业务项目");
  }

  function initializeProjectGrouping(source) {
    return {
      experiences: (source.experience || []).map((exp, expIndex) => {
        const facts = experienceFacts(exp).map((fact, index) => ({
          fact: clone(fact),
          id: fact.claim_ids && fact.claim_ids[0] || `EXP-${expIndex}-${index}`,
          groupId: ""
        }));
        const aiFacts = facts.filter(item => /AI|AIGC|Agent|数字人|Prompt|Coze/i.test(item.fact.text || ""));
        const coreFacts = facts.filter(item => !aiFacts.includes(item));
        const splitAi = aiFacts.length > 0 && coreFacts.length >= 2;
        const groups = [];
        const addGroup = (groupFacts, suffix) => {
          const id = `EXP-${expIndex}-GROUP-${groups.length + 1}`;
          groups.push({ id, name: suggestedProjectName(groupFacts.map(item => item.fact), exp), roleScope: "", userConfirmed: false });
          groupFacts.forEach(item => { item.groupId = id; });
        };
        if (splitAi) {
          addGroup(coreFacts, "core");
          addGroup(aiFacts, "ai");
        } else addGroup(facts, "all");
        return { expIndex, company: exp.company, team: exp.team, facts, groups };
      }),
      standalone: (source.projects || []).map((project, projectIndex) => ({ projectIndex, name: project.name, targetExperienceIndex: "standalone" }))
    };
  }

  function markProjectGroupingDirty() {
    projectGroupingConfirmed = false;
    $("confirmProjectGrouping").checked = false;
    $("confirmProjectGroupingButton").disabled = true;
    $("startButton").disabled = true;
    $("projectReviewStatus").textContent = "有修改，待确认";
    $("projectReviewStatus").className = "status";
    optimizedResume = null;
    $("resultSection").classList.add("hidden");
  }

  function projectReviewElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderProjectReview() {
    const root = $("projectReviewList");
    root.replaceChildren();
    (projectGroupingDraft.experiences || []).forEach(draft => {
      const company = projectReviewElement("section", "project-review-company");
      const header = projectReviewElement("header");
      header.append(projectReviewElement("strong", "", draft.company || "未识别公司"), projectReviewElement("span", "", draft.team || ""));
      company.append(header);
      const groups = projectReviewElement("div", "project-groups");
      draft.groups.forEach((group, groupIndex) => {
        const card = projectReviewElement("div", "project-group-card");
        const nameLabel = projectReviewElement("label", "", "项目名称");
        const nameInput = projectReviewElement("input");
        nameInput.value = group.name;
        nameInput.addEventListener("input", () => { group.name = nameInput.value; markProjectGroupingDirty(); });
        nameLabel.append(nameInput);
        const scopeLabel = projectReviewElement("label", "", "角色范围（仅在真实且可回答时填写，例如：模块 Owner）");
        const scopeInput = projectReviewElement("input");
        scopeInput.value = group.roleScope;
        scopeInput.placeholder = "留空则不展示 Owner / 主导";
        scopeInput.addEventListener("input", () => { group.roleScope = scopeInput.value; markProjectGroupingDirty(); });
        scopeLabel.append(scopeInput);
        card.append(nameLabel, scopeLabel);
        if (draft.groups.length > 1) {
          const actions = projectReviewElement("div", "project-group-actions");
          const remove = projectReviewElement("button", "", "删除此分组");
          remove.type = "button";
          remove.addEventListener("click", () => {
            const fallback = draft.groups.find(item => item.id !== group.id);
            draft.facts.filter(item => item.groupId === group.id).forEach(item => { item.groupId = fallback.id; });
            draft.groups.splice(groupIndex, 1);
            markProjectGroupingDirty();
            renderProjectReview();
          });
          actions.append(remove); card.append(actions);
        }
        groups.append(card);
      });
      const addGroup = projectReviewElement("button", "button", "＋ 新建项目分组");
      addGroup.type = "button";
      addGroup.addEventListener("click", () => {
        draft.groups.push({ id: `EXP-${draft.expIndex}-GROUP-${Date.now()}`, name: "新项目", roleScope: "", userConfirmed: false });
        markProjectGroupingDirty(); renderProjectReview();
      });
      groups.append(addGroup); company.append(groups);
      const facts = projectReviewElement("div", "project-facts");
      draft.facts.forEach(item => {
        const row = projectReviewElement("div", "project-fact-row");
        row.append(projectReviewElement("p", "", item.fact.text || ""));
        const label = projectReviewElement("label", "", "归属项目");
        const select = projectReviewElement("select");
        draft.groups.forEach(group => {
          const option = projectReviewElement("option", "", group.name || "未命名项目");
          option.value = group.id; option.selected = item.groupId === group.id; select.append(option);
        });
        select.addEventListener("change", () => { item.groupId = select.value; markProjectGroupingDirty(); });
        label.append(select); row.append(label); facts.append(row);
      });
      company.append(facts, projectReviewElement("p", "project-review-note", "每条原始事实只归入一个项目，避免职责、指标重复出现。"));
      root.append(company);
    });
    if ((projectGroupingDraft.standalone || []).length) {
      const standalone = projectReviewElement("section", "standalone-projects");
      standalone.append(projectReviewElement("h3", "", "独立项目归属"));
      projectGroupingDraft.standalone.forEach(item => {
        const row = projectReviewElement("div", "standalone-row");
        row.append(projectReviewElement("strong", "", item.name || "未命名项目"));
        const label = projectReviewElement("label", "", "保留独立项目，或并入实习公司");
        const select = projectReviewElement("select");
        const keep = projectReviewElement("option", "", "保留在“技术项目与沉淀”");
        keep.value = "standalone"; select.append(keep);
        projectGroupingDraft.experiences.forEach(exp => {
          const option = projectReviewElement("option", "", `并入 ${exp.company}`);
          option.value = String(exp.expIndex); select.append(option);
        });
        select.value = String(item.targetExperienceIndex);
        select.addEventListener("change", () => { item.targetExperienceIndex = select.value; markProjectGroupingDirty(); });
        label.append(select); row.append(label); standalone.append(row);
      });
      root.append(standalone);
    }
  }

  function openProjectReview() {
    if (!sourceResume) return showToast("请先确认原始简历", true);
    if (!projectGroupingDraft) projectGroupingDraft = initializeProjectGrouping(sourceResume);
    renderProjectReview();
    $("projectReviewSection").classList.remove("hidden");
    $("projectReviewSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function confirmProjectGrouping() {
    if (!$("confirmProjectGrouping").checked) return showToast("请先勾选项目边界确认", true);
    const invalid = projectGroupingDraft.experiences.some(exp =>
      exp.groups.some(group => !cleanLine(group.name)) || exp.facts.some(fact => !exp.groups.some(group => group.id === fact.groupId))
    );
    if (invalid) return showToast("存在空项目名称或未归属的原始经历", true);
    projectGroupingDraft.experiences.forEach(exp => exp.groups.forEach(group => { group.userConfirmed = true; }));
    projectGroupingConfirmed = true;
    $("projectReviewStatus").textContent = "项目结构已确认";
    $("projectReviewStatus").className = "status safe";
    $("startButton").disabled = false;
    showToast("项目边界已锁定，可以开始酥神化");
  }

  function showToast(message, error) {
    clearTimeout(toastTimer);
    const toast = $("toast");
    toast.textContent = message;
    toast.className = "toast show" + (error ? " error" : "");
    toastTimer = setTimeout(() => { toast.className = "toast"; }, 3000);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  function cleanLine(line) {
    return String(line || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  }

  function stripBullet(line) {
    return cleanLine(line).replace(/^[•●▪◦·\-–—*✓✔◆◇■□►▶→]+\s*/, "").trim();
  }

  function linesFromText(text) {
    return String(text || "").replace(/\r\n?/g, "\n").split("\n").map(cleanLine).filter(Boolean);
  }

  function analyzeTextQuality(text) {
    const value = String(text || "").normalize("NFKC");
    const compact = value.replace(/\s/g, "");
    const total = compact.length;
    const chinese = (compact.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
    const abnormal = (compact.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd\ue000-\uf8ff]/g) || []).length;
    const mojibake = (compact.match(/(?:\u951f\u65a4\u62f7|\u00ef\u00bf\u00bd|\u00c3.|\u00c2.|\u00e2\u20ac|\u00e6[\u0080-\u00ff]|\u00e5[\u0080-\u00ff]|\u00e7[\u0080-\u00ff])/g) || []).join("").length;
    const readable = (compact.match(/[A-Za-z0-9\u3400-\u4dbf\u4e00-\u9fff，。；：！？、（）()《》【】“”‘’·%+@._\-\/]/g) || []).length;
    const lineCount = linesFromText(value).length;
    const abnormalRatio = total ? abnormal / total : 1;
    const mojibakeRatio = total ? mojibake / total : 1;
    const chineseRatio = total ? chinese / total : 0;
    const readableRatio = total ? readable / total : 0;
    const reasons = [];
    if (total < 30) reasons.push("有效文字少于 30 个字符");
    if (lineCount < 3) reasons.push("有效行数少于 3 行");
    if (abnormalRatio > 0.01) reasons.push("异常字符比例过高");
    if (mojibakeRatio > 0.005) reasons.push("检测到疑似乱码");
    if (readableRatio < 0.78) reasons.push("可读字符比例过低");
    return {
      passed: reasons.length === 0,
      characters: total,
      lineCount,
      chineseRatio,
      abnormalRatio,
      mojibakeRatio,
      readableRatio,
      reasons
    };
  }

  function percent(value) {
    return (Number(value || 0) * 100).toFixed(1) + "%";
  }

  function loadScript(url, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-parser="' + globalName + '"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window[globalName]), { once: true });
        existing.addEventListener("error", () => reject(new Error(globalName + " 加载失败")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.dataset.parser = globalName;
      script.onload = () => resolve(window[globalName]);
      script.onerror = () => reject(new Error(globalName + " 加载失败"));
      document.head.appendChild(script);
    });
  }

  async function ensurePdfJs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(PDFJS_URL).then(pdfjs => {
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return pdfjs;
      });
    }
    return pdfjsPromise;
  }

  async function ensureMammoth() {
    if (!mammothPromise) mammothPromise = loadScript(MAMMOTH_URL, "mammoth");
    return mammothPromise;
  }

  async function ensureTesseract() {
    if (!tesseractPromise) {
      tesseractPromise = loadScript(TESSERACT_URL, "Tesseract").then(() => {
        if (!window.Tesseract) throw new Error("OCR 组件初始化失败");
        return window.Tesseract;
      });
    }
    return tesseractPromise;
  }

  function updateImportProgress(message) {
    $("fileStatus").textContent = message;
    $("fileStatus").classList.remove("safe");
  }

  function translateOcrStatus(status) {
    const labels = {
      "loading tesseract core": "加载 OCR 核心",
      "initializing tesseract": "初始化 OCR",
      "loading language traineddata": "下载中英文识别模型",
      "initializing api": "准备 OCR 引擎",
      "recognizing text": "OCR 识别文字"
    };
    return labels[status] || status || "OCR 处理中";
  }

  async function getOcrWorker() {
    if (ocrWorker) return ocrWorker;
    const Tesseract = await ensureTesseract();
    ocrWorker = await Tesseract.createWorker(["chi_sim", "eng"], 1, {
      logger: event => updateImportProgress(`${translateOcrStatus(event.status)} ${Math.round(Number(event.progress || 0) * 100)}%`)
    });
    return ocrWorker;
  }

  function pdfItemsToLines(items) {
    const positioned = items.filter(item => item && cleanLine(item.str)).map(item => ({
      text: cleanLine(item.str),
      x: Number(item.transform && item.transform[4]) || 0,
      y: Number(item.transform && item.transform[5]) || 0,
      width: Number(item.width) || 0
    })).sort((a, b) => Math.abs(b.y - a.y) > 2.2 ? b.y - a.y : a.x - b.x);
    const rows = [];
    positioned.forEach(item => {
      let row = rows.find(candidate => Math.abs(candidate.y - item.y) <= 2.2);
      if (!row) {
        row = { y: item.y, items: [] };
        rows.push(row);
      }
      row.items.push(item);
    });
    return rows.sort((a, b) => b.y - a.y).map(row => {
      const rowItems = row.items.sort((a, b) => a.x - b.x);
      let line = "";
      let rightEdge = 0;
      rowItems.forEach((item, index) => {
        const gap = index ? item.x - rightEdge : 0;
        line += (index && gap > 2.5 ? " " : "") + item.text;
        rightEdge = Math.max(rightEdge, item.x + item.width);
      });
      return cleanLine(line);
    }).filter(Boolean);
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

  function candidateFromDataUrl(src, source) {
    return new Promise(resolve => {
      if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(String(src || ""))) return resolve(null);
      const image = new Image();
      image.onerror = () => resolve(null);
      image.onload = () => {
        if (image.naturalWidth < 70 || image.naturalHeight < 70) return resolve(null);
        const ratio = image.naturalWidth / image.naturalHeight;
        if (ratio < 0.5 || ratio > 1.6) return resolve(null);
        resolve({ src, source, width: image.naturalWidth, height: image.naturalHeight });
      };
      image.src = src;
    });
  }

  function pdfImageToDataUrl(image) {
    try {
      const width = Number(image && image.width) || 0;
      const height = Number(image && image.height) || 0;
      if (width < 70 || height < 70 || width > 1800 || height > 1800) return null;
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      if (image instanceof HTMLImageElement || image instanceof HTMLCanvasElement || (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap)) {
        context.drawImage(image, 0, 0, width, height);
      } else if (image.data) {
        const source = image.data;
        const rgba = new Uint8ClampedArray(width * height * 4);
        if (source.length === rgba.length) rgba.set(source);
        else if (source.length === width * height * 3) {
          for (let input = 0, output = 0; input < source.length; input += 3, output += 4) {
            rgba[output] = source[input]; rgba[output + 1] = source[input + 1]; rgba[output + 2] = source[input + 2]; rgba[output + 3] = 255;
          }
        } else return null;
        context.putImageData(new ImageData(rgba, width, height), 0, 0);
      } else return null;
      return canvas.toDataURL("image/jpeg", 0.88);
    } catch (_) { return null; }
  }

  async function extractPdfPhotoCandidates(page, pdfjs) {
    try {
      const operators = await page.getOperatorList();
      const names = operators.fnArray.map((fn, index) => fn === pdfjs.OPS.paintImageXObject ? operators.argsArray[index] && operators.argsArray[index][0] : null).filter(Boolean);
      const candidates = [];
      for (const name of [...new Set(names)].slice(0, 12)) {
        const image = await new Promise(resolve => {
          let settled = false;
          const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, 1200);
          try {
            page.objs.get(name, value => {
              if (!settled) { settled = true; clearTimeout(timer); resolve(value); }
            });
          } catch (_) { clearTimeout(timer); resolve(null); }
        });
        const src = pdfImageToDataUrl(image);
        const candidate = src ? await candidateFromDataUrl(src, "PDF 内嵌图片") : null;
        if (candidate) candidates.push(candidate);
        if (candidates.length >= 5) break;
      }
      return candidates;
    } catch (_) { return []; }
  }

  async function extractDocxPhotoCandidates(file, mammoth) {
    try {
      const htmlResult = await mammoth.convertToHtml(
        { arrayBuffer: await file.arrayBuffer() },
        { convertImage: mammoth.images.imgElement(async image => ({ src: `data:${image.contentType};base64,${await image.read("base64")}` })) }
      );
      const documentNode = new DOMParser().parseFromString(htmlResult.value || "", "text/html");
      const candidates = [];
      for (const image of [...documentNode.querySelectorAll("img")].slice(0, 12)) {
        const candidate = await candidateFromDataUrl(image.src, "DOCX 内嵌图片");
        if (candidate) candidates.push(candidate);
        if (candidates.length >= 5) break;
      }
      return candidates;
    } catch (_) { return []; }
  }

  async function extractPdfText(file) {
    const pdfjs = await ensurePdfJs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const task = pdfjs.getDocument({
      data: bytes,
      cMapUrl: PDFJS_ASSET_ROOT + "cmaps/",
      cMapPacked: true,
      standardFontDataUrl: PDFJS_ASSET_ROOT + "standard_fonts/"
    });
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`PDF 共 ${pdf.numPages} 页，超过 ${MAX_PDF_PAGES} 页在线解析上限`);
    const pages = [];
    const pageReports = [];
    let ocrPages = 0;
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      updateImportProgress(`读取 PDF 第 ${pageNo}/${pdf.numPages} 页`);
      const page = await pdf.getPage(pageNo);
      if (pageNo === 1) photoCandidates = await extractPdfPhotoCandidates(page, pdfjs);
      const content = await page.getTextContent();
      const direct = pdfItemsToLines(content.items).join("\n");
      const directReport = analyzeTextQuality(direct);
      let pageText = direct;
      let method = "PDF 原生文字";
      if (!directReport.passed) {
        updateImportProgress(`第 ${pageNo} 页原生文字质量不合格，切换 OCR`);
        const worker = await getOcrWorker();
        const canvas = await renderPdfPage(page);
        const result = await worker.recognize(canvas);
        pageText = String(result.data && result.data.text || "").trim();
        method = "OCR";
        ocrPages += 1;
      }
      const finalReport = analyzeTextQuality(pageText);
      pages.push(pageText);
      pageReports.push({ page: pageNo, method, direct: directReport, final: finalReport });
      page.cleanup();
    }
    const text = pages.join("\n\n");
    return {
      text,
      method: ocrPages ? `PDF 原生文字 + OCR（${ocrPages}/${pdf.numPages} 页）` : `PDF 原生文字（${pdf.numPages} 页）`,
      quality: analyzeTextQuality(text),
      pages: pageReports,
      photoCandidates
    };
  }

  async function extractDocxText(file) {
    const mammoth = await ensureMammoth();
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const text = cleanLine(result.value).length ? result.value : "";
    photoCandidates = await extractDocxPhotoCandidates(file, mammoth);
    return { text, method: "DOCX 原生文字", quality: analyzeTextQuality(text), pages: [], photoCandidates };
  }

  async function extractFileText(file) {
    if (file.size > MAX_FILE_BYTES) throw new Error("文件超过 20 MB 在线解析上限");
    if (/\.pdf$/i.test(file.name)) return extractPdfText(file);
    if (/\.docx$/i.test(file.name)) return extractDocxText(file);
    throw new Error("仅支持 PDF / DOCX");
  }

  function detectSection(line) {
    const normalized = cleanLine(line).replace(/[：:|｜]/g, "").replace(/\s+/g, "");
    const match = SECTION_RULES.find(([, pattern]) => pattern.test(normalized));
    return match ? match[0] : "";
  }

  function splitSections(lines) {
    const sections = { profile: [], education: [], experience: [], projects: [], skills: [], awards: [] };
    let current = "profile";
    lines.forEach(line => {
      const section = detectSection(line);
      if (section) current = section;
      else sections[current].push(line);
    });
    return sections;
  }

  function dateFromLine(line) {
    const match = cleanLine(line).match(DATE_PATTERN);
    return match ? cleanLine(match[0]) : "";
  }

  function withoutDate(line) {
    return cleanLine(line).replace(DATE_PATTERN, "").replace(/[|｜·•]+$/g, "").trim();
  }

  function contactProfile(lines) {
    const text = lines.join(" ");
    const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [""])[0];
    const phone = (text.match(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/) || [""])[0];
    const url = (text.match(/https?:\/\/[^\s|｜]+/i) || [""])[0];
    const nameLine = lines.find(line => {
      const value = stripBullet(line);
      return value.length >= 2 && value.length <= 20 && !/求职|电话|邮箱|@|年龄|岁|男|女|教育|简历/i.test(value);
    }) || "";
    const headlineLine = lines.find(line => /求职方向|求职意向|目标岗位|应聘岗位/i.test(line)) || "";
    const contacts = [];
    if (email) contacts.push({ label: "邮箱", value: email, url: "mailto:" + email });
    if (phone) contacts.push({ label: "电话", value: phone });
    if (url) contacts.push({ label: "链接", value: url.replace(/^https?:\/\//, ""), url: url });
    return {
      name: stripBullet(nameLine).split(/[|｜·•]/)[0].trim() || "姓名待识别",
      headline: headlineLine.replace(/^.*?(?:求职方向|求职意向|目标岗位|应聘岗位)\s*[：:]?\s*/i, "").trim(),
      location: "",
      contacts: contacts
    };
  }

  function splitHeader(line) {
    return withoutDate(line).split(/\s{1,}|[|｜·•]/).map(cleanLine).filter(Boolean);
  }

  function parseEducation(lines, fileName, counter) {
    const entries = [];
    let current = null;
    const semanticLines = mergeWrappedFactLines(lines, text => /大学|学院|University|College|Institute|School/i.test(text) && Boolean(dateFromLine(text) || text.match(DEGREE_PATTERN)));
    semanticLines.forEach(line => {
      const clean = stripBullet(line);
      const date = dateFromLine(clean);
      const degreeMatch = clean.match(DEGREE_PATTERN);
      const schoolLike = /大学|学院|University|College|Institute|School/i.test(clean);
      if ((schoolLike && (date || degreeMatch)) || (!current && schoolLike)) {
        if (current) entries.push(current);
        const body = withoutDate(clean);
        const degree = degreeMatch ? degreeMatch[0] : "";
        const degreeIndex = degree ? body.indexOf(degree) : -1;
        let institution = degreeIndex > 0 ? body.slice(0, degreeIndex).trim() : splitHeader(body)[0] || body;
        let program = degreeIndex >= 0 ? body.slice(degreeIndex + degree.length).trim() : body.slice(institution.length).trim();
        institution = institution.replace(/[|｜·•]+$/g, "").trim();
        program = program.replace(/^[|｜·•\s]+/, "").trim();
        current = { institution: institution, program: program, degree: degree, dates: date, bullets: [] };
      } else if (current) {
        counter.value += 1;
        current.bullets.push(sourceFact(clean, fileName, counter.value));
      }
    });
    if (current) entries.push(current);
    if (!entries.length && lines.length) {
      entries.push({
        institution: "", program: "", degree: "", dates: "",
        bullets: lines.map(line => {
          counter.value += 1;
          return sourceFact(stripBullet(line), fileName, counter.value);
        })
      });
    }
    return entries;
  }

  function parseExperienceHeader(line) {
    const clean = stripBullet(line);
    const date = dateFromLine(clean);
    const body = withoutDate(clean);
    const roleMatch = body.match(ROLE_PATTERN);
    const hasCompany = COMPANY_PATTERN.test(body);
    if (!date && !(hasCompany && roleMatch && body.length <= 35 && !/[：:，,。；;]/.test(body))) return null;
    let company = "";
    let role = "";
    if (roleMatch && roleMatch.index > 0) {
      company = body.slice(0, roleMatch.index).trim();
      role = body.slice(roleMatch.index).trim();
    } else {
      const parts = splitHeader(body);
      company = parts[0] || body;
      role = parts.slice(1).join(" ");
    }
    company = company.replace(/[|｜·•]+$/g, "").trim();
    return company ? { company: company, role: role, dates: date } : null;
  }

  function normalizedCompanyName(company) {
    const value = String(company || "");
    if (/字节|ByteDance/i.test(value)) return "ByteDance";
    if (/亚马逊|Amazon/i.test(value)) return "Amazon";
    if (/腾讯|Tencent/i.test(value)) return "Tencent";
    if (/阿里|Alibaba|淘宝|天猫/i.test(value)) return "Alibaba";
    if (/美团|Meituan/i.test(value)) return "Meituan";
    if (/Tesla|特斯拉/i.test(value)) return "Tesla";
    return "";
  }

  function toolMatches(text) {
    const found = [];
    TOOL_NAMES.forEach(tool => {
      const escaped = tool.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
      const pattern = new RegExp("(^|[^A-Za-z0-9])" + escaped + "([^A-Za-z0-9]|$)", "i");
      if (pattern.test(text) && !found.some(value => value.toLowerCase() === tool.toLowerCase())) found.push(tool);
    });
    return found;
  }

  function mergeWrappedFactLines(lines, boundaryTest) {
    const merged = [];
    (lines || []).forEach(line => {
      const text = stripBullet(line);
      if (!text) return;
      const currentBoundary = boundaryTest(text);
      const previous = merged[merged.length - 1];
      const previousBoundary = previous ? boundaryTest(previous) : false;
      const labeledFact = /^[^：:]{2,24}[：:]/.test(text);
      const previousComplete = previous ? /[。！？!?；;]$/.test(previous) : true;
      if (!previous || currentBoundary || previousBoundary || labeledFact || previousComplete) merged.push(text);
      else {
        const connector = /[\u4e00-\u9fff]$/.test(previous) && /^[A-Za-z0-9]/.test(text) ? " " : "";
        merged[merged.length - 1] = cleanLine(previous + connector + text);
      }
    });
    return merged;
  }

  function parseExperiences(lines, fileName, counter) {
    const entries = [];
    let current = null;
    const semanticLines = mergeWrappedFactLines(lines, text => Boolean(parseExperienceHeader(text)));
    semanticLines.forEach(line => {
      const header = parseExperienceHeader(line);
      if (header && (header.dates || ROLE_PATTERN.test(header.role) || COMPANY_PATTERN.test(header.company))) {
        if (current) entries.push(current);
        const normalized = normalizedCompanyName(header.company);
        current = {
          company: header.company,
          companyNormalizedName: normalized,
          team: header.role,
          dates: header.dates,
          brand: normalized === "ByteDance" ? "red" : "blue",
          tags: [],
          links: [],
          projects: [{
            name: header.role || header.company,
            subtitle: "",
            background: [],
            impact: [],
            responsibilities: [],
            actions: [],
            keywords: [],
            missingMetrics: []
          }]
        };
      } else if (current) {
        const text = stripBullet(line);
        if (!text) return;
        const urls = text.match(/https?:\/\/[^\s|｜]+/gi) || [];
        urls.forEach(url => {
          if (!current.links.some(item => item.url === url)) {
            const label = /github\.com/i.test(url) ? "GitHub" : /作品|portfolio/i.test(text) ? "作品集" : /文章|article/i.test(text) ? "文章" : "项目演示";
            current.links.push({ label, url, verification: "source_grounded", source_note: fileName });
          }
        });
        counter.value += 1;
        current.projects[0].responsibilities.push(sourceFact(text, fileName, counter.value));
        toolMatches(text).forEach(tool => {
          if (!current.projects[0].keywords.includes(tool)) current.projects[0].keywords.push(tool);
        });
      }
    });
    if (current) entries.push(current);
    return entries;
  }

  function looksLikeProjectHeader(line, nextLine) {
    const clean = stripBullet(line);
    if (clean.length > 60) return false;
    if (dateFromLine(clean)) return clean.length <= 60;
    const nextIsDateOnly = Boolean(dateFromLine(nextLine || "")) && withoutDate(nextLine || "").length === 0;
    if (nextIsDateOnly) return true;
    return clean.length <= 40 &&
      /项目|平台|系统|课题|研究计划|大赛/i.test(clean) &&
      !/[：:。；;]/.test(clean);
  }

  function parseProjects(lines, fileName, counter) {
    const projects = [];
    let current = null;
    const semanticLines = mergeWrappedFactLines(lines, text => looksLikeProjectHeader(text, "") || (Boolean(dateFromLine(text)) && withoutDate(text).length === 0));
    semanticLines.forEach((line, index) => {
      const text = stripBullet(line);
      const next = semanticLines[index + 1] || "";
      const dateOnly = Boolean(dateFromLine(text)) && withoutDate(text).length === 0;
      if (dateOnly && current && !current.dates) current.dates = dateFromLine(text);
      else if (looksLikeProjectHeader(text, next)) {
        if (current) projects.push(current);
        current = { name: withoutDate(text), role: "", dates: dateFromLine(text), scope: "", bullets: [], missingMetrics: [] };
      } else {
        if (!current) current = { name: "", role: "", dates: "", scope: "", bullets: [], missingMetrics: [] };
        counter.value += 1;
        current.bullets.push(sourceFact(text, fileName, counter.value));
      }
    });
    if (current) projects.push(current);
    return projects.filter(project => project.name || project.bullets.length);
  }

  function parseSkills(lines, allText) {
    const explicit = [];
    lines.forEach(line => {
      stripBullet(line).split(/[：:、,，;；|｜/]/).map(cleanLine).filter(Boolean).forEach(item => {
        if (item.length <= 40 && !explicit.includes(item)) explicit.push(item);
      });
    });
    toolMatches(allText).forEach(tool => {
      if (!explicit.some(value => value.toLowerCase() === tool.toLowerCase())) explicit.push(tool);
    });
    return explicit.slice(0, 30);
  }

  function parseAwards(lines) {
    return lines.flatMap(line => {
      const text = stripBullet(line);
      const date = dateFromLine(text);
      const content = text.replace(/^(?:奖项|荣誉)(?:奖项)?[：:]\s*/i, "");
      const names = /^(?:奖项|荣誉)/i.test(text)
        ? content.split(/[、；;]/).map(cleanLine).filter(Boolean)
        : [withoutDate(text)];
      return names.map(name => ({ name: withoutDate(name), date, raw_text: text }));
    }).filter(item => item.name);
  }

  function metricsInText(text) {
    return (String(text || "").match(NUMBER_PATTERN) || []).filter(token => !/^(?:19|20)\d{2}$/.test(token));
  }

  function addMissingMetricHints(resume) {
    (resume.experience || []).forEach(exp => (exp.projects || []).forEach(project => {
      const text = ["background", "impact", "responsibilities", "actions"].flatMap(key => project[key] || [])
        .map(item => item.text || item).join(" ");
      project.missingMetrics = metricsInText(text).length ? [] :
        ["建议补充：项目规模 / 效率提升 / 用户数 / GMV / CTR / CVR 等真实结果数据"];
    }));
    (resume.projects || []).forEach(project => {
      const text = (project.bullets || []).map(item => item.text || item).join(" ");
      project.missingMetrics = metricsInText(text).length ? [] :
        ["建议补充：项目规模 / 效率提升 / 用户数 / GMV / CTR / CVR 等真实结果数据"];
    });
  }

  function buildSourceResume(text, file, extraction) {
    const lines = linesFromText(text);
    if (lines.join("").length < 30) throw new Error("文件中未提取到足够文字；扫描版 PDF 目前不支持，且不会改用示例数据");
    const sections = splitSections(lines);
    const counter = { value: 0 };
    const inlineAwards = sections.skills.filter(line => /^(?:奖项|荣誉)(?:奖项)?[：:]/i.test(cleanLine(line)));
    const awards = parseAwards([...sections.awards, ...inlineAwards]);
    const profile = contactProfile(sections.profile.length ? sections.profile : lines.slice(0, 8));
    profile.photo = extraction && extraction.photo || { src: "", crop: { x: 50, y: 50, zoom: 1 }, confirmed: false };
    profile.summary = null;
    const resume = {
      schema_version: "2.0",
      data_role: "sourceResume",
      readonly: true,
      mode: "source_grounded",
      source_title: file.name + "｜真实文件解析结果",
      source_file: {
        name: file.name,
        size: file.size,
        type: file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        lastModified: file.lastModified,
        parser: extraction && extraction.method || (/\.pdf$/i.test(file.name) ? "pdfjs-dist@6.1.200" : "mammoth@1.10.0"),
        quality: extraction && extraction.quality || analyzeTextQuality(text),
        user_confirmed: true
      },
      raw_text: text,
      profile,
      education: parseEducation(sections.education, file.name, counter),
      experience: parseExperiences(sections.experience, file.name, counter),
      open_source: [],
      projects: parseProjects(sections.projects, file.name, counter),
      awards,
      endorsements: awards.slice(0, 3).map((award, index) => ({
        text: award.name,
        source: `原始简历${award.date ? `（${award.date}）` : ""}`,
        verification: "source_grounded",
        source_note: file.name,
        claim_ids: [`SOURCE-ENDORSEMENT-${String(index + 1).padStart(2, "0")}`],
        highlights: detectHighlights(award.name)
      })),
      skills: parseSkills(sections.skills, text)
    };
    addMissingMetricHints(resume);
    return resume;
  }

  function visibleTexts(data) {
    const texts = [];
    const add = value => { if (typeof value === "string" && value.trim()) texts.push(value.trim()); };
    const addFacts = values => (values || []).forEach(item => add(item && item.text !== undefined ? item.text : item));
    if (!data) return texts;
    add(data.profile && data.profile.name);
    add(data.profile && data.profile.headline);
    add(data.profile && data.profile.summary && data.profile.summary.text);
    add(data.profile && data.profile.location);
    (data.profile && data.profile.contacts || []).forEach(contact => add(contact.value));
    (data.education || []).forEach(item => {
      add(item.institution); add(item.program); add(item.degree); add(item.dates); addFacts(item.bullets);
    });
    (data.experience || []).forEach(exp => {
      add(exp.company); add(exp.team); add(exp.dates);
      (exp.links || []).forEach(item => { add(item.label); add(item.url); });
      (exp.tags || []).forEach(add);
      (exp.projects || []).forEach(project => {
        add(project.name); add(project.subtitle);
        ["background", "impact", "responsibilities", "actions"].forEach(key => addFacts(project[key]));
        (project.keywords || []).forEach(add);
      });
    });
    (data.projects || []).forEach(project => {
      add(project.name); add(project.role); add(project.dates); add(project.scope); addFacts(project.bullets);
    });
    (data.skills || []).forEach(add);
    (data.awards || []).forEach(item => { add(item.name); add(item.date); });
    (data.endorsements || []).forEach(item => { add(item.text); add(item.source); });
    return texts;
  }

  function projectCount(data) {
    return (data.experience || []).reduce((sum, item) => sum + (item.projects || []).length, 0) + (data.projects || []).length;
  }

  function missingMetricCount(data) {
    let total = 0;
    (data.experience || []).forEach(exp => (exp.projects || []).forEach(project => { total += (project.missingMetrics || []).length; }));
    (data.projects || []).forEach(project => { total += (project.missingMetrics || []).length; });
    return total;
  }

  function analyzeResume(data) {
    return {
      experience: (data.experience || []).length,
      projects: projectCount(data),
      metrics: visibleTexts(data).filter(text => metricsInText(text).length).length,
      missingMetrics: missingMetricCount(data)
    };
  }

  function buildPositioning(data) {
    const roles = (data.experience || []).map(item => item.team).filter(Boolean);
    const companies = (data.experience || []).map(item => item.company).filter(Boolean);
    const capabilities = (data.skills || []).slice(0, 4);
    return {
      title: data.profile.headline || roles[0] || "候选人定位待补充",
      story: companies.length ? "经历主线：" + companies.join(" → ") : "经历主线仅依据原始简历已识别内容。",
      capabilities: capabilities.length ? capabilities : roles.slice(0, 4),
      edge: "定位仅由原始简历中的岗位、经历与技能提取，不新增公司、岗位或项目事实。"
    };
  }

  function atomicFacts(facts) {
    return (facts || []).map(item => {
      const source = typeof item === "string" ? { text: item } : item;
      const text = cleanLine(source.text || "");
      return text ? Object.assign({}, clone(source), { text, raw_text: source.raw_text || text, highlights: detectHighlights(text) }) : null;
    }).filter(Boolean);
  }

  function classifyFacts(facts) {
    const result = { background: [], impact: [], responsibilities: [], actions: [] };
    atomicFacts(facts).forEach(item => {
      const text = item.text || "";
      const hasOutcome = /(?:由|从).{0,18}(?:提升|增长|降低|缩短)(?:至|到)?\s*\d|(?:提升|增长|降低|缩短)(?:至|到|约|为)\s*\d|(?:累计|最高|覆盖).{0,18}\d|上线|沉淀|形成|完成|产出|交付|落地/i.test(text);
      const hasHardOutcome = hasOutcome && (metricsInText(text).length > 0 || /上线|交付|覆盖|沉淀|形成|产出|落地/i.test(text));
      const hasMetricSystem = /指标体系|数据监控|监测口径|数据漏斗|转化漏斗|持续跟踪|追踪.{0,30}(?:率|指标)|PV|UV|CTR|CVR|GMV|GPM|GPH|PCU|ACU/i.test(text);
      const metricResultLabel = /^(?:指标(?:体系)?(?:搭建|监控|闭环)?|数据(?:与指标|监控|分析|闭环)?|结果|效果)[：:]/i.test(text);
      const hasContext = /^(?:项目)?(?:背景|目标|问题|痛点|需求)|^(?:面向|围绕|针对|为了解决)|业务(?:背景|场景)|定位.{0,24}(?:问题|需求)|探索.{0,20}(?:模式|方案|路径)/i.test(text);
      if (hasContext && !hasHardOutcome) result.background.push(item);
      else if (hasHardOutcome || (metricResultLabel && hasMetricSystem)) result.impact.push(item);
      else if (/负责|主导|牵头|协助|参与|承接|Owner|责任|职责|通过|基于|使用|采用|设计|搭建|构建|分析|制定|优化|推动|拆解|调研|复盘|迭代|协调|输出|整理|维护|运营|开发|测试/i.test(text)) result.responsibilities.push(item);
      else result.responsibilities.push(item);
    });
    if (!result.background.length && result.responsibilities.length > 1) result.background.push(result.responsibilities.shift());
    return result;
  }

  function groupedProject(group, facts) {
    const classified = classifyFacts(facts);
    return Object.assign({
      name: cleanLine(group.name),
      subtitle: cleanLine(group.roleScope),
      generated_label: true,
      label_source_claim_ids: facts.flatMap(item => item.claim_ids || []),
      role_scope_verification: group.roleScope ? "user_attested" : "",
      keywords: projectKeywords(facts),
      missingMetrics: metricsInText(facts.map(item => item.text || item).join(" ")).length ? [] : ["建议补充：项目规模 / 效率提升 / 用户数 / GMV / CTR / CVR 等真实结果数据"]
    }, classified);
  }

  function standaloneAsExperienceProject(project) {
    const facts = clone(project.bullets || []);
    const classified = classifyFacts(facts);
    return Object.assign({
      name: project.name,
      subtitle: project.role || "",
      generated_label: false,
      label_source_claim_ids: facts.flatMap(item => item.claim_ids || []),
      role_scope_verification: "source_grounded",
      keywords: projectKeywords(facts),
      missingMetrics: clone(project.missingMetrics || [])
    }, classified);
  }

  function buildOptimizedResume(source, grouping) {
    const optimized = clone(source);
    const positioning = buildPositioning(source);
    optimized.data_role = "optimizedResume";
    optimized.readonly = false;
    optimized.source_title = source.source_file.name + "｜同源结构重组结果";
    optimized.rebuild_analysis = {
      positioning: positioning.title,
      coreCapabilities: positioning.capabilities,
      rule: "只重组 sourceResume 已有原文；不创建新的公司、学校、岗位、项目、时间、数字或业务指标"
    };
    if (!(optimized.profile && optimized.profile.summary && optimized.profile.summary.text)) {
      const role = (source.experience || []).map(item => item.team).find(Boolean) || source.profile.headline;
      const capabilities = (source.skills || []).slice(0, 3);
      const summaryText = [role ? `${role}方向候选人` : "", capabilities.length ? `具备${capabilities.join("、")}等已确认能力` : ""].filter(Boolean).join("，");
      optimized.profile.summary = summaryText ? {
        text: summaryText + "。",
        verification: "source_grounded",
        source_note: "由已确认的岗位与技能字段自动组合",
        claim_ids: [],
        highlights: detectHighlights(summaryText)
      } : null;
    }
    optimized.experience = (source.experience || []).map((exp, expIndex) => {
      const copied = clone(exp);
      const draft = grouping.experiences.find(item => item.expIndex === expIndex);
      copied.projects = draft.groups.map(group => groupedProject(group, draft.facts.filter(item => item.groupId === group.id).map(item => item.fact)));
      return copied;
    });
    const movedProjects = new Set();
    (grouping.standalone || []).forEach(item => {
      if (item.targetExperienceIndex === "standalone") return;
      const targetIndex = Number(item.targetExperienceIndex);
      const project = source.projects[item.projectIndex];
      if (!project || !optimized.experience[targetIndex]) return;
      const converted = standaloneAsExperienceProject(project);
      const aiProject = /AI|Agent|数字人|AIGC/i.test(converted.name + " " + visibleProjectText(converted));
      const mergeIndex = aiProject ? optimized.experience[targetIndex].projects.findIndex(candidate => /AI|Agent|数字人|AIGC/i.test(candidate.name + " " + visibleProjectText(candidate))) : -1;
      if (mergeIndex >= 0) {
        const existing = optimized.experience[targetIndex].projects[mergeIndex];
        const allFacts = ["background", "impact", "responsibilities", "actions"].flatMap(key => [...(existing[key] || []), ...(converted[key] || [])]);
        const merged = groupedProject({ name: converted.name || existing.name, roleScope: existing.subtitle || converted.subtitle || "" }, allFacts);
        optimized.experience[targetIndex].projects[mergeIndex] = merged;
      } else optimized.experience[targetIndex].projects.push(converted);
      movedProjects.add(item.projectIndex);
    });
    optimized.projects = (source.projects || []).filter((_, index) => !movedProjects.has(index)).map(clone);
    optimized.fact_validation = null;
    return optimized;
  }

  function visibleProjectText(project) {
    return ["background", "impact", "responsibilities", "actions"].flatMap(key => project[key] || []).map(item => item.text || item).join(" ");
  }

  function entityValues(data, type) {
    if (type === "company") return (data.experience || []).map(item => item.company).filter(Boolean);
    if (type === "school") return (data.education || []).map(item => item.institution).filter(Boolean);
    if (type === "role") return (data.experience || []).map(item => item.team).filter(Boolean);
    if (type === "date") return [
      ...(data.education || []).map(item => item.dates),
      ...(data.experience || []).map(item => item.dates),
      ...(data.projects || []).map(item => item.dates),
      ...(data.awards || []).map(item => item.date)
    ].filter(Boolean);
    if (type === "project") return [
      ...(data.experience || []).flatMap(item => (item.projects || []).filter(project => !project.generated_label).map(project => project.name)),
      ...(data.projects || []).map(item => item.name)
    ].filter(Boolean);
    return [];
  }

  function validateFacts(source, optimized) {
    const anomalies = [];
    ["company", "school", "role", "date", "project"].forEach(type => {
      const sourceSet = new Set(entityValues(source, type).map(cleanLine));
      entityValues(optimized, type).map(cleanLine).forEach(value => {
        if (value && !sourceSet.has(value)) anomalies.push({ type: type, value: value });
      });
    });
    const sourceNumbers = new Set(visibleTexts(source).flatMap(text => text.match(NUMBER_PATTERN) || []));
    visibleTexts(optimized).flatMap(text => text.match(NUMBER_PATTERN) || []).forEach(value => {
      if (!sourceNumbers.has(value)) anomalies.push({ type: "number", value: value });
    });
    return {
      valid: anomalies.length === 0,
      checkedAt: new Date().toISOString(),
      checks: ["company", "school", "role", "date", "project", "number"],
      anomalies: anomalies
    };
  }

  function renderStats(stats) {
    const values = [
      [stats.experience, "段实习经历"],
      [stats.projects, "个项目经历"],
      [stats.metrics, "个已有量化成果"],
      [stats.missingMetrics, "个建议补充数据点"]
    ];
    $("recognitionStats").replaceChildren(...values.map(([value, label]) => {
      const item = document.createElement("div");
      item.innerHTML = "<strong>" + value + "</strong><span>" + label + "</span>";
      return item;
    }));
  }

  function renderRecognizedSections(data) {
    const sections = [
      ["基本信息", data.profile && data.profile.name ? "已识别" : "缺失"],
      ["教育经历", (data.education || []).length + " 条"],
      ["实习经历", (data.experience || []).length + " 条"],
      ["项目经历", projectCount(data) + " 个"],
      ["技能", (data.skills || []).length + " 项"],
      ["荣誉 / 开源 / 创业", ((data.awards || []).length + (data.open_source || []).length) + " 条"]
    ];
    $("recognizedSections").replaceChildren(...sections.map(([label, value]) => {
      const row = document.createElement("div");
      row.innerHTML = "<span>" + label + "</span><strong>" + value + "</strong>";
      return row;
    }));
  }

  function renderPositioning(positioning) {
    $("positioningTitle").textContent = positioning.title;
    $("positioningStory").textContent = positioning.story;
    $("positioningEdge").textContent = positioning.edge;
    $("positioningTags").replaceChildren(...positioning.capabilities.map(text => {
      const tag = document.createElement("span");
      tag.textContent = text;
      return tag;
    }));
  }

  function renderQualityReport(report, method) {
    const values = [
      [percent(report.mojibakeRatio), "乱码率"],
      [percent(report.abnormalRatio), "异常字符率"],
      [percent(report.chineseRatio), "有效中文比例"],
      [report.lineCount, "识别行数"]
    ];
    $("qualityStats").replaceChildren(...values.map(([value, label]) => {
      const item = document.createElement("div");
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      strong.textContent = value;
      span.textContent = label;
      item.append(strong, span);
      return item;
    }));
    $("qualityMethod").textContent = method;
    $("qualityStatus").textContent = report.passed ? "自动检测通过，仍需人工确认" : "自动检测未通过，请校对或重新上传";
    $("qualityStatus").className = "status " + (report.passed ? "safe" : "danger");
    $("qualityReasons").textContent = report.reasons.length ? report.reasons.join("；") : "未发现明显乱码或异常字符。";
  }

  function renderSelectedPhoto() {
    const preview = $("selectedPhotoPreview");
    preview.replaceChildren();
    if (!selectedPhoto || !selectedPhoto.src) preview.append(Object.assign(document.createElement("span"), { textContent: "未选择照片" }));
    else {
      const image = document.createElement("img");
      image.src = selectedPhoto.src;
      image.alt = "已选择照片预览";
      const crop = selectedPhoto.crop || { x: 50, y: 50, zoom: 1 };
      image.style.objectPosition = `${crop.x}% ${crop.y}%`;
      image.style.transform = `scale(${crop.zoom})`;
      preview.append(image);
    }
    $("removePhotoButton").disabled = !selectedPhoto;
    $("photoCropControls").classList.toggle("hidden", !selectedPhoto);
  }

  function choosePhoto(candidate, index) {
    selectedPhoto = candidate ? {
      src: candidate.src,
      source: candidate.source,
      crop: { x: 50, y: 50, zoom: 1 },
      confirmed: true
    } : null;
    $("photoCropX").value = "50"; $("photoCropY").value = "50"; $("photoZoom").value = "1";
    [...$("photoCandidateList").querySelectorAll(".photo-candidate")].forEach((button, buttonIndex) => button.classList.toggle("selected", buttonIndex === index));
    renderSelectedPhoto();
  }

  function renderPhotoCandidates() {
    const list = $("photoCandidateList");
    list.replaceChildren();
    if (!photoCandidates.length) list.append(Object.assign(document.createElement("span"), { textContent: "未从文件中找到适合的照片候选，可单独上传或继续使用无照片版。" }));
    else photoCandidates.forEach((candidate, index) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "photo-candidate";
      const image = document.createElement("img");
      image.src = candidate.src; image.alt = `图片候选 ${index + 1}`;
      const label = document.createElement("span"); label.textContent = `候选 ${index + 1}`;
      button.append(image, label);
      button.addEventListener("click", () => choosePhoto(candidate, index));
      list.append(button);
    });
    renderSelectedPhoto();
  }

  function imageFileToDataUrl(file, maxSide = 700) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\/(?:png|jpeg|webp)$/i.test(file.type)) return reject(new Error("请选择 PNG、JPG 或 WebP 图片"));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("照片读取失败"));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("照片格式无法识别"));
        image.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.9));
        };
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  function showSourceReview(text, report, method) {
    $("sourceText").value = text;
    $("confirmSource").checked = false;
    $("confirmSourceButton").disabled = true;
    renderQualityReport(report, method);
    renderPhotoCandidates();
    $("reviewSection").classList.remove("hidden");
    $("recognitionSection").classList.add("hidden");
    $("reviewSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function confirmReviewedSource() {
    if (!selectedFile || !extractedText) return showToast("请先上传并解析简历", true);
    if (!$("confirmSource").checked) return showToast("请先确认原文已经人工校对", true);
    const reviewedText = $("sourceText").value.trim();
    const report = analyzeTextQuality(reviewedText);
    renderQualityReport(report, extractionMethod + " · 人工校对后");
    if (!report.passed) {
      sourceConfirmed = false;
      $("confirmSource").checked = false;
      $("confirmSourceButton").disabled = true;
      return showToast("原文质量仍未通过：" + report.reasons.join("、"), true);
    }
    try {
      sourceResume = deepFreeze(buildSourceResume(reviewedText, selectedFile, {
        method: extractionMethod,
        quality: report,
        photo: selectedPhoto || { src: "", crop: { x: 50, y: 50, zoom: 1 }, confirmed: false }
      }));
      localStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(sourceResume));
      extractedText = reviewedText;
      extractionReport = report;
      sourceConfirmed = true;
      $("reviewStatus").textContent = "原文已确认";
      showRecognition();
      showToast("原文已确认，现可开始酥神化");
    } catch (error) {
      sourceConfirmed = false;
      sourceResume = null;
      showToast("结构识别失败：" + error.message, true);
    }
  }

  function resetResumeState() {
    revokeOriginalFileUrl();
    sourceResume = null;
    optimizedResume = null;
    extractedText = "";
    extractionReport = null;
    extractionMethod = "";
    sourceConfirmed = false;
    photoCandidates = [];
    selectedPhoto = null;
    projectGroupingDraft = null;
    projectGroupingConfirmed = false;
    localStorage.removeItem(SOURCE_STORAGE_KEY);
    $("reviewSection").classList.add("hidden");
    $("recognitionSection").classList.add("hidden");
    $("projectReviewSection").classList.add("hidden");
    $("loadingSection").classList.add("hidden");
    $("resultSection").classList.add("hidden");
  }

  function showRecognition() {
    renderStats(analyzeResume(sourceResume));
    renderRecognizedSections(sourceResume);
    renderPositioning(buildPositioning(sourceResume));
    $("recognitionStatus").textContent = "真实文件解析完成";
    projectGroupingDraft = initializeProjectGrouping(sourceResume);
    projectGroupingConfirmed = false;
    $("confirmProjectGrouping").checked = false;
    $("confirmProjectGroupingButton").disabled = true;
    $("startButton").disabled = true;
    $("projectReviewStatus").textContent = "等待确认";
    $("projectReviewStatus").className = "status";
    $("recognitionSection").classList.remove("hidden");
    $("projectReviewSection").classList.add("hidden");
    $("loadingSection").classList.add("hidden");
    $("resultSection").classList.add("hidden");
    $("recognitionSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function selectFile(file) {
    if (!file || importBusy) return;
    resetResumeState();
    selectedFile = null;
    if (!ALLOWED_FILE.test(file.name)) {
      $("fileInput").value = "";
      showToast("请选择 PDF 或 DOCX 文件", true);
      return;
    }
    $("fileName").textContent = file.name;
    $("fileMeta").textContent = formatSize(file.size) + " · 正在解析文件正文";
    $("fileStatus").textContent = "正在解析";
    $("selectedFile").classList.remove("hidden");
    $("dropzone").classList.add("has-file");
    importBusy = true;
    try {
      const result = await extractFileText(file);
      if (!result.text.trim()) throw new Error("文件中没有提取到可校对文字");
      selectedFile = file;
      extractedText = result.text;
      extractionReport = result.quality || analyzeTextQuality(result.text);
      extractionMethod = result.method || "文件文字提取";
      photoCandidates = result.photoCandidates || [];
      $("fileMeta").textContent = `${formatSize(file.size)} · ${extractionMethod} · ${extractionReport.lineCount} 行`;
      $("fileStatus").textContent = extractionReport.passed ? "等待原文确认" : "需要人工校对";
      showSourceReview(extractedText, extractionReport, extractionMethod);
      showToast(extractionReport.passed ? "解析完成，请校对并确认原文" : "检测到解析质量问题，请校对或重新上传", !extractionReport.passed);
    } catch (error) {
      selectedFile = null;
      sourceResume = null;
      optimizedResume = null;
      $("fileStatus").textContent = "解析失败";
      $("fileMeta").textContent = formatSize(file.size) + " · " + error.message;
      $("recognitionSection").classList.add("hidden");
      $("reviewSection").classList.add("hidden");
      $("resultSection").classList.add("hidden");
      showToast(error.message + "；未回退到示例简历", true);
    } finally {
      importBusy = false;
    }
  }

  function resumeHtml(data) {
    const payload = JSON.stringify(data).replace(/<\//g, "<\\/");
    return templateHtml.replace("</style>", ".page{margin:0 auto;box-shadow:none}</style>").replace("__RESUME_JSON__", payload);
  }

  function renderOriginalFilePreview() {
    const frame = $("beforeFrame");
    revokeOriginalFileUrl();
    frame.removeAttribute("src");
    frame.removeAttribute("srcdoc");
    $("beforeFileName").textContent = selectedFile?.name || "用户上传的原始简历";
    if (selectedFile && /\.pdf$/i.test(selectedFile.name)) {
      originalFileUrl = URL.createObjectURL(selectedFile);
      frame.src = originalFileUrl;
      frame.title = `用户上传的 PDF 原文件：${selectedFile.name}`;
      return;
    }
    const fileName = escapeHtml(selectedFile?.name || "原始 DOCX 简历");
    frame.title = `用户上传的 DOCX 原文件：${selectedFile?.name || ""}`;
    frame.srcdoc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>html,body{height:100%;margin:0}body{display:grid;place-items:center;padding:44px;box-sizing:border-box;background:#f4f2ec;color:#243746;font:16px/1.7 system-ui,"Microsoft YaHei",sans-serif}.notice{max-width:520px;padding:28px;border:1px solid #d4d0c5;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.08)}h1{margin:0 0 12px;color:#245579;font:700 24px Georgia,"Songti SC",serif}p{margin:8px 0}.file{font-weight:800;word-break:break-all}.hint{color:#68737c;font-size:13px}</style></head><body><section class="notice"><h1>DOCX 原文件</h1><p class="file">${fileName}</p><p>Before 不套用酥神模板，也不使用解析后的 sourceResume 重新排版。</p><p class="hint">浏览器无法在离线静态页面中原样内嵌 DOCX。若需要视觉原稿对比，请将原简历另存为 PDF 后重新上传。</p></section></body></html>`;
  }

  function renderFullComparison() {
    renderOriginalFilePreview();
    $("afterFrame").srcdoc = resumeHtml(optimizedResume);
    $("resultPositioning").textContent = buildPositioning(sourceResume).title;
    $("resultSection").classList.remove("hidden");
    $("resultSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function runLoadingSteps() {
    const items = [...$("loadingSteps").querySelectorAll("li")];
    items.forEach(item => item.className = "");
    $("loadingSection").classList.remove("hidden");
    $("loadingSection").scrollIntoView({ behavior: "smooth", block: "start" });
    for (let index = 0; index < items.length; index += 1) {
      items.forEach((item, itemIndex) => {
        item.classList.toggle("active", itemIndex === index);
        item.classList.toggle("complete", itemIndex < index);
      });
      $("loadingProgress").textContent = (index + 1) + " / " + items.length;
      await wait(180);
    }
    items.forEach(item => { item.classList.remove("active"); item.classList.add("complete"); });
    await wait(120);
    $("loadingSection").classList.add("hidden");
  }

  async function startTransform() {
    if (!selectedFile || !sourceResume || !sourceConfirmed) return showToast("请先校对并确认原始简历文字", true);
    if (!projectGroupingConfirmed || !projectGroupingDraft) return showToast("请先确认项目边界", true);
    if (!templateHtml) return showToast("A4 模板尚未加载，请通过本地服务器或 GitHub Pages 打开", true);
    $("startButton").disabled = true;
    try {
      await runLoadingSteps();
      const candidate = buildOptimizedResume(sourceResume, projectGroupingDraft);
      const validation = validateFacts(sourceResume, candidate);
      candidate.fact_validation = validation;
      if (!validation.valid) {
        optimizedResume = null;
        showToast("事实校验未通过：" + validation.anomalies.map(item => item.type + ":" + item.value).join("、"), true);
        return;
      }
      optimizedResume = candidate;
      localStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(sourceResume));
      localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(optimizedResume));
      renderFullComparison();
      showToast("同源结构重组完成，事实校验通过");
    } finally {
      $("startButton").disabled = false;
    }
  }

  function enterEditor() {
    if (!sourceResume || !optimizedResume) return showToast("请先完成一键酥神化", true);
    const validation = validateFacts(sourceResume, optimizedResume);
    if (!validation.valid) {
      showToast("事实校验异常，已阻止进入最终简历", true);
      return;
    }
    localStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(sourceResume));
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(optimizedResume));
    window.name = JSON.stringify({ type: "sushen-resume-editor-handoff-v1", resume: optimizedResume });
    window.location.href = "../editor/index.html?from=transform";
  }

  async function init() {
    try {
      const response = await fetch(TEMPLATE_URL);
      if (!response.ok) throw new Error();
      templateHtml = await response.text();
    } catch (_) {
      showToast("A4 模板加载失败，请通过本地服务器或 GitHub Pages 打开", true);
    }
    const fileInput = $("fileInput");
    const dropzone = $("dropzone");
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fileInput.click();
      }
    });
    fileInput.addEventListener("change", () => selectFile(fileInput.files[0]));
    $("replaceButton").addEventListener("click", () => fileInput.click());
    $("sourceText").addEventListener("input", () => {
      sourceConfirmed = false;
      sourceResume = null;
      optimizedResume = null;
      projectGroupingDraft = null;
      projectGroupingConfirmed = false;
      localStorage.removeItem(SOURCE_STORAGE_KEY);
      $("confirmSource").checked = false;
      $("confirmSourceButton").disabled = true;
      $("recognitionSection").classList.add("hidden");
      $("projectReviewSection").classList.add("hidden");
      $("resultSection").classList.add("hidden");
      renderQualityReport(analyzeTextQuality($("sourceText").value), extractionMethod + " · 已编辑未确认");
    });
    $("confirmSource").addEventListener("change", () => {
      $("confirmSourceButton").disabled = !$("confirmSource").checked;
    });
    $("confirmSourceButton").addEventListener("click", confirmReviewedSource);
    $("openProjectReviewButton").addEventListener("click", openProjectReview);
    $("confirmProjectGrouping").addEventListener("change", () => {
      $("confirmProjectGroupingButton").disabled = !$("confirmProjectGrouping").checked;
    });
    $("confirmProjectGroupingButton").addEventListener("click", confirmProjectGrouping);
    $("uploadPhotoButton").addEventListener("click", () => $("photoInput").click());
    $("photoInput").addEventListener("change", async () => {
      try {
        const src = await imageFileToDataUrl($("photoInput").files[0]);
        choosePhoto({ src, source: "用户单独上传" }, -1);
        showToast("照片已选择并标记为用户确认");
      } catch (error) { showToast(error.message, true); }
    });
    $("removePhotoButton").addEventListener("click", () => choosePhoto(null, -1));
    [["photoCropX", "x"], ["photoCropY", "y"], ["photoZoom", "zoom"]].forEach(([id, key]) => {
      $(id).addEventListener("input", () => {
        if (!selectedPhoto) return;
        selectedPhoto.crop[key] = Number($(id).value);
        renderSelectedPhoto();
      });
    });
    $("startButton").addEventListener("click", startTransform);
    $("editorButton").addEventListener("click", enterEditor);
    window.addEventListener("beforeunload", revokeOriginalFileUrl);
  }

  init();
})();
