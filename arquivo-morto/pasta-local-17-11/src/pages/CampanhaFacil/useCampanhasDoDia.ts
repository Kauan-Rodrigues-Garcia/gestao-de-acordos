/**
 * As campanhas lançadas num dia, de todos os setores, com o andamento — a
 * visão «Por setor» do super admin (16/11/2026). Ver `CampanhasPorSetor`.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  enviosDoLoteDoSetor, listarCampanhasDoDia, placarDosEnvios,
  type LoteCampanha, type PlacarOperador,
} from './campanhaFacilEnvios.service';
import { campanhaDoDia, limitesDoDia, mesmoDia, type CampanhaDoDia } from './setoresDoDia';

/** Recarrega sozinho enquanto a aba do navegador está à vista. */
const RECARREGA_MS = 3 * 60_000;
/** Andamentos pedidos ao mesmo tempo: um dia cheio não vira uma rajada no banco. */
const EM_PARALELO = 4;

async function emLotes<T, R>(lista: readonly T[], f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(lista.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(EM_PARALELO, lista.length) }, async () => {
    while (i < lista.length) {
      const k = i++;
      out[k] = await f(lista[k]);
    }
  }));
  return out;
}

/** O andamento de uma campanha: o placar congelado na encerrada, ao vivo na aberta. */
async function placarDe(l: LoteCampanha): Promise<PlacarOperador[] | null> {
  if (l.encerrada_em) return l.placar ?? null;
  try {
    return placarDosEnvios(await enviosDoLoteDoSetor(l.id));
  } catch (err) {
    console.warn('[CampanhaFacil] andamento da campanha', l.id, err);
    return null;
  }
}

/**
 * As campanhas lançadas no `dia`, com o andamento. `ativo` = falso não lê
 * nada (quem não tem `campanha_escopo_todos_setores`, ou a visão não está aberta).
 */
export function useCampanhasDoDia(empresaId: string | null, ativo: boolean) {
  const [dia, setDia] = useState(() => new Date());
  const [campanhas, setCampanhas] = useState<CampanhaDoDia[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const chaveDia = dia.toDateString();

  const carregar = useCallback(async () => {
    if (!ativo || !empresaId) return;
    setCarregando(true);
    try {
      const { de, ate } = limitesDoDia(new Date(chaveDia));
      const lotes = await listarCampanhasDoDia(empresaId, de, ate);
      const placares = await emLotes(lotes, placarDe);
      setCampanhas(lotes.map((l, i) => campanhaDoDia(l, placares[i])));
      setErro(false);
      setAtualizadoEm(new Date());
    } catch (err) {
      console.error('[CampanhaFacil] campanhas do dia:', err);
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [ativo, empresaId, chaveDia]);

  useEffect(() => { setCampanhas([]); setAtualizadoEm(null); void carregar(); }, [carregar]);

  // Só o dia de hoje muda sozinho; a aba escondida não pede nada.
  const hoje = mesmoDia(dia, new Date());
  useEffect(() => {
    if (!ativo || !hoje) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregar();
    }, RECARREGA_MS);
    return () => window.clearInterval(t);
  }, [ativo, hoje, carregar]);

  return { dia, setDia, hoje, campanhas, carregando, erro, atualizadoEm, recarregar: carregar };
}

