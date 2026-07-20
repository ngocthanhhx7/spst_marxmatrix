import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  ...(process.env['MARXMATRIX_SKIP_ENV_FILE'] === 'true' ? { envDir: false } : {}),
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] }
});
