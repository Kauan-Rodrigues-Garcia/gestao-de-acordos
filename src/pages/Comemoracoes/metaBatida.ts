/**
 * metaBatida.ts — quem bateu a meta do mês, e a comemoração pronta para ele.
 *
 * Pedido de 06/10/2026: o líder não devia ter de descobrir sozinho quem bateu
 * a meta nem montar o card do zero toda vez. A aba mostra quem bateu (em
 * verde) e já traz um "pre-save": um modelo de "meta batida" montado, que dá
 * para mandar como está ou abrir no editor e mexer.
 *
 * "Bateu" é a 1ª meta individual do mês (`metas`, tipo operador, gravada em
 * bruto) contra o recebido no analítico (`total_recebido`, também bruto) — o
 * mesmo cruzamento que o painel do Pix Automático faz para saber quem dobra.
 *
 * Puro e sem React, como o `modelos.ts`, para ter teste sem montar tela.
 */
import type { EfeitoId, SomId } from './catalogo';
import type { AnimTextoId } from './animacoesTexto';
import type { ModeloId } from './modelos';
import { VOLUME_PADRAO } from './volume';

export interface OperadorMeta {
  id:        string;
  nome:      string;
  foto_url:  string | null;
  meta:      number;
  recebido:  number;
  /** recebido ÷ meta, em % inteiro (112 = 112%). */
  pct:       number;
  bateu:     boolean;
}

/**
 * Cruza as metas do mês com o recebido de cada um.
 *
 * Só entra quem tem meta maior que zero (sem meta não há "bater") e quem está
 * em `pessoas` — a lista que a tela já enxerga, para não aparecer nome que o
 * líder não teria como homenagear. Ordem: quem bateu primeiro, depois pela %.
 */
export function cruzarMetas(
  metas: { referencia_id: string; meta_valor: number | string | null }[],
  recebidos: { operador_id: string; total_recebido: number | string | null }[],
  pessoas: { id: string; nome: string; foto_url: string | null }[],
): OperadorMeta[] {
  const recebidoPor = new Map<string, number>();
  for (const r of recebidos) {
    recebidoPor.set(r.operador_id, (recebidoPor.get(r.operador_id) ?? 0) + (Number(r.total_recebido) || 0));
  }
  const pessoaPor = new Map(pessoas.map((p) => [p.id, p]));

  const saida: OperadorMeta[] = [];
  for (const m of metas) {
    const meta = Number(m.meta_valor) || 0;
    const pessoa = pessoaPor.get(m.referencia_id);
    if (meta <= 0 || !pessoa) continue;
    const recebido = recebidoPor.get(m.referencia_id) ?? 0;
    saida.push({
      id: pessoa.id, nome: pessoa.nome, foto_url: pessoa.foto_url,
      meta, recebido,
      pct: Math.floor((recebido / meta) * 100),
      bateu: recebido >= meta,
    });
  }

  return saida.sort((a, b) =>
    Number(b.bateu) - Number(a.bateu) || b.pct - a.pct || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** "Ana Paula Souza" → "Ana Paula" — o nome como se chama no corredor. */
function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] ?? nome;
  // Partícula no meio ("Maria de Souza") fica feia sozinha: pula para o 1º só.
  const segundo = partes[1];
  return /^(d[aeo]s?|e)$/i.test(segundo) ? partes[0] : `${partes[0]} ${segundo}`;
}

/** O que o pre-save "meta batida" preenche. */
export interface PresetMetaBatida {
  titulo:    string;
  mensagem:  string;
  efeito:    EfeitoId;
  som:       SomId;
  animTexto: AnimTextoId;
  modelo:    ModeloId;
  duracaoS:  number;
  volume:    number;
}

/**
 * O modelo pronto de meta batida.
 *
 * Confete + "Conquista" (o acorde de fase concluída) + título entrando com mola
 * é a combinação mais festiva do catálogo sem ser barulhenta. Volume no padrão
 * baixo da aba: a festa passa por cima de gente em ligação (`volume.ts`).
 *
 * O percentual entra na mensagem só quando passou de 100 — "bateu 100% da
 * meta" é redundante, "bateu 118%" é notícia. Valor em reais não entra: o card
 * aparece para o setor inteiro.
 */
export function presetMetaBatida(
  pessoas: { nome: string; pct?: number }[],
  /** Só o nome do mês: "Outubro". */
  nomeDoMes: string,
): PresetMetaBatida {
  const mes = nomeDoMes.toLocaleLowerCase('pt-BR');
  let mensagem: string;

  if (pessoas.length === 1) {
    const { nome, pct } = pessoas[0];
    const quanto = pct && pct > 100 ? `${pct}% da meta` : 'a meta';
    mensagem = `${nomeCurto(nome)} bateu ${quanto} de ${mes}! Dedicação que inspira o time todo. 🏆`;
  } else {
    mensagem = `Meta de ${mes} batida! Dedicação que inspira o time todo. 🏆`;
  }

  return {
    titulo:    'META BATIDA!',
    mensagem:  mensagem.slice(0, 140),
    efeito:    'confete',
    som:       'conquista',
    animTexto: 'pop',
    modelo:    'midia_topo',
    duracaoS:  15,
    volume:    VOLUME_PADRAO,
  };
}

/**
 * Quem já ganhou comemoração neste mês — para o líder não mandar duas vezes
 * sem querer. Cancelada não conta: foi desfeita.
 */
export function jaComemoradosNoMes(
  comemoracoes: { inicia_em: string; cancelada_em: string | null; homenageados: { id: string }[] }[],
  mes: string,
): Set<string> {
  const ids = new Set<string>();
  for (const c of comemoracoes) {
    if (c.cancelada_em) continue;
    // `inicia_em` vem em UTC: a festa das 22h do dia 31 já é "dia 1" lá.
    const d = new Date(c.inicia_em);
    const mesDela = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (mesDela !== mes) continue;
    for (const h of c.homenageados) ids.add(h.id);
  }
  return ids;
}
