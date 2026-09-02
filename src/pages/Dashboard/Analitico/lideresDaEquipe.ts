/**
 * lideresDaEquipe.ts — quem lidera cada equipe, numa regra só.
 *
 * ## O defeito que isto corrige
 *
 * Relato: "a equipe mostrava a foto de 2 líderes; removi um e continuou com as
 * duas. Tive que apagar as equipes do setor e refazer tudo."
 *
 * A tela montava a lista **unindo três fontes**, sem nenhuma mandar na outra:
 *
 *   1. `perfis.equipe_id` — o modelo LEGADO: a equipe está gravada no cadastro
 *      do próprio líder;
 *   2. `equipe_operadores_clones` — líder emprestado a outra equipe;
 *   3. `equipe_lideres` — o modelo NOVO e explícito (migration `20260725b`),
 *      que é o único que a tela de Equipes edita.
 *
 * União significa que remover o vínculo explícito não removia o legado. Nos
 * dados de 18/08/2026, a equipe **Bryan** (setor Receptivo) tinha
 * `equipe_lideres` = *Bryan Queiroz* e `perfis.equipe_id` = *Kauan Rodrigues*:
 * duas fotos, e a segunda sem botão nenhum que a tirasse — porque a tela só
 * mexe em `equipe_lideres`, e ali o Kauan nunca esteve.
 *
 * Apagar e recriar as equipes "resolvia" porque zerava o `perfis.equipe_id` que
 * apontava para a equipe antiga.
 *
 * ## A regra
 *
 * **O explícito manda; o legado é reserva, não acréscimo.**
 *
 *   • equipe COM vínculo em `equipe_lideres` → a lista é essa, e só essa;
 *   • equipe SEM nenhum vínculo → cai no legado (`perfis.equipe_id`) mais os
 *     clones, como antes;
 *   • quem JÁ lidera alguma equipe explicitamente não entra pela reserva em
 *     lugar nenhum — 02/09/2026, ver `jaLideraAlgo` mais abaixo.
 *
 * A reserva não pode sumir: 22 dos 31 líderes da BookPlay não estão em
 * `equipe_lideres` (ver `desempenhoDia.service.ts`), e removê-la esvaziaria o
 * card de quem mais usa o painel. O que ela não pode é **somar** por cima de uma
 * decisão explícita.
 *
 * É a mesma forma do acerto de Direto/Extra do mesmo dia: quando existem dois
 * níveis de configuração, o mais específico decide — não se juntam os dois.
 */

export interface LiderInfo {
  nome: string;
  foto_url: string | null;
}

/** Perfil com cargo de liderança, com a equipe de origem do cadastro. */
export interface PerfilLider {
  id: string;
  nome: string;
  foto_url: string | null;
  /** `perfis.equipe_id` — o modelo legado. */
  equipe_id: string | null;
}

export interface EntradaLideres {
  /** Todos os perfis com cargo de liderança da empresa. */
  lideres: ReadonlyArray<PerfilLider>;
  /** Vínculos de `equipe_lideres` — o modelo explícito. */
  explicitos: ReadonlyArray<{ equipe_id: string; lider_id: string }>;
  /** Vínculos de `equipe_operadores_clones` (nem todo clone é líder). */
  clones: ReadonlyArray<{ equipe_id: string; operador_id: string }>;
}

/**
 * `equipe_id` → líderes a exibir.
 *
 * Deduplica por **id**, não por nome: dois homônimos são duas pessoas, e a
 * versão anterior desta lógica escondia uma delas.
 */
export function lideresDaEquipe(entrada: EntradaLideres): Record<string, LiderInfo[]> {
  const { lideres, explicitos, clones } = entrada;

  const porId = new Map<string, PerfilLider>();
  for (const l of lideres) porId.set(l.id, l);

  /** equipe → ids, na ordem em que apareceram, sem repetir. */
  const acumular = (
    destino: Map<string, string[]>, equipeId: string | null, liderId: string,
  ) => {
    if (!equipeId || !porId.has(liderId)) return;
    const lista = destino.get(equipeId);
    if (!lista) { destino.set(equipeId, [liderId]); return; }
    if (!lista.includes(liderId)) lista.push(liderId);
  };

  const doExplicito = new Map<string, string[]>();
  for (const e of explicitos) acumular(doExplicito, e.equipe_id, e.lider_id);

  /**
   * Quem já tem vínculo explícito em ALGUMA equipe.
   *
   * A reserva não pode pôr essa pessoa numa equipe que ela não lidera. Trocar a
   * liderança entre duas equipes só reescreve `equipe_lideres`; o
   * `perfis.equipe_id` do líder continua apontando para a equipe ANTIGA, e a
   * tela de Equipes nem mostra esse campo (ela esconde líderes das listas de
   * membros). Sem esta linha, a equipe antiga volta a exibir a foto dele assim
   * que ficar sem vínculo explícito próprio — a "foto do líder antigo".
   *
   * Medido na BookPlay, Play 4, em 02/09/2026: Maria Oliveira lidera
   * "Maria - Capitã" e está presa em "Digital Bruno" pelo cadastro.
   */
  const jaLideraAlgo = new Set(explicitos.map(e => e.lider_id));

  const daReserva = new Map<string, string[]>();
  for (const l of lideres) {
    if (jaLideraAlgo.has(l.id)) continue;
    acumular(daReserva, l.equipe_id, l.id);
  }
  // Clone só entra se a pessoa for líder — `porId` já filtra isso.
  for (const c of clones) {
    if (jaLideraAlgo.has(c.operador_id)) continue;
    acumular(daReserva, c.equipe_id, c.operador_id);
  }

  const saida: Record<string, LiderInfo[]> = {};
  // A reserva primeiro, para o explícito sobrescrever a equipe inteira quando
  // existir. Sobrescrever, e não completar: é esse o ponto da correção.
  for (const [equipeId, ids] of daReserva) {
    saida[equipeId] = ids.map(id => porId.get(id)!).map(p => ({ nome: p.nome, foto_url: p.foto_url }));
  }
  for (const [equipeId, ids] of doExplicito) {
    saida[equipeId] = ids.map(id => porId.get(id)!).map(p => ({ nome: p.nome, foto_url: p.foto_url }));
  }
  return saida;
}
