/**
 * useLideroEquipe — eu respondo por um GRUPO, ou só por mim?
 *
 * ## Para que serve
 *
 * O Dashboard abre no degrau mais estreito que a pessoa alcança, e para quem
 * produz isso é o certo: abrir no total do setor quem só queria o próprio
 * número é ruído. Para quem LIDERA, é o contrário — «Minha visão» mostra o
 * pouco que passou pelas mãos do líder, quando o que ele veio ver é o time.
 * Foi a queixa de 10/09/2026: «para líder, gerência e superadmin, começar em
 * minha visão não faz sentido — ou não terá nada, ou algo muito abaixo, pois
 * eles não têm meta individual; a meta deles é geral».
 *
 * ## Por que não uma lista de cargos
 *
 * Porque `['lider', 'gerencia', 'super_admin']` numa tela é decisão por cargo,
 * e a regra do projeto (23/08/2026) é que só o painel de permissões decide —
 * `painel-manda.test.ts` existe para não deixar essa lista voltar. Uma lista
 * escrita à mão também erra sozinha: cargo novo amanhã não entra nela, e
 * ninguém percebe.
 *
 * A pergunta de dado responde melhor e não envelhece: **eu lidero alguma
 * equipe?** Quem lidera responde por um grupo, seja qual for o nome do cargo.
 * Quem enxerga todos os setores (`todos_setores`) também, e esse lado o
 * Dashboard resolve pelos próprios níveis — sem perguntar nada aqui.
 *
 * ## `equipe_lideres`, e não `perfis.equipe_id`
 *
 * O vínculo de liderança é explícito desde a migration 20260725b. O cadastro é
 * resíduo: há líder com seis equipes espalhadas por quatro setores e um
 * `equipe_id` só. É a mesma razão pela qual `DesempenhoEquipes` e
 * `fn_setores_do_operador` leem `equipe_lideres`.
 *
 * ## Enquanto não respondeu
 *
 * `carregando` fica `true`, e quem chama deve ESPERAR antes de escolher o
 * degrau. Sem isso a tela abriria em «Minha visão», receberia a resposta e
 * pularia sozinha para outro degrau — um salto visível, e pior que a espera.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export interface Lideranca {
  /** Lidero ao menos uma equipe? */
  lidero: boolean;
  /** Ainda não sei — quem decide por isto deve esperar. */
  carregando: boolean;
}

export function useLideroEquipe(): Lideranca {
  const { perfil } = useAuth();
  const meuId = perfil?.id ?? null;

  const [lidero, setLidero] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const vivoRef = useRef(true);

  const carregar = useCallback(async () => {
    if (!meuId) {
      // Sem sessão resolvida não há o que perguntar, e travar em `carregando`
      // deixaria o Dashboard sem abrir.
      setLidero(false);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    /*
     * `try` em volta, e não só o `error` da resposta.
     *
     * O construtor de consulta pode ESTOURAR antes de virar promessa — foi o
     * que aconteceu no teste de fumaça do Dashboard, cujo dublê de `supabase`
     * não tem `.limit`. Sem o `try` aquilo virava rejeição não tratada, que
     * não derruba a tela mas polui o console e some com o `carregando` em
     * `true` para sempre — e o Dashboard, que espera por ele, nunca abriria.
     */
    try {
      // `limit(1)`: a pergunta é «alguma?», não «quantas?». Uma linha basta.
      const { data, error } = await supabase
        .from('equipe_lideres')
        .select('equipe_id')
        .eq('lider_id', meuId)
        .limit(1);

      if (!vivoRef.current) return;
      if (error) throw new Error(error.message);
      setLidero((data ?? []).length > 0);
    } catch (e) {
      if (!vivoRef.current) return;
      // Falhar para `false` mantém o comportamento anterior — abrir no mais
      // estreito. Um erro de rede não deve mudar em que altura a tela abre.
      console.warn('[useLideroEquipe]', e instanceof Error ? e.message : e);
      setLidero(false);
    }
    setCarregando(false);
  }, [meuId]);

  useEffect(() => {
    vivoRef.current = true;
    void carregar();
    return () => { vivoRef.current = false; };
  }, [carregar]);

  return { lidero, carregando };
}
