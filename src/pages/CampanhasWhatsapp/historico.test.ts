import { describe, expect, it } from 'vitest';
import type { Participacao } from './campanhasWhatsapp.service';
import { casaVoto, porMes, resumirHistorico, situacaoDaParticipacao } from './historico';
import {
  casaEquipe, casaEquipes, equipesDaLista, marcacaoAoTrocarEquipes, resumoDaEquipe, rotuloEquipe,
} from '@/pages/CampanhaFacil/envios';

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
      { id: 'e2', nome: 'Equipe Rosa', operadores: 1, lideres: 0 },
      { id: 'e1', nome: 'Luciano', operadores: 2, lideres: 0 },
      { id: 'sem', nome: 'Sem equipe', operadores: 1, lideres: 0 },
    ]);
  });
  it('filtra por equipe e por sem equipe', () => {
    expect(ops.filter(o => casaEquipe(o, 'e1')).map(o => o.nome)).toEqual(['Ana', 'Caio']);
    expect(ops.filter(o => casaEquipe(o, 'sem')).map(o => o.nome)).toEqual(['Davi']);
    expect(ops.filter(o => casaEquipe(o, 'todas'))).toHaveLength(4);
  });
  it('várias equipes de uma vez; nenhuma escolhida = todas', () => {
    expect(ops.filter(o => casaEquipes(o, new Set(['e2', 'sem']))).map(o => o.nome)).toEqual(['Bia', 'Davi']);
    expect(ops.filter(o => casaEquipes(o, new Set()))).toHaveLength(4);
  });
  // Lia lidera duas equipes; Rui é líder do setor sem equipe.
  const lia = {
    id: '5', nome: 'Lia', equipe_id: null, equipe_nome: null, lider: true,
    equipes_lider: [{ id: 'e1', nome: 'Luciano' }, { id: 'e2', nome: 'Equipe Rosa' }],
  };
  const rui = { id: '6', nome: 'Rui', equipe_id: null, equipe_nome: null, lider: true, equipes_lider: [] };
  const comLideres = [...ops, lia, rui];

  it('o líder aparece em cada equipe que lidera; sem equipe, em «Sem equipe»', () => {
    expect(equipesDaLista(comLideres)).toEqual([
      { id: 'e2', nome: 'Equipe Rosa', operadores: 1, lideres: 1 },
      { id: 'e1', nome: 'Luciano', operadores: 2, lideres: 1 },
      { id: 'sem', nome: 'Sem equipe', operadores: 1, lideres: 1 },
    ]);
    expect(comLideres.filter(o => casaEquipe(o, 'e1')).map(o => o.nome)).toEqual(['Ana', 'Caio', 'Lia']);
    expect(comLideres.filter(o => casaEquipe(o, 'e2')).map(o => o.nome)).toEqual(['Bia', 'Lia']);
    expect(comLideres.filter(o => casaEquipe(o, 'sem')).map(o => o.nome)).toEqual(['Davi', 'Rui']);
    expect(resumoDaEquipe({ operadores: 2, lideres: 1 })).toBe('2 operadores · 1 líder');
  });

  it('trocar as equipes: quem sai é desmarcado, operador que entra vem marcado, líder não', () => {
    const todosOps = new Set(['1', '2', '3', '4']);
    // De «todas» para só e1: ficam Ana e Caio, marcados; Lia aparece, desmarcada.
    const soE1 = marcacaoAoTrocarEquipes(comLideres, todosOps, [], ['e1']);
    expect([...soE1].sort()).toEqual(['1', '3']);
    // Marcou a Lia e desmarcou o Caio; agora entra e2: Bia chega marcada, o resto fica.
    const ajustado = new Set(['1', '5']);
    expect([...marcacaoAoTrocarEquipes(comLideres, ajustado, ['e1'], ['e1', 'e2'])].sort()).toEqual(['1', '2', '5']);
    // Volta para «todas»: Davi chega marcado, Rui (líder) não.
    expect([...marcacaoAoTrocarEquipes(comLideres, ajustado, ['e1'], [])].sort()).toEqual(['1', '2', '4', '5']);
  });
  it('não repete «Equipe» no nome', () => {
    expect(rotuloEquipe('Luciano')).toBe('Equipe Luciano');
    expect(rotuloEquipe('Equipe Rosa')).toBe('Equipe Rosa');
  });
});
