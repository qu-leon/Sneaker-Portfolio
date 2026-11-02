import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

const browserWindow = (
  globalThis as typeof globalThis & { jsdom: { window: Window } }
).jsdom.window;
vi.stubGlobal('localStorage', browserWindow.localStorage);

afterEach(() => {
  cleanup();
  localStorage.clear();
});