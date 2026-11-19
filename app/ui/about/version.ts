/** Application version: `package.json` version injected at build time (vite.config.ts `define`). */
export function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
}
