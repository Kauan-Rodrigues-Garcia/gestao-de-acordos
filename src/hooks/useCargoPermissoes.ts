/**
 * useCargoPermissoes — resolve o que a pessoa logada pode fazer.
 *
 * ## A regra, em quatro linhas
 *
 * ```
 * 1. admin ou super_admin ............... sim, sempre
 * 2. exceção da pessoa tem a chave ...... vale o valor dela
 * 3. permissão do cargo tem a chave ..... vale o valor dela
 * 4. nenhuma das duas ................... NÃO
 * ```
 *
 * ## Por que o passo 4 mudou
 *
 * Até 2026-08-15 existia aqui um `PERMISSOES_LEGADAS_PADRAO_TRUE`: chave
 * ausente devolvia `true` para 13 permissões. Só que a TELA lia
 * `permissoes[chave]` e renderizava o toggle DESLIGADO para a mesma ausência.
 *
 * A tela dizia "não" e o sistema dizia "sim" — em 25 casos medidos em produção,
 * incluindo operador da BookPlay com `editar_usuarios` e `editar_equipes`.
 *
 * O fallback existia porque havia ausência para interpretar. A migration
 * `20260815154058` acabou com a ausência: todo cargo tem o catálogo inteiro.
 * Sem ausência, o fallback não tem função — e a divergência não tem como voltar.
 *
 * ## O que estas permissões NÃO fazem
 *
 * Elas governam navegação e interface. Quem manda no dado é a RLS. Forçar
 * `ver_acordos_gerais` num operador não faz ele enxergar acordo alheio — a
 * política do banco continua negando, e isso é o comportamento correto.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { CARGOS_ACESSO_TOTAL } from '@/lib/permissoes-catalogo';
import { reconciliarLista, iguaisProfundo } from '@/lib/dadosVivos';
import { assinarSinal } from '@/lib/sinais';
import { espiarCache, invalidarCache, lerComCache } from '@/lib/cacheCurto';

export type PermissoesMap = Record<string, boolean>;

/** Estado de uma permissão na aba «Por pessoa». */
export type EstadoExcecao = 'herda' | 'sim' | 'nao';

export interface CargoPermissaoRow {
  id: string;
  empresa_id: string;
  cargo: string;
  permissoes: PermissoesMap;
  descricao?: string;
  atualizado_em: string;
}

export interface PerfilPermissaoRow {
  id: string;
  empresa_id: string;
  usuario_id: string;
  permissoes: PermissoesMap;
  atualizado_em: string;
  atualizado_por: string | null;
}

interface UseCargoPermissoesReturn {
  /** Permissões do CARGO da pessoa logada (sem as exceções aplicadas). */
  permissoes: PermissoesMap;
  /** Exceções da própria pessoa. Chave presente sobrescreve o cargo. */
  excecoes: PermissoesMap;
  /** Todas as linhas de cargo da empresa — a aba «Por cargo» usa. */
  todasPermissoes: CargoPermissaoRow[];
  /** Todas as exceções da empresa — a aba «Por pessoa» usa (só admin lê). */
  todasExcecoes: PerfilPermissaoRow[];
  loading: boolean;
  /** A pergunta que o app inteiro faz. */
  temPermissao: (key: string) => boolean;
  /**
   * A mesma pergunta, SEM o atalho do acesso total.
   *
   * Para as chaves de `PERMISSOES_EXPLICITAS`: o passo 1 da regra lá em cima
   * responde "sim" para administrador antes de olhar tabela nenhuma, e há poder
   * que ninguém deve receber por herança de cargo — só por concessão nominal.
   * Ver o comentário da lista em `permissoes-catalogo.ts`.
   */
  temPermissaoExplicita: (key: string) => boolean;
  /** admin e super_admin: acesso total por construção (migration 20260812b). */
  isAdmin: boolean;
  /** Resolve para OUTRA pessoa — a tela de administração usa para prever. */
  resolverParaUsuario: (usuarioId: string, cargo: string, key: string) => boolean;
  /**
   * O que o CARGO concede, sem aplicar exceção nenhuma.
   *
   * A aba «Por pessoa» mostra este valor ao lado da escolha, para o admin saber
   * o que está sobrescrevendo. Usar `resolverParaUsuario` ali fazia o rótulo
   * "cargo: não" aparecer justamente quando o cargo dizia SIM e a exceção é que
   * negava — o número mostrado era o resultado, não a origem.
   */
  valorDoCargo: (cargo: string, key: string) => boolean;
  /** O estado da exceção de alguém numa permissão. */
  estadoExcecao: (usuarioId: string, key: string) => EstadoExcecao;
  refresh: () => Promise<void>;
}

// ── Uma leitura para o app inteiro ───────────────────────────────────────────
//
// Este hook é montado em mais de dez componentes ao mesmo tempo (menu, chat,
// formulários, painéis). Cada um buscava as duas tabelas sozinho: 71 mil
// leituras por dia em 17/09/2026, para dados que mudam quando alguém salva o
// painel de permissões. Agora a leitura é compartilhada pelo `cacheCurto` e o
// sinal do banco é assinado UMA vez por empresa, não uma por componente.

interface DadosPermissoes {
  cargos:   CargoPermissaoRow[];
  excecoes: PerfilPermissaoRow[];
}

/**
 * Validade da leitura compartilhada. A mudança chega pelo sinal `permissoes:`
 * na hora; a validade só cobre o sinal perdido (aba dormindo, queda).
 */
const VALIDADE_PERMISSOES_MS = 10 * 60 * 1000;

/**
 * A chave leva a PESSOA e o cargo, não só a empresa: a RLS de
 * `perfis_permissoes` devolve todas as linhas para o admin e só a própria para
 * os demais. Duas pessoas na mesma aba (impersonação, troca de login) nunca
 * dividem resposta.
 */
function chavePermissoes(empresaId: string, perfilId: string | undefined, cargo: string): string {
  return `permissoes:${empresaId}:${perfilId ?? '-'}:${cargo}`;
}

async function lerPermissoes(empresaId: string): Promise<DadosPermissoes> {
  const [resCargos, resExcecoes] = await Promise.all([
    supabase.from('cargos_permissoes').select('*')
      .eq('empresa_id', empresaId).order('cargo'),
    // A RLS já recorta: operador recebe só a própria linha, admin recebe
    // todas. Não é preciso filtrar por usuário aqui.
    supabase.from('perfis_permissoes').select('*')
      .eq('empresa_id', empresaId),
  ]);

  if (resCargos.error) throw resCargos.error;

  // Tabela nova: tolera ausência para o app não quebrar entre o deploy do
  // frontend e a aplicação da migration.
  if (resExcecoes.error) {
    console.warn('[permissoes] exceções indisponíveis:', resExcecoes.error.message);
  }
  return {
    cargos:   (resCargos.data as CargoPermissaoRow[]) ?? [],
    excecoes: resExcecoes.error ? [] : ((resExcecoes.data as PerfilPermissaoRow[]) ?? []),
  };
}

/** Uma assinatura do sinal por empresa, dividida entre os componentes montados. */
const mudancasPorEmpresa = new Map<string, { ouvintes: Set<() => void>; cancelar: () => void }>();

function ouvirMudancas(empresaId: string, ouvinte: () => void): () => void {
  let registro = mudancasPorEmpresa.get(empresaId);
  if (!registro) {
    const ouvintes = new Set<() => void>();
    // Descarta a leitura UMA vez e avisa todos; o primeiro a reler abre a busca
    // e os outros entram nela.
    const avisar = () => {
      invalidarCache(`permissoes:${empresaId}:`);
      for (const o of [...ouvintes]) o();
    };
    registro = {
      ouvintes,
      cancelar: assinarSinal('permissoes', empresaId, { onMudou: avisar, onReconectado: avisar }),
    };
    mudancasPorEmpresa.set(empresaId, registro);
  }
  const atual = registro;
  atual.ouvintes.add(ouvinte);
  return () => {
    atual.ouvintes.delete(ouvinte);
    if (atual.ouvintes.size > 0 || mudancasPorEmpresa.get(empresaId) !== atual) return;
    atual.cancelar();
    mudancasPorEmpresa.delete(empresaId);
  };
}

export function useCargoPermissoes(): UseCargoPermissoesReturn {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const cargo = perfil?.perfil ?? '';
  const isAdmin = (CARGOS_ACESSO_TOTAL as readonly string[]).includes(cargo);
  const chave = empresa?.id && cargo ? chavePermissoes(empresa.id, perfil?.id, cargo) : null;

  // Outro componente já leu: começa pronto, sem esconder o menu nem um frame.
  const [todasPermissoes, setTodasPermissoes] = useState<CargoPermissaoRow[]>(
    () => (chave ? espiarCache<DadosPermissoes>(chave, VALIDADE_PERMISSOES_MS)?.cargos : undefined) ?? []);
  const [todasExcecoes, setTodasExcecoes] = useState<PerfilPermissaoRow[]>(
    () => (chave ? espiarCache<DadosPermissoes>(chave, VALIDADE_PERMISSOES_MS)?.excecoes : undefined) ?? []);
  const [loading, setLoading] = useState(
    () => !(chave && espiarCache<DadosPermissoes>(chave, VALIDADE_PERMISSOES_MS)));

  /*
   * O realtime deste hook dispara a cada salvamento no painel de permissões — e
   * `loading` aqui não é detalhe de uma tela: `Layout` esconde TODO item de
   * menu enquanto ele é verdadeiro (`permLoading || !temPermissao(...)`). Ligá-lo
   * numa releitura fazia a barra lateral inteira sumir e voltar, para todo mundo
   * logado, a cada vez que alguém mexia numa chave.
   *
   * Agora ele vale só para a primeira carga. A releitura reconcilia: linha de
   * cargo que não mudou volta com a mesma referência, e quando nada mudou o
   * `setState` recebe o array anterior e não renderiza.
   */
  const primeiraCarga = useRef(true);

  /** @param forcar descarta a leitura compartilhada antes (o `refresh`). */
  const carregar = useCallback(async (forcar: boolean) => {
    if (!empresa?.id || !cargo || !chave) {
      setLoading(false);
      return;
    }

    const comEsqueleto = primeiraCarga.current
      && !espiarCache<DadosPermissoes>(chave, VALIDADE_PERMISSOES_MS);
    if (comEsqueleto) setLoading(true);
    if (forcar) invalidarCache(chave);
    try {
      const dados = await lerComCache(chave, VALIDADE_PERMISSOES_MS, () => lerPermissoes(empresa.id));
      // `iguaisProfundo`: a coluna `permissoes` é um JSONB, então o objeto vem
      // novo a cada leitura — a comparação rasa nunca acharia duas linhas iguais.
      setTodasPermissoes(atual => reconciliarLista(
        atual, dados.cargos, { chave: r => r.id, iguais: iguaisProfundo }));
      setTodasExcecoes(atual => reconciliarLista(
        atual, dados.excecoes, { chave: r => r.id, iguais: iguaisProfundo }));
    } catch (e) {
      console.warn('[useCargoPermissoes] fetch error:', e);
    } finally {
      if (primeiraCarga.current) setLoading(false);
      primeiraCarga.current = false;
    }
  }, [empresa?.id, cargo, chave]);

  const fetch = useCallback(() => carregar(true), [carregar]);

  // Trocar de empresa ou de cargo e contexto novo: o mapa em memoria e de
  // outra pessoa, e responder com ele seria conceder o que ela tinha.
  useEffect(() => { primeiraCarga.current = true; }, [empresa?.id, cargo]);

  useEffect(() => { void carregar(false); }, [carregar]);

  /**
   * Realtime: mudou a permissão, quem está logado sente na hora.
   *
   * Antes o hook buscava uma vez na montagem, então salvar uma permissão só
   * afetava a pessoa depois que ela recarregava a página — e ninguém avisava
   * que era preciso recarregar.
   *
   * Até 17/09/2026 isto assinava `cargos_permissoes` e `perfis_permissoes` pelo
   * Postgres Changes — e nenhuma das duas estava na publicação `supabase_realtime`:
   * o aviso nunca chegou. E o canal era cru: com o hook montado em dez
   * componentes, o primeiro a desmontar derrubava a escuta dos outros nove.
   * Agora é o sinal `permissoes:<empresa>` que o banco manda a cada comando
   * (migration 20260917110000), assinado uma vez por empresa: `ouvirMudancas`
   * descarta a leitura compartilhada e cada componente relê — o primeiro busca,
   * os outros entram na mesma busca.
   *
   * ## Só com sessão (21/09/2026)
   *
   * A guarda era só `empresa?.id`, e a empresa NÃO depende de estar logado:
   * `empresas_select` é `USING (ativo = true)` sem `TO`, então o `anon` lê, e o
   * `EmpresaProvider` resolve a empresa pelo slug do build antes de qualquer
   * sessão — é assim que a tela de login tem nome e logo.
   *
   * E este hook é chamado pelo `ProtectedRoute`, ANTES do `if (!user)`: hook não
   * pula por causa de um `return` mais abaixo. Deslogado (ou nos milissegundos
   * em que a sessão ainda está sendo restaurada) a assinatura saía mesmo assim,
   * e `permissoes:<empresa>` é canal PRIVADO — o join vai com a chave anônima,
   * `auth.uid()` é nulo, `fn_can_access_empresa` responde falso e o servidor
   * devolve «Unauthorized: You do not have permissions to read from this Channel
   * topic» (log do Realtime com `auth_user: null`).
   *
   * A mesma condição do `carregar`: sem cargo não há o que reler, e cargo só
   * existe com perfil — que só existe com sessão.
   */
  useEffect(() => {
    if (!empresa?.id || !cargo) return;
    return ouvirMudancas(empresa.id, () => { void carregar(false); });
  }, [empresa?.id, cargo, carregar]);

  const permissoes = useMemo(
    () => todasPermissoes.find(r => r.cargo === cargo)?.permissoes ?? {},
    [todasPermissoes, cargo],
  );

  const excecoes = useMemo(
    () => todasExcecoes.find(r => r.usuario_id === perfil?.id)?.permissoes ?? {},
    [todasExcecoes, perfil?.id],
  );

  const temPermissao = useCallback(
    (key: string): boolean => {
      if (isAdmin) return true;
      if (key in excecoes)   return !!excecoes[key];
      if (key in permissoes) return !!permissoes[key];
      // Ausente = negado. Ver o cabeçalho: o fallback legado morreu com a
      // migration que preencheu todas as chaves de todos os cargos.
      return false;
    },
    [isAdmin, excecoes, permissoes],
  );

  const temPermissaoExplicita = useCallback(
    (key: string): boolean => {
      if (key in excecoes)   return !!excecoes[key];
      if (key in permissoes) return !!permissoes[key];
      return false;
    },
    [excecoes, permissoes],
  );

  const resolverParaUsuario = useCallback(
    (usuarioId: string, cargoAlvo: string, key: string): boolean => {
      if ((CARGOS_ACESSO_TOTAL as readonly string[]).includes(cargoAlvo)) return true;
      const exc = todasExcecoes.find(r => r.usuario_id === usuarioId)?.permissoes ?? {};
      if (key in exc) return !!exc[key];
      const doCargo = todasPermissoes.find(r => r.cargo === cargoAlvo)?.permissoes ?? {};
      if (key in doCargo) return !!doCargo[key];
      return false;
    },
    [todasExcecoes, todasPermissoes],
  );

  const valorDoCargo = useCallback(
    (cargoAlvo: string, key: string): boolean => {
      if ((CARGOS_ACESSO_TOTAL as readonly string[]).includes(cargoAlvo)) return true;
      return !!todasPermissoes.find(r => r.cargo === cargoAlvo)?.permissoes?.[key];
    },
    [todasPermissoes],
  );

  const estadoExcecao = useCallback(
    (usuarioId: string, key: string): EstadoExcecao => {
      const exc = todasExcecoes.find(r => r.usuario_id === usuarioId)?.permissoes ?? {};
      if (!(key in exc)) return 'herda';
      return exc[key] ? 'sim' : 'nao';
    },
    [todasExcecoes],
  );

  return {
    permissoes,
    excecoes,
    todasPermissoes,
    todasExcecoes,
    loading,
    temPermissao,
    temPermissaoExplicita,
    isAdmin,
    resolverParaUsuario,
    valorDoCargo,
    estadoExcecao,
    refresh: fetch,
  };
}

/** Nome novo, para o código que for escrito daqui para frente. */
export const usePermissoes = useCargoPermissoes;
