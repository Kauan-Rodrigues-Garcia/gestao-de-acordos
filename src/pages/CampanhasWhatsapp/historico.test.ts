import { describe, expect, it } from 'vitest';
import type { Participacao } from './campanhasWhatsapp.service';
import { casaVoto, porMes, resumirHistorico, situacaoDaParticipacao } from './historico';
import { casaEquipe, equipesDaLista, rotuloEquipe } from '@/pages/CampanhaFacil/envios';

function p(over: Partial<Participacao>): Participacao {
  return {
    lote_id: 'l', titulo: 'C', liberada_por: 'Líder', setor_nome: null, lancada_em: '2026-10-09T12:00:00Z',
    encerrada_em: null, ativa: true, total: 10, enviados: 4, nao_enviados: 1, bom: null, ...over,
  };
}

describe('histórico do operador', () => {
  it('situação: aberta, pausada pelo líder, encerrada', () => {
    expect(situacaoDaParticipacao(p({}))).toBe('aberta');
    expect(situacaoDaParticipacao(p({ ativa: false }))).toBe('pausada');
    expect(situacaoDaParticipacao(p({ encerrada_em: '2026-10-10T00:00:00Z', ativa: false }))).toBe('encerrada');
  });

  it('filtro e resumo pelo voto', () => {
    const lista = [p({ lote_id: 'a', bom: true }), p({ lote_id: 'b', bom: false }), p({ lote_id: 'c', bom: null })];
    expect(lista.filter(x => casaVoto(x, 'positivas')).map(x => x.lote_id)).toEqual(['a']);
    expect(lista.filter(x => casaVoto(x, 'negativas')).map(x => x.lote_id)).toEqual(['b']);
    expect(lista.filter(x => casaVoto(x, 'sem_voto')).map(x => x.lote_id)).toEqual(['c']);
    expect(resumirHistorico(lista)).toEqual({ campanhas: 3, positivas: 1, negativas: 1, semVoto: 1, mensagens: 30, enviadas: 12 });
  });

  it('agrupa por mês, do mais novo para o mais antigo', () => {
    const meses = porMes([p({ lancada_em: '2026-09-10T12:00:00Z' }), p({ lancada_em: '2026-10-02T12:00:00Z' })]);
    expect(meses.map(([k]) => k)).toEqual(['2026-10', '2026-09']);
  });
});

describe('filtro de equipe do passo 3', () => {
  const ops = [
    { id: '1', nome: 'Ana', equipe_id: 'e1', equipe_nome: 'Luciano' },
    { id: '2', nome: 'Bia', equipe_id: 'e2', equipe_nome: 'Equipe Rosa' },
    { id: '3', nome: 'Caio', equipe_id: 'e1', equipe_nome: 'Luciano' },
    { id: '4', nome: 'Davi', equipe_id: null, equipe_nome: null },
  ];
  it('lista as equipes com a contagem, «Sem equipe» no fim', () => {
    expect(equipesDaLista(ops)).toEqual([
      { id: 'e2', nome: 'Equipe Rosa', qtd: 1 },
      { id: 'e1', nome: 'Luciano', qtd: 2 },
      { id: 'sem', nome: 'Sem equipe', qtd: 1 },
    ]);
  });
  it('filtra por equipe e por sem equipe', () => {
    expect(ops.filter(o => casaEquipe(o, 'e1')).map(o => o.nome)).toEqual(['Ana', 'Caio']);
    expect(ops.filter(o => casaEquipe(o, 'sem')).map(o => o.nome)).toEqual(['Davi']);
    expect(ops.filter(o => casaEquipe(o, 'todas'))).toHaveLength(4);
  });
  it('não repete «Equipe» no nome', () => {
    expect(rotuloEquipe('Luciano')).toBe('Equipe Luciano');
    expect(rotuloEquipe('Equipe Rosa')).toBe('Equipe Rosa');
  });
});
