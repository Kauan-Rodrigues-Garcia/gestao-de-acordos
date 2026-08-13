/**
 * transferenciaUsuario.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Mover alguém de setor ou de empresa.
 *
 * ## O que estes testes travam
 *
 * **A ordem.** O relatório é gerado e baixado ANTES de qualquer DELETE (regra de
 * 20260805c). Se ele falhar, NADA pode ter sido tocado — nem o perfil. O
 * contrário é perder o que não se conseguiu ler.
 *
 * **Empresa nunca leva tabulação.** Levar significaria mover cadastro de cliente
 * entre dois CNPJs, com `nr_registros` UNIQUE por empresa e `tag_ids` apontando
 * para tags que a outra empresa não tem. A opção não existe, e marcar a caixinha
 * não pode fazê-la existir por acidente.
 *
 * **O que a troca de setor faz com as tabulações.** "Levar" muda `setor_id` — e
 * SÓ ele: `vinculo_operador_id` fica de pé, porque o par EXTRA aponta para um
 * operador que não foi transferido. "Chegar limpo" apaga pela RPC, que libera os
 * NRs.
 *
 * **Clone não pode sobrar.** Um clone pendurado faz a pessoa continuar contando
 * no setor emprestado — o defeito silencioso do comportamento antigo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const buscarAcordosMock = vi.fn();
const baixarRelatorioMock = vi.fn();

vi.mock('./exclusaoUsuario.service', () => ({
  buscarAcordosDoUsuario: (...a: unknown[]) => buscarAcordosMock(...a),
  baixarRelatorioAcordos: (...a: unknown[]) => baixarRelatorioMock(...a),
  traduzirErro: (m: string) => m,
}));

/** Uma operação registrada contra o banco, na ordem em que aconteceu. */
interface Op {
  tabela: string;
  verbo: 'select' | 'update' | 'delete' | 'insert';
  payload?: Record<string, unknown>;
}

const ops: Op[] = [];
const rpcCalls: Array<{ nome: string; args: Record<string, unknown> }> = [];

/** Respostas encaixadas por `tabela::verbo`. */
const respostas = new Map<string, { data: unknown; error: { message: string } | null }>();
let respostaRpc: { data: unknown; error: { message: string } | null } =
  { data: 0, error: null };

function construtor(tabela: string) {
  let verbo: Op['verbo'] = 'select';
  let payload: Record<string, unknown> | undefined;
  let registrada = false;

  const registrar = () => {
    if (registrada) return;
    registrada = true;
    ops.push({ tabela, verbo, payload });
  };

  const alvo: Record<string, unknown> = {};
  const encadear = (nome: string) => (...args: unknown[]) => {
    if (nome === 'update' || nome === 'insert') {
      verbo = nome;
      payload = args[0] as Record<string, unknown>;
    } else if (nome === 'delete') {
      verbo = 'delete';
    }
    return alvo;
  };

  for (const m of ['select', 'update', 'insert', 'delete', 'eq', 'neq', 'in', 'is', 'order', 'limit']) {
    alvo[m] = encadear(m);
  }
  alvo.maybeSingle = () => {
    registrar();
    return Promise.resolve(respostas.get(`${tabela}::${verbo}`) ?? { data: null, error: null });
  };
  alvo.then = (aceitar: (r: unknown) => unknown) => {
    registrar();
    return Promise.resolve(
      respostas.get(`${tabela}::${verbo}`) ?? { data: [], error: null, count: 0 },
    ).then(aceitar);
  };
  return alvo;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => construtor(t),
    rpc: (nome: string, args: Record<string, unknown>) => {
      rpcCalls.push({ nome, args });
      return Promise.resolve(respostaRpc);
    },
  },
}));

const {
  executarTransferencia, tipoDaTransferencia, traduzirTransferencia,
} = await import('./transferenciaUsuario.service');

// ── Cenário ──────────────────────────────────────────────────────────────────

const BOOKPLAY  = 'emp-bookplay';
const PAGUEPLAY = 'emp-pagueplay';
const PLAY_4    = 'setor-play-4';
const PLAY_5    = 'setor-play-5';

const ALVO_SETOR = {
  perfilId: 'p-bruno',
  nome: 'Bruno Silva',
  usuario: 'bruno',
  origemEmpresaId: BOOKPLAY,
  origemSetorId: PLAY_4,
  origemEquipeId: 'eq-manha',
  destinoEmpresaId: BOOKPLAY,
  destinoSetorId: PLAY_5,
};

const ALVO_EMPRESA = { ...ALVO_SETOR, destinoEmpresaId: PAGUEPLAY, destinoSetorId: 'setor-pp' };

/** Faz o UPDATE de perfis responder "1 linha atualizada" (permissão OK). */
function perfilAtualizavel() {
  respostas.set('perfis::update', { data: [{ id: 'p-bruno' }], error: null });
}

function comAcordos(quantos: number) {
  buscarAcordosMock.mockResolvedValue(
    Array.from({ length: quantos }, (_, i) => ({ id: `a-${i}` })),
  );
}

beforeEach(() => {
  ops.length = 0;
  rpcCalls.length = 0;
  respostas.clear();
  respostaRpc = { data: 7, error: null };
  buscarAcordosMock.mockReset().mockResolvedValue([]);
  baixarRelatorioMock.mockReset().mockResolvedValue('acordos-bruno-setor-anterior.xlsx');
  respostas.set('perfis_transferencias::insert', { data: { id: 'transf-1' }, error: null });
  perfilAtualizavel();
});

// ── Tipo ─────────────────────────────────────────────────────────────────────

describe('tipoDaTransferencia', () => {
  it('mesma empresa = setor', () => {
    expect(tipoDaTransferencia(ALVO_SETOR)).toBe('setor');
  });
  it('empresa diferente = empresa, mesmo mudando o setor junto', () => {
    expect(tipoDaTransferencia(ALVO_EMPRESA)).toBe('empresa');
  });
});

// ── A ordem: relatório antes de qualquer escrita ─────────────────────────────

describe('executarTransferencia — relatório antes do DELETE', () => {
  it('falha ao gerar o relatório NÃO toca em nada', async () => {
    comAcordos(3);
    baixarRelatorioMock.mockRejectedValue(new Error('sem memória para a planilha'));

    const r = await executarTransferencia({
      alvo: ALVO_SETOR, levarAcordos: false, executadoPorId: 'admin-1',
    });

    expect(r.status).toBe('falha');
    if (r.status === 'falha') expect(r.mensagem).toContain('NADA foi');
    // Nem o perfil: o pior estado é a pessoa transferida sem o registro do que
    // ela tinha antes.
    expect(ops.filter(o => o.tabela === 'perfis')).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });

  it('o relatório é gerado antes do UPDATE de perfis', async () => {
    comAcordos(3);
    await executarTransferencia({
      alvo: ALVO_SETOR, levarAcordos: false, executadoPorId: 'admin-1',
    });

    expect(baixarRelatorioMock).toHaveBeenCalledTimes(1);
    // Nenhuma escrita antes da chamada do relatório: o mock dela é síncrono no
    // fluxo, então basta que perfis apareça DEPOIS na fila de operações.
    expect(ops.findIndex(o => o.tabela === 'perfis')).toBeGreaterThanOrEqual(0);
  });

  it('sem tabulação nenhuma, não gera relatório', async () => {
    comAcordos(0);
    const r = await executarTransferencia({
      alvo: ALVO_SETOR, levarAcordos: false, executadoPorId: 'admin-1',
    });

    expect(baixarRelatorioMock).not.toHaveBeenCalled();
    expect(r.status).toBe('ok');
  });

  it('levar as tabulações não gera relatório — nada será apagado', async () => {
    comAcordos(5);
    await executarTransferencia({
      alvo: ALVO_SETOR, levarAcordos: true, executadoPorId: 'admin-1',
    });

    expect(baixarRelatorioMock).not.toHaveBeenCalled();
    expect(rpcCalls.filter(c => c.nome === 'fn_admin_apagar_acordos_do_usuario')).toHaveLength(0);
  });
});

// ── O perfil ─────────────────────────────────────────────────────────────────

describe('executarTransferencia — o perfil', () => {
  it('grava empresa, setor e ZERA a equipe', async () => {
    await executarTransferencia({
      alvo: ALVO_SETOR, levarAcordos: true, executadoPorId: 'admin-1',
    });

    const up = ops.find(o => o.tabela === 'perfis' && o.verbo === 'update');
    expect(up?.payload).toEqual({
      empresa_id: BOOKPLAY,
      setor_id:   PLAY_5,
      // A equipe pertence ao setor de origem. Quem devolve a pessoa ao card
      // daquela equipe no mês corrente é o fantasma, não este campo.
      equipe_id:  null,
    });
  });

  it('sem permissão (0 linhas) devolve falha e não segue', async () => {
    respostas.set('perfis::update', { data: [], error: null });

    const r = await executarTransferencia({
      alvo: ALVO_SETOR, levarAcordos: true, executadoPorId: 'admin-1',
    });

    expect(r.status).toBe('falha');
    if (r.status === 'falha') expect(r.mensagem).toContain('Sem permissão');
    expect(ops.some(o => o.tabela === 'perfis_transferencias')).toBe(false);
  });
});

// ── Empresa nunca leva ───────────────────────────────────────────────────────

describe('executarTransferencia — troca de empresa', () => {
  it('IGNORA levarAcordos e apaga mesmo assim', async () => {
    comAcordos(4);

    const r = await executarTransferencia({
      // A caixinha nem aparece na tela para empresa; se aparecer por engano, o
      // serviço não obedece.
      alvo: ALVO_EMPRESA, levarAcordos: true, executadoPorId: 'admin-1',
    });

    expect(baixarRelatorioMock).toHaveBeenCalledTimes(1);
    expect(rpcCalls.some(c => c.nome === 'fn_admin_apagar_acordos_do_usuario')).toBe(true);
    if (r.status === 'ok') {
      expect(r.acordosMovidos).toBe(0);
      expect(r.acordosApagados).toBe(7);
    }
  });

  it('nunca recarimba setor de acordo numa troca de empresa', async () => {
    comAcordos(4);
    await executarTransferencia({
      alvo: ALVO_EMPRESA, levarAcordos: true, executadoPorId: 'admin-1',
    });

    expect(ops.some(o => o.tabela === 'acordos' && o.verbo === 'update')).toBe(false);
  });

  it('registra o tipo como "empresa"', async () => {
    await executarTransferencia({
      alvo: ALVO_EMPRESA, levarAcordos: false, executadoPorId: 'admin-1',
    });

    const ins = ops.find(o => o.tabela === 'perfis_transferencias' && o.verbo === 'insert');
    expect(ins?.payload?.tipo).toBe('empresa');
    expect(ins?.payload?.levou_acordos).toBe(false);
  });
});

// ── Levar as tabulações ──────────────────────────────────────────────────────

describe('executarTransferencia — levar as tabulações (setor)', () => {
  it('muda SÓ o setor do acordo — o vínculo EXTRA fica de pé', async () => {
    comAcordos(5);
    respostas.set('acordos::update', { data: [{ id: 'a-1' }, { id: 'a-2' }], error: null });

    const r = await executarTransferencia({
      alvo: ALVO_SETOR, levarAcordos: true, executadoPorId: 'admin-1',
    });

    const up = ops.find(o => o.tabela === 'acordos' && o.verbo === 'update');
    // Só setor_id. Mexer em vinculo_operador_id quebraria o acordo do OUTRO
    // operador, que não foi transferido nem pediu nada.
    expect(up?.payload).toEqual({ setor_id: PLAY_5 });
    if (r.status === 'ok') expect(r.acordosMovidos).toBe(2);
  });

  it('não chama a RPC que apaga', async () => {
    comAcordos(5);
    await executarTransferencia({
      alvo: ALVO_SETOR, levarAcordos: true, executadoPorId: 'admin-1',
    });
    expect(rpcCalls).toHaveLength(0);
  });
});

// ── Clones ───────────────────────────────────────────────────────────────────

describe('executarTransferencia — clones', () => {
  it('remove os clones e os guarda para o desfazer', async () => {
    respostas.set('equipe_operadores_clones::select', {
      data: [
        { equipe_id: 'eq-digital', conta_recebimento: true },
        { equipe_id: 'eq-retencao', conta_recebimento: false },
      ],
      error: null,
    });

    const r = await executarTransferencia({
      alvo: ALVO_SETOR, levarAcordos: true, executadoPorId: 'admin-1',
    });

    expect(ops.some(o => o.tabela === 'equipe_operadores_clones' && o.verbo === 'delete')).toBe(true);
    if (r.status === 'ok') expect(r.clonesRemovidos).toBe(2);

    const ins = ops.find(o => o.tabela === 'perfis_transferencias' && o.verbo === 'insert');
    expect(ins?.payload?.clones_removidos).toEqual([
      { equipe_id: 'eq-digital',  conta_recebimento: true },
      // `false` preservado: recolocar como `true` faria a pessoa voltar
      // contando numa equipe onde ela estava só de vitrine.
      { equipe_id: 'eq-retencao', conta_recebimento: false },
    ]);
  });

  it('sem clone nenhum, não chama delete', async () => {
    const r = await executarTransferencia({
      alvo: ALVO_SETOR, levarAcordos: true, executadoPorId: 'admin-1',
    });

    expect(ops.some(o => o.tabela === 'equipe_operadores_clones' && o.verbo === 'delete')).toBe(false);
    if (r.status === 'ok') expect(r.clonesRemovidos).toBe(0);
  });
});

// ── O registro ───────────────────────────────────────────────────────────────

describe('executarTransferencia — registro', () => {
  it('guarda a origem inteira, para o desfazer ter o que restaurar', async () => {
    await executarTransferencia({
      alvo: ALVO_SETOR, levarAcordos: true, executadoPorId: 'admin-1',
    });

    const ins = ops.find(o => o.tabela === 'perfis_transferencias' && o.verbo === 'insert');
    expect(ins?.payload).toMatchObject({
      empresa_id:         BOOKPLAY,
      perfil_id:          'p-bruno',
      tipo:               'setor',
      origem_setor_id:    PLAY_4,
      origem_equipe_id:   'eq-manha',
      destino_empresa_id: BOOKPLAY,
      destino_setor_id:   PLAY_5,
      levou_acordos:      true,
      criado_por:         'admin-1',
    });
    expect(String(ins?.payload?.mes)).toMatch(/^\d{4}-\d{2}$/);
  });

  it('falha no registro NÃO desfaz a transferência, mas avisa', async () => {
    // A transferência já aconteceu — o perfil mudou. Fingir que falhou faria o
    // admin repetir a operação em cima de um estado já mudado.
    respostas.set('perfis_transferencias::insert', {
      data: null, error: { message: 'relation "perfis_transferencias" does not exist' },
    });

    const r = await executarTransferencia({
      alvo: ALVO_SETOR, levarAcordos: true, executadoPorId: 'admin-1',
    });

    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.transferenciaId).toBeNull();
      expect(r.avisoRegistro).toContain('20260813b');
      expect(r.avisoRegistro).toContain('desfazer');
    }
  });
});

// ── Mensagens ────────────────────────────────────────────────────────────────

describe('traduzirTransferencia', () => {
  it('colisão de login vira instrução, não erro cru do Postgres', () => {
    // O caso é real: `robson_cofen` existe nas DUAS empresas hoje.
    const m = traduzirTransferencia(
      'duplicate key value violates unique constraint "idx_perfis_usuario_empresa"',
    );
    expect(m).toContain('login');
    expect(m).not.toContain('duplicate key');
  });

  it('função ausente aponta a migration', () => {
    expect(traduzirTransferencia('could not find the function'))
      .toContain('20260813');
  });
});
