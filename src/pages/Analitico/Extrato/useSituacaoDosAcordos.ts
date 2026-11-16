/**
 * useSituacaoDosAcordos — a situação do acordo de cada linha do operador
 * (`situacaoDasLinhas`), buscando os acordos dele pelos códigos tabulados.
 *
 * Devolve `null` enquanto não sabe (carregando, ou a leitura falhou): a tela
 * mostra só tabulado/a tabular, como antes, em vez de pintar tudo «em dia».
 *
 * A busca refaz quando muda o conjunto de códigos tabulados — tabular uma
 * linha muda — ou quando quem chama pede (`recarregar`). Marcar pago e
 * reagendar acontecem na aba Acordos; ao voltar, a tela monta de novo e lê.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import { buscarAcordosDoOperador } from '@/services/analitico/acordosDoOperador';
import {
  codigosTabulados, situacaoDasLinhas, type AcordoDoOperador, type DetalheSituacao,
} from './situacaoAcordos';

export function useSituacaoDosAcordos(
  linhas: readonly AnaliticoRecebimento[],
  empresaId: string,
  operadorId: string,
): { situacoes: ReadonlyMap<string, DetalheSituacao> | null; recarregar: () => void } {
  const [acordos, setAcordos] = useState<AcordoDoOperador[] | null>(null);
  const [versao, setVersao] = useState(0);

  const chaveCodigos = useMemo(() => codigosTabulados(linhas).join('\n'), [linhas]);

  useEffect(() => {
    if (!empresaId || !operadorId) { setAcordos(null); return; }
    if (!chaveCodigos) { setAcordos([]); return; }
    let ativo = true;
    void buscarAcordosDoOperador(empresaId, operadorId, chaveCodigos.split('\n'))
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) console.warn('[useSituacaoDosAcordos]', error);
        setAcordos(error ? null : data);
      })
      .catch(() => { if (ativo) setAcordos(null); });
    return () => { ativo = false; };
  }, [empresaId, operadorId, chaveCodigos, versao]);

  const situacoes = useMemo(
    () => (acordos ? situacaoDasLinhas(linhas, acordos) : null),
    [linhas, acordos],
  );

  const recarregar = useCallback(() => setVersao(v => v + 1), []);
  return { situacoes, recarregar };
}
