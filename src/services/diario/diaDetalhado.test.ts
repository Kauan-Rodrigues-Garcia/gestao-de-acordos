/**
 * diaDetalhado.test.ts
 *
 * A aba "Dia detalhado" mostra recebimento por pessoa. O que estes testes
 * protegem, em ordem de gravidade:
 *
 *  1. o escopo por setor — repetir aqui o vazamento fechado em 04/08/2026
 *     seria pior do que não ter a aba;
 *  2. o dinheiro não pertencer a quem não é dono (fora do vínculo/órfão);
 *  3. as somas fecharem — linha, coluna e total.
 */
import { describe, it, expect } from 'vitest';
import { montarDiaDetalhado, diasDoMes, ultimoDiaDoMes } from './diaDetalhado';
import type { EscopoDiario, VinculosDiario } from './escopoDiario';
import type { LinhaRecebidaDia, ResumoOperadorAnalitico } from '@/services/analitico/analitico.service';

// PLAY4 tem ana e bruno; RECEPTIVO tem carla. Mesma forma da fixture de
// escopoDiario.test.ts, para as duas abas serem julgadas pela mesma régua.
const vinculos: VinculosDiario = {
  equipes: [
    { id: 'eq-play4', nome: 'Play 4',    setor_id: 'PLAY4' },
    { id: 'eq-recep', nome: 'Receptivo', setor_id: 'RECEPTIVO' },
  ] as VinculosDiario['equipes'],
  operadorEquipeMap: {
    ana:   { equipe_id: 'eq-play4', setor_id: 'PLAY4' },
    bruno: { equipe_id: 'eq-play4', setor_id: 'PLAY4' },
    carla: { equipe_id: 'eq-recep', setor_id: 'RECEPTIVO' },
  } as unknown as VinculosDiario['operadorEquipeMap'],
  equipesExtrasPorOperador: {} as VinculosDiario['equipesExtrasPorOperador'],
};

const resumos = [
  { operador_id: 'ana',   operador_usuario: 'ana',   operador_nome: 'Ana',   total_recebido: 0, total_ho: 0, total_pagamentos: 0 },
  { operador_id: 'bruno', operador_usuario: 'bruno', operador_nome: 'Bruno', total_recebido: 0, total_ho: 0, total_pagamentos: 0 },
  { operador_id: 'carla', operador_usuario: 'carla', operador_nome: 'Carla', total_recebido: 0, total_ho: 0, total_pagamentos: 0 },
] as ResumoOperadorAnalitico[];

function linha(operador: string | null, dia: string, valor: number): LinhaRecebidaDia {
  return {
    operador_id: operador, setor_id: null, importado_por_id: null,
    valor_recebido: valor, data_pagamento: dia,
  };
}

const MES   = '2026-08';
const HOJE  = '2026-08-05';
const TUDO: EscopoDiario = { tipo: 'tudo' };

function montar(linhasDia: LinhaRecebidaDia[], escopo: EscopoDiario = TUDO) {
  return montarDiaDetalhado({ linhasDia, resumos, mes: MES, hojeISO: HOJE, escopo, vinculos });
}

describe('ultimoDiaDoMes', () => {
  it('sabe o tamanho do mês, inclusive fevereiro', () => {
    expect(ultimoDiaDoMes('2026-08')).toBe(31);
    expect(ultimoDiaDoMes('2026-02')).toBe(28);
    expect(ultimoDiaDoMes('2024-02')).toBe(29);
    expect(ultimoDiaDoMes('2026-04')).toBe(30);
  });
});

describe('diasDoMes', () => {
  it('mês corrente para em hoje — dia futuro é sempre zero e só empurra a rolagem', () => {
    const dias = diasDoMes('2026-08', '2026-08-05');
    expect(dias).toEqual([
      '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
    ]);
  });

  it('mês passado vai até o fim', () => {
    expect(diasDoMes('2026-07', '2026-08-05')).toHaveLength(31);
    expect(diasDoMes('2026-07', '2026-08-05').at(-1)).toBe('2026-07-31');
  });

  it('mês futuro não tem coluna nenhuma', () => {
    expect(diasDoMes('2026-09', '2026-08-05')).toEqual([]);
  });
});

describe('montarDiaDetalhado — somas', () => {
  it('cruza operador e dia, e fecha linha, coluna e total', () => {
    const r = montar([
      linha('ana',   '2026-08-01', 100),
      linha('ana',   '2026-08-01', 50),   // duas linhas no mesmo dia somam
      linha('ana',   '2026-08-03', 200),
      linha('bruno', '2026-08-03', 70),
    ]);

    const ana = r.linhas.find(l => l.operadorId === 'ana')!;
    expect(ana.valores).toEqual([150, 0, 200, 0, 0]);
    expect(ana.total).toBe(350);

    expect(r.totaisPorDia).toEqual([150, 0, 270, 0, 0]);
    expect(r.totalGeral).toBe(420);
    // O total tem de ser a soma das linhas E a soma das colunas.
    expect(r.totaisPorDia.reduce((a, b) => a + b, 0)).toBe(r.totalGeral);
    expect(r.linhas.reduce((s, l) => s + l.total, 0)).toBe(r.totalGeral);
  });

  it('ordena pelo mês do operador, maior primeiro', () => {
    const r = montar([
      linha('ana',   '2026-08-01', 10),
      linha('bruno', '2026-08-01', 999),
      linha('carla', '2026-08-01', 500),
    ]);
    expect(r.linhas.map(l => l.operadorId)).toEqual(['bruno', 'carla', 'ana']);
  });

  it('desempata por nome para a ordem não dançar entre renders', () => {
    const r = montar([
      linha('carla', '2026-08-01', 100),
      linha('ana',   '2026-08-01', 100),
      linha('bruno', '2026-08-01', 100),
    ]);
    expect(r.linhas.map(l => l.nome)).toEqual(['Ana', 'Bruno', 'Carla']);
  });

  it('ignora dia fora das colunas em vez de estourar o índice', () => {
    const r = montar([
      linha('ana', '2026-08-20', 1000),   // ainda não chegou (hoje é dia 5)
      linha('ana', '2026-07-31', 500),    // outro mês
      linha('ana', '2026-08-02', 40),
    ]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].total).toBe(40);
    expect(r.totalGeral).toBe(40);
  });
});

describe('montarDiaDetalhado — o que NÃO tem dono', () => {
  it('fora do vínculo/órfão não entra na matriz, mas é informado à parte', () => {
    const r = montar([
      linha('ana', '2026-08-01', 100),
      linha(null,  '2026-08-01', 300),   // órfã / fora do vínculo
      linha(null,  '2026-08-02', 25),
    ]);
    expect(r.totalGeral).toBe(100);
    expect(r.totalForaDaMatriz).toBe(325);
    expect(r.linhas).toHaveLength(1);
    // A coluna do dia 1 mostra só o que tem dono.
    expect(r.totaisPorDia[0]).toBe(100);
  });

  it('não conta valor sem dono de um dia fora das colunas', () => {
    const r = montar([linha(null, '2026-08-20', 999)]);
    expect(r.totalForaDaMatriz).toBe(0);
  });
});

describe('montarDiaDetalhado — escopo por setor', () => {
  const dados = [
    linha('ana',   '2026-08-01', 100),
    linha('bruno', '2026-08-02', 200),
    linha('carla', '2026-08-03', 900),   // Receptivo
  ];

  it('líder do PLAY4 não vê o Receptivo', () => {
    const r = montar(dados, { tipo: 'setor', setorId: 'PLAY4' });
    expect(r.linhas.map(l => l.operadorId).sort()).toEqual(['ana', 'bruno']);
    expect(r.totalGeral).toBe(300);
    expect(r.totaisPorDia[2]).toBe(0);   // o dia da Carla zera para ele
  });

  it('quem vê tudo vê os três', () => {
    const r = montar(dados, { tipo: 'tudo' });
    expect(r.linhas).toHaveLength(3);
    expect(r.totalGeral).toBe(1200);
  });

  it('líder sem setor não vê ninguém — nunca a empresa inteira', () => {
    const r = montar(dados, { tipo: 'sem-setor' });
    expect(r.linhas).toEqual([]);
    expect(r.totalGeral).toBe(0);
  });

  it('escopo ainda não resolvido devolve vazio, não a empresa toda', () => {
    const r = montarDiaDetalhado({
      linhasDia: dados, resumos, mes: MES, hojeISO: HOJE, escopo: null, vinculos,
    });
    expect(r.linhas).toEqual([]);
    expect(r.totalGeral).toBe(0);
    // As colunas continuam existindo, para a tabela não piscar de tamanho.
    expect(r.dias).toHaveLength(5);
  });
});
