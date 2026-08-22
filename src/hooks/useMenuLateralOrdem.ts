/**
 * useMenuLateralOrdem — carrega a ordem das abas UMA vez, por empresa.
 *
 * Sem realtime, de propósito: a ordem muda de vez em quando e vale a partir do
 * próximo carregamento. Assinar a tabela custaria um canal aberto em toda
 * sessão para um evento que quase nunca acontece.
 *
 * `recarregar` existe para quem acabou de salvar ver o efeito sem apertar F5.
 */

import { useCallback, useEffect, useState } from 'react';
import { carregarOrdemMenu } from '@/services/menuLateral.service';

export function useMenuLateralOrdem(empresaId?: string) {
  const [ordem, setOrdem] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);

  const recarregar = useCallback(async () => {
    if (!empresaId) { setOrdem([]); return; }
    setCarregando(true);
    try {
      setOrdem(await carregarOrdemMenu(empresaId));
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return { ordem, carregando, recarregar, setOrdem };
}
