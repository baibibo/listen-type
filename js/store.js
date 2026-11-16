import { assetUrl } from "./paths.js";
import { normEn } from "./norm.js";

export const STORAGE_KEY = "listen-type-pages-v1";
export const MEMBER_KEY = "listen-type-member-id";
export const GOAL = { listen: 5, type: 5 };
export const DEFAULT_FAMILY_NAME = "我家";
export const MEMBER_COLORS = [
  "#3ec6f0",
  "#e6b15c",
  "#7dcea0",
  "#c07be0",
  "#ef6b61",
  "#9aa8b8",
  "#f0a36b",
];

let ALL_LESSONS = [];

export function allLessons() {
  return ALL_LESSONS;
}

export function findLesson(id) {
  return ALL_LESSONS.find((lesson) => lesson.id === id) || ALL_LESSONS[0];
}

export function findLessonItem(lessonId, itemIndex) {
  const lesson = findLesson(lessonId);
  return lesson?.items.find((item) => item.index === itemIndex) || lesson?.items[0];
}

export async function loadLessons() {
  const res = await fetch(assetUrl("data/lessons.json"), { cache: "no-cache" });
  if (!res.ok) throw new Error("无法加载课程数据");
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) throw new Error("课程数据是空的");
  ALL_LESSONS = data;
  return ALL_LESSONS;
}

function todayStamp() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

function isToday(value, today) {
  if (!value) return false;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10) === today;
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }) === today;
}

function defaultState() {
  return {
    family: { id: 1, name: DEFAULT_FAMILY_NAME },
    nextMemberId: 4,
    members: [
      { id: 1, name: "爸爸", role: "家长", color: MEMBER_COLORS[0], lastLessonId: 1, lastIndex: 0, lastScene: "", progress: {}, typoCounts: {} },
      { id: 2, name: "妈妈", role: "家长", color: MEMBER_COLORS[1], lastLessonId: 1, lastIndex: 0, lastScene: "", progress: {}, typoCounts: {} },
      { id: 3, name: "孩子", role: "孩子", color: MEMBER_COLORS[2], lastLessonId: 1, lastIndex: 0, lastScene: "", progress: {}, typoCounts: {} },
    ],
  };
}

function normalizeMember(raw, index) {
  return {
    id: Number(raw.id) || index + 1,
    name: String(raw.name || "成员").slice(0, 20),
    role: raw.role === "家长" || raw.role === "孩子" ? raw.role : "成员",
    color: /^#[0-9A-Fa-f]{6}$/.test(String(raw.color || "")) ? raw.color : MEMBER_COLORS[index % MEMBER_COLORS.length],
    lastLessonId: Number(raw.lastLessonId) || 1,
    lastIndex: Number.isFinite(Number(raw.lastIndex)) ? Math.max(0, Math.floor(Number(raw.lastIndex))) : 0,
    lastScene: typeof raw.lastScene === "string" ? raw.lastScene : "",
    progress: raw.progress && typeof raw.progress === "object" ? raw.progress : {},
    typoCounts: raw.typoCounts && typeof raw.typoCounts === "object" ? raw.typoCounts : {},
  };
}

function readState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.members) || !data.members.length) return defaultState();
    const members = data.members.map(normalizeMember);
    const maxId = members.reduce((n, m) => Math.max(n, m.id), 0);
    return {
      family: { id: 1, name: (data.family && data.family.name) || DEFAULT_FAMILY_NAME },
      nextMemberId: Math.max(Number(data.nextMemberId) || 0, maxId + 1),
      members,
    };
  } catch {
    return defaultState();
  }
}

function writeState(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function flattenProgress(progress) {
  const rows = [];
  for (const [lessonId, items] of Object.entries(progress || {})) {
    if (!items || typeof items !== "object") continue;
    for (const [itemIndex, row] of Object.entries(items)) {
      if (!row || typeof row !== "object") continue;
      rows.push({
        lessonId: Number(lessonId),
        itemIndex: Number(itemIndex),
        listenedAt: row.listenedAt || null,
        completedAt: row.completedAt || null,
        hard: !!row.hard,
      });
    }
  }
  return rows;
}

function summarizeMember(m, lessonIdOverride) {
  const today = todayStamp();
  const allRows = flattenProgress(m.progress);
  const lessonId = findLesson(lessonIdOverride || m.lastLessonId || 1)?.id || 1;
  const lessonRows = allRows.filter((r) => r.lessonId === lessonId);
  const lastLesson = findLesson(lessonId);
  const lookIndex = lessonId === (m.lastLessonId || 1) ? m.lastIndex : (lessonRows.length ? Math.max(...lessonRows.map((r) => r.itemIndex)) : 0);
  const lastItem = lastLesson?.items.find((item) => item.index === (lessonId === (m.lastLessonId || 1) ? m.lastIndex : lookIndex)) || lastLesson?.items[0];
  const typoRows = Object.entries(m.typoCounts || {})
    .map(([word, count]) => ({ word, count: Number(count) || 0 }))
    .filter((t) => t.word && t.count > 0)
    .sort((a, b) => b.count - a.count);
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    color: m.color,
    todayListen: allRows.filter((r) => isToday(r.listenedAt, today)).length,
    todayType: allRows.filter((r) => isToday(r.completedAt, today)).length,
    hardCount: allRows.filter((r) => r.hard).length,
    typoCount: typoRows.length,
    typos: typoRows.slice(0, 8),
    lastLessonId: m.lastLessonId || 1,
    lastLessonTitle: lastLesson ? lastLesson.titleCn : "吃早餐",
    lastIndex: lessonId === (m.lastLessonId || 1) ? (m.lastIndex || 0) : lookIndex,
    lastScene: m.lastScene || "",
    lastCn: lastItem ? lastItem.cn : "还没开始",
    listened: lessonRows.filter((r) => r.listenedAt).map((r) => r.itemIndex),
    completed: lessonRows.filter((r) => r.completedAt).map((r) => r.itemIndex),
    hard: lessonRows.filter((r) => r.hard).map((r) => r.itemIndex),
  };
}

export function getFamily() {
  const state = readState();
  return {
    family: state.family,
    goal: GOAL,
    members: state.members.map((m) => summarizeMember(m)),
  };
}

export function addMember(name, role = "成员") {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("请填写成员名字");
  const allowedRole = role === "家长" || role === "孩子" ? role : "成员";
  const state = readState();
  const color = MEMBER_COLORS[state.members.length % MEMBER_COLORS.length];
  const member = {
    id: state.nextMemberId,
    name: trimmed.slice(0, 20),
    role: allowedRole,
    color,
    lastLessonId: 1,
    lastIndex: 0,
    lastScene: "",
    progress: {},
    typoCounts: {},
  };
  state.members.push(member);
  state.nextMemberId += 1;
  writeState(state);
  return summarizeMember(member);
}

export function listLessonSummaries(memberId) {
  const state = readState();
  const member = state.members.find((m) => m.id === memberId);
  const rows = member ? flattenProgress(member.progress) : [];
  const lastLessonId = member?.lastLessonId || 0;
  const lastIndex = member?.lastIndex || 0;
  return ALL_LESSONS.map((lesson) => {
    const lessonRows = rows.filter((r) => r.lessonId === lesson.id);
    const lessonLastIndex = lastLessonId === lesson.id ? lastIndex : lessonRows.length ? Math.max(...lessonRows.map((r) => r.itemIndex)) : 0;
    return {
      id: lesson.id,
      code: lesson.code,
      category: lesson.category,
      titleEn: lesson.titleEn,
      titleCn: lesson.titleCn,
      image: lesson.image,
      itemCount: lesson.items.length,
      listened: lessonRows.filter((r) => r.listenedAt).length,
      completed: lessonRows.filter((r) => r.completedAt).length,
      lastIndex: lessonLastIndex,
    };
  });
}

export function getMemberProgress(memberId, lessonId) {
  const state = readState();
  const member = state.members.find((m) => m.id === memberId);
  if (!member) throw new Error("找不到这个成员");
  const currentLessonId = findLesson(lessonId || member.lastLessonId || 1)?.id || 1;
  return summarizeMember(member, currentLessonId);
}

export function patchProgress(memberId, body = {}) {
  const state = readState();
  const member = state.members.find((m) => m.id === memberId);
  if (!member) throw new Error("找不到这个成员");

  const requested = typeof body.lessonId === "number" && Number.isFinite(body.lessonId) ? Math.floor(body.lessonId) : 0;
  const lessonId = findLesson(requested) ? requested : member.lastLessonId || 1;
  const itemIndex =
    typeof body.itemIndex === "number" && Number.isFinite(body.itemIndex)
      ? Math.max(0, Math.floor(body.itemIndex))
      : null;
  const lastScene = typeof body.lastScene === "string" ? body.lastScene : null;

  member.lastLessonId = lessonId;
  if (itemIndex != null) member.lastIndex = itemIndex;
  if (lastScene) member.lastScene = lastScene;

  const needRow = itemIndex != null && (body.listened || body.completed || body.hard);
  if (needRow && itemIndex != null) {
    const lid = String(lessonId);
    const iid = String(itemIndex);
    if (!member.progress[lid]) member.progress[lid] = {};
    if (!member.progress[lid][iid]) member.progress[lid][iid] = { listenedAt: null, completedAt: null, hard: false };
    const row = member.progress[lid][iid];
    const now = new Date().toISOString();
    if (body.listened && !row.listenedAt) row.listenedAt = now;
    if (body.completed && !row.completedAt) row.completedAt = now;
    if (body.hard) row.hard = true;
  }

  if (body.typo) {
    const word = normEn(body.typo) || String(body.typo).trim().toLowerCase();
    if (word) member.typoCounts[word] = (Number(member.typoCounts[word]) || 0) + 1;
  }

  writeState(state);
  return getMemberProgress(memberId, lessonId);
}
