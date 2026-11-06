/**
 * useClima — a previsão do tempo da cidade de um setor, para o botão do tempo
 * no topo e o card dele (06/11/2026).
 *
 * Uma busca por aba: quem pede ao mesmo tempo recebe a mesma resposta
 * (`lerComCache`). Do outro lado, `/api/clima` é uma resposta
 * guardada na CDN para todo mundo, então mil abas abertas não viram mil
 * consultas ao provedor.
 *
 * Relê a cada 10 minutos com a aba aberta, e na volta à aba se já passou disso
 * (06/11/2026). Reler custa só uma ida ao cache da CDN: o provedor continua
 * sendo chamado uma vez por janela de validade dele, qualquer que seja o
 * número de abas. Assim a previsão nova aparece até 10 minutos depois de o
 * MET liberá-la.
 *
 * Se a leitura falha, fica com a última boa; sem nenhuma, `previsao` é `null`
 * e o botão do tempo não aparece.
 */
import { useEffect, useState } from 'react';
import { lerComCache } from '@/lib/cacheCurto';
import { lerCidadeDoSetor } from '@/lib/cidadeDoSetor';
import { cidadeDoClima, type CidadeClima, type Previsao, type RespostaClima } from '@/lib/clima';

export const RELER_CLIMA_MS = 10 * 60 * 1000;
const CHAVE = 'clima:resposta';

async function buscarClima(): Promise<RespostaClima> {
  const r = await fetch('/api/clima', { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`clima ${r.status}`);
  return (await r.json()) as RespostaClima;
}

/** A resposta de `/api/clima`, uma vez por aba a cada 10 minutos. */
export function lerClima(): Promise<RespostaClima> {
  return lerComCache(CHAVE, RELER_CLIMA_MS, buscarClima);
}

export interface EstadoClima {
  /** `null` enquanto a cidade do setor não chegou. */
  cidade: CidadeClima | null;
  previsao: Previsao | null;
  /** Quando o servidor montou a previsão (ISO). */
  geradoEm: string | null;
  carregando: boolean;
}

/** A última resposta boa desta aba: quem monta depois já nasce com ela. */
let ultimaBoa: RespostaClima | null = null;

/** Só para os testes: esquece a última resposta da aba. */
export function esquecerClimaParaTeste(): void {
  ultimaBoa = null;
}

export function useClima(setorId: string | null | undefined, ativo = true): EstadoClima {
  const [cidade, setCidade] = useState<{ setorId: string | null; cidade: CidadeClima } | null>(null);
  const [resposta, setResposta] = useState<RespostaClima | null>(ultimaBoa);
  const [carregando, setCarregando] = useState(ultimaBoa === null);

  // A cidade do setor. Sem setor: Birigui.
  const setor = setorId ?? null;
  useEffect(() => {
    if (!ativo) return;
    if (!setor) { setCidade({ setorId: null, cidade: 'birigui' }); return; }
    let vivo = true;
    lerCidadeDoSetor(setor)
      .then(nome => { if (vivo) setCidade({ setorId: setor, cidade: cidadeDoClima(nome) }); })
      .catch(() => { if (vivo) setCidade({ setorId: setor, cidade: 'birigui' }); });
    return () => { vivo = false; };
  }, [setor, ativo]);

  // A previsão: agora, a cada 10 min, e na volta à aba se passou disso.
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    let lidaEm = 0;
    const ler = () => {
      lidaEm = Date.now();
      lerClima()
        .then(r => { ultimaBoa = r; if (vivo) setResposta(r); })
        .catch(() => { /* fica com a última boa */ })
        .finally(() => { if (vivo) setCarregando(false); });
    };
    ler();
    const relogio = window.setInterval(ler, RELER_CLIMA_MS);
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - lidaEm >= RELER_CLIMA_MS) ler();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      vivo = false;
      window.clearInterval(relogio);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [ativo]);

  const daCidade = cidade && cidade.setorId === setor ? cidade.cidade : null;
  return {
    cidade: daCidade,
    previsao: daCidade ? resposta?.cidades[daCidade] ?? null : null,
    geradoEm: resposta?.geradoEm ?? null,
    carregando: carregando || (ativo && daCidade === null),
  };
}
