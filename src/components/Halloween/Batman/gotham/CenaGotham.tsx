/**
 * CenaGotham — Gotham no modo Batman (pedido de 05/10/2026, depois de validado
 * no playground). Montado pela `CenaBatman`:
 *
 *   FundoGotham       — atrás do conteúdo:
 *                         `mesa` (Dashboard e Acordos): a Gotham Square do
 *                         filme (`cidade.tsx`), SEM chuva, mergulhada no
 *                         vermelho do modo — ver `PracaVermelha`;
 *                         `vultos` (Analítico): o bat-sinal pela janela
 *                         (`janela.tsx`), com o vidro molhado e embaçado.
 *                       Entra junto com o vermelho do modo (`--verm`) e segue a
 *                       música (`regente.ts`): a cidade avermelha mais e os
 *                       letreiros piscam mais; no Analítico a chuva começa com
 *                       ela e os raios vêm depois. O som da chuva mora aqui.
 *   AconteceEmGotham  — por cima do conteúdo: a carta do Charada e o Batmóvel,
 *                       em horários sorteados (`agenda.ts`).
 *
 * Para validar sem esperar, com o tema no ar: `?batman=charada`,
 * `?batman=batmovel` ou, no Analítico, `?batman=raio` e `?batman=policia`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useModoBatman } from '../modoBatman';
import { adiar, daVez, novaAgenda, reagendar, type Agenda, type EventoGotham } from './agenda';
import { Batmovel } from './Batmovel';
import { CartaDoCharada, FiltrosDoCharada } from './CartaDoCharada';
import type { Ritmo } from './chuva';
import { CidadeGotham } from './cidade';
import { JanelaDoSinal } from './janela';
import { niveisAgora, pedirPolicia, pedirRaio, raiosPedidosAte, volumeDosEfeitos } from './regente';
import { criarSomDeChuva } from './sons';
import './gotham.css';

/** O que a chuva lê a cada quadro: densidade e raios da música, trovão no volume dos efeitos. */
function ritmoAgora(): Ritmo {
  const n = niveisAgora();
  return { densidade: n.chuva, raios: n.raios, trovao: volumeDosEfeitos() * 0.7, gatilhoRaio: raiosPedidosAte() };
}

/** O som da chuva: liga quando há chuva e música tocando, acompanha a densidade e para ao sair. */
function useSomDaChuva(fator: number) {
  useEffect(() => {
    let som: ReturnType<typeof criarSomDeChuva> = null;
    const t = window.setInterval(() => {
      const v = volumeDosEfeitos() * niveisAgora().chuva * fator;
      if (v > 0.005 && !som) som = criarSomDeChuva();
      som?.volume(v);
    }, 250);
    return () => { window.clearInterval(t); som?.parar(); };
  }, [fator]);
}

export function FundoGotham({ modo }: { modo: 'mesa' | 'vultos' }) {
  return (
    <div className={`gt-gotham ${modo}`} aria-hidden="true">
      {modo === 'mesa' ? <PracaVermelha /> : <SinalNaChuva />}
    </div>
  );
}

/**
 * O Analítico: o bat-sinal pela janela, com o som da chuva. Chuva pela metade e
 * raios mais espaçados (pedido de 06/10/2026: a cheia poluía a tela); a água no
 * vidro e o som acompanham.
 */
const ritmoDaJanela = (): Ritmo => {
  const r = ritmoAgora();
  return { ...r, densidade: r.densidade * 0.5, raios: r.raios * 0.6 };
};
function SinalNaChuva() {
  useSomDaChuva(0.3);
  return <JanelaDoSinal ritmo={ritmoDaJanela} />;
}

const semLuzes = () => {};

/**
 * A Gotham Square no vermelho do tema de antes (pedido de 06/10/2026: «junta o
 * melhor dos dois»). Sem chuva — gotas, respingos e raios atrás da tabela
 * poluíam a tela. A cidade é translúcida (`.gt-gotham.mesa`): o vermelho-escuro
 * de `.hw-bat-verm` passa por ela, o que apaga o brilho e casa os dois temas. Por
 * cima, o tom vermelho (já forte desde o começo, ver `regente.ts`), um véu de
 * névoa vermelha que só desliza, e a névoa vermelha do modo (`CenaBatman`).
 */
function PracaVermelha() {
  const tom = useRef<HTMLDivElement>(null);
  const piscar = useCallback(() => niveisAgora().piscar, []);
  useEffect(() => {
    let antes = '';
    const t = window.setInterval(() => {
      const v = niveisAgora().tom.toFixed(2);
      if (v !== antes && tom.current) { antes = v; tom.current.style.opacity = v; }
    }, 250);
    return () => window.clearInterval(t);
  }, []);
  return (
    <>
      <CidadeGotham aoMudarLuzes={semLuzes} piscar={piscar} />
      <div ref={tom} className="gt-tom" style={{ opacity: 0 }} />
      <div className="gt-veu" />
      <div className="gt-nevoa gt-nevoa-vermelha"><i /><i /><i /></div>
    </>
  );
}

// ── Por cima do conteúdo ─────────────────────────────────────────────────────

let agenda: Agenda | null = null;
let pedidoDaUrl: string | null | undefined;

/** `?batman=…`, lido uma vez por aba. */
function pedidoNaUrl(): EventoGotham | 'raio' | 'policia' | null {
  if (pedidoDaUrl === undefined) {
    try { pedidoDaUrl = new URLSearchParams(window.location.search).get('batman'); } catch { pedidoDaUrl = null; }
  }
  const p = pedidoDaUrl;
  pedidoDaUrl = null;
  return p === 'charada' || p === 'batmovel' || p === 'raio' || p === 'policia' ? p : null;
}

/** Dá para aparecer agora? Aba à vista e nenhuma janela (modal) aberta. */
function telaLivre(): boolean {
  if (document.visibilityState !== 'visible') return false;
  return !document.querySelector('[role="dialog"], [role="alertdialog"]');
}

export function AconteceEmGotham() {
  const { fase, desde } = useModoBatman();
  const [em, setEm] = useState<{ ev: EventoGotham; id: number } | null>(null);
  const emRef = useRef(em);
  emRef.current = em;
  const contador = useRef(0);
  const mostrar = useCallback((ev: EventoGotham) => setEm({ ev, id: ++contador.current }), []);
  const acabou = useCallback(() => setEm(null), []);

  useEffect(() => {
    if (fase !== 'dentro') return;
    if (!agenda || agenda.dono !== desde) agenda = novaAgenda(desde, Date.now());
    const pedido = pedidoNaUrl();
    const t = pedido ? window.setTimeout(() => (pedido === 'raio' ? pedirRaio() : pedido === 'policia' ? pedirPolicia() : mostrar(pedido)), 1_500) : undefined;
    const tique = () => {
      if (!agenda || emRef.current) return;
      const agora = Date.now();
      const ev = daVez(agenda, agora);
      if (!ev) return;
      if (!telaLivre()) { agenda = adiar(agenda, ev, agora); return; }
      agenda = reagendar(agenda, ev, agora);
      mostrar(ev);
    };
    const i = window.setInterval(tique, 5_000);
    return () => { window.clearInterval(i); window.clearTimeout(t); };
  }, [fase, desde, mostrar]);

  return (
    <>
      <FiltrosDoCharada />
      {em?.ev === 'charada' && <CartaDoCharada key={em.id} recolher={fase === 'saindo'} aoTerminar={acabou} />}
      {em?.ev === 'batmovel' && <Batmovel key={em.id} aoTerminar={acabou} />}
    </>
  );
}
