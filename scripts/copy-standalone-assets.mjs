import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const standaloneRoot = join(projectRoot, '.next', 'standalone');

function copyIfExists(source, target) {
  if (!existsSync(source) || !existsSync(standaloneRoot)) {
    return;
  }

  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true, force: true });
}

copyIfExists(
  join(projectRoot, '.next', 'static'),
  join(standaloneRoot, '.next', 'static'),
);

copyIfExists(
  join(projectRoot, 'public'),
  join(standaloneRoot, 'public'),
);
