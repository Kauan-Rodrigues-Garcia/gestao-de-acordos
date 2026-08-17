/**
 * agruparEventos.test.ts
 *
 * Agrupar auditoria é arriscado: unir o que não é a mesma ação faz o leitor
 * concluir errado sobre quem fez o quê. Cada teste aqui trava um jeito de isso
 * acontecer.
 *
 * O caso do meio é o relatado em 17/08/2026: duas transações a 79 ms, mesmo NR,
 * que pareciam log duplicado.
 */
import { describe, it, expect } from 'vitest';
import { agruparEventos, nrDoEvento, resumirGrupo, JANELA_AGRUPAMENTO_MS } from './agruparEventos';
import type { LogSistema } from '@/lib/supabase';

let seq = 0;
function log(over: Partial<LogSistema> = {}): LogSistema {
  seq += 1;
  return {
    id: `id-${seq}`,
    criado_em: '2026-08-17T20:00:33.413336+00:00',
    usuario_id: 'u1',
    usuario_nome: 'Sirlei Stephanie',
    acao: 'acordo_alterado',
    tabela: 'acordos',
    alvo_rotulo: 'NR 12983305 — TATIANE RIEGEL',
    ...over,
  } as LogSistema;
}

describe('extração do NR', () => {
  it('pega o número do rótulo', () => {
    expect(nrDoEvento({ alvo_rotulo: 'NR 12983305 — TATIANE RIEGEL' })).toBe('12983305');
  });

  it('rótulo sem NR devolve null', () => {
    expect(nrDoEvento({ alvo_rotulo: 'PRISCYLA DE SOUSA FEITOSA' })).toBeNull();
    expect(nrDoEvento({ alvo_rotulo: null })).toBeNull();
  });
});

describe('mesma transação — exato', () => {
  /**
   * `criado_em` é `now()`, o carimbo da TRANSAÇÃO no PostgreSQL. Carimbo idêntico
   * + mesmo autor não é aproximação: é literalmente a mesma transação.
   */
  it('carimbo idêntico agrupa mesmo com tabelas e NRs diferentes', () => {
    const g = agruparEventos([
      log({ tabela: 'acordos',      alvo_rotulo: 'NR 111 — A' }),
      log({ tabela: 'nr_registros', alvo_rotulo: 'NR 222 — B' }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].mesmaTransacao).toBe(true);
  });

  it('NR do grupo fica nulo quando os eventos discordam', () => {
    const g = agruparEventos([
      log({ alvo_rotulo: 'NR 111 — A' }),
      log({ alvo_rotulo: 'NR 222 — B' }),
    ]);
    expect(g[0].nr).toBeNull();
  });

  it('uma importação de muitas linhas vira um grupo só', () => {
    const muitos = Array.from({ length: 428 }, () => log({ acao: 'acordo_criado' }));
    const g = agruparEventos(muitos);
    expect(g).toHaveLength(1);
    expect(g[0].eventos).toHaveLength(428);
    expect(g[0].mesmaTransacao).toBe(true);
  });
});

describe('mesmo NR numa janela — heurística', () => {
  /** O caso relatado: acrescentar parcela ao mesmo NR, duas transações. */
  it('duas transações a 79ms no mesmo NR agrupam', () => {
    const g = agruparEventos([
      log({
        criado_em: '2026-08-17T20:00:33.492123+00:00',
        tabela: 'acordos', acao: 'acordo_alterado',
        alvo_rotulo: 'NR 12983305 — TATIANE RIEGEL',
      }),
      log({
        criado_em: '2026-08-17T20:00:33.413336+00:00',
        tabela: 'nr_registros', acao: 'nr_titularidade_alterado',
        alvo_rotulo: 'NR 12983305 — Sirlei Stephanie',
      }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].eventos).toHaveLength(2);
    // Transações diferentes: o card não pode afirmar "mesma operação".
    expect(g[0].mesmaTransacao).toBe(false);
    expect(g[0].nr).toBe('12983305');
  });

  it('fora da janela não agrupa', () => {
    const g = agruparEventos([
      log({ criado_em: '2026-08-17T20:00:50.000+00:00' }),
      log({ criado_em: '2026-08-17T20:00:00.000+00:00' }),
    ]);
    expect(g).toHaveLength(2);
  });

  it('exatamente no limite da janela ainda agrupa', () => {
    const base = new Date('2026-08-17T20:00:00.000Z').getTime();
    const g = agruparEventos([
      log({ criado_em: new Date(base + JANELA_AGRUPAMENTO_MS).toISOString() }),
      log({ criado_em: new Date(base).toISOString() }),
    ]);
    expect(g).toHaveLength(1);
  });

  it('NRs diferentes em transações diferentes não agrupam', () => {
    const g = agruparEventos([
      log({ criado_em: '2026-08-17T20:00:02.000+00:00', alvo_rotulo: 'NR 111 — A' }),
      log({ criado_em: '2026-08-17T20:00:00.000+00:00', alvo_rotulo: 'NR 222 — B' }),
    ]);
    expect(g).toHaveLength(2);
  });

  it('sem NR e em transações diferentes não agrupa', () => {
    const g = agruparEventos([
      log({ criado_em: '2026-08-17T20:00:02.000+00:00', alvo_rotulo: 'CLIENTE X' }),
      log({ criado_em: '2026-08-17T20:00:00.000+00:00', alvo_rotulo: 'CLIENTE X' }),
    ]);
    expect(g).toHaveLength(2);
  });
});

describe('o que NUNCA agrupa', () => {
  /**
   * Duas pessoas mexendo no mesmo NR no mesmo instante é exatamente o que um
   * auditor precisa ver separado. Agrupar aqui esconderia um conflito.
   */
  it('autores diferentes nunca agrupam, nem na mesma transação', () => {
    const g = agruparEventos([
      log({ usuario_id: 'u1', usuario_nome: 'Ana' }),
      log({ usuario_id: 'u2', usuario_nome: 'Bruno' }),
    ]);
    expect(g).toHaveLength(2);
  });

  it('autor nulo não agrupa com autor conhecido', () => {
    const g = agruparEventos([
      log({ usuario_id: null }),
      log({ usuario_id: 'u1' }),
    ]);
    expect(g).toHaveLength(2);
  });

  it('dois eventos de sistema na mesma transação agrupam', () => {
    const g = agruparEventos([
      log({ usuario_id: null, usuario_nome: null }),
      log({ usuario_id: null, usuario_nome: null }),
    ]);
    expect(g).toHaveLength(1);
  });
});

describe('ordem e integridade', () => {
  /** Reordenar para juntar quebraria a leitura cronológica. */
  it('só agrupa vizinhos — nada é reordenado', () => {
    const g = agruparEventos([
      log({ alvo_rotulo: 'NR 111 — A', criado_em: '2026-08-17T20:00:30.000+00:00' }),
      log({ alvo_rotulo: 'NR 222 — B', criado_em: '2026-08-17T20:00:20.000+00:00' }),
      log({ alvo_rotulo: 'NR 111 — A', criado_em: '2026-08-17T20:00:10.000+00:00' }),
    ]);
    // Os dois "NR 111" não se encontram: há um "NR 222" no meio.
    expect(g).toHaveLength(3);
  });

  /**
   * A comparação é com o ÚLTIMO aceito, não com o primeiro: numa cadeia de
   * passos cada um está perto do anterior, e comparar com o primeiro cortaria
   * grupos longos ao meio.
   */
  it('cadeia de passos encadeados fica num grupo só', () => {
    const base = new Date('2026-08-17T20:00:00.000Z').getTime();
    const g = agruparEventos([0, 10_000, 20_000, 30_000].map(off =>
      log({ criado_em: new Date(base + off).toISOString(), alvo_rotulo: 'NR 555 — X' }),
    ));
    // Primeiro e último distam 30s, muito além da janela — mas cada passo dista
    // 10s do anterior.
    expect(g).toHaveLength(1);
    expect(g[0].eventos).toHaveLength(4);
  });

  it('nenhum evento se perde nem se duplica', () => {
    const entrada = [
      log({ alvo_rotulo: 'NR 111 — A' }),
      log({ alvo_rotulo: 'NR 111 — A' }),
      log({ usuario_id: 'outro', criado_em: '2026-08-17T21:00:00.000+00:00' }),
      log({ criado_em: '2026-08-17T22:00:00.000+00:00', alvo_rotulo: 'CLIENTE' }),
    ];
    const g = agruparEventos(entrada);
    const saida = g.flatMap(x => x.eventos.map(e => e.id));
    expect(saida).toEqual(entrada.map(e => e.id));
  });

  it('lista vazia devolve lista vazia', () => {
    expect(agruparEventos([])).toEqual([]);
  });

  it('a chave do grupo é estável', () => {
    const a = log();
    const g = agruparEventos([a]);
    expect(g[0].chave).toBe(a.id);
  });
});

describe('resumo do grupo', () => {
  it('conta eventos e lista tabelas e ações distintas', () => {
    const g = agruparEventos([
      log({ tabela: 'acordos',      acao: 'acordo_criado' }),
      log({ tabela: 'acordos',      acao: 'acordo_alterado' }),
      log({ tabela: 'nr_registros', acao: 'nr_titularidade_alterado' }),
    ]);
    const r = resumirGrupo(g[0]);
    expect(r.quantidade).toBe(3);
    expect(r.tabelas.sort()).toEqual(['acordos', 'nr_registros']);
    expect(r.acoes).toHaveLength(3);
    expect(r.autor).toBe('Sirlei Stephanie');
  });
});
