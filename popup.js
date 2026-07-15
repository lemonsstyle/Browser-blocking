const DEFAULT_KEYWORDS = [

];
const STORAGE_KEY = "blockedKeywords";
const PATTERN_KEY = "blockedCodePattern";
const ENABLED_KEY = "filterEnabled";
const INVERT_KEY = "invertMatch";
const LOG_KEY = "filterDebugLogs";
const TEMPLATES_KEY = "keywordFilterTemplates";
const ACTIVE_TEMPLATE_KEY = "keywordFilterActiveTemplate";
const TITLE_DEDUPE_KEY = "duplicateTitleFilter";
const DEFAULT_TEMPLATE_ID = "default";
const DEFAULT_TEMPLATE_NAME = "默认模板";
const DEFAULT_CODE_PATTERN = {
  enabled: true,
  letterMin: 3,
  letterMax: 5,
  separatorMode: "hyphen",
  digitMin: 3,
  digitMax: 5
};
const DEFAULT_TITLE_DEDUPE = {
  enabled: false,
  threshold: 80
};

const textarea = document.getElementById("keywords");
const filterEnabledInput = document.getElementById("filterEnabled");
const invertMatchInput = document.getElementById("invertMatch");
const patternEnabledInput = document.getElementById("patternEnabled");
const dedupeEnabledInput = document.getElementById("dedupeEnabled");
const dedupeThresholdInput = document.getElementById("dedupeThreshold");
const dedupeThresholdValue = document.getElementById("dedupeThresholdValue");
const templateSelect = document.getElementById("templateSelect");
const templateNameInput = document.getElementById("templateName");
const siteRulesInput = document.getElementById("siteRules");
const newTemplateButton = document.getElementById("newTemplate");
const useCurrentSiteButton = document.getElementById("useCurrentSite");
const saveButton = document.getElementById("save");
const showLogsButton = document.getElementById("showLogs");
const closeLogsButton = document.getElementById("closeLogs");
const logsDialog = document.getElementById("logsDialog");
const logsTextarea = document.getElementById("logs");
const status = document.getElementById("status");
const helpPopover = document.getElementById("helpPopover");
const infoButtons = document.querySelectorAll(".infoButton");

let templates = {};
let selectedTemplateId = DEFAULT_TEMPLATE_ID;
let activeInfoButton = null;

function setStatus(message) {
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 1500);
}

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function parseKeywords(value) {
  return value
    .split(/[\n,，;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSiteRules(value) {
  return value
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeKeywords(value, fallback = DEFAULT_KEYWORDS) {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function normalizeSiteRules(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function normalizeTemplateName(value, fallback) {
  const name = typeof value === "string" ? value.trim() : "";
  return name || fallback;
}

function normalizeCodePattern(pattern) {
  return {
    ...DEFAULT_CODE_PATTERN,
    enabled: pattern?.enabled !== false
  };
}

function clampPercentage(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 50 || parsed > 100) {
    return fallback;
  }
  return parsed;
}

function normalizeTitleDedupe(config) {
  const source = isRecord(config) ? config : {};

  return {
    enabled: source.enabled === true,
    threshold: clampPercentage(source.threshold, DEFAULT_TITLE_DEDUPE.threshold)
  };
}

function readPatternFromForm() {
  return normalizeCodePattern({
    enabled: patternEnabledInput.checked
  });
}

function readDedupeFromForm() {
  return normalizeTitleDedupe({
    enabled: dedupeEnabledInput.checked,
    threshold: dedupeThresholdInput.value
  });
}

function writePatternToForm(pattern) {
  const normalized = normalizeCodePattern(pattern);
  patternEnabledInput.checked = normalized.enabled;
}

function writeDedupeToForm(config) {
  const normalized = normalizeTitleDedupe(config);
  dedupeEnabledInput.checked = normalized.enabled;
  dedupeThresholdInput.value = String(normalized.threshold);
  dedupeThresholdValue.value = `${normalized.threshold}%`;
}

function closeHelpPopover() {
  if (!activeInfoButton) {
    return;
  }

  activeInfoButton.setAttribute("aria-expanded", "false");
  activeInfoButton = null;
  helpPopover.hidden = true;
}

function positionHelpPopover(button) {
  const buttonRect = button.getBoundingClientRect();
  const popoverWidth = helpPopover.getBoundingClientRect().width;
  const popoverHeight = helpPopover.getBoundingClientRect().height;
  const maximumLeft = window.innerWidth - popoverWidth - 12;
  const preferredTop = buttonRect.bottom + 6;
  const maximumTop = window.innerHeight - popoverHeight - 12;
  helpPopover.style.left = `${Math.max(12, Math.min(buttonRect.left, maximumLeft))}px`;
  helpPopover.style.top = `${preferredTop <= maximumTop ? preferredTop : Math.max(12, buttonRect.top - popoverHeight - 6)}px`;
}

function toggleHelpPopover(button) {
  if (activeInfoButton === button) {
    closeHelpPopover();
    return;
  }

  if (activeInfoButton) {
    activeInfoButton.setAttribute("aria-expanded", "false");
  }

  activeInfoButton = button;
  helpPopover.textContent = button.dataset.help || "";
  helpPopover.hidden = false;
  button.setAttribute("aria-expanded", "true");
  positionHelpPopover(button);
}

function getLegacyDefaultTemplate(result = {}) {
  return {
    id: DEFAULT_TEMPLATE_ID,
    name: DEFAULT_TEMPLATE_NAME,
    keywords: normalizeKeywords(result[STORAGE_KEY]),
    siteRules: [],
    codePattern: normalizeCodePattern(isRecord(result[PATTERN_KEY]) ? result[PATTERN_KEY] : DEFAULT_CODE_PATTERN),
    titleDedupe: normalizeTitleDedupe(isRecord(result[TITLE_DEDUPE_KEY]) ? result[TITLE_DEDUPE_KEY] : DEFAULT_TITLE_DEDUPE),
    filterEnabled: typeof result[ENABLED_KEY] === "boolean" ? result[ENABLED_KEY] : true,
    invertMatch: typeof result[INVERT_KEY] === "boolean" ? result[INVERT_KEY] : false,
    updatedAt: ""
  };
}

function normalizeTemplate(rawTemplate, id, fallback) {
  const source = isRecord(rawTemplate) ? rawTemplate : {};
  const fallbackTemplate = fallback || getLegacyDefaultTemplate();

  return {
    id,
    name: normalizeTemplateName(source.name, fallbackTemplate.name || DEFAULT_TEMPLATE_NAME),
    keywords: normalizeKeywords(source.keywords, fallbackTemplate.keywords || DEFAULT_KEYWORDS),
    siteRules: normalizeSiteRules(source.siteRules),
    codePattern: normalizeCodePattern(isRecord(source.codePattern) ? source.codePattern : fallbackTemplate.codePattern),
    titleDedupe: normalizeTitleDedupe(source.titleDedupe),
    filterEnabled: typeof source.filterEnabled === "boolean"
      ? source.filterEnabled
      : fallbackTemplate.filterEnabled !== false,
    invertMatch: typeof source.invertMatch === "boolean"
      ? source.invertMatch
      : fallbackTemplate.invertMatch === true,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : fallbackTemplate.updatedAt || ""
  };
}

function normalizeTemplates(result = {}) {
  const legacyDefault = getLegacyDefaultTemplate(result);
  const rawTemplates = isRecord(result[TEMPLATES_KEY]) ? result[TEMPLATES_KEY] : {};
  const nextTemplates = {
    [DEFAULT_TEMPLATE_ID]: normalizeTemplate(rawTemplates[DEFAULT_TEMPLATE_ID] || legacyDefault, DEFAULT_TEMPLATE_ID, legacyDefault)
  };

  Object.entries(rawTemplates).forEach(([id, rawTemplate]) => {
    if (id === DEFAULT_TEMPLATE_ID || !id || !isRecord(rawTemplate)) {
      return;
    }

    nextTemplates[id] = normalizeTemplate(rawTemplate, id, nextTemplates[DEFAULT_TEMPLATE_ID]);
  });

  return nextTemplates;
}

function getSiteRuleScore(rule, pageUrl) {
  const trimmedRule = String(rule).trim();
  if (!trimmedRule) {
    return -1;
  }

  if (/^https?:\/\//i.test(trimmedRule)) {
    try {
      const ruleUrl = new URL(trimmedRule);
      if (
        pageUrl.protocol === ruleUrl.protocol &&
        pageUrl.host === ruleUrl.host &&
        pageUrl.href.startsWith(ruleUrl.href)
      ) {
        return 100000 + ruleUrl.href.length;
      }
    } catch {
      return -1;
    }

    return -1;
  }

  const domain = trimmedRule
    .toLowerCase()
    .replace(/^\*\./, "")
    .replace(/^\./, "")
    .replace(/\/+$/, "");

  if (!/^[a-z0-9.-]+$/.test(domain)) {
    return -1;
  }

  const hostname = pageUrl.hostname.toLowerCase();
  return hostname === domain || hostname.endsWith(`.${domain}`)
    ? 1000 + domain.length
    : -1;
}

function getTemplateForPageUrl(pageUrlValue) {
  let pageUrl;

  try {
    pageUrl = new URL(pageUrlValue);
  } catch {
    return null;
  }

  let selectedTemplate = null;
  let selectedScore = -1;
  let selectedUpdatedAt = "";

  Object.values(templates).forEach((template) => {
    const score = normalizeSiteRules(template.siteRules).reduce(
      (highestScore, rule) => Math.max(highestScore, getSiteRuleScore(rule, pageUrl)),
      -1
    );

    if (
      score > selectedScore ||
      (score === selectedScore && score >= 0 && template.updatedAt > selectedUpdatedAt)
    ) {
      selectedTemplate = template;
      selectedScore = score;
      selectedUpdatedAt = template.updatedAt;
    }
  });

  return selectedTemplate;
}

function readSettingsFromForm() {
  return {
    keywords: parseKeywords(textarea.value),
    siteRules: parseSiteRules(siteRulesInput.value),
    codePattern: readPatternFromForm(),
    titleDedupe: readDedupeFromForm(),
    filterEnabled: filterEnabledInput.checked,
    invertMatch: invertMatchInput.checked
  };
}

function writeTemplateToForm(template) {
  textarea.value = normalizeKeywords(template.keywords, []).join("，");
  siteRulesInput.value = normalizeSiteRules(template.siteRules).join("，");
  filterEnabledInput.checked = template.filterEnabled !== false;
  invertMatchInput.checked = template.invertMatch === true;
  writePatternToForm(template.codePattern);
  writeDedupeToForm(template.titleDedupe);
}

function buildTemplateFromForm(id) {
  const previousTemplate = templates[id] || templates[DEFAULT_TEMPLATE_ID] || getLegacyDefaultTemplate();
  const settings = readSettingsFromForm();

  return {
    id,
    name: normalizeTemplateName(templateNameInput.value, previousTemplate.name || DEFAULT_TEMPLATE_NAME),
    keywords: settings.keywords,
    siteRules: settings.siteRules,
    codePattern: settings.codePattern,
    titleDedupe: settings.titleDedupe,
    filterEnabled: settings.filterEnabled,
    invertMatch: settings.invertMatch,
    updatedAt: new Date().toISOString()
  };
}

function createEmptyTemplate(id, name) {
  return {
    id,
    name: normalizeTemplateName(name, DEFAULT_TEMPLATE_NAME),
    keywords: [],
    siteRules: [],
    codePattern: {
      ...DEFAULT_CODE_PATTERN,
      enabled: false
    },
    titleDedupe: { ...DEFAULT_TITLE_DEDUPE },
    filterEnabled: true,
    invertMatch: false,
    updatedAt: new Date().toISOString()
  };
}

function getCurrentTemplate() {
  return templates[selectedTemplateId] || templates[DEFAULT_TEMPLATE_ID] || getLegacyDefaultTemplate();
}

function renderTemplates() {
  const orderedTemplates = Object.values(templates).sort((left, right) => {
    if (left.id === DEFAULT_TEMPLATE_ID) {
      return -1;
    }
    if (right.id === DEFAULT_TEMPLATE_ID) {
      return 1;
    }
    return left.name.localeCompare(right.name, "zh-CN");
  });

  templateSelect.replaceChildren();
  orderedTemplates.forEach((template) => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    templateSelect.appendChild(option);
  });

  if (!templates[selectedTemplateId]) {
    selectedTemplateId = DEFAULT_TEMPLATE_ID;
  }

  const selectedTemplate = getCurrentTemplate();
  templateSelect.value = selectedTemplate.id;
  templateNameInput.value = selectedTemplate.name;
}

function getCurrentTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !Array.isArray(tabs) || !tabs[0]?.url) {
      callback("");
      return;
    }

    callback(tabs[0].url);
  });
}

function refreshCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = Array.isArray(tabs) ? tabs[0] : null;
    if (chrome.runtime.lastError || !currentTab || typeof currentTab.id !== "number") {
      setStatus("模板已保存，请手动刷新页面");
      return;
    }

    chrome.tabs.reload(currentTab.id, {}, () => {
      if (chrome.runtime.lastError) {
        setStatus("模板已保存，但刷新失败");
      }
    });
  });
}

function saveTemplateState(message, refreshPage = false) {
  const defaultTemplate = templates[DEFAULT_TEMPLATE_ID] || getLegacyDefaultTemplate();

  chrome.storage.sync.set(
    {
      [TEMPLATES_KEY]: templates,
      [ACTIVE_TEMPLATE_KEY]: selectedTemplateId,
      [STORAGE_KEY]: defaultTemplate.keywords,
      [PATTERN_KEY]: defaultTemplate.codePattern,
      [TITLE_DEDUPE_KEY]: defaultTemplate.titleDedupe,
      [ENABLED_KEY]: defaultTemplate.filterEnabled,
      [INVERT_KEY]: defaultTemplate.invertMatch
    },
    () => {
      if (chrome.runtime.lastError) {
        setStatus("保存失败");
        return;
      }

      renderTemplates();
      setStatus(message);
      if (refreshPage) {
        refreshCurrentTab();
      }
    }
  );
}

function saveCurrentTemplate() {
  templates[selectedTemplateId] = buildTemplateFromForm(selectedTemplateId);
  saveTemplateState("模板已保存，正在刷新页面", true);
}

function saveActiveTemplateSelection() {
  chrome.storage.sync.set(
    {
      [ACTIVE_TEMPLATE_KEY]: selectedTemplateId
    },
    () => {
      if (chrome.runtime.lastError) {
        setStatus("切换失败");
        return;
      }

      setStatus("已切换模板");
    }
  );
}

function createTemplateId() {
  let id = "";
  do {
    id = `template_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  } while (templates[id]);
  return id;
}

function createTemplate() {
  const defaultName = `模板 ${Object.keys(templates).length}`;
  const requestedName = window.prompt("模板名称", defaultName);
  if (requestedName === null) {
    return;
  }

  const id = createTemplateId();
  selectedTemplateId = id;
  templates[id] = createEmptyTemplate(id, requestedName || defaultName);
  renderTemplates();
  writeTemplateToForm(templates[id]);

  saveTemplateState("已新建模板");
}

function addCurrentSiteRule() {
  getCurrentTab((pageUrl) => {
    try {
      const currentUrl = new URL(pageUrl);
      if (!/^https?:$/.test(currentUrl.protocol) || !currentUrl.hostname) {
        setStatus("当前页面不能作为网站规则");
        return;
      }

      const currentHost = currentUrl.hostname.replace(/^www\./i, "");
      const rules = parseSiteRules(siteRulesInput.value);
      if (!rules.includes(currentHost)) {
        rules.push(currentHost);
        siteRulesInput.value = rules.join("，");
      }

      setStatus("已填入当前网站，请保存");
    } catch {
      setStatus("当前页面不能作为网站规则");
    }
  });
}

function loadTemplates() {
  chrome.storage.sync.get(
    [STORAGE_KEY, PATTERN_KEY, TITLE_DEDUPE_KEY, ENABLED_KEY, INVERT_KEY, TEMPLATES_KEY, ACTIVE_TEMPLATE_KEY],
    (result) => {
      if (chrome.runtime.lastError) {
        templates = {
          [DEFAULT_TEMPLATE_ID]: getLegacyDefaultTemplate()
        };
        selectedTemplateId = DEFAULT_TEMPLATE_ID;
        renderTemplates();
        writeTemplateToForm(getCurrentTemplate());
        setStatus("读取失败");
        return;
      }

      templates = normalizeTemplates(result);
      selectedTemplateId = typeof result[ACTIVE_TEMPLATE_KEY] === "string" && templates[result[ACTIVE_TEMPLATE_KEY]]
        ? result[ACTIVE_TEMPLATE_KEY]
        : DEFAULT_TEMPLATE_ID;

      getCurrentTab((pageUrl) => {
        const matchedTemplate = getTemplateForPageUrl(pageUrl);
        if (matchedTemplate) {
          selectedTemplateId = matchedTemplate.id;
        }

        renderTemplates();
        writeTemplateToForm(getCurrentTemplate());
      });
    }
  );
}

function getLogLabel(entry) {
  const ruleType = entry.ruleType || "keyword";
  const keyword = entry.keyword || "";
  if (ruleType === "duplicate") {
    return entry.similarity ? `去重 ${entry.similarity}%` : "去重";
  }
  return ruleType === "pattern" ? "正则" : keyword;
}

function formatLogs(logs) {
  const grouped = new Map();

  logs.forEach((entry) => {
    const label = getLogLabel(entry);
    const text = entry.text || "";

    if (!grouped.has(label)) {
      grouped.set(label, []);
    }

    grouped.get(label).push(text);
  });

  return Array.from(grouped.entries())
    .map(([label, titles]) => `${label}\n${titles.join("\n")}`)
    .join("\n\n");
}

function loadLogs() {
  getCurrentTab((pageKey) => {
    if (!pageKey) {
      logsTextarea.value = "当前标签页日志不可用";
      return;
    }

    chrome.storage.local.get(LOG_KEY, (result) => {
      if (chrome.runtime.lastError) {
        logsTextarea.value = "日志读取失败";
        return;
      }

      const allLogs = result[LOG_KEY] && typeof result[LOG_KEY] === "object" ? result[LOG_KEY] : {};
      const logs = Array.isArray(allLogs[pageKey]) ? allLogs[pageKey] : [];
      logsTextarea.value = logs.length ? formatLogs(logs) : "当前标签页暂无日志";
    });
  });
}

function openLogsDialog() {
  closeHelpPopover();
  loadLogs();
  if (!logsDialog.open) {
    logsDialog.showModal();
  }
}

templateSelect.addEventListener("change", () => {
  selectedTemplateId = templateSelect.value;
  writeTemplateToForm(getCurrentTemplate());
  renderTemplates();
  saveActiveTemplateSelection();
});

newTemplateButton.addEventListener("click", createTemplate);
useCurrentSiteButton.addEventListener("click", addCurrentSiteRule);
saveButton.addEventListener("click", () => saveCurrentTemplate());
showLogsButton.addEventListener("click", openLogsDialog);
closeLogsButton.addEventListener("click", () => logsDialog.close());
logsDialog.addEventListener("click", (event) => {
  if (event.target === logsDialog) {
    logsDialog.close();
  }
});

infoButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleHelpPopover(button);
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".infoButton") && !event.target.closest("#helpPopover")) {
    closeHelpPopover();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeHelpPopover();
  }
});

window.addEventListener("resize", () => {
  if (activeInfoButton) {
    positionHelpPopover(activeInfoButton);
  }
});

[
  patternEnabledInput
].forEach((element) => {
  element.addEventListener("input", () => {
    writePatternToForm(readPatternFromForm());
  });
  element.addEventListener("change", () => {
    writePatternToForm(readPatternFromForm());
  });
});

[
  dedupeEnabledInput,
  dedupeThresholdInput
].forEach((element) => {
  element.addEventListener("input", () => {
    writeDedupeToForm(readDedupeFromForm());
  });
  element.addEventListener("change", () => {
    writeDedupeToForm(readDedupeFromForm());
  });
});

loadTemplates();
