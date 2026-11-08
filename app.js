/* ============================================================
   KTU Exam — a quiet exam planner
   Plain HTML, CSS and JavaScript. No build step, no backend.
   ============================================================ */

'use strict';

const STORE_KEY = 'ktu-exam-v1';
const PAT_KEY = 'ktu-pat';
const SYNC_CONFIG_KEY = 'ktu-sync-config';
const SYNC_META_KEY = 'ktu-sync-meta';
const GH_API = 'https://api.github.com';
const GH_HEADERS = { 'X-GitHub-Api-Version': '2022-11-28' };

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LONG = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday'
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ICONS = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L20 8l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/></svg>',
  move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  chevron: '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>'
};

const els = {
  modal: document.getElementById('modal'),
  toast: document.getElementById('toast'),
  importFile: document.getElementById('import-file'),
  saveState: document.getElementById('save-state'),
  saveStateMobile: document.getElementById('save-state-mobile'),
  sideDate: document.getElementById('side-date')
};

const ui = {
  activeView: 'home',
  calendarCursor: startOfMonth(new Date()),
  selectedDate: todayISO(),
  collapsedModules: new Set(),
  moreTab: 'progress',
  syncBusy: false,
  syncStatus: null
};

let state = emptyState();
let syncConfig = loadSyncConfig();
let syncMeta = loadSyncMeta();
let toastTimer = null;
let modalReturnFocus = null;

/* ---------- small utilities ---------- */

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayISO() {
  return isoOf(new Date());
}

function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function isValidISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const d = parseISO(value);
  return !Number.isNaN(d.getTime()) && isoOf(d) === value;
}

function addDaysISO(iso, amount) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + amount);
  return isoOf(d);
}

function diffDays(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

function weekdayKey(iso) {
  return DAYS[(parseISO(iso).getDay() + 6) % 7];
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function focusByKey(key) {
  if (!key) return;
  requestAnimationFrame(() => {
    const target = document.querySelector(`[data-focus="${String(key).replace(/"/g, '\\"')}"]`);
    if (target) target.focus({ preventScroll: true });
  });
}

function formatLongDate(iso) {
  const d = parseISO(iso);
  return `${WEEKDAY_LONG[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatShortDate(iso) {
  if (!isValidISODate(iso)) return '';
  const d = parseISO(iso);
  const now = new Date();
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${year}`;
}

function formatMonthYear(date) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function localDateFromTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return isoOf(date);
}

function distanceLabel(iso) {
  const days = diffDays(iso, todayISO());
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function rowNumber(index) {
  return pad(index + 1);
}

function greetingLabel() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function durationLabel(start, end) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes <= 0) return '';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function sortBlocks(blocks) {
  return [...blocks].sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99'));
}

function cleanTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : '';
}

function cleanTimestamp(value) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function readStoredJson(key) {
  const raw = storageGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/* ---------- data shape ---------- */

function emptyState() {
  const weeklyTemplate = {};
  DAYS.forEach((day) => { weeklyTemplate[day] = []; });
  return { courses: [], weeklyTemplate, dailyOverrides: {}, exams: [] };
}

function normalizeBlock(raw, withDone = false) {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) return null;
  const block = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title,
    courseId: typeof raw.courseId === 'string' ? raw.courseId : '',
    start: cleanTime(raw.start),
    end: cleanTime(raw.end)
  };
  if (withDone) block.done = Boolean(raw.done);
  return block;
}

function normalizeTopic(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) return null;
  const done = Boolean(raw.done);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title,
    done,
    completedAt: done ? cleanTimestamp(raw.completedAt) : null
  };
}

function normalizeModule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title,
    topics: Array.isArray(raw.topics)
      ? raw.topics.map(normalizeTopic).filter(Boolean)
      : []
  };
}

function normalizeCourse(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title,
    examDate: isValidISODate(raw.examDate) ? raw.examDate : '',
    modules: Array.isArray(raw.modules)
      ? raw.modules.map(normalizeModule).filter(Boolean)
      : []
  };
}

function normalizeState(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const weeklyTemplate = {};
  DAYS.forEach((day) => {
    const blocks = source.weeklyTemplate && Array.isArray(source.weeklyTemplate[day])
      ? source.weeklyTemplate[day]
      : [];
    weeklyTemplate[day] = blocks.map((block) => normalizeBlock(block, false)).filter(Boolean);
  });

  const dailyOverrides = {};
  if (source.dailyOverrides && typeof source.dailyOverrides === 'object' && !Array.isArray(source.dailyOverrides)) {
    Object.keys(source.dailyOverrides).forEach((date) => {
      if (!isValidISODate(date) || !Array.isArray(source.dailyOverrides[date])) return;
      dailyOverrides[date] = source.dailyOverrides[date]
        .map((block) => normalizeBlock(block, true))
        .filter(Boolean);
    });
  }

  const exams = Array.isArray(source.exams)
    ? source.exams.map((exam) => {
      if (!exam || typeof exam !== 'object') return null;
      const title = typeof exam.title === 'string' ? exam.title.trim() : '';
      if (!title || !isValidISODate(exam.date)) return null;
      return {
        id: typeof exam.id === 'string' && exam.id ? exam.id : uid(),
        title,
        date: exam.date,
        courseId: typeof exam.courseId === 'string' ? exam.courseId : ''
      };
    }).filter(Boolean)
    : [];

  return {
    courses: Array.isArray(source.courses)
      ? source.courses.map(normalizeCourse).filter(Boolean)
      : [],
    weeklyTemplate,
    dailyOverrides,
    exams
  };
}

function normalizeImported(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('That file is not an exam-plan backup.');
  }
  const known = ['courses', 'weeklyTemplate', 'dailyOverrides', 'exams'];
  if (!known.some((key) => Object.prototype.hasOwnProperty.call(raw, key))) {
    throw new Error('That file is missing the exam-plan fields.');
  }
  return normalizeState(raw);
}

/* ---------- derived data ---------- */

function courseById(id) {
  return state.courses.find((course) => course.id === id);
}

function findModule(course, moduleId) {
  return course ? course.modules.find((module) => module.id === moduleId) : null;
}

function allTopics(course) {
  return course.modules.flatMap((module) => module.topics);
}

function moduleStats(module) {
  const total = module.topics.length;
  const done = module.topics.filter((topic) => topic.done).length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

function courseStats(course) {
  const topics = allTopics(course);
  const total = topics.length;
  const done = topics.filter((topic) => topic.done).length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

function overallStats() {
  let total = 0;
  let done = 0;
  state.courses.forEach((course) => {
    const stats = courseStats(course);
    total += stats.total;
    done += stats.done;
  });
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

function findTopic(courseId, moduleId, topicId) {
  const course = courseById(courseId);
  const module = findModule(course, moduleId);
  if (!module) return null;
  return module.topics.find((topic) => topic.id === topicId) || null;
}

function hasOverride(date) {
  return Object.prototype.hasOwnProperty.call(state.dailyOverrides, date);
}

function blocksForDate(date) {
  if (hasOverride(date)) return state.dailyOverrides[date];
  return state.weeklyTemplate[weekdayKey(date)] || [];
}

function ensureOverride(date) {
  if (!hasOverride(date)) {
    state.dailyOverrides[date] = (state.weeklyTemplate[weekdayKey(date)] || []).map((block) => ({
      id: block.id,
      title: block.title,
      courseId: block.courseId,
      start: block.start,
      end: block.end,
      done: false
    }));
  }
  return state.dailyOverrides[date];
}

function allExams() {
  const exams = state.exams.map((exam) => ({ ...exam, virtual: false }));
  state.courses.forEach((course) => {
    if (!course.examDate) return;
    const mirrored = exams.some((exam) => exam.courseId === course.id && exam.date === course.examDate);
    if (!mirrored) {
      exams.push({
        id: `course-exam-${course.id}`,
        title: course.title,
        date: course.examDate,
        courseId: course.id,
        virtual: true
      });
    }
  });
  return exams.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

function examsForDate(date) {
  return allExams().filter((exam) => exam.date === date);
}

function upcomingExams() {
  const today = todayISO();
  return allExams().filter((exam) => exam.date >= today);
}

function nearestExam() {
  return upcomingExams()[0] || null;
}

function completedTopics() {
  const items = [];
  state.courses.forEach((course) => {
    course.modules.forEach((module) => {
      module.topics.forEach((topic) => {
        if (topic.done && topic.completedAt) {
          items.push({ course, module, topic, date: localDateFromTimestamp(topic.completedAt), at: topic.completedAt });
        }
      });
    });
  });
  return items;
}

function completedOn(date) {
  return completedTopics().filter((item) => item.date === date).length;
}

function streakDays() {
  const days = new Set(completedTopics().map((item) => item.date).filter(Boolean));
  if (!days.size) return 0;
  let cursor = todayISO();
  if (!days.has(cursor)) cursor = addDaysISO(cursor, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

function weekCompletions() {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const monday = addDaysISO(todayISO(), -mondayOffset);
  const counts = {};
  completedTopics().forEach((item) => {
    if (!item.date) return;
    counts[item.date] = (counts[item.date] || 0) + 1;
  });
  let total = 0;
  for (let i = 0; i <= mondayOffset; i += 1) {
    total += counts[addDaysISO(monday, i)] || 0;
  }
  return total;
}

function last14Days() {
  const today = todayISO();
  const counts = {};
  completedTopics().forEach((item) => {
    if (item.date) counts[item.date] = (counts[item.date] || 0) + 1;
  });
  const days = [];
  for (let i = 13; i >= 0; i -= 1) {
    const date = addDaysISO(today, -i);
    const d = parseISO(date);
    days.push({
      date,
      count: counts[date] || 0,
      day: d.getDate(),
      weekday: WEEKDAY_LONG[d.getDay()].slice(0, 1),
      isToday: date === today
    });
  }
  return days;
}

/* ---------- persistence ---------- */

function setSaveState(label, saved = true) {
  const statusClass = saved ? 'is-saved' : 'is-saving';
  if (els.saveState) {
    els.saveState.className = `save-state ${statusClass}`;
    const text = els.saveState.querySelector('.save-text');
    if (text) text.textContent = `${label} · ${formatClock()}`;
  }
  if (els.saveStateMobile) {
    els.saveStateMobile.className = `save-state save-state--compact ${statusClass}`;
    const text = els.saveStateMobile.querySelector('.save-text');
    if (text) text.textContent = label;
  }
}

function persistState(label = 'Saved') {
  const ok = storageSet(STORE_KEY, JSON.stringify(state));
  setSaveState(ok ? label : 'Not saved', ok);
  return ok;
}

function commit(focusKey = null, label = 'Saved') {
  persistState(label);
  renderAll();
  if (focusKey) focusByKey(focusKey);
}

function loadSyncConfig() {
  const stored = readStoredJson(SYNC_CONFIG_KEY) || {};
  return {
    owner: typeof stored.owner === 'string' ? stored.owner : '',
    repo: typeof stored.repo === 'string' && stored.repo ? stored.repo : 'KTU-exam',
    branch: typeof stored.branch === 'string' && stored.branch ? stored.branch : 'main',
    path: typeof stored.path === 'string' && stored.path ? stored.path : 'data.json'
  };
}

function saveSyncConfig() {
  storageSet(SYNC_CONFIG_KEY, JSON.stringify(syncConfig));
}

function loadSyncMeta() {
  const stored = readStoredJson(SYNC_META_KEY) || {};
  return {
    sha: typeof stored.sha === 'string' ? stored.sha : '',
    lastSync: typeof stored.lastSync === 'string' ? stored.lastSync : ''
  };
}

function saveSyncMeta() {
  storageSet(SYNC_META_KEY, JSON.stringify(syncMeta));
}

/* ---------- application boot ---------- */

function init() {
  bindEvents();
  if (els.sideDate) {
    els.sideDate.textContent = new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    }).toUpperCase();
  }

  const raw = storageGet(STORE_KEY);
  if (!raw) {
    /* New users always start blank. data.json is only pulled on demand. */
    state = emptyState();
    persistState('Started fresh');
  } else {
    try {
      state = normalizeImported(JSON.parse(raw));
      setSaveState('Stored');
    } catch {
      state = emptyState();
      persistState('Started fresh');
      toast('The saved data could not be read. A fresh plan was started.', true);
    }
  }

  renderAll();
}

/* ---------- events ---------- */

function bindEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', handleInput);

  els.modal.addEventListener('close', () => {
    if (els.modal.open) return;
    const target = modalReturnFocus;
    modalReturnFocus = null;
    requestAnimationFrame(() => {
      if (target && target.isConnected && target !== document.body && !target.closest('dialog')) {
        target.focus({ preventScroll: true });
        return;
      }
      const fallback = [document.querySelector(`.nav-item[data-nav="${ui.activeView}"]`), document.querySelector(`.tab[data-nav="${ui.activeView}"]`)]
        .find((candidate) => candidate && candidate.getClientRects().length > 0);
      if (fallback) fallback.focus({ preventScroll: true });
      else document.getElementById('main')?.focus({ preventScroll: true });
    });
  });

  els.modal.addEventListener('click', (event) => {
    if (event.target === els.modal) els.modal.close();
  });

  els.importFile.addEventListener('change', handleImportFile);
}

function handleClick(event) {
  if (event.target.closest('input, select, textarea')) return;

  const nav = event.target.closest('[data-nav]');
  if (nav) {
    event.preventDefault();
    setView(nav.dataset.nav);
    return;
  }

  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;
  const d = actionEl.dataset;

  switch (action) {
    case 'add-course':
      openCourseDialog();
      break;
    case 'edit-course':
      openCourseDialog(d.course);
      break;
    case 'delete-course':
      askDeleteCourse(d.course);
      break;
    case 'add-module':
      openModuleDialog(d.course);
      break;
    case 'edit-module':
      openModuleDialog(d.course, d.module);
      break;
    case 'delete-module':
      askDeleteModule(d.course, d.module);
      break;
    case 'toggle-module':
      toggleModule(d.module);
      break;
    case 'add-topic':
      openTopicDialog(d.course, d.module);
      break;
    case 'edit-topic':
      openTopicDialog(d.course, d.module, d.topic);
      break;
    case 'delete-topic':
      askDeleteTopic(d.course, d.module, d.topic);
      break;
    case 'add-block':
      openBlockDialog({ date: d.date || todayISO() });
      break;
    case 'edit-block':
      openBlockDialog({ date: d.date, blockId: d.id });
      break;
    case 'delete-block':
      askDeleteBlock(d.date, d.id);
      break;
    case 'move-block':
      openMoveDialog(d.date, d.id);
      break;
    case 'add-template-block':
      openTemplateBlockDialog({ day: d.day || weekdayKey(todayISO()) });
      break;
    case 'edit-template-block':
      openTemplateBlockDialog({ day: d.day, blockId: d.id });
      break;
    case 'delete-template-block':
      askDeleteTemplateBlock(d.day, d.id);
      break;
    case 'add-exam':
      openExamDialog({ date: d.date || ui.selectedDate || todayISO() });
      break;
    case 'edit-exam':
      openExamDialog({ examId: d.id });
      break;
    case 'delete-exam':
      askDeleteExam(d.id);
      break;
    case 'more-tab':
      ui.moreTab = d.tab;
      document.body.dataset.sub = ui.moreTab;
      renderView('more');
      break;
    case 'open-more':
      ui.moreTab = d.tab || 'progress';
      setView('more');
      break;
    case 'cal-prev':
      changeMonth(-1);
      break;
    case 'cal-next':
      changeMonth(1);
      break;
    case 'cal-today':
      jumpCalendarToday();
      break;
    case 'select-day':
      selectCalendarDay(d.date);
      break;
    case 'home-day':
      openCalendarDate(d.date);
      break;
    case 'export-json':
      exportJson();
      break;
    case 'import-json':
      els.importFile.click();
      break;
    case 'erase-local':
      askEraseLocal();
      break;
    case 'toggle-token':
      toggleTokenVisibility();
      break;
    case 'sync-pull':
      handlePull();
      break;
    case 'sync-push':
      handlePush();
      break;
    default:
      break;
  }
}

function handleChange(event) {
  const target = event.target;
  if (!target.matches('input[type="checkbox"][data-action]')) return;

  if (target.dataset.action === 'toggle-topic') {
    toggleTopicCheckbox(target);
  } else if (target.dataset.action === 'toggle-block') {
    toggleBlockCheckbox(target);
  }
}

function handleInput(event) {
  const field = event.target.closest('[data-sync-field]');
  if (!field) return;
  const name = field.dataset.syncField;
  if (name === 'token') {
    storageSet(PAT_KEY, field.value);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(syncConfig, name)) {
    syncConfig[name] = field.value;
    saveSyncConfig();
  }
}

/* ---------- navigation / rendering ---------- */

function setView(view) {
  const allowed = ['home', 'calendar', 'today', 'timetable', 'courses', 'more'];
  if (!allowed.includes(view)) return;
  const changed = ui.activeView !== view;
  ui.activeView = view;
  renderAll();
  if (changed) window.scrollTo({ top: 0, behavior: 'auto' });
}

function renderAll() {
  if (!ui.activeView) ui.activeView = 'home';
  document.body.dataset.view = ui.activeView;
  if (ui.activeView === 'more') document.body.dataset.sub = ui.moreTab || 'progress';
  else delete document.body.dataset.sub;
  document.querySelectorAll('.view').forEach((section) => {
    section.hidden = section.dataset.view !== ui.activeView;
  });
  document.querySelectorAll('[data-nav]').forEach((button) => {
    const active = button.dataset.nav === ui.activeView;
    if (button.classList.contains('nav-item') || button.classList.contains('tab')) {
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  });
  renderView(ui.activeView);
}

function renderView(view) {
  const titles = {
    home: 'Home', today: 'Today', timetable: 'Timetable', courses: 'Courses',
    calendar: 'Calendar', more: 'More'
  };
  document.title = `${titles[view] || 'Exam Plan'} · KTU Exam`;
  if (view === 'home') renderHome();
  else if (view === 'today') renderToday();
  else if (view === 'timetable') renderTimetable();
  else if (view === 'courses') renderCourses();
  else if (view === 'calendar') renderCalendar();
  else if (view === 'more') renderMore();
}

function toast(message, isError = false) {
  if (!els.toast) return;
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.toggle('is-error', Boolean(isError));
  els.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('is-visible');
  }, isError ? 5200 : 3200);
}

/* ---------- shared view pieces ---------- */

function hankoHtml(exam, small = false) {
  const sizeClass = small ? ' hanko--sm' : '';
  if (!exam) {
    return `<div class="hanko hanko--none${sizeClass}" role="img" aria-label="No exam date set">
      <span class="hanko-kicker">NO EXAM</span>
      <span class="hanko-number">—</span>
      <span class="hanko-unit">NO DATE</span>
    </div>`;
  }
  const days = Math.max(0, diffDays(exam.date, todayISO()));
  return `<div class="hanko${sizeClass}" role="img" aria-label="${days} ${days === 1 ? 'day' : 'days'} until ${esc(exam.title)}">
    <span class="hanko-kicker">DAYS TO GO</span>
    <span class="hanko-number">${days}</span>
    <span class="hanko-unit">DAYS</span>
  </div>`;
}

function courseOptionsHtml(selected = '') {
  const options = ['<option value="">No course</option>'];
  state.courses.forEach((course) => {
    options.push(`<option value="${esc(course.id)}"${course.id === selected ? ' selected' : ''}>${esc(course.title)}</option>`);
  });
  return options.join('');
}

function spiralBindingHtml(count = 12) {
  return `<div class="spiral" aria-hidden="true">${'<i></i>'.repeat(count)}</div>`;
}

function emptyHtml({ mark = '+', title, copy, actions = '' }) {
  return `<div class="empty">
    <div class="empty-mark" aria-hidden="true">${esc(mark)}</div>
    <h3>${esc(title)}</h3>
    <p>${copy}</p>
    ${actions ? `<div class="head-actions">${actions}</div>` : ''}
  </div>`;
}

function scheduleListHtml(blocks, date) {
  if (!blocks.length) return '';
  return `<ul class="schedule-list">
    ${sortBlocks(blocks).map((block) => {
      const course = courseById(block.courseId);
      const done = Boolean(block.done);
      const duration = durationLabel(block.start, block.end);
      const title = esc(block.title);
      return `<li class="schedule-row${done ? ' is-done' : ''}">
        <input class="tick" type="checkbox" data-action="toggle-block" data-date="${esc(date)}" data-id="${esc(block.id)}"
          ${done ? 'checked' : ''} aria-label="Mark ${title} as ${done ? 'not done' : 'done'}" data-focus="block-${esc(block.id)}">
        <span class="block-time">${block.start ? `${esc(block.start)}${block.end ? `–${esc(block.end)}` : ''}` : 'Any time'}${duration ? `<span class="dur">${duration}</span>` : ''}</span>
        <div class="block-main">
          <div class="block-title">${title}</div>
          <div class="block-course">${course ? esc(course.title) : 'Study block'}</div>
        </div>
        <div class="row-actions">
          <button class="icon-btn" type="button" data-action="move-block" data-date="${esc(date)}" data-id="${esc(block.id)}" aria-label="Move ${title} to another day" title="Move">${ICONS.move}</button>
          <button class="icon-btn" type="button" data-action="edit-block" data-date="${esc(date)}" data-id="${esc(block.id)}" aria-label="Edit ${title}" title="Edit">${ICONS.edit}</button>
          <button class="icon-btn icon-btn--danger" type="button" data-action="delete-block" data-date="${esc(date)}" data-id="${esc(block.id)}" aria-label="Delete ${title}" title="Delete">${ICONS.trash}</button>
        </div>
      </li>`;
    }).join('')}
  </ul>`;
}

function examRowHtml(exam) {
  const course = courseById(exam.courseId);
  return `<div class="exam-row">
    <span class="exam-mark" aria-hidden="true"></span>
    <div class="exam-main">
      <div class="exam-title">${esc(exam.title)}</div>
      <div class="exam-sub">${esc(formatShortDate(exam.date))} · ${esc(distanceLabel(exam.date))}${course ? ` · ${esc(course.title)}` : ''}</div>
    </div>
    <div class="row-actions">
      ${exam.virtual
        ? `<button class="text-btn" type="button" data-action="edit-course" data-course="${esc(exam.courseId)}">Course exam</button>`
        : `<button class="icon-btn" type="button" data-action="edit-exam" data-id="${esc(exam.id)}" aria-label="Edit ${esc(exam.title)}" title="Edit">${ICONS.edit}</button>
           <button class="icon-btn icon-btn--danger" type="button" data-action="delete-exam" data-id="${esc(exam.id)}" aria-label="Delete ${esc(exam.title)}" title="Delete">${ICONS.trash}</button>`}
    </div>
  </div>`;
}

function widgetHeadHtml({ id, title, nav, tab = '' }) {
  const open = tab
    ? `<button class="text-btn" type="button" data-action="open-more" data-tab="${esc(tab)}" aria-label="Open ${esc(title)}">Open <span aria-hidden="true">→</span></button>`
    : `<button class="text-btn" type="button" data-nav="${esc(nav)}" aria-label="Open ${esc(title)}">Open <span aria-hidden="true">→</span></button>`;
  return `<header class="widget-head">
    <div class="widget-title-wrap">
      <span class="widget-badge" aria-hidden="true"></span>
      <h2 class="widget-title" id="${esc(id)}">${esc(title)}</h2>
    </div>
    ${open}
  </header>`;
}

function countdownPillHtml() {
  const exam = nearestExam();
  if (!exam) {
    return `<button class="countdown-pill" type="button" data-section="calendar" data-action="add-exam" data-date="${todayISO()}">
      <span class="countdown-mark" aria-hidden="true"></span>
      <b>No exam set</b>
      <span class="countdown-sub">Add a date</span>
    </button>`;
  }
  const days = Math.max(0, diffDays(exam.date, todayISO()));
  const when = days === 0 ? 'Exam today' : days === 1 ? '1 day to go' : `${days} days to go`;
  return `<button class="countdown-pill" type="button" data-section="calendar" data-nav="calendar" aria-label="${esc(when)} until ${esc(exam.title)}">
    <span class="countdown-mark" aria-hidden="true"></span>
    <b>${esc(when)}</b>
    <span class="countdown-sub">${esc(exam.title)}</span>
  </button>`;
}

/* ---------- Home ---------- */

function renderHome() {
  const root = document.getElementById('view-home');
  const today = todayISO();
  const overall = overallStats();
  const exams = upcomingExams();
  const blocks = sortBlocks(blocksForDate(today));
  const doneBlocks = blocks.filter((block) => block.done).length;
  const streak = streakDays();
  const week = weekCompletions();
  const days = last14Days();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const lead = (monthStart.getDay() + 6) % 7;
  const monthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const miniCells = [];
  for (let i = 0; i < lead; i += 1) {
    miniCells.push('<span class="mini-cal-blank" aria-hidden="true"></span>');
  }
  for (let day = 1; day <= monthDays; day += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), day, 12);
    const iso = isoOf(date);
    const dayBlocks = blocksForDate(iso);
    const dayExams = examsForDate(iso);
    const classes = ['mini-cal-day', iso === today ? 'is-today' : '', dayExams.length ? 'is-exam' : '']
      .filter(Boolean).join(' ');
    miniCells.push(`<button class="${classes}" type="button" data-action="home-day" data-date="${iso}" aria-label="${esc(formatLongDate(iso))}${dayBlocks.length ? `, ${countLabel(dayBlocks.length, 'study block')}` : ''}${dayExams.length ? `, exam: ${esc(dayExams.map((item) => item.title).join(', '))}` : ''}">
      <span class="mini-cal-num">${day}</span>
      <span class="mini-cal-dots" aria-hidden="true">${dayBlocks.length ? '<i class="cal-dot"></i>' : ''}${dayExams.length ? '<i class="cal-dot cal-dot--exam"></i>' : ''}</span>
    </button>`);
  }

  const examRows = exams.slice(0, 3).map((exam) => {
    const course = courseById(exam.courseId);
    return `<li class="widget-exam">
      <span class="exam-mark" aria-hidden="true"></span>
      <div class="widget-exam-main">
        <strong>${esc(exam.title)}</strong>
        <span>${esc(formatShortDate(exam.date))}${course ? ` · ${esc(course.title)}` : ''}</span>
      </div>
      <span class="count-pill">${esc(distanceLabel(exam.date))}</span>
    </li>`;
  }).join('');

  const blockRows = blocks.slice(0, 4).map((block) => {
    const course = courseById(block.courseId);
    return `<li class="widget-block${block.done ? ' is-done' : ''}">
      <span class="widget-block-time">${block.start ? esc(block.start) : 'Any'}</span>
      <div class="widget-block-main">
        <div class="widget-block-title">${esc(block.title)}</div>
        <div class="widget-block-course">${course ? esc(course.title) : 'Study block'}</div>
      </div>
      ${block.done ? '<span class="mini-done" aria-label="Done">✓</span>' : ''}
    </li>`;
  }).join('');

  root.innerHTML = `
    <header class="view-head home-head">
      <div>
        <p class="eyebrow">${esc(formatLongDate(today))}</p>
        <h1 id="view-home-title">${greetingLabel()}</h1>
        <p class="lede">${overall.total
          ? `${overall.done} of ${overall.total} topics done. Here is the plan, at a glance.`
          : 'A quiet place to see your whole plan at once.'}</p>
      </div>
      <div class="head-actions home-actions">${countdownPillHtml()}</div>
    </header>

    <div class="home-grid">
      <section class="widget" data-section="calendar" aria-labelledby="home-calendar-title">
        ${widgetHeadHtml({ id: 'home-calendar-title', title: 'Calendar', nav: 'calendar' })}
        <div class="mini-cal-page">
          ${spiralBindingHtml(5)}
          <p class="mini-cal-month">${esc(formatMonthYear(now))}</p>
          <div class="mini-cal-grid">
            ${DAYS.map((day) => `<span class="mini-cal-wd" aria-hidden="true">${day.slice(0, 1)}</span>`).join('')}
            ${miniCells.join('')}
          </div>
        </div>
        <div class="widget-subhead"><span>Next exams</span><span>${exams.length ? `${exams.length} ahead` : 'None'}</span></div>
        ${exams.length
          ? `<ul class="widget-list">${examRows}</ul>`
          : '<p class="widget-empty">No exams ahead. Add one when the date is confirmed.</p>'}
        <div class="widget-foot">
          <button class="text-btn" type="button" data-action="add-exam" data-date="${today}"><span aria-hidden="true">+</span> Add exam</button>
          <button class="text-btn" type="button" data-nav="calendar">Open calendar <span aria-hidden="true">→</span></button>
        </div>
      </section>

      <section class="widget" data-section="progress" aria-labelledby="home-progress-title">
        ${widgetHeadHtml({ id: 'home-progress-title', title: 'Progress', nav: 'more', tab: 'progress' })}
        <div class="widget-progress">
          <p class="widget-big" aria-label="${overall.pct}% complete">${overall.pct}<sup>%</sup></p>
          <div class="widget-progress-copy">
            <strong>${overall.done} of ${overall.total} topics</strong>
            <span>${countLabel(state.courses.length, 'course')} in the plan</span>
          </div>
        </div>
        <div class="bar bar--tall" aria-hidden="true"><span class="bar-fill" style="width:${overall.pct}%"></span></div>
        <div class="widget-foot">
          <span class="widget-note">${overall.total ? `${overall.done} checked` : 'No topics yet'}</span>
          <button class="text-btn" type="button" data-action="open-more" data-tab="progress">Open progress <span aria-hidden="true">→</span></button>
        </div>
      </section>

      <section class="widget" data-section="today" aria-labelledby="home-today-title">
        ${widgetHeadHtml({ id: 'home-today-title', title: 'Today', nav: 'today' })}
        ${blocks.length
          ? `<ul class="widget-list">${blockRows}</ul>`
          : '<p class="widget-empty">Nothing scheduled today. A good day for one small block.</p>'}
        <div class="widget-foot">
          <button class="text-btn" type="button" data-action="add-block" data-date="${today}"><span aria-hidden="true">+</span> Add block</button>
          <span class="widget-note">${blocks.length ? `${doneBlocks}/${blocks.length} done` : 'No blocks'}</span>
        </div>
      </section>

      <section class="widget" data-section="analytics" aria-labelledby="home-analytics-title">
        ${widgetHeadHtml({ id: 'home-analytics-title', title: 'Analytics', nav: 'more', tab: 'analytics' })}
        <div class="mini-stats">
          <div class="mini-stat"><b>${streak}</b><span>Day streak</span></div>
          <div class="mini-stat"><b>${week}</b><span>This week</span></div>
          <div class="mini-stat"><b>${overall.done}</b><span>Done</span></div>
        </div>
        <div class="mini-strip" role="img" aria-label="Topic check-ins over the last 14 days">
          ${days.map((day) => `<span class="mini-cell${day.count ? ' has' : ''}${day.isToday ? ' is-today' : ''}" title="${esc(formatLongDate(day.date))} · ${countLabel(day.count, 'topic')}">${day.day}</span>`).join('')}
        </div>
        <div class="widget-foot">
          <span class="widget-note">Last 14 days</span>
          <button class="text-btn" type="button" data-action="open-more" data-tab="analytics">Open analytics <span aria-hidden="true">→</span></button>
        </div>
      </section>
    </div>
  `;
}

/* ---------- Today ---------- */

function renderToday() {
  const root = document.getElementById('view-today');
  const date = todayISO();
  const blocks = blocksForDate(date);
  const exam = nearestExam();
  const overall = overallStats();
  const checkedToday = completedOn(date);
  const sorted = sortBlocks(blocks);
  const next = sorted.find((block) => !block.done && block.start);
  const allDone = blocks.length > 0 && blocks.every((block) => block.done);

  let lede;
  if (!blocks.length) {
    lede = 'Nothing scheduled today. Add a block, or shape the week in Timetable.';
  } else if (allDone) {
    lede = `${countLabel(blocks.length, 'block')} planned. All done for today.`;
  } else {
    lede = `${countLabel(blocks.length, 'block')} planned${next ? ` · next at ${next.start}` : ''}.`;
  }

  const caption = exam
    ? `<p class="hanko-caption"><strong>${esc(exam.title)}</strong><span>${esc(formatShortDate(exam.date))} · ${esc(distanceLabel(exam.date))}</span></p>`
    : `<p class="hanko-caption"><strong>No exam set</strong><span>Add one in Calendar</span></p>`;

  root.innerHTML = `
    <header class="view-head">
      <div>
        <p class="eyebrow">${esc(formatLongDate(date))}</p>
        <h1 id="view-today-title">Today</h1>
      </div>
      <div class="head-actions">
        <button class="btn btn--primary" type="button" data-action="add-block" data-date="${date}">${ICONS.plus} Add block</button>
      </div>
    </header>

    <section class="today-hero" aria-label="Today at a glance">
      <div>
        <p class="lede">${esc(lede)}</p>
        <div class="today-meta">
          <span><b>${checkedToday}</b> ${checkedToday === 1 ? 'topic' : 'topics'} checked today</span>
          <span><b>${overall.pct}%</b> complete overall</span>
        </div>
      </div>
      <div class="hanko-holder">
        ${hankoHtml(exam)}
        ${caption}
      </div>
    </section>

    <section class="section" aria-labelledby="today-study-title">
      <div class="section-head">
        <h2 class="section-title" id="today-study-title">Study blocks</h2>
        <span class="section-aside">${blocks.length ? `${blocks.filter((block) => block.done).length}/${blocks.length} done` : 'Empty'}</span>
      </div>
      ${blocks.length
        ? `<div class="panel panel-pad">${scheduleListHtml(blocks, date)}</div>`
        : emptyHtml({
          title: 'No study blocks today',
          copy: 'Add a one-off block for today, or set a weekly rhythm you can keep.',
          actions: `<button class="btn btn--primary" type="button" data-action="add-block" data-date="${date}">${ICONS.plus} Add a block</button>
            <button class="btn" type="button" data-nav="timetable">Open timetable</button>`
        })}
    </section>
  `;
}

/* ---------- Timetable ---------- */

function renderTimetable() {
  const root = document.getElementById('view-timetable');
  const total = DAYS.reduce((sum, day) => sum + state.weeklyTemplate[day].length, 0);

  root.innerHTML = `
    <header class="view-head">
      <div>
        <p class="eyebrow">Weekly rhythm</p>
        <h1 id="view-timetable-title">Timetable</h1>
        <p class="lede">${total ? `${countLabel(total, 'block')} in your week. Click one to edit it.` : 'A calm week starts with one block. Add it to any day.'}</p>
      </div>
      <div class="head-actions">
        <button class="btn btn--primary" type="button" data-action="add-template-block">${ICONS.plus} Add to week</button>
      </div>
    </header>

    <div class="week-scroll">
      <div class="week-board">
        ${DAYS.map((day) => {
          const blocks = sortBlocks(state.weeklyTemplate[day]);
          return `<article class="day-col" aria-label="${DAY_LONG[day]}">
            <div class="day-col-head">
              <h2 class="day-name">${day}</h2>
              <span class="day-count">${blocks.length ? blocks.length : '—'}</span>
            </div>
            <div class="day-blocks">
              ${blocks.map((block) => {
                const course = courseById(block.courseId);
                return `<button class="t-block" type="button" data-action="edit-template-block" data-day="${day}" data-id="${esc(block.id)}" aria-label="Edit ${esc(block.title)} on ${DAY_LONG[day]}">
                  <time>${block.start ? `${esc(block.start)}${block.end ? `–${esc(block.end)}` : ''}` : 'Any time'}</time>
                  <strong>${esc(block.title)}</strong>
                  ${course ? `<small>${esc(course.title)}</small>` : ''}
                </button>`;
              }).join('')}
            </div>
            <button class="day-add" type="button" data-action="add-template-block" data-day="${day}" aria-label="Add a block on ${DAY_LONG[day]}">+</button>
          </article>`;
        }).join('')}
      </div>
    </div>
    <p class="timetable-note">Daily changes live in Today or Calendar. They never rewrite this weekly template.</p>
  `;
}

/* ---------- Courses ---------- */

function renderCourses() {
  const root = document.getElementById('view-courses');
  const overall = overallStats();
  const examCount = upcomingExams().length;

  root.innerHTML = `
    <header class="view-head">
      <div>
        <p class="eyebrow">Curriculum · ${countLabel(state.courses.length, 'course')}</p>
        <h1 id="view-courses-title">Courses</h1>
        <p class="lede">Course, module, topic. Check a topic when it is truly done.</p>
      </div>
      <div class="head-actions">
        <button class="btn btn--primary" type="button" data-action="add-course">${ICONS.plus} Add course</button>
      </div>
    </header>

    ${state.courses.length ? `
      <div class="overall-line">
        <strong>${overall.pct}%</strong>
        <span>${overall.done} of ${overall.total} topics complete</span>
        <span>·</span>
        <span>${countLabel(examCount, 'exam')} ahead</span>
      </div>
      ${state.courses.map((course, index) => courseCardHtml(course, index)).join('')}
    ` : emptyHtml({
      mark: '+',
      title: 'Add your first course',
      copy: 'Build the tree: a course, its modules, then the topics inside. Progress adds up from there.',
      actions: `<button class="btn btn--primary" type="button" data-action="add-course">${ICONS.plus} Add your first course</button>`
    })}
  `;
}

function courseCardHtml(course, index = 0) {
  const stats = courseStats(course);
  const examDays = course.examDate ? diffDays(course.examDate, todayISO()) : null;
  const examText = course.examDate
    ? `${examDays > 0 ? `${examDays} days` : examDays === 0 ? 'today' : 'past'}`
    : '';

  return `<article class="course" aria-label="${esc(course.title)}">
    <header class="course-head">
      <div class="course-head-main">
        <h2 class="course-title"><span class="row-num" aria-hidden="true">${rowNumber(index)}</span>${esc(course.title)}</h2>
        <div class="course-meta">
          <span>${countLabel(course.modules.length, 'module')} · ${countLabel(stats.total, 'topic')}</span>
          ${course.examDate ? `<span class="exam-chip">Exam ${esc(formatShortDate(course.examDate))}${examText ? ` · ${esc(examText)}` : ''}</span>` : ''}
        </div>
      </div>
      <div class="course-progress" aria-label="${stats.pct}% complete">
        <span class="course-pct">${stats.pct}%</span>
        <div class="bar"><span class="bar-fill" style="width:${stats.pct}%"></span></div>
      </div>
      <div class="course-actions">
        <button class="icon-btn" type="button" data-action="edit-course" data-course="${esc(course.id)}" aria-label="Edit ${esc(course.title)}" title="Edit course">${ICONS.edit}</button>
        <button class="icon-btn icon-btn--danger" type="button" data-action="delete-course" data-course="${esc(course.id)}" aria-label="Delete ${esc(course.title)}" title="Delete course">${ICONS.trash}</button>
      </div>
    </header>
    ${course.modules.map((module) => moduleHtml(course, module)).join('')}
    <button class="add-row" type="button" data-action="add-module" data-course="${esc(course.id)}">${ICONS.plus} Add module</button>
  </article>`;
}

function moduleHtml(course, module) {
  const stats = moduleStats(module);
  const collapsed = ui.collapsedModules.has(module.id);
  return `<section class="module" aria-label="${esc(module.title)}">
    <div class="module-head">
      <button class="module-toggle" type="button" data-action="toggle-module" data-module="${esc(module.id)}" aria-expanded="${!collapsed}" aria-controls="module-${esc(module.id)}">
        ${ICONS.chevron}
        <span class="module-title">${esc(module.title)}</span>
        <span class="module-count">${stats.done}/${stats.total}</span>
      </button>
      <span class="module-pct">${stats.pct}%</span>
      <div class="module-actions">
        <button class="icon-btn" type="button" data-action="edit-module" data-course="${esc(course.id)}" data-module="${esc(module.id)}" aria-label="Edit ${esc(module.title)}" title="Edit module">${ICONS.edit}</button>
        <button class="icon-btn icon-btn--danger" type="button" data-action="delete-module" data-course="${esc(course.id)}" data-module="${esc(module.id)}" aria-label="Delete ${esc(module.title)}" title="Delete module">${ICONS.trash}</button>
      </div>
    </div>
    <div id="module-${esc(module.id)}" ${collapsed ? 'hidden' : ''}>
      <div class="topics">
        ${module.topics.map((topic) => topicHtml(course, module, topic)).join('')}
      </div>
      <button class="add-row" type="button" data-action="add-topic" data-course="${esc(course.id)}" data-module="${esc(module.id)}">${ICONS.plus} Add topic</button>
    </div>
  </section>`;
}

function topicHtml(course, module, topic) {
  const completed = topic.done && topic.completedAt
    ? `Checked ${formatShortDate(localDateFromTimestamp(topic.completedAt))}`
    : topic.done ? 'Checked' : '';
  return `<div class="topic${topic.done ? ' is-done' : ''}">
    <input class="tick" type="checkbox" data-action="toggle-topic" data-course="${esc(course.id)}" data-module="${esc(module.id)}" data-topic="${esc(topic.id)}"
      ${topic.done ? 'checked' : ''} aria-label="Mark ${esc(topic.title)} as ${topic.done ? 'not done' : 'done'}" data-focus="topic-${esc(topic.id)}">
    <div class="topic-main">
      <div class="topic-title">${esc(topic.title)}</div>
      ${completed ? `<div class="topic-meta">${esc(completed)}</div>` : ''}
    </div>
    <div class="topic-actions">
      <button class="icon-btn" type="button" data-action="edit-topic" data-course="${esc(course.id)}" data-module="${esc(module.id)}" data-topic="${esc(topic.id)}" aria-label="Edit ${esc(topic.title)}" title="Edit topic">${ICONS.edit}</button>
      <button class="icon-btn icon-btn--danger" type="button" data-action="delete-topic" data-course="${esc(course.id)}" data-module="${esc(module.id)}" data-topic="${esc(topic.id)}" aria-label="Delete ${esc(topic.title)}" title="Delete topic">${ICONS.trash}</button>
    </div>
  </div>`;
}

/* ---------- Calendar ---------- */

function renderCalendar() {
  const root = document.getElementById('view-calendar');
  const cursor = ui.calendarCursor;
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1, 12);
  const gridStart = new Date(year, month, 1 - ((first.getDay() + 6) % 7), 12);
  const today = todayISO();

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i, 12);
    const iso = isoOf(date);
    const outside = date.getMonth() !== month;
    const blocks = blocksForDate(iso);
    const exams = examsForDate(iso);
    const classes = [
      'cal-day',
      outside ? 'is-outside' : '',
      iso === today ? 'is-today' : '',
      iso === ui.selectedDate ? 'is-selected' : '',
      exams.length ? 'is-exam' : ''
    ].filter(Boolean).join(' ');
    const aria = `${formatLongDate(iso)}${blocks.length ? `, ${countLabel(blocks.length, 'study block')}` : ''}${exams.length ? `, ${exams.map((exam) => `${exam.title} exam`).join(', ')}` : ''}`;
    cells.push(`<button class="${classes}" type="button" data-action="select-day" data-date="${iso}" data-focus="cal-${iso}" aria-label="${esc(aria)}">
      <span class="cal-num">${date.getDate()}</span>
      ${iso === ui.selectedDate ? `<svg class="cal-clip" viewBox="0 0 14 28" width="14" height="28" aria-hidden="true" focusable="false"><path d="M5.5 11.5V21.5A3.5 3.5 0 0 0 12.5 21.5V8A5.5 5.5 0 0 0 1.5 8V16A3.5 3.5 0 0 0 8.5 16V11.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
      ${exams[0] ? `<span class="cal-exam-label">${esc(exams[0].title)}</span>` : ''}
      <span class="cal-marks" aria-hidden="true">
        ${blocks.length ? '<span class="cal-dot"></span>' : ''}
      </span>
    </button>`);
  }

  const selectedDate = ui.selectedDate;
  const selectedBlocks = blocksForDate(selectedDate);
  const selectedExams = examsForDate(selectedDate);
  const selectedStats = { done: selectedBlocks.filter((block) => block.done).length };

  root.innerHTML = `
    <header class="view-head">
      <div>
        <p class="eyebrow">Month view</p>
        <h1 id="view-calendar-title">Calendar</h1>
      </div>
      <div class="head-actions">
        <button class="btn btn--primary" type="button" data-action="add-block" data-date="${selectedDate}">${ICONS.plus} Add block</button>
        <button class="btn" type="button" data-action="add-exam" data-date="${selectedDate}">${ICONS.plus} Add exam</button>
      </div>
    </header>

    <div class="cal-toolbar">
      <h2 class="cal-month"><small>Month ${String(month + 1).padStart(2, '0')}</small>${formatMonthYear(cursor)}</h2>
      <div class="cal-nav">
        <button class="btn btn--sm" type="button" data-action="cal-prev" aria-label="Previous month">←</button>
        <button class="btn btn--sm" type="button" data-action="cal-today">Today</button>
        <button class="btn btn--sm" type="button" data-action="cal-next" aria-label="Next month">→</button>
      </div>
    </div>

    <div class="calendar">
      ${spiralBindingHtml(7)}
      <div class="cal-weekdays" aria-hidden="true">
        ${DAYS.map((day) => `<span class="cal-weekday">${day}</span>`).join('')}
      </div>
      <div class="cal-grid" role="group" aria-label="${esc(formatMonthYear(cursor))}">
        ${cells.join('')}
      </div>
    </div>

    <div class="cal-legend">
      <span><i class="legend-dot"></i> Study block</span>
      <span><i class="legend-exam"></i> Exam</span>
    </div>

    <section class="cal-detail" aria-labelledby="cal-detail-title">
      <div class="cal-detail-head">
        <div>
          <h2 id="cal-detail-title">${esc(formatLongDate(selectedDate))}</h2>
          <p>${selectedExams.length ? `${countLabel(selectedExams.length, 'exam')} · ` : ''}${selectedStats.done}/${selectedBlocks.length} blocks done</p>
        </div>
        <div class="head-actions">
          <button class="btn btn--sm" type="button" data-action="add-block" data-date="${selectedDate}">${ICONS.plus} Block</button>
          <button class="btn btn--sm" type="button" data-action="add-exam" data-date="${selectedDate}">${ICONS.plus} Exam</button>
        </div>
      </div>
      <div class="cal-detail-body">
        ${selectedExams.length ? `<div class="exam-list">${selectedExams.map(examRowHtml).join('')}</div>` : ''}
        ${selectedBlocks.length
          ? scheduleListHtml(selectedBlocks, selectedDate)
          : `<p class="cal-empty">No blocks on this day. <button class="text-btn" type="button" data-action="add-block" data-date="${selectedDate}">Add one</button></p>`}
      </div>
    </section>
  `;
}

function changeMonth(delta) {
  const cursor = new Date(ui.calendarCursor.getFullYear(), ui.calendarCursor.getMonth() + delta, 1, 12);
  ui.calendarCursor = cursor;
  const today = todayISO();
  ui.selectedDate = isoOf(cursor).slice(0, 7) === today.slice(0, 7) ? today : isoOf(cursor);
  renderView('calendar');
}

function jumpCalendarToday() {
  const today = todayISO();
  ui.calendarCursor = startOfMonth(new Date());
  ui.selectedDate = today;
  renderView('calendar');
  focusByKey(`cal-${today}`);
}

function selectCalendarDay(date) {
  if (!isValidISODate(date)) return;
  ui.selectedDate = date;
  const target = parseISO(date);
  if (target.getMonth() !== ui.calendarCursor.getMonth() || target.getFullYear() !== ui.calendarCursor.getFullYear()) {
    ui.calendarCursor = startOfMonth(target);
  }
  renderView('calendar');
  focusByKey(`cal-${date}`);
}

function openCalendarDate(date) {
  if (!isValidISODate(date)) return;
  ui.selectedDate = date;
  ui.calendarCursor = startOfMonth(parseISO(date));
  setView('calendar');
  focusByKey(`cal-${date}`);
}

/* ---------- More: Progress, Analytics, Settings ---------- */

function renderMore() {
  const root = document.getElementById('view-more');
  const tab = ui.moreTab || 'progress';
  root.dataset.sub = tab;
  root.innerHTML = `
    <header class="view-head">
      <div>
        <p class="eyebrow">Numbers & settings</p>
        <h1 id="view-more-title">More</h1>
      </div>
    </header>

    <div class="segmented" role="group" aria-label="More sections">
      <button type="button" aria-pressed="${tab === 'progress'}" data-action="more-tab" data-tab="progress">Progress</button>
      <button type="button" aria-pressed="${tab === 'analytics'}" data-action="more-tab" data-tab="analytics">Analytics</button>
      <button type="button" aria-pressed="${tab === 'settings'}" data-action="more-tab" data-tab="settings">Settings</button>
    </div>

    <div aria-label="${tab}">
      ${tab === 'progress' ? progressHtml() : tab === 'analytics' ? analyticsHtml() : settingsHtml()}
    </div>
  `;
}

function progressHtml() {
  const overall = overallStats();
  const upcoming = upcomingExams();
  return `
    <div class="overall-panel">
      <div>
        <p class="overall-label">All topics complete</p>
        <p class="overall-value">${overall.pct}<sup>%</sup></p>
      </div>
      <div class="overall-copy">
        <strong>${overall.done} of ${overall.total} topics</strong> checked across ${countLabel(state.courses.length, 'course')}. ${overall.total === 0 ? 'Add a course to start the count.' : overall.done === overall.total ? 'Every topic is complete.' : 'The rest is just small, repeatable steps.'}
      </div>
      <div class="overall-bar">
        <div class="bar" aria-hidden="true"><span class="bar-fill" style="width:${overall.pct}%"></span></div>
        <p>Progress is saved from topic check-ins, not from a timer.</p>
      </div>
    </div>

    <section class="section" aria-labelledby="progress-exams">
      <div class="section-head">
        <h2 class="section-title" id="progress-exams">Exam countdowns</h2>
        <button class="text-btn" type="button" data-action="add-exam" data-date="${todayISO()}">Add exam</button>
      </div>
      ${upcoming.length
        ? `<div class="exam-grid">
            ${upcoming.map((exam) => {
              const course = courseById(exam.courseId);
              const days = diffDays(exam.date, todayISO());
              return `<article class="exam-card">
                ${hankoHtml(exam, true)}
                <div class="exam-card-copy">
                  <strong>${esc(exam.title)}</strong>
                  <span>${esc(formatShortDate(exam.date))} · ${esc(distanceLabel(exam.date))}${days === 0 ? ' · today' : ''}</span>
                  ${course ? `<span>${esc(course.title)}</span>` : ''}
                </div>
              </article>`;
            }).join('')}
          </div>`
        : `<div class="cal-empty">No exams ahead. <button class="text-btn" type="button" data-action="add-exam" data-date="${todayISO()}">Add the first one</button>.</div>`}
    </section>

    <section class="section" aria-labelledby="progress-courses">
      <div class="section-head">
        <h2 class="section-title" id="progress-courses">By course</h2>
        <span class="section-aside">${countLabel(overall.total, 'topic')}</span>
      </div>
      ${state.courses.length
        ? `<div class="progress-courses">
            ${state.courses.map((course, index) => {
              const stats = courseStats(course);
              return `<div class="progress-course">
                <div class="progress-course-main">
                  <div class="progress-course-name">
                    <strong><span class="row-num" aria-hidden="true">${rowNumber(index)}</span>${esc(course.title)}</strong>
                    <span class="pct-pill">${stats.done}/${stats.total} · ${stats.pct}%</span>
                  </div>
                  <div class="bar" aria-hidden="true"><span class="bar-fill" style="width:${stats.pct}%"></span></div>
                </div>
              </div>`;
            }).join('')}
          </div>`
        : emptyHtml({
          mark: '+',
          title: 'No courses yet',
          copy: 'Progress starts with a course and a few honest topics.',
          actions: `<button class="btn btn--primary" type="button" data-action="add-course">Add a course</button>`
        })}
    </section>
  `;
}

function analyticsHtml() {
  const streak = streakDays();
  const week = weekCompletions();
  const overall = overallStats();
  const days = last14Days();

  return `
    <div class="stat-grid">
      <div class="stat">
        <div class="stat-value">${streak}</div>
        <div class="stat-label">Day streak</div>
        <div class="stat-note">Consecutive check-ins</div>
      </div>
      <div class="stat">
        <div class="stat-value">${week}</div>
        <div class="stat-label">This week</div>
        <div class="stat-note">Topics checked</div>
      </div>
      <div class="stat">
        <div class="stat-value">${overall.done}</div>
        <div class="stat-label">Topics done</div>
        <div class="stat-note">of ${overall.total} total</div>
      </div>
    </div>

    <section class="section" aria-labelledby="analytics-activity">
      <div class="section-head">
        <h2 class="section-title" id="analytics-activity">Last 14 days</h2>
        <span class="section-aside">${week} this week</span>
      </div>
      <div class="activity" role="img" aria-label="Topic check-ins over the last 14 days">
        ${days.map((day) => `<div class="activity-day" title="${esc(formatLongDate(day.date))} · ${countLabel(day.count, 'topic')}">
          <div class="activity-cell${day.count ? ' has' : ''}${day.isToday ? ' is-today' : ''}">${day.day}</div>
          <div class="activity-label">${day.weekday}</div>
        </div>`).join('')}
      </div>
      <div class="activity-legend"><span>14 days ago</span><span>Today</span></div>
    </section>

    <section class="section" aria-labelledby="analytics-subjects">
      <div class="section-head">
        <h2 class="section-title" id="analytics-subjects">By subject</h2>
        <span class="section-aside">${overall.pct}% overall</span>
      </div>
      ${state.courses.length
        ? `<div class="subject-list">
            ${state.courses.map((course, index) => {
              const stats = courseStats(course);
              return `<div class="subject-row">
                <span class="row-num" aria-hidden="true">${rowNumber(index)}</span>
                <span class="subject-name">${esc(course.title)}</span>
                <div class="subject-bar"><div class="bar" aria-hidden="true"><span class="bar-fill" style="width:${stats.pct}%"></span></div></div>
                <span class="subject-pct">${stats.pct}%</span>
              </div>`;
            }).join('')}
          </div>`
        : `<div class="cal-empty">Add a course and check topics to see subject progress. <button class="text-btn" type="button" data-action="add-course">Add a course</button></div>`}
    </section>
  `;
}

function syncStatusHtml() {
  const status = ui.syncStatus;
  let kind = '';
  let message;
  let action = '';
  let lastSync = '';

  if (status) {
    kind = status.kind || '';
    message = status.message;
    if (status.action === 'pull') {
      action = ' <button class="text-btn" type="button" data-action="sync-pull">Pull now</button>';
    }
  } else if (syncMeta.lastSync) {
    message = `Last sync · ${formatDateTime(syncMeta.lastSync)}.`;
  } else {
    message = 'Not synced yet. Your token stays in this browser.';
  }

  if (kind === 'error' && syncMeta.lastSync) {
    lastSync = ` <span class="sync-last">Last successful sync · ${esc(formatDateTime(syncMeta.lastSync))}</span>`;
  }

  return `<div class="sync-status ${kind}" role="status" aria-live="polite">
    <span class="status-dot" aria-hidden="true"></span>
    <span>${esc(message)}${action}${lastSync}</span>
  </div>`;
}

function settingsHtml() {
  const pat = storageGet(PAT_KEY) || '';
  const topics = overallStats();
  const disabled = ui.syncBusy ? ' disabled' : '';

  return `
    <div class="settings-grid">
      <section class="settings-card" aria-labelledby="settings-data">
        <div class="settings-card-head">
          <div>
            <h2 id="settings-data">Your data</h2>
            <p>${countLabel(state.courses.length, 'course')} · ${countLabel(topics.total, 'topic')} · saved in this browser</p>
          </div>
          <span class="section-aside">JSON</span>
        </div>
        <div class="settings-actions">
          <button class="btn" type="button" data-action="export-json">Export JSON</button>
          <button class="btn" type="button" data-action="import-json">Import JSON</button>
        </div>
        <p class="settings-note">Exports include courses, timetable, daily changes and exams. They never include your token.</p>
      </section>

      <section class="settings-card" aria-labelledby="settings-sync">
        <div class="settings-card-head">
          <div>
            <h2 id="settings-sync">GitHub sync</h2>
            <p>Keep a copy of <code>${esc(syncConfig.path || 'data.json')}</code> in your repository.</p>
          </div>
          <span class="section-aside">${syncMeta.sha ? 'Linked' : 'Not linked'}</span>
        </div>

        <div class="sync-grid">
          <div class="field field--wide">
            <label for="sync-token">Personal access token</label>
            <div class="token-wrap">
              <input id="sync-token" type="password" value="${esc(pat)}" data-sync-field="token" placeholder="github_pat_…" autocomplete="off" spellcheck="false" aria-describedby="token-hint">
              <button class="token-toggle" type="button" data-action="toggle-token" aria-label="Show or hide token">Show</button>
            </div>
            <p class="field-hint" id="token-hint">Stored only in this browser as <code>ktu-pat</code>. Use a fine-grained token with Contents: read and write.</p>
          </div>
          <div class="field">
            <label for="sync-owner">Owner</label>
            <input id="sync-owner" type="text" value="${esc(syncConfig.owner)}" data-sync-field="owner" placeholder="your-github-username" autocomplete="off" spellcheck="false">
          </div>
          <div class="field">
            <label for="sync-repo">Repository</label>
            <input id="sync-repo" type="text" value="${esc(syncConfig.repo)}" data-sync-field="repo" placeholder="KTU-exam" autocomplete="off" spellcheck="false">
          </div>
          <div class="field">
            <label for="sync-branch">Branch</label>
            <input id="sync-branch" type="text" value="${esc(syncConfig.branch)}" data-sync-field="branch" placeholder="main" autocomplete="off" spellcheck="false">
          </div>
          <div class="field">
            <label for="sync-path">Path</label>
            <input id="sync-path" type="text" value="${esc(syncConfig.path)}" data-sync-field="path" placeholder="data.json" autocomplete="off" spellcheck="false">
          </div>
        </div>

        <div class="sync-actions">
          <button class="btn" type="button" data-action="sync-pull"${disabled}>Pull from GitHub</button>
          <button class="btn btn--primary" type="button" data-action="sync-push"${disabled}>Push to GitHub</button>
          ${ui.syncBusy ? '<span class="section-aside">Working…</span>' : ''}
        </div>

        ${syncStatusHtml()}

        <p class="settings-note">Pull replaces the data in this browser with the remote file. If someone else pushed after your last pull, Push stops and asks you to Pull first. Public repositories make <code>data.json</code> public; use a private repository if the plan should stay private.</p>
      </section>

      <section class="settings-card" aria-labelledby="settings-erase">
        <div class="settings-card-head">
          <div>
            <h2 id="settings-erase">This browser only</h2>
            <p>Erase the local plan without touching GitHub or your exports.</p>
          </div>
        </div>
        <div class="danger-zone">
          <p>Courses, blocks, overrides and exams will be removed. Your token and sync settings stay.</p>
          <button class="btn btn--danger" type="button" data-action="erase-local">Erase local data</button>
        </div>
      </section>
    </div>
  `;
}

/* ---------- dialogs ---------- */

function openModal({
  eyebrow = '', title = '', body = '', submitLabel = 'Save', cancelLabel = 'Cancel',
  submitClass = 'btn--primary', extraActions = '', onSubmit = null
}) {
  if (els.modal.open) els.modal.close();
  modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  els.modal.innerHTML = `<form class="modal-card" novalidate>
    <div class="modal-head">
      <div>
        ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
        <h2 class="modal-title" id="modal-title">${esc(title)}</h2>
      </div>
      <button class="modal-close" type="button" data-close-modal aria-label="Close dialog">×</button>
    </div>
    <div class="modal-body">
      ${body}
      <p class="form-error" hidden></p>
    </div>
    <div class="modal-actions">
      ${extraActions}
      <span class="modal-spacer"></span>
      <button class="btn btn--ghost" type="button" data-close-modal>${esc(cancelLabel)}</button>
      <button class="btn ${submitClass}" type="submit">${esc(submitLabel)}</button>
    </div>
  </form>`;

  const form = els.modal.querySelector('form');
  const errorEl = form.querySelector('.form-error');
  const submitButton = form.querySelector('[type="submit"]');

  form.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => els.modal.close());
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    submitButton.disabled = true;
    try {
      const result = onSubmit ? await onSubmit(new FormData(form), form) : true;
      if (result !== false) els.modal.close();
    } catch (error) {
      errorEl.textContent = error && error.message ? error.message : 'Something went wrong. Try again.';
      errorEl.hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  });

  els.modal.showModal();
  const autofocus = form.querySelector('[autofocus]');
  if (autofocus) autofocus.focus();
}

function confirmDialog({ eyebrow = 'Please confirm', title, message, confirmLabel = 'Delete', onConfirm }) {
  openModal({
    eyebrow,
    title,
    body: `<p class="modal-copy">${message}</p>`,
    submitLabel: confirmLabel,
    submitClass: 'btn--primary',
    onSubmit: () => {
      onConfirm();
      return true;
    }
  });
}

function courseTitle(courseId) {
  const course = courseById(courseId);
  return course ? course.title : '';
}

/* ---------- course / module / topic dialogs ---------- */

function openCourseDialog(courseId = null) {
  const course = courseId ? courseById(courseId) : null;
  if (courseId && !course) return;

  openModal({
    eyebrow: course ? 'Edit course' : 'New course',
    title: course ? course.title : 'Add a course',
    submitLabel: course ? 'Save course' : 'Add course',
    body: `
      <div class="field">
        <label for="course-title">Course title</label>
        <input id="course-title" name="title" type="text" required maxlength="140" value="${esc(course ? course.title : '')}" placeholder="e.g. Applied Mathematics" autofocus>
      </div>
      <div class="field">
        <label for="course-exam">Exam date <span style="color:var(--ink-3);font-weight:400">(optional)</span></label>
        <input id="course-exam" name="examDate" type="date" value="${esc(course ? course.examDate : '')}">
        <p class="field-hint">This adds a red exam marker to Calendar and a countdown seal.</p>
      </div>
      ${course ? '<p class="field-hint">Deleting a course also removes its modules, topics and linked exams.</p>' : ''}
    `,
    onSubmit: (formData) => {
      const title = String(formData.get('title') || '').trim();
      const examDate = String(formData.get('examDate') || '');
      if (!title) throw new Error('Give the course a title.');
      if (examDate && !isValidISODate(examDate)) throw new Error('That exam date is not valid.');

      if (course) {
        course.title = title;
        course.examDate = examDate;
      } else {
        state.courses.push({ id: uid(), title, examDate, modules: [] });
      }
      commit();
    }
  });
}

function openModuleDialog(courseId, moduleId = null) {
  const course = courseById(courseId);
  if (!course) return;
  const module = moduleId ? findModule(course, moduleId) : null;
  if (moduleId && !module) return;

  openModal({
    eyebrow: course.title,
    title: module ? 'Edit module' : 'Add a module',
    submitLabel: module ? 'Save module' : 'Add module',
    body: `
      <div class="field">
        <label for="module-title">Module title</label>
        <input id="module-title" name="title" type="text" required maxlength="140" value="${esc(module ? module.title : '')}" placeholder="e.g. Module 2 — Linear algebra" autofocus>
      </div>
    `,
    onSubmit: (formData) => {
      const title = String(formData.get('title') || '').trim();
      if (!title) throw new Error('Give the module a title.');
      if (module) {
        module.title = title;
      } else {
        course.modules.push({ id: uid(), title, topics: [] });
      }
      commit();
    }
  });
}

function openTopicDialog(courseId, moduleId, topicId = null) {
  const course = courseById(courseId);
  const module = findModule(course, moduleId);
  if (!course || !module) return;
  const topic = topicId ? module.topics.find((item) => item.id === topicId) : null;
  if (topicId && !topic) return;

  openModal({
    eyebrow: `${course.title} · ${module.title}`,
    title: topic ? 'Edit topic' : 'Add a topic',
    submitLabel: topic ? 'Save topic' : 'Add topic',
    body: `
      <div class="field">
        <label for="topic-title">Topic</label>
        <input id="topic-title" name="title" type="text" required maxlength="180" value="${esc(topic ? topic.title : '')}" placeholder="e.g. Cayley–Hamilton theorem" autofocus>
      </div>
    `,
    onSubmit: (formData) => {
      const title = String(formData.get('title') || '').trim();
      if (!title) throw new Error('Give the topic a title.');
      if (topic) {
        topic.title = title;
      } else {
        module.topics.push({ id: uid(), title, done: false, completedAt: null });
      }
      commit();
    }
  });
}

function askDeleteCourse(courseId) {
  const course = courseById(courseId);
  if (!course) return;
  const stats = courseStats(course);
  confirmDialog({
    eyebrow: 'Delete course',
    title: `Delete “${course.title}”?`,
    message: `This removes <strong>${countLabel(course.modules.length, 'module')}</strong>, <strong>${countLabel(stats.total, 'topic')}</strong> and any linked exams. Timetable blocks for this course will stay, without a course label. This cannot be undone.`,
    confirmLabel: 'Delete course',
    onConfirm: () => {
      state.courses = state.courses.filter((item) => item.id !== courseId);
      state.exams = state.exams.filter((exam) => exam.courseId !== courseId);
      DAYS.forEach((day) => {
        state.weeklyTemplate[day].forEach((block) => {
          if (block.courseId === courseId) block.courseId = '';
        });
      });
      Object.values(state.dailyOverrides).forEach((blocks) => {
        blocks.forEach((block) => {
          if (block.courseId === courseId) block.courseId = '';
        });
      });
      commit();
      toast('Course deleted.');
    }
  });
}

function askDeleteModule(courseId, moduleId) {
  const course = courseById(courseId);
  const module = findModule(course, moduleId);
  if (!course || !module) return;
  const stats = moduleStats(module);
  confirmDialog({
    eyebrow: course.title,
    title: `Delete “${module.title}”?`,
    message: `This removes the module and its <strong>${countLabel(stats.total, 'topic')}</strong>. This cannot be undone.`,
    confirmLabel: 'Delete module',
    onConfirm: () => {
      course.modules = course.modules.filter((item) => item.id !== moduleId);
      commit();
      toast('Module deleted.');
    }
  });
}

function askDeleteTopic(courseId, moduleId, topicId) {
  const course = courseById(courseId);
  const module = findModule(course, moduleId);
  const topic = module ? module.topics.find((item) => item.id === topicId) : null;
  if (!module || !topic) return;
  confirmDialog({
    eyebrow: `${course.title} · ${module.title}`,
    title: `Delete “${topic.title}”?`,
    message: 'The topic and its check-in history will be removed. This cannot be undone.',
    confirmLabel: 'Delete topic',
    onConfirm: () => {
      module.topics = module.topics.filter((item) => item.id !== topicId);
      commit();
      toast('Topic deleted.');
    }
  });
}

function toggleModule(moduleId) {
  if (ui.collapsedModules.has(moduleId)) ui.collapsedModules.delete(moduleId);
  else ui.collapsedModules.add(moduleId);
  renderView('courses');
}

function toggleTopicCheckbox(input) {
  const { course, module, topic } = input.dataset;
  const target = findTopic(course, module, topic);
  if (!target) return;
  target.done = input.checked;
  target.completedAt = input.checked ? new Date().toISOString() : null;
  commit(`topic-${target.id}`);
}

/* ---------- block dialogs ---------- */

function validateBlockFields(formData) {
  const title = String(formData.get('title') || '').trim();
  const start = String(formData.get('start') || '');
  const end = String(formData.get('end') || '');
  const date = String(formData.get('date') || '');
  if (!title) throw new Error('Give the block a title.');
  if (!date || !isValidISODate(date)) throw new Error('Choose a valid date.');
  if ((start && !end) || (!start && end)) throw new Error('Add both a start and end time, or leave both blank.');
  if (start && end && end <= start) throw new Error('The end time must be after the start time.');
  return { title, start, end, date };
}

function openBlockDialog({ date = todayISO(), blockId = null } = {}) {
  if (!isValidISODate(date)) date = todayISO();
  const blocks = blocksForDate(date);
  const block = blockId ? blocks.find((item) => item.id === blockId) : null;
  if (blockId && !block) return;

  openModal({
    eyebrow: 'Daily schedule',
    title: block ? 'Edit block' : 'Add a study block',
    submitLabel: block ? 'Save block' : 'Add block',
    extraActions: block ? `<button class="btn btn--danger" type="button" data-action="delete-block" data-date="${esc(date)}" data-id="${esc(block.id)}">Delete</button>` : '',
    body: `
      <div class="field">
        <label for="block-title">Subject or block</label>
        <input id="block-title" name="title" type="text" required maxlength="140" value="${esc(block ? block.title : '')}" placeholder="e.g. Physics revision" autofocus>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="block-date">Date</label>
          <input id="block-date" name="date" type="date" required value="${esc(block ? date : date)}">
        </div>
        <div class="field">
          <label for="block-course">Course</label>
          <select id="block-course" name="courseId">${courseOptionsHtml(block ? block.courseId : '')}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="block-start">Start <span style="color:var(--ink-3);font-weight:400">(optional)</span></label>
          <input id="block-start" name="start" type="time" value="${esc(block ? block.start : '')}">
        </div>
        <div class="field">
          <label for="block-end">End <span style="color:var(--ink-3);font-weight:400">(optional)</span></label>
          <input id="block-end" name="end" type="time" value="${esc(block ? block.end : '')}">
        </div>
      </div>
      <p class="field-hint">This changes only this date. The weekly template stays untouched.</p>
    `,
    onSubmit: (formData) => {
      const fields = validateBlockFields(formData);
      const courseId = String(formData.get('courseId') || '');
      if (block) {
        if (fields.date === date) {
          ensureOverride(date);
          const target = state.dailyOverrides[date].find((item) => item.id === block.id);
          if (!target) return;
          target.title = fields.title;
          target.courseId = courseId;
          target.start = fields.start;
          target.end = fields.end;
        } else {
          ensureOverride(date);
          const source = state.dailyOverrides[date];
          const sourceBlock = source.find((item) => item.id === block.id);
          if (!sourceBlock) return;
          const moved = {
            ...sourceBlock,
            id: uid(),
            title: fields.title,
            courseId,
            start: fields.start,
            end: fields.end
          };
          state.dailyOverrides[date] = source.filter((item) => item.id !== block.id);
          ensureOverride(fields.date);
          state.dailyOverrides[fields.date].push(moved);
          commit();
          toast(`Block moved to ${formatShortDate(fields.date)}.`);
          return;
        }
      } else {
        ensureOverride(fields.date);
        state.dailyOverrides[fields.date].push({
          id: uid(),
          title: fields.title,
          courseId,
          start: fields.start,
          end: fields.end,
          done: false
        });
      }
      commit();
    }
  });
}

function openMoveDialog(date, blockId) {
  const block = blocksForDate(date).find((item) => item.id === blockId);
  if (!block) return;
  const suggested = addDaysISO(date, 1);
  openModal({
    eyebrow: 'Move block',
    title: `Move “${block.title}”`,
    submitLabel: 'Move block',
    body: `
      <div class="field">
        <label for="move-date">New date</label>
        <input id="move-date" name="date" type="date" required value="${esc(suggested)}" autofocus>
        <p class="field-hint">The block leaves ${esc(formatShortDate(date))} and joins the new date. Its done state is kept.</p>
      </div>
    `,
    onSubmit: (formData) => {
      const targetDate = String(formData.get('date') || '');
      if (!isValidISODate(targetDate)) throw new Error('Choose a valid date.');
      if (targetDate === date) throw new Error('That is the same date. Choose another day.');
      ensureOverride(date);
      const source = state.dailyOverrides[date];
      const sourceBlock = source.find((item) => item.id === blockId);
      if (!sourceBlock) return;
      const moved = { ...sourceBlock, id: uid() };
      state.dailyOverrides[date] = source.filter((item) => item.id !== blockId);
      ensureOverride(targetDate);
      state.dailyOverrides[targetDate].push(moved);
      commit();
      toast(`Block moved to ${formatShortDate(targetDate)}.`);
    }
  });
}

function askDeleteBlock(date, blockId) {
  const block = blocksForDate(date).find((item) => item.id === blockId);
  if (!block) return;
  confirmDialog({
    eyebrow: formatShortDate(date),
    title: `Remove “${block.title}”?`,
    message: `This removes the block from <strong>${esc(formatLongDate(date))}</strong>. The weekly template is not changed.`,
    confirmLabel: 'Remove block',
    onConfirm: () => {
      ensureOverride(date);
      state.dailyOverrides[date] = state.dailyOverrides[date].filter((item) => item.id !== blockId);
      commit();
      toast('Block removed for that day.');
    }
  });
}

function toggleBlockCheckbox(input) {
  const date = input.dataset.date;
  const blockId = input.dataset.id;
  if (!isValidISODate(date)) return;
  ensureOverride(date);
  const block = state.dailyOverrides[date].find((item) => item.id === blockId);
  if (!block) return;
  block.done = input.checked;
  commit(`block-${block.id}`);
}

/* ---------- timetable template dialogs ---------- */

function openTemplateBlockDialog({ day = weekdayKey(todayISO()), blockId = null } = {}) {
  if (!DAYS.includes(day)) day = weekdayKey(todayISO());
  const block = blockId ? state.weeklyTemplate[day].find((item) => item.id === blockId) : null;
  if (blockId && !block) return;

  openModal({
    eyebrow: block ? 'Weekly template' : 'Add to the week',
    title: block ? 'Edit weekly block' : 'Add a weekly block',
    submitLabel: block ? 'Save block' : 'Add to week',
    extraActions: block ? `<button class="btn btn--danger" type="button" data-action="delete-template-block" data-day="${esc(day)}" data-id="${esc(block.id)}">Delete</button>` : '',
    body: `
      <div class="field">
        <label for="template-title">Subject or block</label>
        <input id="template-title" name="title" type="text" required maxlength="140" value="${esc(block ? block.title : '')}" placeholder="e.g. Mathematics study" autofocus>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="template-day">Day</label>
          <select id="template-day" name="day">
            ${DAYS.map((item) => `<option value="${item}"${item === day ? ' selected' : ''}>${DAY_LONG[item]}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="template-course">Course</label>
          <select id="template-course" name="courseId">${courseOptionsHtml(block ? block.courseId : '')}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="template-start">Start <span style="color:var(--ink-3);font-weight:400">(optional)</span></label>
          <input id="template-start" name="start" type="time" value="${esc(block ? block.start : '')}">
        </div>
        <div class="field">
          <label for="template-end">End <span style="color:var(--ink-3);font-weight:400">(optional)</span></label>
          <input id="template-end" name="end" type="time" value="${esc(block ? block.end : '')}">
        </div>
      </div>
    `,
    onSubmit: (formData) => {
      const title = String(formData.get('title') || '').trim();
      const targetDay = String(formData.get('day') || '');
      const start = String(formData.get('start') || '');
      const end = String(formData.get('end') || '');
      const courseId = String(formData.get('courseId') || '');
      if (!title) throw new Error('Give the block a title.');
      if (!DAYS.includes(targetDay)) throw new Error('Choose a day.');
      if ((start && !end) || (!start && end)) throw new Error('Add both a start and end time, or leave both blank.');
      if (start && end && end <= start) throw new Error('The end time must be after the start time.');

      if (block) {
        const payload = { title, courseId, start, end };
        if (targetDay === day) {
          Object.assign(block, payload);
        } else {
          state.weeklyTemplate[day] = state.weeklyTemplate[day].filter((item) => item.id !== block.id);
          state.weeklyTemplate[targetDay].push({
            id: uid(), ...payload
          });
        }
      } else {
        state.weeklyTemplate[targetDay].push({ id: uid(), title, courseId, start, end });
      }
      commit();
    }
  });
}

function askDeleteTemplateBlock(day, blockId) {
  const block = (state.weeklyTemplate[day] || []).find((item) => item.id === blockId);
  if (!block) return;
  confirmDialog({
    eyebrow: 'Weekly template',
    title: `Delete “${block.title}”?`,
    message: `This removes it from every <strong>${DAY_LONG[day]}</strong> that follows the template. Existing daily overrides are kept.`,
    confirmLabel: 'Delete block',
    onConfirm: () => {
      state.weeklyTemplate[day] = state.weeklyTemplate[day].filter((item) => item.id !== blockId);
      commit();
      toast('Weekly block deleted.');
    }
  });
}

/* ---------- exam dialogs ---------- */

function openExamDialog({ examId = null, date = ui.selectedDate || todayISO() } = {}) {
  const exam = examId ? state.exams.find((item) => item.id === examId) : null;
  if (examId && !exam) return;
  const initialDate = exam ? exam.date : (isValidISODate(date) ? date : todayISO());
  const initialCourse = exam ? exam.courseId : '';

  openModal({
    eyebrow: exam ? 'Edit exam' : 'New exam',
    title: exam ? 'Edit exam' : 'Add an exam',
    submitLabel: exam ? 'Save exam' : 'Add exam',
    extraActions: exam ? `<button class="btn btn--danger" type="button" data-action="delete-exam" data-id="${esc(exam.id)}">Delete</button>` : '',
    body: `
      <div class="field">
        <label for="exam-title">Exam title</label>
        <input id="exam-title" name="title" type="text" maxlength="140" value="${esc(exam ? exam.title : '')}" placeholder="e.g. Mathematics paper" autofocus>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="exam-date">Date</label>
          <input id="exam-date" name="date" type="date" required value="${esc(initialDate)}">
        </div>
        <div class="field">
          <label for="exam-course">Course</label>
          <select id="exam-course" name="courseId">${courseOptionsHtml(initialCourse)}</select>
        </div>
      </div>
      <p class="field-hint">The exam appears as a red circle in Calendar and a countdown seal in Progress.</p>
    `,
    onSubmit: (formData) => {
      const dateValue = String(formData.get('date') || '');
      const courseId = String(formData.get('courseId') || '');
      let title = String(formData.get('title') || '').trim();
      if (!title && courseId) title = courseTitle(courseId);
      if (!title) throw new Error('Give the exam a title.');
      if (!isValidISODate(dateValue)) throw new Error('Choose a valid exam date.');

      if (exam) {
        exam.title = title;
        exam.date = dateValue;
        exam.courseId = courseId;
      } else {
        state.exams.push({ id: uid(), title, date: dateValue, courseId });
      }
      commit();
    }
  });
}

function askDeleteExam(examId) {
  const exam = state.exams.find((item) => item.id === examId);
  if (!exam) return;
  confirmDialog({
    eyebrow: 'Delete exam',
    title: `Delete “${exam.title}”?`,
    message: 'The exam will disappear from Calendar and the countdowns. This cannot be undone.',
    confirmLabel: 'Delete exam',
    onConfirm: () => {
      state.exams = state.exams.filter((item) => item.id !== examId);
      commit();
      toast('Exam deleted.');
    }
  });
}

/* ---------- import / export / erase ---------- */

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ktu-exam-${todayISO()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast('Exported a JSON backup.');
}

async function handleImportFile() {
  const file = els.importFile.files && els.importFile.files[0];
  els.importFile.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
    const next = normalizeImported(parsed);
    const stats = next.courses.reduce((total, course) => total + allTopics(course).length, 0);
    confirmDialog({
      eyebrow: 'Import JSON',
      title: 'Replace this browser’s data?',
      message: `This backup has <strong>${countLabel(next.courses.length, 'course')}</strong>, <strong>${countLabel(stats, 'topic')}</strong> and <strong>${countLabel(next.exams.length, 'exam')}</strong>. Importing replaces everything currently stored here.`,
      confirmLabel: 'Replace data',
      onConfirm: () => {
        state = next;
        ui.selectedDate = todayISO();
        ui.calendarCursor = startOfMonth(new Date());
        commit(null, 'Imported');
        toast('Backup imported.');
      }
    });
  } catch (error) {
    toast(error && error.message ? error.message : 'That file could not be imported.', true);
  }
}

function askEraseLocal() {
  confirmDialog({
    eyebrow: 'Local data',
    title: 'Erase this browser’s plan?',
    message: 'Courses, timetable blocks, daily changes and exams will be removed. Your GitHub copy, JSON exports, token and sync settings stay untouched.',
    confirmLabel: 'Erase local data',
    onConfirm: () => {
      state = emptyState();
      commit(null, 'Erased');
      toast('Local data erased.');
    }
  });
}

/* ---------- GitHub sync ---------- */

class SyncError extends Error {
  constructor(message, code = '') {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}

function setSyncStatus(kind, message, action = null) {
  ui.syncStatus = { kind, message, action };
}

function readSyncFields() {
  const read = (name) => {
    const field = document.querySelector(`[data-sync-field="${name}"]`);
    return field ? field.value.trim() : '';
  };
  const hasFields = Boolean(document.querySelector('[data-sync-field="repo"]'));

  const config = {
    owner: hasFields ? read('owner') : syncConfig.owner,
    repo: hasFields ? read('repo') : syncConfig.repo,
    branch: hasFields ? read('branch') : syncConfig.branch,
    path: hasFields ? read('path') : syncConfig.path,
    token: hasFields ? read('token') : (storageGet(PAT_KEY) || '').trim()
  };

  if (hasFields) {
    syncConfig = {
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      path: config.path
    };
    saveSyncConfig();
    storageSet(PAT_KEY, config.token);
  }

  return config;
}

function validateSync(config) {
  if (!config.token) throw new SyncError('Add your GitHub personal access token first.');
  if (!config.owner) throw new SyncError('Add the repository owner (your GitHub username).');
  if (!config.repo) throw new SyncError('Add a repository name.');
  if (!config.branch) throw new SyncError('Add a branch name.');
  if (!config.path) throw new SyncError('Add a file path, such as data.json.');
}

function contentsPath(config) {
  const path = config.path.replace(/^\/+/, '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path}`;
}

function contentsUrl(config) {
  return `${contentsPath(config)}?ref=${encodeURIComponent(config.branch)}`;
}

function base64Encode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64Decode(value) {
  const clean = String(value).replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function githubRequest(config, path, options = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${config.token}`,
    ...GH_HEADERS,
    ...(options.body ? { 'Content-Type': 'application/json' } : {})
  };

  let response;
  try {
    response = await fetch(`${GH_API}${path}`, { ...options, headers });
  } catch {
    throw new SyncError('Could not reach GitHub. Check your connection and try again.');
  }

  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { message: raw.slice(0, 180) };
    }
  }

  if (!response.ok) {
    let message;
    if (response.status === 401) {
      message = 'GitHub rejected the token. Check that it is valid and has access to this repository.';
    } else if (response.status === 403) {
      const detail = data && data.message ? data.message : '';
      message = /rate limit/i.test(detail)
        ? 'GitHub’s rate limit was reached. Try again later.'
        : 'Permission denied. The token needs Contents: read and write for this repository.';
    } else if (response.status === 404) {
      message = 'Repository or file not found. Check the owner, repository, branch and path.';
    } else if (response.status === 409) {
      message = 'The remote file changed while saving. Pull first.';
    } else {
      message = data && data.message ? `GitHub: ${data.message}` : `GitHub returned ${response.status}.`;
    }
    const error = new SyncError(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function getRemoteFile(config) {
  try {
    return await githubRequest(config, contentsUrl(config), { method: 'GET' });
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

function handleSyncError(error) {
  if (error && (error.code === 'conflict' || error.status === 409)) {
    setSyncStatus('error', 'Remote is newer than your last pull. Pull first?', 'pull');
    return;
  }
  if (error && error.code === 'missing') {
    setSyncStatus('error', error.message);
    return;
  }
  setSyncStatus('error', error && error.message ? error.message : 'Sync failed. Try again.');
}

async function handlePull() {
  if (ui.syncBusy) return;
  let config;
  try {
    config = readSyncFields();
    validateSync(config);
  } catch (error) {
    setSyncStatus('error', error.message);
    renderView('more');
    return;
  }

  ui.syncBusy = true;
  setSyncStatus('busy', 'Pulling from GitHub…');
  renderView('more');

  try {
    const remote = await getRemoteFile(config);
    if (!remote) {
      throw new SyncError(`No ${config.path} found on ${config.branch}. Push your local data first.`, 'missing');
    }
    if (!remote.content) {
      throw new SyncError('The remote file is empty or too large to read in the browser.');
    }

    let parsed;
    try {
      parsed = JSON.parse(base64Decode(remote.content).replace(/^\uFEFF/, ''));
    } catch {
      throw new SyncError('The remote file is not valid JSON. Nothing was changed.');
    }

    let next;
    try {
      next = normalizeImported(parsed);
    } catch {
      throw new SyncError('The remote file is not an exam-plan backup. Nothing was changed.');
    }

    const previous = state;
    state = next;
    ui.selectedDate = todayISO();
    ui.calendarCursor = startOfMonth(new Date());
    if (!persistState('Pulled')) {
      state = previous;
      throw new SyncError('Pulled from GitHub, but this browser could not store the data.');
    }

    syncMeta = { sha: remote.sha || syncMeta.sha, lastSync: new Date().toISOString() };
    saveSyncMeta();
    setSyncStatus('success', `Pulled from ${config.owner}/${config.repo} · ${formatDateTime(syncMeta.lastSync)}.`);
    toast('Pulled the latest data from GitHub.');
  } catch (error) {
    handleSyncError(error);
  } finally {
    ui.syncBusy = false;
    renderAll();
  }
}

function askPushOverwrite(config) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    openModal({
      eyebrow: 'Check the remote',
      title: 'Replace the remote file?',
      submitLabel: 'Push anyway',
      body: `<p class="modal-copy"><strong>${esc(config.owner)}/${esc(config.repo)}</strong> already has a file at <strong>${esc(config.path)}</strong> on <strong>${esc(config.branch)}</strong>, and this browser has no sync history. Pushing will replace it with your local plan.</p>
        <p class="modal-copy">If that file might be newer, cancel and Pull first.</p>`,
      onSubmit: () => {
        finish(true);
        return true;
      }
    });

    els.modal.addEventListener('close', () => finish(false), { once: true });
  });
}

async function handlePush() {
  if (ui.syncBusy) return;
  let config;
  try {
    config = readSyncFields();
    validateSync(config);
  } catch (error) {
    setSyncStatus('error', error.message);
    renderView('more');
    return;
  }

  ui.syncBusy = true;
  setSyncStatus('busy', 'Checking the remote file…');
  renderView('more');

  try {
    const remote = await getRemoteFile(config);

    if (remote && syncMeta.sha && remote.sha !== syncMeta.sha) {
      const error = new SyncError('Remote is newer than your last pull.');
      error.code = 'conflict';
      throw error;
    }

    if (remote && !syncMeta.sha) {
      const proceed = await askPushOverwrite(config);
      if (!proceed) {
        setSyncStatus('', 'Push cancelled. Pull first to review the remote copy.');
        return;
      }
    }

    setSyncStatus('busy', 'Pushing to GitHub…');
    renderView('more');

    const body = {
      message: `Update exam plan · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      content: base64Encode(JSON.stringify(state, null, 2)),
      branch: config.branch
    };
    if (remote && remote.sha) body.sha = remote.sha;

    const result = await githubRequest(config, contentsPath(config), {
      method: 'PUT',
      body: JSON.stringify(body)
    });

    const sha = result && result.content && result.content.sha;
    if (!sha) throw new SyncError('GitHub accepted the request but did not return a file SHA.');

    syncMeta = { sha, lastSync: new Date().toISOString() };
    saveSyncMeta();
    setSyncStatus('success', `Pushed to ${config.owner}/${config.repo} · ${formatDateTime(syncMeta.lastSync)}.`);
    toast('Pushed to GitHub.');
  } catch (error) {
    handleSyncError(error);
  } finally {
    ui.syncBusy = false;
    renderAll();
  }
}

function toggleTokenVisibility() {
  const input = document.querySelector('[data-sync-field="token"]');
  const button = document.querySelector('[data-action="toggle-token"]');
  if (!input || !button) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.textContent = show ? 'Hide' : 'Show';
  button.setAttribute('aria-label', show ? 'Hide token' : 'Show token');
  input.focus();
}

/* ---------- go ---------- */

init();
