/**
 * useHistoricoElite — o estado da sub-aba «Histórico» do Plantão Elite: lê do
 * início do plantão até hoje e relê em silêncio quando o analítico muda (o
 * dia de hoje vai se preenchendo de hora em hora).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assinarSinal } from '@/lib/sinais';
import {
  buscarHistoricoElite, montarHistoricoElite, type RespostaHistoricoElite,
} from '@/services/plantaoElite/historicoElite';

export function useHistoricoElite(empresaId: string) {
  const [resposta, setResposta] = useState<RespostaHistoricoElite | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const pedido = useRef(0);

  const carregar = useCallback(async (silencioso = false) => {
    const meu = ++pedido.current;
    if (!silencioso) setCarregando(true);
    try {
      const r = await buscarHistoricoElite(empresaId);
      if (meu !== pedido.current) return;
      setResposta(r);
      setErro(null);
    } catch (e) {
      if (meu !== pedido.current) return;
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o histórico do plantão.');
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    const reler = () => { void carregar(true); };
    return assinarSinal('analitico', empresaId, { onMudou: reler, onReconectado: reler },
      { minimoSoUpdateMs: 5 * 60_000 });
  }, [empresaId, carregar]);

  const historico = useMemo(() => (resposta ? montarHistoricoElite(resposta) : null), [resposta]);

  return { resposta, historico, carregando, erro, carregar };
}
