/**
 * musicasDoPlayer.ts — as músicas do player (Som ambiente) na comemoração.
 *
 * Pedido do Cleber, 15/10/2026: reaproveitar as faixas que já moram no app
 * (`public/sounds`), com capa, nome e artista, em vez de cada líder subir a
 * mesma música de novo. Todas numa lista só — sem a separação de temas e
 * músicas que o player faz.
 *
 * Só as de fábrica: as playlists de links do YouTube não servem, porque o
 * YouTube não deixa tocar o áudio fora do player dele nem escolher o trecho.
 *
 * A festa guarda só o id (`design.somFaixa`). Se um dia a faixa sair do app,
 * `musicaDoPlayer` devolve null e a festa toca o som do catálogo no lugar.
 */
import {
  ARQUIVOS, FAIXAS_EMBUTIDAS, GANHO, MUSICAS, TEMAS_DE_TERROR, type FaixaEmbutida,
} from '@/components/Halloween/SomAmbiente/preferencias';
import { EMBUTIDAS } from '@/components/Halloween/SomAmbiente/faixas';

export interface MusicaDoPlayer {
  id:        FaixaEmbutida;
  nome:      string;
  descricao: string;
  capa:      string | null;
  url:       string;
  /** Ganho de loudness do player: com ele, todas soam na mesma altura. */
  ganho:     number;
}

/** As músicas primeiro, os temas depois — mas uma lista só. */
const ORDEM: readonly FaixaEmbutida[] = [...MUSICAS, ...TEMAS_DE_TERROR];

export const MUSICAS_DO_PLAYER: readonly MusicaDoPlayer[] = ORDEM
  .filter((id) => (FAIXAS_EMBUTIDAS as readonly string[]).includes(id))
  .map((id) => ({
    id,
    nome:      EMBUTIDAS[id].nome,
    descricao: EMBUTIDAS[id].descricao,
    capa:      EMBUTIDAS[id].capa ?? null,
    url:       ARQUIVOS[id],
    ganho:     GANHO[id] ?? 1,
  }));

export function musicaDoPlayer(id: string | null | undefined): MusicaDoPlayer | null {
  if (!id) return null;
  return MUSICAS_DO_PLAYER.find((m) => m.id === id) ?? null;
}

/**
 * Volume da festa já com o ganho da faixa, no 0–100 do player de comemoração.
 * Os 15% recomendados soam iguais em qualquer música do player.
 */
export function volumeComGanho(volume: number, ganho: number): number {
  if (!Number.isFinite(volume)) return 0;
  const g = Number.isFinite(ganho) && ganho > 0 ? ganho : 1;
  return Math.min(100, Math.max(0, Math.round(volume * g)));
}
