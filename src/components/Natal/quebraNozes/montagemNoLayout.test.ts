import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('os quebra-nozes no Layout', () => {
  it('não dependem do tema escolhido pela pessoa', () => {
    const layout = readFileSync(resolve(process.cwd(), 'src/components/Layout.tsx'), 'utf8');
    expect(layout).toMatch(/\{podeVerNatal && perfil\?\.id && \(\s*<Suspense fallback=\{null\}>\s*<QuebraNozesNoSistema /);
  });
});
