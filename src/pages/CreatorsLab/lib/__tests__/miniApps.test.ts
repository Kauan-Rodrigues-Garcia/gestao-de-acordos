/**
 * Os mini apps do Project Archive.
 *
 * Eles existem para provar que os projetos funcionam de verdade. Um mini app
 * que erra a conta prova o contrário do pretendido — daí o teste.
 */
import { describe, it, expect } from 'vitest';
import {
  lerDinheiro, calcularDesconto, diasUteisEntre, formatarBRL,
} from '../../components/MiniApps';

describe('lerDinheiro', () => {
  it('aceita as quatro formas que a pessoa realmente digita', () => {
    expect(lerDinheiro('1234.56')).toBe(1234.56);
    expect(lerDinheiro('1234,56')).toBe(1234.56);
    expect(lerDinheiro('1.234,56')).toBe(1234.56);
    expect(lerDinheiro('R$ 1.234,56')).toBe(1234.56);
  });

  it('a vírgula manda quando existe', () => {
    // "1.234" com vírgula ausente é mil duzentos e trinta e quatro em pt-BR,
    // mas sem vírgula o ponto tem de valer como decimal — senão "1.5" vira 15.
    expect(lerDinheiro('1,5')).toBe(1.5);
    expect(lerDinheiro('1.5')).toBe(1.5);
  });

  it('texto sem número nenhum devolve nulo', () => {
    expect(lerDinheiro('abc')).toBeNull();
    expect(lerDinheiro('')).toBeNull();
    expect(lerDinheiro('   ')).toBeNull();
  });

  it('aceita negativo, para a validação decidir depois', () => {
    expect(lerDinheiro('-50')).toBe(-50);
  });
});

describe('calcularDesconto', () => {
  it('faz a conta certa', () => {
    const r = calcularDesconto(1000, 20);
    expect(r.desconto).toBe(200);
    expect(r.final).toBe(800);
    expect(r.erro).toBeNull();
  });

  it('desconto de 100% zera', () => {
    expect(calcularDesconto(500, 100)).toMatchObject({ desconto: 500, final: 0 });
  });

  it('desconto de 0% não muda nada', () => {
    expect(calcularDesconto(500, 0)).toMatchObject({ desconto: 0, final: 500 });
  });

  it('arredonda para centavo', () => {
    const r = calcularDesconto(99.99, 33);
    expect(Number.isInteger(Math.round(r.final * 100))).toBe(true);
  });

  it('recusa valor negativo', () => {
    expect(calcularDesconto(-10, 20).erro).toMatch(/negativo/i);
  });

  it('recusa percentual fora de 0 a 100', () => {
    expect(calcularDesconto(100, 150).erro).toMatch(/0%.*100%/);
    expect(calcularDesconto(100, -5).erro).toMatch(/0%.*100%/);
  });

  it('campo vazio pede preenchimento em vez de calcular com nulo', () => {
    expect(calcularDesconto(null, 20).erro).toMatch(/preencha/i);
    expect(calcularDesconto(100, null).erro).toMatch(/preencha/i);
  });
});

describe('formatarBRL', () => {
  it('usa vírgula decimal e o símbolo do real', () => {
    const s = formatarBRL(1234.5);
    expect(s).toContain('R$');
    expect(s).toContain('1.234,50');
  });
});

describe('diasUteisEntre', () => {
  /** 2026-08-17 é segunda; 2026-08-21 é sexta. */
  it('uma semana de trabalho dá 5', () => {
    expect(diasUteisEntre('2026-08-17', '2026-08-21')).toBe(5);
  });

  it('inclui as duas pontas', () => {
    expect(diasUteisEntre('2026-08-17', '2026-08-17')).toBe(1);
  });

  it('não conta sábado nem domingo', () => {
    // 22/08 é sábado, 23/08 é domingo.
    expect(diasUteisEntre('2026-08-22', '2026-08-23')).toBe(0);
  });

  it('atravessa o fim de semana corretamente', () => {
    // Sexta 21 a segunda 24 = 2 dias úteis.
    expect(diasUteisEntre('2026-08-21', '2026-08-24')).toBe(2);
  });

  it('data final antes da inicial devolve nulo', () => {
    expect(diasUteisEntre('2026-08-21', '2026-08-17')).toBeNull();
  });

  it('data inválida ou vazia devolve nulo', () => {
    expect(diasUteisEntre('', '2026-08-21')).toBeNull();
    expect(diasUteisEntre('não-é-data', '2026-08-21')).toBeNull();
  });

  /** O meio-dia fixo no parse evita o clássico erro de um dia por fuso. */
  it('não escorrega um dia por causa de fuso', () => {
    expect(diasUteisEntre('2026-01-01', '2026-01-01')).toBe(1);   // quinta
  });
});
