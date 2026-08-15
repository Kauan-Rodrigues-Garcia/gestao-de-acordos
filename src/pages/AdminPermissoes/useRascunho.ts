/**
 * useRascunho — o que você mudou e ainda não salvou.
 *
 * Fica separado das abas porque as duas precisam da mesma coisa: acumular
 * alterações, saber quantas são, descartar tudo e limpar depois de salvar. A
 * tela antiga guardava isso como `editado: PermissoesMap | null` e perdia a
 * conta de quantas mudanças existiam — o botão dizia só "salvar", sem dizer
 * salvar o quê.
 */
import { useState, useCallback, useMemo } from 'react';

export type ValorRascunho = boolean | 'herda';

export function useRascunho<T extends ValorRascunho>() {
  const [alteracoes, setAlteracoes] = useState<Record<string, T>>({});

  const definir = useCallback((chave: string, valor: T) => {
    setAlteracoes(prev => ({ ...prev, [chave]: valor }));
  }, []);

  const definirVarios = useCallback((entradas: Record<string, T>) => {
    setAlteracoes(prev => ({ ...prev, ...entradas }));
  }, []);

  const descartar = useCallback(() => setAlteracoes({}), []);

  /**
   * Remove do rascunho o que voltou ao valor original.
   *
   * Sem isto, ligar e desligar o mesmo toggle deixava uma "alteração" fantasma
   * no contador e habilitava o botão de salvar sem nada para salvar.
   */
  const podar = useCallback((original: (chave: string) => T) => {
    setAlteracoes(prev => {
      const limpo: Record<string, T> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (v !== original(k)) limpo[k] = v;
      }
      return limpo;
    });
  }, []);

  const total = useMemo(() => Object.keys(alteracoes).length, [alteracoes]);

  return { alteracoes, definir, definirVarios, descartar, podar, total, sujo: total > 0 };
}
