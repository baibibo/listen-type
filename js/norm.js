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
