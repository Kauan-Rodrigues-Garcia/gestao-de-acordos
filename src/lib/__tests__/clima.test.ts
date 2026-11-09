import { cidadeDoClima, estacaoDoDia, horaDeBrasilia, resumoDoClima, rotuloDaCondicao, semanaCurta, varianteDoDia } from '../clima';

describe('cidadeDoClima', () => {
  it('Marília, com ou sem acento, é Marília', () => {
    expect(cidadeDoClima('Marília')).toBe('marilia');
    expect(cidadeDoClima(' MARILIA ')).toBe('marilia');
  });
  it('Birigui, outra cidade ou setor sem cidade: Birigui', () => {
    expect(cidadeDoClima('Birigui')).toBe('birigui');
    expect(cidadeDoClima('Araçatuba')).toBe('birigui');
    expect(cidadeDoClima(null)).toBe('birigui');
    expect(cidadeDoClima(undefined)).toBe('birigui');
  });
});

describe('estacaoDoDia', () => {
  it.each([
    ['2026-01-15', 'verao'], ['2026-03-19', 'verao'], ['2026-03-20', 'outono'],
    ['2026-06-20', 'outono'], ['2026-06-21', 'inverno'], ['2026-09-22', 'inverno'],
    ['2026-09-23', 'primavera'], ['2026-12-20', 'primavera'], ['2026-12-21', 'verao'],
  ])('%s é %s', (iso, esperado) => {
    expect(estacaoDoDia(iso)).toBe(esperado);
  });
});

describe('varianteDoDia', () => {
  it('mesmo dia e semente: sempre a mesma', () => {
    expect(varianteDoDia('2026-11-06', 'sol-birigui', 3)).toBe(varianteDoDia('2026-11-06', 'sol-birigui', 3));
  });
  it('fica dentro do intervalo e varia ao longo do mês', () => {
    const vistas = new Set<number>();
    for (let d = 1; d <= 30; d++) {
      const v = varianteDoDia(`2026-11-${String(d).padStart(2, '0')}`, 'chao-birigui', 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(3);
      vistas.add(v);
    }
    expect(vistas.size).toBe(3);
  });
  it('uma só variação: 0', () => {
    expect(varianteDoDia('2026-11-06', 'x', 1)).toBe(0);
  });
});

describe('textos', () => {
  it('céu limpo é sol de dia e noite limpa de noite', () => {
    expect(rotuloDaCondicao('limpo', false)).toBe('Sol');
    expect(rotuloDaCondicao('limpo', true)).toBe('Noite limpa');
    expect(rotuloDaCondicao('chuva', true)).toBe('Chuva');
  });
  it('semana curta e hora de Brasília', () => {
    expect(semanaCurta('2026-11-07')).toBe('SÁB');
    expect(horaDeBrasilia('2026-11-06T17:42:00Z')).toBe('14:42');
    expect(horaDeBrasilia('lixo')).toBe('');
  });
  it('o resumo do botão', () => {
    expect(resumoDoClima('marilia', {
      agora: { temp: 31, sensacao: 33, condicao: 'limpo', noite: false, umidade: 40, vento: 9 },
      dias: [{ data: '2026-11-06', condicao: 'limpo', max: 34, min: 21, chuvaMm: 0 }],
    })).toBe('Marília: 31°, sol, máx 34° mín 21°');
  });
});
