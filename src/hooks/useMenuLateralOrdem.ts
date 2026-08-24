/**
 * useMenuLateralOrdem — carrega as ordens das abas UMA vez, por empresa.
 *
 * Traz TODAS as linhas (a geral e a de cada cargo) numa consulta só: são no
 * máximo nove arrays de rota, e o editor precisa de todas para mostrar quais
 * cargos já foram configurados. Buscar só a do cargo logado economizaria nada e
 * obrigaria o editor a uma segunda leitura.
 *
 * Sem realtime, de propósito: a ordem muda de vez em quando e vale a partir do
 * próximo carregamento. Assinar a tabela custaria um canal aberto em toda
 * sessão para um evento que quase nunca acontece.
 *
 * `recarregar` existe para quem acabou de salvar ver o efeito sem apertar F5;
 * `aplicar` faz o mesmo sem ida ao banco, logo depois de um salvamento que já
 * respondeu.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  carregarOrdensMenu, ordemDoCargo, type OrdensPorCargo,
} from '@/services/menuLateral.service';

export function useMenuLateralOrdem(empresaId?: string, cargo = '') {
  const [ordens, setOrdens] = useState<OrdensPorCargo>({});
  const [carregando, setCarregando] = useState(false);

  const recarregar = useCallback(async () => {
    if (!empresaId) { setOrdens({}); return; }
    setCarregando(true);
    try {
      setOrdens(await carregarOrdensMenu(empresaId));
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  /** Guarda uma ordem em memória, sem reler o banco. */
  const aplicar = useCallback((cargoAlvo: string, ordem: string[]) => {
    setOrdens(atual => ({ ...atual, [cargoAlvo]: ordem }));
  }, []);

  /** A que vale para o cargo informado: a dele, ou a geral. */
  const ordem = useMemo(() => ordemDoCargo(ordens, cargo), [ordens, cargo]);

  return { ordem, ordens, carregando, recarregar, aplicar };
}
