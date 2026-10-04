import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as any).ResizeObserver = RO;
Object.defineProperty(window, 'matchMedia', { writable: true, value: (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) });
window.scrollTo = vi.fn() as any;
Element.prototype.scrollIntoView = vi.fn();

// Route relative /api calls to a real API server (API_URL, default http://localhost:5055), so tests exercise real endpoints.
const real = globalThis.fetch.bind(globalThis);
const API = process.env.API_URL || 'http://localhost:5055';
globalThis.fetch = ((input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('/api')) return real(API + url, init);
  if (url.startsWith('http') && !url.startsWith(API)) return Promise.reject(new Error('external network blocked in tests'));
  return real(input, init);
}) as any;

// No real sockets in tests: the feed falls back to REST polling, which is what we want to exercise here.
class FakeWS { onopen: any; onclose: any; onerror: any; onmessage: any; constructor(public url: string) {} close() {} send() {} }
(globalThis as any).WebSocket = FakeWS;
