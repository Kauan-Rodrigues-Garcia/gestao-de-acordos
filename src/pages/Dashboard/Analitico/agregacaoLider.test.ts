/**
 * agregacaoLider.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * As contas da visão de líder do Analítico.
 *
 * Este código morava em quatro `useMemo` dentro de um componente de 1.063
 * linhas, e por isso não tinha um único teste: exercitá-lo exigia montar a tela
 * inteira. Os três incidentes de clone que o projeto já teve nasceram aí.
 *
 * O cenário base é o que causou todos eles: **Maria pertence ao Play 4
 * (setor A) e foi clonada no Play 5 (setor B).** Ela tem que aparecer nos dois
 * setores sem sair do primeiro, e uma vez só em cada lista.
 */
import { describe, it, expect } from 'vitest';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import type {
  ResumoOperadorAnalitico, ResumoMensalAnalitico, EquipeAnalitico,
} from '@/services/analitico/analitico.service';
import {
  contaNoSetor, filtrarResumos, agruparPorEquipe, calcularMetricas,
  perfilIdsDoSetor, filtrarOrfaosDoSetor, filtrarLinhasPorData,
  type VinculosOperador,
} from './agregacaoLider';

// ── Cenário ────────────────────────────────────────────────────────────────

const EQUIPES: EquipeAnalitico[] = [
  { id: 'eq-play4', nome: 'Play 4',  setor_id: 'setor-A' },
  { id: 'eq-play5', nome: 'Play 5',  setor_id: 'setor-B' },
  { id: 'eq-digi',  nome: 'Digital', setor_id: 'setor-B' },
];

/** Maria é do Play 4 e clone no Play 5. João é do Play 5 e só dele. */
const VINCULOS: VinculosOperador = {
  operadorEquipeMap: {
    'maria': { equipe_id: 'eq-play4', equipe_nome: 'Play 4', setor_id: 'setor-A' },
    'joao':  { equipe_id: 'eq-play5', equipe_nome: 'Play 5', setor_id: 'setor-B' },
    'ana':   { equipe_id: null,       equipe_nome: 'Sem equipe', setor_id: 'setor-A' },
  },
  equipesExtras: { 'maria': ['eq-play5'] },
  setorDaEquipe: new Map([
    ['eq-play4', 'setor-A'], ['eq-play5', 'setor-B'], ['eq-digi', 'setor-B'],
  ]),
};

function resumo(id: string, over: Partial<ResumoOperadorAnalitico> = {}): ResumoOperadorAnalitico {
  return {
    operador_id: id, operador_usuario: id, operador_nome: id,
    total_recebido: 100, total_ho: 25, total_pagamentos: 2,
    ...over,
  };
}

const RESUMOS = [resumo('maria'), resumo('joao'), resumo('ana')];

// ── contaNoSetor ───────────────────────────────────────────────────────────

describe('contaNoSetor — o empréstimo não tira ninguém de casa', () => {
  it('Maria conta no setor de origem E no setor que a tomou emprestada', () => {
    expect(contaNoSetor('maria', 'setor-A', VINCULOS)).toBe(true);
    expect(contaNoSetor('maria', 'setor-B', VINCULOS)).toBe(true);
  });

  it('João conta só no dele', () => {
    expect(contaNoSetor('joao', 'setor-B', VINCULOS)).toBe(true);
    expect(contaNoSetor('joao', 'setor-A', VINCULOS)).toBe(false);
  });

  it('quem não está no mapa não conta em lugar nenhum', () => {
    expect(contaNoSetor('fantasma', 'setor-A', VINCULOS)).toBe(false);
  });
});

// ── filtrarResumos ─────────────────────────────────────────────────────────

describe('filtrarResumos', () => {
  it('sem filtro, devolve todo mundo', () => {
    expect(filtrarResumos(RESUMOS, {}, VINCULOS)).toHaveLength(3);
  });

  it('por setor, o clone entra no setor emprestado', () => {
    // Se Maria ficasse de fora, o "Total recebido" do setor B ficaria menor
    // que o card de setor do Desempenho Equipes, que já a incluía.
    const b = filtrarResumos(RESUMOS, { setorId: 'setor-B' }, VINCULOS);
    expect(b.map(r => r.operador_id).sort()).toEqual(['joao', 'maria']);
  });

  it('por setor de origem, o clone continua lá', () => {
    const a = filtrarResumos(RESUMOS, { setorId: 'setor-A' }, VINCULOS);
    expect(a.map(r => r.operador_id).sort()).toEqual(['ana', 'maria']);
  });

  it('por equipe, inclui quem é clone naquela equipe', () => {
    const p5 = filtrarResumos(RESUMOS, { equipeId: 'eq-play5' }, VINCULOS);
    expect(p5.map(r => r.operador_id).sort()).toEqual(['joao', 'maria']);
  });

  it('setor e equipe juntos são cumulativos', () => {
    const r = filtrarResumos(RESUMOS, { setorId: 'setor-A', equipeId: 'eq-play4' }, VINCULOS);
    expect(r.map(x => x.operador_id)).toEqual(['maria']);
  });

  it('setor sem ninguém devolve vazio, não a empresa toda', () => {
    expect(filtrarResumos(RESUMOS, { setorId: 'setor-Z' }, VINCULOS)).toEqual([]);
  });
});

// ── agruparPorEquipe ───────────────────────────────────────────────────────

describe('agruparPorEquipe', () => {
  it('sem filtro, o clone aparece nas DUAS equipes', () => {
    const grupos = agruparPorEquipe(RESUMOS, EQUIPES, {}, VINCULOS);
    const p4 = grupos.find(g => g.equipeId === 'eq-play4')!;
    const p5 = grupos.find(g => g.equipeId === 'eq-play5')!;
    expect(p4.items.map(i => i.operador_id)).toEqual(['maria']);
    expect(p5.items.map(i => i.operador_id).sort()).toEqual(['joao', 'maria']);
  });

  it('com filtro de setor, o clone aparece só sob a equipe DAQUELE setor', () => {
    // O caso concreto: filtrando o setor B, Maria tem que aparecer sob
    // "Play 5" e não sob "Play 4", que é a equipe de origem, de outro setor.
    const grupos = agruparPorEquipe(RESUMOS, EQUIPES, { setorId: 'setor-B' }, VINCULOS);
    expect(grupos.map(g => g.equipeId).sort()).toEqual(['eq-play5']);
    expect(grupos[0].items.map(i => i.operador_id).sort()).toEqual(['joao', 'maria']);
  });

  it('operador sem equipe cai em "Sem equipe", respeitando o setor', () => {
    const grupos = agruparPorEquipe(RESUMOS, EQUIPES, { setorId: 'setor-A' }, VINCULOS);
    const semEquipe = grupos.find(g => g.equipeId === null)!;
    expect(semEquipe.equipeNome).toBe('Sem equipe');
    expect(semEquipe.items.map(i => i.operador_id)).toEqual(['ana']);

    // Ana é do setor A: filtrando o B, ela não aparece nem em "Sem equipe".
    const noB = agruparPorEquipe(RESUMOS, EQUIPES, { setorId: 'setor-B' }, VINCULOS);
    expect(noB.find(g => g.equipeId === null)).toBeUndefined();
  });

  it('não duplica quem é membro E clone da mesma equipe', () => {
    const vinculos: VinculosOperador = {
      ...VINCULOS,
      equipesExtras: { 'maria': ['eq-play4'] },   // clone da PRÓPRIA equipe
    };
    const grupos = agruparPorEquipe([resumo('maria')], EQUIPES, {}, vinculos);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].items).toHaveLength(1);
  });

  it('equipe que ficou sem ninguém não vira grupo vazio na tela', () => {
    const grupos = agruparPorEquipe(RESUMOS, EQUIPES, {}, VINCULOS);
    expect(grupos.every(g => g.items.length > 0)).toBe(true);
    expect(grupos.find(g => g.equipeId === 'eq-digi')).toBeUndefined();
  });

  it('equipe clonada que não está na lista de equipes ainda agrupa', () => {
    // A equipe pode não ter vindo da tabela (filtro, migration pendente).
    // Melhor um grupo com nome genérico do que o recebimento sumir da tela.
    const vinculos: VinculosOperador = {
      ...VINCULOS,
      equipesExtras: { 'maria': ['eq-desconhecida'] },
    };
    const grupos = agruparPorEquipe([resumo('maria')], EQUIPES, {}, vinculos);
    const extra = grupos.find(g => g.equipeId === 'eq-desconhecida')!;
    expect(extra.equipeNome).toBe('Equipe');
    expect(extra.items).toHaveLength(1);
  });
});

// ── calcularMetricas ───────────────────────────────────────────────────────

const SNAPSHOT: ResumoMensalAnalitico = {
  total_recebido: 9000, total_ho: 2000,
  total_operadores: 12, total_pagamentos: 300,
  periodo_inicio: '2026-07-01', periodo_fim: '2026-07-31',
};

const BASE = {
  snapshot: SNAPSHOT,
  resumosFiltrados: [] as ResumoOperadorAnalitico[],
  orfaosPorSetor: {} as Record<string, { total: number; qtd: number }>,
  totalPorSetor: {} as Record<string, { total: number; ho: number; qtd: number }>,
  setoresAlternativos: new Set<string>(),
  isPaguePlay: false,
};

describe('calcularMetricas — de onde vem cada número do card', () => {
  it('sem filtro, vem do snapshot da importação', () => {
    // O snapshot é o único que não muda quando alguém apaga linhas depois:
    // ele reflete o relatório como ele chegou.
    const m = calcularMetricas(BASE)!;
    expect(m.totalRecebido).toBe(9000);
    expect(m.totalOperadores).toBe(12);
    expect(m.periodoInicio).toBe('2026-07-01');
  });

  it('sem filtro e sem snapshot, devolve null — a tela mostra o esqueleto', () => {
    expect(calcularMetricas({ ...BASE, snapshot: null })).toBeNull();
  });

  it('setor normal: total CARIMBADO no relatório, não a soma dos operadores', () => {
    // Clone não mexe nesse número, e é isso que se quer: o dinheiro foi
    // creditado ao setor pelo próprio relatório.
    const m = calcularMetricas({
      ...BASE,
      setorId: 'setor-A',
      totalPorSetor: { 'setor-A': { total: 5000, ho: 1200, qtd: 80 } },
      resumosFiltrados: [resumo('maria'), resumo('ana')],
    })!;
    expect(m.totalRecebido).toBe(5000);
    expect(m.totalHo).toBe(1200);
    expect(m.totalPagamentos).toBe(80);
    // Operadores é sempre a contagem de quem passou no filtro.
    expect(m.totalOperadores).toBe(2);
  });

  it('setor sem carimbo no relatório mostra zero, não o total da empresa', () => {
    const m = calcularMetricas({ ...BASE, setorId: 'setor-vazio' })!;
    expect(m.totalRecebido).toBe(0);
    expect(m.totalPagamentos).toBe(0);
  });

  it('setor ALTERNATIVO soma os usuários e inclui os órfãos do setor', () => {
    // Setor alternativo não tem relatório próprio: o total dele é a soma de
    // quem está nele. Os órfãos não têm operador, só o setor da importação —
    // deixá-los de fora faria o setor parecer ter recebido menos.
    const m = calcularMetricas({
      ...BASE,
      setorId: 'setor-B',
      setoresAlternativos: new Set(['setor-B']),
      resumosFiltrados: [resumo('maria'), resumo('joao')],
      orfaosPorSetor: { 'setor-B': { total: 50, qtd: 1 } },
      totalPorSetor: { 'setor-B': { total: 999999, ho: 999, qtd: 999 } },
    })!;
    expect(m.totalRecebido).toBe(250);     // 100 + 100 + 50
    expect(m.totalHo).toBe(50);            // órfão não tem H.O. por operador
    expect(m.totalPagamentos).toBe(5);     // 2 + 2 + 1
  });

  it('na PaguePlay TODO setor soma por usuários, alternativo ou não', () => {
    // Esta tela já foi a única a usar o carimbo também na PaguePlay, e por
    // isso divergia do dashboard e do Painel Líder.
    const m = calcularMetricas({
      ...BASE,
      isPaguePlay: true,
      setorId: 'setor-A',
      resumosFiltrados: [resumo('maria')],
      totalPorSetor: { 'setor-A': { total: 999999, ho: 999, qtd: 999 } },
    })!;
    expect(m.totalRecebido).toBe(100);
  });

  it('filtro de equipe sempre soma os resumos, e SEM os órfãos', () => {
    // Órfão não tem operador, logo não tem equipe: não dá para atribuí-lo.
    const m = calcularMetricas({
      ...BASE,
      setorId: 'setor-B',
      equipeId: 'eq-play5',
      resumosFiltrados: [resumo('joao')],
      orfaosPorSetor: { 'setor-B': { total: 50, qtd: 1 } },
      totalPorSetor: { 'setor-B': { total: 999999, ho: 999, qtd: 999 } },
    })!;
    expect(m.totalRecebido).toBe(100);
    expect(m.totalPagamentos).toBe(2);
  });

  it('com filtro, o período continua vindo do snapshot', () => {
    const m = calcularMetricas({ ...BASE, setorId: 'setor-A' })!;
    expect(m.periodoInicio).toBe('2026-07-01');
    expect(m.periodoFim).toBe('2026-07-31');
  });

  it('com filtro e sem snapshot, o período fica vazio mas os valores saem', () => {
    const m = calcularMetricas({
      ...BASE, snapshot: null, setorId: 'setor-A',
      totalPorSetor: { 'setor-A': { total: 700, ho: 100, qtd: 9 } },
    })!;
    expect(m.totalRecebido).toBe(700);
    expect(m.periodoInicio).toBeNull();
  });
});

// ── Escopo de exclusão e órfãos ────────────────────────────────────────────

describe('perfilIdsDoSetor — quem um líder pode apagar', () => {
  it('lista só quem pertence ao setor', () => {
    // Note que Maria entra pelo setor DE ORIGEM. Apagar é pelo setor dono do
    // operador, não pelo empréstimo — senão um setor apagaria dados de outro.
    expect(perfilIdsDoSetor(VINCULOS.operadorEquipeMap, 'setor-A').sort())
      .toEqual(['ana', 'maria']);
    expect(perfilIdsDoSetor(VINCULOS.operadorEquipeMap, 'setor-B')).toEqual(['joao']);
  });

  it('sem setor, lista vazia — nunca a empresa toda', () => {
    expect(perfilIdsDoSetor(VINCULOS.operadorEquipeMap, null)).toEqual([]);
    expect(perfilIdsDoSetor(VINCULOS.operadorEquipeMap, undefined)).toEqual([]);
  });
});

describe('filtrarOrfaosDoSetor', () => {
  const orfao = (over: Partial<AnaliticoRecebimento>) =>
    ({ id: 'o', setor_id: null, importado_por_id: null, ...over }) as AnaliticoRecebimento;

  it('sem restrição, diretoria e admin veem todos', () => {
    const todos = [orfao({ setor_id: 'setor-A' }), orfao({ setor_id: 'setor-B' })];
    expect(filtrarOrfaosDoSetor(todos, false, VINCULOS.operadorEquipeMap, 'setor-A'))
      .toHaveLength(2);
  });

  it('restrito: usa o setor carimbado na linha', () => {
    const todos = [orfao({ setor_id: 'setor-A' }), orfao({ setor_id: 'setor-B' })];
    const vistos = filtrarOrfaosDoSetor(todos, true, VINCULOS.operadorEquipeMap, 'setor-A');
    expect(vistos).toHaveLength(1);
    expect(vistos[0].setor_id).toBe('setor-A');
  });

  it('sem carimbo, cai no setor de quem importou', () => {
    // 'joao' é do setor-B; a linha que ele importou pertence ao setor dele.
    const todos = [orfao({ setor_id: null, importado_por_id: 'joao' })];
    expect(filtrarOrfaosDoSetor(todos, true, VINCULOS.operadorEquipeMap, 'setor-B'))
      .toHaveLength(1);
    expect(filtrarOrfaosDoSetor(todos, true, VINCULOS.operadorEquipeMap, 'setor-A'))
      .toHaveLength(0);
  });

  it('sem carimbo e sem importador conhecido, não aparece para setor nenhum', () => {
    const todos = [orfao({})];
    expect(filtrarOrfaosDoSetor(todos, true, VINCULOS.operadorEquipeMap, 'setor-A'))
      .toHaveLength(0);
  });
});

describe('filtrarLinhasPorData', () => {
  const linha = (data: string) => ({ data_pagamento: data }) as AnaliticoRecebimento;
  const linhas = [linha('2026-07-01'), linha('2026-07-15'), linha('2026-07-31')];

  it('sem filtro, devolve tudo', () => {
    expect(filtrarLinhasPorData(linhas, undefined)).toHaveLength(3);
    expect(filtrarLinhasPorData(linhas, { inicio: '', fim: '' })).toHaveLength(3);
  });

  it('só início corta o começo; só fim corta o final', () => {
    expect(filtrarLinhasPorData(linhas, { inicio: '2026-07-15', fim: '' })).toHaveLength(2);
    expect(filtrarLinhasPorData(linhas, { inicio: '', fim: '2026-07-15' })).toHaveLength(2);
  });

  it('as duas pontas entram no intervalo', () => {
    const r = filtrarLinhasPorData(linhas, { inicio: '2026-07-01', fim: '2026-07-31' });
    expect(r).toHaveLength(3);
  });

  it('intervalo sem nada devolve vazio', () => {
    expect(filtrarLinhasPorData(linhas, { inicio: '2026-08-01', fim: '2026-08-31' }))
      .toHaveLength(0);
  });
});
