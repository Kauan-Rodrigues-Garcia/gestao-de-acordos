import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useModoLeve } from '@/lib/modoLeve';
import { usePiscaPisca } from '../piscaPisca';
import { Defs } from './pecas';
import { A, L, SO_LAREIRA } from './medidas';
import {
  Anexo, Arvore, BolaDoGrinch, Gato, Janela, Lareira, LuzDoFogo, Mesinha, Parede, Pendurados,
  Poltrona, Prateleira, Presentes, Relogio, RestosDaBagunca, Tapete, Tv,
} from './Cenario';
import { Fuligem, Grinch, GrinchEspiando, JanelaQuebrada } from './grinch/Grinch';
import { Duendes } from './grinch/Duendes';
import { useGrinch } from './grinch/roteiro';
import './chale.css';

/**
 * O chalé de Natal no alto da aba Acordos (Cleber, 05/11/2026): «um ambiente
 * aconchegante, como se fosse a parte de dentro de um chalé» — no centro a
 * lareira com o fogo aceso, a chaminé subindo até a barra de cima, e a linha
 * das abas como o chão.
 *
 * ## Redesenho de 06/11/2026 (Kauan)
 *
 * A parede virou papel de parede e lambri NOS TONS DO TEMA (`--primary` e
 * `--background` em `chale.css`), que somem nas pontas — o chalé é do Gestão,
 * no claro e no escuro. As luzinhas da cornija e da árvore obedecem ao
 * controlador do pisca-pisca (`piscaPisca.ts`), como o varal do Dashboard.
 *
 * ## Redesenho de 11/11/2026 (Cleber: «um chalé melhorado, mais detalhado,
 * mais aconchegante», com TV de tubo, e o Grinch novo — «sem deixar pesado»)
 *
 *   - PALCO EM CAMADAS. O chalé era um SVG só, com meia centena de animações
 *     dentro — e animação dentro de SVG faz a página redesenhar o desenho todo
 *     a cada quadro. Agora é um palco HTML (`pecas.tsx`): o que não mexe é
 *     desenhado uma vez; o que mexe (chamas, neve, poltrona, luzes…) é uma
 *     caixa própria, animada só por `transform` e `opacity`, na placa de vídeo.
 *   - MAIS COISA NA SALA (`Cenario.tsx`): a mesinha com o chocolate quente, o
 *     relógio de cuco, o quebra-nozes e o porta-retrato na cornija, a
 *     prateleira, a TV de tubo no rack, bengalinhas na árvore.
 *   - O ANEXO. Embaixo dos botões da página sobra uma faixa até a linha das
 *     abas. Quando ela existe, o lambri segue por ali e a sala continua com
 *     coisas baixas: a pilha de presentes, o cavalinho de balanço, os
 *     biscoitos do Papai Noel, a cesta de lenha.
 *   - O GRINCH (`grinch/`): boneco articulado e uma invasão gravada, deixa por
 *     deixa, igual para todos (`grinch/gravacao.ts`).
 *
 * Mora na camada do Natal (`CamadaNatal`, no alto do `<main>`, rola junto) e
 * mede a página: o cabeçalho (`data-natal-cabecalho`) diz o vão livre entre o
 * título (e as abas) e os botões; o chão (`data-natal-chao`) diz a altura.
 * Cabe inteiro, aparece inteiro; não cabe, fica só a lareira; nem ela, some.
 * Nada aqui pega clique, só a lareira (o mouse em cima atiça o fogo).
 *
 * Desenho num quadro de `L` × `A` com o chão em `A`; a escala é a da altura.
 */

/** Folga até o título e até os botões. */
const FOLGA = 28;
/** O anexo: a largura máxima, e a altura livre (no quadro) que ele precisa embaixo dos botões. */
const ANEXO_MAX = 256;
const ANEXO_ALTURA = 70;

/**
 * `topo`: quanto (no quadro) sobra acima do desenho até a barra de cima — a
 * chaminé e a parede sobem até lá. `anexo`: a largura (no quadro) da faixa
 * livre à direita, embaixo dos botões.
 */
interface Lugar { x: number; altura: number; escala: number; compacto: boolean; topo: number; larguraMain: number; anexo: number }

function medir(el: HTMLElement): Lugar | null {
  const main = el.closest('main');
  const cab = main?.querySelector<HTMLElement>('[data-natal-cabecalho]');
  const chao = main?.querySelector<HTMLElement>('[data-natal-chao]');
  if (!main || !cab || !chao) return null;
  const m = main.getBoundingClientRect();
  const visiveis = (e: Element) => Array.from(e.children).map(f => f.getBoundingClientRect()).filter(r => r.width > 0);
  const partes = Array.from(cab.children).filter(f => f.getBoundingClientRect().width > 0);
  const titulo = partes[0]?.getBoundingClientRect();
  const botoes = partes.length > 1 ? visiveis(partes[partes.length - 1]) : [];
  // À esquerda: o fim do título e, se o chão é a fileira das abas, o fim da última aba.
  const esq = Math.max(titulo?.right ?? m.left, chao === cab ? m.left : Math.max(m.left, ...visiveis(chao).map(r => r.right)));
  const dir = botoes.length ? Math.min(...botoes.map(r => r.left)) : m.right;
  const a = esq + FOLGA, b = dir - FOLGA;
  const pe = chao.getBoundingClientRect().bottom;
  const altura = pe - m.top + main.scrollTop;
  if (altura < 40 || b <= a) return null;
  const meio = (a + b) / 2 - m.left;
  // A escala é a da altura; sem largura para tanto, encolhe até 70% dela (a chaminé estica até o alto).
  const pelaAltura = altura / A;
  const cabe = (w: number) => Math.min(pelaAltura, (b - a) / w);
  for (const [w, compacto] of [[L, false], [SO_LAREIRA.w, true]] as const) {
    const escala = cabe(w);
    if (escala < pelaAltura * 0.7) continue;
    const x = meio - (w * escala) / 2;
    // O anexo: do fim do quadro até o fim do cabeçalho, se a faixa embaixo dos botões tiver altura.
    let anexo = 0;
    if (!compacto && botoes.length) {
      const livre = (pe - Math.max(...botoes.map(r => r.bottom)) - 8) / escala;
      const ate = (cab.getBoundingClientRect().right - (m.left + x + L * escala)) / escala;
      if (livre >= ANEXO_ALTURA) anexo = Math.max(0, Math.min(ANEXO_MAX, Math.floor(ate / 4) * 4));
    }
    return { x, altura, escala, compacto, topo: altura / escala - A, larguraMain: m.width, anexo };
  }
  return null;
}

export function Chale() {
  const raiz = useRef<HTMLDivElement>(null);
  const boneco = useRef<HTMLDivElement>(null);
  const [lugar, setLugar] = useState<Lugar | null>(null);
  const leve = useModoLeve();
  const pisca = usePiscaPisca();
  // A borda direita da tela, no quadro do chalé: é de lá que os duendes vêm.
  const direita = lugar ? (lugar.compacto ? SO_LAREIRA.x : 0) + (lugar.larguraMain - lugar.x) / lugar.escala : L + 100;
  const grinch = useGrinch(lugar ? lugar.compacto : null, direita, leve, boneco);
  const b = grinch.bagunca;

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const atualizar = () => {
      const l = medir(el);
      setLugar(v => (JSON.stringify(v) === JSON.stringify(l) ? v : l));
    };
    atualizar();
    // O cabeçalho muda sem mudar de tamanho («Carregando…», botões que aparecem): remede de vez em quando.
    const id = window.setInterval(atualizar, 1200);
    const main = el.closest('main');
    const ro = new ResizeObserver(atualizar);
    if (main) ro.observe(main);
    window.addEventListener('resize', atualizar);
    return () => { window.clearInterval(id); ro.disconnect(); window.removeEventListener('resize', atualizar); };
  }, []);

  const t = lugar?.topo ?? 0;
  const c = !!lugar?.compacto;
  const largura = lugar ? (c ? SO_LAREIRA.w : L + lugar.anexo) * lugar.escala : 0;

  return (
    <div ref={raiz} className={cn('nt-chale', leve && 'leve')} aria-hidden="true"
      style={lugar ? { left: lugar.x, width: largura, height: lugar.altura } : { width: 0, height: 0 }}>
      {lugar && (
        <div className="ch-palco" data-pisca={pisca} style={{ transform: `scale(${lugar.escala})` }}>
          <Defs />
          <div className="ch-o" style={{ left: c ? -SO_LAREIRA.x : 0, top: t }}>
            {!c && <Parede topo={t} anexo={lugar.anexo} />}
            {!c && <LuzDoFogo topo={t} />}
            {!c && <Janela espia={<GrinchEspiando e={grinch} />} quebrada={<JanelaQuebrada e={grinch} />} />}
            {!c && <Mesinha />}
            {!c && <Relogio bag={!!b.relogio} />}
            <Tapete bag={!!b.tapete} />
            {!c && <Poltrona bag={!!b.poltrona} />}
            <Lareira topo={t} b={b} />
            {!c && <Gato estado={grinch.gato} />}
            {!c && <Prateleira />}
            {!c && <Tv bag={!!b.tv} leve={leve} />}
            {!c && <Arvore bag={!!b.arvore} />}
            {!c && <Presentes bag={!!b.presentes} />}
            {!c && <Pendurados topo={t} />}
            <BolaDoGrinch topo={t} caida={!!b.bola} />
            {!c && lugar.anexo > 0 && <Anexo largura={lugar.anexo} />}
            <RestosDaBagunca b={b} compacto={c} />
            <Fuligem e={grinch} />
            <Grinch ref={boneco} />
            <Duendes duendes={grinch.duendes} />
          </div>
        </div>
      )}
    </div>
  );
}
