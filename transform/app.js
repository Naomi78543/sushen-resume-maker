(() => {
  "use strict";

  const TEMPLATE_URL = "../skills/sushen-resume-maker/assets/resume_template.html";
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
    ["skills", /^(专业技能|技能证书|技能及证书|技能|语言及技能|能力与技能)$/i],
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
  let toastTimer = 0;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
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
      claim_ids: ["SOURCE-" + String(index).padStart(3, "0")]
    };
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
      pages: pageReports
    };
  }

  async function extractDocxText(file) {
    const mammoth = await ensureMammoth();
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const text = cleanLine(result.value).length ? result.value : "";
    return { text, method: "DOCX 原生文字", quality: analyzeTextQuality(text), pages: [] };
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
    lines.forEach(line => {
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

  function parseExperiences(lines, fileName, counter) {
    const entries = [];
    let current = null;
    lines.forEach(line => {
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
    lines.forEach((line, index) => {
      const text = stripBullet(line);
      const next = lines[index + 1] || "";
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
    return lines.map(line => {
      const text = stripBullet(line);
      return { name: withoutDate(text), date: dateFromLine(text), raw_text: text };
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
      profile: contactProfile(sections.profile.length ? sections.profile : lines.slice(0, 8)),
      education: parseEducation(sections.education, file.name, counter),
      experience: parseExperiences(sections.experience, file.name, counter),
      open_source: [],
      projects: parseProjects(sections.projects, file.name, counter),
      awards: parseAwards(sections.awards),
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
    add(data.profile && data.profile.location);
    (data.profile && data.profile.contacts || []).forEach(contact => add(contact.value));
    (data.education || []).forEach(item => {
      add(item.institution); add(item.program); add(item.degree); add(item.dates); addFacts(item.bullets);
    });
    (data.experience || []).forEach(exp => {
      add(exp.company); add(exp.team); add(exp.dates);
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
    const output = [];
    (facts || []).forEach(item => {
      const source = typeof item === "string" ? { text: item } : item;
      const text = cleanLine(source.text || "");
      if (!text) return;
      let parts = text.split(/[；;。]+/).map(cleanLine).filter(Boolean);
      if (parts.length === 1 && text.length > 42) {
        const commaParts = text.split(/[，,]+/).map(cleanLine).filter(part => part.length >= 6);
        if (commaParts.length > 1) parts = commaParts;
      }
      parts.forEach(part => output.push(Object.assign({}, clone(source), { text: part, raw_text: source.raw_text || text })));
    });
    return output;
  }

  function classifyFacts(facts) {
    const result = { background: [], impact: [], responsibilities: [], actions: [] };
    atomicFacts(facts).forEach(item => {
      const text = item.text || "";
      if (/^(?:项目)?(?:背景|目标|问题|痛点|需求)|^(?:面向|围绕|针对|为了解决)|业务(?:背景|场景)/i.test(text)) result.background.push(item);
      else if (metricsInText(text).length || /提升|增长|降低|缩短|节省|实现|达到|累计|覆盖|上线|沉淀|形成|完成|产出|交付|落地/i.test(text)) result.impact.push(item);
      else if (/负责|主导|牵头|协助|参与|承接|Owner|责任|职责/i.test(text)) result.responsibilities.push(item);
      else if (/通过|基于|使用|采用|设计|搭建|构建|分析|制定|优化|推动|拆解|调研|复盘|迭代|协调|输出|整理|维护|运营|开发|测试/i.test(text)) result.actions.push(item);
      else result.responsibilities.push(item);
    });
    return result;
  }

  function buildOptimizedResume(source) {
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
    optimized.experience = (source.experience || []).map(exp => {
      const copied = clone(exp);
      copied.projects = (exp.projects || []).map(project => {
        const allFacts = ["background", "impact", "responsibilities", "actions"].flatMap(key => project[key] || []);
        return Object.assign({}, clone(project), classifyFacts(allFacts), { missingMetrics: clone(project.missingMetrics || []) });
      });
      return copied;
    });
    optimized.fact_validation = null;
    return optimized;
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
      ...(data.experience || []).flatMap(item => (item.projects || []).map(project => project.name)),
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

  function showSourceReview(text, report, method) {
    $("sourceText").value = text;
    $("confirmSource").checked = false;
    $("confirmSourceButton").disabled = true;
    renderQualityReport(report, method);
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
        quality: report
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
    sourceResume = null;
    optimizedResume = null;
    extractedText = "";
    extractionReport = null;
    extractionMethod = "";
    sourceConfirmed = false;
    localStorage.removeItem(SOURCE_STORAGE_KEY);
    $("reviewSection").classList.add("hidden");
    $("recognitionSection").classList.add("hidden");
    $("loadingSection").classList.add("hidden");
    $("resultSection").classList.add("hidden");
  }

  function showRecognition() {
    renderStats(analyzeResume(sourceResume));
    renderRecognizedSections(sourceResume);
    renderPositioning(buildPositioning(sourceResume));
    $("recognitionStatus").textContent = "真实文件解析完成";
    $("recognitionSection").classList.remove("hidden");
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

  function renderFullComparison() {
    $("beforeFrame").srcdoc = resumeHtml(sourceResume);
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
    if (!templateHtml) return showToast("A4 模板尚未加载，请通过本地服务器或 GitHub Pages 打开", true);
    $("startButton").disabled = true;
    try {
      await runLoadingSteps();
      const candidate = buildOptimizedResume(sourceResume);
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
      localStorage.removeItem(SOURCE_STORAGE_KEY);
      $("confirmSource").checked = false;
      $("confirmSourceButton").disabled = true;
      $("recognitionSection").classList.add("hidden");
      $("resultSection").classList.add("hidden");
      renderQualityReport(analyzeTextQuality($("sourceText").value), extractionMethod + " · 已编辑未确认");
    });
    $("confirmSource").addEventListener("change", () => {
      $("confirmSourceButton").disabled = !$("confirmSource").checked;
    });
    $("confirmSourceButton").addEventListener("click", confirmReviewedSource);
    $("startButton").addEventListener("click", startTransform);
    $("editorButton").addEventListener("click", enterEditor);
  }

  init();
})();
