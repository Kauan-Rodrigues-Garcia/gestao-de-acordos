/*
 * qualidade.js — a qualidade automática da Guerra na Corrida (23/10/2026): o
 * chefe na página (`palcoGuerra.js`) e a guerra na janela (`naCorrida.js`).
 *
 * Três níveis:
 *   2  forte    PC folgado: um pouco mais de animação (brasas, halos, rastro);
 *   1  normal   o desenho de sempre;
 *   0  leve     sem halos, menos partículas, o chefe redesenhado ~10 vezes por
 *               segundo e a cena a 30 quadros (o modo leve do app começa aqui).
 *
 * Começa pelo que o aparelho diz (núcleos e memória) e depois MEDE: se a média
 * dos intervalos entre quadros passa de ~24 ms (menos de ~42 q/s) por 1,2 s,
 * desce um nível na hora. Para subir, precisa de 8 s seguidos com folga (quadros
 * em dia e pouco trabalho por quadro: no leve, que roda a 30 q/s, só o trabalho
 * conta), e nunca acima de onde começou. Desceu duas vezes, não sobe mais: subir
 * e descer de novo daria um tranco visível. Tudo anda no relógio: menos quadros não deixa a luta
 * mais lenta, só menos fluida.
 *
 * Aba escondida (o navegador segura os quadros) não conta: o intervalo longo de
 * quando ela volta não derruba a qualidade.
 */
const LIMITE_RUIM = 24, RUIM_MS = 1200, FOLGA = 18.5, FOLGA_MS = 8000, TRABALHO_FOLGA = [5, 8, 8];

/** O nível em que o aparelho começa: 2 só com folga clara (8+ núcleos e 8 GB+, quando o navegador diz). */
export function nivelDoAparelho(nav = typeof navigator === 'undefined' ? {} : navigator) {
  const nucleos = Number(nav.hardwareConcurrency) || 4, memoria = Number(nav.deviceMemory) || 8;
  if (nucleos <= 2 || memoria <= 2) return 0;
  if (nucleos >= 8 && memoria >= 8) return 2;
  return 1;
}

/** `leve`: o modo leve do app (começa no 0 e não sobe). `inicio`: o nível de partida (o teste injeta). */
export function criarQualidade({ leve = false, inicio = nivelDoAparelho() } = {}) {
  const teto = leve ? 0 : Math.max(0, Math.min(2, inicio));
  let nivel = teto, media = 16, trabalho = 0, ruim = 0, bom = 0, quedas = 0;
  const ouvintes = new Set();
  const mudar = n => { if (n === nivel) return; nivel = n; media = 16; trabalho = 0; ruim = bom = 0; for (const f of ouvintes) f(n); };
  return {
    get nivel() { return nivel; },
    /** O intervalo (ms) desde o último quadro desenhado e quanto o quadro levou para ser feito (ms). */
    quadro(intervalo, gasto = 0, escondida = typeof document !== 'undefined' && document.hidden) {
      if (escondida || !(intervalo > 0) || intervalo > 250) return;
      media += (Math.min(intervalo, 100) - media) * 0.1;
      trabalho += (Math.min(gasto, 100) - trabalho) * 0.1;
      const folgado = trabalho < TRABALHO_FOLGA[nivel] && (nivel === 0 || media < FOLGA);
      if (nivel > 0 && media > LIMITE_RUIM) { ruim += intervalo; bom = 0; }
      else { ruim = 0; bom = folgado ? bom + intervalo : 0; }
      if (ruim > RUIM_MS && nivel > 0) { quedas++; mudar(nivel - 1); }
      else if (bom > FOLGA_MS && nivel < teto && quedas < 2) mudar(nivel + 1);
    },
    /** Avisa quando o nível muda (devolve quem desliga o aviso). */
    aoMudar(f) { ouvintes.add(f); return () => ouvintes.delete(f); },
  };
}
