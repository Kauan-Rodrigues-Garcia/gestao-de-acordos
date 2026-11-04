/**
 * premio.ts — o prêmio das Lendas no banco (migration 20261030120000).
 *
 * Só as três Lendas clicam, cada uma na própria tela: o banco confere quem
 * está logada. Quando a terceira clica, o banco sorteia UMA vez e grava; a
 * roleta de cada tela só revela esse ganhador (`montarFita`).
 *
 * A roleta gira ao mesmo tempo em todas as telas: em `giraEm` (10 s depois do
 * sorteio, marcado pelo banco), comparado com `agoraDoPremio` — a hora do
 * banco, não a do PC de cada um.
 *
 * A tela relê a cada `RELER_MS`, só enquanto a janela do prêmio (ou o cartão
 * de Configurações) está aberta, e para quando a aba some.
 *
 * No laboratório (sem login e sem banco) continua o teste de antes: qualquer
 * um clica pelas três e o sorteio é no navegador (`usarPremioDeTeste`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LENDAS } from './dados';
import { clicarLenda, useCliquesDasLendas } from './estado';
import { sortearComPeso } from './sorteio';

export const RELER_MS = 4_000;
/** O tempo da roleta girando (fixo: todas as telas param juntas). */
export const DURA_DA_ROLETA_MS = 6_000;
/** No teste: a contagem entre o terceiro clique e a roleta (no banco, 10 s). */
const CONTAGEM_DE_TESTE_MS = 10_000;

/** relógio do banco − relógio local, em ms. */
let desvioMs = 0;
/** A hora pelo relógio do banco. */
export function agoraDoPremio(): number { return Date.now() + desvioMs; }

let deTeste = false;
/** O laboratório chama antes de montar: o prêmio fica de mentira, no navegador. */
export function usarPremioDeTeste(): void { deTeste = true; }

export interface PremioDasLendas {
  /** Já respondeu uma vez (ou é o teste). */
  carregado: boolean;
  /** O banco recusou ou não tem a migration. */
  erro: string | null;
  /** As posições (1, 2, 3) que já clicaram. */
  clicou: ReadonlySet<number>;
  /** A posição de quem está na tela, se for uma das três (no teste: todas). */
  podeClicar: (posicao: number) => boolean;
  souLenda: boolean;
  /** A posição sorteada pelo banco, ou `null`. */
  ganhador: number | null;
  /** Quando a roleta gira em todas as telas (ms, hora do banco), ou `null`. */
  giraEm: number | null;
  deTeste: boolean;
  enviando: boolean;
  clicar: (posicao: number) => Promise<void>;
}

interface Resposta { clicou: ReadonlySet<number>; eu: number | null; ganhador: number | null; giraEm: number | null }

type Rpc = (n: string) => PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
const rpc: Rpc = n => (supabase.rpc as unknown as Rpc)(n);

function lerResposta(data: Record<string, unknown> | null, pedidoEm: number): Resposta {
  const agora = new Date(String(data?.agora ?? '')).getTime();
  // Meio caminho da ida e volta: a hora do banco é a de quando ele respondeu.
  if (Number.isFinite(agora)) desvioMs = agora - (pedidoEm + (Date.now() - pedidoEm) / 2);
  const gira = typeof data?.gira_em === 'string' ? new Date(data.gira_em).getTime() : NaN;
  const lendas = Array.isArray(data?.lendas) ? data.lendas as { posicao?: unknown; clicou?: unknown }[] : [];
  return {
    clicou: new Set(lendas.filter(l => l.clicou === true).map(l => Number(l.posicao))),
    eu: typeof data?.eu === 'number' ? data.eu : null,
    ganhador: typeof data?.ganhador === 'number' ? data.ganhador : null,
    giraEm: Number.isFinite(gira) ? gira : null,
  };
}

/** Mensagem curta para a tela, a partir do erro do banco. */
function motivo(mensagem: string): string {
  if (mensagem.includes('SO_AS_LENDAS')) return 'Só as três Lendas liberam o prêmio.';
  if (/fn_mural_lendas|schema cache|does not exist/i.test(mensagem)) return 'O prêmio ainda não está ligado no banco.';
  return mensagem;
}

export function usePremioDasLendas(): PremioDasLendas {
  const cliquesDeTeste = useCliquesDasLendas();
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (deTeste) return;
    let vivo = true;
    const ler = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const pedidoEm = Date.now();
      const { data, error } = await rpc('fn_mural_lendas_ler');
      if (!vivo) return;
      if (error) { setErro(motivo(error.message)); return; }
      setErro(null);
      setResposta(lerResposta(data, pedidoEm));
    };
    void ler();
    const t = setInterval(() => { void ler(); }, RELER_MS);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  // O sorteio de teste: um por montagem, como antes; a contagem começa no terceiro clique.
  const ganhadorDeTeste = useMemo(() => LENDAS[sortearComPeso(LENDAS, () => 1)]?.posicao ?? null, []);
  const todasNoTeste = LENDAS.every(l => cliquesDeTeste.has(l.posicao));
  const [giraNoTeste, setGiraNoTeste] = useState<number | null>(null);
  useEffect(() => {
    if (deTeste) setGiraNoTeste(todasNoTeste ? Date.now() + CONTAGEM_DE_TESTE_MS : null);
  }, [todasNoTeste]);

  const clicar = useCallback(async (posicao: number) => {
    if (deTeste) { clicarLenda(posicao); return; }
    setEnviando(true);
    const pedidoEm = Date.now();
    const { data, error } = await rpc('fn_mural_lendas_clicar');
    setEnviando(false);
    if (error) { setErro(motivo(error.message)); return; }
    setErro(null);
    setResposta(lerResposta(data, pedidoEm));
  }, []);

  if (deTeste) {
    return {
      carregado: true, erro: null, clicou: cliquesDeTeste, podeClicar: () => true, souLenda: true,
      ganhador: todasNoTeste ? ganhadorDeTeste : null, giraEm: todasNoTeste ? giraNoTeste : null,
      deTeste: true, enviando: false, clicar,
    };
  }
  const eu = resposta?.eu ?? null;
  return {
    carregado: resposta !== null || erro !== null,
    erro,
    clicou: resposta?.clicou ?? new Set(),
    podeClicar: posicao => eu === posicao,
    souLenda: eu !== null,
    ganhador: resposta?.ganhador ?? null,
    giraEm: resposta?.giraEm ?? null,
    deTeste: false,
    enviando,
    clicar,
  };
}

/** Configurações: o super_admin zera os cliques e o ganhador. */
export async function zerarPremioDasLendas(): Promise<{ erro: string | null }> {
  const { error } = await rpc('fn_mural_lendas_zerar');
  return { erro: error ? motivo(error.message) : null };
}
