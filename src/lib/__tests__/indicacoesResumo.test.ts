import { describe, it, expect } from 'vitest';
import {
  casaComBusca, iniciais, porDiaDasIndicacoes, posicaoNoRanking, resumoDoMes, somarDias, variacaoPct,
} from '../indicacoesResumo';

const ind = (data: string, instituicao = 'Escola A', telefone: string | null = null) => ({
  instituicao, telefone, data_indicacao: data, operador_id: 'eu',
});

describe('resumoDoMes', () => {
  // 2026-10-01 é quinta-feira.
  const hoje = '2026-10-08';

  it('conta total, escolas distintas (sem acento/caixa), hoje e a semana', () => {
    const r = resumoDoMes([
      ind('2026-10-08', 'Colégio São José'), ind('2026-10-08', 'colegio sao  jose'),
      ind('2026-10-02', 'Escola B'), ind('2026-09-30', 'Escola C'),
    ], hoje);
    expect(r.total).toBe(4);
    expect(r.escolas).toBe(3);
    expect(r.hoje).toBe(2);
    expect(r.semana).toBe(3);
    expect(r.melhorDia).toEqual({ dia: '2026-10-08', quantidade: 2 });
  });

  it('a sequência pula o fim de semana sem quebrar', () => {
    // sex 02, seg 05, ter 06, qua 07, qui 08 — sábado e domingo vazios.
    const r = resumoDoMes(['2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map(d => ind(d)), hoje);
    expect(r.sequencia).toBe(5);
  });

  it('hoje ainda sem indicação começa a contar de ontem', () => {
    const r = resumoDoMes([ind('2026-10-06'), ind('2026-10-07')], hoje);
    expect(r.sequencia).toBe(2);
  });

  it('um dia útil vazio quebra a sequência', () => {
    const r = resumoDoMes([ind('2026-10-05'), ind('2026-10-07'), ind('2026-10-08')], hoje);
    expect(r.sequencia).toBe(2);
  });

  it('sem nada, tudo zero e sem melhor dia', () => {
    const r = resumoDoMes([], hoje);
    expect(r).toMatchObject({ total: 0, escolas: 0, hoje: 0, semana: 0, diasAtivos: 0, sequencia: 0, melhorDia: null });
  });
});

describe('auxiliares', () => {
  it('porDia ordena e agrupa', () => {
    expect(porDiaDasIndicacoes([ind('2026-10-03'), ind('2026-10-01'), ind('2026-10-03')]))
      .toEqual([{ dia: '2026-10-01', quantidade: 1 }, { dia: '2026-10-03', quantidade: 2 }]);
  });

  it('somarDias atravessa mês', () => {
    expect(somarDias('2026-10-01', -1)).toBe('2026-09-30');
  });

  it('posição no ranking é 1-based, null quando não está', () => {
    expect(posicaoNoRanking([{ operador_id: 'a' }, { operador_id: 'eu' }], 'eu')).toBe(2);
    expect(posicaoNoRanking([{ operador_id: 'a' }], 'eu')).toBeNull();
  });

  it('variação sem base não inventa percentual', () => {
    expect(variacaoPct(12, 10)).toBe(20);
    expect(variacaoPct(5, 0)).toBeNull();
  });

  it('iniciais', () => {
    expect(iniciais('Ana Clara Victorio')).toBe('AV');
    expect(iniciais('kevin')).toBe('KE');
  });

  it('busca ignora acento e acha telefone pelos dígitos', () => {
    const item = { instituicao: 'Colégio São José', gestora: 'Maria', telefone: '(18) 93505-6541', perfis: { nome: 'Kevin' } };
    expect(casaComBusca(item, 'sao jose')).toBe(true);
    expect(casaComBusca(item, 'kevin')).toBe(true);
    expect(casaComBusca(item, '6541')).toBe(true);
    expect(casaComBusca(item, 'outra')).toBe(false);
  });
});
