/**
 * useSetoresEquipes.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * O hook que substituiu o `useAnalytics()` que o Dashboard montava só para
 * pegar as listas de setor e equipe — e que, junto com o do AnalyticsPanel,
 * fazia a tela varrer todos os acordos do mês duas vezes.
 *
 * O teste que mais importa aqui é o do LAÇO. Na primeira versão o hook
 * dependia do objeto `perfil` inteiro; como `useAuth` devolve um objeto novo a
 * cada render, `carregar` mudava de identidade sempre, o efeito disparava de
 * novo, o `setState` provocava outro render — e a suíte morria com "JavaScript
 * heap out of memory". Não é um caso hipotético: aconteceu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const { perfilRef, empresaRef, chavesRef, fromSpy, composicaoSpy } = vi.hoisted(() => ({
  perfilRef:    { current: { perfil: 'lider', setor_id: 'setor-1' } as Record<string, unknown> | null },
  empresaRef:   { current: { id: 'emp-1' } as { id: string } | null },
  chavesRef:    { current: new Set<string>() },
  fromSpy:      vi.fn(),
  composicaoSpy: vi.fn(),
}));

// `useAuth` devolve um OBJETO NOVO a cada chamada, de propósito: é assim que o
// hook real se comporta e é o que provocava o laço.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: perfilRef.current ? { ...perfilRef.current } : null }),
}));
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: empresaRef.current ? { ...empresaRef.current } : null }),
}));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao: (c: string) => chavesRef.current.has(c) }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (tabela: string) => fromSpy(tabela) },
}));

/*
 * A lista de EQUIPES deixou de ser consulta própria em 03/09/2026.
 *
 * Ela sai de `buscarEquipesComOperadores` — a mesma função do Painel Líder e do
 * `useAnalytics` —, que decide sozinha entre o retrato do mês fechado e o
 * estado de hoje. O filtro precisa oferecer as equipes DAQUELE mês: a apagada
 * depois tem de continuar escolhível, e a criada depois não pode aparecer.
 *
 * `buscarSetoresDoRetrato` devolve `null` aqui: sem retrato, valem os nomes de
 * hoje, que é o caminho que estes casos exercitam.
 */
vi.mock('@/services/analitico/analitico.service', () => ({
  buscarEquipesComOperadores: (...args: unknown[]) => composicaoSpy(...args),
  buscarSetoresDoRetrato: () => Promise.resolve(null),
}));

const { useSetoresEquipes } = await import('@/hooks/useSetoresEquipes');

/**
 * Construtor encadeável que devolve `linhas`.
 *
 * `then` existe porque nem toda consulta do hook termina em `.order()`: a das
 * minhas equipes clonadas é `select().eq().eq()` e é aguardada direto, como o
 * PostgREST permite. Sem o `then` ela devolveria o próprio construtor e o
 * `data` viria `undefined` — um vazio que passaria por resposta legítima.
 */
function construtor(linhas: Record<string, unknown>[]) {
  const resposta = () => Promise.resolve({ data: linhas, error: null });
  const alvo = {
    select: () => alvo,
    eq:     () => alvo,
    in:     () => alvo,
    order:  resposta,
    then:   (aceita: (v: unknown) => unknown) => resposta().then(aceita),
  };
  return alvo;
}

beforeEach(() => {
  perfilRef.current    = { perfil: 'lider', setor_id: 'setor-1' };
  empresaRef.current   = { id: 'emp-1' };
  // Padrao: o caso do lider — enxerga o proprio setor e escolhe equipe, mas
  // nao escolhe setor.
  //
  // `dashboard_escopo_setor` e `dashboard_escopo_equipe_todas` entram aqui
  // desde 03/09/2026: e como o lider real esta configurado nas duas empresas
  // depois do backfill. Sem a segunda, a lista mostra so a equipe cadastrada da
  // pessoa — o que os casos proprios cobrem abaixo.
  chavesRef.current = new Set([
    'ver_dashboard', 'dashboard_escopo_individual', 'dashboard_escopo_equipe',
    'dashboard_escopo_setor', 'dashboard_escopo_equipe_todas',
  ]);
  fromSpy.mockReset();
  fromSpy.mockImplementation((tabela: string) =>
    construtor(tabela === 'equipes'
      ? [{ id: 'eq-1', nome: 'Equipe A', setor_id: 'setor-1' }]
      : [{ id: 's-1', nome: 'Setor 1' }]));

  composicaoSpy.mockReset();
  definirEquipes([{ id: 'eq-1', nome: 'Equipe A', setor_id: 'setor-1' }]);
});

/** As equipes que a composição do mês devolve. */
function definirEquipes(
  equipes: { id: string; nome: string; setor_id: string | null }[],
  operadorEquipeMap: Record<string, unknown> = {},
) {
  composicaoSpy.mockResolvedValue({
    equipes,
    operadorEquipeMap,
    equipesExtrasPorOperador: {},
    situacaoPorOperador: {},
    doRetrato: false,
  });
}

describe('useSetoresEquipes — não entra em laço', () => {
  it('consulta o banco UMA vez, mesmo com `perfil` mudando de identidade', async () => {
    const { result, rerender } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const chamadasIniciais = fromSpy.mock.calls.length;
    // Cada rerender faz `useAuth` devolver um objeto novo. Se as dependências
    // do efeito fossem o objeto, cada um destes dispararia outra rodada de
    // consultas — e em produção não haveria rerender que parasse.
    rerender();
    rerender();
    rerender();

    expect(fromSpy.mock.calls.length).toBe(chamadasIniciais);
  });

  it('recarrega quando o setor do usuário realmente muda', async () => {
    const { result, rerender } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // O líder não consulta `setores` (não escolhe setor) e as equipes vêm da
    // composição — então quem conta a recarga é ela, não o `from`.
    const antes = composicaoSpy.mock.calls.length;

    perfilRef.current = { perfil: 'lider', setor_id: 'setor-2' };
    rerender();

    await waitFor(() => expect(composicaoSpy.mock.calls.length).toBeGreaterThan(antes));
  });
});

/*
 * Estes casos falavam em cargo — "lider", "administrador" — porque era o cargo
 * que decidia. Agora quem decide sao os NIVEIS DA ABA, entao os casos falam
 * neles. O cargo continua no `perfilRef` porque o setor do perfil ainda importa
 * para quem nao escolhe setor.
 */
describe('useSetoresEquipes — o que cada nivel enxerga', () => {
  it('sem o nivel todos_setores nao ha lista de setores, so as equipes', async () => {
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setores).toEqual([]);
    expect(result.current.equipesDoSetor).toHaveLength(1);
    expect(fromSpy).not.toHaveBeenCalledWith('setores');
  });

  it('com todos_setores recebe as duas listas', async () => {
    chavesRef.current.add('dashboard_escopo_setor');
    chavesRef.current.add('dashboard_escopo_todos_setores');
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setores).toHaveLength(1);
    expect(result.current.equipesDoSetor).toHaveLength(1);
  });

  /*
   * Antes este caso era "administrador recebe os setores e nenhuma equipe",
   * porque a lista de equipes saia de `isPerfilLider` e admin nao esta la.
   * Cargo nao decide mais: o que tira a lista de equipes e nao ter o nivel.
   */
  it('sem o nivel equipe, nenhuma equipe e carregada', async () => {
    perfilRef.current = { perfil: 'administrador', setor_id: null };
    chavesRef.current = new Set([
      'ver_dashboard', 'dashboard_escopo_individual',
      'dashboard_escopo_setor', 'dashboard_escopo_todos_setores',
    ]);
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setores).toHaveLength(1);
    expect(result.current.equipesDoSetor).toEqual([]);
  });

  it('so com individual nao consulta nada', async () => {
    perfilRef.current = { perfil: 'operador', setor_id: 'setor-1' };
    chavesRef.current = new Set(['ver_dashboard', 'dashboard_escopo_individual']);
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fromSpy).not.toHaveBeenCalled();
    expect(result.current.setores).toEqual([]);
  });

  it('sem empresa, sai de loading sem consultar', async () => {
    empresaRef.current = null;
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fromSpy).not.toHaveBeenCalled();
  });

  /*
   * O defeito que o filtro unico veio consertar: a lista de equipes nao
   * seguia o setor escolhido. Com alcance amplo ela trazia a empresa inteira,
   * entao escolher o setor B e depois uma equipe do setor A cruzava dois
   * recortes impossiveis e devolvia tela vazia.
   */
  it('as equipes seguem o setor escolhido', async () => {
    chavesRef.current.add('dashboard_escopo_setor');
    chavesRef.current.add('dashboard_escopo_todos_setores');
    fromSpy.mockImplementation(() =>
      construtor([{ id: 'setor-1', nome: 'Setor 1' }, { id: 'setor-2', nome: 'Setor 2' }]));
    definirEquipes([
      { id: 'eq-1', nome: 'Equipe A', setor_id: 'setor-1' },
      { id: 'eq-2', nome: 'Equipe B', setor_id: 'setor-2' },
    ]);

    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Sem setor escolhido: as equipes que a consulta trouxe.
    expect(result.current.equipesDoSetor).toHaveLength(2);

    act(() => result.current.setSetorFiltro('setor-2'));
    expect(result.current.equipesDoSetor.map(e => e.id)).toEqual(['eq-2']);

    act(() => result.current.setSetorFiltro('setor-1'));
    expect(result.current.equipesDoSetor.map(e => e.id)).toEqual(['eq-1']);

    // De volta a "todos os setores": a lista inteira.
    act(() => result.current.setSetorFiltro(null));
    expect(result.current.equipesDoSetor).toHaveLength(2);
  });

  it('falha no banco não quebra a tela — devolve listas vazias', async () => {
    fromSpy.mockImplementation(() => { throw new Error('banco fora'); });
    composicaoSpy.mockRejectedValue(new Error('banco fora'));
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setores).toEqual([]);
    expect(result.current.equipesDoSetor).toEqual([]);
  });
});

/*
 * `dashboard_escopo_equipe_todas` — 03/09/2026.
 *
 * O pedido: «não tem a opção de se eu posso ver todas as equipes ou só a
 * minha». Antes, ligar o alcance de equipe num operador listava TODAS as
 * equipes do setor. A chave nova qualifica o nível: desligada, o filtro mostra
 * só as equipes de que a pessoa participa.
 *
 * Ela não pesa para quem alcança o setor — setor contém todas as equipes dele —
 * e é o que o primeiro caso aqui prova.
 */
describe('useSetoresEquipes — só a minha equipe ou todas', () => {
  /** As três equipes do setor; a pessoa está na do meio. */
  function tresEquipes(clonesEm: string[] = []) {
    fromSpy.mockImplementation((tabela: string) => {
      if (tabela === 'equipe_operadores_clones') {
        return construtor(clonesEm.map(id => ({ equipe_id: id })));
      }
      return construtor([{ id: 's-1', nome: 'Setor 1' }]);
    });
    definirEquipes([
      { id: 'eq-1', nome: 'Equipe A', setor_id: 'setor-1' },
      { id: 'eq-2', nome: 'Equipe B', setor_id: 'setor-1' },
      { id: 'eq-3', nome: 'Equipe C', setor_id: 'setor-1' },
    ]);
  }

  /*
   * A chave manda SOZINHA, e este é o caso que a primeira versão errou.
   *
   * Ela nasceu como «setor OU todos_setores OU a chave», com o argumento de
   * que quem alcança o setor alcança todas as equipes dele. Na prática o
   * administrador desligava a chave num cargo que continua com
   * `dashboard_escopo_setor` e não acontecia nada — um interruptor morto, que
   * é o defeito que o painel inteiro existe para não repetir.
   */
  it('alcance de setor NÃO passa por cima da chave desligada', async () => {
    perfilRef.current = { id: 'eu', perfil: 'operador', setor_id: 'setor-1', equipe_id: 'eq-2' };
    chavesRef.current = new Set([
      'ver_dashboard', 'dashboard_escopo_individual',
      'dashboard_escopo_equipe', 'dashboard_escopo_setor',
    ]);
    tresEquipes();

    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.podeTodasEquipes).toBe(false);
    expect(result.current.equipesDoSetor.map(e => e.id)).toEqual(['eq-2']);
  });

  it('sem setor e sem a chave, o filtro lista só a equipe da pessoa', async () => {
    perfilRef.current = { id: 'eu', perfil: 'operador', setor_id: 'setor-1', equipe_id: 'eq-2' };
    chavesRef.current = new Set([
      'ver_dashboard', 'dashboard_escopo_individual', 'dashboard_escopo_equipe',
    ]);
    tresEquipes();

    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.podeTodasEquipes).toBe(false);
    expect(result.current.equipesDoSetor.map(e => e.id)).toEqual(['eq-2']);
  });

  /*
   * Clone é empréstimo de mão de obra para outro setor, não uma segunda casa.
   * Listar a equipe emprestada devolveria à pessoa exatamente o alcance que
   * esta chave veio tirar.
   */
  it('quem está CLONADO em outra equipe continua vendo só a de origem', async () => {
    perfilRef.current = { id: 'eu', perfil: 'operador', setor_id: 'setor-1', equipe_id: 'eq-2' };
    chavesRef.current = new Set([
      'ver_dashboard', 'dashboard_escopo_individual', 'dashboard_escopo_equipe',
    ]);
    tresEquipes(['eq-3']);

    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.equipesDoSetor.map(e => e.id)).toEqual(['eq-2']);
    // E nem pergunta pelos clones: a resposta não mudaria a lista.
    expect(fromSpy).not.toHaveBeenCalledWith('equipe_operadores_clones');
  });

  it('com a chave ligada, volta a listar todas', async () => {
    perfilRef.current = { id: 'eu', perfil: 'operador', setor_id: 'setor-1', equipe_id: 'eq-2' };
    chavesRef.current = new Set([
      'ver_dashboard', 'dashboard_escopo_individual', 'dashboard_escopo_equipe',
      'dashboard_escopo_equipe_todas',
    ]);
    tresEquipes();

    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.podeTodasEquipes).toBe(true);
    expect(result.current.equipesDoSetor).toHaveLength(3);
  });

  /*
   * Sem equipe cadastrada, a lista fica vazia — e o
   * `<FiltroEscopo />` esconde a linha inteira em vez de mostrar uma moldura
   * com um botão só. Zerar aqui é melhor que devolver o setor: devolver o setor
   * é exatamente o que a chave veio impedir.
   */
  it('sem equipe cadastrada, a lista fica vazia em vez de cair no setor', async () => {
    perfilRef.current = { id: 'eu', perfil: 'operador', setor_id: 'setor-1' };
    chavesRef.current = new Set([
      'ver_dashboard', 'dashboard_escopo_individual', 'dashboard_escopo_equipe',
    ]);
    tresEquipes();

    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.equipesDoSetor).toEqual([]);
  });
});
