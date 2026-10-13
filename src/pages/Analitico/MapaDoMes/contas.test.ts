import { describe, expect, it } from 'vitest';
import {
  baixasDoMes, montarMapa, quemRecebeuNaCasa, resumirCasas, semanasDoMes, valorDaCasa,
  type CelulaDoMapa,
} from './contas';

const NOMES: Record<string, string> = { a: 'Ana Souza', b: 'Bruno Lima', c: 'Carla Dias' };

function montar(celulas: CelulaDoMapa[], mes = '2026-09') {
  return montarMapa({
    celulas, mes,
    nomeDoOperador: id => NOMES[id] ?? '—',
    fotoDoOperador: id => (id === 'a' ? 'https://foto/a.jpg' : null),
    equipeDoOperador: () => 'Play 3',
  });
}

describe('semanasDoMes', () => {
  it('começa na segunda e completa as pontas com null', () => {
    // 01/09/2026 é terça.
    const semanas = semanasDoMes('2026-09', '2026-09-15');
    expect(semanas[0][0]).toBeNull();
    expect(semanas[0][1]?.numero).toBe(1);
    expect(semanas.every(s => s.length === 7)).toBe(true);
    expect(semanas.flat().filter(Boolean)).toHaveLength(30);
  });

  it('marca hoje e os dias que ainda não aconteceram', () => {
    const dias = semanasDoMes('2026-09', '2026-09-15').flat().filter(d => d !== null);
    expect(dias.find(d => d.numero === 15)?.ehHoje).toBe(true);
    expect(dias.find(d => d.numero === 15)?.futuro).toBe(false);
    expect(dias.find(d => d.numero === 16)?.futuro).toBe(true);
  });
});

describe('montarMapa', () => {
  const celulas: CelulaDoMapa[] = [
    { dia: '2026-09-01', operador_id: 'a', total: 100 },
    { dia: '2026-09-01', operador_id: 'a', total: 50 },
    { dia: '2026-09-02', operador_id: 'b', total: 400 },
    { dia: '2026-09-02', operador_id: null, total: 70 },
    { dia: '2026-08-31', operador_id: 'c', total: 999 },   // outro mês
  ];

  it('soma por operador e por dia, maior mês primeiro', () => {
    const m = montar(celulas);
    expect(m.operadores.map(o => [o.operadorId, o.total, o.posicao])).toEqual([
      ['b', 400, 1], ['a', 150, 2],
    ]);
    expect(m.operadores[1].porDia.get('2026-09-01')).toBe(150);
    expect(m.totalPorDia.get('2026-09-02')).toBe(400);
    expect(m.totalGeral).toBe(550);
  });

  it('deixa o que não tem dono fora da matriz, mas conta à parte', () => {
    expect(montar(celulas).totalSemOperador).toBe(70);
  });

  it('carrega nome, foto e equipe', () => {
    const a = montar(celulas).operadores.find(o => o.operadorId === 'a');
    expect(a).toMatchObject({ nome: 'Ana Souza', fotoUrl: 'https://foto/a.jpg', equipe: 'Play 3' });
  });
});

describe('baixasDoMes — a coluna D.U. da planilha', () => {
  // Outubro/2026, com o feriado de 12/10.
  const baixas = baixasDoMes('2026-10', ['2026-10-12'], '2026-10-13');
  const du = (dia: number) =>
    baixas.find(b => b.dias.includes(`2026-10-${String(dia).padStart(2, '0')}`))?.numero;

  it('tem 21 baixas', () => {
    expect(baixas).toHaveLength(21);
  });

  it('bate dia a dia com a planilha', () => {
    const planilha: Record<number, number> = {
      1: 1, 2: 2, 3: 2, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 7, 11: 7, 12: 7,
      13: 8, 14: 9, 15: 10, 16: 11, 17: 11, 18: 11, 19: 12, 20: 13, 21: 14, 22: 15,
      23: 16, 24: 16, 25: 16, 26: 17, 27: 18, 28: 19, 29: 20, 30: 21,
    };
    for (const [dia, n] of Object.entries(planilha)) expect(du(Number(dia))).toBe(n);
  });

  it('marca a baixa de hoje e as que não chegaram', () => {
    expect(baixas.find(b => b.atual)?.numero).toBe(8);
    expect(baixas[7].futuro).toBe(false);
    expect(baixas[8].futuro).toBe(true);
  });

  it('dias antes do primeiro dia útil entram na baixa 1', () => {
    // Novembro/2026 começa num domingo; 02/11 é Finados.
    const nov = baixasDoMes('2026-11', ['2026-11-02'], '2026-11-30');
    expect(nov[0].diaUtil).toBe('2026-11-03');
    expect(nov[0].dias).toEqual(['2026-11-03', '2026-11-01', '2026-11-02']);
  });
});

describe('resumirCasas', () => {
  const porDia = new Map([['2026-09-01', 100], ['2026-09-03', 300]]);
  const casas = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map(d => ({
    chave: d, dias: [d], futuro: d > '2026-09-03',
  }));

  it('acha a melhor casa e a média só das casas com recebimento', () => {
    const r = resumirCasas(casas, porDia);
    expect(r.melhor).toEqual({ chave: '2026-09-03', valor: 300 });
    expect(r.ativas).toBe(2);
    expect(r.corridas).toBe(3);
    expect(r.mediaPorAtiva).toBe(200);
  });

  it('uma baixa soma todos os seus dias', () => {
    expect(valorDaCasa({ chave: 'x', dias: ['2026-09-01', '2026-09-03'], futuro: false }, porDia)).toBe(400);
  });
});

describe('quemRecebeuNaCasa', () => {
  it('lista só quem recebeu, maior primeiro', () => {
    const m = montar([
      { dia: '2026-09-05', operador_id: 'a', total: 10 },
      { dia: '2026-09-05', operador_id: 'b', total: 30 },
      { dia: '2026-09-06', operador_id: 'a', total: 25 },
      { dia: '2026-09-07', operador_id: 'c', total: 5 },
    ]);
    expect(quemRecebeuNaCasa(m.operadores, ['2026-09-05']).map(x => x.operador.operadorId)).toEqual(['b', 'a']);
    expect(quemRecebeuNaCasa(m.operadores, ['2026-09-05', '2026-09-06']).map(x => [x.operador.operadorId, x.valor]))
      .toEqual([['a', 35], ['b', 30]]);
  });
});
