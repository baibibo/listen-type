#!/usr/bin/env node
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { promptCnForEnglish } from "../js/norm.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lessons = JSON.parse(readFileSync(resolve(root, "data/lessons.json"), "utf8"));

const LATIN_RE = /[A-Za-z0-9][A-Za-z0-9_./+\-]*/g;

function compactKey(raw) {
  return String(raw).replace(/[^A-Za-z0-9_]/g, "").toLowerCase();
}

function answerKeys(item) {
  const keys = new Set();
  const add = (raw) => {
    const compact = compactKey(raw);
    if (compact) keys.add(compact);
    for (const part of String(raw).split(/[^A-Za-z0-9]+/)) {
      if (part) keys.add(part.toLowerCase());
    }
  };
  for (const word of item.words || []) add(word);
  for (const tok of String(item.en || "").match(LATIN_RE) || []) add(tok);
  for (const alias of item.aliases || []) {
    for (const tok of String(alias).match(LATIN_RE) || []) add(tok);
  }
  return keys;
}

function leakedTokens(item, prompt) {
  const keys = answerKeys(item);
  const found = [];
  for (const tok of String(prompt).match(LATIN_RE) || []) {
    const key = compactKey(tok);
    if (key && keys.has(key)) found.push(tok);
  }
  return found;
}

const expected = [
  ["编程关键字", "enum（枚举）", "枚举"],
  ["编程关键字", "用 let 声明这个变量。", "用 ____ 声明这个变量。"],
  ["编程关键字", "这个值是 true 或 false。", "这个值是 ____ 或 ____。"],
  ["编程关键字", "never（永不类型）", "永不类型"],
  ["编程关键字", "constructor（构造函数）", "构造函数"],
  ["编程关键字", "这个类继承了基类。", "这个类继承了基类。"],
  ["代码与报错", "404", "四零四"],
  ["代码与报错", "500", "五百"],
  ["代码与报错", "我们遇到了 404 错误。", "我们遇到了 ____ 错误。"],
  ["代码与报错", "这是一个 500 错误。", "这是一个 ____ 错误。"],
  ["技术栈", "TS（TypeScript 简称）", "____ 简称"],
  ["技术栈", "k8s（Kubernetes 简称）", "____ 简称"],
];

let failed = 0;
for (const [title, cn, want] of expected) {
  const lesson = lessons.find((les) => les.titleCn === title);
  const item = lesson?.items.find((it) => it.cn === cn);
  if (!item) {
    console.error(`MISSING ${title}: ${cn}`);
    failed += 1;
    continue;
  }
  const got = promptCnForEnglish(item);
  if (got !== want) {
    console.error(`PROMPT ${title}: ${cn}\n  want: ${want}\n  got:  ${got}`);
    failed += 1;
  }
}

let total = 0;
let leaks = 0;
const examples = [];
for (const lesson of lessons) {
  for (const item of lesson.items || []) {
    total += 1;
    const prompt = promptCnForEnglish(item);
    const found = leakedTokens(item, prompt);
    if (found.length) {
      leaks += 1;
      examples.push({ lesson: lesson.titleCn, en: item.en, cn: item.cn, prompt, found });
    }
  }
}

if (leaks) {
  console.error(`LEAKS ${leaks}/${total}`);
  for (const ex of examples) console.error(JSON.stringify(ex, null, 0));
  failed += leaks;
} else {
  console.log(`no answer leaks in ${total} items`);
}

if (failed) {
  console.error(`FAILED ${failed}`);
  process.exit(1);
}
console.log("check-cn2en-prompts: ok");
