/**
 * CrachaPendente — decide QUANDO o cartão do crachá aparece. Montado no Layout.
 *
 *   - Para todo mundo que ainda não tem crachá cadastrado. «Tem» é a linha em
 *     `rh_dados_operadores`: preencheu uma vez, não volta — nem recarregando,
 *     nem em outro computador.
 *   - Espera 1 min de uso e sai da frente do termo, do tutorial e da carta de
 *     Halloween (`liberado`, que o Layout calcula). Impersonação e super_admin
 *     não veem; `?previa-cracha` na URL abre a prévia, que não grava nada.
 *   - Não tem «agora não»: uma vez na tela, fica até a pessoa preencher.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';
import { ehSuperAdmin } from '@/lib/mobile/preferencia';
import { ESPERA_ANTES_DE_PEDIR_MS, lerTemCracha, pediuPreviaCrachaNaUrl } from './cracha';

// O cartão só desce para quem vai ver o pedido.
const CartaoCracha = lazy(() => import('./CartaoCracha').then(m => ({ default: m.CartaoCracha })));

export const CHAVE_TEM_CRACHA = ['cracha-pendente', 'tem'] as const;

export function CrachaPendente({ liberado, esquerda }: { liberado: boolean; esquerda: number }) {
  const { perfil } = useAuth();
  const queryClient = useQueryClient();
  const impersonando = !!getImpersonacaoAtiva();
  const podePedir = !!perfil?.id && !impersonando && !ehSuperAdmin(perfil?.perfil);

  const [resolvido, setResolvido] = useState(false);
  const { data: temCracha } = useQuery({
    queryKey: [...CHAVE_TEM_CRACHA, perfil?.id],
    queryFn: lerTemCracha,
    enabled: podePedir && !resolvido,
    staleTime: Infinity,
    // Sem a migration, ou fora do ar: simplesmente não pede.
    retry: false,
  });
  const pendente = temCracha === false && !resolvido;

  const [esperou, setEsperou] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEsperou(true), ESPERA_ANTES_DE_PEDIR_MS);
    return () => clearTimeout(t);
  }, []);

  // Uma vez na tela, fica até a pessoa preencher: o termo ou o tutorial que
  // aparecerem depois não tiram o cartão.
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (pendente && esperou && liberado) setAberto(true);
  }, [pendente, esperou, liberado]);

  const [previa, setPrevia] = useState(() => pediuPreviaCrachaNaUrl());

  const aoSalvar = useCallback(() => {
    setAberto(false);
    setResolvido(true);
    queryClient.setQueryData([...CHAVE_TEM_CRACHA, perfil?.id], true);
  }, [queryClient, perfil?.id]);
  const fecharPrevia = useCallback(() => setPrevia(false), []);

  if (previa) {
    return (
      <Suspense fallback={null}>
        <CartaoCracha previa nome={perfil?.nome} foto={perfil?.foto_url} esquerda={esquerda} onSalvo={fecharPrevia} onFecharPrevia={fecharPrevia} />
      </Suspense>
    );
  }
  if (!aberto) return null;
  return (
    <Suspense fallback={null}>
      <CartaoCracha nome={perfil?.nome} foto={perfil?.foto_url} esquerda={esquerda} onSalvo={aoSalvar} />
    </Suspense>
  );
}
