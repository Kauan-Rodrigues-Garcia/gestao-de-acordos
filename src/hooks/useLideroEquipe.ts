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
 * ## Quem não lidera equipe e mesmo assim responde por um grupo
 *
 * A gerência. Ela não está em `equipe_lideres` — responde pelo setor, não por
 * uma equipe —, e o painel pode limitá-la ao próprio setor, sem
 * `todos_setores`. Nenhuma das duas perguntas acima a pegava, e o Dashboard
 * continuava abrindo em «Minha visão» justamente para quem fez a queixa.
 *
 * O que sobra é a própria frase da queixa, e ela é pergunta de DADO: **tenho
 * meta individual?** Olha `metas` (`tipo = 'operador'`, valor positivo) no mês
 * corrente e no anterior.
 *
 *   - não só o corrente: no começo do mês as metas ainda não foram lançadas, e
 *     todo operador abriria no setor até alguém cadastrá-las;
 *   - não «alguma vez»: o gerente promovido de operador tem meta individual no
 *     histórico, e ficaria preso em «Minha visão» para sempre.
 *
 * Nível de alcance não servia de régua: na BookPlay o painel liga
 * `dashboard_escopo_setor` e `_equipe` para o operador (ver
 * 20260903220000), e «alcança o setor» pegaria a operação inteira.
 *
 * Quem acabou de entrar e ainda não tem meta abre no degrau do grupo. É o mesmo
 * argumento da queixa — «Minha visão» sem meta mostra quase nada —, e um clique
 * leva de volta.
 *
 * ## Enquanto não respondeu
 *
 * `carregando` fica `true`, e quem chama deve ESPERAR antes de escolher o
 * degrau. Sem isso a tela abriria em «Minha visão», receberia a resposta e
 * pularia sozinha para outro degrau — um salto visível, e pior que a espera.
 *
 * Cada pergunta falha por conta própria, e para o lado de antes: erro em
 * `equipe_lideres` responde «não lidero», erro em `metas` responde «tenho
 * meta». Queda de rede não deve mudar em que altura a tela abre.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { getTodayISO } from '@/lib/index';

export interface Lideranca {
  /** Lidero ao menos uma equipe? */
  lidero: boolean;
  /**
   * Tenho meta individual no mês corrente ou no anterior? Ver o cabeçalho.
   * Sem sessão, sem empresa ou com erro responde `true` — abrir no mais
   * estreito, que era o comportamento de antes.
   */
  temMetaIndividual: boolean;
  /** Ainda não sei — quem decide por isto deve esperar. */
  carregando: boolean;
}

interface MesAno { ano: number; mes: number }

/** O mês corrente e o anterior, no fuso da operação (`getTodayISO`). */
export function mesesDaMetaIndividual(hojeISO: string): { atual: MesAno; anterior: MesAno } {
  const [ano, mes] = hojeISO.split('-').map(Number);
  const anterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  return { atual: { ano, mes }, anterior };
}

async function perguntarSeLidero(meuId: string): Promise<boolean> {
  /*
   * `try` em volta, e não só o `error` da resposta.
   *
   * O construtor de consulta pode ESTOURAR antes de virar promessa — foi o
   * que aconteceu no teste de fumaça do Dashboard, cujo dublê de `supabase`
   * não tem `.limit`. Sem o `try` aquilo virava rejeição não tratada, e o
   * Dashboard, que espera por esta resposta, nunca abriria.
   */
  try {
    // `limit(1)`: a pergunta é «alguma?», não «quantas?». Uma linha basta.
    const { data, error } = await supabase
      .from('equipe_lideres')
      .select('equipe_id')
      .eq('lider_id', meuId)
      .limit(1);
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  } catch (e) {
    console.warn('[useLideroEquipe] equipe_lideres:', e instanceof Error ? e.message : e);
    return false;
  }
}

async function perguntarSeTenhoMeta(empresaId: string, meuId: string): Promise<boolean> {
  const { atual, anterior } = mesesDaMetaIndividual(getTodayISO());
  try {
    // `gte('ano')` e o recorte fino aqui: os dois meses podem cair em anos
    // diferentes (janeiro olha dezembro), e são no máximo 24 linhas.
    const { data, error } = await supabase
      .from('metas')
      .select('mes, ano, meta_valor')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'operador')
      .eq('referencia_id', meuId)
      .gte('ano', anterior.ano);
    if (error) throw new Error(error.message);

    const linhas = (data ?? []) as { mes: unknown; ano: unknown; meta_valor: unknown }[];
    return linhas.some(l => {
      const ano = Number(l.ano);
      const mes = Number(l.mes);
      const noPeriodo = (ano === atual.ano && mes === atual.mes)
        || (ano === anterior.ano && mes === anterior.mes);
      // Meta zerada é «sem meta», como no fechamento (`secoes/individual.ts`).
      return noPeriodo && Number(l.meta_valor) > 0;
    });
  } catch (e) {
    console.warn('[useLideroEquipe] metas:', e instanceof Error ? e.message : e);
    return true;
  }
}

export function useLideroEquipe(): Lideranca {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const meuId = perfil?.id ?? null;
  const empresaId = empresa?.id ?? null;

  const [lidero, setLidero] = useState(false);
  const [temMetaIndividual, setTemMetaIndividual] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const vivoRef = useRef(true);

  const carregar = useCallback(async () => {
    if (!meuId || !empresaId) {
      // Sem sessão ou empresa resolvidas não há o que perguntar, e travar em
      // `carregando` deixaria o Dashboard sem abrir.
      setLidero(false);
      setTemMetaIndividual(true);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const [souLider, tenhoMeta] = await Promise.all([
      perguntarSeLidero(meuId),
      perguntarSeTenhoMeta(empresaId, meuId),
    ]);
    if (!vivoRef.current) return;
    setLidero(souLider);
    setTemMetaIndividual(tenhoMeta);
    setCarregando(false);
  }, [meuId, empresaId]);

  useEffect(() => {
    vivoRef.current = true;
    void carregar();
    return () => { vivoRef.current = false; };
  }, [carregar]);

  return { lidero, temMetaIndividual, carregando };
}
