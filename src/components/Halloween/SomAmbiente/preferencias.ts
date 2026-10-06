/**
 * preferencias.ts — o que cada pessoa escolheu no Som ambiente.
 *
 * Fica no navegador (`localStorage`), por pessoa: trocar de usuário na mesma
 * máquina não herda a música de ninguém. Não tem coluna no banco de propósito
 * — é gosto de quem está sentado ali, não dado do negócio.
 *
 * Tudo que vem do armazenamento passa por `normalizar`: chave apagada, JSON
 * quebrado ou versão antiga voltam para o padrão em vez de derrubar o header.
 */
import { chaveDoLink, lerLink, type LinkExterno } from './links';

/**
 * O tema especial (05/10/2026): enquanto ele está escolhido, o gestão entra no
 * modo Batman (`Halloween/Batman/modoBatman.ts`). Fica no alto do painel, mas
 * FORA da sequência: o anterior/próxima e o fim de outra faixa nunca caem
 * nele — só toca quando a pessoa escolhe.
 */
export const TEMAS_ESPECIAIS = ['batman'] as const;
/**
 * Liga e desliga o tema do Batman. Desligado em 06/10/2026 (a faixa some do
 * painel e o modo não entra), religado no mesmo dia, com o vermelho seguindo
 * a música e a chuva na gota do player, desligado de novo a pedido do Cleber e
 * religado mais uma vez no mesmo dia, e desligado PARA TODOS de novo a pedido
 * do Cleber (06/10/2026), e religado de novo no mesmo dia. Antes de trocar a
 * chave, confirme com ele: ela já foi trocada de volta várias vezes no mesmo
 * dia. `false` desliga sem apagar nada.
 */
export const BATMAN_LIGADO = true;
/** As de fábrica fora do ar: não aparecem no painel nem voltam do armazenamento. */
const FAIXAS_DESLIGADAS: readonly string[] = BATMAN_LIGADO ? [] : ['batman'];
export const faixaNoAr = (faixa: string) => !FAIXAS_DESLIGADAS.includes(faixa);
/** Os temas de terror que vêm de fábrica, na ordem do painel. */
export const TEMAS_DE_TERROR = ['halloween', 'sexta13', 'candyman', 'stranger', 'pesadelo', 'pecadores'] as const;
/** As músicas para escutar que vêm de fábrica. */
export const MUSICAS = ['puxalanca', 'reliquia'] as const;
/** Todas as de fábrica, na ordem do painel. */
export const FAIXAS_EMBUTIDAS = [...TEMAS_ESPECIAIS, ...TEMAS_DE_TERROR, ...MUSICAS] as const;
export type FaixaEmbutida = (typeof FAIXAS_EMBUTIDAS)[number];
/** A sequência que o player percorre sozinho: sem o tema especial. */
export const FAIXAS_DA_SEQUENCIA: readonly FaixaEmbutida[] = [...TEMAS_DE_TERROR, ...MUSICAS];

/** Onde cada uma mora — `public/sounds/`, junto da trilha da mensagem de outubro. */
export const ARQUIVOS: Record<FaixaEmbutida, string> = {
  batman: '/sounds/batman.mp3',
  halloween: '/sounds/halloween-john-carpenter.mp3',
  sexta13: '/sounds/halloween-sexta-feira-13.mp3',
  candyman: '/sounds/halloween-candyman.mp3',
  stranger: '/sounds/halloween-stranger-things.mp3',
  pesadelo: '/sounds/halloween-hora-do-pesadelo.mp3',
  pecadores: '/sounds/halloween-pecadores-eu-menti-pra-voce.mp3',
  puxalanca: '/sounds/halloween-puxa-o-lanca.mp3',
  reliquia: '/sounds/halloween-na-reliquia-do-2t.mp3',
};

/**
 * Ganho de cada faixa, para todas soarem no mesmo volume. Os arquivos vieram
 * de lugares diferentes: medidos em 05/10/2026 (loudness integrada, BS.1770),
 * iam de -16,0 LUFS (Candyman) a -9,6 LUFS (Puxa o Lança) — 6 dB de diferença,
 * a mais alta soando quase o dobro da mais baixa. O alvo é -13 LUFS, o meio:
 * nem estourado nem sumido. `ganho = 10^((-13 - medido) / 20)`.
 *
 * Faixa nova: medir e pôr aqui (o teste cobra que toda faixa tenha ganho).
 */
export const GANHO: Record<FaixaEmbutida, number> = {
  batman: 0.86,     // -11,7
  halloween: 0.82,  // -11,3
  sexta13: 0.89,    // -12,0
  candyman: 1.41,   // -16,0
  stranger: 1.04,   // -13,3
  pesadelo: 1.22,   // -14,7
  pecadores: 1.37,  // -15,7
  puxalanca: 0.68,  // -9,6
  reliquia: 0.78,   // -10,8
};

/**
 * Faixas que saíram da fábrica e quem fica no lugar delas para quem as tinha
 * escolhido. «Talvez Você Precise de Mim», do Veigh, saiu em 05/10/2026; vai
 * para «Puxa o Lança», que também tem o Veigh.
 */
const SUBSTITUTAS: Record<string, FaixaEmbutida> = { veigh: 'puxalanca' };

export interface PlaylistSalva {
  /** `chaveDoLink` — também evita a mesma playlist duas vezes. */
  id: string;
  /** O link como a pessoa colou, para relê-lo se a regra de leitura mudar. */
  url: string;
  nome: string;
}

export interface PreferenciasSom {
  /** Faixa escolhida: uma embutida ou o `id` de uma playlist salva. */
  faixa: string;
  /** 0 a 100. */
  volume: number;
  /** Começa a tocar sozinho ao entrar no sistema. */
  tocarAoEntrar: boolean;
  /**
   * Repete a faixa de fábrica. Desligado, elas tocam em sequência, como uma
   * playlist, e voltam à primeira depois da última.
   */
  repetir: boolean;
  /**
   * A chuva do modo Batman (a gota ao lado do play, só com o Batman escolhido).
   * Desligada de fábrica (pedido de 06/10/2026): quem quer chuva liga.
   */
  chuva: boolean;
  playlists: PlaylistSalva[];
}

/** Baixo de propósito: é som de fundo para quem está trabalhando. */
export const VOLUME_PADRAO = 15;
/**
 * O padrão de antes (até 01/10/2026). Quem tem exatamente ele gravado e ainda
 * não passou pela versão 2 ficou com o padrão, não escolheu: desce para o novo.
 */
const VOLUME_PADRAO_ANTIGO = 20;
/** Versão do que vai gravado. A 2 é a do padrão em 15%. */
const VERSAO = 2;
export const LIMITE_PLAYLISTS = 12;

export const PADRAO: PreferenciasSom = {
  faixa: 'halloween',
  volume: VOLUME_PADRAO,
  tocarAoEntrar: false,
  repetir: false,
  chuva: false,
  playlists: [],
};

const chave = (perfilId: string) => `som-ambiente:${perfilId}`;

export function ehEmbutida(faixa: string): faixa is FaixaEmbutida {
  return (FAIXAS_EMBUTIDAS as readonly string[]).includes(faixa);
}

export function normalizar(bruto: unknown): PreferenciasSom {
  if (!bruto || typeof bruto !== 'object') return { ...PADRAO, playlists: [] };
  const o = bruto as Record<string, unknown>;

  const playlists: PlaylistSalva[] = [];
  if (Array.isArray(o.playlists)) {
    for (const item of o.playlists) {
      if (!item || typeof item !== 'object') continue;
      const p = item as Record<string, unknown>;
      if (typeof p.url !== 'string') continue;
      const link = lerLink(p.url);
      if (!link) continue;
      const id = chaveDoLink(link);
      if (playlists.some(x => x.id === id)) continue;
      const nome = typeof p.nome === 'string' && p.nome.trim() ? p.nome.trim().slice(0, 60) : link.rotulo;
      playlists.push({ id, url: p.url, nome });
      if (playlists.length >= LIMITE_PLAYLISTS) break;
    }
  }

  const lido = typeof o.volume === 'number' && Number.isFinite(o.volume)
    ? Math.round(Math.min(100, Math.max(0, o.volume)))
    : VOLUME_PADRAO;
  const volume = o.v !== VERSAO && lido === VOLUME_PADRAO_ANTIGO ? VOLUME_PADRAO : lido;

  const lida = typeof o.faixa === 'string' ? (SUBSTITUTAS[o.faixa] ?? o.faixa) : null;
  const faixa = lida !== null && ((ehEmbutida(lida) && faixaNoAr(lida)) || playlists.some(p => p.id === lida))
    ? lida
    : PADRAO.faixa;

  return { faixa, volume, tocarAoEntrar: o.tocarAoEntrar === true, repetir: o.repetir === true, chuva: o.chuva === true, playlists };
}

export function lerPreferencias(perfilId: string): PreferenciasSom {
  try {
    const texto = localStorage.getItem(chave(perfilId));
    return normalizar(texto ? JSON.parse(texto) : null);
  } catch {
    return normalizar(null);
  }
}

export function gravarPreferencias(perfilId: string, prefs: PreferenciasSom): void {
  try { localStorage.setItem(chave(perfilId), JSON.stringify({ ...prefs, v: VERSAO })); } catch { /* modo privado */ }
}

/**
 * Onde a música de fábrica parou — para o F5 voltar no mesmo ponto, pausada,
 * em vez de recomeçar do zero. Também só no navegador e por pessoa.
 */
export interface PosicaoSalva {
  faixa: FaixaEmbutida;
  /** Segundos desde o começo da faixa. */
  t: number;
}

const chavePosicao = (perfilId: string) => `som-ambiente-posicao:${perfilId}`;

export function lerPosicao(perfilId: string): PosicaoSalva | null {
  try {
    const o = JSON.parse(localStorage.getItem(chavePosicao(perfilId)) ?? 'null') as Record<string, unknown> | null;
    if (!o || typeof o.faixa !== 'string' || !ehEmbutida(o.faixa) || !faixaNoAr(o.faixa)) return null;
    const t = typeof o.t === 'number' && Number.isFinite(o.t) && o.t > 0 ? o.t : 0;
    return { faixa: o.faixa, t };
  } catch {
    return null;
  }
}

export function gravarPosicao(perfilId: string, pos: PosicaoSalva): void {
  try { localStorage.setItem(chavePosicao(perfilId), JSON.stringify({ faixa: pos.faixa, t: Math.round(pos.t * 10) / 10 })); } catch { /* modo privado */ }
}

export function esquecerPosicao(perfilId: string): void {
  try { localStorage.removeItem(chavePosicao(perfilId)); } catch { /* modo privado */ }
}

/** Link salvo de volta em formato que o motor toca. */
export function linkDaPlaylist(p: PlaylistSalva): LinkExterno | null {
  return lerLink(p.url);
}
