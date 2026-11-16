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

const ENGLISH_GLOSS_RE =
  /^\s*([A-Za-z][A-Za-z0-9_./+\-]*(?:\s+[A-Za-z][A-Za-z0-9_./+\-]*)*)\s*[（(]([^）)]+)[）)]\s*$/;

function latinKeys(item) {
  const keys = new Set();
  for (const word of item.words || []) {
    const key = String(word).replace(/[^A-Za-z0-9_]/g, "").toLowerCase();
    if (key) keys.add(key);
  }
  const enTokens = String(item.en || "").match(/[A-Za-z][A-Za-z0-9_./+\-]*/g) || [];
  for (const tok of enTokens) {
    const key = tok.replace(/[^A-Za-z0-9_]/g, "").toLowerCase();
    if (key) keys.add(key);
  }
  return keys;
}

function hideLatinAnswers(text, keys) {
  if (!text) return "";
  if (!keys.size) return text;
  return text
    .replace(/[A-Za-z][A-Za-z0-9_./+\-]*/g, (tok) => {
      const key = tok.replace(/[^A-Za-z0-9_]/g, "").toLowerCase();
      return key && keys.has(key) ? "____" : tok;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function isMostlyBlank(text) {
  return !/[\u4e00-\u9fffA-Za-z0-9]/.test(text.replace(/____/g, ""));
}

export function promptCnForEnglish(item) {
  const cn = String(item?.cn || "").trim();
  const gloss = cn.match(ENGLISH_GLOSS_RE);
  if (gloss && gloss[2].trim()) return gloss[2].trim();

  const keys = latinKeys(item);
  const hidden = hideLatinAnswers(cn, keys);
  if (hidden && !isMostlyBlank(hidden)) return hidden;

  for (const alias of item.aliases || []) {
    if (!/[\u4e00-\u9fff]/.test(alias)) continue;
    const next = hideLatinAnswers(alias, keys);
    if (next && !isMostlyBlank(next)) return next;
  }

  const notes = [item.analysis?.tip || "", ...((item.analysis?.tokens || []).map((token) => token.note || ""))];
  for (const note of notes) {
    if (!/[\u4e00-\u9fff]/.test(note)) continue;
    const next = hideLatinAnswers(note, keys);
    if (next && /[\u4e00-\u9fff]/.test(next)) return next;
  }

  return hidden || cn;
}
