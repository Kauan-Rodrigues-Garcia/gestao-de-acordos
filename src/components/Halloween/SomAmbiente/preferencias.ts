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

/** Os quatro que vêm de fábrica: três temas de terror e uma música. */
export const FAIXAS_EMBUTIDAS = ['halloween', 'sexta13', 'candyman', 'veigh'] as const;
export type FaixaEmbutida = (typeof FAIXAS_EMBUTIDAS)[number];

/** Onde cada uma mora — `public/sounds/`, junto da trilha da mensagem de outubro. */
export const ARQUIVOS: Record<FaixaEmbutida, string> = {
  halloween: '/sounds/halloween-john-carpenter.mp3',
  sexta13: '/sounds/halloween-sexta-feira-13.mp3',
  candyman: '/sounds/halloween-candyman.mp3',
  veigh: '/sounds/halloween-veigh-talvez-voce-precise-de-mim.mp3',
};

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

  const faixa = typeof o.faixa === 'string' && (ehEmbutida(o.faixa) || playlists.some(p => p.id === o.faixa))
    ? o.faixa
    : PADRAO.faixa;

  return { faixa, volume, tocarAoEntrar: o.tocarAoEntrar === true, repetir: o.repetir === true, playlists };
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

/** Link salvo de volta em formato que o motor toca. */
export function linkDaPlaylist(p: PlaylistSalva): LinkExterno | null {
  return lerLink(p.url);
}
