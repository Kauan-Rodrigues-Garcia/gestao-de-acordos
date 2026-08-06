/**
 * parcelasLote.test.ts
 *
 * O pedido foi explícito: "deve ser verificado para que com certeza fique da
 * forma que eu coloquei". Estes testes cobrem exatamente isso — o que se digita
 * é o que se grava, e nada vira parcela sem data ou de valor zero pelo caminho.
 */
import { describe, it, expect } from 'vitest';
import { planejarParcelas, validarPlano, MAX_PARCELAS_LOTE } from './parcelasLote';

const BASE = {
  vencimentoBase: '2026-08-10',
  valorBase:      300,
  tipoBase:       'boleto',
  statusBase:     'verificar_pendente',
  isPaguePlay:    false,
};

describe('planejarParcelas — lote simples', () => {
  it('uma parcela é o comportamento antigo, intacto', () => {
    const { parcelas, total } = planejarParcelas({ ...BASE, quantidade: 1 });
    expect(parcelas).toEqual([{
      indice: 1, vencimento: '2026-08-10', valor: 300,
      tipo: 'boleto', status: 'verificar_pendente',
    }]);
    expect(total).toBe(300);
  });

  it('N parcelas repetem o valor e avançam de mês em mês (BookPlay)', () => {
    const { parcelas, total } = planejarParcelas({ ...BASE, quantidade: 3 });
    expect(parcelas.map(p => p.vencimento)).toEqual(['2026-08-10', '2026-09-10', '2026-10-10']);
    expect(parcelas.every(p => p.valor === 300)).toBe(true);
    expect(total).toBe(900);
  });

  it('PaguePlay cai no último dia de cada mês', () => {
    const { parcelas } = planejarParcelas({
      ...BASE, isPaguePlay: true, vencimentoBase: '2026-08-10', quantidade: 3,
    });
    expect(parcelas.map(p => p.vencimento)).toEqual(['2026-08-10', '2026-09-30', '2026-10-31']);
  });

  it('dia 31 satura em mês curto sem pular de mês', () => {
    const { parcelas } = planejarParcelas({ ...BASE, vencimentoBase: '2026-01-31', quantidade: 3 });
    expect(parcelas.map(p => p.vencimento)).toEqual(['2026-01-31', '2026-02-28', '2026-03-28']);
  });

  it('a forma de pagamento do lote vale para todas', () => {
    const { parcelas } = planejarParcelas({ ...BASE, tipoBase: 'pix', quantidade: 2 });
    expect(parcelas.every(p => p.tipo === 'pix')).toBe(true);
  });
});

describe('planejarParcelas — limites', () => {
  it('quantidade menor que 1 vira 1', () => {
    expect(planejarParcelas({ ...BASE, quantidade: 0 }).parcelas).toHaveLength(1);
    expect(planejarParcelas({ ...BASE, quantidade: -5 }).parcelas).toHaveLength(1);
  });

  it('quantidade quebrada é truncada', () => {
    expect(planejarParcelas({ ...BASE, quantidade: 3.9 }).parcelas).toHaveLength(3);
  });

  it('não passa do teto de parcelas do sistema', () => {
    expect(planejarParcelas({ ...BASE, quantidade: 500 }).parcelas).toHaveLength(MAX_PARCELAS_LOTE);
  });

  it('sem vencimento não planeja nada', () => {
    expect(planejarParcelas({ ...BASE, vencimentoBase: '', quantidade: 5 }).parcelas).toEqual([]);
  });
});

describe('planejarParcelas — parcelas personalizadas', () => {
  it('valor personalizado sobrescreve só a parcela ajustada', () => {
    const { parcelas, total } = planejarParcelas({
      ...BASE, quantidade: 3,
      personalizadas: [{ valor: 500 }, {}, { valor: 100 }],
    });
    expect(parcelas.map(p => p.valor)).toEqual([500, 300, 100]);
    expect(total).toBe(900);
  });

  // Linha deixada em branco na lista não pode virar parcela de R$ 0.
  it('campo vazio, nulo ou inválido cai no valor base', () => {
    const { parcelas } = planejarParcelas({
      ...BASE, quantidade: 4,
      personalizadas: [{ valor: null }, { valor: 0 }, { valor: NaN }, { valor: -50 }],
    });
    expect(parcelas.every(p => p.valor === 300)).toBe(true);
  });

  it('vencimento personalizado NÃO desloca as parcelas seguintes', () => {
    const { parcelas } = planejarParcelas({
      ...BASE, quantidade: 3,
      personalizadas: [{}, { vencimento: '2026-09-25' }, {}],
    });
    expect(parcelas.map(p => p.vencimento)).toEqual(['2026-08-10', '2026-09-25', '2026-10-10']);
  });

  // O caso citado no pedido: primeiro pagamento no boleto, o resto em outra forma.
  it('forma de pagamento pode variar entre as parcelas', () => {
    const { parcelas } = planejarParcelas({
      ...BASE, quantidade: 3,
      personalizadas: [{ tipo: 'boleto' }, { tipo: 'pix' }, { tipo: 'cartao' }],
    });
    expect(parcelas.map(p => p.tipo)).toEqual(['boleto', 'pix', 'cartao']);
  });

  it('lista de ajustes menor que a quantidade não quebra as demais', () => {
    const { parcelas } = planejarParcelas({
      ...BASE, quantidade: 4, personalizadas: [{ valor: 50 }],
    });
    expect(parcelas.map(p => p.valor)).toEqual([50, 300, 300, 300]);
  });

  it('centavos somam sem erro de float', () => {
    const { total } = planejarParcelas({
      ...BASE, quantidade: 3, valorBase: 0.1,
      personalizadas: [{ valor: 0.1 }, { valor: 0.2 }, { valor: 0.4 }],
    });
    expect(total).toBe(0.7);
  });
});

describe('validarPlano', () => {
  it('plano bom passa', () => {
    expect(validarPlano(planejarParcelas({ ...BASE, quantidade: 3 }))).toBeNull();
  });

  it('sem parcela nenhuma cobra o vencimento', () => {
    const plano = planejarParcelas({ ...BASE, vencimentoBase: '', quantidade: 2 });
    expect(validarPlano(plano)).toMatch(/vencimento da primeira/i);
  });

  it('aponta a parcela exata que está sem data', () => {
    const plano = planejarParcelas({ ...BASE, quantidade: 3 });
    plano.parcelas[1].vencimento = '';
    expect(validarPlano(plano)).toBe('Parcela 2: informe o vencimento.');
  });

  it('aponta a parcela exata que está sem valor', () => {
    const plano = planejarParcelas({ ...BASE, quantidade: 2 });
    plano.parcelas[1].valor = 0;
    expect(validarPlano(plano)).toBe('Parcela 2: informe um valor maior que zero.');
  });
});
