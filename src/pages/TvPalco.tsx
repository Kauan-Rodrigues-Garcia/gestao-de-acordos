/**
 * TvPalco.tsx — a tela que fica na parede.
 *
 * Roda no PC ligado à TV por HDMI. Sem sessão, sem barra lateral, sem cursor,
 * o dia inteiro, com ninguém sentado na frente. Tudo aqui existe para que
 * NINGUÉM PRECISE ATRAVESSAR O ESCRITÓRIO.
 *
 * ## As três garantias
 *
 * 1. NUNCA cair para tela de login. Não há login: a página fala com uma RPC
 *    pública e só. Se a rede cair, aparece um aviso discreto no canto e a
 *    página continua exibindo a última cena boa — dado velho por alguns
 *    segundos é infinitamente melhor que tela preta na frente da operação.
 *
 * 2. NUNCA apagar. `wakeLock` segura a tela acesa, e ele é RE-PEDIDO quando a
 *    aba volta a ficar visível: o navegador solta o bloqueio sozinho ao
 *    minimizar, e sem repedir a TV apagaria depois do primeiro soluço.
 *
 * 3. SEMPRE voltar sozinha. O estado mora em `tv_estado`, no banco. Faltou luz,
 *    o Windows reiniciou de madrugada: o atalho em `--kiosk` reabre esta página
 *    e ela relê a cena que estava no ar. Ninguém precisa reconfigurar nada.
 *
 * ## Por que dois caminhos para a mesma informação
 *
 * O `broadcast` faz a parede mudar no MESMO SEGUNDO em que a mesa corta — é o
 * que dá a sensação de transmissão de verdade. A releitura periódica é a rede
 * de segurança: se o canal cair sem avisar (acontece), a TV se corrige sozinha
 * em até 20 segundos. E ela seria necessária de qualquer forma, porque os
 * números do ranking mudam ao longo do dia sem ninguém cortar nada.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Palco } from './ModoTV/Palco';
import type { CenaNoAr, Fonte } from './ModoTV/geometria';

/** De quanto em quanto tempo a TV se corrige sozinha. */
const INTERVALO_RELEITURA_MS = 20_000;
/** De quanto em quanto tempo ela avisa a mesa que está de pé. */
const INTERVALO_SINAL_MS = 30_000;

export default function TvPalco() {
  const { slug = '' } = useParams<{ slug: string }>();

  const [cena, setCena] = useState<CenaNoAr | null>(null);
  const [offline, setOffline] = useState(false);
  /*
   * A primeira leitura é a única que pode mostrar "carregando". Depois disso a
   * tela JÁ TEM conteúdo, e trocar conteúdo bom por um esqueleto a cada 20
   * segundos faria a parede piscar o dia inteiro.
   */
  const primeiraLeitura = useRef(true);

  const ler = useCallback(async () => {
    if (!slug) return;
    const { data, error } = await (supabase.rpc as unknown as (
      f: string, a: Record<string, unknown>,
    ) => Promise<{ data: CenaNoAr | null; error: unknown }>)('fn_tv_palco', { p_slug: slug });

    if (error || !data) {
      // Não apaga o que está no ar: marca offline e mantém a última cena boa.
      setOffline(true);
      return;
    }
    setOffline(false);
    setCena(data);
    primeiraLeitura.current = false;
  }, [slug]);

  // ── Leitura inicial, releitura periódica e o corte instantâneo ────────────

  useEffect(() => {
    if (!slug) return;
    void ler();

    const relogio = setInterval(() => { void ler(); }, INTERVALO_RELEITURA_MS);

    const canal = supabase
      .channel(`tv-palco-${slug}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'cortar' }, () => { void ler(); })
      .subscribe();

    return () => {
      clearInterval(relogio);
      void supabase.removeChannel(canal);
    };
  }, [slug, ler]);

  // ── Sinal de vida para a mesa ─────────────────────────────────────────────

  useEffect(() => {
    if (!slug) return;
    const bater = () => {
      void (supabase.rpc as unknown as (
        f: string, a: Record<string, unknown>,
      ) => Promise<unknown>)('fn_tv_sinal_vida', { p_slug: slug });
    };
    bater();
    const relogio = setInterval(bater, INTERVALO_SINAL_MS);
    return () => clearInterval(relogio);
  }, [slug]);

  // ── Tela sempre acesa ─────────────────────────────────────────────────────

  useEffect(() => {
    interface Sentinela { released: boolean; release: () => Promise<void> }
    const navegador = navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<Sentinela> };
    };
    if (!navegador.wakeLock) return;

    let travinha: Sentinela | null = null;
    let vivo = true;

    const pedir = async () => {
      try {
        travinha = await navegador.wakeLock!.request('screen');
      } catch {
        // Aba em segundo plano ou navegador sem suporte. O plano de energia do
        // Windows continua sendo a rede de segurança — ver o README do quiosque.
      }
    };

    void pedir();

    // O navegador SOLTA o bloqueio quando a aba deixa de ser visível. Sem este
    // repedido, a TV apaga depois do primeiro momento em que a janela sai da
    // frente — e ninguém está lá para mexer no mouse.
    const aoVoltar = () => {
      if (vivo && document.visibilityState === 'visible') void pedir();
    };
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', aoVoltar);
      void travinha?.release().catch(() => {});
    };
  }, []);

  // ── O que desenhar ────────────────────────────────────────────────────────

  const fontes: Fonte[] = cena?.fontes ?? [];

  let aviso: string | null = null;
  if (!cena && primeiraLeitura.current) aviso = 'Carregando…';
  else if (cena && !cena.encontrada)    aviso = `Tela "${slug}" não encontrada`;
  else if (cena?.encontrada && !cena.cena) aviso = 'Nenhuma cena no ar';

  return (
    <div
      className="fixed inset-0 bg-[#0a0f13]"
      // O PC da TV tem mouse plugado e ninguém o usa. A setinha parada no meio
      // da parede é a diferença entre parecer produto e parecer navegador aberto.
      style={{ cursor: 'none' }}
    >
      <Palco fontes={fontes} aviso={aviso} />

      {offline && (
        <div
          style={{
            position: 'absolute', right: 24, bottom: 20,
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(0,0,0,.55)', borderRadius: 999, padding: '8px 18px',
            color: '#e8a33d', fontSize: 18, fontWeight: 600,
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e8a33d' }} />
          Reconectando…
        </div>
      )}
    </div>
  );
}
