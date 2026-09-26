import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyUpdate, watchForUpdate } from './offline';

class FakeWorker extends EventTarget {
  posted: unknown[] = [];
  constructor(public state: string) { super(); }
  postMessage(message: unknown) { this.posted.push(message); }
  become(state: string) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
class FakeRegistration extends EventTarget {
  active: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update = vi.fn(async () => undefined);
}
let registration: FakeRegistration;
let container: EventTarget & { controller: FakeWorker | null; getRegistration: () => Promise<FakeRegistration | undefined> };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const setVisibility = (state: DocumentVisibilityState) => Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
const setOnline = (online: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });

beforeEach(() => {
  registration = new FakeRegistration();
  container = Object.assign(new EventTarget(), { controller: null as FakeWorker | null, getRegistration: async () => registration });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
  setVisibility('visible'); setOnline(true);
});
afterEach(() => {
  delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
  delete (navigator as unknown as { onLine?: unknown }).onLine;
  delete (document as unknown as { visibilityState?: unknown }).visibilityState;
});

describe('Poker updates while a saved copy serves the app', () => {
  it('offers a newer copy once it has downloaded beside the one running', async () => {
    registration.active = container.controller = new FakeWorker('activated');
    const onUpdate = vi.fn();
    const stop = watchForUpdate(onUpdate);
    await flush();
    expect(registration.update).toHaveBeenCalledOnce();
    const next = registration.installing = new FakeWorker('installing');
    registration.dispatchEvent(new Event('updatefound'));
    expect(onUpdate).not.toHaveBeenCalled();
    next.become('installed');
    expect(onUpdate).toHaveBeenCalledOnce();
    stop();
  });

  it('offers a copy that was already waiting when Poker opened', async () => {
    registration.active = container.controller = new FakeWorker('activated');
    registration.waiting = new FakeWorker('installed');
    const onUpdate = vi.fn();
    const stop = watchForUpdate(onUpdate);
    await flush();
    expect(onUpdate).toHaveBeenCalledOnce();
    stop();
  });

  it('does not call the first offline save an update, but does the next copy to take over', async () => {
    const onUpdate = vi.fn();
    const stop = watchForUpdate(onUpdate);
    await flush();
    const first = registration.installing = new FakeWorker('installing');
    registration.dispatchEvent(new Event('updatefound'));
    first.become('installed');
    container.dispatchEvent(new Event('controllerchange'));
    expect(onUpdate).not.toHaveBeenCalled();
    // Update offline copy, tapped later in the same visit, hands the page to a newer worker.
    container.dispatchEvent(new Event('controllerchange'));
    expect(onUpdate).toHaveBeenCalledOnce();
    stop();
  });

  it('asks again on returning to the tab and on reconnecting, never while hidden or offline', async () => {
    registration.active = container.controller = new FakeWorker('activated');
    const stop = watchForUpdate(vi.fn());
    await flush();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    expect(registration.update).toHaveBeenCalledTimes(3);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    setVisibility('visible'); setOnline(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).toHaveBeenCalledTimes(3);
    stop();
    setOnline(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).toHaveBeenCalledTimes(3);
  });

  it('stays quiet once stopped, and without a saved copy', async () => {
    registration.active = container.controller = new FakeWorker('activated');
    const onUpdate = vi.fn();
    watchForUpdate(onUpdate)();
    await flush();
    registration.waiting = new FakeWorker('installed');
    container.dispatchEvent(new Event('controllerchange'));
    expect(onUpdate).not.toHaveBeenCalled();
    container.getRegistration = async () => undefined;
    const none = watchForUpdate(onUpdate);
    await flush();
    expect(onUpdate).not.toHaveBeenCalled();
    none();
  });

  it('hands over to the waiting copy before reloading into it', async () => {
    const waiting = registration.waiting = new FakeWorker('installed');
    const reload = vi.fn();
    const applying = applyUpdate(reload);
    await flush();
    expect(waiting.posted).toEqual(['ACTIVATE']);
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event('controllerchange'));
    await applying;
    expect(reload).toHaveBeenCalledOnce();
    // Already handed over (Update offline copy): just reload.
    registration.waiting = null;
    await applyUpdate(reload);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
