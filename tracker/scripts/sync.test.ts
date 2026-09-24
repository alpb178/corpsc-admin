// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INTEGRITY_TEST, MANIFEST, header, sha256, sourceFiles, sync } from './sync';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'hub-tracker-'));
}

describe('sync', () => {
  it('copies every source with its header, and hashes it in the manifest', () => {
    const target = tmp();
    const manifest = sync(target, { version: '9.9.9' });

    expect(Object.keys(manifest.files)).toEqual(sourceFiles());
    expect(sourceFiles()).toContain('handler.ts');
    expect(sourceFiles()).not.toContain('handler.test.ts');
    expect(sourceFiles()).not.toContain('next-navigation.d.ts');

    for (const [name, hash] of Object.entries(manifest.files)) {
      const content = readFileSync(join(target, name), 'utf8');
      expect(content.startsWith(header('9.9.9'))).toBe(true);
      expect(sha256(content)).toBe(hash);
    }
    expect(JSON.parse(readFileSync(join(target, MANIFEST), 'utf8'))).toEqual(manifest);
  });

  it("keeps 'use client' as the first statement of the component", () => {
    const target = tmp();
    sync(target);
    const lines = readFileSync(join(target, 'HubAnalytics.tsx'), 'utf8').split('\n');
    expect(lines.find((l) => !l.startsWith('//'))).toBe("'use client';");
  });

  it('writes an integrity test the site runs', () => {
    const target = tmp();
    sync(target, { version: '1.2.3' });
    const test = readFileSync(join(target, INTEGRITY_TEST), 'utf8');
    expect(test).toContain("from 'vitest'");
    expect(test).toContain(MANIFEST);
    expect(test.startsWith(header('1.2.3'))).toBe(true);
  });

  it('removes files a previous version copied and this one no longer has', () => {
    const source = tmp();
    const target = tmp();
    writeFileSync(join(source, 'kept.ts'), 'export const a = 1;\n');
    writeFileSync(join(source, 'gone.ts'), 'export const b = 2;\n');
    sync(target, { sourceDir: source, version: '1.0.0' });

    const next = tmp();
    writeFileSync(join(next, 'kept.ts'), 'export const a = 3;\n');
    sync(target, { sourceDir: next, version: '1.1.0' });

    expect(existsSync(join(target, 'gone.ts'))).toBe(false);
    expect(readFileSync(join(target, 'kept.ts'), 'utf8')).toContain('a = 3');
  });

  it('reads the version from package.json by default', () => {
    const version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
    expect(sync(tmp()).version).toBe(version);
  });
});
