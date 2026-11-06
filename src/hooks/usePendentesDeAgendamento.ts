/**
 * usePendentesDeAgendamento — quais parcelas da página exibida ainda esperam
 * a próxima ser agendada. É o que decide o calendário na lista (ver
 * `lib/reagendamento.ts`).
 *
 * Pergunta ao banco pelas parcelas dos grupos das candidatas — e não só à
 * página: a próxima pode estar em outro mês, fora do filtro. Uma consulta por
 * página (em blocos de 200 grupos), só com `acordo_grupo_id` e
 * `numero_parcela`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  candidataAReagendar, chaveParcela, pendentesDeAgendamento, type ParcelaParaAgendar,
} from '@/lib/reagendamento';

const VAZIO: ReadonlySet<string> = new Set();

export function usePendentesDeAgendamento(
  acordos: readonly ParcelaParaAgendar[],
  isPP: boolean,
): { pendentes: ReadonlySet<string>; recarregar: () => void } {
  const [existentes, setExistentes] = useState<ReadonlySet<string>>(VAZIO);
  const [versao, setVersao] = useState(0);

  // Chave estável dos grupos a consultar: a lista muda de identidade a cada
  // evento de tempo real, os grupos candidatos quase nunca.
  const grupos = useMemo(() => [...new Set(
    acordos.filter(a => candidataAReagendar(a, isPP)).map(a => a.acordo_grupo_id!),
  )].sort(), [acordos, isPP]);
  const chaveGrupos = grupos.join(',');

  useEffect(() => {
    if (!chaveGrupos) { setExistentes(VAZIO); return; }
    let ativo = true;
    const lista = chaveGrupos.split(',');
    void (async () => {
      const achadas = new Set<string>();
      for (let i = 0; i < lista.length; i += 200) {
        const { data, error } = await supabase
          .from('acordos')
          .select('acordo_grupo_id, numero_parcela')
          .in('acordo_grupo_id', lista.slice(i, i + 200));
        if (error) {
          // Sem a resposta, nenhum botão: oferecer agendar o que talvez já
          // exista seria pior — e o salvar confere de novo antes de gravar.
          console.warn('[usePendentesDeAgendamento]', error.message);
          if (ativo) setExistentes(new Set(lista.map(g => `${g}:*`)));
          return;
        }
        for (const p of (data ?? []) as { acordo_grupo_id: string | null; numero_parcela: number | null }[]) {
          if (p.acordo_grupo_id) achadas.add(chaveParcela(p.acordo_grupo_id, p.numero_parcela ?? 1));
        }
      }
      if (ativo) setExistentes(achadas);
    })();
    return () => { ativo = false; };
  }, [chaveGrupos, versao]);

  // A página também conta: a parcela recém-agendada entra nela antes de a
  // consulta voltar.
  const pendentes = useMemo(() => {
    const todas = new Set(existentes);
    for (const a of acordos) {
      if (a.acordo_grupo_id) todas.add(chaveParcela(a.acordo_grupo_id, a.numero_parcela ?? 1));
    }
    // Consulta que falhou marca o grupo inteiro como «não sei»: sem botão.
    const semResposta = new Set([...existentes].filter(k => k.endsWith(':*')).map(k => k.slice(0, -2)));
    return pendentesDeAgendamento(
      acordos.filter(a => !semResposta.has(a.acordo_grupo_id ?? '')), todas, isPP,
    );
  }, [acordos, existentes, isPP]);

  const recarregar = useCallback(() => setVersao(v => v + 1), []);
  return { pendentes, recarregar };
}
