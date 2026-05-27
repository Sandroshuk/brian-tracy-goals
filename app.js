const STORE_KEY = "bt-10-goals-v1";
const APP_VERSION = "5";
const goalCount = 10;
const emptyGoalTitle = "Все получится. Пиши в настоящем времени.";

const state = {
  activeIndex: 0,
  todayKey: toDateKey(new Date()),
  archiveMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  entries: loadEntries(),
  saveTimer: null
};

const els = {
  todayLabel: document.querySelector("#todayLabel"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  goalList: document.querySelector("#goalList"),
  activeGoalNumber: document.querySelector("#activeGoalNumber"),
  activeGoalTitle: document.querySelector("#activeGoalTitle"),
  input: document.querySelector("#goalInput"),
  save: document.querySelector("#saveButton"),
  clear: document.querySelector("#clearButton"),
  prevGoal: document.querySelector("#prevGoalButton"),
  nextGoal: document.querySelector("#nextGoalButton"),
  status: document.querySelector("#statusLine"),
  archiveButton: document.querySelector("#archiveButton"),
  archiveView: document.querySelector("#archiveView"),
  dailyView: document.querySelector("#dailyView"),
  completeView: document.querySelector("#completeView"),
  editToday: document.querySelector("#editTodayButton"),
  completeArchive: document.querySelector("#completeArchiveButton"),
  backButton: document.querySelector("#backButton"),
  monthTitle: document.querySelector("#monthTitle"),
  archiveDays: document.querySelector("#archiveDays"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  installButton: document.querySelector("#installButton")
};

let deferredPrompt = null;

init();

function init() {
  ensureToday();
  renderDate();
  renderGoals();
  bindEvents();
  registerServiceWorker();
  if (isTodayComplete()) {
    showComplete();
  } else {
    selectGoal(firstEmptyGoalIndex(), { skipSave: true });
  }
}

function bindEvents() {
  els.save.addEventListener("click", saveActiveGoal);
  els.clear.addEventListener("click", clearActiveGoal);
  els.prevGoal.addEventListener("click", () => moveGoal(-1));
  els.nextGoal.addEventListener("click", () => moveGoal(1));
  els.input.addEventListener("input", saveDraft);
  els.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      moveGoal(1);
    }
  });
  els.archiveButton.addEventListener("click", showArchive);
  els.editToday.addEventListener("click", showTodayEditor);
  els.completeArchive.addEventListener("click", showArchive);
  els.backButton.addEventListener("click", showHome);
  els.prevMonth.addEventListener("click", () => shiftMonth(-1));
  els.nextMonth.addEventListener("click", () => shiftMonth(1));
  window.addEventListener("pagehide", saveDraft);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveDraft();
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    els.installButton.hidden = false;
  });
  els.installButton.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.installButton.hidden = true;
  });
}

function renderDate() {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });
  els.todayLabel.textContent = formatter.format(new Date());
}

function ensureToday() {
  if (!state.entries[state.todayKey]) {
    state.entries[state.todayKey] = Array(goalCount).fill("");
    persist();
  }
}

function renderGoals() {
  const todayGoals = state.entries[state.todayKey];
  els.goalList.innerHTML = "";

  todayGoals.forEach((goal, index) => {
    const button = document.createElement("button");
    button.className = `goal-card${index === state.activeIndex ? " active" : ""}${goal ? " filled" : ""}`;
    button.type = "button";
    button.setAttribute("aria-label", `Цель ${index + 1}`);
    button.addEventListener("click", () => selectGoal(index));

    const number = document.createElement("span");
    number.className = "goal-number";
    number.textContent = String(index + 1);

    const text = document.createElement("span");
    text.className = "goal-text";
    text.textContent = goal || "Пусто";

    button.append(number, text);
    els.goalList.append(button);
  });

  const filledCount = todayGoals.filter(Boolean).length;
  els.progressText.textContent = `${filledCount}/${goalCount}`;
  els.progressBar.style.width = `${(filledCount / goalCount) * 100}%`;
}

function selectGoal(index, options = {}) {
  if (!options.skipSave) saveActiveGoal({ quiet: true, skipComplete: true });
  state.activeIndex = index;
  const goal = state.entries[state.todayKey][index] || "";
  els.activeGoalNumber.textContent = String(index + 1);
  els.activeGoalTitle.textContent = goal ? goal : emptyGoalTitle;
  els.input.value = goal;
  renderGoals();
  setStatus("");
  setTimeout(() => els.input.focus(), 0);
}

function saveActiveGoal(options = {}) {
  clearTimeout(state.saveTimer);
  const value = els.input.value.trim();
  const wasFilled = Boolean(state.entries[state.todayKey][state.activeIndex]);
  state.entries[state.todayKey][state.activeIndex] = value;
  persist();
  if (!options.quiet || wasFilled !== Boolean(value)) renderGoals();
  els.activeGoalTitle.textContent = value || emptyGoalTitle;
  if (!options.quiet) setStatus(value ? "Сохранено" : "Очищено");
  if (!options.skipComplete && isTodayComplete()) showComplete();
}

function saveDraft() {
  if (els.dailyView.hidden) return;
  clearTimeout(state.saveTimer);
  const value = els.input.value.trim();
  const wasFilled = Boolean(state.entries[state.todayKey][state.activeIndex]);
  state.entries[state.todayKey][state.activeIndex] = value;
  persist();
  els.activeGoalTitle.textContent = value || emptyGoalTitle;
  if (wasFilled !== Boolean(value)) renderGoals();
}

function clearActiveGoal() {
  els.input.value = "";
  saveActiveGoal();
  els.input.focus();
}

function moveGoal(delta) {
  saveActiveGoal({ quiet: true, skipComplete: true });
  if (isTodayComplete() && state.activeIndex === goalCount - 1 && delta > 0) {
    showComplete();
    return;
  }
  const nextIndex = Math.min(goalCount - 1, Math.max(0, state.activeIndex + delta));
  selectGoal(nextIndex);
}

function showArchive() {
  els.dailyView.hidden = true;
  els.completeView.hidden = true;
  els.archiveView.hidden = false;
  renderArchive();
}

function showHome() {
  if (isTodayComplete()) {
    showComplete();
  } else {
    showTodayEditor();
  }
}

function showTodayEditor() {
  els.archiveView.hidden = true;
  els.completeView.hidden = true;
  els.dailyView.hidden = false;
  selectGoal(Math.min(state.activeIndex, goalCount - 1), { skipSave: true });
}

function showComplete() {
  renderGoals();
  els.dailyView.hidden = true;
  els.archiveView.hidden = true;
  els.completeView.hidden = false;
}

function shiftMonth(delta) {
  state.archiveMonth = new Date(
    state.archiveMonth.getFullYear(),
    state.archiveMonth.getMonth() + delta,
    1
  );
  renderArchive();
}

function renderArchive() {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric"
  });
  els.monthTitle.textContent = formatter.format(state.archiveMonth);
  els.archiveDays.innerHTML = "";

  const month = state.archiveMonth.getMonth();
  const year = state.archiveMonth.getFullYear();
  const dates = Object.keys(state.entries)
    .filter((key) => {
      const date = parseDateKey(key);
      return date.getFullYear() === year && date.getMonth() === month;
    })
    .sort();

  if (!dates.length) {
    const empty = document.createElement("p");
    empty.className = "empty-month";
    empty.textContent = "За этот месяц записей нет";
    els.archiveDays.append(empty);
    return;
  }

  dates.forEach((key) => {
    const goals = state.entries[key].filter(Boolean);
    const card = document.createElement("article");
    card.className = "day-card";

    const title = document.createElement("h3");
    title.textContent = new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      weekday: "short"
    }).format(parseDateKey(key));

    const list = document.createElement("ol");
    if (goals.length) {
      goals.forEach((goal) => {
        const item = document.createElement("li");
        item.textContent = goal;
        list.append(item);
      });
    } else {
      const item = document.createElement("li");
      item.textContent = "Без текста";
      list.append(item);
    }

    card.append(title, list);
    els.archiveDays.append(card);
  });
}

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}

function persist() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state.entries));
}

function isTodayComplete() {
  return state.entries[state.todayKey].every((goal) => goal.trim());
}

function firstEmptyGoalIndex() {
  const index = state.entries[state.todayKey].findIndex((goal) => !goal.trim());
  return index === -1 ? 0 : index;
}

function setStatus(text) {
  els.status.textContent = text;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register(`sw.js?v=${APP_VERSION}`).catch(() => {});
  }
}
