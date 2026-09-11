/**
 * rhComissao.test.ts — a comissão sugerida no RH Gestão.
 *
 * O botão escreve na folha, então os casos seguram o que ele NÃO pode fazer:
 * tocar linha que não é de comissão, linha que já saiu das mãos de quem
 * preenche, linha fora da folha — e escrever zero. Zero é um pagamento de zero;
 * quem não atingiu faixa é decisão do líder, que tem «fora da folha».
 */
import { describe, it, expect } from 'vitest';
import { calcularComissao, type ConfigComissao, type EntradaComissao } from '@/services/comissao/comissao';
import { sugestaoDaComissao, planoDePreenchimento, type SugestaoComissao } from './rhComissao';

function config(): ConfigComissao {
  return {
    id: 'cfg', empresaId: 'e1', setorId: 's1', equipeId: null, ano: 2026, mes: 8,
    modoIndireta: 'junto', pctIndireta: null, pctIndiretaEspecial: null,
    regraSetor: 'nenhuma', multiplicador: null,
    setorMetaConfirmadaEm: null, setorMetaConfirmadaPor: null, setorMetaConfirmadaPorNome: null,
    faixas: [
      { ordem: 1, pct: 1.75, pctEspecial: null },
      { ordem: 2, pct: 2.11, pctEspecial: null },
    ],
  };
}

function resultado(over: Partial<EntradaComissao> = {}) {
  const cfg = config();
  return calcularComissao({
    metaBruta: 34_000, metasExtrasBrutas: [37_000], metaIndiretaBruta: null,
    recebidoDireto: 38_450, recebidoIndiretoBruto: 0, fatorUnidade: 1,
    config: cfg, doSetor: cfg,
    ...over,
  });
}

const texto = (s: string) => s.replace(/\s+/g, ' ');

describe('sugestaoDaComissao', () => {
  it('com faixa atingida, sugere o total e diz a faixa', () => {
    const s = sugestaoDaComissao(resultado());
    expect(s.valor).toBe(811.3);
    expect(texto(s.rotulo)).toMatch(/^Comissão R\$ 811,30 · 2ª Meta$/);
  });

  it('com o benefício do setor ativo, o rótulo avisa', () => {
    const cfg = { ...config(), regraSetor: 'multiplicador' as const, multiplicador: 2, setorMetaConfirmadaEm: '2026-08-29T10:00:00Z' };
    const s = sugestaoDaComissao(resultado({ config: cfg, doSetor: cfg }));
    expect(s.valor).toBe(1_622.59);
    expect(texto(s.rotulo)).toContain('benefício do setor');
  });

  it('sem faixa atingida, não sugere valor', () => {
    expect(sugestaoDaComissao(resultado({ recebidoDireto: 30_000 })))
      .toEqual({ valor: null, rotulo: 'Nenhuma faixa atingida' });
  });

  it('sem meta no mês de apuração', () => {
    expect(sugestaoDaComissao(resultado({ metaBruta: null })))
      .toEqual({ valor: null, rotulo: 'Sem meta no mês de apuração' });
  });

  it('sem configuração no mês', () => {
    expect(sugestaoDaComissao(resultado({ config: null, doSetor: null })))
      .toEqual({ valor: null, rotulo: 'Comissão não configurada no mês' });
  });
});

type Linha = Parameters<typeof planoDePreenchimento>[0][number];

function linha(over: Partial<Linha> = {}): Linha {
  return {
    id: 'l1', operador_id: 'op1', status: 'pendente', dispensado: false,
    valor: null, tipo_remuneracao_snapshot: 'comissao',
    ...over,
  };
}

const SUGESTOES: Record<string, SugestaoComissao> = {
  op1: { valor: 811.3, rotulo: 'Comissão R$ 811,30 · 2ª Meta' },
  op2: { valor: null, rotulo: 'Nenhuma faixa atingida' },
};

describe('planoDePreenchimento', () => {
  it('preenche a linha de comissão ainda sem valor', () => {
    expect(planoDePreenchimento([linha()], SUGESTOES))
      .toEqual({ preencher: [{ id: 'l1', valor: 811.3 }], substituem: 0 });
  });

  it('linha que já tem o valor sugerido fica como está', () => {
    expect(planoDePreenchimento([linha({ valor: 811.3, status: 'preenchido' })], SUGESTOES).preencher)
      .toEqual([]);
  });

  it('o numeric que chega como texto compara em centavos', () => {
    expect(planoDePreenchimento([linha({ valor: '811.30' as unknown as number })], SUGESTOES).preencher)
      .toEqual([]);
  });

  it('valor diferente é substituído, e a contagem avisa', () => {
    expect(planoDePreenchimento([linha({ valor: 700, status: 'preenchido' })], SUGESTOES))
      .toEqual({ preencher: [{ id: 'l1', valor: 811.3 }], substituem: 1 });
  });

  it('linha devolvida e linha concluída pelo líder ainda são editáveis', () => {
    const r = planoDePreenchimento([
      linha({ id: 'a', status: 'devolvido_rh', valor: 500 }),
      linha({ id: 'b', status: 'concluido_lider', valor: 500 }),
    ], SUGESTOES);
    expect(r.preencher.map(p => p.id)).toEqual(['a', 'b']);
  });

  it('não toca linha de premiação', () => {
    expect(planoDePreenchimento([linha({ tipo_remuneracao_snapshot: 'premiacao' })], SUGESTOES).preencher)
      .toEqual([]);
  });

  it('não toca linha fora da folha', () => {
    expect(planoDePreenchimento([linha({ dispensado: true })], SUGESTOES).preencher).toEqual([]);
  });

  it('não toca linha que já saiu das mãos de quem preenche', () => {
    expect(planoDePreenchimento([
      linha({ status: 'validado_gerencia' }),
      linha({ status: 'enviado_rh' }),
      linha({ status: 'aprovado_rh' }),
    ], SUGESTOES).preencher).toEqual([]);
  });

  it('sem sugestão, não escreve zero', () => {
    expect(planoDePreenchimento([
      linha({ operador_id: 'op2' }),
      linha({ operador_id: 'op-sem-calculo' }),
    ], SUGESTOES).preencher).toEqual([]);
  });
});
