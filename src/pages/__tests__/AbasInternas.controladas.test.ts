import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const paginas = [
  resolve(__dirname, '../AdminConfiguracoes.tsx'),
  resolve(__dirname, '../AdminUsuarios.tsx'),
];

describe('abas internas controladas', () => {
  it.each(paginas)('%s permite trocar a aba e sincroniza a URL', (arquivo) => {
    const codigo = readFileSync(arquivo, 'utf8');

    expect(codigo).toContain('const [searchParams, setSearchParams] = useSearchParams()');
    expect(codigo).toContain('onValueChange={selecionarAba}');
    expect(codigo).toContain("novosParametros.set('tab', aba)");
  });
});
