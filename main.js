const { app, BrowserWindow, ipcMain, Notification, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

// ユーザーデータの保存先（将来 to-do のデータ保存にも使う）
const dataFile = () => path.join(app.getPath('userData'), 'store.json');

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(dataFile(), 'utf-8'));
  } catch {
    return {};
  }
}

function saveStore(data) {
  try {
    fs.writeFileSync(dataFile(), JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('保存に失敗:', e);
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    title: 'Time & To-Do',
    backgroundColor: '#eff1f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required', // 操作なしでもチャイム音を鳴らせるように
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

// レンダラーからのデータ読み書き
ipcMain.handle('store:get', () => loadStore());
ipcMain.handle('store:set', (_e, data) => saveStore(data));

// クリップボードへコピー（Electronは file:// で navigator.clipboard が使えないため）
ipcMain.handle('clipboard:write', (_e, text) => {
  try { clipboard.writeText(String(text ?? '')); return true; } catch { return false; }
});

// URLからテキスト取得（ICS購読用。file:// のレンダラーはCORSで外部取得できないためメイン経由）
ipcMain.handle('net:fetchText', async (_e, url) => {
  try {
    const res = await fetch(String(url));
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, text: await res.text() };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

// タイマー終了時のOS通知
ipcMain.on('notify', (_e, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
