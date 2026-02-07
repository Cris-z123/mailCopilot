/**
 * Electron Main Process Entry Point
 *
 * This is the compiled entry point that Electron loads.
 * Source: src/main/index.ts
 *
 * To rebuild after changes:
 *   npm run build:main
 */

await import('../dist/main/index.js');
