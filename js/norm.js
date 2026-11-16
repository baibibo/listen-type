export function slug(text) {
  return String(text)
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

export function normEn(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:"“”‘’]/g, "")
    .replace(/'/g, "");
}

export function normCn(s) {
  return String(s)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[。.?？!！,，、]/g, "");
}

export function sceneLabel(scene) {
  if (scene === "car-listen" || scene === "car-type") return "车上";
  if (scene === "home") return "在家";
  return "还没开始";
}

const LATIN_TOKEN_RE = /[A-Za-z0-9][A-Za-z0-9_./+\-]*/g;

const ENGLISH_GLOSS_RE =
  /^\s*([A-Za-z0-9][A-Za-z0-9_./+\-]*(?:\s+[A-Za-z0-9][A-Za-z0-9_./+\-]*)*)\s*[（(]([^）)]+)[）)]\s*$/;

function normalizePromptText(text) {
  return String(text || "")
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .trim();
}

function compactKey(raw) {
  return String(raw).replace(/[^A-Za-z0-9_]/g, "").toLowerCase();
}

function addKeys(keys, raw) {
  const compact = compactKey(raw);
  if (compact) keys.add(compact);
  for (const part of String(raw).split(/[^A-Za-z0-9]+/)) {
    const key = part.toLowerCase();
    if (key) keys.add(key);
  }
}

function latinKeys(item) {
  const keys = new Set();
  for (const word of item.words || []) addKeys(keys, String(word));
  for (const tok of String(item.en || "").match(LATIN_TOKEN_RE) || []) addKeys(keys, tok);
  for (const alias of item.aliases || []) {
    for (const tok of String(alias).match(LATIN_TOKEN_RE) || []) addKeys(keys, tok);
  }
  return keys;
}

function hideLatinAnswers(text, keys, hideAllWords = false) {
  if (!text) return "";
  return String(text)
    .replace(LATIN_TOKEN_RE, (tok) => {
      const key = compactKey(tok);
      if (key && keys.has(key)) return "____";
      if (hideAllWords && /[A-Za-z]/.test(tok) && key.length >= 2) return "____";
      return tok;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function isMostlyBlank(text) {
  return !/[\u4e00-\u9fffA-Za-z0-9]/.test(String(text).replace(/____/g, ""));
}

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

function usablePrompt(text) {
  return Boolean(text) && !isMostlyBlank(text);
}

export function promptCnForEnglish(item) {
  const keys = latinKeys(item);
  const cn = normalizePromptText(item?.cn || "");

  const gloss = cn.match(ENGLISH_GLOSS_RE);
  if (gloss && gloss[2].trim()) {
    const hiddenGloss = hideLatinAnswers(normalizePromptText(gloss[2]), keys);
    if (usablePrompt(hiddenGloss)) return hiddenGloss;
  }

  const hidden = hideLatinAnswers(cn, keys);
  if (usablePrompt(hidden) && hasChinese(hidden)) return hidden;

  for (const alias of item.aliases || []) {
    if (!hasChinese(alias)) continue;
    const next = hideLatinAnswers(normalizePromptText(alias), keys);
    if (usablePrompt(next)) return next;
  }

  const notes = [item.analysis?.tip || "", ...((item.analysis?.tokens || []).map((token) => token.note || ""))];
  for (const note of notes) {
    if (!hasChinese(note)) continue;
    const next = hideLatinAnswers(normalizePromptText(note), keys, true);
    if (next && hasChinese(next) && !isMostlyBlank(next)) return next;
  }

  return hidden || cn;
}
