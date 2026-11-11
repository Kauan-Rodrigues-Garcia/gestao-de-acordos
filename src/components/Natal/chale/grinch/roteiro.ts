/**
 * O roteiro do Grinch no chalé de Acordos — o que acontece e quando. O
 * desenho está em `Grinch.tsx` e `Duendes.tsx`; as falas, em
 * `falasDosDuendes.ts`; a invasão em si, deixa por deixa, em `gravacao.ts`.
 *
 * ## A invasão (06/11/2026, pedido do Kauan; regravada em 11/11/2026)
 *
 *   1. A GRAVAÇÃO. Com o chalé inteiro, pela janela: ele espia, o vidro trinca
 *      e estilhaça, ele pula para dentro, assusta o gato e vai bagunçando
 *      objeto por objeto, da poltrona até a árvore — cada um do seu jeito.
 *      Depois ri no meio da sala e foge por onde veio. Com só a lareira à
 *      vista (tela estreita), pela chaminé — como no livro. É uma gravação:
 *      as mesmas deixas, na mesma hora, para todo mundo (`gravacao.ts`).
 *   2. BAGUNÇA. Uns segundos assim (um acordo salvo encurta: chama os
 *      duendes na hora).
 *   3. DUENDES. Três duendes entram pelo canto da tela, andando pelo chão
 *      (a linha das abas). Cada um vai ao item mais perto que ninguém pegou,
 *      conserta com a ferramenta dele e o item volta ao lugar. Eles reclamam,
 *      falam do Natal e caguetam pro Urso do iglu (que fica sabendo de
 *      verdade: `noticiaDoGrinch.ts`). No fim o gato volta e eles saem.
 *
 * Entre uma invasão e outra ele às vezes só ESPIA pela janela.
 *
 * ## Quando
 *
 * A primeira invasão vem 35 a 60 s depois de abrir Acordos; as próximas, 12 a
 * 18 minutos depois de a anterior acabar (eram 5 a 8; o Cleber pediu mais
 * tempo entre uma bagunça e outra, 11/11/2026). Com a aba escondida, ou com ninguém
 * olhando (`lib/atencao.ts`), espera. No modo leve ele não invade sozinho (as
 * animações estão desligadas e a cena só pularia de um estado para outro) — o
 * laboratório ainda pode chamar.
 *
 * Laboratório (`/lab-chale.html`): `natal-grinch-invadir`, `natal-grinch-espiar`
 * e `natal-duendes` fazem acontecer na hora.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ninguemOlhando } from '@/lib/atencao';
import { EVENTO_ACORDO_SALVO } from '../../tema';
import { registrarInvasao } from '../../noticiaDoGrinch';
import { criarFalasDosDuendes, type MomentoDoDuende } from './falasDosDuendes';
import { GRAVACAO_CHAMINE, GRAVACAO_JANELA, tocar } from './gravacao';

export const EVENTO_GRINCH_INVADIR = 'natal-grinch-invadir';
export const EVENTO_GRINCH_ESPIAR = 'natal-grinch-espiar';
export const EVENTO_DUENDES = 'natal-duendes';

export type ItemDoChale = 'janela' | 'relogio' | 'poltrona' | 'tapete' | 'meias' | 'velas' | 'guirlanda' | 'bola' | 'tv' | 'presentes' | 'arvore';


/** Onde o duende para para consertar cada coisa (x no quadro de 600). */
export const POSTO: Record<ItemDoChale, number> = {
  janela: 132, relogio: 196, poltrona: 214, tapete: 250, meias: 284, guirlanda: 306, velas: 330, bola: 352, tv: 398, presentes: 500, arvore: 546,
};

export type FaseDoGrinch = 'calmo' | 'espia' | 'quebra' | 'entra' | 'pose' | 'sai' | 'baguncado' | 'duendes';
export type IdDuende = 0 | 1 | 2;

export interface Duende {
  /** 0 = martelo, 1 = vassoura, 2 = prancheta. */
  id: IdDuende;
  x: number;
  /** Duração da caminhada até `x`, em segundos (0 = já está lá). */
  dur: number;
  olha: 1 | -1;
  acao: 'anda' | 'conserta' | 'parado';
  fala: string | null;
}

export type Bagunca = Partial<Record<ItemDoChale, true>>;

export interface EstadoGrinch {
  fase: FaseDoGrinch;
  via: 'janela' | 'chamine';
  /** O rosto dele espiando atrás do vidro. */
  espiando: boolean;
  bagunca: Bagunca;
  /** O gato: dormindo no tapete, de olho arregalado, ou sumido. */
  gato: 'dorme' | 'susto' | 'fugiu';
  duendes: Duende[];
}

const CALMO: EstadoGrinch = { fase: 'calmo', via: 'janela', espiando: false, bagunca: {}, gato: 'dorme', duendes: [] };

/** Velocidade dos duendes (unidades do quadro por segundo): entrando de longe, e de um item a outro. */
const VEL_CHEGADA = 95;
const VEL_DENTRO = 62;
const CONSERTO_MS = 1900;
const FALA_MS = 3400;

const espera = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms));

/**
 * `compacto`: `null` sem chalé na tela (nada acontece), `true` com só a
 * lareira. `direita`: o x, no quadro, da borda direita da tela — de onde os
 * duendes vêm. `boneco`: o elemento do Grinch (`Grinch.tsx`), que a gravação
 * move direto, sem passar pelo React.
 */
export function useGrinch(compacto: boolean | null, direita: number, leve: boolean, boneco: RefObject<HTMLElement | null>): EstadoGrinch {
  const [e, setE] = useState<EstadoGrinch>(CALMO);
  const ref = useRef({ compacto, direita, leve });
  ref.current = { compacto, direita, leve };

  useEffect(() => {
    let vivo = true;
    let ocupado = false;
    let chamarDuendesJa: (() => void) | null = null;
    let proximaFalaEm = 0;
    let timer = 0;
    // A bagunça mora aqui (fonte da verdade do roteiro) e é copiada para o estado a cada mudança.
    let bagunca: Bagunca = {};
    let duendesAgora: Duende[] = [];

    const p = (parcial: Partial<EstadoGrinch>) => { if (vivo) setE(v => ({ ...v, ...parcial })); };
    const baguncar = (item: ItemDoChale) => { bagunca = { ...bagunca, [item]: true }; p({ bagunca }); };
    const arrumar = (item: ItemDoChale) => { const b = { ...bagunca }; delete b[item]; bagunca = b; p({ bagunca }); };
    const duende = (id: IdDuende, parcial: Partial<Duende>) => {
      duendesAgora = duendesAgora.map(d => (d.id === id ? { ...d, ...parcial } : d));
      p({ duendes: duendesAgora });
    };

    async function espiar() {
      p({ fase: 'espia', via: 'janela', espiando: true }); await espera(4000);
      p({ fase: 'calmo', espiando: false }); await espera(900);
    }

    async function invadir() {
      const compactoAgora = ref.current.compacto;
      if (compactoAgora === null) return;
      const via = compactoAgora ? 'chamine' : 'janela';
      registrarInvasao();
      p({ via });
      await tocar(compactoAgora ? GRAVACAO_CHAMINE : GRAVACAO_JANELA, {
        grinch: () => boneco.current,
        baguncar,
        fase: (fase, espiando) => p(espiando === undefined ? { fase } : { fase, espiando }),
        gato: gato => p({ gato }),
      }, () => vivo);
      if (!vivo) return;
      p({ fase: 'baguncado', espiando: false, gato: 'fugiu' });
      // Fica bagunçado um pouco — um acordo salvo (ou o laboratório) chama os duendes antes.
      await new Promise<void>(r => {
        const t = window.setTimeout(r, 9000);
        chamarDuendesJa = () => { window.clearTimeout(t); r(); };
      });
      chamarDuendesJa = null;
      if (vivo) await duendes();
    }

    function falar(id: IdDuende, falas: ReturnType<typeof criarFalasDosDuendes>, momento: MomentoDoDuende, item?: ItemDoChale, forcar = false) {
      const agora = Date.now();
      if (!forcar && agora < proximaFalaEm) return;
      proximaFalaEm = agora + 2300;
      const texto = falas.fala(id, momento, item);
      duende(id, { fala: texto });
      window.setTimeout(() => {
        if (duendesAgora.some(d => d.id === id && d.fala === texto)) duende(id, { fala: null });
      }, FALA_MS);
    }

    async function duendes() {
      const falas = criarFalasDosDuendes();
      const inicio = ref.current.direita + 24;
      duendesAgora = ([0, 1, 2] as const).map((id): Duende => ({ id, x: inicio + id * 26, dur: 0, olha: -1, acao: 'anda', fala: null }));
      p({ fase: 'duendes', duendes: duendesAgora });
      // Um quadro com eles fora da tela, para a caminhada ter de onde partir.
      await espera(80);
      const pendentes = Object.keys(bagunca) as ItemDoChale[];
      const pos: Record<IdDuende, number> = { 0: inicio, 1: inicio + 26, 2: inicio + 52 };

      async function trabalhar(id: IdDuende) {
        await espera(id * 650);
        let primeira = true;
        while (vivo && pendentes.length) {
          const aqui = pos[id];
          pendentes.sort((a, b) => Math.abs(POSTO[a] - aqui) - Math.abs(POSTO[b] - aqui));
          const item = pendentes.shift() as ItemDoChale;
          // Um pouco de folga para três duendes não ficarem um em cima do outro.
          const alvo = POSTO[item] + (id - 1) * 6;
          const dur = Math.abs(alvo - aqui) / (primeira ? VEL_CHEGADA : VEL_DENTRO);
          duende(id, { x: alvo, dur, olha: alvo < aqui ? -1 : 1, acao: 'anda' });
          pos[id] = alvo;
          await espera(dur * 1000);
          if (!vivo) return;
          duende(id, { acao: 'conserta' });
          if (primeira && id === 0) falar(0, falas, 'chegada', undefined, true);
          else if (Math.random() < 0.75) falar(id, falas, 'trabalho', item);
          primeira = false;
          await espera(CONSERTO_MS);
          if (!vivo) return;
          arrumar(item);
          duende(id, { acao: 'parado' });
          await espera(350);
        }
        duende(id, { acao: 'parado' });
      }

      await Promise.all(([0, 1, 2] as const).map(trabalhar));
      if (!vivo) return;
      p({ gato: 'dorme' });
      falar(1, falas, 'fim', undefined, true);
      await espera(2000);
      falar(2, falas, 'trabalho', undefined, true);
      await espera(2600);
      if (!vivo) return;
      // Vão embora pelo mesmo canto.
      const saida = ref.current.direita + 60;
      let maior = 0;
      duendesAgora = duendesAgora.map((d): Duende => {
        const dur = Math.abs(saida + d.id * 24 - d.x) / VEL_CHEGADA;
        maior = Math.max(maior, dur);
        return { ...d, x: saida + d.id * 24, dur, olha: 1, acao: 'anda', fala: null };
      });
      p({ duendes: duendesAgora });
      await espera(Math.max(maior, 2) * 1000 + 300);
      duendesAgora = [];
      bagunca = {};
      if (vivo) setE(CALMO);
    }

    async function rodar(acao: () => Promise<void>) {
      if (ocupado) return;
      ocupado = true;
      try { await acao(); } finally { ocupado = false; }
    }

    // A vez dele: espiar de vez em quando, invadir de tempos em tempos.
    let proximaInvasao = Date.now() + (35 + Math.random() * 25) * 1000;
    function vez() {
      const { compacto: c, leve: l } = ref.current;
      if (!document.hidden && !ninguemOlhando() && c !== null && !ocupado && !l) {
        if (Date.now() >= proximaInvasao) {
          void rodar(invadir).then(() => { proximaInvasao = Date.now() + (720 + Math.random() * 360) * 1000; });
        } else if (!c && Math.random() < 0.18) {
          void rodar(espiar);
        }
      }
      timer = window.setTimeout(vez, 10_000);
    }
    timer = window.setTimeout(vez, 10_000);

    const aoChamarDuendes = () => { chamarDuendesJa?.(); };
    const aoInvadir = () => { void rodar(invadir); };
    const aoEspiar = () => { if (ref.current.compacto === false) void rodar(espiar); };
    window.addEventListener(EVENTO_ACORDO_SALVO, aoChamarDuendes);
    window.addEventListener(EVENTO_GRINCH_INVADIR, aoInvadir);
    window.addEventListener(EVENTO_GRINCH_ESPIAR, aoEspiar);
    window.addEventListener(EVENTO_DUENDES, aoChamarDuendes);
    return () => {
      vivo = false;
      window.clearTimeout(timer);
      window.removeEventListener(EVENTO_ACORDO_SALVO, aoChamarDuendes);
      window.removeEventListener(EVENTO_GRINCH_INVADIR, aoInvadir);
      window.removeEventListener(EVENTO_GRINCH_ESPIAR, aoEspiar);
      window.removeEventListener(EVENTO_DUENDES, aoChamarDuendes);
    };
  }, [boneco]);

  return e;
}
