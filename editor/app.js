(() => {
  "use strict";

  const TEMPLATE_URL = "../skills/sushen-resume-maker/assets/resume_template.html";
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
    next.endorsements ||= [];
    next.education ||= [];
    next.experience ||= [];
    next.experience.forEach(exp => {
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
    return next;
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

  function actionButtons(array, index, label) {
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
    remove.addEventListener("click", () => structuralChange(() => array.splice(index, 1)));
    actions.append(up, down, remove);
    return actions;
  }

  function card(title, array, index, tint = "") {
    const wrapper = element("section", { className: `section-card${tint ? ` tint-${tint}` : ""}` });
    const head = element("div", { className: "card-head" });
    head.append(element("h3", { text: title }), actionButtons(array, index, title));
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

  function bulletEditor(title, items) {
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
    title.append(element("span", { text: "专业评价 / 外部认可（最多展示 3 条）" }));
    editorPanel.append(title);
    data.endorsements.forEach((item, index) => {
      const block = card(item.text || `外部认可 ${index + 1}`, data.endorsements, index, "green");
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
    editorPanel.append(addButton("外部认可", () => data.endorsements.push({ text: "", source: "", verification: "user_attested", source_note: "在线编辑器补充", claim_ids: [], highlights: [] })));
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
      field("所在地", profile.location, value => { profile.location = value; })
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
      bulletEditor("背景", project.background),
      bulletEditor("指标与效果", project.impact),
      bulletEditor("我的职责", project.responsibilities),
      bulletEditor("关键动作 / 方法（A4 中合并到“我的职责”）", project.actions),
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
    editorPanel.append(element("p", { className: "panel-intro", text: "经历条颜色对应原 ASU 前端。新增数字或强角色词后，记得同步更新 Claim Ledger。" }));
    const brandChoices = [
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
          field("经历条颜色", exp.brand || "gray", value => { exp.brand = value; }, { type: "select", choices: brandChoices })
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
    editorPanel.append(addButton("实习 / 工作经历", () => data.experience.push({ company: "", team: "", dates: "", brand: "gray", tags: [], links: [], projects: [] })));
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
    const selected = matrix.selection?.selected_claim_ids || [];
    const summary = element("div", { className: "handoff-summary" });
    summary.append(
      handoffStat((ledger.claims || []).length, "Claim 总数"),
      handoffStat(selected.length, "可用候选 Claim"),
      handoffStat(`${matrix.summary?.weighted_coverage || 0}%`, "JD 证据覆盖")
    );
    editorPanel.append(summary);
    const target = element("section", { className: "section-card tint-blue" });
    target.append(element("div", { className: "card-head" }, [element("h3", { text: "目标岗位与证据交接" })]));
    target.append(element("p", { className: "panel-intro", text: `${handoff.target?.company || ""} ${handoff.target?.title || "目标岗位"}`.trim() }));
    target.append(element("div", { className: "inline-warning", text: "拷打结果不会自动改写简历正文。请先把三个 JSON 交给 $sushen-resume-maker 生成 resume-data.json，再导入本编辑器；这样可以避免规则引擎把相关性误写成事实。" }));
    editorPanel.append(target);
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

  function renderPreview() {
    clearTimeout(previewTimer);
    previewTimer = 0;
    previewFrame.srcdoc = htmlForData(data);
  }

  function measurePreview() {
    try {
      const doc = previewFrame.contentDocument;
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
    document.getElementById("printButton").addEventListener("click", () => {
      try {
        previewFrame.contentWindow.focus();
        previewFrame.contentWindow.print();
      } catch (_) { showToast("浏览器阻止了打印，请先下载 HTML 后打印", true); }
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
      const [templateResponse, sampleResponse] = await Promise.all([fetch(TEMPLATE_URL), fetch(SAMPLE_URL)]);
      if (!templateResponse.ok || !sampleResponse.ok) throw new Error("编辑器资源加载失败");
      templateHtml = await templateResponse.text();
      sampleData = await sampleResponse.json();
      if (!templateHtml.includes("__RESUME_JSON__")) throw new Error("ASU 模板缺少数据占位符");
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

