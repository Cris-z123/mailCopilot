/**
 * Copy database migration SQL files from src to dist.
 * Used only in build (npm run build:main); dev reads migrations from src.
 */
import fs from 'node:fs';
import path from 'node:path';

const srcDir = path.join(process.cwd(), 'src', 'main', 'database', 'migrations');
const destDir = path.join(process.cwd(), 'dist', 'main', 'database', 'migrations');

if (!fs.existsSync(srcDir)) {
  console.warn('copy-migrations: src dir not found, skipping');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
for (const name of fs.readdirSync(srcDir)) {
  const src = path.join(srcDir, name);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, path.join(destDir, name));
  }
}
console.log('copy-migrations: copied migrations to dist');
