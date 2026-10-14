/**
 * cenaBruxas.tsx — a Caça às Bruxas de verdade: o palco (`palco.ts`) ligado
 * às rodadas do banco (`../caca.ts`).
 *
 * Baixado só quando a rodada é de bruxa (ver `../index.tsx`): quem passa a
 * semana dos zumbis não paga por este pedaço, nem pela física da queda.
 *
 * ## O que acontece
 *
 *   rodada solta       a bruxa da rodada (`rodada.bruxa`) chega voando, na
 *                      área do conteúdo (`[data-palco-abobora]`), presa à
 *                      janela: ela voa por cima, não rola com a página.
 *   o meu tiro         ela cai na hora, do jeito que pegou, e o tiro vai ao
 *                      banco com o lugar (`pegarAbobora(…, tiro)`). Quem
 *                      chegou primeiro, o banco diz.
 *   o tiro de outro    a rodada chega «achada»: quem não atirou vê ela cair do
 *                      jeito do vencedor (`rodada.tiro`).
 *   fofo no chão       desmaiado, e de cada tela (Cleber, 14/10/2026): fica
 *                      até 2 min esperando; quem clicar finaliza só na
 *                      própria tela (`finalizarBruxa` registra) e o corpo
 *                      some 20 s depois. O clique de outra pessoa não mexe
 *                      aqui (`DESMAIADO_S` e `FINALIZADO_S` em `palco.ts`).
 *   ninguém acertou    a rodada «sumiu»: ela vai embora rindo.
 *
 * O «2x» (quem derrubou também finalizou) é o banco que decide
 * (`dobrado`); o letreiro no chão é o do palco, que compara as mesmas pessoas.
 */
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { carregarFontesPixel } from '@/components/Halloween/fonte';
import { finalizarBruxa, nomeCurto, pegarAbobora, type RodadaAbobora } from '../caca';
import '../caca.css';
import './bruxas.css';
import { bruxaDaRodada, BRUXAS } from './arte';
import { ESCALA_BRUXAS, PalcoBruxas, type EventoPalco } from './palco';
import type { Morte } from './queda';

/** O tiro do vencedor, para quem não atirou ver igual (rodada de antes de `tiro`: cabeça ou corpo). */
function tiroDaRodada(r: RodadaAbobora): Morte {
  return r.tiro ?? (r.headshot ? 'cabeca' : 'corpo');
}

/**
 * A caixa fixa onde o palco mora: em cima do conteúdo, do alto dele até o pé
 * da janela (`bottom: 0` no CSS).
 *
 * O alto é medido UMA vez. A faixa, quando abre (no tiro), empurra o conteúdo
 * 40 px para baixo; se a caixa acompanhasse, o chão — que a queda guardou na
 * hora do tiro — ficaria abaixo da borda, e o corpo caído (e o clique para
 * finalizar) sumiria. Com o pé preso na janela, o chão não sai do lugar. Só a
 * largura acompanha o conteúdo (o menu lateral abrindo e fechando).
 */
function criarHospedeiro(): { el: HTMLDivElement; desfazer: () => void } {
  const el = document.createElement('div');
  el.className = 'bx-hospedeiro';
  document.body.appendChild(el);
  const alvo = document.querySelector<HTMLElement>('[data-palco-abobora]');
  const r0 = alvo?.getBoundingClientRect();
  el.style.top = `${r0 && r0.height > 0 ? Math.max(0, r0.top) : 0}px`;
  const medir = () => {
    const r = alvo?.getBoundingClientRect();
    const [x, w] = r && r.width > 0 ? [r.left, r.width] : [0, window.innerWidth];
    Object.assign(el.style, { left: `${x}px`, width: `${w}px` });
  };
  medir();
  const obs = typeof ResizeObserver !== 'undefined' && alvo ? new ResizeObserver(medir) : null;
  if (alvo) obs?.observe(alvo);
  window.addEventListener('resize', medir);
  return {
    el,
    desfazer: () => {
      obs?.disconnect();
      window.removeEventListener('resize', medir);
      el.remove();
    },
  };
}

export function CenaBruxas({ rodada, naTela, eu }: {
  rodada: RodadaAbobora | null;
  /** A rodada solta ainda vale (o relógio da folga não venceu). */
  naTela: boolean;
  /** O id de quem está nesta tela (o «2x» compara com ele). */
  eu: string;
}): null {
  const palcoRef = useRef<PalcoBruxas | null>(null);
  /** A rodada que está no palco agora, e o que já aconteceu com ela aqui. */
  // `bruxa`: o id dela no palco — corpo de rodada anterior ainda no chão não responde por esta.
  const vez = useRef<{ id: number; bruxa: number; caiu: boolean; finalizou: boolean; foi: boolean } | null>(null);
  const rodadaRef = useRef(rodada);
  rodadaRef.current = rodada;

  // O palco: um só enquanto a cena está montada.
  useEffect(() => {
    carregarFontesPixel();
    const host = criarHospedeiro();
    const aoEvento = (e: EventoPalco) => { void tratar(e); };
    const palco = new PalcoBruxas(host.el, { escala: ESCALA_BRUXAS, eu, aoEvento });
    palcoRef.current = palco;

    async function tratar(e: EventoPalco): Promise<void> {
      const r = rodadaRef.current;
      const v = vez.current;
      if (!r || !v || r.id !== v.id) return;
      if ((e.tipo === 'matou' || e.tipo === 'finalizou') && e.id !== v.bruxa) return;
      if (e.tipo === 'matou' && e.quem === eu) {
        v.caiu = true;
        const res = await pegarAbobora(r.id, e.morte === 'cabeca', e.morte);
        if (res.erro) { toast.error('O tiro não chegou', { description: res.erro }); return; }
        const rr = res.rodada;
        if (res.ganhou) {
          toast.success(e.morte === 'cabeca' ? 'HEADSHOT!' : e.morte === 'vassoura' ? 'VASSOURADA!' : 'Na mosca!', {
            description: `Você derrubou ${e.bruxa.nome} primeiro. Seu nome está passando na faixa para todo mundo.`
              + (e.bruxa.fofa ? ' Atire de novo no chão para finalizar e ganhar o 2x!' : ''),
          });
        } else {
          if (rr?.achada_por) palcoRef.current?.trocarQuem(rr.achada_por);
          toast(rr?.situacao === 'achada'
            ? `${nomeCurto(rr.achada_por_nome)} derrubou primeiro.`
            : 'Ela já tinha ido embora.');
        }
      } else if (e.tipo === 'finalizou' && e.quem === eu) {
        v.finalizou = true;
        const res = await finalizarBruxa(r.id);
        if (res.erro) { toast.error('O tiro não chegou', { description: res.erro }); return; }
        if (res.finalizou && res.rodada?.dobrado) {
          toast.success('2x!', { description: 'Derrubou e finalizou: o 2x está na faixa para todo mundo.' });
        }
      }
    }

    return () => {
      palco.destruir();
      palcoRef.current = null;
      host.desfazer();
      vez.current = null;
    };
  }, [eu]);

  // A rodada manda no palco.
  useEffect(() => {
    const palco = palcoRef.current;
    if (!palco || !rodada || rodada.tema !== 'bruxas') return;
    let v = vez.current;

    if (!v || v.id !== rodada.id) {
      // Só entra voando quem está solta; achada ou sumida de antes não volta.
      if (rodada.situacao !== 'solta' || !naTela) return;
      v = { id: rodada.id, bruxa: 0, caiu: false, finalizou: false, foi: false };
      vez.current = v;
      v.bruxa = palco.soltar(BRUXAS.indexOf(bruxaDaRodada(rodada)));
      return;
    }

    if (rodada.situacao === 'achada') {
      // Outra pessoa derrubou: aqui ela cai do jeito do vencedor.
      if (!v.caiu && palco.temViva) {
        v.caiu = true;
        palco.matarPorOutro(tiroDaRodada(rodada), rodada.achada_por ?? 'outro');
      }
    } else if ((rodada.situacao === 'sumiu' || !naTela) && !v.foi && !v.caiu) {
      v.foi = true;
      palco.fugirTodas();
    }
  }, [rodada, naTela, eu]);

  return null;
}
