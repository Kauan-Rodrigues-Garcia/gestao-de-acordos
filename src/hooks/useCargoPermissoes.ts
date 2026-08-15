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
import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { CARGOS_ACESSO_TOTAL } from '@/lib/permissoes-catalogo';

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

export function useCargoPermissoes(): UseCargoPermissoesReturn {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const [todasPermissoes, setTodasPermissoes] = useState<CargoPermissaoRow[]>([]);
  const [todasExcecoes, setTodasExcecoes]     = useState<PerfilPermissaoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const cargo = perfil?.perfil ?? '';
  const isAdmin = (CARGOS_ACESSO_TOTAL as readonly string[]).includes(cargo);

  const fetch = useCallback(async () => {
    if (!empresa?.id || !cargo) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [resCargos, resExcecoes] = await Promise.all([
        supabase.from('cargos_permissoes').select('*')
          .eq('empresa_id', empresa.id).order('cargo'),
        // A RLS já recorta: operador recebe só a própria linha, admin recebe
        // todas. Não é preciso filtrar por usuário aqui.
        //
        supabase.from('perfis_permissoes').select('*')
          .eq('empresa_id', empresa.id),
      ]);

      if (resCargos.error) throw resCargos.error;
      setTodasPermissoes((resCargos.data as CargoPermissaoRow[]) ?? []);

      // Tabela nova: tolera ausência para o app não quebrar entre o deploy do
      // frontend e a aplicação da migration.
      if (resExcecoes.error) {
        console.warn('[permissoes] exceções indisponíveis:', resExcecoes.error.message);
        setTodasExcecoes([]);
      } else {
        setTodasExcecoes((resExcecoes.data as PerfilPermissaoRow[]) ?? []);
      }
    } catch (e) {
      console.warn('[useCargoPermissoes] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [empresa?.id, cargo]);

  useEffect(() => { void fetch(); }, [fetch]);

  /**
   * Realtime: mudou a permissão, quem está logado sente na hora.
   *
   * Antes o hook buscava uma vez na montagem, então salvar uma permissão só
   * afetava a pessoa depois que ela recarregava a página — e ninguém avisava
   * que era preciso recarregar.
   */
  useEffect(() => {
    if (!empresa?.id) return;
    const canal = supabase
      .channel(`rt-permissoes-${empresa.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cargos_permissoes',
          filter: `empresa_id=eq.${empresa.id}` },
        () => { void fetch(); })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'perfis_permissoes',
          filter: `empresa_id=eq.${empresa.id}` },
        () => { void fetch(); })
      .subscribe();

    return () => { void supabase.removeChannel(canal); };
  }, [empresa?.id, fetch]);

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
    isAdmin,
    resolverParaUsuario,
    valorDoCargo,
    estadoExcecao,
    refresh: fetch,
  };
}

/** Nome novo, para o código que for escrito daqui para frente. */
export const usePermissoes = useCargoPermissoes;
