// ===== タブ切り替え =====
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ===== 要素の取得 =====
const el = {
  time: document.getElementById('time'),
  phase: document.getElementById('phase-label'),
  pomoCount: document.getElementById('pomo-count'),
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
};

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

// ===== 状態 =====
let mode = 'countdown';        // 'countdown' | 'pomodoro' | 'target'
let targetTimestamp = null;    // 時刻指定モードの目標時刻(タイムスタンプ)
let phase = 'work';            // ポモドーロ用: 'work' | 'short' | 'long'
let completedPomos = 0;        // 完了した作業セッション数
let durationMs = 5 * 60 * 1000; // 現在のフェーズの総時間
let remainingMs = durationMs;   // 残り時間
let endTime = null;             // 稼働中の終了時刻(タイムスタンプ)
let ticker = null;              // setInterval のID
let running = false;

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

// ===== 表示の更新 =====
function render() {
  el.time.textContent = fmt(remainingMs);

  // 4重リング：外→内(総/時/分/秒)。内側ほど速く回る
  const R = Math.max(0, remainingMs);
  setRing(rings[0], durationMs > 0 ? R / durationMs : 0);          // 総時間
  setRing(rings[1], (R % HOUR_CYCLE) / HOUR_CYCLE);               // 時(12hで1周)
  setRing(rings[2], (R % MIN_CYCLE) / MIN_CYCLE);                 // 分(1hで1周)
  setRing(rings[3], (R % SEC_CYCLE) / SEC_CYCLE);                 // 秒(1minで1周)

  const warn = running && remainingMs <= 10000;
  el.time.classList.toggle('warning', warn);
  el.ringTotal.classList.toggle('warning', warn);

  if (mode === 'pomodoro') {
    const labels = { work: '🍅 作業', short: '☕ 小休憩', long: '🌴 長休憩' };
    el.phase.textContent = labels[phase];
    el.pomoCount.textContent = `完了: ${completedPomos} セッション`;
    el.countdownSetup.style.display = 'none';
    el.targetSetup.style.display = 'none';
  } else if (mode === 'target') {
    if (targetTimestamp) {
      const t = new Date(targetTimestamp);
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

  el.start.textContent = running ? '稼働中…' : (remainingMs < durationMs ? '再開' : 'スタート');
  el.start.disabled = running || remainingMs <= 0;
  el.pause.disabled = !running;
}

// ===== ポモドーロ：フェーズの時間をセット =====
function setPomodoroPhase(newPhase) {
  phase = newPhase;
  const mins = phase === 'work' ? POMO.work : phase === 'short' ? POMO.shortBreak : POMO.longBreak;
  durationMs = mins * 60 * 1000;
  remainingMs = durationMs;
}

// ===== 開始 =====
function start() {
  if (running) return;
  if (mode === 'target' && targetTimestamp) {
    // 目標時刻に正確に合わせる（セットからstartまでの経過も反映）
    remainingMs = targetTimestamp - Date.now();
    if (remainingMs <= 0) { applyTarget(); return; } // 過ぎていたら翌日に再設定
    running = true;
    endTime = targetTimestamp;
  } else {
    if (remainingMs <= 0) return;
    running = true;
    endTime = Date.now() + remainingMs;
  }
  ticker = setInterval(tick, 100);
  render();
}

// ===== 毎フレーム =====
function tick() {
  remainingMs = endTime - Date.now();
  if (remainingMs <= 0) {
    remainingMs = 0;
    finish();
  }
  render();
}

// ===== 一時停止 =====
function pause() {
  if (!running) return;
  clearInterval(ticker);
  running = false;
  remainingMs = Math.max(0, endTime - Date.now());
  render();
}

// ===== リセット =====
function reset() {
  clearInterval(ticker);
  running = false;
  if (mode === 'pomodoro') {
    completedPomos = 0;
    setPomodoroPhase('work');
  } else if (mode === 'target') {
    applyTarget(); // 目標時刻から残り時間を再計算
  } else {
    applyPreset(DEFAULT_SEC); // 起動時の初期値(5分)に戻す
  }
  render();
}

// ===== 終了処理 =====
function finish() {
  clearInterval(ticker);
  running = false;
  beep();

  if (mode === 'pomodoro') {
    if (phase === 'work') {
      completedPomos++;
      const nextLong = completedPomos % POMO.longEvery === 0;
      notify('作業おつかれさま！', nextLong ? '長い休憩をとりましょう 🌴' : '小休憩をどうぞ ☕');
      setPomodoroPhase(nextLong ? 'long' : 'short');
    } else {
      notify('休憩おわり', '次の作業を始めましょう 🍅');
      setPomodoroPhase('work');
    }
    render();
    start(); // 次のフェーズを自動開始
  } else if (mode === 'target') {
    notify('指定時刻になりました', '設定した時刻です ⏰');
    render();
  } else {
    notify('タイマー終了', '設定した時間が経過しました ⏱');
    render();
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

// ===== 入力：カスタム時間セット（最大12時間） =====
function applyCustom() {
  const h = Math.min(12, Math.max(0, parseInt(el.inHour.value) || 0));
  const m = Math.min(59, Math.max(0, parseInt(el.inMin.value) || 0));
  const s = Math.min(59, Math.max(0, parseInt(el.inSec.value) || 0));
  let ms = ((h * 60 + m) * 60 + s) * 1000;
  if (ms > MAX_MS) ms = MAX_MS;       // 12時間で頭打ち
  durationMs = ms;
  remainingMs = ms;
  // 補正後の値を入力欄に反映
  const capped = ms / 1000;
  el.inHour.value = Math.floor(capped / 3600);
  el.inMin.value = Math.floor((capped % 3600) / 60);
  el.inSec.value = Math.floor(capped % 60);
  render();
}

// ===== 時刻指定：目標時刻から残り時間を算出 =====
function applyTarget() {
  const v = el.inTarget.value; // "HH:MM"
  if (!v) { targetTimestamp = null; render(); return; }
  const [h, m] = v.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target.getTime() <= Date.now()) {
    target.setDate(target.getDate() + 1); // 過ぎていれば翌日
  }
  targetTimestamp = target.getTime();
  remainingMs = targetTimestamp - Date.now();
  durationMs = remainingMs; // 総リングの基準（設定時点〜目標時刻）
  render();
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
el.setBtn.addEventListener('click', applyCustom);
el.targetBtn.addEventListener('click', applyTarget);
el.inTarget.addEventListener('change', () => { if (!running) applyTarget(); });

document.querySelectorAll('.preset').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (running) return;
    applyPreset(parseInt(btn.dataset.sec));
  });
});

document.querySelectorAll('.mode').forEach((btn) => {
  btn.addEventListener('click', () => {
    clearInterval(ticker);
    running = false;
    mode = btn.dataset.mode;
    document.querySelectorAll('.mode').forEach((m) => m.classList.remove('active'));
    btn.classList.add('active');

    if (mode === 'pomodoro') {
      completedPomos = 0;
      setPomodoroPhase('work');
    } else if (mode === 'target') {
      applyTarget();
    } else {
      applyCustom();
    }
    render();
  });
});

// スペースキーでスタート/一時停止
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.getElementById('tab-timer').classList.contains('active')) {
    e.preventDefault();
    running ? pause() : start();
  }
});

// ===== 初期表示 =====
// 時刻指定の初期値：現在時刻の1時間後（分単位）
(function initTargetDefault() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  el.inTarget.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
})();
applyPreset(DEFAULT_SEC);
render();
