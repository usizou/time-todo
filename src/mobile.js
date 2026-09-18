// スマホ（Capacitor / Android アプリ）でのみ動作。
// OSのスケジュール通知(Local Notifications)を扱い、アプリを閉じていても鳴らせるようにする。
// デスクトップ(Electron)や通常ブラウザでは window.Mobile.isNative() が false になり、何もしない。
(function () {
  const cap = window.Capacitor;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const LN = () => (cap && cap.Plugins ? cap.Plugins.LocalNotifications : null);
  const APP = () => (cap && cap.Plugins ? cap.Plugins.App : null);
  const FS = () => (cap && cap.Plugins ? cap.Plugins.Filesystem : null);
  const SHARE = () => (cap && cap.Plugins ? cap.Plugins.Share : null);

  async function requestPermission() {
    const ln = LN();
    if (!ln) return;
    try { await ln.requestPermissions(); } catch (e) { console.warn('通知許可の取得に失敗', e); }
  }

  // items: [{ id:number, title:string, body:string, at:number(ms) }]
  // 既存のアプリ発行通知を全消し → 未来のものだけ入れ直す
  async function scheduleAll(items) {
    const ln = LN();
    if (!ln) return;
    try {
      const pending = await ln.getPending();
      const ids = (pending && pending.notifications ? pending.notifications : []).map((n) => ({ id: n.id }));
      if (ids.length) await ln.cancel({ notifications: ids });

      const now = Date.now();
      const future = items
        .filter((i) => i.at > now + 1000)
        .sort((a, b) => a.at - b.at)
        .slice(0, 60); // 予約数の上限

      if (future.length) {
        await ln.schedule({
          notifications: future.map((i) => ({
            id: i.id,
            title: i.title,
            body: i.body || '',
            schedule: { at: new Date(i.at), allowWhileIdle: true },
          })),
        });
      }
    } catch (e) {
      console.warn('通知スケジュールに失敗', e);
    }
  }

  function onResume(cb) {
    const app = APP();
    if (!app || !app.addListener) return;
    try { app.addListener('resume', cb); } catch (e) { /* noop */ }
  }

  // 外部URLからテキスト取得（ICS購読用。CapacitorHttp でCORSを回避）
  async function fetchText(url) {
    const http = cap && cap.Plugins ? (cap.Plugins.CapacitorHttp || cap.Plugins.Http) : null;
    if (http && http.get) {
      const res = await http.get({ url, responseType: 'text', headers: { 'Cache-Control': 'no-cache' } });
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    }
    const r = await fetch(url);
    return await r.text();
  }

  // CSVをキャッシュ領域に書き出して、Androidの共有シートで送る（Driveやファイルアプリへ保存できる）
  async function exportCSV(text, filename) {
    const fs = FS();
    const share = SHARE();
    if (!fs || !share) throw new Error('共有プラグインが見つかりません');
    const name = filename || 'time-todo.csv';
    // 共有用の一時ファイル（アプリのキャッシュ領域）
    const w = await fs.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
    let uri = w && w.uri;
    if (!uri) {
      const g = await fs.getUri({ path: name, directory: 'CACHE' });
      uri = g && g.uri;
    }
    await share.share({
      title: 'Time & To-Do CSV',
      text: 'To-Do / メモのバックアップ',
      url: uri,
      files: [uri],
      dialogTitle: 'CSVを共有',
    });
    return true;
  }

  window.Mobile = {
    isNative: () => isNative,
    requestPermission,
    scheduleAll,
    onResume,
    exportCSV,
    fetchText,
  };
})();
