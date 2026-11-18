/**
 * vinculos.ts — qual setor do gestão vê cada setor do DP no Banco de horas.
 *
 * O DP escreve o setor do jeito dele («HOME RECEPTIVO», «PLAY 2 - BH»); o
 * gestão tem os seus. O vínculo é configurado na aba (`banco_horas_mapa`), e
 * é ele que a RLS lê no alcance «setor». Aqui ficam as contas puras: a lista
 * dos setores do DP, quem está sem vínculo e a sugestão pelo nome.
 */
import type { PosicaoBH, VinculoBH } from './bancoHoras.service';

export interface SetorDoDp {
  chave: string;
  empresaCodigo: string;
  empresaNome: string | null;
  setorDp: string;
  /** Pessoas no relatório mais recente em que o setor veio. */
  pessoas: number;
  /** A data desse relatório. */
  ultimaData: string;
}

export const chaveDp = (empresaCodigo: string, setorDp: string) => `${empresaCodigo}|${setorDp}`;

/** Os setores do DP que aparecem em algum relatório, pelo mais recente de cada um. */
export function setoresDoDp(posicoes: PosicaoBH[]): SetorDoDp[] {
  const m = new Map<string, SetorDoDp>();
  for (const pos of posicoes) {
    for (const s of Object.values(pos.setores)) {
      const chave = chaveDp(String(s.empresaCode), s.setor);
      const atual = m.get(chave);
      if (atual && atual.ultimaData >= pos.date) continue;
      m.set(chave, {
        chave, empresaCodigo: String(s.empresaCode), empresaNome: s.empresa, setorDp: s.setor,
        pessoas: s.people.length, ultimaData: pos.date,
      });
    }
  }
  return [...m.values()].sort((a, b) =>
    a.empresaCodigo.localeCompare(b.empresaCodigo) || a.setorDp.localeCompare(b.setorDp, 'pt-BR', { numeric: true }));
}

/** Setor do DP sem nenhum setor do gestão ligado: o líder não o enxerga. */
export function semVinculo(dp: SetorDoDp[], vinculos: VinculoBH[]): SetorDoDp[] {
  const ligados = new Set(vinculos.map(v => chaveDp(v.empresaCodigo, v.setorDp)));
  return dp.filter(s => !ligados.has(s.chave));
}

const palavras = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/**
 * O setor do gestão cujo nome aparece INTEIRO, palavra a palavra, no nome do
 * DP («Receptivo» em «HOME RECEPTIVO»). Palavra a palavra para «Play 2» não
 * casar com «PLAY 20». Empate fica com o nome mais longo (mais específico);
 * sem nenhum, `null` — melhor não sugerir do que sugerir errado.
 */
export function sugerirSetor(setorDp: string, setores: { id: string; nome: string }[]): string | null {
  const dp = palavras(setorDp);
  let melhorN = 0;
  let ids: string[] = [];
  for (const s of setores) {
    const w = palavras(s.nome);
    if (!w.length || w.length > dp.length) continue;
    let achou = false;
    for (let i = 0; i + w.length <= dp.length && !achou; i++) {
      achou = w.every((x, k) => dp[i + k] === x);
    }
    if (!achou) continue;
    if (w.length > melhorN) { melhorN = w.length; ids = [s.id]; }
    else if (w.length === melhorN) ids.push(s.id);
  }
  // Dois setores igualmente bons: não escolhe.
  return ids.length === 1 ? ids[0] : null;
}
