/**
 * diarioResumoMensal.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * `buscarResumoMensalDiario` alimenta as abas Desempenho Equipes, Quartis e o
 * gráfico do Painel Líder na PaguePlay. É o acumulado do mês por operador.
 *
 * A regra que este arquivo existe para travar:
 *
 *   TODA linha do relatório conta no total GERAL do setor. Mas linha FORA DO
 *   VÍNCULO (próx. contato ≤ dia do pagamento), linha órfã e "(sem vínculo)"
 *   NÃO contam para o operador nem para a equipe — só no geral.
 *
 * Errar isso não quebra a tela: dá placar inflado para o operador, que é
 * exatamente o tipo de erro que ninguém reporta.
 *
 * Há dois caminhos com o MESMO contrato — a RPC agregada
 * (`fn_diario_resumo_mensal`) e a varredura de linhas usada quando a migration
 * não está aplicada. Os dois são testados com os mesmos dados, porque o risco
 * real é eles divergirem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PP_HO_PERCENTUAL } from '@/lib/index';

type Resposta = { data: unknown; error: { message: string } | null };

const { rpcSpy, filaPorTabela, tabelasConsultadas } = vi.hoisted(() => ({
  rpcSpy: vi.fn(),
  filaPorTabela: new Map<string, Resposta[]>(),
  tabelasConsultadas: [] as string[],
}));

/**
 * Construtor encadeável: qualquer método devolve ele mesmo, e o `await`
 * resolve a próxima resposta da fila daquela tabela. Serve para os dois
 * formatos de consulta do serviço sem precisar espelhar o PostgREST.
 */
function construtor(tabela: string) {
  const alvo: unknown = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') {
        return (aceitar: (r: Resposta) => void) => {
          const fila = filaPorTabela.get(tabela) ?? [];
          aceitar(fila.shift() ?? { data: [], error: null });
        };
      }
      return () => alvo;
    },
  });
  return alvo;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcSpy(...args),
    from: (tabela: string) => { tabelasConsultadas.push(tabela); return construtor(tabela); },
  },
}));

const { buscarResumoMensalDiario } = await import('./diario.service');

/** Encaixa respostas na fila de uma tabela, na ordem em que serão pedidas. */
function responder(tabela: string, ...respostas: Resposta[]) {
  filaPorTabela.set(tabela, respostas);
}

const ERRO_SEM_RPC = { message: 'function fn_diario_resumo_mensal does not exist' };

beforeEach(() => {
  rpcSpy.mockReset();
  filaPorTabela.clear();
  tabelasConsultadas.length = 0;
});

// ── Caminho rápido: RPC agregada ────────────────────────────────────────────

describe('buscarResumoMensalDiario — pela RPC', () => {
  it('soma por operador e calcula o H.O. sobre o recebido', async () => {
    rpcSpy.mockResolvedValue({
      data: [
        { operador_id: 'op-1', operador_usuario: 'maria', operador_nome: 'Maria',
          setor_geral: null, dia_referencia: '2026-07-05', fora_vinculo: false,
          total_recebido: 1000, total_pagamentos: 3 },
        { operador_id: 'op-1', operador_usuario: 'maria', operador_nome: 'Maria',
          setor_geral: null, dia_referencia: '2026-07-06', fora_vinculo: false,
          total_recebido: 500, total_pagamentos: 2 },
      ],
      error: null,
    });

    const r = await buscarResumoMensalDiario('emp-1', '2026-07');
    expect(r.error).toBeNull();
    expect(r.resumos).toHaveLength(1);
    expect(r.resumos[0].total_recebido).toBe(1500);
    expect(r.resumos[0].total_pagamentos).toBe(5);
    // O relatório diário não traz coluna de H.O. — ele é derivado.
    expect(r.resumos[0].total_ho).toBeCloseTo(1500 * PP_HO_PERCENTUAL, 6);
  });

  it('linha fora do vínculo sai do placar do operador e vai para o geral do setor', async () => {
    rpcSpy.mockResolvedValue({
      data: [
        { operador_id: 'op-1', operador_usuario: 'maria', operador_nome: 'Maria',
          setor_geral: 'setor-A', dia_referencia: '2026-07-05', fora_vinculo: false,
          total_recebido: 800, total_pagamentos: 2 },
        { operador_id: 'op-1', operador_usuario: 'maria', operador_nome: 'Maria',
          setor_geral: 'setor-A', dia_referencia: '2026-07-06', fora_vinculo: true,
          total_recebido: 200, total_pagamentos: 1 },
      ],
      error: null,
    });

    const r = await buscarResumoMensalDiario('emp-1', '2026-07');
    expect(r.resumos[0].total_recebido).toBe(800);
    expect(r.orfaosPorSetor['setor-A']).toEqual({ total: 200, qtd: 1 });
    // No gráfico do dia a linha fora do vínculo aparece pelo SETOR, sem dono.
    const foraVinculo = r.linhasDia.find(l => l.data_pagamento === '2026-07-06')!;
    expect(foraVinculo.operador_id).toBeNull();
    expect(foraVinculo.setor_id).toBe('setor-A');
  });

  it('linha órfã conta no geral do setor de quem importou', async () => {
    rpcSpy.mockResolvedValue({
      data: [
        { operador_id: null, operador_usuario: 'fulano_do_erp', operador_nome: null,
          setor_geral: 'setor-B', dia_referencia: '2026-07-05', fora_vinculo: false,
          total_recebido: 300, total_pagamentos: 1 },
      ],
      error: null,
    });

    const r = await buscarResumoMensalDiario('emp-1', '2026-07');
    expect(r.resumos).toEqual([]);
    expect(r.orfaosPorSetor['setor-B']).toEqual({ total: 300, qtd: 1 });
  });

  it('órfã sem setor não é atribuída a ninguém — nem cria chave vazia', async () => {
    rpcSpy.mockResolvedValue({
      data: [
        { operador_id: null, operador_usuario: '', operador_nome: null,
          setor_geral: null, dia_referencia: '2026-07-05', fora_vinculo: false,
          total_recebido: 400, total_pagamentos: 1 },
      ],
      error: null,
    });

    const r = await buscarResumoMensalDiario('emp-1', '2026-07');
    expect(r.resumos).toEqual([]);
    expect(r.orfaosPorSetor).toEqual({});
    expect(r.linhasDia).toHaveLength(1);
  });

  it('ordena do maior recebido para o menor', async () => {
    rpcSpy.mockResolvedValue({
      data: [
        { operador_id: 'op-1', operador_usuario: 'a', operador_nome: null, setor_geral: null,
          dia_referencia: '2026-07-05', fora_vinculo: false, total_recebido: 100, total_pagamentos: 1 },
        { operador_id: 'op-2', operador_usuario: 'b', operador_nome: null, setor_geral: null,
          dia_referencia: '2026-07-05', fora_vinculo: false, total_recebido: 900, total_pagamentos: 1 },
      ],
      error: null,
    });

    const r = await buscarResumoMensalDiario('emp-1', '2026-07');
    expect(r.resumos.map(x => x.operador_id)).toEqual(['op-2', 'op-1']);
  });

  it('erro real do banco é propagado, não escondido', async () => {
    rpcSpy.mockResolvedValue({ data: null, error: { message: 'permission denied for table' } });
    const r = await buscarResumoMensalDiario('emp-1', '2026-07');
    expect(r.error).toBe('permission denied for table');
    expect(r.resumos).toEqual([]);
  });
});

// ── Caminho antigo: varredura de linhas ─────────────────────────────────────

describe('buscarResumoMensalDiario — sem a RPC, varrendo as linhas', () => {
  it('função ausente no banco cai no fallback em vez de estourar', async () => {
    rpcSpy.mockResolvedValue({ data: null, error: ERRO_SEM_RPC });
    responder('diario_recebimentos', { data: [], error: null });
    responder('perfis', { data: [], error: null });

    const r = await buscarResumoMensalDiario('emp-1', '2026-07');
    expect(r.error).toBeNull();
    expect(tabelasConsultadas).toContain('diario_recebimentos');
  });

  it('RPC v1 (sem `fora_vinculo`) também cai no fallback — senão o placar viria inflado', async () => {
    // A v1 da função não sabia da regra de vínculo. Aceitar a resposta dela
    // seria contar no operador dinheiro que é só do geral.
    rpcSpy.mockResolvedValue({
      data: [{ operador_id: 'op-1', operador_usuario: 'maria', operador_nome: 'Maria',
               setor_geral: null, dia_referencia: '2026-07-05',
               total_recebido: 1000, total_pagamentos: 2 }],
      error: null,
    });
    responder('diario_recebimentos', { data: [], error: null });
    responder('perfis', { data: [], error: null });

    const r = await buscarResumoMensalDiario('emp-1', '2026-07');
    expect(r.resumos).toEqual([]);
    expect(tabelasConsultadas).toContain('diario_recebimentos');
  });

  it('aplica a mesma regra de vínculo que a RPC, agora no cliente', async () => {
    rpcSpy.mockResolvedValue({ data: null, error: ERRO_SEM_RPC });
    responder('diario_recebimentos', {
      data: [
        { operador_id: 'op-1', operador_usuario: 'maria', valor_recebido: 800,
          dia_referencia: '2026-07-05', prox_contato: '2026-07-20', importado_por_id: 'lider-1' },
        // prox_contato ANTES do pagamento: fora do vínculo, só no geral.
        { operador_id: 'op-1', operador_usuario: 'maria', valor_recebido: 200,
          dia_referencia: '2026-07-06', prox_contato: '2026-07-01', importado_por_id: 'lider-1' },
        // Órfã: setor vem de quem importou.
        { operador_id: null, operador_usuario: 'desconhecido', valor_recebido: 50,
          dia_referencia: '2026-07-07', prox_contato: null, importado_por_id: 'lider-1' },
      ],
      error: null,
    });
    responder('perfis', {
      data: [
        { id: 'op-1',    nome: 'Maria Silva', usuario: 'msilva', setor_id: 'setor-A' },
        { id: 'lider-1', nome: 'Chefe',       usuario: 'chefe',  setor_id: 'setor-A' },
      ],
      error: null,
    });

    const r = await buscarResumoMensalDiario('emp-1', '2026-07');
    expect(r.resumos).toHaveLength(1);
    expect(r.resumos[0].total_recebido).toBe(800);
    expect(r.resumos[0].total_pagamentos).toBe(1);
    // Nome e usuário vêm do perfil, não do texto do relatório.
    expect(r.resumos[0].operador_nome).toBe('Maria Silva');
    expect(r.resumos[0].operador_usuario).toBe('msilva');
    // 200 (fora do vínculo) + 50 (órfã) caem no geral do setor.
    expect(r.orfaosPorSetor['setor-A']).toEqual({ total: 250, qtd: 2 });
  });

  it('próximo contato NO MESMO dia do pagamento também é fora do vínculo', async () => {
    rpcSpy.mockResolvedValue({ data: null, error: ERRO_SEM_RPC });
    responder('diario_recebimentos', {
      data: [{ operador_id: 'op-1', operador_usuario: 'maria', valor_recebido: 100,
               dia_referencia: '2026-07-05', prox_contato: '2026-07-05', importado_por_id: 'lider-1' }],
      error: null,
    });
    responder('perfis', {
      data: [{ id: 'op-1', nome: 'Maria', usuario: 'maria', setor_id: 'setor-A' }],
      error: null,
    });

    const r = await buscarResumoMensalDiario('emp-1', '2026-07');
    expect(r.resumos).toEqual([]);
    expect(r.orfaosPorSetor['setor-A'].total).toBe(100);
  });

  it('sem perfil do operador nem de quem importou, o valor não entra em setor nenhum', async () => {
    rpcSpy.mockResolvedValue({ data: null, error: ERRO_SEM_RPC });
    responder('diario_recebimentos', {
      data: [{ operador_id: null, operador_usuario: 'ninguem', valor_recebido: 70,
               dia_referencia: '2026-07-05', prox_contato: null, importado_por_id: null }],
      error: null,
    });
    responder('perfis', { data: [], error: null });

    const r = await buscarResumoMensalDiario('emp-1', '2026-07');
    expect(r.orfaosPorSetor).toEqual({});
    expect(r.linhasDia).toHaveLength(1);
  });

  it('erro ao varrer as linhas devolve o motivo em vez de um mês vazio silencioso', async () => {
    rpcSpy.mockResolvedValue({ data: null, error: ERRO_SEM_RPC });
    responder('diario_recebimentos', { data: null, error: { message: 'timeout' } });

    const r = await buscarResumoMensalDiario('emp-1', '2026-07');
    expect(r.error).toBe('timeout');
    expect(r.resumos).toEqual([]);
  });

  it('pagina: 1000 linhas na primeira página fazem pedir a segunda', async () => {
    // O PostgREST devolve no máximo 1000 por requisição. Sem a segunda página o
    // mês inteiro sairia truncado, e ninguém notaria — só somaria menos.
    rpcSpy.mockResolvedValue({ data: null, error: ERRO_SEM_RPC });
    const cheia = Array.from({ length: 1000 }, () => ({
      operador_id: 'op-1', operador_usuario: 'maria', valor_recebido: 1,
      dia_referencia: '2026-07-05', prox_contato: null, importado_por_id: 'lider-1',
    }));
    responder('diario_recebimentos',
      { data: cheia, error: null },
      { data: [{ operador_id: 'op-1', operador_usuario: 'maria', valor_recebido: 7,
                 dia_referencia: '2026-07-06', prox_contato: null, importado_por_id: 'lider-1' }],
        error: null });
    responder('perfis', {
      data: [{ id: 'op-1', nome: 'Maria', usuario: 'maria', setor_id: 'setor-A' }],
      error: null,
    });

    const r = await buscarResumoMensalDiario('emp-1', '2026-07');
    expect(r.resumos[0].total_recebido).toBe(1007);
    expect(r.resumos[0].total_pagamentos).toBe(1001);
  });
});
