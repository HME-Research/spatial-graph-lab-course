import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // `@core/*` and `@app/*` are defined once, in tsconfig.json "paths", and shared by tsc, Vite and
  // Vitest. Aliases are an import convenience, not an access-control mechanism.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['core/**/*.test.ts', 'app/**/*.test.ts', 'student-api/**/*.test.ts'],
  },
});
