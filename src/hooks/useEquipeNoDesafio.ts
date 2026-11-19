/**
 * A aba «Equipes» da gaveta do Desafio Cobrança: a meta individual de cada
 * operador do setor, para o líder acompanhar (19/11/2026). A conta está em
 * `services/desafioCobranca/equipeNoDesafio.ts`.
 *
 * O alcance sai do painel de permissões, aba Analítico (de onde vem o dado):
 * `setor` = o próprio setor; `todos_setores` = escolhe o setor. Sem nenhum
 * dos dois, a aba não existe.
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { assinarSinal } from '@/lib/sinais';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { useCargoPermissoes } from './useCargoPermissoes';
import { RELEITURA_DESAFIO_COBRANCA_MS } from './useDesafioCobranca';
import {
  buscarSetorNoDesafio, listarSetoresParaEscolher, type RegrasDoDesafio,
} from '@/services/desafioCobranca/equipeNoDesafio';

export type AlcanceNoDesafio = 'nenhum' | 'setor' | 'todos_setores';

/** O que esta pessoa pode ver na aba dos operadores. */
export function useAlcanceNoDesafio(): AlcanceNoDesafio {
  const { temPermissao, loading } = useCargoPermissoes();
  return useMemo(() => {
    if (loading) return 'nenhum';
    const niveis = niveisLiberados('analitico', temPermissao);
    if (niveis.includes('todos_setores')) return 'todos_setores';
    if (niveis.includes('setor')) return 'setor';
    return 'nenhum';
  }, [temPermissao, loading]);
}

/** Os setores para escolher — só para quem vê todos. */
export function useSetoresDoDesafio(ativo: boolean) {
  const { empresa } = useEmpresa();
  return useQuery({
    queryKey: ['desafio-cobranca-setores', empresa?.id ?? null],
    enabled: ativo && !!empresa?.id,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () => listarSetoresParaEscolher(empresa!.id),
  });
}

export function useSetorNoDesafio(regras: RegrasDoDesafio | null | undefined, hoje: number, setorId: string | null, aberto: boolean) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const qc = useQueryClient();
  const empresaId = empresa?.id ?? null;
  const habilitado = aberto && !!perfil?.id && !!empresaId && !!setorId && !!regras?.dias.length;

  // O recebido vem do Analítico: relê quando a sincronização do 59 escreve.
  useEffect(() => {
    if (!habilitado || !empresaId) return;
    const reler = () => { void qc.invalidateQueries({ queryKey: ['desafio-cobranca-setor'] }); };
    return assinarSinal('analitico', empresaId, { onMudou: reler, onReconectado: reler }, { minimoSoUpdateMs: 2 * 60 * 1000 });
  }, [habilitado, empresaId, qc]);

  return useQuery({
    queryKey: ['desafio-cobranca-setor', empresaId, setorId, regras?.dias.join(','), regras?.regra_medias, regras?.regra_medias_maior, hoje],
    enabled: habilitado,
    refetchInterval: aberto ? RELEITURA_DESAFIO_COBRANCA_MS : false,
    refetchOnWindowFocus: false,
    staleTime: 4 * 60 * 1000,
    queryFn: () => buscarSetorNoDesafio({ empresaId: empresaId!, setorId: setorId!, regras: regras!, hoje }),
  });
}
