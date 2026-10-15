/**
 * PesquisaExperiencia — decide QUANDO o cartão aparece. Montado no Layout.
 *
 *   - Só com a pesquisa ligada em Configurações e só para quem ainda não
 *     respondeu. «Respondeu» é a linha no banco (uma por pessoa): recarregar a
 *     página ou entrar por outro computador não traz a pergunta de volta.
 *   - Quem já está online quando ela é ligada recebe sem precisar recarregar:
 *     a tela confere o estado a cada 5 min e ao voltar para a aba. Sem canal
 *     de tempo real de propósito — a pesquisa não tem pressa, e cada canal a
 *     mais pesa no Realtime (auditoria de custo, 05/10/2026).
 *   - Espera 3 min de uso e sai da frente do termo, do tutorial e da carta de
 *     Halloween (`liberado`, que o Layout calcula). Impersonação nunca vê.
 *   - «Ver a pergunta», em Configurações, abre a prévia, que não grava nada.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';
import { ehSuperAdmin } from '@/lib/mobile/preferencia';
import { ESPERA_ANTES_DE_PERGUNTAR_MS, EVENTO_PREVIA_PESQUISA, lerEstadoPesquisa } from './pesquisa';

// O cartão (e a fonte dele) só desce para quem vai ver a pergunta.
const CartaoPesquisa = lazy(() => import('./CartaoPesquisa').then(m => ({ default: m.CartaoPesquisa })));

const CONFERIR_A_CADA_MS = 5 * 60_000;
export const CHAVE_ESTADO_PESQUISA = ['pesquisa-experiencia', 'estado'] as const;

export function PesquisaExperiencia({ liberado, esquerda }: { liberado: boolean; esquerda: number }) {
  const { perfil } = useAuth();
  const queryClient = useQueryClient();
  const impersonando = !!getImpersonacaoAtiva();
  const superAdmin = ehSuperAdmin(perfil?.perfil);
  // O super_admin liga a pesquisa e a vê pela prévia; ele não entra na conta.
  const podeResponder = !!perfil?.id && !impersonando && !superAdmin;

  const [respondida, setRespondida] = useState(false);
  const { data: estado } = useQuery({
    queryKey: [...CHAVE_ESTADO_PESQUISA, perfil?.id],
    queryFn: lerEstadoPesquisa,
    enabled: podeResponder && !respondida,
    staleTime: CONFERIR_A_CADA_MS,
    refetchInterval: CONFERIR_A_CADA_MS,
    refetchOnWindowFocus: true,
    // Sem a migration, ou fora do ar: simplesmente não pergunta.
    retry: false,
  });
  const pendente = !!estado?.ligada && !estado.respondeu && !respondida;

  // 3 min de uso desde que a tela abriu.
  const [esperou, setEsperou] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEsperou(true), ESPERA_ANTES_DE_PERGUNTAR_MS);
    return () => clearTimeout(t);
  }, []);

  // Uma vez na tela, fica até a pessoa responder: o termo ou o tutorial que
  // aparecerem depois não tiram o cartão.
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    if (pendente && esperou && liberado) setAberta(true);
  }, [pendente, esperou, liberado]);

  const [previa, setPrevia] = useState(0);
  useEffect(() => {
    const abrir = () => setPrevia(v => v + 1);
    window.addEventListener(EVENTO_PREVIA_PESQUISA, abrir);
    return () => window.removeEventListener(EVENTO_PREVIA_PESQUISA, abrir);
  }, []);

  const fecharDeVerdade = useCallback(() => {
    setAberta(false);
    setRespondida(true);
    void queryClient.invalidateQueries({ queryKey: CHAVE_ESTADO_PESQUISA });
  }, [queryClient]);
  const fecharPrevia = useCallback(() => setPrevia(0), []);

  if (previa > 0) {
    return (
      <Suspense fallback={null}>
        <CartaoPesquisa key={`previa-${previa}`} previa nome={perfil?.nome} esquerda={esquerda} onFechar={fecharPrevia} />
      </Suspense>
    );
  }
  if (!aberta) return null;
  return (
    <Suspense fallback={null}>
      <CartaoPesquisa nome={perfil?.nome} esquerda={esquerda} onFechar={fecharDeVerdade} />
    </Suspense>
  );
}
