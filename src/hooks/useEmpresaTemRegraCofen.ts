/**
 * useEmpresaTemRegraCofen — a empresa tem algum setor da regra Cofen?
 *
 * É a pergunta certa para mostrar a importação do relatório 945: o 945 é da
 * regra Cofen, não da marca (CLAUDE.md, «Cofen não é PaguePlay»). Hoje o único
 * setor Cofen é o Conecta Play, e o dado dele mora na empresa PaguePlay.
 */

import { useEffect, useState } from 'react';
import { tabelaSemTipo } from '@/lib/supabaseSemTipo';

export function useEmpresaTemRegraCofen(empresaId: string | null | undefined): boolean {
  const [tem, setTem] = useState(false);
  useEffect(() => {
    if (!empresaId) { setTem(false); return; }
    let cancelado = false;
    // `regra` é de 03/10 e ainda não está em `database.types.ts`.
    void tabelaSemTipo<{ id: string }>('setores')
      .select('id').eq('empresa_id', empresaId).eq('regra', 'cofen').limit(1)
      .then(({ data }) => { if (!cancelado) setTem(!!data?.length); });
    return () => { cancelado = true; };
  }, [empresaId]);
  return tem;
}
