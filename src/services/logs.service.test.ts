/**
 * src/services/logs.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cobre o que pode dar errado em silêncio no serviço de auditoria:
 *
 *   • `registrarLog` NUNCA propaga erro — nem quando a RPC recusa, nem quando a
 *     rede cai. Se a auditoria derrubasse a operação de negócio, o remédio seria
 *     pior que a doença.
 *   • Os filtros da tela chegam ao banco como a tela prometeu, e um termo com
 *     caractere reservado do PostgREST não quebra a consulta nem é mutilado.
 *   • `normalizarResumo` sobrevive ao `count(*)` que o driver entrega como
 *     string, e ao resumo vazio.
 *   • O CSV é seguro para abrir no Excel: separador certo, aspas escapadas, e
 *     célula que começa com `=` neutralizada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock do Supabase ────────────────────────────────────────────────────────
const estado = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  rpcResultado: { data: null as unknown, error: null as { message: string } | null },
  rpcThrow: null as Error | null,
  /** Filtros aplicados na última query de `logs_sistema`. */
  filtros: [] as Array<[string, ...unknown[]]>,
  paginas: [] as Array<{ data: unknown[]; count: number }>,
}));

vi.mock('@/lib/supabase', () => {
  function builder() {
    const b: Record<string, unknown> = {};
    const encadeia = (nome: string) => (...args: unknown[]) => {
      estado.filtros.push([nome, ...args]);
      return b;
    };
    for (const m of ['eq', 'gte', 'lte', 'or', 'ilike', 'contains', 'order', 'limit']) {
      b[m] = encadeia(m);
    }
    b.select = (...args: unknown[]) => { estado.filtros.push(['select', ...args]); return b; };
    b.range = (...args: unknown[]) => {
      estado.filtros.push(['range', ...args]);
      const pagina = estado.paginas.shift() ?? { data: [], count: 0 };
      return Promise.resolve({ data: pagina.data, count: pagina.count, error: null });
    };
    // Sem `range` (fetchHistoricoRegistro) a promessa resolve no `limit`.
    b.then = (resolve: (v: unknown) => unknown) => {
      const pagina = estado.paginas.shift() ?? { data: [], count: 0 };
      return Promise.resolve(resolve({ data: pagina.data, count: pagina.count, error: null }));
    };
    return b;
  }

  return {
    supabase: {
      from: () => builder(),
      rpc: (fn: string, args: unknown) => {
        estado.rpcCalls.push({ fn, args });
        if (estado.rpcThrow) return Promise.reject(estado.rpcThrow);
        return Promise.resolve(estado.rpcResultado);
      },
    },
  };
});

import {
  registrarLog,
  registrarLoginRecusado,
  fetchLogs,
  fetchResumoLogs,
  normalizarResumo,
  exportarLogsCsv,
  celulaCsv,
  expurgarLogs,
  RESUMO_VAZIO,
} from './logs.service';

beforeEach(() => {
  estado.rpcCalls.length = 0;
  estado.filtros.length = 0;
  estado.paginas.length = 0;
  estado.rpcResultado = { data: null, error: null };
  estado.rpcThrow = null;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════
describe('registrarLog', () => {
  it('envia todos os campos com os nomes que a RPC espera', async () => {
    estado.rpcResultado = { data: 'log-1', error: null };

    const id = await registrarLog({
      acao: 'acordo_excluido_em_lote',
      categoria: 'acordo',
      severidade: 'aviso',
      descricao: 'Excluiu 3 acordos',
      empresaId: 'emp-1',
      tabela: 'acordos',
      registroId: 'a-1',
      alvoTipo: 'acordo',
      alvoRotulo: 'NR 123',
      campos: ['valor'],
      detalhes: { quantidade: 3 },
    });

    expect(id).toBe('log-1');
    expect(estado.rpcCalls).toHaveLength(1);
    expect(estado.rpcCalls[0].fn).toBe('fn_log_registrar');
    expect(estado.rpcCalls[0].args).toMatchObject({
      p_acao: 'acordo_excluido_em_lote',
      p_categoria: 'acordo',
      p_severidade: 'aviso',
      p_descricao: 'Excluiu 3 acordos',
      p_empresa_id: 'emp-1',
      p_tabela: 'acordos',
      p_registro_id: 'a-1',
      p_alvo_tipo: 'acordo',
      p_alvo_rotulo: 'NR 123',
      p_campos: ['valor'],
      p_detalhes: { quantidade: 3 },
      p_origem: 'ui',
    });
  });

  it('assume categoria "sistema", severidade "info" e origem "ui" por omissão', async () => {
    await registrarLog({ acao: 'evento_simples' });
    expect(estado.rpcCalls[0].args).toMatchObject({
      p_categoria: 'sistema',
      p_severidade: 'info',
      p_origem: 'ui',
    });
  });

  it('devolve null e NÃO lança quando a RPC recusa', async () => {
    estado.rpcResultado = { data: null, error: { message: 'permission denied' } };
    await expect(registrarLog({ acao: 'x' })).resolves.toBeNull();
  });

  it('devolve null e NÃO lança quando a chamada estoura', async () => {
    // O caso real: sessão expirada no meio de uma exclusão. A exclusão já
    // aconteceu; o log falhar não pode virar exceção na tela.
    estado.rpcThrow = new Error('network down');
    await expect(registrarLog({ acao: 'x' })).resolves.toBeNull();
  });
});

describe('registrarLoginRecusado', () => {
  it('chama a função anônima com identificador e motivo', async () => {
    await registrarLoginRecusado('joao', 'credenciais_invalidas');
    expect(estado.rpcCalls[0]).toEqual({
      fn: 'fn_log_login_recusado',
      args: { p_identificador: 'joao', p_motivo: 'credenciais_invalidas' },
    });
  });

  it('engole erro — a tela de login fala de senha, não de log', async () => {
    estado.rpcThrow = new Error('offline');
    await expect(registrarLoginRecusado('joao')).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('fetchLogs', () => {
  it('aplica cada filtro da tela na consulta', async () => {
    estado.paginas.push({ data: [], count: 0 });

    await fetchLogs({
      empresaId: 'emp-1',
      categoria: 'seguranca',
      severidade: 'critico',
      acao: 'permissoes_alteradas',
      usuarioId: 'u-1',
      tabela: 'cargos_permissoes',
      origem: 'trigger',
      de: '2026-08-01T00:00:00.000Z',
      ate: '2026-08-12T23:59:59.999Z',
      campo: 'valor',
    });

    const aplicados = estado.filtros.map((f) => f.join('|'));
    expect(aplicados).toContain('eq|empresa_id|emp-1');
    expect(aplicados).toContain('eq|categoria|seguranca');
    expect(aplicados).toContain('eq|severidade|critico');
    expect(aplicados).toContain('eq|acao|permissoes_alteradas');
    expect(aplicados).toContain('eq|usuario_id|u-1');
    expect(aplicados).toContain('eq|tabela|cargos_permissoes');
    expect(aplicados).toContain('eq|origem|trigger');
    expect(aplicados).toContain('gte|criado_em|2026-08-01T00:00:00.000Z');
    expect(aplicados).toContain('lte|criado_em|2026-08-12T23:59:59.999Z');
    // `campos` é TEXT[]: filtrar por campo alterado é `contains`, não `eq`.
    expect(estado.filtros.some((f) => f[0] === 'contains' && f[1] === 'campos')).toBe(true);
  });

  it('busca em cinco colunas quando o termo não tem caractere reservado', async () => {
    estado.paginas.push({ data: [], count: 0 });
    await fetchLogs({ busca: 'Silva' });

    const or = estado.filtros.find((f) => f[0] === 'or');
    expect(or).toBeDefined();
    const expressao = String(or![1]);
    expect(expressao).toContain('descricao.ilike.*Silva*');
    expect(expressao).toContain('alvo_rotulo.ilike.*Silva*');
    expect(expressao).toContain('usuario_nome.ilike.*Silva*');
    expect(expressao).toContain('acao.ilike.*Silva*');
    expect(expressao).toContain('registro_id.ilike.*Silva*');
  });

  it('com vírgula ou parêntese, recua para `ilike` na descrição SEM mutilar o termo', async () => {
    estado.paginas.push({ data: [], count: 0 });
    // A vírgula é separador de condição na expressão `or` do PostgREST: usá-la
    // ali devolveria 400, e trocá-la por espaço mudaria o que a pessoa procurou.
    await fetchLogs({ busca: 'Silva, João (SP)' });

    expect(estado.filtros.some((f) => f[0] === 'or')).toBe(false);
    expect(estado.filtros).toContainEqual(['ilike', 'descricao', '%Silva, João (SP)%']);
  });

  it('não monta filtro de busca quando o termo é só espaço', async () => {
    estado.paginas.push({ data: [], count: 0 });
    await fetchLogs({ busca: '   ' });
    expect(estado.filtros.some((f) => f[0] === 'or')).toBe(false);
    expect(estado.filtros.some((f) => f[0] === 'ilike')).toBe(false);
  });

  it('calcula `temMais` comparando o carregado com o total', async () => {
    estado.paginas.push({ data: Array.from({ length: 50 }, (_, i) => ({ id: `l${i}` })), count: 120 });
    const primeira = await fetchLogs({}, 0);
    expect(primeira.total).toBe(120);
    expect(primeira.temMais).toBe(true);

    estado.paginas.push({ data: Array.from({ length: 20 }, (_, i) => ({ id: `x${i}` })), count: 20 });
    const unica = await fetchLogs({}, 0);
    expect(unica.temMais).toBe(false);
  });

  it('pede o intervalo certo para a página solicitada', async () => {
    estado.paginas.push({ data: [], count: 0 });
    await fetchLogs({}, 2, 50);
    expect(estado.filtros).toContainEqual(['range', 100, 149]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('normalizarResumo', () => {
  it('converte contagens BIGINT que chegam como string', () => {
    // `count(*)` no Postgres é BIGINT; o driver JSON entrega "1234". Sem a
    // conversão, "12" + 1 daria "121" na tela.
    const r = normalizarResumo({
      total: '1234',
      criticos: '7',
      usuarios_ativos: '3',
      por_categoria: [{ chave: 'acordo', total: '900' }],
      por_dia: [{ chave: '2026-08-12', total: '10', criticos: '2' }],
    });
    expect(r.total).toBe(1234);
    expect(r.criticos).toBe(7);
    expect(r.usuariosAtivos).toBe(3);
    expect(r.porCategoria[0]).toEqual({ chave: 'acordo', total: 900, id: null, criticos: undefined });
    expect(r.porDia[0].criticos).toBe(2);
  });

  it('devolve estrutura completa a partir de nada', () => {
    expect(normalizarResumo(null)).toEqual(RESUMO_VAZIO);
    expect(normalizarResumo({})).toEqual(RESUMO_VAZIO);
  });

  it('preserva o id do autor para o filtro do painel', () => {
    const r = normalizarResumo({ por_usuario: [{ chave: 'Ana', id: 'u-9', total: '5' }] });
    expect(r.porUsuario[0]).toEqual({ chave: 'Ana', total: 5, id: 'u-9', criticos: undefined });
  });
});

describe('fetchResumoLogs', () => {
  it('repassa os filtros e normaliza a resposta', async () => {
    estado.rpcResultado = { data: { total: '42' }, error: null };
    const r = await fetchResumoLogs({ empresaId: 'emp-1', busca: '  termo  ' });
    expect(estado.rpcCalls[0].fn).toBe('fn_logs_resumo');
    expect(estado.rpcCalls[0].args).toMatchObject({ p_empresa_id: 'emp-1', p_busca: 'termo' });
    expect(r.total).toBe(42);
  });

  it('devolve resumo vazio quando a RPC falha, sem lançar', async () => {
    estado.rpcResultado = { data: null, error: { message: 'boom' } };
    await expect(fetchResumoLogs({})).resolves.toEqual(RESUMO_VAZIO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('celulaCsv', () => {
  it('envolve em aspas e duplica aspas internas (RFC 4180)', () => {
    expect(celulaCsv('texto')).toBe('"texto"');
    expect(celulaCsv('disse "oi"')).toBe('"disse ""oi"""');
  });

  it('neutraliza célula que o Excel interpretaria como fórmula', () => {
    // Sem o apóstrofo, uma descrição começando com "=" seria EXECUTADA pelo
    // Excel de quem abriu o arquivo — conteúdo do banco virando fórmula.
    expect(celulaCsv('=1+1')).toBe(`"'=1+1"`);
    expect(celulaCsv('+55 11')).toBe(`"'+55 11"`);
    expect(celulaCsv('-teste')).toBe(`"'-teste"`);
    expect(celulaCsv('@usuario')).toBe(`"'@usuario"`);
  });

  it('trata nulo e indefinido como célula vazia', () => {
    expect(celulaCsv(null)).toBe('""');
    expect(celulaCsv(undefined)).toBe('""');
  });
});

describe('exportarLogsCsv', () => {
  it('monta cabeçalho, uma linha por evento e o diff resumido', async () => {
    estado.paginas.push({
      data: [{
        id: 'l1',
        criado_em: '2026-08-12T14:30:00.000Z',
        acao: 'acordo_status_alterado',
        categoria: 'acordo',
        severidade: 'aviso',
        descricao: 'Mudou o status do acordo NR 123',
        usuario_nome: 'Ana',
        usuario_cargo: 'operador',
        usuario_email: 'ana@x.com',
        empresas: { nome: 'PaguePlay' },
        alvo_rotulo: 'NR 123',
        tabela: 'acordos',
        registro_id: 'a-1',
        campos: ['status'],
        antes: { status: 'nao_pago' },
        depois: { status: 'pago' },
        origem: 'trigger',
        detalhes: null,
      }],
      count: 1,
    });

    const { csv, linhas, truncado } = await exportarLogsCsv({});

    expect(linhas).toBe(1);
    expect(truncado).toBe(false);

    const [cabecalho, primeira] = csv.split('\r\n');
    expect(cabecalho).toContain('"Data/Hora"');
    expect(cabecalho).toContain('"Campos alterados"');
    // Separador ponto e vírgula: o Excel em pt-BR usa vírgula como decimal.
    expect(cabecalho.split(';')).toHaveLength(17);
    expect(primeira).toContain('Mudou o status do acordo NR 123');
    expect(primeira).toContain('Status: Não pago → Pago');
    expect(primeira).toContain('Banco de dados');
  });

  it('devolve só o cabeçalho quando não há nada no recorte', async () => {
    estado.paginas.push({ data: [], count: 0 });
    const { csv, linhas } = await exportarLogsCsv({});
    expect(linhas).toBe(0);
    expect(csv.split('\r\n')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('expurgarLogs', () => {
  it('chama a RPC com os dias e devolve o número REAL de removidos', async () => {
    estado.rpcResultado = { data: 412, error: null };
    const r = await expurgarLogs(180, 'emp-1');
    expect(estado.rpcCalls[0]).toEqual({
      fn: 'fn_logs_expurgar',
      args: { p_dias: 180, p_empresa_id: 'emp-1' },
    });
    expect(r).toEqual({ removidos: 412, erro: null });
  });

  it('propaga a mensagem de recusa em vez de fingir sucesso', async () => {
    // Era exatamente aqui que a versão 1.0 mentia: DELETE via PostgREST numa
    // tabela sem política de DELETE respondia sucesso com zero linhas, e a tela
    // dizia "Logs apagados com sucesso".
    estado.rpcResultado = { data: null, error: { message: 'Retenção mínima de 30 dias' } };
    const r = await expurgarLogs(5);
    expect(r.removidos).toBe(0);
    expect(r.erro).toBe('Retenção mínima de 30 dias');
  });
});
