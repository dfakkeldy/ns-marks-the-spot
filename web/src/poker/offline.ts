export async function offlineReady(registration: ServiceWorkerRegistration, action = 'CHECK_OFFLINE'): Promise<boolean> {
  const worker = registration.active;
  if (!worker) return false;
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, action === 'SAVE_OFFLINE' ? 90000 : 5000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data === true); };
    worker.postMessage(action, [channel.port2]);
  });
}
export async function saveOffline(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) throw Error('This browser cannot save the app offline.');
  const registration = await navigator.serviceWorker.register(new URL('poker-sw.js', document.baseURI), { scope: '/poker', updateViaCache: 'none' });
  await registration.update();
  const pending = registration.installing ?? registration.waiting;
  if (pending) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { pending.removeEventListener('statechange', change); reject(Error('Download did not finish. Stay online and try again.')); }, 90000);
      const change = () => {
        if (pending.state === 'installed') pending.postMessage('ACTIVATE');
        if (pending.state === 'activated' || pending.state === 'redundant') {
          clearTimeout(timer); pending.removeEventListener('statechange', change);
          if (pending.state === 'redundant') reject(Error('Offline download failed. Try again while online.')); else resolve();
        }
      };
      pending.addEventListener('statechange', change); change();
    });
  }
  const ready = await offlineReady(registration, pending ? 'CHECK_OFFLINE' : 'SAVE_OFFLINE');
  if (!ready) throw Error('Offline files are incomplete. Stay online and try again.');
  // Browsers decide whether storage may be protected from automatic eviction.
  try { return await navigator.storage?.persist?.() ?? false; } catch { return false; }
}
/**
 * Calls `onUpdate` once a newer saved copy of Poker is ready, while this page
 * still runs the older one. A saved copy serves Poker even online, and a newer
 * one would otherwise wait until every Poker tab closed. Asks for a newer copy
 * on start, on returning to the tab and on reconnecting. Returns a cleanup.
 */
export function watchForUpdate(onUpdate: () => void): () => void {
  const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!container) return () => {};
  let registration: ServiceWorkerRegistration | undefined;
  let stopped = false;
  // Replacing a worker that already served this page means the page is now older than it.
  let controlled = Boolean(container.controller);
  const report = () => { if (!stopped) onUpdate(); };
  const watch = (worker: ServiceWorker | null) => worker?.addEventListener('statechange', () => {
    // Installed beside an active worker: downloaded in full and waiting to take over.
    if (worker.state === 'installed' && registration?.active) report();
  });
  const found = () => watch(registration?.installing ?? null);
  const check = () => {
    if (registration && navigator.onLine && document.visibilityState === 'visible') registration.update().catch(() => {});
  };
  const changed = () => { if (controlled) report(); controlled = true; };
  container.addEventListener('controllerchange', changed);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('online', check);
  void container.getRegistration('/poker').then(existing => {
    if (!existing || stopped) return;
    registration = existing;
    if (existing.waiting && existing.active) report();
    watch(existing.installing);
    existing.addEventListener('updatefound', found);
    check();
  }).catch(() => {});
  return () => {
    stopped = true;
    registration?.removeEventListener('updatefound', found);
    container.removeEventListener('controllerchange', changed);
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('online', check);
  };
}
/** Hands Poker to the newer saved copy and reloads into it. The session is kept in this browser. */
export async function applyUpdate(reload = () => window.location.reload()): Promise<void> {
  const container = navigator.serviceWorker;
  const waiting = (await container?.getRegistration('/poker'))?.waiting;
  if (container && waiting) {
    await new Promise<void>(resolve => {
      // A worker that never takes over still gets a plain reload.
      const timer = setTimeout(resolve, 5000);
      container.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
      waiting.postMessage('ACTIVATE');
    });
  }
  reload();
}
