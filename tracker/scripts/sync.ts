/**
 * Copies the tracker into a site: one source, five copies that can't drift.
 *
 *   pnpm sync ../../tu-chamba/web/src/lib/hub-tracker
 *
 * Each copied file starts with a GENERATED header, and the folder gets a
 * MANIFEST.json with the hash of every file plus an integrity test the site's
 * test runner picks up. Editing a copy by hand makes that test fail: the fix
 * goes here, in corpsc-hub, and is synced to every site.
 *
 * Runs on Node's own TypeScript support (Node ≥ 22.6), no build step.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST = 'MANIFEST.json';
export const INTEGRITY_TEST = 'integrity.test.ts';

/** The test runner of the receiving site: most use Vitest; Invoices, Node's own. */
export type Runner = 'vitest' | 'node';

interface Manifest {
  version: string;
  files: Record<string, string>;
}

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** The files a site receives: the sources, without tests or local type shims. */
export function sourceFiles(sourceDir = join(ROOT, 'src')): string[] {
  return readdirSync(sourceDir)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('.d.ts'))
    .sort();
}

export function header(version: string): string {
  return (
    `// GENERATED from corpsc-hub/tracker v${version}. Do not edit this copy:\n` +
    `// change it in corpsc-hub/tracker and run \`pnpm sync <this folder>\` there.\n`
  );
}

export function sync(
  targetDir: string,
  {
    sourceDir = join(ROOT, 'src'),
    version = packageVersion(),
    runner = 'vitest',
  }: { sourceDir?: string; version?: string; runner?: Runner } = {},
): Manifest {
  mkdirSync(targetDir, { recursive: true });

  // Files a previous version copied and this one no longer has.
  const previous = join(targetDir, MANIFEST);
  if (existsSync(previous)) {
    const old = JSON.parse(readFileSync(previous, 'utf8')) as Manifest;
    for (const name of Object.keys(old.files)) rmSync(join(targetDir, name), { force: true });
  }

  const manifest: Manifest = { version, files: {} };
  for (const name of sourceFiles(sourceDir)) {
    const content = header(version) + readFileSync(join(sourceDir, name), 'utf8');
    writeFileSync(join(targetDir, name), content);
    manifest.files[name] = sha256(content);
  }

  writeFileSync(previous, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(targetDir, INTEGRITY_TEST), integrityTest(version, runner));
  return manifest;
}

function packageVersion(): string {
  return (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
}

/** The test that fails when a copy is edited by hand, for the site's runner. */
function integrityTest(version: string, runner: Runner): string {
  const common = `${header(version)}
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
`;
  const load = `
const dir = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(dir, '${MANIFEST}'), 'utf8')) as {
  files: Record<string, string>;
};
const hashOf = (name: string) => createHash('sha256').update(readFileSync(join(dir, name), 'utf8')).digest('hex');
`;

  if (runner === 'node') {
    return `${common}import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
${load}
describe('hub tracker copy', () => {
  for (const [name, hash] of Object.entries(manifest.files)) {
    it(\`\${name} is exactly what corpsc-hub/tracker ships\`, () => {
      assert.equal(hashOf(name), hash, \`\${name} was edited by hand\`);
    });
  }
});
`;
  }

  return `${common}import { describe, expect, it } from 'vitest';
${load}
describe('hub tracker copy', () => {
  it.each(Object.entries(manifest.files))('%s is exactly what corpsc-hub/tracker ships', (name, hash) => {
    expect(hashOf(name), \`\${name} was edited by hand\`).toBe(hash);
  });
});
`;
}

const invokedDirectly = process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('--'));
  const runner: Runner = args.includes('--runner=node') ? 'node' : 'vitest';
  if (!target) {
    console.error('Usage: pnpm sync <target folder> [--runner=node]');
    console.error('  e.g. pnpm sync ../../tu-chamba/web/src/lib/hub-tracker');
    process.exit(1);
  }
  const { version, files } = sync(resolve(process.cwd(), target), { runner });
  console.log(`hub-tracker v${version}: ${Object.keys(files).length} files → ${target}`);
}
