(() => {
  "use strict";

  const TEMPLATE_URL = "../skills/sushen-resume-maker/assets/resume_template.html?v=20260905-portfolio-line";
  const LOGO_CATALOG_URL = "../assets/company-logos/catalog.json?v=20260825-logo-catalog-v2";
  const SAMPLE_URL = "sample.resume.json";
  const STORAGE_KEY = "sushen-resume-editor-v1";
  const HANDOFF_KEY = "sushen-evidence-handoff-v1";
  const MAX_HISTORY = 60;

  const editorPanel = document.getElementById("editorPanel");
  const previewFrame = document.getElementById("previewFrame");
  const pageStatus = document.getElementById("pageStatus");
  const saveState = document.getElementById("saveState");
  const toast = document.getElementById("toast");
  const fileInput = document.getElementById("fileInput");
  const undoButton = document.getElementById("undoButton");
  const redoButton = document.getElementById("redoButton");
  const zoomSelect = document.getElementById("zoomSelect");

  let templateHtml = "";
  let sampleData = null;
  let data = null;
  let handoff = null;
  let activeTab = "profile";
  let history = [];
  let historyIndex = -1;
  let inputHistoryTimer = 0;
  let previewTimer = 0;
  let toastTimer = 0;

  const clone = value => JSON.parse(JSON.stringify(value));
  const stringify = value => JSON.stringify(value);

  function element(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = options.text;
    if (options.type) node.type = options.type;
    if (options.title) node.title = options.title;
    if (options.ariaLabel) node.setAttribute("aria-label", options.ariaLabel);
    const list = Array.isArray(children) ? children : [children];
    list.filter(Boolean).forEach(child => node.append(child));
    return node;
  }

  function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast show${isError ? " error" : ""}`;
    toastTimer = window.setTimeout(() => { toast.className = "toast"; }, 2600);
  }

  function normalizeData(value) {
    const next = value && typeof value === "object" ? clone(value) : {};
    next.mode ||= "source_grounded";
    next.source_title ||= "在线编辑器导入数据";
    next.profile ||= {};
    next.profile.contacts ||= [];
    next.profile.photo ||= { src: "", crop: { x: 50, y: 50, zoom: 1 }, confirmed: false };
    next.profile.photo.crop ||= { x: 50, y: 50, zoom: 1 };
    next.profile.portfolio ||= { url: "", code: "", displayName: "" };
    next.endorsements ||= [];
    next.education ||= [];
    next.experience ||= [];
    next.experience.forEach(exp => {
      exp.brandMode ||= "auto";
      exp.links ||= exp.link ? [exp.link] : [];
      delete exp.link;
      (exp.projects || []).forEach(project => {
        ["background", "impact", "responsibilities", "actions"].forEach(key => {
          project[key] ||= [];
          project[key] = project[key].map(item => {
            if (typeof item === "string") return item;
            item.highlights ||= [];
            return item;
          });
        });
      });
    });
    next.open_source ||= [];
    next.projects ||= [];
    next.awards ||= [];
    next.skills ||= [];
    next.section_titles ||= {};
    next.section_titles.education ||= "教育经历";
    next.section_titles.experience ||= "实习 / 工作经历";
    // 经历条目内三级小标题(可改名)
    next.labels ||= {};
    next.labels.background ||= "背景";
    next.labels.impact ||= "指标与效果";
    next.labels.responsibilities ||= "我的职责";
    next.labels.keywords ||= "技术关键词";
    next.sections ||= [];
    // 页面排版(导出 PDF / 预览分页共用):页边距(mm)+页眉页脚+页码
    next.page_setup ||= {};
    const clampMm = value => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.min(60, Math.max(0, n)) : null;
    };
    const pageSetup = next.page_setup;
    const PAGE_SETUP_DEFAULTS = { marginTopMm: 12, marginBottomMm: 13, marginLeftMm: 13, marginRightMm: 13, headerText: "", footerText: "", showPageNumbers: true, smartPacking: false };
    ["marginTopMm", "marginBottomMm", "marginLeftMm", "marginRightMm"].forEach(key => {
      const v = clampMm(pageSetup[key]);
      pageSetup[key] = v == null ? PAGE_SETUP_DEFAULTS[key] : v;
    });
    pageSetup.headerText = typeof pageSetup.headerText === "string" ? pageSetup.headerText : "";
    pageSetup.footerText = typeof pageSetup.footerText === "string" ? pageSetup.footerText : "";
    pageSetup.showPageNumbers = pageSetup.showPageNumbers !== false;
    pageSetup.smartPacking = pageSetup.smartPacking === true;
    // 丢弃非默认字段,保证存储/JSON 与引擎生效值一致
    next.page_setup = { ...PAGE_SETUP_DEFAULTS, ...pageSetup };
    // Build layout: keep existing entries, add missing builtin + all custom sections
    if (!Array.isArray(next.layout)) {
      next.layout = [{ key: "education" }, { key: "experience" }];
    } else {
      // Keep valid entries (builtin or custom-N pointing to existing section)
      const validKeys = new Set(["education", "experience"]);
      next.sections.forEach((_, i) => validKeys.add(`custom-${i}`));
      next.layout = next.layout.filter(item => item && typeof item === "object" && validKeys.has(item.key));
      const keysInLayout = new Set(next.layout.map(item => item.key));
      // Append missing builtins
      for (const k of ["education", "experience"]) {
        if (!keysInLayout.has(k)) next.layout.push({ key: k });
      }
      // Append missing custom sections
      next.sections.forEach((_, i) => {
        const ck = `custom-${i}`;
        if (!keysInLayout.has(ck)) next.layout.push({ key: ck });
      });
    }
    // Ensure sections array is long enough for all custom-N in layout
    let maxCustomIndex = -1;
    next.layout.forEach(item => {
      if (item && item.key && item.key.startsWith("custom-")) {
        const idx = parseInt(item.key.slice(7), 10);
        if (!isNaN(idx) && idx > maxCustomIndex) maxCustomIndex = idx;
      }
    });
    while (next.sections.length <= maxCustomIndex) {
      next.sections.push({ title: "", items: [] });
    }
    next.sections.forEach(section => {
      if (!section || typeof section !== "object") return;
      section.title ||= "";
      section.items ||= [];
      section.items.forEach(item => {
        if (!item || typeof item !== "object") return;
        item.title ||= "";
        item.dates ||= "";
        item.bullets ||= [];
      });
    });
    return next;
  }

  // Aggressive text cleaner used by the "清洗脏字符" button.
  // Strips invisible Unicode chars, surrogates, PUA, IVS, weird spaces,
  // and collapses mixed ideographic/regular spaces.
  const CLEAN_STRICT_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\u3000\u303F\uFE00-\uFE0F\uFEFF\uFFF0-\uFFFF\uE000-\uF8FF]/g;
  const SOFT_HYPHEN_RE = /\u00AD/g;
  let cleanedCharCount = 0;

  function cleanString(s) {
    if (typeof s !== "string") return s;
    const before = s;
    let out = s;
    // Normalize ideographic/half/full-width spaces to ASCII space
    out = out.replace(/[\u3000\u303F\u205F\u00A0]/g, " ");
    // Drop strict set (control, surrogates, PUA, IVS, ZW*, etc.)
    out = out.replace(CLEAN_STRICT_RE, "");
    // Strip soft hyphens anywhere they slipped through
    out = out.replace(SOFT_HYPHEN_RE, "");
    if (out !== before) cleanedCharCount += before.length - out.length;
    return out;
  }

  function deepClean(value) {
    if (typeof value === "string") return cleanString(value);
    if (Array.isArray(value)) return value.map(deepClean);
    if (value && typeof value === "object") {
      const result = {};
      for (const k of Object.keys(value)) result[k] = deepClean(value[k]);
      return result;
    }
    return value;
  }

  function cleanDraft() {
    if (!data) return;
    if (!window.confirm("扫描并清洗当前草稿里的不可见字符、私有区字符、变体选择符等？建议在 PDF/PDF OCR 提取的数据上使用。")) return;
    cleanedCharCount = 0;
    data = deepClean(data);
    saveLocal();
    renderEditor();
    renderPreview();
    showToast(cleanedCharCount > 0 ? `已清洗 ${cleanedCharCount} 个字符` : "未发现脏字符");
  }

  function validateImportedData(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON 顶层必须是对象");
    if (!value.profile || typeof value.profile !== "object") throw new Error("缺少 profile 对象");
    for (const key of ["education", "experience", "projects", "skills", "endorsements"]) {
      if (value[key] !== undefined && !Array.isArray(value[key])) throw new Error(`${key} 必须是数组`);
    }
  }

  function saveLocal() {
    saveState.textContent = "正在保存…";
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      window.setTimeout(() => { saveState.textContent = "已在本地保存"; }, 160);
    } catch (_) {
      saveState.textContent = "本地保存失败";
    }
  }

  function resetHistory() {
    history = [clone(data)];
    historyIndex = 0;
    updateHistoryButtons();
  }

  function pushHistory() {
    clearTimeout(inputHistoryTimer);
    inputHistoryTimer = 0;
    const current = stringify(data);
    if (historyIndex >= 0 && stringify(history[historyIndex]) === current) return;
    history = history.slice(0, historyIndex + 1);
    history.push(clone(data));
    if (history.length > MAX_HISTORY) history.shift();
    historyIndex = history.length - 1;
    updateHistoryButtons();
  }

  function scheduleHistory() {
    clearTimeout(inputHistoryTimer);
    inputHistoryTimer = window.setTimeout(pushHistory, 650);
  }

  function updateHistoryButtons() {
    undoButton.disabled = historyIndex <= 0;
    redoButton.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
  }

  function undo() {
    if (inputHistoryTimer) pushHistory();
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    data = clone(history[historyIndex]);
    saveLocal();
    renderEditor();
    renderPreview();
    updateHistoryButtons();
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    data = clone(history[historyIndex]);
    saveLocal();
    renderEditor();
    renderPreview();
    updateHistoryButtons();
  }

  function scalarChanged() {
    saveLocal();
    scheduleHistory();
    schedulePreview();
  }

  function structuralChange(mutator) {
    if (inputHistoryTimer) pushHistory();
    mutator();
    pushHistory();
    saveLocal();
    renderEditor();
    renderPreview();
  }

  function field(label, value, onInput, options = {}) {
    const wrapper = element("label", { className: "field" });
    wrapper.append(element("span", { text: label }));
    let control;
    if (options.type === "select") {
      control = element("select");
      (options.choices || []).forEach(choice => {
        const option = element("option", { text: choice.label });
        option.value = choice.value;
        option.selected = choice.value === value;
        control.append(option);
      });
      control.addEventListener("change", () => { onInput(control.value); scalarChanged(); });
    } else if (options.multiline) {
      control = element("textarea");
      control.value = value || "";
      control.placeholder = options.placeholder || "";
      control.addEventListener("input", () => { onInput(control.value); scalarChanged(); });
    } else {
      control = element("input");
      control.type = options.inputType || "text";
      control.value = value || "";
      control.placeholder = options.placeholder || "";
      control.addEventListener("input", () => { onInput(control.value); scalarChanged(); });
    }
    wrapper.append(control);
    return wrapper;
  }

  function actionButtons(array, index, label, options = {}) {
    const actions = element("div", { className: "row-actions" });
    const up = element("button", { className: "mini-button", text: "↑", type: "button", ariaLabel: `上移${label}` });
    const down = element("button", { className: "mini-button", text: "↓", type: "button", ariaLabel: `下移${label}` });
    const remove = element("button", { className: "mini-button danger", text: "删除", type: "button", ariaLabel: `删除${label}` });
    up.disabled = index === 0;
    down.disabled = index === array.length - 1;
    up.addEventListener("click", () => structuralChange(() => {
      [array[index - 1], array[index]] = [array[index], array[index - 1]];
    }));
    down.addEventListener("click", () => structuralChange(() => {
      [array[index + 1], array[index]] = [array[index], array[index + 1]];
    }));
    if (!options.noRemove) {
      remove.addEventListener("click", () => structuralChange(() => array.splice(index, 1)));
      actions.append(up, down, remove);
    } else {
      actions.append(up, down);
    }
    return actions;
  }

  function card(title, array, index, tint = "", options = {}) {
    const wrapper = element("section", { className: `section-card${tint ? ` tint-${tint}` : ""}` });
    const head = element("div", { className: "card-head" });
    head.append(element("h3", { text: title }), actionButtons(array, index, title, options));
    wrapper.append(head);
    return wrapper;
  }

  function addButton(label, onClick) {
    const button = element("button", { className: "add-button", text: `＋ ${label}`, type: "button" });
    button.addEventListener("click", () => structuralChange(onClick));
    return button;
  }

  function fieldGrid(...fields) {
    return element("div", { className: "field-grid" }, fields);
  }

  function bulletObject(text = "") {
    return {
      text,
      verification: "user_attested",
      source_note: "在线编辑器补充，需回写 Claim Ledger",
      claim_ids: [],
      highlights: detectHighlights(text)
    };
  }

  function detectHighlights(text) {
    const values = String(text || "").match(/\d+(?:\.\d+)?(?:%|\+|万\+?|亿|次|家|人|个|天|月|年|小时|分钟|项|条|份|元|万元|美元|单|场)?|GMV|CTR|CVR|SQL|AI Agent|SOP|A\/B Test(?:ing)?|Python|Excel|Prompt Engineering/gi) || [];
    return [...new Set(values.map(item => item.trim()).filter(Boolean))];
  }

  function bulletEditor(title, items, options = {}) {
    if (options.area) return areaBulletEditor(title, items, options);
    const wrap = element("div", { className: "subsection" });
    const heading = element("div", { className: "subsection-title" });
    heading.append(element("span", { text: title }));
    const add = element("button", { className: "mini-button", text: "＋ 添加", type: "button" });
    add.addEventListener("click", () => structuralChange(() => items.push(bulletObject())));
    heading.append(add);
    wrap.append(heading);
    items.forEach((item, index) => {
      const value = typeof item === "string" ? item : item.text || "";
      const row = element("div", { className: "bullet-row" });
      const content = element("div", { className: "bullet-content" });
      const textarea = element("textarea");
      textarea.value = value;
      textarea.placeholder = "写清动作、对象、方法和真实结果";
      textarea.addEventListener("input", () => {
        if (typeof items[index] === "string") items[index] = bulletObject(textarea.value);
        else items[index].text = textarea.value;
        scalarChanged();
      });
      const highlightInput = element("input");
      highlightInput.type = "text";
      highlightInput.placeholder = "重点词：数字、GMV、CTR、SQL、AI Agent、SOP（逗号分隔）";
      highlightInput.value = typeof item === "string" ? detectHighlights(item).join(", ") : (item.highlights || []).join(", ");
      highlightInput.addEventListener("input", () => {
        if (typeof items[index] === "string") items[index] = bulletObject(textarea.value);
        items[index].highlights = highlightInput.value.split(/[,，]/).map(value => value.trim()).filter(Boolean);
        scalarChanged();
      });
      const autoButton = element("button", { className: "mini-button", text: "自动识别重点词", type: "button" });
      autoButton.addEventListener("click", () => {
        const detected = detectHighlights(textarea.value);
        if (typeof items[index] === "string") items[index] = bulletObject(textarea.value);
        items[index].highlights = detected;
        highlightInput.value = detected.join(", ");
        scalarChanged();
      });
      content.append(textarea, highlightInput, autoButton);
      const controls = element("div", { className: "row-actions" });
      const up = element("button", { className: "mini-button", text: "↑", type: "button", ariaLabel: "上移要点" });
      const down = element("button", { className: "mini-button", text: "↓", type: "button", ariaLabel: "下移要点" });
      const remove = element("button", { className: "mini-button danger", text: "×", type: "button", ariaLabel: "删除要点" });
      up.disabled = index === 0;
      down.disabled = index === items.length - 1;
      up.addEventListener("click", () => structuralChange(() => { [items[index - 1], items[index]] = [items[index], items[index - 1]]; }));
      down.addEventListener("click", () => structuralChange(() => { [items[index + 1], items[index]] = [items[index], items[index + 1]]; }));
      remove.addEventListener("click", () => structuralChange(() => items.splice(index, 1)));
      controls.append(up, down, remove);
      row.append(content, controls);
      wrap.append(row);
    });
    return wrap;
  }

  // —— 合并多行文本区(项目符号/缩进为文本符号,所见即所得;不改变 items 数组语义) ——
  function areaBulletEditor(title, items, options = {}) {
    const wrap = element("div", { className: "subsection" });
    const heading = element("div", { className: "subsection-title" });
    heading.append(element("span", { text: title }));
    wrap.append(heading);

    // 单块文本区:每行 = 一条内容。行首可由工具加符号/缩进,均作为该行 text 的一部分真实渲染。
    const textarea = element("textarea");
    textarea.className = options.large ? "bullet-area large" : "bullet-area";
    textarea.placeholder = "一行一条内容。可点上方按钮加项目符号、缩进；直接回车另起一行。";
    const render = () => {
      textarea.value = (items || []).map(item => (typeof item === "string" ? item : (item && item.text) || "")).join("\n");
    };
    render();
    const syncFromText = () => {
      const lines = textarea.value.split("\n");
      const oldItems = Array.isArray(items) ? items.slice() : [];
      const next = [];
      lines.forEach((line, index) => {
        const trimmed = line.replace(/^\s+|\s+$/g, ""); // 纯空白行不入库
        if (!trimmed) return;
        const prev = oldItems[index];
        if (prev && typeof prev === "object" && prev.text === trimmed) { next.push(prev); return; }
        if (prev && typeof prev === "object") {
          // 文本变化:保留旧高亮词中仍出现在新文本里的,并补上自动识别的
          const kept = (prev.highlights || []).filter(word => trimmed.includes(word));
          const merged = Object.assign({}, prev, { text: trimmed });
          merged.highlights = [...new Set([...kept, ...detectHighlights(trimmed)])];
          next.push(merged);
          return;
        }
        next.push(bulletObject(trimmed));
      });
      items.splice(0, items.length, ...next);
    };
    const commit = () => {
      syncFromText();
      scalarChanged();
    };
    textarea.addEventListener("input", commit);

    const applyToSelectedLines = (mutator) => {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = textarea.value.slice(0, start);
      const after = textarea.value.slice(end);
      const beforeLines = before.split("\n");
      const lines = textarea.value.split("\n");
      const startLine = beforeLines.length - 1;
      const endLine = startLine + (after ? after.split("\n").length - 1 : 0) + (end > start && after === "" ? 1 : 0);
      const clampedEnd = Math.min(endLine, lines.length - 1);
      let changed = false;
      for (let i = startLine; i <= clampedEnd; i++) {
        const nextLine = mutator(lines[i]);
        if (nextLine !== lines[i]) { lines[i] = nextLine; changed = true; }
      }
      if (!changed) return;
      textarea.value = lines.join("\n");
      // 保持光标在首操作行行首之后,避免跳走
      const prefix = lines.slice(0, startLine).join("\n");
      const caret = prefix.length + (prefix ? 1 : 0) + (lines[startLine] ? (lines[startLine].match(/^\s*/) || [""])[0].length : 0);
      textarea.setSelectionRange(Math.min(caret, textarea.value.length), Math.min(caret, textarea.value.length));
      commit();
    };
    const toggleBullet = (line) => /^[•·]\s*/.test(line) ? line.replace(/^[•·]\s*/, "") : `• ${line}`;
    const indentMore = (line) => /^\s/.test(line) ? `  ${line}` : `  ${line}`;
    const indentLess = (line) => line.replace(/^( {1,4}|\t)/, "");

    const toolbar = element("div", { className: "bullet-toolbar" });
    const makeTool = (label, aria, fn) => {
      const btn = element("button", { className: "mini-button tool", type: "button", text: label, ariaLabel: aria });
      btn.addEventListener("click", () => applyToSelectedLines(fn));
      return btn;
    };
    const autoHighlightBtn = element("button", { className: "mini-button tool", type: "button", text: "自动识别重点词", ariaLabel: "按行自动识别数字/指标等重点词（不改变文本）" });
    autoHighlightBtn.addEventListener("click", () => {
      (items || []).forEach(item => {
        if (typeof item === "object" && item.text) item.highlights = detectHighlights(item.text);
      });
      scalarChanged();
    });
    toolbar.append(
      makeTool("项目符号", "为所选行添加或移除项目符号", toggleBullet),
      makeTool("增加缩进", "为所选行增加缩进", indentMore),
      makeTool("减少缩进", "减少所选行缩进", indentLess),
      autoHighlightBtn
    );
    wrap.append(toolbar, textarea);
    // 说明行(轻量,不占用太多空间)
    wrap.append(element("p", { className: "field-hint", text: "每行将作为独立一条渲染；工具栏操作作用于光标所在行或多行选区。" }));
    return wrap;
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

  function renderPhotoEditor(profile) {
    const photo = profile.photo;
    const block = element("section", { className: "section-card photo-editor tint-green" });
    block.append(element("div", { className: "card-head" }, [element("h3", { text: "候选人照片" })]));
    const preview = element("div", { className: "photo-preview" });
    if (photo.src && photo.confirmed) {
      const image = element("img");
      image.src = photo.src;
      image.alt = "候选人照片预览";
      image.style.objectPosition = `${Number(photo.crop.x || 50)}% ${Number(photo.crop.y || 50)}%`;
      image.style.transform = `scale(${Number(photo.crop.zoom || 1)})`;
      preview.append(image);
    } else preview.append(element("span", { text: "未使用照片" }));
    const input = element("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.hidden = true;
    input.addEventListener("change", async () => {
      try {
        photo.src = await imageFileToDataUrl(input.files[0]);
        photo.confirmed = true;
        photo.crop = { x: 50, y: 50, zoom: 1 };
        pushHistory(); saveLocal(); renderEditor(); renderPreview();
      } catch (error) { showToast(error.message, true); }
    });
    const actions = element("div", { className: "json-actions" });
    const upload = element("button", { className: "button", text: photo.src ? "更换照片" : "上传照片", type: "button" });
    upload.addEventListener("click", () => input.click());
    const remove = element("button", { className: "button", text: "删除照片", type: "button" });
    remove.disabled = !photo.src;
    remove.addEventListener("click", () => structuralChange(() => { profile.photo = { src: "", crop: { x: 50, y: 50, zoom: 1 }, confirmed: false }; }));
    actions.append(upload, remove);
    block.append(preview, input, actions);
    if (photo.src) {
      const cropGrid = element("div", { className: "crop-grid" });
      [["水平位置", "x", 0, 100, 1], ["垂直位置", "y", 0, 100, 1], ["缩放", "zoom", 1, 2, 0.05]].forEach(([label, key, min, max, step]) => {
        const wrapper = element("label", { className: "field" });
        wrapper.append(element("span", { text: label }));
        const range = element("input");
        range.type = "range"; range.min = min; range.max = max; range.step = step; range.value = photo.crop[key] ?? (key === "zoom" ? 1 : 50);
        range.addEventListener("input", () => {
          photo.crop[key] = Number(range.value);
          const image = preview.querySelector("img");
          if (image) {
            image.style.objectPosition = `${Number(photo.crop.x || 50)}% ${Number(photo.crop.y || 50)}%`;
            image.style.transform = `scale(${Number(photo.crop.zoom || 1)})`;
          }
          scalarChanged();
        });
        wrapper.append(range); cropGrid.append(wrapper);
      });
      block.append(cropGrid);
    }
    return block;
  }

  function renderEndorsementEditor() {
    const title = element("div", { className: "subsection-title" });
    title.append(element("span", { text: "奖项与事实背书（最多展示 3 条）" }));
    editorPanel.append(title);
    data.endorsements.forEach((item, index) => {
      const block = card(item.text || `事实背书 ${index + 1}`, data.endorsements, index, "green");
      block.append(
        field("认可内容", item.text, value => { item.text = value; }, { multiline: true }),
        field("证据来源", item.source, value => { item.source = value; }, { placeholder: "奖项、导师评价、客户反馈或正式证明" }),
        field("验证状态", item.verification || "user_attested", value => { item.verification = value; }, { type: "select", choices: [
          { value: "source_grounded", label: "原始材料明确支持" },
          { value: "user_attested", label: "用户本人确认" }
        ] })
      );
      editorPanel.append(block);
    });
    editorPanel.append(addButton("奖项或事实背书", () => data.endorsements.push({ text: "", source: "", verification: "user_attested", source_note: "在线编辑器补充", claim_ids: [], highlights: [] })));
  }

  function renderProfile() {
    editorPanel.append(element("p", { className: "panel-intro", text: "修改姓名、定位与联系方式。所有内容只保存在当前浏览器。" }));
    const profile = data.profile;
    const main = element("section", { className: "section-card tint-blue" });
    main.append(
      field("姓名", profile.name, value => { profile.name = value; }),
      field("求职定位 / Headline", profile.headline, value => { profile.headline = value; }, { multiline: true }),
      field("自动人设 / 候选人定位", profile.summary && profile.summary.text || "", value => {
        profile.summary = value ? { text: value, verification: "user_attested", source_note: "基于已确认经历与技能生成，用户确认", claim_ids: [], highlights: detectHighlights(value) } : null;
      }, { multiline: true, placeholder: "只总结原始经历中已经存在的岗位、能力和方向，不冒充第三方评价。" }),
      field("所在地", profile.location, value => { profile.location = value; }),
      field("作品集 / 网盘链接（显示在头部下方）", profile.portfolio && profile.portfolio.url || "", value => {
        profile.portfolio ||= {};
        profile.portfolio.url = value;
      }, { placeholder: "https://pan.baidu.com/…" }),
      field("提取码（可选）", profile.portfolio && profile.portfolio.code || "", value => {
        profile.portfolio ||= {};
        profile.portfolio.code = value;
      }),
      field("链接显示文字（可选，默认显示完整链接）", profile.portfolio && profile.portfolio.displayName || "", value => {
        profile.portfolio ||= {};
        profile.portfolio.displayName = value;
      })
    );
    editorPanel.append(main, renderPhotoEditor(profile));

    profile.contacts.forEach((contact, index) => {
      const item = card(contact.label || `联系方式 ${index + 1}`, profile.contacts, index);
      item.append(
        fieldGrid(
          field("标签", contact.label, value => { contact.label = value; }),
          field("内容", contact.value, value => { contact.value = value; })
        ),
        field("链接（可选）", contact.url, value => { contact.url = value; }, { placeholder: "mailto: 或 https://" })
      );
      editorPanel.append(item);
    });
    editorPanel.append(addButton("联系方式", () => profile.contacts.push({ label: "链接", value: "", url: "" })));
    renderEndorsementEditor();
  }

  function renderEducation() {
    editorPanel.append(element("p", { className: "panel-intro", text: "学校 Title、成绩和排名必须能够回到真实材料或官方来源。" }));
    data.education.forEach((item, index) => {
      item.bullets ||= [];
      const block = card(item.institution || `教育经历 ${index + 1}`, data.education, index, "blue");
      block.append(
        field("学校", item.institution, value => { item.institution = value; }),
        fieldGrid(
          field("专业 / 项目", item.program, value => { item.program = value; }),
          field("学位", item.degree, value => { item.degree = value; })
        ),
        field("时间", item.dates, value => { item.dates = value; }),
        bulletEditor("教育要点", item.bullets)
      );
      editorPanel.append(block);
    });
    editorPanel.append(addButton("教育经历", () => data.education.push({ institution: "", program: "", degree: "", dates: "", bullets: [] })));
  }

  function projectEditor(project, projects, projectIndex) {
    project.background ||= [];
    project.impact ||= [];
    project.responsibilities ||= [];
    project.actions ||= [];
    project.keywords ||= [];
    project.missingMetrics ||= [];
    const block = element("div", { className: "project-card" });
    const head = element("div", { className: "card-head" });
    head.append(element("h3", { text: project.name || `项目 ${projectIndex + 1}` }), actionButtons(projects, projectIndex, "项目"));
    block.append(
      head,
      field("项目名称", project.name, value => { project.name = value; }),
      field("副标题", project.subtitle, value => { project.subtitle = value; }),
      bulletEditor(data.labels.background || "背景", project.background, { area: true }),
      bulletEditor(data.labels.impact || "指标与效果", project.impact, { area: true }),
      bulletEditor(data.labels.responsibilities || "我的职责", project.responsibilities, { area: true, large: true }),
      bulletEditor(`关键动作 / 方法（A4 中合并到“${data.labels.responsibilities || "我的职责"}”）`, project.actions, { area: true }),
      field("待补数据提示（仅编辑器可见）", project.missingMetrics.join("\n"), value => {
        project.missingMetrics = value.split(/\n/).map(item => item.trim()).filter(Boolean);
      }, { multiline: true }),
      field("技术关键词（正式简历单独成行，用逗号分隔）", project.keywords.join(", "), value => {
        project.keywords = value.split(/[,，]/).map(x => x.trim()).filter(Boolean);
      })
    );
    return block;
  }

  function experienceLinksEditor(exp) {
    exp.links ||= [];
    const wrap = element("div", { className: "subsection" });
    const title = element("div", { className: "subsection-title" });
    title.append(element("span", { text: "公司旁作品链接（只填写真实链接）" }));
    const add = element("button", { className: "mini-button", text: "＋ 添加", type: "button" });
    add.addEventListener("click", () => structuralChange(() => exp.links.push({ label: "作品集", url: "", verification: "user_attested" })));
    title.append(add); wrap.append(title);
    exp.links.forEach((item, index) => {
      const row = element("div", { className: "link-editor-row" });
      row.append(
        field("标签", item.label, value => { item.label = value; }),
        field("https:// 链接", item.url, value => { item.url = value; }, { placeholder: "https://" }),
        actionButtons(exp.links, index, "作品链接")
      );
      wrap.append(row);
    });
    return wrap;
  }

  function renderExperience() {
    editorPanel.append(element("p", { className: "panel-intro", text: "经历条默认按浅粉 → 浅灰 → 浅蓝自动轮换；也可以为单段经历手动指定颜色。下方小标题为条目内通用文案，可改成自己习惯的名字（作用于所有经历与预览 / PDF 导出）。" }));
    // 三级小标题(可改名)
    data.labels ||= {};
    const labelFields = [
      ["background", "背景", "背景"],
      ["impact", "指标与效果", "指标与效果"],
      ["responsibilities", "我的职责", "职责"],
      ["keywords", "技术关键词", "技术关键词"]
    ];
    const labelBlock = element("div", { className: "card label-edit-card" });
    labelBlock.append(element("h4", { text: "条目内小标题（可改名）" }));
    labelBlock.append(element("p", { className: "field-hint", text: "此处修改会应用到所有经历条目的该小标题，并同步预览与 PDF/PNG 导出。" }));
    labelFields.forEach(([key, fallback, short]) => {
      labelBlock.append(field("「" + short + "」标题名", data.labels[key] || fallback, value => {
        data.labels[key] = value || fallback;
      }));
    });
    editorPanel.append(labelBlock);
    const brandChoices = [
      { value: "auto", label: "自动轮换" },
      { value: "red", label: "浅红" },
      { value: "blue", label: "浅蓝" },
      { value: "green", label: "浅绿" },
      { value: "gray", label: "浅灰" }
    ];
    data.experience.forEach((exp, index) => {
      exp.projects ||= [];
      exp.tags ||= [];
      const block = card(exp.company || `经历 ${index + 1}`, data.experience, index, exp.brand || "gray");
      block.append(
        field("公司 / 项目组织", exp.company, value => { exp.company = value; }),
        field("部门与岗位", exp.team, value => { exp.team = value; }),
        fieldGrid(
          field("时间", exp.dates, value => { exp.dates = value; }),
          field("经历条颜色", exp.brandMode === "manual" ? (exp.brand || "gray") : "auto", value => {
            if (value === "auto") {
              exp.brand = "auto";
              exp.brandMode = "auto";
            } else {
              exp.brand = value;
              exp.brandMode = "manual";
            }
          }, { type: "select", choices: brandChoices })
        ),
        field("方向标签（逗号分隔）", exp.tags.join(", "), value => {
          exp.tags = value.split(/[,，]/).map(x => x.trim()).filter(Boolean);
        }),
        experienceLinksEditor(exp)
      );
      exp.projects.forEach((project, projectIndex) => block.append(projectEditor(project, exp.projects, projectIndex)));
      block.append(addButton("项目", () => exp.projects.push({ name: "", subtitle: "", background: [], impact: [], responsibilities: [], actions: [], keywords: [], missingMetrics: [] })));
      editorPanel.append(block);
    });
    editorPanel.append(addButton("实习 / 工作经历", () => data.experience.push({ company: "", team: "", dates: "", brand: "auto", brandMode: "auto", tags: [], links: [], projects: [] })));
  }

  function simpleProjectSection(title, items, openSource = false) {
    const heading = element("div", { className: "subsection-title" });
    heading.append(element("span", { text: title }));
    editorPanel.append(heading);
    items.forEach((item, index) => {
      item.bullets ||= [];
      const titleKey = openSource ? "project" : "name";
      const block = card(item[titleKey] || `${title} ${index + 1}`, items, index);
      block.append(
        field("名称", item[titleKey], value => { item[titleKey] = value; }),
        field("角色", item.role, value => { item.role = value; }),
        field("Scope", item.scope, value => { item.scope = value; }, { multiline: true }),
        field("项目链接", item.url, value => { item.url = value; }),
        bulletEditor("要点", item.bullets)
      );
      editorPanel.append(block);
    });
    editorPanel.append(addButton(title, () => items.push({ [openSource ? "project" : "name"]: "", role: "", scope: "", url: "", bullets: [] })));
  }

  function renderExtras() {
    editorPanel.append(element("p", { className: "panel-intro", text: "可补充独立项目、开源贡献、奖项与技能。没有证据的条目不要加入正式版本。" }));
    simpleProjectSection("技术项目与沉淀", data.projects, false);
    simpleProjectSection("开源贡献", data.open_source, true);

    const awardTitle = element("div", { className: "subsection-title" });
    awardTitle.append(element("span", { text: "奖项" }));
    editorPanel.append(awardTitle);
    data.awards.forEach((award, index) => {
      const block = card(award.name || `奖项 ${index + 1}`, data.awards, index);
      block.append(fieldGrid(
        field("名称", award.name, value => { award.name = value; }),
        field("时间", award.date, value => { award.date = value; })
      ));
      editorPanel.append(block);
    });
    editorPanel.append(addButton("奖项", () => data.awards.push({ name: "", date: "" })));

    const skills = element("section", { className: "section-card tint-green" });
    skills.append(field("技能（逗号分隔）", data.skills.join(", "), value => {
      data.skills = value.split(/[,，]/).map(x => x.trim()).filter(Boolean);
    }, { multiline: true }));
    editorPanel.append(skills);
  }

  function renderSections() {
    editorPanel.append(element("p", { className: "panel-intro", text: "所有栏目（内置 + 自定义）统一排序，可自由调整上下顺序。内置栏目的名字可直接修改；自定义栏目可增删条目。" }));

    const listTitle = element("div", { className: "subsection-title" });
    listTitle.append(element("span", { text: "一级栏目列表（可改名称与排序）" }));
    editorPanel.append(listTitle);

    // Render each layout entry in order — builtin or custom mixed together
    data.layout.forEach((layoutItem, layoutIndex) => {
      if (!layoutItem || typeof layoutItem !== "object") {
        data.layout[layoutIndex] = { key: String(layoutItem || "education") };
        layoutItem = data.layout[layoutIndex];
      }
      layoutItem.key ||= "education";
      const isBuiltin = ["education", "experience"].includes(layoutItem.key);
      const labelMap = { education: "教育", experience: "工作" };
      const titleKey = isBuiltin ? layoutItem.key : null;
      const displayName = isBuiltin ? (labelMap[layoutItem.key] || layoutItem.key) : "";

      if (isBuiltin) {
        // Built-in section card: only title rename field, no delete button
        const block = card(`${displayName}栏目`, data.layout, layoutIndex, "blue", { noRemove: true });
        block.append(
          field(`${displayName}栏目名`, data.section_titles[titleKey] || displayName, value => { data.section_titles[titleKey] = value; })
        );
        editorPanel.append(block);
      } else {
        // Custom section card: full editor with items
        const sectionIndex = parseInt(layoutItem.key.slice(7), 10);
        if (isNaN(sectionIndex) || !data.sections[sectionIndex]) return;
        const section = data.sections[sectionIndex];
        if (!section || typeof section !== "object") {
          data.sections[sectionIndex] = { title: "", items: [] };
        }
        section.title ||= "";
        section.items ||= [];
        const block = card(section.title || `自定义栏目 ${sectionIndex + 1}`, data.layout, layoutIndex, "green");
        block.append(field("栏目名", section.title, value => { section.title = value; }, { placeholder: "例如：证书、获奖、社团活动" }));
        section.items.forEach((item, itemIndex) => {
          if (!item || typeof item !== "object") {
            section.items[itemIndex] = { title: String(item || ""), dates: "", bullets: [] };
            item = section.items[itemIndex];
          }
          item.title ||= "";
          item.dates ||= "";
          item.bullets ||= [];
          const wrap = element("div", { className: "project-card" });
          const head = element("div", { className: "card-head" });
          head.append(element("h3", { text: `条目 ${itemIndex + 1}` }), actionButtons(section.items, itemIndex, "条目"));
          wrap.append(head);
          wrap.append(fieldGrid(
            field("名称", item.title, value => { item.title = value; }),
            field("时间（可选）", item.dates, value => { item.dates = value; })
          ));
          wrap.append(bulletEditor("要点", item.bullets));
          block.append(wrap);
        });
        block.append(addButton("条目", () => section.items.push({ title: "", dates: "", bullets: [] })));
        editorPanel.append(block);
      }
    });

    // Add new custom section button (appends to sections and adds to end of layout)
    editorPanel.append(addButton("新增自定义栏目", () => {
      const idx = data.sections.length;
      data.sections.push({ title: "", items: [] });
      data.layout.push({ key: `custom-${idx}` });
    }));
  }

  function renderJson() {
    editorPanel.append(element("p", { className: "panel-intro", text: "高级模式会完整保留 verification、source_note 和 claim_ids。应用前会检查基础结构。" }));
    const textarea = element("textarea", { className: "json-editor" });
    textarea.value = JSON.stringify(data, null, 2);
    const actions = element("div", { className: "json-actions" });
    const apply = element("button", { className: "button primary", text: "应用 JSON", type: "button" });
    const format = element("button", { className: "button", text: "格式化", type: "button" });
    apply.addEventListener("click", () => {
      try {
        const parsed = JSON.parse(textarea.value);
        validateImportedData(parsed);
        data = normalizeData(parsed);
        resetHistory();
        saveLocal();
        renderEditor();
        renderPreview();
        showToast("JSON 已应用");
      } catch (error) { showToast(error.message || "JSON 无法解析", true); }
    });
    format.addEventListener("click", () => {
      try { textarea.value = JSON.stringify(JSON.parse(textarea.value), null, 2); }
      catch (_) { showToast("请先修复 JSON 语法", true); }
    });
    actions.append(apply, format);
    editorPanel.append(textarea, actions, element("div", { className: "inline-warning", text: "在线修改不会自动补充证据。新增指标、Owner、主导、上线或0→1等强表述后，应重新运行 Skill 校验。" }));
  }

  function handoffStat(value, label) {
    const block = element("div", { className: "handoff-stat" });
    block.append(element("strong", { text: String(value) }), element("span", { text: label }));
    return block;
  }

  // 把预览中的每一张 A4 sheet 渲染成 2x 高清位图(预览由分页引擎生成 .sushen-sheet,
  // 每张 sheet = 一页 A4,内含页边距/页眉/页脚/页码)。PDF 每 sheet 一页,不再做位图等分切片。
  async function renderResumeSheets() {
    const doc = previewFrame.contentDocument;
    if (!doc) throw new Error("预览未就绪，请稍后再试");
    const host = doc.getElementById("resume");
    const sheets = host ? Array.from(doc.querySelectorAll("#resume > .sushen-sheet")) : [];
    if (!sheets.length) throw new Error("预览内容为空（未生成 A4 页面）");
    const bgColor = "#ffffff";
    const scale = 2;
    const fontFamily = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","WenQuanYi Micro Hei",system-ui,-apple-system,sans-serif';

    const prevZoom = previewFrame.style.zoom || "1";
    previewFrame.style.zoom = "1";
    await new Promise(resolve => window.setTimeout(resolve, 30));

    try {
    const pages = [];
    for (const sheet of sheets) {
      const rect = sheet.getBoundingClientRect();
      const width = Math.min(4000, Math.max(1, Math.round(rect.width || 794)));
      const height = Math.min(5600, Math.max(1, Math.round(rect.height || 1123)));

      // 克隆整份模板文档,注入导出覆盖规则后,只保留当前 sheet。
      const cloned = doc.documentElement.cloneNode(true);
      cloned.querySelectorAll("script").forEach(node => node.remove());
      cloned.querySelectorAll("link").forEach(node => node.remove());
      const clonedHost = cloned.querySelector("#resume");
      if (clonedHost) {
        const clonedSheets = Array.from(clonedHost.querySelectorAll(":scope > .sushen-sheet"));
        clonedSheets.forEach((node, i) => { if (node !== clonedSheets[sheets.indexOf(sheet)]) node.remove(); });
      }
      const stylePatch = doc.createElement("style");
      stylePatch.textContent = [
        "html { font-family: " + fontFamily + " !important; }",
        "html, body { margin: 0 !important; padding: 0 !important; background: " + bgColor + " !important; }",
        "#resume { margin: 0 !important; padding: 0 !important; background: transparent !important; }",
        "#resume > .sushen-sheet { margin: 0 auto !important; box-shadow: none !important; }",
        "#resume, .sushen-sheet, .sushen-frame, .sushen-content { overflow: visible !important; }",
        ".sushen-content { height: auto !important; }",
        "a { text-decoration: none !important; }"
      ].join("\n");
      const cloneHead = cloned.querySelector("head");
      (cloneHead || cloned).appendChild(stylePatch);

      const xhtml = new XMLSerializer().serializeToString(cloned);
      const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">',
        '<foreignObject x="0" y="0" width="100%" height="100%">',
        xhtml,
        '</foreignObject></svg>'
      ].join("");
      const svgDataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("SVG 渲染失败（可能是字体或图片资源问题）"));
        img.src = svgDataUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      pages.push({ canvas, width, height, sheet });
    }
    return pages;
    } finally {
      previewFrame.style.zoom = prevZoom;
    }
  }

  // 导出前检测是否存在超高条目(与 measurePreview 告警同口径),仅提示不阻断
  function warnIfOverflow() {
    try {
      const doc = previewFrame.contentDocument;
      if (doc && doc.querySelector("#resume > .sushen-sheet.sushen-overflow")) {
        showToast("注意：存在超高条目，导出内容可能被裁切", true);
      }
    } catch (_) { /* 忽略测量失败 */ }
  }

  async function exportPng() {
    warnIfOverflow();
    showToast("正在生成 PNG...");
    try {
      const pages = await renderResumeSheets();
      if (pages.length === 1) {
        const { canvas } = pages[0];
        canvas.toBlob(blob => {
          if (!blob) { showToast("PNG 编码失败", true); return; }
          download(safeFilename("png"), blob, "image/png");
          showToast("PNG 已下载（A4 高清）");
        }, "image/png");
        return;
      }
      // 多页:纵向拼接一张长图,保留每页完整内容
      const gap = 16; // px(1x)
      const scale2 = pages[0].canvas.width / pages[0].width; // 2
      const totalH = pages.reduce((sum, pg) => sum + pg.height, 0) * scale2 + gap * (pages.length - 1) * scale2;
      const merged = document.createElement("canvas");
      merged.width = pages[0].canvas.width;
      merged.height = totalH;
      const ctx = merged.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, merged.width, merged.height);
      let y = 0;
      for (const pg of pages) {
        ctx.drawImage(pg.canvas, 0, y);
        y += pg.height * scale2 + gap * scale2;
      }
      merged.toBlob(blob => {
        if (!blob) { showToast("PNG 编码失败", true); return; }
        download(safeFilename("png"), blob, "image/png");
        showToast(`PNG 已下载（${pages.length} 页 A4 拼接长图）`);
      }, "image/png");
    } catch (error) {
      console.error(error);
      showToast(error.message || "PNG 生成失败", true);
    }
  }

  // 导出 PDF:每一张 A4 sheet 直接转成一个 PDF 页面(页边距/页眉页脚/页码已含在 sheet 内),
  // 不再把整幅位图按 A4 高硬切,因此页与页之间绝不会出现内容被切断或“拼接缝”。
  async function exportPdf() {
    warnIfOverflow();
    showToast("正在生成 PDF...");
    try {
      const pages = await renderResumeSheets();
      const chunks = pages.map(pg => {
        const ctx = pg.canvas.getContext("2d");
        const pixels = ResumePdf.rgbPixels(ctx.getImageData(0, 0, pg.canvas.width, pg.canvas.height));
        return { width: pg.canvas.width, height: pg.canvas.height, pixels };
      });
      const blob = await ResumePdf.buildPdf(chunks);
      download(safeFilename("pdf"), blob, "application/pdf");
      showToast(chunks.length === 1 ? "PDF 已下载（A4 单页 · 页边距/页眉页脚已应用）" : `PDF 已下载（${chunks.length} 页 A4 · 每页含页边距/页眉页脚）`);
    } catch (error) {
      console.error(error);
      showToast(error.message || "PDF 生成失败", true);
    }
  }

  function renderInterrogation() {
    if (!handoff) {
      editorPanel.append(element("div", { className: "inline-warning", text: "还没有在线拷打结果。先完成 JD 输入、定向追问、Claim Ledger 和面试防御，再回到这里继续编辑简历。" }));
      const go = element("button", { className: "button primary", text: "去深度拷打", type: "button" });
      go.addEventListener("click", () => { window.location.href = "../interrogation/"; });
      editorPanel.append(element("div", { className: "json-actions" }, [go]));
      return;
    }
    const ledger = handoff.ledger || {};
    const matrix = handoff.matrix || {};
    const defense = handoff.defense || {};
    const roleAudits = handoff.roleAudits || [];
    const projectRewrite = handoff.projectRewrite || { projects: [] };
    const compression = handoff.compression || { projects: [], selected_count: 0, excluded_count: 0, used: 0, budget: 0 };
    const selected = matrix.selection?.selected_claim_ids || [];
    const summary = element("div", { className: "handoff-summary" });
    summary.append(
      handoffStat((ledger.claims || []).length, "Claim 总数"),
      handoffStat(roleAudits.filter(item => item.status === "blocked").length, "角色阻断"),
      handoffStat((projectRewrite.projects || []).length, "项目重写"),
      handoffStat(compression.selected_count || selected.length, "A4 入选 Claim"),
      handoffStat(`${matrix.summary?.weighted_coverage || 0}%`, "JD 证据覆盖")
    );
    editorPanel.append(summary);
    const target = element("section", { className: "section-card tint-blue" });
    target.append(element("div", { className: "card-head" }, [element("h3", { text: "目标岗位与证据交接" })]));
    target.append(element("p", { className: "panel-intro", text: `${handoff.target?.company || ""} ${handoff.target?.title || "目标岗位"}`.trim() }));
    target.append(element("div", { className: "inline-warning", text: `已接收 Claim Ledger → 语义角色校验 → 针对性拷打 → 项目级重写 → A4 压缩链路。压缩稿不会自动覆盖当前简历；请先核对其公司/项目归属，再由 $sushen-resume-maker 合并进 resume-data.json。当前预算 ${compression.used || 0}/${compression.budget || 0} 字。` }));
    editorPanel.append(target);
    (compression.projects || []).forEach(project => {
      const card = element("div", { className: "defense-mini" });
      card.append(element("strong", { text: project.name || "未命名项目" }));
      const lines = [
        ...(project.background || []).map(item => `背景：${item.text}`),
        ...(project.responsibilities || []).map(item => `职责：${item.text}`),
        ...(project.impact || []).map(item => `指标：${item.text}`)
      ];
      card.append(element("p", { text: lines.join("\n") || "该项目暂无进入 A4 预算的内容。" }));
      editorPanel.append(card);
    });
    (defense.questions || []).slice(0, 5).forEach((question, index) => {
      const card = element("div", { className: "defense-mini" });
      card.append(element("strong", { text: `${index + 1}. ${question.primary_question}` }));
      card.append(element("p", { text: `安全边界：${question.safe_boundary}` }));
      editorPanel.append(card);
    });
    const actions = element("div", { className: "json-actions" });
    [
      ["下载 Claim Ledger", "claim-ledger.json", ledger],
      ["下载 JD Matrix", "jd-matrix.json", matrix],
      ["下载项目重写稿", "project-rewrite.json", projectRewrite],
      ["下载 A4 内容稿", "a4-content-draft.json", compression],
      ["下载面试防御", "interview-defense.json", defense]
    ].forEach(([label, filename, value]) => {
      const item = element("button", { className: "button", text: label, type: "button" });
      item.addEventListener("click", () => download(filename, JSON.stringify(value, null, 2), "application/json;charset=utf-8"));
      actions.append(item);
    });
    const clear = element("button", { className: "button", text: "清除拷打交接", type: "button" });
    clear.addEventListener("click", () => {
      localStorage.removeItem(HANDOFF_KEY);
      handoff = null;
      renderEditor();
      showToast("拷打交接已清除");
    });
    actions.append(clear);
    editorPanel.append(actions);
  }

  function renderEditor() {
    editorPanel.replaceChildren();
    if (activeTab === "profile") renderProfile();
    else if (activeTab === "education") renderEducation();
    else if (activeTab === "experience") renderExperience();
    else if (activeTab === "extras") renderExtras();
    else if (activeTab === "sections") renderSections();
    else if (activeTab === "interrogation") renderInterrogation();
    else renderJson();
  }

  function htmlForData(value) {
    const payload = JSON.stringify(value).replace(/<\//g, "<\\/");
    return templateHtml.replace("__RESUME_JSON__", payload);
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = window.setTimeout(renderPreview, 220);
  }

  function syncPageSetupControls() {
    const ps = data.page_setup || {};
    const sync = (id, value) => {
      const el = document.getElementById(id);
      if (el && el.value !== String(value == null ? "" : value)) el.value = value == null ? "" : value;
    };
    sync("setupMarginTop", ps.marginTopMm ?? 12);
    sync("setupMarginBottom", ps.marginBottomMm ?? 13);
    sync("setupMarginLeft", ps.marginLeftMm ?? 13);
    sync("setupMarginRight", ps.marginRightMm ?? 13);
    sync("setupHeaderText", ps.headerText ?? "");
    sync("setupFooterText", ps.footerText ?? "");
    const num = document.getElementById("setupPageNumbers");
    if (num) num.checked = ps.showPageNumbers !== false;
    const smartBtn = document.getElementById("smartLayoutButton");
    if (smartBtn) {
      const active = ps.smartPacking === true;
      smartBtn.classList.toggle("active", active);
      smartBtn.setAttribute("aria-pressed", String(active));
    }
  }

  function renderPreview() {
    clearTimeout(previewTimer);
    previewTimer = 0;
    syncPageSetupControls();
    previewFrame.srcdoc = htmlForData(data);
  }

  // 分页后预览 iframe 高度 = 全部 A4 sheet 堆叠高度;页数状态直接读 sheet 数。
  function measurePreview() {
    try {
      const doc = previewFrame.contentDocument;
      const host = doc && doc.getElementById("resume");
      const sheets = host ? doc.querySelectorAll("#resume > .sushen-sheet") : [];
      if (sheets.length) {
        const last = sheets[sheets.length - 1];
        const docHeight = Math.max(doc.documentElement.scrollHeight, (last.getBoundingClientRect().bottom + 40));
        previewFrame.style.height = `${docHeight}px`;
        const pages = sheets.length;
        const overflow = doc.querySelector("#resume > .sushen-sheet.sushen-overflow");
        pageStatus.textContent = overflow
          ? (pages === 1 ? "A4 单页 · 存在超高条目（内容被裁切）" : `${pages} 页 A4 · 存在超高条目（内容被裁切）`)
          : (pages === 1 ? "A4 单页" : `${pages} 页 A4`);
        pageStatus.classList.toggle("warning", !!overflow);
        return;
      }
      // 兜底:未启用分页时的旧单页测量
      const page = doc && doc.querySelector(".page");
      if (!page) return;
      const width = page.getBoundingClientRect().width || 794;
      const onePage = width * (297 / 210);
      const contentHeight = Math.max(page.scrollHeight, page.getBoundingClientRect().height);
      const pages = Math.max(1, Math.ceil((contentHeight - 2) / onePage));
      const docHeight = Math.max(doc.documentElement.scrollHeight, contentHeight + 40);
      previewFrame.style.height = `${Math.max(1180, docHeight + 20)}px`;
      pageStatus.textContent = pages === 1 ? "A4 单页范围内" : `预计 ${pages} 页 · 建议精简内容`;
      pageStatus.classList.toggle("warning", pages > 1);
    } catch (_) {
      pageStatus.textContent = "分页检测不可用";
      pageStatus.classList.add("warning");
    }
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeFilename(extension) {
    const name = String(data.profile?.name || "resume").trim().replace(/[\\/:*?"<>|]+/g, "-");
    return `${name || "resume"}-ASU简历.${extension}`;
  }

  async function importFile(file) {
    try {
      const parsed = JSON.parse(await file.text());
      validateImportedData(parsed);
      data = normalizeData(parsed);
      resetHistory();
      saveLocal();
      renderEditor();
      renderPreview();
      showToast("简历数据已导入");
    } catch (error) { showToast(error.message || "导入失败", true); }
    finally { fileInput.value = ""; }
  }

  async function loadSample() {
    data = normalizeData(sampleData);
    resetHistory();
    saveLocal();
    renderEditor();
    renderPreview();
    showToast("已载入脱敏示例");
  }

  function bindEvents() {
    document.querySelectorAll(".tab").forEach(button => {
      button.addEventListener("click", () => {
        activeTab = button.dataset.tab;
        document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("is-active", tab === button));
        renderEditor();
      });
    });
    document.getElementById("importButton").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => { if (fileInput.files[0]) importFile(fileInput.files[0]); });
    document.getElementById("loadSampleButton").addEventListener("click", loadSample);
    document.getElementById("cleanDraftButton").addEventListener("click", cleanDraft);
    undoButton.addEventListener("click", undo);
    redoButton.addEventListener("click", redo);
    document.getElementById("downloadJsonButton").addEventListener("click", () => {
      download(safeFilename("json"), JSON.stringify(data, null, 2), "application/json;charset=utf-8");
      showToast("JSON 已下载");
    });
    document.getElementById("downloadHtmlButton").addEventListener("click", () => {
      download(safeFilename("html"), htmlForData(data), "text/html;charset=utf-8");
      showToast("可编辑源 HTML 已下载");
    });
    document.getElementById("exportPdfButton").addEventListener("click", () => { exportPdf(); });
    document.getElementById("downloadPngButton").addEventListener("click", () => { exportPng(); });
    const setupToggle = document.getElementById("pageSetupToggle");
    const setupPanel = document.getElementById("pageSetupPanel");
    setupToggle.addEventListener("click", () => {
      const open = setupPanel.hidden;
      setupPanel.hidden = !open;
      setupToggle.setAttribute("aria-expanded", String(open));
    });
    // 【智能排版】按钮:切换 smartPacking(一次性手动触发,结果可继续编辑;再点关闭)
    document.getElementById("smartLayoutButton").addEventListener("click", () => {
      // 独立 undo 边界:先 flush 未落栈的输入编辑,切换本身立即入栈(与 structuralChange 同语义)
      if (inputHistoryTimer) pushHistory();
      data.page_setup ||= {};
      data.page_setup.smartPacking = !(data.page_setup.smartPacking === true);
      saveLocal();
      pushHistory();
      renderPreview();
    });
    // 页面设置控件 → data.page_setup → 本地保存 + 刷新预览
    const pageSetupInputs = [
      ["setupMarginTop", "marginTopMm"],
      ["setupMarginBottom", "marginBottomMm"],
      ["setupMarginLeft", "marginLeftMm"],
      ["setupMarginRight", "marginRightMm"]
    ];
    pageSetupInputs.forEach(([id, key]) => {
      document.getElementById(id).addEventListener("input", () => {
        data.page_setup ||= {};
        data.page_setup[key] = Math.max(0, Math.min(60, Number(document.getElementById(id).value) || 0));
        saveLocal();
        scheduleHistory();
        schedulePreview();
      });
    });
    document.getElementById("setupHeaderText").addEventListener("input", event => {
      data.page_setup ||= {};
      data.page_setup.headerText = event.target.value;
      saveLocal();
      scheduleHistory();
      schedulePreview();
    });
    document.getElementById("setupFooterText").addEventListener("input", event => {
      data.page_setup ||= {};
      data.page_setup.footerText = event.target.value;
      saveLocal();
      scheduleHistory();
      schedulePreview();
    });
    document.getElementById("setupPageNumbers").addEventListener("change", event => {
      data.page_setup ||= {};
      data.page_setup.showPageNumbers = event.target.checked;
      saveLocal();
      scheduleHistory();
      schedulePreview();
    });
    document.getElementById("clearLocalButton").addEventListener("click", () => {
      if (!window.confirm("清除当前浏览器中的草稿并恢复示例？此操作不能撤销。")) return;
      localStorage.removeItem(STORAGE_KEY);
      loadSample();
    });
    previewFrame.addEventListener("load", () => window.setTimeout(measurePreview, 80));
    zoomSelect.addEventListener("change", () => {
      previewFrame.style.zoom = zoomSelect.value;
      measurePreview();
    });
    document.addEventListener("keydown", event => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    });
  }

  async function init() {
    try {
      const [templateResponse, logoResponse, sampleResponse] = await Promise.all([fetch(TEMPLATE_URL), fetch(LOGO_CATALOG_URL), fetch(SAMPLE_URL)]);
      if (!templateResponse.ok || !logoResponse.ok || !sampleResponse.ok) throw new Error("编辑器资源加载失败");
      const [templateSource, logoCatalog, loadedSample] = await Promise.all([templateResponse.text(), logoResponse.json(), sampleResponse.json()]);
      templateHtml = templateSource.replace("__COMPANY_LOGO_CATALOG__", JSON.stringify(logoCatalog).replace(/<\//g, "<\\/"));
      sampleData = loadedSample;
      if (!templateHtml.includes("__RESUME_JSON__") || templateHtml.includes("__COMPANY_LOGO_CATALOG__")) throw new Error("ASU 模板缺少数据占位符或 Logo 库未注入");
      let navigationHandoff = null;
      if (/[?&]from=transform(?:&|$)/.test(window.location.search) && window.name) {
        try {
          const envelope = JSON.parse(window.name);
          if (envelope && envelope.type === "sushen-resume-editor-handoff-v1") navigationHandoff = envelope.resume;
        } catch (_) { navigationHandoff = null; }
        if (navigationHandoff) window.name = "";
      }
      const stored = localStorage.getItem(STORAGE_KEY);
      try { handoff = JSON.parse(localStorage.getItem(HANDOFF_KEY)); }
      catch (_) { handoff = null; }
      if (navigationHandoff) {
        validateImportedData(navigationHandoff);
        data = normalizeData(navigationHandoff);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } else if (stored) {
        try { data = normalizeData(JSON.parse(stored)); }
        catch (_) { data = normalizeData(sampleData); }
      } else data = normalizeData(sampleData);
      resetHistory();
      bindEvents();
      previewFrame.style.zoom = zoomSelect.value;
      renderEditor();
      renderPreview();
    } catch (error) {
      editorPanel.replaceChildren(element("div", { className: "inline-warning", text: `${error.message}。请通过 GitHub Pages 或本地静态服务器打开，不要直接双击 HTML 文件。` }));
      showToast(error.message || "编辑器初始化失败", true);
    }
  }

  init();
})();
