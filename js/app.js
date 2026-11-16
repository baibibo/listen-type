import { assetUrl } from "./paths.js";
import { slug, normEn, normCn, sceneLabel } from "./norm.js";
import {
  MEMBER_KEY,
  GOAL,
  loadLessons,
  findLesson,
  getFamily,
  addMember,
  listLessonSummaries,
  getMemberProgress,
  patchProgress,
} from "./store.js";

const AUTOPLAY_GAP = 650;
const PREFERRED_CATEGORIES = ["生活", "入门", "基础", "出行", "办公室", "邮件", "IT", "综合"];
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M7 5h3v14H7zm7 0h3v14h-3z" /></svg>';
const ICON_SPEAK = '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4zm11.5 2a3.5 3.5 0 0 0-1.5-2.9v5.8a3.5 3.5 0 0 0 1.5-2.9z" /></svg>';

const state = {
  bootError: "",
  loading: true,
  family: null,
  catalog: [],
  lesson: null,
  screen: "family",
  memberId: null,
  index: 0,
  homeMode: "learn",
  autoplay: true,
  loop: true,
  showEn: true,
  playing: false,
  typed: "",
  statuses: [],
  values: [],
  cnValue: "",
  cnStatus: "",
  toast: "",
  adding: false,
  selectedWordI: null,
  showAnalysis: false,
  lessonId: 1,
  lessonProg: { listened: [], completed: [], hard: [], lastIndex: 0 },
  order: [],
};

const player = document.getElementById("player");
const appEl = document.getElementById("app");
const toastEl = document.getElementById("toast");
let toastTimer = 0;
let awaitingAuto = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function imageUrl(name) {
  if (!name) return "";
  return assetUrl("images/" + name);
}

function audioUrl(key) {
  return assetUrl("audio/" + key + ".mp3");
}

function kindOf(item) {
  return item && item.kind === "word" ? "word" : "sentence";
}

function kindLabel(item) {
  return kindOf(item) === "word" ? "单词" : "句子";
}

function kindBadge(item) {
  const word = kindOf(item) === "word";
  return `<span class="kind-pill ${word ? "is-word" : "is-sentence"}">${word ? "单词" : "句子"}</span>`;
}

function shortName(name) {
  return String(name || "").slice(0, 1);
}

function currentMember() {
  return state.family?.members.find((m) => m.id === state.memberId) || null;
}

function items() {
  return state.lesson?.items || [];
}

function currentItem() {
  const list = items();
  return list[state.index] || list[0] || null;
}

function sessionOrder() {
  const list = items();
  return state.order.length === list.length ? state.order : list.map((_, i) => i);
}

function displayNo() {
  const seq = sessionOrder();
  const pos = seq.indexOf(state.index);
  return (pos >= 0 ? pos : state.index) + 1;
}

function currentWordIndex() {
  return state.statuses.findIndex((s) => s !== "done");
}

function shuffleIds(ids) {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeOrder(count, start) {
  const ids = Array.from({ length: count }, (_, i) => i);
  if (count <= 1) return ids;
  if (start != null && start >= 0 && start < count) {
    return [start, ...shuffleIds(ids.filter((id) => id !== start))];
  }
  return shuffleIds(ids);
}

function showToast(msg) {
  state.toast = msg;
  toastEl.textContent = msg;
  toastEl.classList.toggle("show", !!msg);
  window.clearTimeout(toastTimer);
  if (msg) toastTimer = window.setTimeout(() => showToast(""), 1800);
}

function refreshFamily() {
  state.family = getFamily();
  if (state.memberId) {
    state.catalog = listLessonSummaries(state.memberId);
    try {
      const prog = getMemberProgress(state.memberId, state.lessonId);
      state.lessonProg = {
        listened: prog.listened || [],
        completed: prog.completed || [],
        hard: prog.hard || [],
        lastIndex: prog.lastIndex || 0,
      };
    } catch {
      /* ignore */
    }
  }
}

function applyProgress(updated) {
  if (!updated) return;
  if (state.family) {
    state.family.members = state.family.members.map((m) => (m.id === updated.id ? updated : m));
  }
  state.lessonProg = {
    listened: updated.listened || [],
    completed: updated.completed || [],
    hard: updated.hard || [],
    lastIndex: updated.lastIndex || 0,
  };
}

function patch(id, body) {
  try {
    const updated = patchProgress(id, { lessonId: state.lessonId, ...body });
    applyProgress(updated);
    if (state.family) state.family = getFamily();
    return updated;
  } catch (err) {
    showToast(err instanceof Error ? err.message : "进度没有保存成功");
    return null;
  }
}

function resetPractice(nextIndex = state.index, nextScreen = state.screen, nextMode = state.homeMode) {
  const words = items()[nextIndex]?.words || [];
  if (nextMode === "learn" && nextScreen === "home") {
    state.statuses = words.map(() => "done");
    state.values = words.slice();
  } else {
    state.statuses = words.map(() => "");
    state.values = words.map(() => "");
  }
  state.typed = "";
  state.cnValue = "";
  state.cnStatus = "";
  state.selectedWordI = null;
  state.showAnalysis = false;
}

function stopPlay() {
  awaitingAuto = false;
  if (player) player.pause();
  state.playing = false;
}

function markListened(itemIndex = state.index, scene = state.screen) {
  if (!state.memberId) return;
  const already = state.lessonProg.listened.includes(itemIndex);
  patch(state.memberId, {
    itemIndex,
    lastScene: scene,
    listened: already ? undefined : true,
  });
}

function playKey(key) {
  if (!player) return;
  awaitingAuto = false;
  player.pause();
  player.src = audioUrl(key);
  const p = player.play();
  if (p) {
    p.then(() => {
      state.playing = true;
      syncPlayingUi();
    }).catch(() => showToast("请再点一次播放"));
  }
}

function playSentence(itemIndex = state.index, scene = state.screen) {
  const cur = items()[itemIndex];
  if (!cur) return;
  playKey(slug(cur.en));
  markListened(itemIndex, scene);
}

function goFamily() {
  stopPlay();
  state.screen = "family";
  state.adding = false;
  refreshFamily();
  render();
}

function goLessons() {
  stopPlay();
  state.screen = "lessons";
  if (state.memberId) state.catalog = listLessonSummaries(state.memberId);
  render();
}

function openMember(id) {
  state.memberId = id;
  window.localStorage.setItem(MEMBER_KEY, String(id));
  state.screen = "lessons";
  state.catalog = listLessonSummaries(id);
  render();
}

function selectLesson(id, mid) {
  const les = findLesson(id);
  if (!les) throw new Error("无法打开课程");
  const prog = getMemberProgress(mid, id);
  state.lesson = les;
  state.lessonId = les.id;
  state.lessonProg = {
    listened: prog.listened || [],
    completed: prog.completed || [],
    hard: prog.hard || [],
    lastIndex: prog.lastIndex || 0,
  };
  const nextIndex = Math.min(prog.lastIndex || 0, Math.max((les.items.length || 1) - 1, 0));
  state.index = nextIndex;
  resetPractice(nextIndex, "scene", state.homeMode);
  return { lesson: les, progress: prog, nextIndex };
}

function openLesson(id) {
  if (!state.memberId) return;
  try {
    selectLesson(id, state.memberId);
    state.screen = "scene";
    render();
  } catch (err) {
    showToast(err instanceof Error ? err.message : "无法打开课程");
  }
}

function openScreen(name, atIndex = state.index, mode = "keep") {
  stopPlay();
  const list = items();
  let start = atIndex;
  if (list.length) {
    if (mode === "new") {
      const nextOrder = makeOrder(list.length);
      state.order = nextOrder;
      start = nextOrder[0] ?? 0;
    } else if (mode === "resume") {
      state.order = makeOrder(list.length, atIndex);
      start = atIndex;
    }
  }
  state.screen = name;
  state.index = start;
  resetPractice(start, name, state.homeMode);
  if (state.memberId) patch(state.memberId, { itemIndex: start, lastScene: name });
  render();
}

function goItem(delta) {
  const list = items();
  if (!list.length) return;
  stopPlay();
  const seq = sessionOrder();
  const pos = seq.indexOf(state.index);
  const from = pos >= 0 ? pos : state.index;
  const next = seq[(from + delta + seq.length) % seq.length];
  state.index = next;
  resetPractice(next, state.screen, state.homeMode);
  if (state.memberId) patch(state.memberId, { itemIndex: next, lastScene: state.screen });
  render();
}

function markCompleted() {
  if (!state.memberId) return;
  if (state.lessonProg.completed.includes(state.index)) {
    patch(state.memberId, { itemIndex: state.index, lastScene: state.screen });
    return;
  }
  patch(state.memberId, { itemIndex: state.index, lastScene: state.screen, completed: true });
}

function markHard() {
  if (state.memberId) patch(state.memberId, { itemIndex: state.index, lastScene: state.screen, hard: true });
  showToast("已记下不熟悉，回家会优先复习");
  goItem(1);
}

function accept(i) {
  const item = currentItem();
  if (!item) return;
  state.statuses = state.statuses.map((s, idx) => (idx === i ? "done" : s));
  state.values = state.values.map((v, idx) => (idx === i ? item.words[i] : v));
  state.typed = "";
  const done = state.statuses.every((s) => s === "done");
  if (done) {
    markCompleted();
    playSentence();
  }
  render();
}

function fail(i) {
  const item = currentItem();
  if (!item) return;
  state.statuses = state.statuses.map((s, idx) => (idx === i ? "bad" : s));
  if (state.memberId) {
    patch(state.memberId, { itemIndex: state.index, lastScene: state.screen, typo: item.words[i] });
  }
  render();
}

function onWordInput(raw) {
  const item = currentItem();
  if (!item) return;
  const i = currentWordIndex();
  if (i < 0) return;
  const next = raw.replace(/\s+/g, "");
  state.typed = next;
  if (state.statuses[i] === "bad") {
    state.statuses = state.statuses.map((s, idx) => (idx === i ? "" : s));
    const wordEl = document.querySelector(`.word[data-i="${i}"]`);
    if (wordEl) wordEl.classList.remove("bad");
  }
  if (normEn(next) === normEn(item.words[i]) && next.length >= normEn(item.words[i]).length) {
    accept(i);
  }
}

function onWordKey(e) {
  const item = currentItem();
  if (!item) return;
  const i = currentWordIndex();
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    if (i < 0) {
      goItem(1);
      return;
    }
    if (!state.typed) return;
    if (normEn(state.typed) === normEn(item.words[i])) accept(i);
    else fail(i);
  } else if (e.key === "Backspace" && !state.typed && i > 0) {
    e.preventDefault();
    state.statuses = state.statuses.map((s, idx) => (idx === i - 1 ? "" : s));
    state.typed = state.values[i - 1] || "";
    state.values = state.values.map((v, idx) => (idx === i - 1 ? "" : v));
    render();
  }
}

function checkCn() {
  const item = currentItem();
  if (!item) return;
  const typedCn = normCn(state.cnValue);
  if (!typedCn) {
    showToast("先输入中文再核对");
    return;
  }
  const ok = (item.aliases || [item.cn]).some((a) => normCn(a) === typedCn);
  state.cnStatus = ok ? "ok" : "bad";
  if (ok) markCompleted();
  render();
}

function onAudioEnded() {
  state.playing = false;
  syncPlayingUi();
  if (state.screen !== "car-listen" || !state.autoplay) return;
  if (state.memberId != null) {
    patch(state.memberId, { itemIndex: state.index, lastScene: "car-listen", listened: true });
  }
  const curPos = sessionOrder().indexOf(state.index);
  const seq = sessionOrder();
  const hasNext = curPos >= 0 && curPos < seq.length - 1;
  if (hasNext) {
    awaitingAuto = true;
    window.setTimeout(() => {
      if (!awaitingAuto || state.screen !== "car-listen") return;
      const pos = sessionOrder().indexOf(state.index);
      const orderNow = sessionOrder();
      if (pos < 0 || pos >= orderNow.length - 1) return;
      const next = orderNow[pos + 1];
      state.index = next;
      resetPractice(next, "car-listen", state.homeMode);
      if (state.memberId != null) patch(state.memberId, { itemIndex: next, lastScene: "car-listen" });
      const nxt = items()[next];
      render();
      if (nxt) {
        playKey(slug(nxt.en));
        if (state.memberId != null) {
          patch(state.memberId, { itemIndex: next, lastScene: "car-listen", listened: true });
        }
      }
    }, AUTOPLAY_GAP);
  } else if (state.loop && items().length > 0) {
    const nextOrder = makeOrder(items().length);
    const next = nextOrder[0] ?? 0;
    awaitingAuto = true;
    window.setTimeout(() => {
      if (!awaitingAuto || state.screen !== "car-listen") return;
      state.order = nextOrder;
      state.index = next;
      resetPractice(next, "car-listen", state.homeMode);
      if (state.memberId != null) patch(state.memberId, { itemIndex: next, lastScene: "car-listen" });
      const nxt = items()[next];
      render();
      if (nxt) {
        playKey(slug(nxt.en));
        if (state.memberId != null) {
          patch(state.memberId, { itemIndex: next, lastScene: "car-listen", listened: true });
        }
      }
    }, AUTOPLAY_GAP);
  } else {
    showToast("今天的车上听力已经听完");
  }
}

function analysisPanel(item) {
  const analysis = item.analysis;
  if (!analysis) {
    return `<p class="muted" style="text-align:center">这句还没有解析。</p>`;
  }
  const cards = (analysis.tokens || [])
    .map((token) => {
      const role = token.role ? `<span class="ac-role">${escapeHtml(token.role)}</span>` : "";
      const note = token.note ? `<div class="ac-note">${escapeHtml(token.note)}</div>` : "";
      return `<div class="analysis-card">
        <div class="ac-word">${escapeHtml(token.text)}</div>
        <div class="ac-ipa">${escapeHtml(token.ipa || "")}</div>
        <div class="ac-meta"><span>${escapeHtml(token.pos || "")}</span>${role}</div>
        ${note}
      </div>`;
    })
    .join("");
  const tip = analysis.tip ? `<p class="analysis-tip">${escapeHtml(analysis.tip)}</p>` : "";
  return `<div class="analysis"><div class="analysis-cards">${cards}</div>${tip}</div>`;
}

function renderWords() {
  const item = currentItem();
  if (!item) return "";
  const curI = currentWordIndex();
  return `<div class="words">${item.words
    .map((w, i) => {
      const cls = ["word"];
      if (state.statuses[i] === "done") cls.push("done");
      if (state.statuses[i] === "bad") cls.push("bad");
      if (i === curI) cls.push("current");
      const shown = state.statuses[i] === "done" ? w : i === curI ? state.typed : state.values[i] || "";
      const widthCh = Math.max(w.length, shown.length, 3) + 0.4;
      const ipa = state.statuses[i] === "done" && item.ipa?.[i] ? `<div class="ipa">${escapeHtml(item.ipa[i])}</div>` : "";
      const inner =
        i === curI
          ? `<input id="activeInput" type="text" lang="en" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" value="${escapeHtml(shown)}" style="width:${widthCh}ch" data-role="word-input">`
          : `<div class="glyph">${escapeHtml(shown)}</div>`;
      return `<div class="${cls.join(" ")}" data-i="${i}" style="min-width:${widthCh}ch">${inner}<div class="line"></div>${ipa}</div>`;
    })
    .join("")}</div>`;
}

function progressDots() {
  const seq = sessionOrder();
  if (seq.length > 24) {
    const pct = seq.length ? Math.round((displayNo() / seq.length) * 100) : 0;
    return `<div class="progress-slim" aria-hidden="true"><span style="width:${pct}%"></span></div>`;
  }
  return `<div class="dots">${seq
    .map((itemIndex) => {
      const on = itemIndex === state.index ? "on" : "";
      const done = state.lessonProg.listened.includes(itemIndex) ? "done" : "";
      return `<i class="${on} ${done}"></i>`;
    })
    .join("")}</div>`;
}

function speakBtn() {
  return `<button class="speak" type="button" data-act="play-sentence" aria-label="播放">${ICON_SPEAK}</button>`;
}

function analysisToggle(item, visibleWhen) {
  if (!visibleWhen || !item.analysis) return "";
  const label = state.showAnalysis ? "收起解析" : `${kindLabel(item)}解析`;
  return `<div class="row" style="justify-content:center;margin-top:8px">
    <button class="ghost" type="button" data-act="toggle-analysis">${escapeHtml(label)}</button>
  </div>${state.showAnalysis ? analysisPanel(item) : ""}`;
}

function phoneChrome(inner, bottom, title) {
  const member = currentMember();
  const list = items();
  return `<div class="car-wrap">
    <div class="car-caption">这是 ${escapeHtml(member?.name || "")} 在车上用手机时的样子。第一次请先连 Wi-Fi 下载课程。</div>
    <div class="phone">
      <div class="top">
        <button class="textbtn" type="button" data-act="back-scene">← 返回</button>
        <div class="sub">${escapeHtml(member?.name || "")} · ${escapeHtml(title)} · ${displayNo()}/${list.length}，本次随机</div>
      </div>
      <div class="phone-scroll">${inner}</div>
      ${progressDots()}
      <div class="phone-bottom">${bottom}</div>
    </div>
  </div>`;
}

function typoText(member) {
  if (!member?.typos?.length) return "";
  return member.typos
    .slice(0, 4)
    .map((t) => `${t.word}（${t.count}次）`)
    .join("、");
}

function renderFamily() {
  const family = state.family;
  const goal = family.goal || GOAL;
  const members = family.members
    .map((m) => {
      const last = m.lastCn || "还没开始";
      return `<button class="card" type="button" data-act="open-member" data-id="${m.id}">
        <div class="name">
          <span class="avatar" style="background:${m.color}">${escapeHtml(shortName(m.name))}</span>
          ${escapeHtml(m.name)}
          <span class="meta"> · ${escapeHtml(m.role)}</span>
        </div>
        <div class="meta">
          <span class="pill">今日已听 <em>${m.todayListen}</em>/${goal.listen}</span>
          <span class="pill">打对 <em>${m.todayType}</em>/${goal.type}</span>
          <span class="pill">不熟悉 ${m.hardCount}</span>
          <span class="pill">错词 ${m.typoCount}</span>
        </div>
        <div class="meta">上次在${escapeHtml(sceneLabel(m.lastScene))} · ${escapeHtml(m.lastLessonTitle)} · ${escapeHtml(last)}</div>
      </button>`;
    })
    .join("");

  const add = !state.adding
    ? `<button class="ghost" type="button" data-act="start-add">添加成员</button>`
    : `<form class="add-form" data-role="add-member">
        <input name="name" autofocus placeholder="成员名字" maxlength="20">
        <select name="role">
          <option value="成员">成员</option>
          <option value="家长">家长</option>
          <option value="孩子">孩子</option>
        </select>
        <button class="primary" type="submit">添加</button>
        <button class="ghost" type="button" data-act="cancel-add">取消</button>
      </form>`;

  const todayList = family.members
    .map((m) => {
      const bits = [];
      if ((m.todayListen || 0) > 0 && (m.todayType || 0) === 0) {
        bits.push(`车上已听 ${m.todayListen} 句，回家可以用电脑打字`);
      } else if ((m.todayType || 0) > 0) {
        bits.push(`今天已听 ${m.todayListen || 0}、打对 ${m.todayType} 句`);
      } else {
        bits.push("今天还没开始");
      }
      if (m.hardCount) bits.push(`有 ${m.hardCount} 句不熟悉`);
      if (m.typos[0]) bits.push(`容易打错 ${m.typos[0].word}`);
      return `<li><strong>${escapeHtml(m.name)}</strong>：${escapeHtml(bits.join("，"))}</li>`;
    })
    .join("");

  return `<div class="page">
    <div class="top">
      <div>
        <div class="brand">听背打</div>
        <div class="sub" style="margin-top:4px">${escapeHtml(family.family.name)}的英语学习</div>
      </div>
    </div>
    <h2>家庭成员</h2>
    <div class="members">${members}</div>
    <div class="row" style="margin-top:12px">${add}</div>
    <h2>今日家庭</h2>
    <ul class="list">${todayList}</ul>
  </div>`;
}

function renderLessons() {
  const member = currentMember();
  if (!member) return renderFamily();
  const goal = state.family.goal || GOAL;
  const catalog = state.catalog;
  const categories = [
    ...PREFERRED_CATEGORIES,
    ...Array.from(new Set(catalog.map((c) => c.category))).filter((cat) => !PREFERRED_CATEGORIES.includes(cat)),
  ];
  const lastLesson = catalog.find((c) => c.id === (member.lastLessonId || 1));
  const grouped = categories
    .map((cat) => ({ cat, list: catalog.filter((c) => c.category === cat) }))
    .filter((g) => g.list.length);

  const cont = lastLesson
    ? `<button class="primary continue-btn" type="button" data-act="continue-last">继续上次：${escapeHtml(member.lastLessonTitle)} 第 ${(member.lastIndex || 0) + 1} 句「${escapeHtml(member.lastCn)}」</button>`
    : "";

  const groups = grouped
    .map((g) => {
      const cards = g.list
        .map((c) => `<button class="card lesson-card" type="button" data-act="open-lesson" data-id="${c.id}">
          <img class="cover" alt="" src="${escapeHtml(imageUrl(c.image))}">
          <h3>${escapeHtml(c.titleCn)}</h3>
          <div class="meta">${escapeHtml(c.code)} ${escapeHtml(c.titleEn)}</div>
          <div class="meta">已听 ${c.listened}/${c.itemCount} · 已打对 <em>${c.completed}</em>/${c.itemCount}</div>
        </button>`)
        .join("");
      return `<div><h2>${escapeHtml(g.cat)}</h2><div class="lesson-grid">${cards}</div></div>`;
    })
    .join("");

  return `<div class="page">
    <div class="top">
      <div>
        <button class="textbtn" type="button" data-act="go-family">← 家人</button>
        <div class="brand" style="margin-top:10px">${escapeHtml(member.name)}的课程</div>
        <div class="sub" style="margin-top:6px">今日任务：听 ${member.todayListen}/${goal.listen} · 打 ${member.todayType}/${goal.type}</div>
      </div>
    </div>
    ${cont}
    ${groups}
  </div>`;
}

function renderScene() {
  const member = currentMember();
  const list = items();
  if (!member) return renderFamily();
  const goal = state.family.goal || GOAL;
  const last = list[state.lessonProg.lastIndex] || list[0];
  const isCurrentLast = (member.lastLessonId || 1) === state.lessonId;
  const resumeIndex = state.lessonProg.lastIndex || 0;
  const listenedNote = state.lessonProg.listened.includes(resumeIndex) ? " · 车上已听过" : "";
  const defaultCar = isCurrentLast && member.lastScene === "car-type" ? "car-type" : "car-listen";

  return `<div class="page">
    <div class="top">
      <div>
        <button class="textbtn" type="button" data-act="go-lessons">← 课程</button>
        <div class="brand" style="margin-top:10px">${escapeHtml(state.lesson?.titleCn || "课程")}</div>
        <div class="sub" style="margin-top:6px">${escapeHtml(member.name)} · ${escapeHtml(state.lesson?.code || "")} ${escapeHtml(state.lesson?.titleEn || "")} · 今日听 ${member.todayListen}/${goal.listen} · 打 ${member.todayType}/${goal.type}</div>
      </div>
    </div>
    <div class="scenes" style="margin-top:28px">
      <button class="card scene-card" type="button" data-act="open-car" data-mode="${defaultCar}">
        <h3>车上模式</h3>
        <div class="meta">开车只听连播，乘客可以听完按词打字。请先在家连 Wi-Fi 打开一次，把当天课程下载好。</div>
      </button>
      <button class="card scene-card" type="button" data-act="open-home">
        <h3>在家学习</h3>
        <div class="meta">用电脑键盘练习。可看图学习、中译英、听打、英译中，并复习车上听过的句子。</div>
      </button>
    </div>
    <button class="primary continue-btn" type="button" data-act="resume-lesson">继续上次：第 ${resumeIndex + 1} 句「${escapeHtml(last?.cn || "")}」${listenedNote}</button>
  </div>`;
}

function renderCarListen() {
  const item = currentItem();
  if (!item) return "";
  const enLine = state.showEn
    ? `<div class="en-ipa-line">${item.words
        .map((w, i) => {
          const on = state.selectedWordI === i ? "on" : "";
          const ipa = item.ipa?.[i] ? `<span class="ipa">${escapeHtml(item.ipa[i])}</span>` : "";
          return `<button class="en-ipa-word ${on}" type="button" data-act="play-word" data-i="${i}">
            <span class="glyph">${escapeHtml(w)}</span>${ipa}
          </button>`;
        })
        .join("")}</div>`
    : "";

  const inner = `
    <img class="art" alt="" src="${escapeHtml(imageUrl(item.image))}" data-act="play-sentence">
    <p class="cn">${escapeHtml(item.cn)}${kindBadge(item)}</p>
    ${enLine}
    <button class="playbig ${state.playing ? "playing" : ""}" id="playBtn" type="button" aria-label="播放" data-act="toggle-play">
      ${state.playing ? ICON_PAUSE : ICON_PLAY}
    </button>
    <div class="car-ctrls">
      <button type="button" data-act="prev">上一句</button>
      <button type="button" data-act="toggle-autoplay">${state.autoplay ? "连播开" : "连播关"}</button>
      <button type="button" data-act="toggle-loop">${state.loop ? "循环开" : "循环关"}</button>
      <button type="button" data-act="next">下一句</button>
    </div>
    <div class="row" style="justify-content:center;margin-top:10px">
      <button class="textbtn" type="button" data-act="toggle-en">${state.showEn ? "隐藏英文" : "显示英文"}</button>
    </div>
    <p class="drive-note">开车请只用只听连播，打字请交给乘客。</p>`;

  const bottom = `<button type="button" data-act="to-car-type">改为乘客打字</button>`;
  return phoneChrome(inner, bottom, "只听连播");
}

function renderCarType() {
  const item = currentItem();
  if (!item) return "";
  const curI = currentWordIndex();
  const hintCls = curI < 0 ? "ok" : "";
  const hint = curI < 0 ? "全部正确" : state.statuses.includes("bad") ? "不对，再试一次" : "";
  const inner = `
    <img class="art" alt="" src="${escapeHtml(imageUrl(item.image))}" data-act="play-sentence">
    <p class="cn">${escapeHtml(item.cn)}${kindBadge(item)}${speakBtn()}</p>
    ${renderWords()}
    <div class="hint ${hintCls}">${escapeHtml(hint)}</div>
    ${analysisToggle(item, curI < 0)}
    <div class="row" style="justify-content:center;margin-top:8px">
      <button class="textbtn" type="button" data-act="mark-hard">不熟悉</button>
    </div>`;
  const bottom = `
    <button type="button" data-act="prev">上一句</button>
    <button type="button" data-act="to-car-listen">改回只听</button>
    <button type="button" data-act="next">下一句</button>`;
  return phoneChrome(inner, bottom, "乘客打字");
}

function renderHome() {
  const member = currentMember();
  const lesson = state.lesson;
  const item = currentItem();
  if (!member || !lesson || !item) return renderFamily();
  const goal = state.family.goal || GOAL;
  const list = items();
  const listenedHere = state.lessonProg.listened.includes(state.index);
  const modes = [
    ["learn", "学习"],
    ["cn2en", "中译英"],
    ["listen", "听打"],
    ["en2cn", "英译中"],
  ];
  const modeBtns = modes
    .map(
      ([id, lab]) =>
        `<button class="mode-btn ${state.homeMode === id ? "on" : ""}" type="button" data-act="set-mode" data-mode="${id}">${lab}</button>`
    )
    .join("");

  let stage = "";
  if (state.homeMode === "learn") {
    const enLine =
      kindOf(item) === "word"
        ? ""
        : `<p class="en-line" style="color:var(--cyan);font-size:28px;font-weight:600;margin-top:16px">${escapeHtml(item.en)}</p>`;
    const study = `<div class="study-words">${item.words
      .map((w, i) => {
        const on = state.selectedWordI === i ? "on" : "";
        const ipa = item.ipa?.[i] ? `<span class="ipa">${escapeHtml(item.ipa[i])}</span>` : "";
        const pos = state.selectedWordI === i && item.pos?.[i] ? `<span class="pos">${escapeHtml(item.pos[i])}</span>` : "";
        return `<button class="study-word ${on}" type="button" data-act="play-word" data-i="${i}">
          <span class="glyph">${escapeHtml(w)}</span>${ipa}${pos}
        </button>`;
      })
      .join("")}</div>`;
    stage = `
      <img class="art" alt="" src="${escapeHtml(imageUrl(item.image))}" data-act="play-sentence">
      <p class="cn">${escapeHtml(item.cn)}${kindBadge(item)}${speakBtn()}${listenedHere ? '<span class="badge">车上已听</span>' : ""}</p>
      ${enLine}
      ${study}
      <div class="row" style="justify-content:center;margin-top:16px">
        <button class="ghost" type="button" data-act="toggle-analysis">${state.showAnalysis ? "收起解析" : `${kindLabel(item)}解析`}</button>
      </div>
      ${state.showAnalysis ? analysisPanel(item) : ""}`;
  } else if (state.homeMode === "en2cn") {
    const after =
      state.cnStatus === "ok" && item.ipa?.length
        ? `<p class="en-line" style="margin-top:10px">${item.words
            .map((w, i) => `<span style="margin:0 8px">${escapeHtml(w)} <span class="ipa" style="display:inline">${escapeHtml(item.ipa?.[i] || "")}</span></span>`)
            .join("")}</p>`
        : "";
    stage = `
      <img class="art" alt="" src="${escapeHtml(imageUrl(item.image))}" data-act="play-sentence">
      <p class="cn" style="color:var(--cyan)">${escapeHtml(item.en)}${kindBadge(item)}${speakBtn()}</p>
      <p class="en-line">看英文，输入中文意思</p>
      <textarea class="cn-input" lang="zh-CN" placeholder="输入中文意思" data-role="cn-input">${escapeHtml(state.cnValue)}</textarea>
      <div class="row" style="justify-content:center;margin-top:12px">
        <button class="primary" type="button" data-act="check-cn">核对</button>
      </div>
      <div class="hint ${state.cnStatus === "ok" ? "ok" : ""}">${state.cnStatus === "ok" ? "正确" : state.cnStatus === "bad" ? `不对，参考：${escapeHtml(item.cn)}` : ""}</div>
      ${after}
      ${analysisToggle(item, state.cnStatus === "ok")}`;
  } else {
    const hideCn = state.homeMode === "listen";
    const curI = currentWordIndex();
    const hint = curI < 0 ? "全部正确" : state.statuses.includes("bad") ? "不对，再试一次" : "";
    const badge = !hideCn && listenedHere ? '<span class="badge">车上已听</span>' : "";
    stage = `
      <img class="art" alt="" src="${escapeHtml(imageUrl(item.image))}" data-act="play-sentence">
      <p class="cn">${hideCn ? "只听发音，按单词输入英文" : escapeHtml(item.cn)}${kindBadge(item)}${badge}${speakBtn()}</p>
      ${renderWords()}
      <div class="hint ${curI < 0 ? "ok" : ""}">${escapeHtml(hint)}</div>
      ${analysisToggle(item, curI < 0)}`;
  }

  const typo = typoText(member);

  return `<div class="home-shell">
    <div class="top">
      <div>
        <button class="textbtn" type="button" data-act="back-scene">← ${escapeHtml(member.name)} · 在家学习</button>
        <div class="sub" style="margin-top:8px">${escapeHtml(lesson.code)} ${escapeHtml(lesson.titleEn)}（${escapeHtml(lesson.titleCn)}） (${displayNo()}/${list.length}，本次随机) · 今日听 ${member.todayListen}/${goal.listen} · 打 ${member.todayType}/${goal.type}</div>
        <div class="row" style="margin-top:8px">
          <button class="ghost" type="button" data-act="go-lessons">换课</button>
        </div>
      </div>
      <div class="row">${modeBtns}</div>
    </div>
    <div class="home-main" style="padding:18px 0">${stage}</div>
    ${typo ? `<p class="muted" style="text-align:center">错词本：${escapeHtml(typo)}</p>` : ""}
    <footer class="bar">
      <button type="button" data-act="prev">＜ 上一题</button>
      <button type="button" data-act="mark-hard">不熟悉</button>
      <button type="button" data-act="next">下一题 ＞</button>
    </footer>
  </div>`;
}

function viewHtml() {
  if (state.bootError) {
    return `<div class="boot-error"><div><p>暂时打不开，${escapeHtml(state.bootError)}</p>
      <button class="primary" type="button" data-act="retry">再试一次</button></div></div>`;
  }
  if (state.loading || !state.family) {
    return `<div class="loading"><div>正在打开听背打…</div></div>`;
  }
  const member = currentMember();
  const item = currentItem();
  if (state.screen === "family") return renderFamily();
  if (state.screen === "lessons" && member) return renderLessons();
  if (state.screen === "scene" && member) return renderScene();
  if (state.screen === "car-listen" && member && state.lesson && item) return renderCarListen();
  if (state.screen === "car-type" && member && state.lesson && item) return renderCarType();
  if (state.screen === "home" && member && state.lesson && item) return renderHome();
  return renderFamily();
}

function focusActiveInput() {
  const el = document.getElementById("activeInput");
  if (!el) return;
  el.focus();
  try {
    el.setSelectionRange(el.value.length, el.value.length);
  } catch {
    /* ignore */
  }
}

function syncPlayingUi() {
  const btn = document.getElementById("playBtn");
  if (!btn) return;
  btn.classList.toggle("playing", state.playing);
  btn.innerHTML = state.playing ? ICON_PAUSE : ICON_PLAY;
}

function render() {
  appEl.innerHTML = viewHtml();
  focusActiveInput();
}

function continueLastFromCatalog() {
  const member = currentMember();
  if (!member || !state.memberId) return;
  try {
    selectLesson(member.lastLessonId || 1, state.memberId);
    const scene =
      member.lastScene === "car-type" || member.lastScene === "car-listen" || member.lastScene === "home"
        ? member.lastScene
        : "car-listen";
    openScreen(scene, member.lastIndex || 0, "resume");
  } catch (err) {
    showToast(err instanceof Error ? err.message : "无法打开课程");
  }
}

function resumeFromScene() {
  const member = currentMember();
  if (!member) return;
  const isCurrentLast = (member.lastLessonId || 1) === state.lessonId;
  const resumeScene =
    isCurrentLast && (member.lastScene === "car-type" || member.lastScene === "car-listen" || member.lastScene === "home")
      ? member.lastScene
      : "home";
  openScreen(resumeScene, state.lessonProg.lastIndex || 0, "resume");
}

function handleAct(act, target) {
  const id = Number(target.getAttribute("data-id"));
  if (act === "retry") return boot();
  if (act === "go-family") return goFamily();
  if (act === "go-lessons") return goLessons();
  if (act === "open-member") return openMember(id);
  if (act === "open-lesson") return openLesson(id);
  if (act === "start-add") {
    state.adding = true;
    return render();
  }
  if (act === "cancel-add") {
    state.adding = false;
    return render();
  }
  if (act === "continue-last") return continueLastFromCatalog();
  if (act === "open-car") return openScreen(target.getAttribute("data-mode") || "car-listen", 0, "new");
  if (act === "open-home") return openScreen("home", 0, "new");
  if (act === "resume-lesson") return resumeFromScene();
  if (act === "back-scene") {
    stopPlay();
    state.screen = "scene";
    return render();
  }
  if (act === "play-sentence") return playSentence();
  if (act === "toggle-play") {
    if (state.playing) {
      stopPlay();
      syncPlayingUi();
    } else {
      playSentence();
    }
    return;
  }
  if (act === "play-word") {
    const item = currentItem();
    const i = Number(target.closest("[data-i]")?.getAttribute("data-i"));
    if (!item || !Number.isFinite(i) || !item.words[i]) return;
    state.selectedWordI = i;
    playKey(slug(item.words[i]));
    return render();
  }
  if (act === "prev") return goItem(-1);
  if (act === "next") return goItem(1);
  if (act === "toggle-autoplay") {
    state.autoplay = !state.autoplay;
    return render();
  }
  if (act === "toggle-loop") {
    state.loop = !state.loop;
    return render();
  }
  if (act === "toggle-en") {
    state.showEn = !state.showEn;
    return render();
  }
  if (act === "to-car-type") return openScreen("car-type");
  if (act === "to-car-listen") return openScreen("car-listen");
  if (act === "toggle-analysis") {
    state.showAnalysis = !state.showAnalysis;
    return render();
  }
  if (act === "mark-hard") return markHard();
  if (act === "check-cn") return checkCn();
  if (act === "set-mode") {
    const mode = target.getAttribute("data-mode");
    if (!mode) return;
    state.homeMode = mode;
    resetPractice(state.index, "home", mode);
    return render();
  }
}

appEl.addEventListener("click", (e) => {
  const target = e.target instanceof Element ? e.target.closest("[data-act]") : null;
  if (!target || !appEl.contains(target)) return;
  handleAct(target.getAttribute("data-act"), target);
});

appEl.addEventListener("input", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.getAttribute("data-role") === "word-input") {
    onWordInput(t.value);
  } else if (t.getAttribute("data-role") === "cn-input") {
    state.cnValue = t.value;
  }
});

appEl.addEventListener("keydown", (e) => {
  const t = e.target;
  if (t instanceof HTMLElement && t.getAttribute("data-role") === "word-input") {
    onWordKey(e);
  } else if (t instanceof HTMLElement && t.getAttribute("data-role") === "cn-input") {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      checkCn();
    }
  }
});

appEl.addEventListener("submit", (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement) || form.getAttribute("data-role") !== "add-member") return;
  e.preventDefault();
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const role = String(data.get("role") || "成员");
  if (!name) return;
  try {
    addMember(name, role);
    state.adding = false;
    refreshFamily();
    render();
  } catch (err) {
    showToast(err instanceof Error ? err.message : "无法添加成员");
  }
});

document.addEventListener("keydown", (e) => {
  const tag = ((e.target instanceof HTMLElement && e.target.tagName) || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (state.screen === "family" || state.screen === "lessons" || state.screen === "scene") return;
  if (e.code === "Space" && state.screen === "car-listen") {
    e.preventDefault();
    if (player && !player.paused) {
      stopPlay();
      syncPlayingUi();
    } else {
      playSentence();
    }
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    goItem(-1);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    goItem(1);
  }
});

player.addEventListener("play", () => {
  state.playing = true;
  syncPlayingUi();
});
player.addEventListener("pause", () => {
  state.playing = false;
  syncPlayingUi();
});
player.addEventListener("ended", onAudioEnded);
player.addEventListener("error", () => {
  state.playing = false;
  syncPlayingUi();
  if (state.screen === "car-listen" && state.autoplay) {
    onAudioEnded();
  }
});

function registerSw() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register(assetUrl("sw.js")).catch(() => {});
}

async function boot() {
  state.loading = true;
  state.bootError = "";
  render();
  try {
    await loadLessons();
    refreshFamily();
    state.loading = false;
    render();
  } catch (err) {
    state.loading = false;
    state.bootError = err instanceof Error ? err.message : "无法加载课程";
    render();
  }
}

registerSw();
boot();
