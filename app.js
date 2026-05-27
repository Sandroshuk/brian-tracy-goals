const STORE_KEY = "bt-10-goals-v1";
const goalCount = 10;

const state = {
  activeIndex: 0,
  todayKey: toDateKey(new Date()),
  archiveMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  entries: loadEntries(),
  strokes: [],
  redo: []
};

const els = {
  todayLabel: document.querySelector("#todayLabel"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  goalList: document.querySelector("#goalList"),
  activeGoalNumber: document.querySelector("#activeGoalNumber"),
  activeGoalTitle: document.querySelector("#activeGoalTitle"),
  canvas: document.querySelector("#inkCanvas"),
  input: document.querySelector("#goalInput"),
  recognize: document.querySelector("#recognizeButton"),
  save: document.querySelector("#saveButton"),
  clear: document.querySelector("#clearButton"),
  undo: document.querySelector("#undoButton"),
  status: document.querySelector("#statusLine"),
  archiveButton: document.querySelector("#archiveButton"),
  archiveView: document.querySelector("#archiveView"),
  dailyView: document.querySelector("#dailyView"),
  backButton: document.querySelector("#backButton"),
  monthTitle: document.querySelector("#monthTitle"),
  archiveDays: document.querySelector("#archiveDays"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  installButton: document.querySelector("#installButton")
};

const ctx = els.canvas.getContext("2d");
let drawing = false;
let activeStroke = null;
let deferredPrompt = null;

init();

function init() {
  ensureToday();
  renderDate();
  renderGoals();
  selectGoal(0);
  setupCanvas();
  bindEvents();
  registerServiceWorker();
}

function bindEvents() {
  els.save.addEventListener("click", saveActiveGoal);
  els.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") saveActiveGoal();
  });
  els.clear.addEventListener("click", clearInk);
  els.undo.addEventListener("click", undoStroke);
  els.recognize.addEventListener("click", recognizeInk);
  els.archiveButton.addEventListener("click", showArchive);
  els.backButton.addEventListener("click", showDaily);
  els.prevMonth.addEventListener("click", () => shiftMonth(-1));
  els.nextMonth.addEventListener("click", () => shiftMonth(1));

  window.addEventListener("resize", resizeCanvas);
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

function selectGoal(index) {
  state.activeIndex = index;
  const goal = state.entries[state.todayKey][index] || "";
  els.activeGoalNumber.textContent = String(index + 1);
  els.activeGoalTitle.textContent = goal ? goal : "Пишите от руки";
  els.input.value = goal;
  state.strokes = [];
  state.redo = [];
  renderGoals();
  clearInk();
  setStatus("");
}

function saveActiveGoal() {
  const value = els.input.value.trim();
  state.entries[state.todayKey][state.activeIndex] = value;
  persist();
  renderGoals();
  els.activeGoalTitle.textContent = value || "Пишите от руки";
  setStatus(value ? "Сохранено" : "Очищено");
}

function setupCanvas() {
  resizeCanvas();
  els.canvas.addEventListener("pointerdown", startStroke);
  els.canvas.addEventListener("pointermove", moveStroke);
  els.canvas.addEventListener("pointerup", endStroke);
  els.canvas.addEventListener("pointercancel", endStroke);
  els.canvas.addEventListener("pointerleave", endStroke);
}

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const snapshot = [...state.strokes];
  els.canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  els.canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  state.strokes = snapshot;
  redrawInk();
}

function startStroke(event) {
  drawing = true;
  els.canvas.setPointerCapture(event.pointerId);
  activeStroke = [pointFromEvent(event)];
  state.redo = [];
}

function moveStroke(event) {
  if (!drawing || !activeStroke) return;
  const point = pointFromEvent(event);
  activeStroke.push(point);
  drawSegment(activeStroke[activeStroke.length - 2], point);
}

function endStroke() {
  if (!drawing || !activeStroke) return;
  drawing = false;
  if (activeStroke.length > 1) {
    state.strokes.push(activeStroke);
  }
  activeStroke = null;
}

function pointFromEvent(event) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    t: Date.now()
  };
}

function drawSegment(from, to) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#23201b";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function redrawInk() {
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  for (const stroke of state.strokes) {
    for (let index = 1; index < stroke.length; index += 1) {
      drawSegment(stroke[index - 1], stroke[index]);
    }
  }
}

function clearInk() {
  state.strokes = [];
  state.redo = [];
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
}

function undoStroke() {
  const stroke = state.strokes.pop();
  if (!stroke) return;
  state.redo.push(stroke);
  redrawInk();
}

async function recognizeInk() {
  if (!state.strokes.length) {
    setStatus("Напишите цель");
    return;
  }

  const createRecognizer = navigator.createHandwritingRecognizer
    || navigator.handwriting?.createRecognizer?.bind(navigator.handwriting);
  const Drawing = window.HandwritingDrawing || navigator.handwriting?.HandwritingDrawing;
  const Stroke = window.HandwritingStroke || navigator.handwriting?.HandwritingStroke;

  if (!createRecognizer || !Drawing || !Stroke) {
    setStatus("Распознавание недоступно в этом браузере");
    return;
  }

  try {
    setStatus("Распознаю...");
    const recognizer = await createRecognizer({
      languages: ["ru-RU", "en-US"]
    });
    const drawingData = new Drawing();
    state.strokes.forEach((stroke) => {
      const strokeData = new Stroke();
      stroke.forEach((point) => strokeData.addPoint(point));
      drawingData.addStroke(strokeData);
    });
    const results = await recognizer.recognize(drawingData);
    const text = results?.[0]?.text?.trim();
    if (text) {
      els.input.value = text;
      saveActiveGoal();
      setStatus("Распознано и сохранено");
    } else {
      setStatus("Текст не найден");
    }
  } catch (error) {
    setStatus("Не удалось распознать");
  }
}

function showArchive() {
  els.dailyView.hidden = true;
  els.archiveView.hidden = false;
  renderArchive();
}

function showDaily() {
  els.archiveView.hidden = true;
  els.dailyView.hidden = false;
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
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
