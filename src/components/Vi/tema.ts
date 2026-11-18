/**
 * Tema do lançamento do GTA VI — dois dias: 18 e 19/11/2026 (Cleber, 16/11/2026;
 * em 18/11 ele antecipou a liberação: «vai ficar hoje e amanhã»).
 *
 * Um tema simples que entra no lugar do tema de Natal.
 *
 *   - em 18 e 19/11 (data de São Paulo) o tema fica DISPONÍVEL para todo mundo,
 *     sem liberação e sem banco — é o relógio que decide; no dia 20 some;
 *   - o jogo sai no dia 19: o dia 18 é a véspera, e o convite fala de acordo
 *     com o dia (`textoDoConvite`);
 *   - ele NÃO liga sozinho: aparece um convite fechado na tela (`ConviteVi`);
 *     quem abre lê a novidade, ouve a música e escolhe ativar ou não;
 *   - quem ativa fica com o tema no lugar do Natal — o `Layout` entrega `null`
 *     no lugar do estilo do Natal e o visual dele some (enfeites, trem,
 *     música, globo do chat). Os quebra-nozes continuam aparecendo;
 *   - quem recusa continua como estava, e pode ligar depois no menu de temas
 *     («Tema GTA VI»). A escolha vale para a pessoa, neste navegador.
 *
 * As artes, a fonte e a tela de carregamento são as oficiais da Rockstar
 * (`public/vi/`, baixadas do site do jogo): o Cleber pediu o material oficial,
 * não um desenho «no estilo».
 *
 * Prévia, só no `npm run dev`:
 *   `?vi=on`      é o dia (o convite aparece para quem ainda não escolheu);
 *   `?vi=convite` é o dia E esquece a escolha — o convite volta, para testar;
 *   `?vi=off`     não é o dia;
 *   `?vi=dia`     volta a obedecer o relógio.
 *
 * No laboratório, `/lab-vi.html?convite=1&dia=19` mostra o convite do dia 19.
 *
 * Depois do dia 19 esta pasta inteira pode ir embora: `Vi/`, `public/vi/`,
 * `lab-vi.html` e os pontos marcados com «GTA VI» no `Layout`, no `App`, na
 * `BolhaChat` e no `ThemeToggle`.
 */
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { getTodayISO } from '@/lib';

/** O lançamento do jogo. */
export const DIA_DO_VI = '2026-11-19';
/** A véspera: o tema já entra no ar. */
export const VESPERA_DO_VI = '2026-11-18';

/** O instante do lançamento: meia-noite do dia 19, horário de Brasília. */
export const LANCAMENTO_MS = Date.parse('2026-11-19T00:00:00-03:00');

/**
 * Quanto falta, em «HH», «MM», «SS»; `null` quando já chegou. Arredonda o
 * segundo para cima: o zero só aparece na hora exata do lançamento.
 */
export function partesDaContagem(agora: number, lancamento: number = LANCAMENTO_MS): [string, string, string] | null {
  const falta = Math.ceil((lancamento - agora) / 1000);
  if (falta <= 0) return null;
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return [doisDigitos(Math.floor(falta / 3600)), doisDigitos(Math.floor(falta / 60) % 60), doisDigitos(falta % 60)];
}

/** O que o convite diz: na véspera o jogo chega amanhã; no dia, chega hoje. */
export function textoDoConvite(hoje: string) {
  return hoje === VESPERA_DO_VI
    ? {
        titulo: 'Amanhã é dia de GTA VI',
        abertura: 'O jogo mais esperado dos últimos anos chega amanhã. Para entrar no clima, o sistema ganhou um tema especial, só hoje e amanhã:',
        fim: 'Depois de amanhã tudo volta ao normal.',
      }
    : {
        titulo: 'Hoje é dia de GTA VI',
        abertura: 'O jogo mais esperado dos últimos anos chega hoje. Para marcar a data, o sistema ganhou um tema especial, só até hoje:',
        fim: 'Amanhã tudo volta ao normal.',
      };
}

/** Quem desenha (a bolha do chat) só lê; fora do `Layout` e em teste é `false`. */
export const TemaViContext = createContext(false);
export const useTemaVi = () => useContext(TemaViContext);

// ── As artes ─────────────────────────────────────────────────────────────────

export interface ArteVi {
  /** Arquivo em `public/vi/` (1920 de largura, WebP). */
  src: string;
  /** `object-position` da faixa do alto: o pedaço da arte que aparece. */
  foco: string;
}

/**
 * O carrossel (Cleber, 16/11/2026: «fica passando as fotos, o wallpaper
 * trocando sozinho, independente da aba»): as artes oficiais dos personagens
 * e os seis postais de Leonida, intercalados. O `foco` mostra a faixa dos
 * rostos e do céu de cada arte — é o pedaço que cabe no alto da página.
 *
 * Os postais vêm tortos dentro de uma moldura no arquivo da Rockstar; aqui
 * eles estão desentortados e recortados na foto de dentro. O foco deles é o
 * meio da foto: o nome do lugar, no alto do postal, brigaria com o logo.
 */
export const ARTES: readonly ArteVi[] = [
  { src: '/vi/arte-carro.webp', foco: '50% 14%' },
  { src: '/vi/postal-vice.webp', foco: '50% 56%' },
  { src: '/vi/arte-praia.webp', foco: '50% 22%' },
  { src: '/vi/arte-cal.webp', foco: '50% 13%' },
  { src: '/vi/postal-keys.webp', foco: '50% 50%' },
  { src: '/vi/arte-cobertura.webp', foco: '50% 9%' },
  { src: '/vi/arte-boobie.webp', foco: '50% 8%' },
  { src: '/vi/postal-gellhorn.webp', foco: '50% 50%' },
  { src: '/vi/arte-conversivel.webp', foco: '50% 6%' },
  { src: '/vi/arte-drequan.webp', foco: '50% 9%' },
  { src: '/vi/postal-ambrosia.webp', foco: '50% 50%' },
  { src: '/vi/arte-posto.webp', foco: '50% 12%' },
  { src: '/vi/arte-dimez.webp', foco: '50% 13%' },
  { src: '/vi/postal-grassrivers.webp', foco: '50% 50%' },
  { src: '/vi/arte-pier.webp', foco: '50% 17%' },
  { src: '/vi/arte-raul.webp', foco: '50% 7%' },
  { src: '/vi/postal-kalaga.webp', foco: '50% 50%' },
  { src: '/vi/arte-brian.webp', foco: '50% 11%' },
];

/** De quanto em quanto tempo a arte troca. */
export const TROCA_MS = 14_000;

/**
 * Qual arte está na tela agora. Sai do relógio, não de um contador: todo mundo
 * vê a mesma arte na mesma hora, e trocar de aba ou recarregar a página não
 * volta o carrossel para o começo.
 */
export const indiceDaArte = (agora: number = Date.now()): number => Math.floor(agora / TROCA_MS) % ARTES.length;

// ── Quem vê ──────────────────────────────────────────────────────────────────

type Previa = 'on' | 'off' | null;

/**
 * É dia do tema (18 ou 19/11)? Exportada para os testes. A prévia só vale no `npm run dev`:
 * fora dele, é a data e mais nada.
 */
export function ehDiaDoVi(p: { hoje: string; dev: boolean; previa: Previa }): boolean {
  if (p.dev && p.previa) return p.previa === 'on';
  return p.hoje === VESPERA_DO_VI || p.hoje === DIA_DO_VI;
}

/** O que a pessoa respondeu ao convite: ativou, recusou, ou ainda não respondeu. */
export type EscolhaVi = 'sim' | 'nao' | null;

/**
 * O tema está na tela? Exportada para os testes. Só no dia, e só para quem
 * ativou — sem resposta ou com «não», fica tudo como estava.
 */
export function viLigado(noDia: boolean, escolha: EscolhaVi): boolean {
  return noDia && escolha === 'sim';
}

const CHAVE_PREVIA = 'vi:previa';
const EVENTO = 'vi-tema';
const PREFIXO_ESCOLHA = 'vi:escolha:';

function lerPrevia(): Previa {
  try {
    const v = localStorage.getItem(CHAVE_PREVIA);
    return v === 'on' || v === 'off' ? v : null;
  } catch { return null; }
}

/** A resposta de quem está sem armazenamento: o convite fecha do mesmo jeito. */
const escolhaSemArmazenamento = new Map<string, 'sim' | 'nao'>();

function lerEscolha(pessoa: string): EscolhaVi {
  const naMemoria = escolhaSemArmazenamento.get(pessoa) ?? null;
  try {
    const v = localStorage.getItem(PREFIXO_ESCOLHA + pessoa);
    return v === 'sim' || v === 'nao' ? v : naMemoria;
  } catch { return naMemoria; }
}

/**
 * Grava a resposta desta pessoa, neste navegador: ativa ou desativa o tema. A
 * resposta fica valendo nos dois dias, então o convite aparece uma vez só.
 */
export function escolherVi(pessoa: string, escolha: 'sim' | 'nao') {
  try {
    localStorage.setItem(PREFIXO_ESCOLHA + pessoa, escolha);
    escolhaSemArmazenamento.delete(pessoa);
  } catch {
    // Modo privado ou armazenamento cheio: vale até recarregar.
    escolhaSemArmazenamento.set(pessoa, escolha);
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** As chaves de escolha gravadas neste navegador (de qualquer pessoa). */
function chavesDeEscolha(): string[] {
  const chaves: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIXO_ESCOLHA)) chaves.push(k);
    }
  } catch { /* modo privado */ }
  return chaves;
}

/**
 * A tela de carregamento (`CarregandoVi`) aparece antes de se saber quem é a
 * pessoa: vale o dia, e alguém ter ativado o tema neste navegador.
 */
export function viNoCarregamento(): boolean {
  if (!ehDiaDoVi({ hoje: getTodayISO(), dev: import.meta.env.DEV, previa: lerPrevia() })) return false;
  try { return chavesDeEscolha().some(k => localStorage.getItem(k) === 'sim'); } catch { return false; }
}

function assinar(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  window.addEventListener('storage', aviso);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener('storage', aviso);
  };
}

/** `?vi=on|convite|off|dia` no endereço (só no dev): grava e tira do endereço. */
function lerDoEndereco() {
  const busca = new URLSearchParams(window.location.search);
  if (!busca.has('vi')) return;
  const v = busca.get('vi');
  try {
    if (v === 'on' || v === 'off') localStorage.setItem(CHAVE_PREVIA, v);
    else if (v === 'convite') {
      // O convite de novo: é o dia, e ninguém neste navegador respondeu ainda.
      localStorage.setItem(CHAVE_PREVIA, 'on');
      for (const k of chavesDeEscolha()) localStorage.removeItem(k);
    } else localStorage.removeItem(CHAVE_PREVIA);
  } catch { /* modo privado */ }
  const url = new URL(window.location.href);
  url.searchParams.delete('vi');
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new Event(EVENTO));
}

/**
 * A data de hoje em São Paulo, conferida de minuto em minuto: quem deixa o
 * sistema aberto de um dia para o outro vê o tema entrar e sair sem recarregar.
 */
function useHoje(): string {
  const [hoje, setHoje] = useState(getTodayISO);
  useEffect(() => {
    const relogio = window.setInterval(() => setHoje(getTodayISO()), 60_000);
    return () => window.clearInterval(relogio);
  }, []);
  return hoje;
}

export interface EstadoVi {
  /** É o dia (ou a prévia do dev ligou): o convite e o interruptor do menu de temas existem. */
  noDia: boolean;
  /** O tema está na tela: é o dia e a pessoa ativou. */
  ligado: boolean;
  /** A resposta da pessoa ao convite; `null` = o convite ainda está esperando. */
  escolha: EscolhaVi;
}

export function useVi(pessoa: string): EstadoVi {
  const dev = import.meta.env.DEV;
  const hoje = useHoje();
  const previa = useSyncExternalStore(assinar, lerPrevia);
  const escolha = useSyncExternalStore(assinar, () => lerEscolha(pessoa));
  useEffect(() => { if (dev) lerDoEndereco(); }, [dev]);
  const noDia = ehDiaDoVi({ hoje, dev, previa });
  return { noDia, ligado: viLigado(noDia, escolha), escolha };
}

/** Pedido do laboratório, para ver a faixa de «Missão cumprida» sem salvar acordo. */
export const EVENTO_MISSAO = 'vi-missao';
