/**
 * A tela do líder MONTA? — teste de fumaça.
 *
 * ## Por que ele existe
 *
 * A aba "Por operador" foi reescrita com 4.493 testes verdes, typecheck em
 * exit 0 e build de produção passando — e quebrava ao abrir, com
 * `Cannot access 'orfaos' before initialization`. Uma constante lia um
 * `useState` declarado abaixo dela; zona morta temporal.
 *
 * Nada disso pegava porque nenhum teste do repositório MONTAVA esta tela. Os
 * testes cobriam as funções puras (`agregacaoLider`, `linhaOperador`,
 * `recorte`), que são as fáceis de cobrir, e a tela em si — 1.400 linhas, seis
 * hooks e duas fontes de dados — não era montada por ninguém.
 *
 * Este arquivo não confere número nenhum. Ele responde uma pergunta só, e é a
 * primeira que o usuário faz: a tela abre? Uma exceção durante o render falha o
 * teste, seja ela de ordem de declaração, de prop obrigatória faltando ou de
 * hook chamado fora de ordem.
 *
 * As três lentes são montadas porque cada uma acorda um caminho diferente:
 * `mes` lê o analítico, `dia` lê o diário e desenha a faixa de pulso, `periodo`
 * filtra client-side.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { permissoesDoCargo } from '@/test/permissoesDoCargo';
import type { Recorte } from '@/pages/Analitico/recorte';

const { perfilRef, tenantRef } = vi.hoisted(() => ({
  perfilRef: {
    current: {
      id: 'perfil-1', nome: 'Líder Um', usuario: 'lider.um',
      perfil: 'lider', setor_id: 'setor-1', lider_id: null,
    } as unknown,
  },
  tenantRef: { current: { slug: 'pagueplay', isPaguePlay: true } },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: perfilRef.current }) }));
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: { id: 'empresa-1', nome: 'Empresa' } }),
}));
vi.mock('@/lib/tenant-config', () => ({ useTenant: () => tenantRef.current }));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => permissoesDoCargo(
    (perfilRef.current as { perfil?: string }).perfil,
  ),
}));

// Os hooks de dados devolvem vazio: a pergunta aqui é se a tela monta, não o
// que ela soma. Tela vazia é justamente o caso em que um `undefined.length`
// aparece.
vi.mock('@/hooks/useAnaliticoDashboard', () => ({
  useAnaliticoDashboard: () => ({
    linhas: [], total: 0, carregado: true, dbAtiva: true, refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useDiario', () => ({
  useDiario: () => ({
    dados: [], loading: false, error: null, novosIds: new Set(), refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAnaliticoImport', () => ({
  useAnaliticoImport: () => ({ estado: 'idle', preview: null, resetar: vi.fn() }),
}));
vi.mock('@/hooks/useDiarioImport', () => ({
  useDiarioImport: () => ({ estado: 'idle', preview: null, resetar: vi.fn() }),
}));

// O serviço inteiro em modo vazio. `importActual` não serve: ele abriria
// conexão de verdade com o Supabase de produção na carga do módulo.
vi.mock('@/services/analitico/analitico.service', () => ({
  buscarResumoOperadoresAnalitico: vi.fn(async () => ({ data: [], error: null })),
  buscarAnalitico:                 vi.fn(async () => ({ data: [], error: null })),
  buscarDestaquesDoMes:            vi.fn(async () => ({ data: [], error: null })),
  buscarDestaquesPorGrupo:         vi.fn(async () => ({ data: [], error: null })),
  buscarEquipesComOperadores:      vi.fn(async () => ({
    equipes: [], operadorEquipeMap: {}, equipesExtrasPorOperador: {},
    situacaoPorOperador: {}, transferidos: {},
  })),
  buscarTotalOrfaosPorSetor: vi.fn(async () => ({})),
  buscarTotalPorSetor:       vi.fn(async () => ({})),
  buscarResumoMensal:        vi.fn(async () => ({ data: null, error: null })),
  removerLinhaAnalitico:     vi.fn(async () => ({ error: null })),
  removerOrfaosDoMes:        vi.fn(async () => ({ error: null })),
  atualizarResumoMensal:     vi.fn(async () => ({ error: null })),
  mapaSetorDaEquipe:         () => new Map(),
}));

/*
 * O CLIENTE, e não só os serviços.
 *
 * A tela usa `supabase` direto: `AnaliticoLider.tsx:487` faz
 * `await supabase.from('setores').select(...)` dentro do `useEffect` de
 * montagem, para descobrir os setores alternativos. Mockar os hooks e o
 * `analitico.service` não alcança essa chamada.
 *
 * Sem este mock o teste saía para a rede de verdade, na URL de fachada do
 * `vitest.config.ts` (`http://localhost:54321`). No Windows a tentativa vai a
 * `::1` e a `127.0.0.1` antes de recusar, e o dump do `ECONNREFUSED` aparecia
 * na saída da suíte. O teste não espera pela resposta, mas o processo carrega
 * a pendência — e sob a carga da suíte cheia era este arquivo que estourava os
 * 5s, de forma intermitente: verde sozinho, vermelho junto com os outros 273.
 *
 * `importarOriginal` aqui é seguro (ao contrário do que vale para o serviço):
 * `lib/supabase.ts` só CONSTRÓI o cliente no topo, não conecta. Preservar os
 * outros exports evita quebrar quem importa `createIsolatedAuthClient`.
 */
vi.mock('@/lib/supabase', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('@/lib/supabase')>();

  const construtor = () => {
    const b: Record<string, unknown> = {};
    const encadeia = () => b;
    for (const metodo of [
      'select', 'insert', 'update', 'delete', 'eq', 'neq', 'in',
      'gte', 'lte', 'is', 'or', 'order', 'limit', 'range',
    ]) b[metodo] = encadeia;

    const vazio = { data: [], error: null };
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single      = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(vazio).then(ok);
    return b;
  };

  const canal: Record<string, unknown> = {};
  canal.on        = () => canal;
  canal.subscribe = () => canal;
  canal.unsubscribe = () => Promise.resolve('ok');

  return {
    ...original,
    supabase: {
      from:          construtor,
      rpc:           () => Promise.resolve({ data: null, error: null }),
      channel:       () => canal,
      removeChannel: () => Promise.resolve('ok'),
    },
  };
});

describe('AnaliticoLider monta', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const props = {
    empresaId: 'empresa-1',
    setorId: null,
    podeVerTodosSetores: true,
    temPermissaoImportar: true,
    operadorId: 'perfil-1',
    operadorNome: 'Líder Um',
    liderId: null,
    onAbrirNovoAcordo: vi.fn(),
    onVerAcordo: vi.fn(),
    onRefetch: vi.fn(),
  };

  const recortes: Recorte[] = [
    { modo: 'mes', mes: '2026-09' },
    { modo: 'dia', dia: '2026-09-05' },
    { modo: 'periodo', mes: '2026-09', inicio: '2026-09-01', fim: '2026-09-10' },
  ];

  /*
   * 20s em vez dos 5s padrão.
   *
   * Não é para esconder lentidão: é o custo real do que este arquivo faz.
   * Cada caso importa `AnaliticoLider` (1.926 linhas, seis hooks, duas fontes
   * de dados) e RENDERIZA a árvore inteira — sozinho já leva ~3,5s dos 5, e
   * quando os 273 outros arquivos disputam a CPU o primeiro caso passava do
   * teto. Era daí que vinha o vermelho intermitente da suíte.
   *
   * O teto continua existindo e continua baixo o bastante para pegar laço
   * infinito ou promessa que nunca resolve, que é o que um timeout deve pegar.
   */
  const TEMPO = 20_000;

  it.each(recortes.map(r => [r.modo, r] as const))(
    'monta sem lançar no recorte %s',
    async (_modo, recorte) => {
      const { AnaliticoLider } = await import('./AnaliticoLider');
      expect(() => render(<AnaliticoLider {...props} recorte={recorte} />)).not.toThrow();
    },
    TEMPO,
  );

  it('desenha a régua de abas com "Por operador"', async () => {
    const { AnaliticoLider } = await import('./AnaliticoLider');
    render(<AnaliticoLider {...props} recorte={{ modo: 'mes', mes: '2026-09' }} />);
    expect(screen.getByRole('button', { name: /Por operador/ })).toBeInTheDocument();
  }, TEMPO);

  it('monta para quem enxerga um setor só — o caminho do escopo', async () => {
    const { AnaliticoLider } = await import('./AnaliticoLider');
    expect(() => render(
      <AnaliticoLider {...props}
        setorId="setor-1" podeVerTodosSetores={false}
        recorte={{ modo: 'dia', dia: '2026-09-05' }} />,
    )).not.toThrow();
  }, TEMPO);
});
