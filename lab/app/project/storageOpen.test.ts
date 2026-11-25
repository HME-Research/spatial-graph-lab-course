import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIndexedDbProjectStore, type ProjectDbFactory } from './storage';

/**
 * Opening the IndexedDB project database never hangs (Bug A, 2026-11-20): a fake `IDBFactory`
 * whose open requests the test answers by hand (or never).
 */

const later = (fn: () => void) => void Promise.resolve().then(fn);

/** A minimal in-memory IDBDatabase: enough for get / getAll / getAllKeys / put / delete / add. */
function fakeDb() {
  const stores = new Map<string, Map<string, unknown>>();
  const db = {
    closed: false,
    onversionchange: null as null | (() => void),
    onclose: null as null | (() => void),
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: (name: string) => void stores.set(name, new Map()),
    close() {
      db.closed = true;
    },
    transaction(name: string) {
      if (db.closed) throw new Error('InvalidStateError: the database connection is closing');
      const data = stores.get(name)!;
      const tx = { oncomplete: null as null | (() => void), onabort: null, onerror: null, error: null, abort() {}, objectStore: () => store };
      const req = (value: () => unknown) => {
        const r = { onsuccess: null as null | (() => void), onerror: null, result: undefined as unknown, error: null };
        later(() => {
          r.result = value();
          r.onsuccess?.();
          later(() => tx.oncomplete?.());
        });
        return r;
      };
      const store = {
        get: (k: string) => req(() => data.get(k)),
        getAll: () => req(() => [...data.values()]),
        getAllKeys: () => req(() => [...data.keys()]),
        put: (v: unknown, k: string) => req(() => void data.set(k, v)),
        delete: (k: string) => req(() => void data.delete(k)),
        add: (v: unknown, k: string) => req(() => void data.set(k, v)),
      };
      return tx;
    },
  };
  return db;
}

type FakeRequest = {
  result: unknown;
  error: unknown;
  onupgradeneeded: null | (() => void);
  onsuccess: null | (() => void);
  onerror: null | (() => void);
  onblocked: null | (() => void);
};

/** A factory that records every open request; the test decides when (or whether) each one answers. */
function manualFactory() {
  const requests: FakeRequest[] = [];
  const factory = {
    open: () => {
      const r: FakeRequest = { result: undefined, error: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      requests.push(r);
      return r as unknown as IDBOpenDBRequest;
    },
  } satisfies ProjectDbFactory;
  const succeed = (r: FakeRequest) => {
    const db = fakeDb();
    r.result = db;
    r.onupgradeneeded?.();
    r.onsuccess?.();
    return db;
  };
  return { factory, requests, succeed };
}

describe('IndexedDB project store: opening never hangs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports an unanswered open as unavailable after the timeout, with a readable message', async () => {
    const { factory, requests } = manualFactory();
    const store = createIndexedDbProjectStore('t', { factory, openTimeoutMs: 1000 });
    const load = store.load('p1');
    const list = store.list();
    await vi.advanceTimersByTimeAsync(999);
    let settled = false;
    void load.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await load).toEqual({ status: 'unavailable', message: expect.stringMatching(/did not answer within 1 s; close this tab and open the app in a new tab/) });
    expect(await list).toEqual([]);
    // One request only: the two calls shared it.
    expect(requests).toHaveLength(1);
  });

  it('fails at once (no new request) while the timed-out request is still pending', async () => {
    const { factory, requests } = manualFactory();
    const store = createIndexedDbProjectStore('t', { factory, openTimeoutMs: 1000 });
    const first = store.load('p1');
    await vi.advanceTimersByTimeAsync(1000);
    expect((await first).status).toBe('unavailable');
    // No timer needed: the answer is immediate.
    expect(await store.load('p1')).toMatchObject({ status: 'unavailable' });
    expect(await store.discardUnreadable('p1')).toMatchObject({ status: 'blocked', reason: 'unavailable' });
    expect(requests).toHaveLength(1);
  });

  it('recovers without a reload when the browser answers late', async () => {
    const { factory, requests, succeed } = manualFactory();
    const store = createIndexedDbProjectStore('t', { factory, openTimeoutMs: 1000 });
    const first = store.load('p1');
    await vi.advanceTimersByTimeAsync(1000);
    expect((await first).status).toBe('unavailable');
    succeed(requests[0]!);
    expect(await store.load('p1')).toEqual({ status: 'missing' });
    expect(await store.list()).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it('waits through "blocked" (another tab) and succeeds when the request does', async () => {
    const { factory, requests, succeed } = manualFactory();
    const store = createIndexedDbProjectStore('t', { factory, openTimeoutMs: 1000 });
    const load = store.load('p1');
    requests[0]!.onblocked?.();
    await vi.advanceTimersByTimeAsync(500);
    succeed(requests[0]!);
    expect(await load).toEqual({ status: 'missing' });
  });

  it('names the other tab when a blocked open times out', async () => {
    const { factory, requests } = manualFactory();
    const store = createIndexedDbProjectStore('t', { factory, openTimeoutMs: 2000 });
    const load = store.load('p1');
    requests[0]!.onblocked?.();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await load).toEqual({ status: 'unavailable', message: expect.stringMatching(/held open by another tab .*within 2 s/) });
  });

  it('closes the connection on versionchange and opens a new one for the next operation', async () => {
    const { factory, requests, succeed } = manualFactory();
    const store = createIndexedDbProjectStore('t', { factory, openTimeoutMs: 1000 });
    const first = store.load('p1');
    const db = succeed(requests[0]!);
    expect(await first).toEqual({ status: 'missing' });
    db.onversionchange?.();
    expect(db.closed).toBe(true);
    const second = store.load('p1');
    await Promise.resolve();
    expect(requests).toHaveLength(2);
    succeed(requests[1]!);
    expect(await second).toEqual({ status: 'missing' });
  });

  it('drops a connection the browser closed and opens again', async () => {
    const { factory, requests, succeed } = manualFactory();
    const store = createIndexedDbProjectStore('t', { factory, openTimeoutMs: 1000 });
    const first = store.load('p1');
    const db = succeed(requests[0]!);
    await first;
    db.closed = true;
    db.onclose?.();
    const second = store.load('p1');
    await Promise.resolve();
    expect(requests).toHaveLength(2);
    succeed(requests[1]!);
    expect(await second).toEqual({ status: 'missing' });
  });

  it('retries after an open error (no stalled state)', async () => {
    const { factory, requests, succeed } = manualFactory();
    const store = createIndexedDbProjectStore('t', { factory, openTimeoutMs: 1000 });
    const first = store.load('p1');
    requests[0]!.error = new Error('UnknownError: disk');
    requests[0]!.onerror?.();
    expect(await first).toEqual({ status: 'unavailable', message: 'UnknownError: disk' });
    const second = store.load('p1');
    await Promise.resolve();
    expect(requests).toHaveLength(2);
    succeed(requests[1]!);
    expect(await second).toEqual({ status: 'missing' });
    // The first request's timer was cleared: nothing fires later.
    await vi.advanceTimersByTimeAsync(5000);
    expect(await store.load('p1')).toEqual({ status: 'missing' });
  });

  it('keeps the page out of the back/forward cache only while an open is in flight (unload guard)', async () => {
    const guardTarget = new EventTarget();
    const added: string[] = [];
    const removed: string[] = [];
    const add = guardTarget.addEventListener.bind(guardTarget);
    const remove = guardTarget.removeEventListener.bind(guardTarget);
    const target = {
      addEventListener: (type: string, fn: EventListenerOrEventListenerObject | null) => (added.push(type), add(type, fn)),
      removeEventListener: (type: string, fn: EventListenerOrEventListenerObject | null) => (removed.push(type), remove(type, fn)),
    };
    const { factory, requests, succeed } = manualFactory();
    const store = createIndexedDbProjectStore('t', { factory, openTimeoutMs: 1000, guardTarget: target });
    const first = store.load('p1');
    expect(added).toEqual(['unload']);
    expect(removed).toEqual([]);
    // Still guarded after the timeout: the request is still in flight.
    await vi.advanceTimersByTimeAsync(1000);
    expect((await first).status).toBe('unavailable');
    expect(removed).toEqual([]);
    succeed(requests[0]!);
    expect(removed).toEqual(['unload']);
    // An open connection adds no guard.
    expect(await store.load('p1')).toEqual({ status: 'missing' });
    expect(added).toEqual(['unload']);
  });
});
