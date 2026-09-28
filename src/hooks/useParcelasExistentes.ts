/**
 * useParcelasExistentes — quais parcelas de cada grupo já estão no banco.
 *
 * O botão de reagendar precisa saber se a PRÓXIMA parcela já existe. A lista
 * que a tela tem em mãos não serve para responder isso: ela é a página atual,
 * já filtrada por mês, status e aba. A parcela 2 pode estar na página 3, no mês
 * que vem, ou fora da aba "Pagos" — e o botão reapareceria, criando a parcela
 * repetida no segundo clique.
 *
 * Antes daqui, o Dashboard resolvia com duas meias-respostas: um `Set` montado
 * da página visível e uma consulta que olhava só o mês seguinte ao do filtro, e
 * só na PaguePlay. Este hook pergunta pelo que interessa — os grupos que estão
 * na tela agora — sem recorte de data e nos dois tenants.
 *
 * O custo é uma consulta por página (no máximo `PER_PAGE` grupos no `in`), com
 * duas colunas e nenhum join.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  chaveParcela, chavesExistentes, type ParcelaReagendavel,
} from '@/services/reagendamento/reagendamento';

/**
 * @param linhas   as linhas visíveis (só `acordo_grupo_id` e `numero_parcela`
 *                 são lidos).
 * @param empresaId tenant atual; sem ele o hook não consulta.
 * @returns o conjunto de chaves `grupo#numero` das parcelas que existem —
 *          sempre incluindo as da própria lista, para a tela não piscar
 *          enquanto a consulta não volta.
 */
export function useParcelasExistentes(
  linhas: readonly ParcelaReagendavel[],
  empresaId: string | null | undefined,
): ReadonlySet<string> {
  const grupos = useMemo(() => {
    const s = new Set<string>();
    for (const l of linhas) if (l.acordo_grupo_id) s.add(l.acordo_grupo_id);
    // Ordenado: a chave do efeito é o texto, e a ordem da página mudaria a
    // string sem mudar o conteúdo, refazendo a consulta a cada reordenação.
    return [...s].sort();
  }, [linhas]);

  const daPagina = useMemo(() => chavesExistentes(linhas), [linhas]);
  const [doBanco, setDoBanco] = useState<ReadonlySet<string>>(() => new Set());

  const chaveEfeito = grupos.join(',');
  useEffect(() => {
    if (!empresaId || grupos.length === 0) { setDoBanco(new Set()); return; }
    let vivo = true;
    supabase
      .from('acordos')
      .select('acordo_grupo_id, numero_parcela')
      .eq('empresa_id', empresaId)
      .in('acordo_grupo_id', grupos)
      .then(({ data, error }) => {
        if (!vivo || error || !data) return;
        const s = new Set<string>();
        for (const d of data as { acordo_grupo_id: string | null; numero_parcela: number | null }[]) {
          if (d.acordo_grupo_id) s.add(chaveParcela(d.acordo_grupo_id, d.numero_parcela ?? 1));
        }
        setDoBanco(s);
      });
    return () => { vivo = false; };
    // `grupos` é recriado a cada render; a chave textual é o que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, chaveEfeito]);

  return useMemo(() => {
    const s = new Set(daPagina);
    for (const k of doBanco) s.add(k);
    return s;
  }, [daPagina, doBanco]);
}
