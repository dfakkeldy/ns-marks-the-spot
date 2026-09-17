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
