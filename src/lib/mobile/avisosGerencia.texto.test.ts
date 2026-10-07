/**
 * Avisos da gerência e Cofen só em H.O. — migration 20261007120000 (parte 3 do
 * app, desenho 2026-10-06-app-celular-gerencia §3).
 */
import { describe, it, expect } from 'vitest';
import {
  montarAvisos, montarAvisosDeSaida, montarAvisosMetaEquipeGerencia, montarAvisosMetaOperadorGerencia,
  montarAvisosMetaSetor, montarResumosEquipe, montarResumosSetor,
  type GerenteDaEquipe, type ItemFila, type OperadorNaMeta,
} from '../../../supabase/functions/enviar-push/texto';

const nbsp = (s: string) => s.replace(/\u00a0/g, ' ');

describe('Cofen: todo aviso só em H.O.', () => {
  const item = (id: number, valor: number, valorHo: number): ItemFila => ({
    id, perfil_id: 'ana', valor, valor_ho: valorHo, forma_pagamento: 'boleto_pix',
    forma_detalhe: 'Pix', nome_cliente: 'MARIA SILVA', codigo: '12345',
  });

  it('pagamento: o H.O., dito com clareza, sem o bruto', () => {
    const [r] = montarAvisos([item(1, 1000, 226)], { ana: { em_ho: true, antes: 0, depois: 226, degraus: [] } }, 3);
    expect(nbsp(r.avisos[0].corpo)).toBe('Maria S. · NR 12345\nPix · R$ 226,00 em H.O.');
    expect(r.avisos[0].corpo).not.toContain('1.000');
  });

  it('pagamento de quem não é Cofen continua no bruto', () => {
    const [r] = montarAvisos([item(1, 1000, 226)], { ana: { em_ho: false, antes: 0, depois: 1000, degraus: [] } }, 3);
    expect(nbsp(r.avisos[0].corpo)).toBe('Maria S. · NR 12345\nPix · R$ 1.000,00');
  });

  it('vários pagamentos: total e mês em H.O.', () => {
    const itens = [item(1, 1000, 226), item(2, 1000, 226), item(3, 1000, 226), item(4, 1000, 226)];
    const [r] = montarAvisos(itens, { ana: { em_ho: true, antes: 0, depois: 2260, degraus: [] } }, 3);
    expect(nbsp(r.avisos[0].corpo)).toBe('R$ 904,00 em H.O. · 4 Pix\nNo mês: R$ 2.260,00 em H.O.');
  });

  it('pagamento retirado: H.O. e o de hoje em H.O.', () => {
    const [r] = montarAvisosDeSaida([{ ...item(1, 1000, 226), motivo: 'removido' }],
      { ana: { em_ho: true, hoje: 452, mes: 2260 } }, 3);
    expect(nbsp(r.avisos[0].corpo)).toBe('Maria S. · NR 12345 · R$ 226,00 em H.O.\nRecebido hoje: R$ 452,00 em H.O.');
  });

  it('resumo da equipe Cofen: em H.O.', () => {
    const [r] = montarResumosEquipe([{
      equipe_id: 'e1', equipe_nome: 'Cofen Bruna', dia: '2026-10-07', em_ho: true,
      novo: 226, qtd_novos: 1, hoje: 904, desde: null, ate: '2026-10-07T13:10:00Z', destinatarios: ['l'],
    }]);
    expect(nbsp(r.avisos[0].titulo)).toBe('Cofen Bruna · R$ 226,00 em H.O.');
    expect(nbsp(r.avisos[0].corpo)).toBe('1 pagamento até as 10h\nRecebido hoje: R$ 904,00 em H.O.');
  });
});

describe('gerência: o setor alcançou a meta', () => {
  it('com o total do mês; Cofen em H.O.', () => {
    const r = montarAvisosMetaSetor([
      { setor_id: 's1', setor_nome: 'Play 1', mes: '2026-10', em_ho: false, total: '420312', destinatarios: ['g1', 'g1'] },
      { setor_id: 's2', setor_nome: 'Conecta Play', mes: '2026-10', em_ho: true, total: 95000, destinatarios: ['g2'] },
    ]);
    const g1 = r.find(p => p.perfilId === 'g1')!;
    expect(g1.avisos).toHaveLength(1);
    expect(g1.avisos[0]).toMatchObject({ titulo: 'Play 1 alcançou a meta do mês', url: '/#/m/setor', icone: 'meta' });
    expect(nbsp(g1.avisos[0].corpo)).toBe('Parabéns! R$ 420.312,00 no mês.');
    expect(nbsp(r.find(p => p.perfilId === 'g2')!.avisos[0].corpo)).toBe('Parabéns! R$ 95.000,00 em H.O. no mês.');
  });
});

describe('gerência: equipes e pessoas do setor', () => {
  const gerentes: GerenteDaEquipe[] = [
    { equipe_id: 'e1', setor_id: 's1', setor_nome: 'Play 1', perfil_id: 'g1' },
    { equipe_id: 'e2', setor_id: 's1', setor_nome: 'Play 1', perfil_id: 'g1' },
  ];

  it('equipe alcançou a meta: para o gerente do setor, sem valores', () => {
    const [r] = montarAvisosMetaEquipeGerencia(
      [{ equipe_id: 'e1', equipe_nome: 'Equipe Bryan', mes: '2026-10', destinatarios: ['lider'] }], gerentes);
    expect(r.perfilId).toBe('g1');
    expect(r.avisos).toEqual([{
      titulo: 'Equipe Bryan alcançou a meta', corpo: 'Play 1 · meta do mês concluída',
      tag: 'meta-equipe-g:e1:2026-10', url: '/#/m/setor', icone: 'equipe',
    }]);
  });

  const op = (perfil: string, nome: string, faixa: number, equipes: string[]): OperadorNaMeta => ({
    perfil_id: perfil, nome, mes: '2026-10', faixa, proprio: true,
    equipes: equipes.map(e => ({ equipe_id: e, equipe_nome: e === 'e1' ? 'Equipe Bryan' : 'Equipe Ana', destinatarios: [] })),
  });

  it('uma pessoa: o nome, a faixa, a equipe e o setor', () => {
    const [r] = montarAvisosMetaOperadorGerencia([op('m', 'MARIA SILVA', 2, ['e1'])], gerentes);
    expect(r.perfilId).toBe('g1');
    expect(r.avisos[0]).toMatchObject({
      titulo: 'Maria S. alcançou a 2ª meta', corpo: 'Equipe Bryan · Play 1',
      url: '/#/m/setor?aba=quartis', icone: 'operador',
    });
  });

  it('várias pessoas na mesma rodada: UM aviso, sem repetir quem está em duas equipes', () => {
    const [r] = montarAvisosMetaOperadorGerencia([
      op('m', 'MARIA SILVA', 2, ['e1', 'e2']),
      op('j', 'JOAO PEREIRA', 1, ['e2']),
      op('a', 'ANA LIMA', 3, ['e1']),
    ], gerentes);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].titulo).toBe('3 pessoas do Play 1 alcançaram metas');
    expect(r.avisos[0].corpo).toBe('Ana L. (3ª), Maria S. (2ª), Joao P. (1ª)');
  });

  it('a mesma rodada dá a mesma etiqueta; outra rodada, outra', () => {
    const a = montarAvisosMetaOperadorGerencia([op('m', 'MARIA SILVA', 2, ['e1']), op('j', 'JOAO', 1, ['e2'])], gerentes);
    const b = montarAvisosMetaOperadorGerencia([op('j', 'JOAO', 1, ['e2']), op('m', 'MARIA SILVA', 2, ['e1'])], gerentes);
    const c = montarAvisosMetaOperadorGerencia([op('m', 'MARIA SILVA', 3, ['e1'])], gerentes);
    expect(a[0].avisos[0].tag).toBe(b[0].avisos[0].tag);
    expect(a[0].avisos[0].tag).not.toBe(c[0].avisos[0].tag);
  });

  it('equipe sem gerente com aviso ligado: ninguém recebe', () => {
    expect(montarAvisosMetaOperadorGerencia([op('m', 'MARIA', 1, ['e9'])], gerentes)).toEqual([]);
  });
});

describe('gerência: resumo do setor no minuto 10', () => {
  const base = {
    setor_id: 's1', setor_nome: 'Play 1', dia: '2026-10-07', em_ho: false,
    hoje: 38540, ate: '2026-10-07T17:10:00Z', destinatarios: ['g1'],
  };

  it('na última hora: quanto entrou, quantos pagamentos e o total do dia', () => {
    const [r] = montarResumosSetor([{ ...base, novo: 12400, qtd_novos: 8, desde: '2026-10-07T16:10:00Z' }]);
    expect(nbsp(r.avisos[0].titulo)).toBe('Play 1 recebeu R$ 12.400,00');
    expect(nbsp(r.avisos[0].corpo)).toBe('8 pagamentos na última hora\nHoje: R$ 38.540,00');
    expect(r.avisos[0]).toMatchObject({ url: '/#/m/setor?aba=hoje', icone: 'resumo' });
  });

  it('hora anterior sem nada: diz desde quando', () => {
    const [r] = montarResumosSetor([{ ...base, novo: 500, qtd_novos: 1, desde: '2026-10-07T14:10:00Z' }]);
    expect(nbsp(r.avisos[0].corpo)).toBe('1 pagamento desde as 11h\nHoje: R$ 38.540,00');
  });

  it('Cofen: em H.O.; primeiro do dia; nada quando não entrou nada', () => {
    const [r] = montarResumosSetor([{ ...base, em_ho: true, novo: 226, qtd_novos: 0, hoje: 904, desde: null }]);
    expect(nbsp(r.avisos[0].titulo)).toBe('Play 1 recebeu R$ 226,00 em H.O.');
    expect(nbsp(r.avisos[0].corpo)).toBe('Até as 14h\nHoje: R$ 904,00 em H.O.');
    expect(montarResumosSetor([{ ...base, novo: 0, qtd_novos: 0, desde: null }])).toEqual([]);
  });
});
