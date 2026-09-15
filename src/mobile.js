// スマホ（Capacitor / Android アプリ）でのみ動作。
// OSのスケジュール通知(Local Notifications)を扱い、アプリを閉じていても鳴らせるようにする。
// デスクトップ(Electron)や通常ブラウザでは window.Mobile.isNative() が false になり、何もしない。
(function () {
  const cap = window.Capacitor;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const LN = () => (cap && cap.Plugins ? cap.Plugins.LocalNotifications : null);
  const APP = () => (cap && cap.Plugins ? cap.Plugins.App : null);

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

  window.Mobile = {
    isNative: () => isNative,
    requestPermission,
    scheduleAll,
    onResume,
  };
})();
