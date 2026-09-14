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
  ring: document.getElementById('ring-progress'),
  countdownSetup: document.getElementById('countdown-setup'),
  inHour: document.getElementById('in-hour'),
  inMin: document.getElementById('in-min'),
  inSec: document.getElementById('in-sec'),
  setBtn: document.getElementById('set-btn'),
  start: document.getElementById('start-btn'),
  pause: document.getElementById('pause-btn'),
  reset: document.getElementById('reset-btn'),
};

// ===== 定数 =====
const MAX_MS = 12 * 60 * 60 * 1000;                 // 上限12時間
const RING_C = 2 * Math.PI * 90;                    // リング円周(r=90)
el.ring.style.strokeDasharray = RING_C;

// ===== ポモドーロの設定（分） =====
const POMO = { work: 25, shortBreak: 5, longBreak: 15, longEvery: 4 };

// ===== 状態 =====
let mode = 'countdown';        // 'countdown' | 'pomodoro'
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

  // リング：残り割合に応じて減っていく
  const ratio = durationMs > 0 ? Math.max(0, remainingMs / durationMs) : 0;
  el.ring.style.strokeDashoffset = RING_C * (1 - ratio);

  const warn = running && remainingMs <= 10000;
  el.time.classList.toggle('warning', warn);
  el.ring.classList.toggle('warning', warn);

  if (mode === 'pomodoro') {
    const labels = { work: '🍅 作業', short: '☕ 小休憩', long: '🌴 長休憩' };
    el.phase.textContent = labels[phase];
    el.pomoCount.textContent = `完了: ${completedPomos} セッション`;
    el.countdownSetup.style.display = 'none';
  } else {
    el.phase.textContent = '';
    el.pomoCount.textContent = '';
    el.countdownSetup.style.display = 'block';
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
  if (running || remainingMs <= 0) return;
  running = true;
  endTime = Date.now() + remainingMs;
  ticker = setInterval(tick, 200);
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
  } else {
    remainingMs = durationMs;
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
applyCustom();
render();
