/*
 * Os alvos do Gestão e os efeitos que voltam sozinhos (Guerra na Corrida, 23/10/2026).
 *
 * Pensado para o app de verdade, com o que a Bruxa já ensinou (bruxas/chefona/
 * feiticos.ts, no arquivo morto):
 *  - o React é dono do texto: NUNCA trocar textContent/innerHTML de elemento do
 *    app. O efeito só PÕE coisas por cima: classe + atributo `data-gx-texto`, que
 *    o CSS (guerra.css) mostra num ::after. Desfazer é tirar classe e atributo; se
 *    o React redesenhar o elemento no meio, o pior que acontece é o efeito acabar
 *    antes;
 *  - nada de `filter` no #root (repinta o Gestão inteiro a cada quadro e trava PC
 *    sem placa de vídeo): efeito em peça pequena (uma linha, um cartão) ou véu
 *    por cima;
 *  - os alvos usam o MESMO atributo da Bruxa, `data-alvo-feitico`:
 *      valor   um número de dinheiro ou contagem (no app: os do AnalyticsPanel)
 *      aba     um item do menu lateral ou uma aba
 *      linha   uma linha de acordo
 *    e `data-bloco-feitico` no cartão em volta de um valor (o que a cabeçada
 *    entorta). Página sem alvo: o ataque que precisa dele não sai;
 *  - tudo é temporário, e `desfazerTudo` limpa de uma vez quando o chefe some.
 */
export const ATRIBUTO_ALVO = 'data-alvo-feitico';
export const ATRIBUTO_TEXTO = 'data-gx-texto';

/** Os alvos marcados dentro de `onde` (só os que estão na tela). */
export function alvos(onde = document) {
  const q = tipo => [...onde.querySelectorAll(`[${ATRIBUTO_ALVO}="${tipo}"]`)].filter(el => el.isConnected && el.getClientRects().length > 0);
  return { valores: () => q('valor'), abas: () => q('aba'), linhas: () => q('linha') };
}
/** O bloco que a cabeçada acerta: o cartão em volta do valor, ou o próprio alvo. */
export const blocoDe = el => el.closest('[data-bloco-feitico]') ?? el;
/** O nome para o aviso: o do cartão (`data-nome-feitico`) ou o texto do próprio alvo. */
export const nomeDe = el => (blocoDe(el).dataset.nomeFeitico || el.textContent || '').trim().slice(0, 40);

/**
 * Os efeitos ativos. `agendar(fn, ms)` é quem marca o tempo (o laboratório passa
 * um que respeita a velocidade e o recomeço).
 */
export function criarEfeitos(agendar = (fn, ms) => setTimeout(fn, ms)) {
  const ativos = new Map();
  function aplicar(el, { classes = [], texto, vars = {} } = {}, ms = 12000) {
    if (!el?.isConnected) return;
    let a = ativos.get(el); if (!a) ativos.set(el, a = { classes: new Set(), vars: new Set(), texto: false, ger: 0 });
    for (const c of classes) { el.classList.add(c); a.classes.add(c); }
    for (const [k, v] of Object.entries(vars)) { el.style.setProperty(k, v); a.vars.add(k); }
    if (texto != null) { el.setAttribute(ATRIBUTO_TEXTO, texto); el.classList.add('gx-texto'); a.texto = true; }
    const ger = ++a.ger;
    if (ms > 0) agendar(() => { if (ativos.get(el)?.ger === ger) desfazer(el); }, ms);
  }
  /** Muda o texto que está por cima (o de baixo continua o mesmo). */
  function trocarTexto(el, texto) { if (ativos.get(el)?.texto) el.setAttribute(ATRIBUTO_TEXTO, texto); }
  function desfazer(el, suave = true) {
    const a = ativos.get(el); if (!a) return; ativos.delete(el);
    if (suave) { el.classList.add('gx-conserta'); agendar(() => el.classList.remove('gx-conserta'), 1000); }
    for (const c of a.classes) el.classList.remove(c);
    for (const k of a.vars) el.style.removeProperty(k);
    if (a.texto) { el.removeAttribute(ATRIBUTO_TEXTO); el.classList.remove('gx-texto'); }
  }
  function desfazerTudo(suave = true) { for (const el of [...ativos.keys()]) desfazer(el, suave); }
  const tem = (el, c) => ativos.get(el)?.classes.has(c) ?? false;
  return { aplicar, trocarTexto, desfazer, desfazerTudo, tem };
}
