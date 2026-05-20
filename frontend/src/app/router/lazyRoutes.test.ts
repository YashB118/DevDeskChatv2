import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(resolve(here, rel), 'utf8');
}

describe('admin chunk is lazy', () => {
  it('AppRouter.tsx imports admin pages only via dynamic import()', () => {
    const src = read('./AppRouter.tsx');
    // No static specifier mentioning pages/admin (only dynamic import() strings allowed)
    const staticAdminImport = /^\s*import[^()]*from\s+['"][^'"]*pages\/admin['"]/m;
    expect(staticAdminImport.test(src)).toBe(false);
    // Dynamic import must exist
    expect(src).toMatch(/import\(['"]\.\/pages\/admin['"]\)/);
  });

  it('lazyRoutes.ts uses dynamic import to load the admin chunk', () => {
    const src = read('./lazyRoutes.ts');
    expect(src).toMatch(/import\(['"]\.\/pages\/admin['"]\)/);
  });

  it('build manifest places admin pages in their own chunk (when dist/ exists)', () => {
    const manifestPath = resolve(here, '../../../dist/.vite/manifest.json');
    let manifestRaw: string;
    try {
      manifestRaw = readFileSync(manifestPath, 'utf8');
    } catch {
      // dist/ not built — this assertion is enforced in CI after `npm run build`.
      return;
    }
    const manifest = JSON.parse(manifestRaw) as Record<
      string,
      { file: string; src?: string; isEntry?: boolean; isDynamicEntry?: boolean }
    >;
    const entry = Object.values(manifest).find((e) => e.isEntry);
    expect(entry, 'expected an entry chunk in manifest').toBeDefined();
    const adminKeys = Object.keys(manifest).filter((k) =>
      k.includes('pages/admin'),
    );
    expect(adminKeys.length).toBeGreaterThan(0);
    for (const key of adminKeys) {
      const m = manifest[key];
      expect(m).toBeDefined();
      expect(m?.file).not.toEqual(entry?.file);
    }
  });
});
