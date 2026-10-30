/**
 * useBingoNaTv.ts — o Bingo do painel desta TV.
 *
 * Lê uma vez ao ligar e depois de 15 em 15 s (a pergunta é curta: sem partida,
 * o banco responde nulo). A pedra chega dentro do aviso do canal da TV
 * (`tv-painel:<id>`, evento `bingo`) e entra direto, sem reler. Qualquer outro
 * aviso — grito, vitória, partida aberta/encerrada — relê.
 *
 * Automático: a TV também pede a pedra quando chega a hora. Se o líder fechar
 * a aba, o jogo segue; se os dois pedirem juntos, o banco sorteia uma só.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { bingoDaTv } from './servico';
import { TOTAL_PEDRAS, encaixa, lerAviso } from './regras';
import type { EstadoBingo } from './tipos';

const RELEITURA_MS = 15_000;

export function useBingoNaTv(token: string | null, painelId: string | null): {
  estado: EstadoBingo | null;
  /** Ligue no `.on('broadcast', { event: 'bingo' })` do canal da TV. */
  aoAviso: (payload: Record<string, unknown>) => void;
} {
  const [estado, setEstado] = useState<EstadoBingo | null>(null);
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const diferenca = useRef(0);

  const ler = useCallback(async (tique = false) => {
    if (!token || !painelId) return;
    try {
      const e = await bingoDaTv(token, tique);
      if (e?.agora) diferenca.current = Date.parse(e.agora) - Date.now();
      setEstado(e && e.partida?.estado === 'aberta' ? e : null);
    } catch { /* sem rede: segura o que está na parede */ }
  }, [token, painelId]);

  useEffect(() => {
    setEstado(null);
    void ler();
    const t = setInterval(() => { void ler(); }, RELEITURA_MS);
    return () => clearInterval(t);
  }, [ler]);

  const aoAviso = useCallback((payload: Record<string, unknown>) => {
    const aviso = lerAviso(payload);
    if (!aviso) return;
    const atual = estadoRef.current;
    if (aviso.tipo === 'pedra' && atual && atual.partida.id === aviso.partida) {
      const como = encaixa(atual.pedras, aviso);
      if (como === 'nova') {
        setEstado({ ...atual, pedras: [...atual.pedras, aviso.numero] });
        return;
      }
      if (como === 'repetida') return;
    }
    void ler();
  }, [ler]);

  // O automático, pelo relógio do banco. Um pouco de sorteio na espera para a
  // TV e a central não baterem no mesmo milissegundo.
  const intervalo = estado?.partida.auto_intervalo_s ?? null;
  const pausado = estado?.partida.auto_pausado ?? false;
  const proxima = estado?.partida.proxima_pedra_em ?? null;
  const totalPedras = estado?.pedras.length ?? 0;
  // Pediu um instante antes da hora e o banco disse «ainda não»: a tentativa
  // seguinte rearma o timer, senão o automático pararia com a central fechada.
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!intervalo || pausado || !proxima || totalPedras >= TOTAL_PEDRAS) return;
    const falta = Date.parse(proxima) - (Date.now() + diferenca.current);
    const t = setTimeout(() => {
      void ler(true).finally(() => setTentativa(n => n + 1));
    }, Math.max(300, falta + 400 + Math.random() * 900));
    return () => clearTimeout(t);
  }, [intervalo, pausado, proxima, totalPedras, tentativa, ler]);

  return { estado, aoAviso };
}
