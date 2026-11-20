import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRememberedLoginAccounts, rememberLoginAccount } from './storageService';

test('quick-login storage remembers account identity without storing credentials', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    },
  });

  try {
    rememberLoginAccount({
      email: 'ADMIN@example.test',
      name: 'محمد رضا',
      role: 'admin',
    });
    rememberLoginAccount({
      email: 'admin@example.test',
      name: 'محمد رضا',
      role: 'admin',
    });

    assert.deepEqual(loadRememberedLoginAccounts(), [
      { email: 'admin@example.test', name: 'محمد رضا', role: 'admin' },
    ]);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});
