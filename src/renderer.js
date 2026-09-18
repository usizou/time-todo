// ===== タブ切り替え =====
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (typeof updateNextTodo === 'function') updateNextTodo(); // タイマー復帰時に同期
  });
});

// ===== 要素の取得 =====
const el = {
  time: document.getElementById('time'),
  phase: document.getElementById('phase-label'),
  pomoCount: document.getElementById('pomo-count'),
  tabTimer: document.getElementById('tab-timer'),
  nowClock: document.getElementById('now-clock'),
  ringTotal: document.getElementById('ring-total'),
  ringHour: document.getElementById('ring-hour'),
  ringMin: document.getElementById('ring-min'),
  ringSec: document.getElementById('ring-sec'),
  countdownSetup: document.getElementById('countdown-setup'),
  targetSetup: document.getElementById('target-setup'),
  inHour: document.getElementById('in-hour'),
  inMin: document.getElementById('in-min'),
  inSec: document.getElementById('in-sec'),
  inTarget: document.getElementById('in-target'),
  setBtn: document.getElementById('set-btn'),
  targetBtn: document.getElementById('target-btn'),
  start: document.getElementById('start-btn'),
  pause: document.getElementById('pause-btn'),
  reset: document.getElementById('reset-btn'),
  chimeOn: document.getElementById('chime-on'),
  chimeToggle: document.querySelector('.chime-toggle'),
  nextTodo: document.getElementById('next-todo'),
  overdueTodo: document.getElementById('overdue-todo'),
  todoText: document.getElementById('todo-text'),
  todoTime: document.getElementById('todo-time'),
  todoDate: document.getElementById('todo-date'),
  todoAdd: document.getElementById('todo-add'),
  todoList: document.getElementById('todo-list'),
  todoEmpty: document.getElementById('todo-empty'),
  todoActions: document.getElementById('todo-actions'),
  todoFilter: document.getElementById('todo-filter'),
  todoClearDone: document.getElementById('todo-clear-done'),
  memoInput: document.getElementById('memo-input'),
  memoAdd: document.getElementById('memo-add'),
  memoList: document.getElementById('memo-list'),
  memoEmpty: document.getElementById('memo-empty'),
  memoFilter: document.getElementById('memo-filter'),
  themeToggle: document.getElementById('theme-toggle'),
  gearBtn: document.getElementById('gear-btn'),
  settingsOverlay: document.getElementById('settings-overlay'),
  settingsClose: document.getElementById('settings-close'),
  csvExport: document.getElementById('csv-export'),
  csvImportFile: document.getElementById('csv-import-file'),
  csvFile: document.getElementById('csv-file'),
  csvPaste: document.getElementById('csv-paste'),
  csvImportText: document.getElementById('csv-import-text'),
  dataStatus: document.getElementById('data-status'),
};

// ===== 保存（Electronならstore.json / それ以外はlocalStorage） =====
async function getStore() {
  if (window.api?.getStore) {
    try { return (await window.api.getStore()) || {}; } catch { return {}; }
  }
  try { return JSON.parse(localStorage.getItem('timetodo') || '{}'); } catch { return {}; }
}
async function setStore(data) {
  if (window.api?.setStore) {
    try { return await window.api.setStore(data); } catch { return; }
  }
  try { localStorage.setItem('timetodo', JSON.stringify(data)); } catch {}
}
// 読み書きの競合を避けるため、保存データは1つの共有オブジェクトに集約する
let STORE = {};

// ===== スマホ(Capacitor)向け：OS通知を予約し直す =====
// デスクトップ/ブラウザでは window.Mobile.isNative() が false なので何もしない。
function syncMobile() {
  if (!window.Mobile || !window.Mobile.isNative()) return;
  const items = [];
  const now = Date.now();
  // タスクのアラーム（予定日時。未来のものだけ予約。翌日以降も通知は出す）
  todos.forEach((t, i) => {
    if (t.done) return;
    const dt = taskDateTime(t);
    if (dt && dt > now) {
      items.push({ id: 10000 + i, title: '⏰ タスクの時刻です', body: stripTags(t.text) || t.text, at: dt });
    }
  });
  // 毎正時チャイム（「時刻まで」カウントダウン中のみ・次の24時間分を予約）
  if (el.chimeOn.checked && S.target.running) {
    const base = new Date();
    base.setMinutes(0, 0, 0);
    base.setHours(base.getHours() + 1);
    for (let k = 0; k < 24; k++) {
      const at = base.getTime() + k * 3600000;
      const h = new Date(at).getHours();
      items.push({ id: 20000 + k, title: '⏰ 正時のお知らせ', body: `${String(h).padStart(2, '0')}:00 になりました`, at });
    }
  }
  // 稼働中タイマーの終了
  if (S.countdown.running && S.countdown.endTime) items.push({ id: 30000, title: 'タイマー終了', body: '設定した時間が経過しました', at: S.countdown.endTime });
  if (S.target.running && S.target.endTime) items.push({ id: 30001, title: '指定時刻になりました', body: '設定した時刻です', at: S.target.endTime });
  if (S.pomodoro.running && S.pomodoro.endTime) items.push({ id: 30002, title: 'ポモドーロ', body: 'フェーズが終了しました', at: S.pomodoro.endTime });

  window.Mobile.scheduleAll(items);
}

// ===== 定数 =====
const MAX_MS = 12 * 60 * 60 * 1000;                 // 上限12時間
const DEFAULT_SEC = 5 * 60;                          // 起動時の初期値(5分)。リセットの戻り先
const HOUR_CYCLE = 12 * 60 * 60 * 1000;             // 時リングの1周(12時間)
const MIN_CYCLE = 60 * 60 * 1000;                   // 分リングの1周(1時間)
const SEC_CYCLE = 60 * 1000;                        // 秒リングの1周(1分)

// 各リングの円（半径ごとに円周を算出し stroke-dasharray に設定）
const rings = [
  { node: el.ringTotal, r: 92, cycle: 'total', prev: undefined },
  { node: el.ringHour,  r: 78, cycle: HOUR_CYCLE, prev: undefined },
  { node: el.ringMin,   r: 64, cycle: MIN_CYCLE, prev: undefined },
  { node: el.ringSec,   r: 50, cycle: SEC_CYCLE, prev: undefined },
];
rings.forEach((ring) => {
  ring.c = 2 * Math.PI * ring.r;
  ring.node.style.strokeDasharray = ring.c;
});

// 目盛りの区切り：時/分/秒は固定（時12 / 分60 / 秒60）。総リングは分数ぶんに動的設定。
const NOTCH_GAP = 3; // 区切りの太さ（viewBox単位）
function setNotch(id, r, seg) {
  const node = document.getElementById(id);
  if (!node) return;
  const c = 2 * Math.PI * r;
  const unit = c / seg;
  const gap = Math.min(NOTCH_GAP, unit * 0.4); // 細かすぎる時は区切りを細く
  node.style.strokeDasharray = `${gap} ${unit - gap}`;
}
setNotch('notch-hour', 78, 12);
setNotch('notch-min', 64, 60);
setNotch('notch-sec', 50, 60);

// 総リングの目盛りを「分ごと」に（カウントダウン/ポモドーロ用。分数=セグメント数）
let lastTotalSeg = -1;
function totalMinutes() {
  return Math.max(1, Math.min(180, Math.round(S[mode].durationMs / 60000)));
}
function updateTotalNotch() {
  if (mode === 'target') return; // 総リングは非表示
  const mins = totalMinutes();
  if (mins === lastTotalSeg) return;
  lastTotalSeg = mins;
  setNotch('notch-total', 92, mins);
}

// リングの進捗を設定（割合が増える=単位の境界を跨いだ時はアニメせず瞬時に戻す）
function setRing(ring, ratio) {
  ratio = Math.max(0, Math.min(1, ratio));
  const offset = ring.c * (1 - ratio);
  if (ring.prev !== undefined && ratio > ring.prev + 0.001) {
    ring.node.style.transition = 'none';
    ring.node.style.strokeDashoffset = offset;
    void ring.node.getBoundingClientRect(); // 反映を強制
    ring.node.style.transition = '';
  } else {
    ring.node.style.strokeDashoffset = offset;
  }
  ring.prev = ratio;
}

// ===== ポモドーロの設定（分） =====
const POMO = { work: 25, shortBreak: 5, longBreak: 15, longEvery: 4 };

// ===== 状態（モードごとに独立。切り替えても各タイマーは動き続ける） =====
let mode = 'target';           // 現在表示しているモード（既定は「時刻まで」） 'countdown' | 'pomodoro' | 'target'
const S = {
  countdown: { durationMs: DEFAULT_SEC * 1000, remainingMs: DEFAULT_SEC * 1000, endTime: null, running: false },
  pomodoro:  { durationMs: POMO.work * 60000, remainingMs: POMO.work * 60000, endTime: null, running: false, phase: 'work', completedPomos: 0 },
  target:    { durationMs: 0, remainingMs: 0, endTime: null, running: false, targetTimestamp: null },
};
let ticker = null; // 全モード共通の setInterval ID

function anyRunning() {
  return S.countdown.running || S.pomodoro.running || S.target.running;
}
function ensureTicker() {
  if (!ticker) ticker = setInterval(tickAll, 100);
}

// ===== 現在日時（時刻まで モードで表示、毎秒更新） =====
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
function updateClock() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  el.nowClock.textContent =
    `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}(${WEEK[d.getDay()]}) ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
setInterval(updateClock, 1000);

// ===== 時間の表示（12時間対応：h>0なら HH:MM:SS） =====
function fmt(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ===== 表示の更新（現在表示中のモードを描画） =====
function render() {
  const s = S[mode];
  el.time.textContent = fmt(s.remainingMs);

  // 4重リング：外→内(総/時/分/秒)。内側ほど速く回る
  const R = Math.max(0, s.remainingMs);
  if (mode === 'target') {
    setRing(rings[0], s.durationMs > 0 ? R / s.durationMs : 0);    // 総時間(非表示だが計算)
  } else {
    // カウントダウン/ポモドーロ：総リングは「分ごと」に離散的に減らす（はっきり減る）
    updateTotalNotch();
    const mins = totalMinutes();
    const remMin = Math.ceil(R / 60000);
    setRing(rings[0], Math.min(1, remMin / mins));
  }
  setRing(rings[1], (R % HOUR_CYCLE) / HOUR_CYCLE);               // 時(12hで1周)
  setRing(rings[2], (R % MIN_CYCLE) / MIN_CYCLE);                 // 分(1hで1周)
  setRing(rings[3], (R % SEC_CYCLE) / SEC_CYCLE);                 // 秒(1minで1周)

  el.tabTimer.classList.toggle('no-total', mode === 'target');   // 時刻まで：総リングを隠す
  el.tabTimer.classList.toggle('only-total', mode !== 'target'); // カウントダウン/ポモドーロ：総リングだけ
  el.chimeToggle.style.display = mode === 'target' ? 'flex' : 'none'; // チャイムは時刻まででのみ表示
  el.nowClock.style.display = mode === 'target' ? 'block' : 'none';   // 現在日時は時刻まででのみ表示

  const warn = s.running && s.remainingMs <= 10000;
  el.time.classList.toggle('warning', warn);
  el.ringTotal.classList.toggle('warning', warn);

  if (mode === 'pomodoro') {
    const labels = { work: '🍅 作業', short: '☕ 小休憩', long: '🌴 長休憩' };
    el.phase.textContent = labels[s.phase];
    el.pomoCount.textContent = `完了: ${s.completedPomos} セッション`;
    el.countdownSetup.style.display = 'none';
    el.targetSetup.style.display = 'none';
  } else if (mode === 'target') {
    if (s.targetTimestamp) {
      const t = new Date(s.targetTimestamp);
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      el.phase.textContent = `🎯 ${hh}:${mm} まで`;
    } else {
      el.phase.textContent = '🎯 時刻を設定';
    }
    el.pomoCount.textContent = '';
    el.countdownSetup.style.display = 'none';
    el.targetSetup.style.display = 'block';
  } else {
    el.phase.textContent = '';
    el.pomoCount.textContent = '';
    el.countdownSetup.style.display = 'block';
    el.targetSetup.style.display = 'none';
  }

  el.start.textContent = s.running ? '稼働中…' : (s.remainingMs < s.durationMs ? '再開' : 'スタート');
  el.start.disabled = s.running || s.remainingMs <= 0;
  el.pause.disabled = !s.running;

  updateModeIndicators();
  updateNextTodo();
}

// 稼働中のモードのボタンに印を付ける
function updateModeIndicators() {
  document.querySelectorAll('.mode').forEach((btn) => {
    btn.classList.toggle('is-running', !!S[btn.dataset.mode].running);
  });
}

// ===== ポモドーロ：フェーズの時間をセット =====
function setPomodoroPhase(newPhase) {
  const s = S.pomodoro;
  s.phase = newPhase;
  const mins = newPhase === 'work' ? POMO.work : newPhase === 'short' ? POMO.shortBreak : POMO.longBreak;
  s.durationMs = mins * 60 * 1000;
  s.remainingMs = s.durationMs;
}

// ===== 開始（現在のモード） =====
function start() {
  const s = S[mode];
  if (s.running) return;
  if (mode === 'target' && s.targetTimestamp) {
    // 目標時刻に正確に合わせる（セットからstartまでの経過も反映）
    s.remainingMs = s.targetTimestamp - Date.now();
    if (s.remainingMs <= 0) { applyTarget(false); return; } // 過ぎていたら翌日に再設定
    s.running = true;
    s.endTime = s.targetTimestamp;
  } else {
    if (s.remainingMs <= 0) return;
    s.running = true;
    s.endTime = Date.now() + s.remainingMs;
  }
  ensureTicker();
  render();
  scheduleChime(); // 時刻までの稼働状態が変わったのでチャイムを再判定
  syncMobile();
}

// ===== 全モードを進める（共通ティッカー） =====
function tickAll() {
  const now = Date.now();
  ['countdown', 'pomodoro', 'target'].forEach((m) => {
    const s = S[m];
    if (!s.running) return;
    s.remainingMs = s.endTime - now;
    if (s.remainingMs <= 0) {
      s.remainingMs = 0;
      finishMode(m);
    }
  });
  render();
  if (!anyRunning()) { clearInterval(ticker); ticker = null; } // 全部止まったら停止
}

// ===== 一時停止（現在のモード） =====
function pause() {
  const s = S[mode];
  if (!s.running) return;
  s.running = false;
  s.remainingMs = Math.max(0, s.endTime - Date.now());
  render();
  scheduleChime();
  syncMobile();
}

// ===== リセット（現在のモード） =====
function reset() {
  const s = S[mode];
  s.running = false;
  if (mode === 'pomodoro') {
    s.completedPomos = 0;
    setPomodoroPhase('work');
  } else if (mode === 'target') {
    applyTarget(false); // 目標時刻から残り時間を再計算（保存はしない）
  } else {
    applyPreset(DEFAULT_SEC); // 起動時の初期値(5分)に戻す
  }
  render();
  scheduleChime();
  syncMobile();
}

// ===== 終了処理（指定モード。表示中でなくても通知は出す） =====
function finishMode(m) {
  const s = S[m];
  s.running = false;
  beep();

  if (m === 'pomodoro') {
    if (s.phase === 'work') {
      s.completedPomos++;
      const nextLong = s.completedPomos % POMO.longEvery === 0;
      notify('作業おつかれさま！', nextLong ? '長い休憩をとりましょう 🌴' : '小休憩をどうぞ ☕');
      setPomodoroPhase(nextLong ? 'long' : 'short');
    } else {
      notify('休憩おわり', '次の作業を始めましょう 🍅');
      setPomodoroPhase('work');
    }
    // 次のフェーズを自動開始（稼働継続）
    s.running = true;
    s.endTime = Date.now() + s.remainingMs;
  } else if (m === 'target') {
    notify('指定時刻になりました', '設定した時刻です ⏰');
    scheduleChime(); // 時刻まで終了 → チャイム停止
  } else {
    notify('タイマー終了', '設定した時間が経過しました ⏱');
  }
}

// ===== 通知音（WebAudioで簡単なビープ） =====
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [0, 0.25, 0.5].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch (e) {
    console.warn('音を鳴らせませんでした:', e);
  }
}

// ===== OS通知（メインプロセス経由） =====
function notify(title, body) {
  if (window.api?.notify) window.api.notify(title, body);
}

// ===== 入力：カスタム時間セット（最大12時間。カウントダウン用） =====
function applyCustom() {
  const cs = S.countdown;
  const h = Math.min(12, Math.max(0, parseInt(el.inHour.value) || 0));
  const m = Math.min(59, Math.max(0, parseInt(el.inMin.value) || 0));
  const sec = Math.min(59, Math.max(0, parseInt(el.inSec.value) || 0));
  let ms = ((h * 60 + m) * 60 + sec) * 1000;
  if (ms > MAX_MS) ms = MAX_MS;       // 12時間で頭打ち
  cs.durationMs = ms;
  cs.remainingMs = ms;
  // 補正後の値を入力欄に反映
  const capped = ms / 1000;
  el.inHour.value = Math.floor(capped / 3600);
  el.inMin.value = Math.floor((capped % 3600) / 60);
  el.inSec.value = Math.floor(capped % 60);
  render();
}

// ===== 時刻指定：目標時刻から残り時間を算出（save=trueで次回用に保存） =====
function applyTarget(save = true) {
  const s = S.target;
  const v = el.inTarget.value; // "HH:MM"
  if (!v) { s.targetTimestamp = null; render(); return; }
  const [h, m] = v.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target.getTime() <= Date.now()) {
    target.setDate(target.getDate() + 1); // 過ぎていれば翌日
  }
  s.targetTimestamp = target.getTime();
  s.remainingMs = s.targetTimestamp - Date.now();
  s.durationMs = s.remainingMs; // 総リングの基準（設定時点〜目標時刻）
  if (save) saveTargetTime(v); // 次回の初期値として保存
  render();
}

// 目標時刻(HH:MM)を保存（次回起動時の初期値に使う）
async function saveTargetTime(v) {
  try {
    STORE.lastTargetTime = v;
    await setStore(STORE);
    syncMobile();
  } catch (e) {
    console.warn('目標時刻の保存に失敗:', e);
  }
}

// ===== プリセット（秒数指定） =====
function applyPreset(sec) {
  const capped = Math.min(sec, MAX_MS / 1000);
  el.inHour.value = Math.floor(capped / 3600);
  el.inMin.value = Math.floor((capped % 3600) / 60);
  el.inSec.value = Math.floor(capped % 60);
  applyCustom();
}

// ===== イベント登録 =====
el.start.addEventListener('click', start);
el.pause.addEventListener('click', pause);
el.reset.addEventListener('click', reset);
el.setBtn.addEventListener('click', () => { if (!S.countdown.running) applyCustom(); });
// 時/分/秒を変えたら「セット」を押さなくても自動反映
[el.inHour, el.inMin, el.inSec].forEach((input) => {
  input.addEventListener('change', () => { if (!S.countdown.running) applyCustom(); });
});
el.targetBtn.addEventListener('click', () => { if (!S.target.running) applyTarget(true); });
el.inTarget.addEventListener('change', () => { if (!S.target.running) applyTarget(true); });

document.querySelectorAll('.preset').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (S.countdown.running) return;
    applyPreset(parseInt(btn.dataset.sec));
  });
});

// モード切替は「表示の切り替え」だけ。各モードのタイマーは止めない（同時稼働）
document.querySelectorAll('.mode').forEach((btn) => {
  btn.addEventListener('click', () => {
    mode = btn.dataset.mode;
    document.querySelectorAll('.mode').forEach((m) => m.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

// スペースキーで現在モードのスタート/一時停止
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.getElementById('tab-timer').classList.contains('active')) {
    e.preventDefault();
    S[mode].running ? pause() : start();
  }
});

// ============================================================
//  毎正時チャイム（XX:00 に鳴らす、繰り返し）
// ============================================================
let chimeTimer = null;

// 次の正時(XX:00:00)までのミリ秒
function msToNextHour() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  return next.getTime() - now.getTime();
}

// チャイムが有効か：チェックON かつ「時刻まで」がカウントダウン中のときだけ
function chimeActive() {
  return el.chimeOn.checked && S.target.running;
}

// 次の正時に鳴らす予約（activeな間だけ連鎖。停止条件になったら止まる）
function scheduleChime() {
  clearTimeout(chimeTimer);
  chimeTimer = null;
  if (!chimeActive()) return;
  chimeTimer = setTimeout(() => {
    beep();
    const h = new Date().getHours();
    notify('⏰ 正時のお知らせ', `${String(h).padStart(2, '0')}:00 になりました`);
    scheduleChime(); // activeなら次の正時も予約
  }, msToNextHour());
}

// チャイムのON/OFF（save=false のときは保存しない＝復元時など）
function setChime(enabled, save = true) {
  el.chimeOn.checked = enabled;
  scheduleChime(); // activeかどうかで開始/停止を判定
  if (save) saveChime(enabled);
}

async function saveChime(enabled) {
  try {
    STORE.chimeEnabled = enabled;
    await setStore(STORE);
    syncMobile();
  } catch (e) {
    console.warn('チャイム設定の保存に失敗:', e);
  }
}

el.chimeOn.addEventListener('change', () => setChime(el.chimeOn.checked));

// ============================================================
//  To-Do
// ============================================================
let todos = []; // { id, text, done, date, time, firedOn, tags:[] }
let dragId = null; // ドラッグ中のタスクID
let todoTagFilter = null; // 選択中の絞り込みタグ（null=すべて）

// 空の日付/時刻入力に例示を出すため、値の有無で is-empty を切り替える
function refreshPh(input) {
  if (input) input.classList.toggle('is-empty', !input.value);
}

// 今日の日付(YYYY-MM-DD)
function todayYMD() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// タスクの予定日時(ms)。date未指定は今日扱い。timeが無ければnull
function taskDateTime(t) {
  if (!t.time) return null;
  const [h, m] = t.time.split(':').map(Number);
  if (t.date) {
    const [Y, Mo, D] = t.date.split('-').map(Number);
    return new Date(Y, Mo - 1, D, h, m, 0, 0).getTime();
  }
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}
// 指定msが「今日」か
function isTodayMs(ms) {
  const a = new Date(ms);
  const b = new Date();
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// 保存データからタスクを読み込む
async function loadTodos() {
  try {
    STORE = await getStore();
  } catch (e) {
    console.warn('保存データの読み込みに失敗:', e);
  }
  const store = STORE;
  todos = Array.isArray(store.todos) ? store.todos : [];
  // 旧データにタグが無ければ本文から復元
  todos.forEach((t) => { if (!Array.isArray(t.tags)) t.tags = parseTags(t.text || ''); });
  renderTodos();
  setChime(!!store.chimeEnabled, false); // チャイム設定を復元（保存はしない）
  if (store.lastTargetTime) {
    el.inTarget.value = store.lastTargetTime; // 前回の目標時刻を初期値に
    if (!S.target.running) applyTarget(false); // 状態へ反映（保存はしない）
  }
  // メモ（一言ログ）を復元。旧形式(store.memo=文字列)は1件に変換
  if (Array.isArray(store.memos)) {
    memos = store.memos;
  } else if (typeof store.memo === 'string' && store.memo.trim()) {
    memos = [{ id: Date.now() + '-migr', text: store.memo, at: Date.now() }];
    saveMemos();
  } else {
    memos = [];
  }
  // 旧データにタグが無ければ本文から復元
  memos.forEach((m) => { if (!Array.isArray(m.tags)) m.tags = parseTags(m.text || ''); });
  renderMemos();

  applyTheme(store.theme || 'light'); // テーマを復元（既定はライト）
  syncMobile(); // スマホ：復元後に通知を予約
}

// タスクを保存（他の保存データは保持したまま todos だけ更新）
async function saveTodos() {
  try {
    STORE.todos = todos;
    await setStore(STORE);
    syncMobile();
  } catch (e) {
    console.warn('タスクの保存に失敗:', e);
  }
}

// タスクに含まれる全タグ（出現順・重複除去）
function allTodoTags() {
  const out = [];
  todos.forEach((t) => (t.tags || []).forEach((tg) => { if (!out.includes(tg)) out.push(tg); }));
  return out;
}

// 絞り込みバー（タグが1つ以上あるときだけ表示）
function renderTodoFilter() {
  const tags = allTodoTags();
  el.todoFilter.innerHTML = '';
  if (!tags.length) { el.todoFilter.style.display = 'none'; todoTagFilter = null; return; }
  if (todoTagFilter && !tags.includes(todoTagFilter)) todoTagFilter = null; // 消えたタグを解除
  el.todoFilter.style.display = 'flex';
  const mkChip = (label, tag) => {
    const b = document.createElement('button');
    b.className = 'tag-chip' + (todoTagFilter === tag ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => { todoTagFilter = tag; renderTodos(); });
    return b;
  };
  el.todoFilter.appendChild(mkChip('すべて', null));
  tags.forEach((tg) => el.todoFilter.appendChild(mkChip('#' + tg, tg)));
}

function renderTodos() {
  el.todoList.innerHTML = '';
  el.todoEmpty.style.display = todos.length ? 'none' : 'block';
  // 完了タスクがあるときだけ「完了したタスクを削除」を表示
  el.todoActions.style.display = todos.some((t) => t.done) ? 'flex' : 'none';
  updateNextTodo(); // タイマー画面の「次の予定」も同期
  renderTodoFilter();

  // 表示は「未完了→完了」の順（並び順自体は保持。JSのsortは安定なのでグループ内順序は不変）
  let ordered = [...todos].sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
  if (todoTagFilter) ordered = ordered.filter((t) => (t.tags || []).includes(todoTagFilter));
  if (todos.length) {
    el.todoEmpty.style.display = ordered.length ? 'none' : 'block';
    el.todoEmpty.textContent = todoTagFilter ? `#${todoTagFilter} のタスクはありません` : 'タスクはまだありません';
  } else {
    el.todoEmpty.textContent = 'タスクはまだありません';
  }
  ordered.forEach((t) => {
    const li = document.createElement('li');
    li.className = 'todo-item' + (t.done ? ' done' : '');
    li.draggable = true;
    li.dataset.id = t.id;

    const handle = document.createElement('span');
    handle.className = 'todo-handle';
    handle.textContent = '⠿';
    handle.title = 'ドラッグで並べ替え';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = t.done;
    cb.addEventListener('change', () => toggleTodo(t.id));

    // 本文（クリックで編集）＋ 日付/時刻
    const body = document.createElement('div');
    body.className = 'm-body';

    const span = document.createElement('span');
    span.className = 'txt';
    span.textContent = stripTags(t.text) || t.text; // #タグは除いて表示（本文が空ならそのまま）
    span.title = 'クリックで編集';
    span.addEventListener('click', () => startEditText(li, span, t));

    // タグのチップ（クリックで絞り込み）
    let tagWrap = null;
    const tags = t.tags || [];
    if (tags.length) {
      tagWrap = document.createElement('div');
      tagWrap.className = 'm-tags';
      tags.forEach((tg) => {
        const chip = document.createElement('button');
        chip.className = 'tag-chip mini' + (todoTagFilter === tg ? ' active' : '');
        chip.textContent = '#' + tg;
        chip.title = `#${tg} で絞り込み`;
        chip.addEventListener('click', () => { todoTagFilter = tg; renderTodos(); });
        tagWrap.appendChild(chip);
      });
    }

    const when = document.createElement('div');
    when.className = 'todo-when';

    const date = document.createElement('input');
    date.type = 'date';
    date.className = 'todo-date td-ph';
    date.dataset.ph = 'yyyy/mm/dd';
    date.value = t.date || '';
    date.title = '日付（空欄で今日）';
    refreshPh(date);
    date.addEventListener('change', () => {
      t.date = date.value;
      t.firedOn = '';
      refreshPh(date);
      saveTodos();
    });

    // アラーム時刻（任意）。変更・クリア可能
    const time = document.createElement('input');
    time.type = 'time';
    time.step = 60;
    time.className = 'todo-time td-ph';
    time.dataset.ph = 'HH:MM';
    time.value = t.time || '';
    time.title = 'アラーム時刻（空欄でアラームなし）';
    refreshPh(time);
    time.addEventListener('change', () => {
      t.time = time.value;
      t.firedOn = ''; // 時刻変更時はアラームを再アーム
      refreshPh(time);
      saveTodos();
    });

    when.append(date, time);
    if (tagWrap) body.append(span, tagWrap, when);
    else body.append(span, when);

    const del = document.createElement('button');
    del.className = 'todo-del';
    del.textContent = '✕';
    del.title = '削除';
    del.addEventListener('click', () => deleteTodo(t.id));

    // --- ドラッグ＆ドロップで並べ替え ---
    li.addEventListener('dragstart', (e) => {
      dragId = t.id;
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => {
      dragId = null;
      clearDropMarks();
      li.classList.remove('dragging');
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dragId === null || dragId === t.id) return;
      e.dataTransfer.dropEffect = 'move';
      const rect = li.getBoundingClientRect();
      const after = e.clientY - rect.top > rect.height / 2;
      li.classList.toggle('over-bottom', after);
      li.classList.toggle('over-top', !after);
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('over-top', 'over-bottom');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const rect = li.getBoundingClientRect();
      const after = e.clientY - rect.top > rect.height / 2;
      moveTodo(dragId, t.id, after);
    });

    li.append(handle, cb, body, del);
    el.todoList.appendChild(li);
  });
}

// 本文をその場で編集（クリック→入力欄）。編集中はドラッグ無効
function startEditText(li, span, t) {
  if (span.dataset.editing) return;
  span.dataset.editing = '1';
  li.draggable = false;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-input';
  input.maxLength = 200;
  input.value = t.text; // #タグを含む生テキストを編集
  const commit = () => {
    const v = input.value.trim();
    if (v) { t.text = v; t.tags = parseTags(v); } // 空なら変更しない
    renderTodos();
    saveTodos();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { input.value = t.text; input.blur(); }
  });
  input.addEventListener('blur', commit);
  span.replaceWith(input);
  input.focus();
  input.select();
}

function clearDropMarks() {
  el.todoList.querySelectorAll('.over-top, .over-bottom')
    .forEach((n) => n.classList.remove('over-top', 'over-bottom'));
}

// fromId を toId の前(after=false)/後(after=true)へ移動
function moveTodo(fromId, toId, after) {
  if (fromId == null || fromId === toId) return;
  const from = todos.findIndex((t) => t.id === fromId);
  if (from < 0) return;
  const [item] = todos.splice(from, 1);
  let to = todos.findIndex((t) => t.id === toId);
  if (to < 0) { todos.splice(from, 0, item); return; } // 念のため復元
  todos.splice(after ? to + 1 : to, 0, item);
  renderTodos();
  saveTodos();
}

// 未完了を予定の早い順に並べ替え（時刻なしは後ろ、完了は末尾）
function sortTodosByTime() {
  todos.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1; // 完了は後ろ
    const da = taskDateTime(a);
    const db = taskDateTime(b);
    if (da == null && db == null) return 0;
    if (da == null) return 1;   // 時刻なしは後ろ
    if (db == null) return -1;
    return da - db;             // 早い順
  });
}

function addTodo() {
  let text = el.todoText.value.trim();
  if (!text) return;
  // タグで絞り込み中なら、そのタグを自動で付与（まだ付いていないときだけ）
  if (todoTagFilter && !parseTags(text).includes(todoTagFilter)) {
    text += ' #' + todoTagFilter;
  }
  todos.push({
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    text,
    done: false,
    date: el.todoDate.value || '', // 空欄なら今日扱い
    time: el.todoTime.value || '', // 空欄ならアラームなし
    firedOn: '',
    tags: parseTags(text),
  });
  el.todoText.value = '';
  el.todoDate.value = todayYMD(); // 追加後も日付は今日を既定に
  el.todoTime.value = '';
  refreshPh(el.todoDate);
  refreshPh(el.todoTime);
  sortTodosByTime(); // 未完了を早い順に並べ替え
  renderTodos();
  saveTodos();
}

// ===== タスクのアラーム（予定日時に達したら発火） =====
function checkAlarms() {
  const now = Date.now();
  let changed = false;
  todos.forEach((t) => {
    if (t.done) return;
    const dt = taskDateTime(t);
    // 予定時刻を過ぎた直後(1分以内)に一度だけ発火。firedOnで再発火防止
    if (dt && now >= dt && now < dt + 60000 && t.firedOn !== dt) {
      beep();
      notify('⏰ タスクの時刻です', stripTags(t.text) || t.text);
      t.firedOn = dt;
      changed = true;
    }
  });
  if (changed) saveTodos();
  updateNextTodo(); // 時間経過で「次の予定」を更新
}

setInterval(checkAlarms, 15000); // 15秒ごとに確認（その分内に発火）

// 「次の予定」表示を押したら To-Do タブへ移動（予定が無くても飛ぶ）。該当タスクは一瞬強調
function jumpToTodo(id) {
  document.querySelector('.tab[data-tab="todo"]').click();
  if (!id) return; // タスクが無いときはタブ移動のみ
  const li = el.todoList.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (li) {
    li.scrollIntoView({ block: 'nearest' });
    li.classList.add('flash');
    setTimeout(() => li.classList.remove('flash'), 1200);
  }
}
el.nextTodo.addEventListener('click', () => jumpToTodo(el.nextTodo.dataset.todoId));
el.overdueTodo.addEventListener('click', () => jumpToTodo(el.overdueTodo.dataset.todoId));

// 「次の予定」に出すタスク：今日・未完了で、これから来るもののうち最も近いもの
// （翌日以降は翌日になるまで出さない／過ぎたものは「未完了のタスク」ブロックへ回す）
function nextAlarmTodo() {
  const now = Date.now();
  let best = null;
  let bestDelta = Infinity;
  todos.forEach((t) => {
    if (t.done) return;
    const dt = taskDateTime(t);
    if (!dt || !isTodayMs(dt)) return;      // 今日のみ（翌日以降は非表示）
    if (dt < now) return;                    // 過ぎたものは次の予定にしない
    const delta = dt - now;                  // これから来るもののうち最も近いもの
    if (delta < bestDelta) { bestDelta = delta; best = t; }
  });
  return best;
}

// 「時刻まで」モードのときだけ、次の予定タスクを下部に表示
function updateNextTodo() {
  if (mode !== 'target') { el.nextTodo.style.display = 'none'; el.overdueTodo.style.display = 'none'; return; }
  el.nextTodo.style.display = 'flex';
  const t = nextAlarmTodo();
  el.nextTodo.textContent = '';
  el.nextTodo.classList.add('clickable'); // 空でも押すとTo-Doタブへ
  if (!t) {
    delete el.nextTodo.dataset.todoId;
    const empty = document.createElement('span');
    empty.className = 'nt-empty';
    empty.textContent = '予定のタスクはありません';
    el.nextTodo.appendChild(empty);
  } else {
    el.nextTodo.dataset.todoId = t.id;
    const label = document.createElement('span');
    label.className = 'nt-label';
    label.textContent = '次の予定';
    const time = document.createElement('span');
    time.className = 'nt-time';
    time.textContent = '⏰ ' + t.time;
    const txt = document.createElement('span');
    txt.className = 'nt-text';
    txt.textContent = stripTags(t.text) || t.text; // #タグは除いて表示
    el.nextTodo.append(label, time, txt);
  }

  // 予定超過した未完了タスク（次の予定に出ているものは除く）を1件表示
  updateOverdueTodo(t ? t.id : null);
}

// 予定時刻を過ぎた未完了タスクのうち、最も過ぎているものを1件返す（excludeId は除外）
function firstOverdueTodo(excludeId) {
  const now = Date.now();
  return todos
    .filter((t) => {
      if (t.done || t.id === excludeId) return false;
      const dt = taskDateTime(t);
      return dt && isTodayMs(dt) && dt < now;
    })
    .sort((a, b) => taskDateTime(a) - taskDateTime(b))[0] || null;
}

// 予定超過ブロック（2行・クリックで該当タスクへ）を更新
function updateOverdueTodo(excludeId) {
  const t = firstOverdueTodo(excludeId);
  if (!t) { el.overdueTodo.style.display = 'none'; delete el.overdueTodo.dataset.todoId; return; }
  el.overdueTodo.style.display = 'flex';
  el.overdueTodo.classList.add('clickable');
  el.overdueTodo.dataset.todoId = t.id;
  el.overdueTodo.textContent = '';
  const label = document.createElement('span');
  label.className = 'nt-label nt-overdue-label';
  label.textContent = '⚠ 未完了のタスク';
  const line2 = document.createElement('span');
  line2.className = 'nt-line2';
  const time = document.createElement('span');
  time.className = 'nt-time';
  time.textContent = '⏰ ' + t.time;
  const txt = document.createElement('span');
  txt.className = 'nt-text';
  txt.textContent = stripTags(t.text) || t.text;
  line2.append(time, txt);
  el.overdueTodo.append(label, line2);
}

function toggleTodo(id) {
  const t = todos.find((x) => x.id === id);
  if (t) {
    t.done = !t.done;
    renderTodos();
    saveTodos();
  }
}

function deleteTodo(id) {
  todos = todos.filter((x) => x.id !== id);
  renderTodos();
  saveTodos();
}

// 完了済みのタスクをまとめて削除
function clearCompleted() {
  todos = todos.filter((t) => !t.done);
  renderTodos();
  saveTodos();
}

el.todoAdd.addEventListener('click', addTodo);
el.todoClearDone.addEventListener('click', clearCompleted);
el.todoText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTodo();
});
// 追加欄の日付/時刻：日付の初期値は今日。例示(プレースホルダ)の初期表示と更新
el.todoDate.value = todayYMD();
refreshPh(el.todoDate);
refreshPh(el.todoTime);
el.todoDate.addEventListener('input', () => refreshPh(el.todoDate));
el.todoTime.addEventListener('input', () => refreshPh(el.todoTime));

// ============================================================
//  メモ（一言を入力するとリストに残る）
// ============================================================
let memos = []; // { id, text, at, tags:[] }
let memoTagFilter = null; // 選択中の絞り込みタグ（null=すべて）

// テキストから #タグ を抽出（重複除去・#は付けない）
function parseTags(text) {
  const out = [];
  const re = /#([^\s#、,]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = m[1];
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}
// 表示用に #タグ を除いた本文（チップで別に見せるため）
function stripTags(text) {
  return text.replace(/#[^\s#、,]+/g, '').replace(/\s{2,}/g, ' ').trim();
}

async function saveMemos() {
  try {
    STORE.memos = memos;
    await setStore(STORE);
  } catch (e) {
    console.warn('メモの保存に失敗:', e);
  }
}

// 日時の短い表示（例: 9/15 14:23）
function fmtMemoTime(ms) {
  const d = new Date(ms);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

// メモに含まれる全タグ（出現順・重複除去）
function allMemoTags() {
  const out = [];
  memos.forEach((m) => (m.tags || []).forEach((t) => { if (!out.includes(t)) out.push(t); }));
  return out;
}

// 絞り込みバー（タグが1つ以上あるときだけ表示）
function renderMemoFilter() {
  const tags = allMemoTags();
  el.memoFilter.innerHTML = '';
  if (!tags.length) { el.memoFilter.style.display = 'none'; memoTagFilter = null; return; }
  if (memoTagFilter && !tags.includes(memoTagFilter)) memoTagFilter = null; // 消えたタグを解除
  el.memoFilter.style.display = 'flex';

  const mkChip = (label, tag) => {
    const b = document.createElement('button');
    b.className = 'tag-chip' + (memoTagFilter === tag ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => { memoTagFilter = tag; renderMemos(); });
    return b;
  };
  el.memoFilter.appendChild(mkChip('すべて', null));
  tags.forEach((t) => el.memoFilter.appendChild(mkChip('#' + t, t)));
}

function renderMemos() {
  renderMemoFilter();
  el.memoList.innerHTML = '';
  const list = memoTagFilter
    ? memos.filter((m) => (m.tags || []).includes(memoTagFilter))
    : memos;
  el.memoEmpty.style.display = list.length ? 'none' : 'block';
  el.memoEmpty.textContent = memoTagFilter
    ? `#${memoTagFilter} のメモはありません`
    : 'メモはまだありません';

  list.forEach((m) => {
    const li = document.createElement('li');
    li.className = 'memo-item';

    const body = document.createElement('div');
    body.className = 'm-body';

    const shown = stripTags(m.text);
    const text = document.createElement('div');
    text.className = 'm-text' + (shown ? '' : ' is-empty');
    text.textContent = shown; // ユーザー入力は textContent で安全に（空ならCSSで案内表示）
    text.title = 'クリックで編集';
    text.addEventListener('click', () => startEditMemo(li, text, m));
    body.appendChild(text);

    const tags = m.tags || [];
    if (tags.length) {
      const tagWrap = document.createElement('div');
      tagWrap.className = 'm-tags';
      tags.forEach((t) => {
        const chip = document.createElement('button');
        chip.className = 'tag-chip mini' + (memoTagFilter === t ? ' active' : '');
        chip.textContent = '#' + t;
        chip.title = `#${t} で絞り込み`;
        chip.addEventListener('click', () => { memoTagFilter = t; renderMemos(); });
        tagWrap.appendChild(chip);
      });
      body.appendChild(tagWrap);
    }

    const time = document.createElement('span');
    time.className = 'm-time';
    time.textContent = m.at ? fmtMemoTime(m.at) : '';
    body.appendChild(time);

    const del = document.createElement('button');
    del.className = 'memo-del';
    del.textContent = '✕';
    del.title = '削除';
    del.addEventListener('click', () => deleteMemo(m.id));

    li.append(body, del);
    el.memoList.appendChild(li);
  });
}

function addMemo() {
  let text = el.memoInput.value.trim();
  if (!text) return;
  // タグで絞り込み中なら、そのタグを自動で付与（まだ付いていないときだけ）
  if (memoTagFilter && !parseTags(text).includes(memoTagFilter)) {
    text += ' #' + memoTagFilter;
  }
  memos.unshift({ // 新しいものを上に
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    text,
    at: Date.now(),
    tags: parseTags(text),
  });
  el.memoInput.value = '';
  renderMemos();
  saveMemos();
}

function deleteMemo(id) {
  memos = memos.filter((m) => m.id !== id);
  renderMemos();
  saveMemos();
}

// メモ本文のインライン編集（#タグ を含む生テキストを編集し、確定時にタグを取り直す）
function startEditMemo(li, span, m) {
  if (span.dataset.editing) return;
  span.dataset.editing = '1';
  const input = document.createElement('textarea');
  input.className = 'edit-input';
  input.rows = 1;
  input.maxLength = 1000;
  input.value = m.text;
  const commit = () => {
    const v = input.value.trim();
    if (v) { m.text = v; m.tags = parseTags(v); } // 空なら変更しない
    renderMemos();
    saveMemos();
  };
  input.addEventListener('keydown', (e) => {
    // Shift+Enter で確定、Enter は改行、Esc で取り消し
    if (e.key === 'Enter' && e.shiftKey && !e.isComposing) { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { input.value = m.text; input.blur(); }
  });
  input.addEventListener('input', () => autoGrow(input));
  input.addEventListener('blur', commit);
  span.replaceWith(input);
  autoGrow(input);
  input.focus();
  input.select();
}

el.memoAdd.addEventListener('click', addMemo);
el.memoInput.addEventListener('keydown', (e) => {
  // Shift+Enter で追加、Enter は改行（IME変換確定中は無視）
  if (e.key === 'Enter' && e.shiftKey && !e.isComposing) {
    e.preventDefault();
    addMemo();
    autoGrow(el.memoInput);
  }
});
el.memoInput.addEventListener('input', () => autoGrow(el.memoInput));

// textarea を内容に合わせて自動で高さ調整
function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
}

// ============================================================
//  データ（CSV 書き出し / 読み込み）
// ============================================================
function csvEscape(v) {
  v = String(v == null ? '' : v);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function buildCSV() {
  const rows = [['type', 'text', 'done', 'date', 'time', 'at']];
  todos.forEach((t) => rows.push(['todo', t.text, t.done ? 'true' : 'false', t.date || '', t.time || '', '']));
  memos.forEach((m) => rows.push(['memo', m.text, '', '', '', m.at || '']));
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}
// CSVテキストを2次元配列に（引用符・改行対応）
function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function dataStatus(msg) {
  if (el.dataStatus) el.dataStatus.textContent = msg;
}

// CSVファイル名（例: time-todo_20260918-1345.csv）
function csvFileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `time-todo_${stamp}.csv`;
}

async function exportCSVFile() {
  const csv = buildCSV();
  const fname = csvFileName();
  // Android（Capacitor）は共有シートで書き出す（ブラウザのダウンロードが効かないため）
  if (window.Mobile && window.Mobile.isNative && window.Mobile.isNative() && window.Mobile.exportCSV) {
    try {
      await window.Mobile.exportCSV(csv, fname);
      dataStatus('共有メニューから保存/送信できます（Drive・ファイルなど）');
    } catch (e) {
      // 共有を閉じただけの場合も例外になることがある
      const msg = e && e.message ? e.message : '';
      dataStatus(/cancel/i.test(msg) ? '共有をキャンセルしました' : '共有に失敗しました');
    }
    return;
  }
  // デスクトップ / ブラウザは通常のダウンロード
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    dataStatus('CSVを書き出しました（ダウンロードフォルダ）');
  } catch (e) {
    dataStatus('書き出しに失敗しました');
  }
}
// CSVテキストを取り込み、現在のTo-Do/メモを置き換える
function importCSVText(text) {
  if (!text || !text.trim()) { dataStatus('CSVが空です'); return; }
  const rows = parseCSV(text);
  if (!rows.length) { dataStatus('読み込めるデータがありません'); return; }
  const head = rows[0].map((s) => s.trim().toLowerCase());
  const hasHeader = head[0] === 'type';
  const idx = hasHeader
    ? { type: head.indexOf('type'), text: head.indexOf('text'), done: head.indexOf('done'), date: head.indexOf('date'), time: head.indexOf('time'), at: head.indexOf('at') }
    : { type: 0, text: 1, done: 2, date: 3, time: 4, at: 5 };
  const nt = [], nm = [];
  const uid = () => Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  for (let r = hasHeader ? 1 : 0; r < rows.length; r++) {
    const cols = rows[r];
    if (!cols.length || cols.every((c) => c === '')) continue;
    const type = (cols[idx.type] || '').trim().toLowerCase();
    const txt = cols[idx.text] || '';
    if (type === 'memo') {
      nm.push({ id: uid(), text: txt, at: parseInt(cols[idx.at]) || Date.now(), tags: parseTags(txt) });
    } else {
      nt.push({ id: uid(), text: txt, done: (cols[idx.done] || '').trim().toLowerCase() === 'true', date: cols[idx.date] || '', time: cols[idx.time] || '', firedOn: '', tags: parseTags(txt) });
    }
  }
  if (!nt.length && !nm.length) { dataStatus('有効な行がありませんでした'); return; }
  if (!confirm(`読み込むと現在の内容を置き換えます。\nTo-Do ${nt.length}件・メモ ${nm.length}件を読み込みますか？`)) {
    dataStatus('読み込みを中止しました');
    return;
  }
  todos = nt;
  memos = nm;
  sortTodosByTime();
  renderTodos();
  renderMemos();
  saveTodos();
  saveMemos();
  syncMobile();
  dataStatus(`読み込み完了：To-Do ${nt.length}件・メモ ${nm.length}件`);
}

// 歯車メニュー（設定・データ）の開閉
function openSettings() { el.settingsOverlay.hidden = false; }
function closeSettings() { el.settingsOverlay.hidden = true; dataStatus(''); }
el.gearBtn.addEventListener('click', openSettings);
el.settingsClose.addEventListener('click', closeSettings);
el.settingsOverlay.addEventListener('click', (e) => {
  if (e.target === el.settingsOverlay) closeSettings(); // 背景クリックで閉じる
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el.settingsOverlay.hidden) closeSettings();
});

el.csvExport.addEventListener('click', exportCSVFile);
el.csvImportFile.addEventListener('click', () => el.csvFile.click());
el.csvFile.addEventListener('change', () => {
  const f = el.csvFile.files && el.csvFile.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => importCSVText(String(rd.result || ''));
  rd.onerror = () => dataStatus('ファイルの読み込みに失敗しました');
  rd.readAsText(f);
  el.csvFile.value = '';
});
el.csvImportText.addEventListener('click', () => importCSVText(el.csvPaste.value));

// ============================================================
//  テーマ（ダーク / ライト）
// ============================================================
let theme = 'light';

function applyTheme(t) {
  theme = t === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light', theme === 'light');
  // ボタンは「切り替え先」を表示（ダーク中は太陽、ライト中は月）
  el.themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
}

async function saveTheme() {
  try {
    STORE.theme = theme;
    await setStore(STORE);
  } catch (e) {
    console.warn('テーマの保存に失敗:', e);
  }
}

el.themeToggle.addEventListener('click', () => {
  applyTheme(theme === 'light' ? 'dark' : 'light');
  saveTheme();
});

// ===== 初期表示 =====
// 時刻指定の初期値：現在時刻の1時間後（分単位）
(function initTargetDefault() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  el.inTarget.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
})();
applyPreset(DEFAULT_SEC); // カウントダウンの初期値(5分)
setPomodoroPhase('work');  // ポモドーロの初期状態
applyTarget(false);        // 時刻まで の初期状態（保存はしない）
updateClock();             // 現在日時の初期表示
render();
loadTodos();

// スマホ(Capacitor)：通知許可の取得と、復帰時の再スケジュール
if (window.Mobile && window.Mobile.isNative()) {
  window.Mobile.requestPermission();
  window.Mobile.onResume(() => { checkAlarms(); syncMobile(); });
}
