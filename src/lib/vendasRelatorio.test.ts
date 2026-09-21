import { describe, it, expect } from 'vitest';
import {
  raioXDoRelatorio, faixaDeParcelas, soNaoInformado, ROTULO_NAO_INFORMADO,
  mapaDeSetorDaFranquia, chaveDoNomeDaFranquia,
  type LinhaDoRelatorio,
} from './vendasRelatorio';

function linha(p: Partial<LinhaDoRelatorio>): LinhaDoRelatorio {
  return {
    nr_documento: p.nr_documento ?? String(Math.random()),
    data_venda: '2026-09-01',
    data_confirmacao: '2026-09-03',
    situacao: 'confirmada',
    contrato_assinado: true,
    valor_total: 1000,
    valor_recebido: 0,
    ...p,
  };
}

describe('raioXDoRelatorio', () => {
  const linhas: LinhaDoRelatorio[] = [
    linha({ nr_documento: '1', valor_total: 5000, valor_recebido: 500, login_vendedor: 'ana', nome_vendedor: 'Ana', uf: 'SP', tipo_recebimento: 'PIX', qtde_parcela: 1, veio_de_lead: true, valor_entrada: 200 }),
    linha({ nr_documento: '2', valor_total: 3000, login_vendedor: 'ana', nome_vendedor: 'Ana', uf: 'SP', qtde_parcela: 10, veio_de_lead: false }),
    linha({ nr_documento: '3', valor_total: 2000, contrato_assinado: false, login_vendedor: 'bia', nome_vendedor: 'Bia', uf: 'MG', veio_de_lead: false }),
    linha({ nr_documento: '4', valor_total: 1000, situacao: 'devolvida', motivo: 'Desistência', setor_cancelamento: 'SAC', login_vendedor: 'bia', nome_vendedor: 'Bia', veio_de_lead: false }),
    linha({ nr_documento: '5', valor_total: 700, situacao: 'cancelada', contrato_assinado: false, motivo: 'Falta de assinatura do contrato', login_vendedor: 'bia', nome_vendedor: 'Bia', data_confirmacao: '2026-09-05', veio_de_lead: false }),
  ];
  const r = raioXDoRelatorio(linhas);

  it('separa bruto de régua, e a régua é confirmada E assinada', () => {
    expect(r.linhas).toBe(5);
    expect(r.faturamento).toBe(11700);
    expect(r.naRegua).toBe(2);
    expect(r.valorNaRegua).toBe(8000);
    expect(r.ticketMedio).toBe(4000);
    expect(r.porGaveta.pendente_assinatura).toEqual({ linhas: 1, valor: 2000 });
    expect(r.recebido).toBe(500);
    expect(r.entrada).toBe(200);
    expect(r.comEntrada).toBe(1);
  });

  it('percentuais sobre o que chegou a ser confirmado', () => {
    expect(r.pctDevolucao).toBeCloseTo(1 / 5);
    expect(r.pctCancelamento).toBeCloseTo(1 / 5);
    expect(r.pctLead).toBeCloseTo(1 / 5);
    expect(r.diasAteConfirmar).toBeCloseTo((2 + 2 + 2 + 2 + 4) / 5);
  });

  it('vendedor ordena pelo que vale na régua, e conta perdas por pessoa', () => {
    expect(r.vendedores.map(v => v.rotulo)).toEqual(['Ana', 'Bia']);
    const bia = r.vendedores[1];
    expect(bia).toMatchObject({ linhas: 3, naRegua: 0, devolvidas: 1, canceladas: 1, semAssinatura: 1, detalhe: 'bia' });
  });

  it('coluna vazia vira «não informado», e não some', () => {
    const semUf = r.estados.find(e => e.rotulo === ROTULO_NAO_INFORMADO);
    expect(semUf?.linhas).toBe(2);
    expect(r.parcelas.map(p => p.rotulo)).toContain('À vista (1x)');
  });

  it('motivos só das perdas, e setor do cancelamento só das perdas', () => {
    expect(r.motivos).toEqual([
      { motivo: 'Desistência', canceladas: 0, devolvidas: 1, valor: 1000 },
      { motivo: 'Falta de assinatura do contrato', canceladas: 1, devolvidas: 0, valor: 700 },
    ]);
    expect(r.setoresCancelamento.reduce((s, f) => s + f.linhas, 0)).toBe(2);
  });

  it('série diária pelo dia da confirmação, em ordem', () => {
    expect(r.porDia.map(d => d.dia)).toEqual(['2026-09-03', '2026-09-05']);
    expect(r.porDia[0]).toMatchObject({ linhas: 4, naRegua: 2, valorNaRegua: 8000 });
  });

  it('arquivo sem a coluna de lead não inventa percentual', () => {
    const semLead = raioXDoRelatorio([linha({}), linha({})]);
    expect(semLead.pctLead).toBeNull();
    expect(soNaoInformado(semLead.lead)).toBe(true);
  });
});

describe('faixaDeParcelas', () => {
  it('agrupa do jeito que a pergunta é feita', () => {
    expect(faixaDeParcelas(1).rotulo).toBe('À vista (1x)');
    expect(faixaDeParcelas(6).rotulo).toBe('2 a 6x');
    expect(faixaDeParcelas(12).rotulo).toBe('7 a 12x');
    expect(faixaDeParcelas(18).rotulo).toBe('13 a 24x');
    expect(faixaDeParcelas(36).rotulo).toBe('25x ou mais');
    expect(faixaDeParcelas(null).rotulo).toBe(ROTULO_NAO_INFORMADO);
  });
});

describe('mapaDeSetorDaFranquia', () => {
  it('casa pelo código (geral) e pelo nome sem acento (prévia do setor); só o que está vinculado', () => {
    const mapa = mapaDeSetorDaFranquia([
      { codigo: '7131', nome: '18-BOOKPLAY MUNDIAL - VENDA PURA 2', estado: 'vinculado', setores: { nome: 'Vendas Bookplay' } },
      { codigo: '9999', nome: 'OUTRA', estado: 'novo', setores: null },
    ]);
    expect(mapa.get('7131')).toBe('Vendas Bookplay');
    expect(mapa.get(chaveDoNomeDaFranquia('18-bookplay mundial - venda pura 2'))).toBe('Vendas Bookplay');
    expect(mapa.has('9999')).toBe(false);
  });
});
