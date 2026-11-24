import { describe, it, expect } from 'vitest';
import {
  somarDias, janelaDe, intervaloDaConsulta, resumir, porDia, extrasAbsorvidos,
  conversaoDe, pessoasNoEscopo, distribuirPorSetor, ordenarPessoas, agendaVazia,
  type LinhaAgenda, type FontesAgenda, type PessoaAgenda,
} from './agendados';

let seq = 0;
function linha(p: Partial<LinhaAgenda> & { vencimento: string }): LinhaAgenda {
  seq += 1;
  return {
    id: p.id ?? `a${seq}`,
    operador_id: p.operador_id ?? 'op1',
    setor_id: p.setor_id ?? 's1',
    vencimento: p.vencimento,
    valor: 'valor' in p ? p.valor ?? null : 100,
    status: p.status ?? 'verificar_pendente',
    tipo_vinculo: p.tipo_vinculo ?? 'direto',
    par_acordo_id: p.par_acordo_id ?? null,
  };
}

const MES = { inicio: '2026-11-01', fim: '2026-11-30' };

describe('datas', () => {
  it('soma dias atravessando o mês e o ano', () => {
    expect(somarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(somarDias('2026-12-28', 7)).toBe('2027-01-04');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('a janela vai de hoje a hoje + 7, sem sobrepor amanhã e próximos', () => {
    expect(janelaDe('2026-11-23')).toEqual({
      hoje: '2026-11-23', amanha: '2026-11-24',
      proximosDe: '2026-11-25', proximosAte: '2026-11-30',
    });
  });

  it('no mês corrente a consulta estica até hoje + 7; no fechado, não', () => {
    expect(intervaloDaConsulta({ ...MES, hoje: '2026-11-28', mesCorrente: true }))
      .toEqual({ de: '2026-11-01', ate: '2026-12-05' });
    expect(intervaloDaConsulta({ ...MES, hoje: '2026-11-05', mesCorrente: true }))
      .toEqual({ de: '2026-11-01', ate: '2026-11-30' });
    expect(intervaloDaConsulta({ ...MES, hoje: '2026-12-10', mesCorrente: false }))
      .toEqual({ de: '2026-11-01', ate: '2026-11-30' });
  });
});

describe('resumir', () => {
  it('separa os três estados e a baixa que falta', () => {
    const r = resumir([
      linha({ vencimento: '2026-11-10', status: 'pago', valor: 200 }),
      linha({ vencimento: '2026-11-11', status: 'nao_pago', valor: 50 }),
      linha({ vencimento: '2026-11-12', status: 'verificar_pendente', valor: 30 }),
      linha({ vencimento: '2026-11-25', status: 'verificar_pendente', valor: 70 }),
    ], { ...MES, hoje: '2026-11-23' });
    expect(r.total).toEqual({ qtd: 4, valor: 350 });
    expect(r.pago).toEqual({ qtd: 1, valor: 200 });
    expect(r.naoPago).toEqual({ qtd: 1, valor: 50 });
    expect(r.aVerificar).toEqual({ qtd: 2, valor: 100 });
    // Só o de 12/11 já venceu sem baixa; o de 25/11 é agenda.
    expect(r.vencidoSemBaixa).toEqual({ qtd: 1, valor: 30 });
  });

  it('conversão é sobre o que tem desfecho, e «a verificar» não é falha', () => {
    const r = resumir([
      linha({ vencimento: '2026-11-10', status: 'pago' }),
      linha({ vencimento: '2026-11-10', status: 'verificar_pendente' }),
      linha({ vencimento: '2026-11-10', status: 'verificar_pendente' }),
    ], { ...MES, hoje: '2026-11-23' });
    expect(r.conversao).toBe(100);
  });

  it('conversão nula quando nada tem desfecho, e cortada (não arredondada)', () => {
    expect(conversaoDe(0, 0)).toBeNull();
    expect(conversaoDe(249, 1)).toBe(99);
    expect(conversaoDe(2, 1)).toBe(66);
  });

  it('hoje, amanhã e próximos dias, inclusive depois da virada do mês', () => {
    const r = resumir([
      linha({ vencimento: '2026-11-28', status: 'pago', valor: 10 }),
      linha({ vencimento: '2026-11-28', valor: 20 }),
      linha({ vencimento: '2026-11-29', valor: 30 }),
      linha({ vencimento: '2026-12-03', valor: 40 }),
      linha({ vencimento: '2026-12-06', valor: 99 }), // hoje + 8: fora
    ], { ...MES, hoje: '2026-11-28' });
    expect(r.hoje).toEqual({ qtd: 2, valor: 30 });
    expect(r.hojePago).toEqual({ qtd: 1, valor: 10 });
    expect(r.amanha).toEqual({ qtd: 1, valor: 30 });
    expect(r.proximos).toEqual({ qtd: 1, valor: 40 });
    // O total do mês não leva dezembro.
    expect(r.total).toEqual({ qtd: 3, valor: 60 });
  });

  it('valor em texto ou nulo não quebra a soma', () => {
    const r = resumir([
      linha({ vencimento: '2026-11-10', valor: '150.5' }),
      linha({ vencimento: '2026-11-10', valor: null }),
    ], { ...MES, hoje: '2026-11-23' });
    expect(r.total).toEqual({ qtd: 2, valor: 150.5 });
  });
});

describe('Direto/Extra', () => {
  const direto = linha({ id: 'd1', operador_id: 'op1', vencimento: '2026-11-10', valor: 300, par_acordo_id: 'e1' });
  const extra = linha({
    id: 'e1', operador_id: 'op2', vencimento: '2026-11-10', valor: 300,
    tipo_vinculo: 'extra', par_acordo_id: 'd1',
  });

  it('o EXTRA cujo DIRETO está no grupo sai da soma do grupo', () => {
    expect([...extrasAbsorvidos([direto, extra])]).toEqual(['e1']);
    const grupo = resumir([direto, extra], { ...MES, hoje: '2026-11-23', semExtraDoPar: true });
    expect(grupo.total).toEqual({ qtd: 1, valor: 300 });
  });

  it('o EXTRA sozinho (DIRETO fora do grupo) continua contando', () => {
    const grupo = resumir([extra], { ...MES, hoje: '2026-11-23', semExtraDoPar: true });
    expect(grupo.total).toEqual({ qtd: 1, valor: 300 });
    expect(grupo.extra).toEqual({ qtd: 1, valor: 300 });
  });

  it('na linha da pessoa o EXTRA é dela', () => {
    const pessoa = resumir([direto, extra], { ...MES, hoje: '2026-11-23' });
    expect(pessoa.total.qtd).toBe(2);
  });

  it('o calendário também não conta o par duas vezes', () => {
    const dias = porDia([direto, extra], { ...MES, semExtraDoPar: true });
    expect(dias).toHaveLength(30);
    expect(dias.find(d => d.dia === '2026-11-10')?.total).toEqual({ qtd: 1, valor: 300 });
  });
});

describe('porDia', () => {
  it('um dia por data do mês, com os três estados', () => {
    const dias = porDia([
      linha({ vencimento: '2026-11-05', status: 'pago', valor: 10 }),
      linha({ vencimento: '2026-11-05', status: 'nao_pago', valor: 20 }),
      linha({ vencimento: '2026-11-05', valor: 30 }),
      linha({ vencimento: '2026-12-01', valor: 999 }),
    ], MES);
    const d5 = dias.find(d => d.dia === '2026-11-05')!;
    expect(d5.pago.valor).toBe(10);
    expect(d5.naoPago.valor).toBe(20);
    expect(d5.aVerificar.valor).toBe(30);
    expect(dias.reduce((s, d) => s + d.total.valor, 0)).toBe(60);
  });
});

describe('pessoas e setores', () => {
  const fontes: FontesAgenda = {
    operadorEquipeMap: {
      op1: { equipe_id: 'eqA', equipe_nome: 'Equipe A', setor_id: 's1' },
      op2: { equipe_id: 'eqB', equipe_nome: 'Equipe B', setor_id: 's2' },
      // Clone: do s1, emprestado à equipe C do s2.
      op3: { equipe_id: 'eqA', equipe_nome: 'Equipe A', setor_id: 's1' },
    },
    equipesExtrasPorOperador: { op3: ['eqC'] },
    setorDaEquipe: new Map([['eqA', 's1'], ['eqB', 's2'], ['eqC', 's2']]),
  };
  const operadores = [
    { id: 'op1', nome: 'Ana' },
    { id: 'op2', nome: 'Bruno' },
    { id: 'op3', nome: 'Carla' },
    { id: 'op4', nome: 'Davi', setor_id: 's2' }, // sem equipe
  ];

  it('setor vale pelos setores em que a pessoa conta, clone incluso', () => {
    const s2 = pessoasNoEscopo({ operadores, fontes, setorIds: ['s2'], equipeIds: [] });
    expect(s2.map(p => p.id).sort()).toEqual(['op2', 'op3', 'op4']);
  });

  it('equipe manda sobre setor', () => {
    const c = pessoasNoEscopo({ operadores, fontes, setorIds: ['s1'], equipeIds: ['eqC'] });
    expect(c.map(p => p.id)).toEqual(['op3']);
  });

  it('sem filtro, cada pessoa aparece uma vez, no setor dela', () => {
    const todas = pessoasNoEscopo({ operadores, fontes, setorIds: [], equipeIds: [] });
    const grupos = distribuirPorSetor({ pessoas: todas, linhas: [], setorIds: [] });
    const contagem = grupos.flatMap(g => g.pessoas.map(x => x.pessoa.id));
    expect(contagem.sort()).toEqual(['op1', 'op2', 'op3', 'op4']);
    expect(grupos.find(g => g.setorId === 's1')?.pessoas.map(x => x.pessoa.id).sort()).toEqual(['op1', 'op3']);
  });

  it('com os dois setores marcados, o clone aparece nos dois e o acordo vai pelo setor dele', () => {
    const pessoas = pessoasNoEscopo({ operadores, fontes, setorIds: ['s1', 's2'], equipeIds: [] });
    const linhas = [
      linha({ id: 'x1', operador_id: 'op3', setor_id: 's2', vencimento: '2026-11-10' }),
      linha({ id: 'x2', operador_id: 'op3', setor_id: 's1', vencimento: '2026-11-10' }),
      linha({ id: 'x3', operador_id: 'op3', setor_id: null, vencimento: '2026-11-10' }),
    ];
    const grupos = distribuirPorSetor({ pessoas, linhas, setorIds: ['s1', 's2'] });
    const daCarla = (sid: string) => grupos.find(g => g.setorId === sid)!
      .pessoas.find(x => x.pessoa.id === 'op3')!.linhas.map(l => l.id).sort();
    expect(daCarla('s2')).toEqual(['x1']);
    // Sem setor no acordo: fica no setor da pessoa.
    expect(daCarla('s1')).toEqual(['x2', 'x3']);
  });
});

describe('ordem e sinais', () => {
  const p = (id: string, nome: string): PessoaAgenda => ({
    id, nome, foto: null, equipeNome: null, setorPrincipal: 's1', setores: ['s1'],
  });
  const r = (linhas: LinhaAgenda[]) => resumir(linhas, { ...MES, hoje: '2026-11-23' });

  it('menor conversão primeiro, e quem não tem desfecho vai para o fim', () => {
    const itens = [
      { pessoa: p('a', 'Ana'), resumo: r([]) },
      { pessoa: p('b', 'Bia'), resumo: r([linha({ vencimento: '2026-11-02', status: 'nao_pago' })]) },
      { pessoa: p('c', 'Caio'), resumo: r([linha({ vencimento: '2026-11-02', status: 'pago' })]) },
    ];
    expect(ordenarPessoas(itens, 'conversao').map(x => x.pessoa.id)).toEqual(['b', 'c', 'a']);
  });

  it('agenda vazia: nada aberto hoje, nem amanhã, nem nos próximos dias', () => {
    expect(agendaVazia(r([linha({ vencimento: '2026-11-23', status: 'pago' })]))).toBe(true);
    expect(agendaVazia(r([linha({ vencimento: '2026-11-26' })]))).toBe(false);
  });
});
