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
const MAX_LOGS = 50;
const PAGE_LOG_LIMIT = 100;
const MIN_DEDUPE_TITLE_LENGTH = 6;
const DEFAULT_CODE_PATTERN = {
  enabled: true,
  letterMin: 3,
  letterMax: 5,
  separatorMode: "optional",
  digitMin: 3,
  digitMax: 4
};
const DEFAULT_TITLE_DEDUPE = {
  enabled: false,
  threshold: 80
};

let activeKeywords = [...DEFAULT_KEYWORDS];
let activeCodePattern = { ...DEFAULT_CODE_PATTERN };
let activeTitleDedupe = { ...DEFAULT_TITLE_DEDUPE };
let filterEnabled = true;
let invertMatch = false;
let compiledPattern = buildPattern(activeKeywords);
let compiledCodePattern = buildCodePattern(activeCodePattern);
let observer;
let filterPageTimer = null;
let pendingLogEntries = [];
let logFlushTimer = null;
let logWriteInProgress = false;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
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

function buildPattern(keywords) {
  const terms = normalizeKeywords(keywords, []);
  if (!terms.length) {
    return null;
  }
  return new RegExp(terms.map(escapeRegExp).join("|"), "i");
}

function clampLength(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 20) {
    return fallback;
  }
  return parsed;
}

function normalizeCodePattern(pattern) {
  const letterMin = clampLength(pattern?.letterMin, DEFAULT_CODE_PATTERN.letterMin);
  const letterMax = clampLength(pattern?.letterMax, DEFAULT_CODE_PATTERN.letterMax);
  const digitMin = clampLength(pattern?.digitMin, DEFAULT_CODE_PATTERN.digitMin);
  const digitMax = clampLength(pattern?.digitMax, DEFAULT_CODE_PATTERN.digitMax);

  return {
    enabled: pattern?.enabled !== false,
    letterMin: Math.min(letterMin, letterMax),
    letterMax: Math.max(letterMin, letterMax),
    separatorMode: ["optional", "none", "hyphen", "space", "hyphen_or_space"].includes(pattern?.separatorMode)
      ? pattern.separatorMode
      : (
        ["required", "optional", "forbidden"].includes(pattern?.hyphenMode)
          ? (pattern.hyphenMode === "required" ? "hyphen" : pattern.hyphenMode === "forbidden" ? "none" : "optional")
          : DEFAULT_CODE_PATTERN.separatorMode
      ),
    digitMin: Math.min(digitMin, digitMax),
    digitMax: Math.max(digitMin, digitMax)
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

function getInactiveTemplate() {
  return {
    id: "",
    name: "",
    keywords: [],
    siteRules: [],
    codePattern: {
      ...DEFAULT_CODE_PATTERN,
      enabled: false
    },
    filterEnabled: false,
    invertMatch: false,
    updatedAt: ""
  };
}

function resolveTemplateForPage(result = {}) {
  const templates = normalizeTemplates(result);
  let pageUrl;

  try {
    pageUrl = new URL(location.href);
  } catch {
    return getInactiveTemplate();
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

  return selectedTemplate || getInactiveTemplate();
}

function buildCodePattern(patternConfig) {
  const pattern = normalizeCodePattern(patternConfig);
  if (!pattern.enabled) {
    return null;
  }

  const separatorPartMap = {
    none: "",
    hyphen: "-",
    space: "\\s",
    hyphen_or_space: "[-\\s]",
    optional: "[-\\s]?"
  };

  const separatorPart = separatorPartMap[pattern.separatorMode] ?? "[-\\s]?";

  const source =
    `(?<![a-zA-Z])[a-zA-Z]{${pattern.letterMin},${pattern.letterMax}}` +
    `${separatorPart}\\d{${pattern.digitMin},${pattern.digitMax}}(?!\\d)`;

  return {
    source,
    pattern: new RegExp(source, "i")
  };
}

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function getTitleText(element) {
  if (!(element instanceof HTMLElement)) {
    return "";
  }

  const titleNodes = element.querySelectorAll(
    "h1, h2, h3, h4, h5, h6, a, [class*='title'], [class*='name']"
  );
  const seenTexts = new Set();
  const titleTexts = [];

  Array.from(titleNodes).forEach((node) => {
    const text = normalizeText(node.textContent);
    if (!text || seenTexts.has(text)) {
      return;
    }

    seenTexts.add(text);
    titleTexts.push(text);
  });

  if (titleTexts.length) {
    return titleTexts.sort((left, right) => right.length - left.length)[0];
  }

  return normalizeText(element.innerText || element.textContent);
}

function isMatch(text) {
  return compiledPattern ? compiledPattern.test(normalizeText(text)) : false;
}

function getMatchedKeyword(text) {
  const normalizedText = normalizeText(text);
  return activeKeywords.find((keyword) => normalizedText.toLowerCase().includes(keyword.toLowerCase())) || null;
}

function getMatchedCodePattern(text) {
  const normalizedText = normalizeText(text);
  if (compiledCodePattern && compiledCodePattern.pattern.test(normalizedText)) {
    return compiledCodePattern.source;
  }
  return null;
}

function getRelevantText(element) {
  if (!(element instanceof HTMLElement)) {
    return "";
  }

  const titleNodes = element.querySelectorAll(
    "a, h1, h2, h3, h4, h5, h6, [class*='title'], [class*='name']"
  );

  const titleText = Array.from(titleNodes)
    .map((node) => normalizeText(node.textContent))
    .filter(Boolean)
    .join(" ");

  return titleText || normalizeText(element.innerText || element.textContent);
}

function normalizeTitleForDedupe(text) {
  return normalizeText(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function getLevenshteinDistance(left, right) {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }

    for (let rightIndex = 0; rightIndex <= right.length; rightIndex += 1) {
      previous[rightIndex] = current[rightIndex];
    }
  }

  return previous[right.length];
}

function getTitleSimilarity(left, right) {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) {
    return 1;
  }

  return (maxLength - getLevenshteinDistance(left, right)) / maxLength;
}

function createDedupeContext() {
  return {
    enabled: filterEnabled && activeTitleDedupe.enabled === true,
    threshold: activeTitleDedupe.threshold / 100,
    seenTitles: []
  };
}

function findDuplicateTitle(title, context) {
  if (!context?.enabled) {
    return null;
  }

  const normalizedTitle = normalizeTitleForDedupe(title);
  if (normalizedTitle.length < MIN_DEDUPE_TITLE_LENGTH) {
    return null;
  }

  let bestMatch = null;

  context.seenTitles.forEach((seenTitle) => {
    const maxLength = Math.max(normalizedTitle.length, seenTitle.normalized.length);
    const minLength = Math.min(normalizedTitle.length, seenTitle.normalized.length);
    if (maxLength === 0 || minLength / maxLength < context.threshold) {
      return;
    }

    const similarity = getTitleSimilarity(normalizedTitle, seenTitle.normalized);
    if (similarity >= context.threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = {
        similarity,
        title: seenTitle.original
      };
    }
  });

  if (bestMatch) {
    return bestMatch;
  }

  rememberTitleForDedupe(title, context);

  return null;
}

function rememberTitleForDedupe(title, context) {
  if (!context?.enabled) {
    return;
  }

  const normalizedTitle = normalizeTitleForDedupe(title);
  if (normalizedTitle.length < MIN_DEDUPE_TITLE_LENGTH) {
    return;
  }

  context.seenTitles.push({
    normalized: normalizedTitle,
    original: title
  });
}

function isLikelyStandaloneResult(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const text = normalizeText(element.innerText || element.textContent);
  if (!text || text.length < 8) {
    return false;
  }

  const childCount = element.children.length;
  if (childCount === 0) {
    return true;
  }

  return childCount <= 8;
}

function findResultContainer(element) {
  let current = element;
  let fallback = element instanceof HTMLElement ? element : null;

  while (current && current !== document.body) {
    if (!(current instanceof HTMLElement)) {
      current = current.parentElement;
      continue;
    }

    const tag = current.tagName;
    const className = current.className || "";

    if (
      ["TR", "LI", "ARTICLE"].includes(tag) ||
      /result|item|row|card|entry|post/i.test(String(className))
    ) {
      return current;
    }

    if (!fallback && isLikelyStandaloneResult(current)) {
      fallback = current;
    }

    const parent = current.parentElement;
    if (
      parent &&
      parent !== document.body &&
      isLikelyStandaloneResult(current) &&
      !isLikelyStandaloneResult(parent)
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return fallback;
}

function hasMultipleNestedCandidates(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const nestedCandidates = element.querySelectorAll(
    "tr, li, article, [class*='result'], [class*='item'], [class*='row'], [class*='card'], [class*='entry'], [class*='post']"
  );

  let count = 0;

  for (const candidate of nestedCandidates) {
    if (candidate === element) {
      continue;
    }

    count += 1;
    if (count > 1) {
      return true;
    }
  }

  return false;
}

function appendDebugLog(entry) {
  pendingLogEntries.push(entry);

  if (logFlushTimer !== null) {
    return;
  }

  logFlushTimer = window.setTimeout(() => {
    logFlushTimer = null;
    flushDebugLogs();
  }, 0);
}

function flushDebugLogs() {
  if (logWriteInProgress || pendingLogEntries.length === 0) {
    return;
  }

  const batch = pendingLogEntries.slice();
  pendingLogEntries = [];
  logWriteInProgress = true;

  chrome.storage.local.get(LOG_KEY, (result) => {
    const currentLogs = result[LOG_KEY] && typeof result[LOG_KEY] === "object" ? result[LOG_KEY] : {};
    const pageKey = location.href;
    const pageLogs = Array.isArray(currentLogs[pageKey]) ? currentLogs[pageKey] : [];
    const nextPageLogs = [...batch.slice().reverse(), ...pageLogs].slice(0, PAGE_LOG_LIMIT);
    const nextLogs = {
      ...currentLogs,
      [pageKey]: nextPageLogs
    };

    const keys = Object.keys(nextLogs);
    if (keys.length > MAX_LOGS) {
      keys
        .sort((left, right) => {
          const leftTime = nextLogs[left]?.[0]?.time || "";
          const rightTime = nextLogs[right]?.[0]?.time || "";
          return rightTime.localeCompare(leftTime);
        })
        .slice(MAX_LOGS)
        .forEach((key) => {
          delete nextLogs[key];
        });
    }

    chrome.storage.local.set({ [LOG_KEY]: nextLogs }, () => {
      logWriteInProgress = false;
      if (pendingLogEntries.length > 0) {
        flushDebugLogs();
      }
    });
  });
}

function hideElement(element) {
  if (!(element instanceof HTMLElement) || element.dataset.keywordFilterHidden === "1") {
    return false;
  }

  element.dataset.keywordFilterHidden = "1";
  element.dataset.keywordFilterOriginalDisplay = element.style.display || "";
  element.style.display = "none";
  return true;
}

function restoreElement(element) {
  if (!(element instanceof HTMLElement) || element.dataset.keywordFilterHidden !== "1") {
    return;
  }

  element.style.display = element.dataset.keywordFilterOriginalDisplay || "";
  delete element.dataset.keywordFilterHidden;
  delete element.dataset.keywordFilterOriginalDisplay;
}

function evaluateCandidate(element, dedupeContext = createDedupeContext()) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  if (!filterEnabled) {
    restoreElement(element);
    return;
  }

  if (hasMultipleNestedCandidates(element)) {
    return;
  }

  const text = getRelevantText(element);
  const matchedKeyword = getMatchedKeyword(text);
  const matchedCodePattern = matchedKeyword ? null : getMatchedCodePattern(text);
  const matched = Boolean(matchedKeyword || matchedCodePattern);
  const shouldHideByRule = invertMatch ? !matched : matched;
  const title = getTitleText(element);
  const duplicateTitle = shouldHideByRule ? null : findDuplicateTitle(title, dedupeContext);
  const shouldHide = shouldHideByRule || Boolean(duplicateTitle);

  if (shouldHideByRule && !invertMatch) {
    rememberTitleForDedupe(title, dedupeContext);
  }

  if (shouldHide) {
    const hiddenNow = hideElement(element);
    if (matched && hiddenNow) {
      appendDebugLog({
        time: new Date().toISOString(),
        ruleType: matchedKeyword ? "keyword" : "pattern",
        keyword: matchedKeyword || matchedCodePattern,
        text: text.slice(0, 120),
        tag: element.tagName,
        className: String(element.className || "").slice(0, 120)
      });
    } else if (duplicateTitle && hiddenNow) {
      appendDebugLog({
        time: new Date().toISOString(),
        ruleType: "duplicate",
        keyword: "相似标题去重",
        similarity: Math.round(duplicateTitle.similarity * 100),
        matchedTitle: duplicateTitle.title.slice(0, 120),
        text: title.slice(0, 120),
        tag: element.tagName,
        className: String(element.className || "").slice(0, 120)
      });
    }
  } else {
    restoreElement(element);
  }
}

function collectCandidates(root = document) {
  const candidates = new Set();
  const containerSelectors = [
    "tr",
    "li",
    "article",
    "[class*='result']",
    "[class*='item']",
    "[class*='row']",
    "[class*='card']",
    "[class*='entry']",
    "[class*='post']"
  ];

  root.querySelectorAll(containerSelectors.join(",")).forEach((node) => {
    candidates.add(node);
  });

  const titleSelectors = [
    "a",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "[class*='title']",
    "[class*='name']"
  ];

  root.querySelectorAll(titleSelectors.join(",")).forEach((node) => {
    const container = findResultContainer(node);
    if (container) {
      candidates.add(container);
    } else if (node instanceof HTMLElement) {
      candidates.add(node);
    }
  });

  return candidates;
}

function filterPage(root = document) {
  const candidates = collectCandidates(root);
  const dedupeContext = createDedupeContext();

  candidates.forEach((candidate) => {
    evaluateCandidate(candidate, dedupeContext);
  });
}

function scheduleFilterPage() {
  if (filterPageTimer !== null) {
    return;
  }

  filterPageTimer = window.setTimeout(() => {
    filterPageTimer = null;
    filterPage();
  }, 50);
}

function restartObserver() {
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver((mutations) => {
    let needsFullScan = false;

    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }

        if (activeTitleDedupe.enabled) {
          needsFullScan = true;
          return;
        }

        evaluateCandidate(node);
        filterPage(node);
      });
    }

    if (needsFullScan) {
      scheduleFilterPage();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function applyTemplate(template) {
  activeKeywords = normalizeKeywords(template.keywords, []);
  activeCodePattern = normalizeCodePattern(template.codePattern);
  activeTitleDedupe = normalizeTitleDedupe(template.titleDedupe);
  filterEnabled = template.filterEnabled !== false;
  invertMatch = template.invertMatch === true;
  compiledPattern = buildPattern(activeKeywords);
  compiledCodePattern = buildCodePattern(activeCodePattern);
  filterPage();
  restartObserver();
}

function loadSettings() {
  chrome.storage.sync.get(
    [STORAGE_KEY, PATTERN_KEY, TITLE_DEDUPE_KEY, ENABLED_KEY, INVERT_KEY, TEMPLATES_KEY, ACTIVE_TEMPLATE_KEY],
    (result) => {
      const template = chrome.runtime.lastError
        ? getLegacyDefaultTemplate()
        : resolveTemplateForPage(result);
      applyTemplate(template);
    }
  );
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }

  const watchedKeys = [
    STORAGE_KEY,
    PATTERN_KEY,
    TITLE_DEDUPE_KEY,
    ENABLED_KEY,
    INVERT_KEY,
    TEMPLATES_KEY,
    ACTIVE_TEMPLATE_KEY
  ];

  if (watchedKeys.some((key) => changes[key])) {
    loadSettings();
  }
});

if (document.body) {
  loadSettings();
} else {
  window.addEventListener("DOMContentLoaded", loadSettings, { once: true });
}
