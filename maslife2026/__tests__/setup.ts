import { vi, afterEach, beforeEach } from 'vitest';

// Silencia console.error en paths de error esperados
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
