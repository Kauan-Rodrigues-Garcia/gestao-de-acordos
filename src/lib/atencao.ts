/**
 * atencao.ts — alguém está olhando para o Gestão agora? (Cleber, 09/11/2026)
 *
 * «Muita gente não usa o sistema 100% do tempo em foco: olham outras abas,
 * o ERP… Quando a pessoa não estiver olhando, pausar a maioria das coisas que
 * pesam — sem ficar feio, sem travar e sem precisar recarregar na volta.»
 *
 * ## Os três estados
 *
 *   olhando  — a janela tem o foco, ou o mouse está passando por ela.
 *   de-lado  — a aba está visível, mas a pessoa está em outra janela (o ERP
 *              na frente, o Gestão num monitor do lado) há `SEM_FOCO_MS`, sem
 *              mexer o mouse por cima.
 *   oculta   — a aba está escondida (outra aba, janela minimizada).
 *
 * Só se sai de «olhando» depois de um `blur` de verdade da janela: o
 * navegador às vezes diz que a página não tem foco sem ela ter perdido (logo
 * ao abrir, dentro de um iframe da corrida), e isso não pode pausar ninguém.
 * Mexer o mouse por cima, clicar, rolar ou digitar volta na hora.
 *
 * Inatividade do mouse NÃO conta: quem assiste uma corrida, a TV ou um painel
 * sem encostar no mouse continua olhando. A TV da parede (`/tv`) e a montagem
 * do Modo TV nunca saem de «olhando».
 *
 * ## Quem usa
 *
 *   - As animações em CSS: com ninguém olhando, `<html data-ninguem-olhando>`
 *     pausa todas (`atencao.css`) — paradas, não reiniciadas: na volta seguem
 *     de onde estavam. `data-nao-pausa` num elemento o deixa de fora (a
 *     abertura do Natal, que anda junto com timers).
 *   - Os laços de desenho (neve, boneco, trem): `ninguemOlhando()` e
 *     `ouvirAtencao`.
 *   - As releituras de dados (`useDadosVivos`, `sinais.ts`, os acordos em
 *     tempo real): com ninguém olhando, anotam que ficaram devendo e pagam UMA
 *     vez na volta (`ouvirVolta`). De lado (visível, num monitor ao lado), a
 *     volta também acontece a cada `REVISITA_MS`, para a tela não ficar velha
 *     demais para quem bate o olho.
 *   - O react-query (`App.tsx`): as consultas com `refetchInterval` param.
 *
 * Não muda: a presença online e o aviso do chat (som e notificação), que têm
 * que chegar justamente para quem está em outra janela.
 */
import { useSyncExternalStore } from 'react';
import './atencao.css';

export type Atencao = 'olhando' | 'de-lado' | 'oculta';

/** Sem foco por este tempo (e sem o mouse por cima): de lado. */
export const SEM_FOCO_MS = 10_000;
/** De lado, a cada quanto as releituras guardadas acontecem mesmo assim. */
export const REVISITA_MS = 5 * 60_000;

/** Rotas que nunca pausam: a TV da parede e a montagem do Modo TV. */
const ROTAS_SEMPRE_OLHANDO = ['/tv', '/modo-tv'];

/**
 * A conta, pura (exportada para os testes). `perdeuFoco`: o momento do último
 * `blur` da janela sem foco de volta desde então (`null` = não perdeu);
 * `ultimoSinal`: o último movimento/clique/tecla por cima da página.
 */
export function calcularAtencao(p: {
  oculta: boolean;
  isenta: boolean;
  perdeuFoco: number | null;
  ultimoSinal: number;
  agora: number;
}): Atencao {
  if (p.isenta) return 'olhando';
  if (p.oculta) return 'oculta';
  if (p.perdeuFoco === null) return 'olhando';
  const desde = Math.max(p.perdeuFoco, p.ultimoSinal);
  return p.agora - desde >= SEM_FOCO_MS ? 'de-lado' : 'olhando';
}

let estado: Atencao = 'olhando';
let perdeuFoco: number | null = null;
let ultimoSinal = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let revisita: ReturnType<typeof setInterval> | null = null;
const ouvintes = new Set<(a: Atencao) => void>();
const voltas = new Set<() => void>();

const temDocumento = typeof document !== 'undefined' && typeof window !== 'undefined';

function isenta(): boolean {
  if (!temDocumento) return true;
  const caminho = window.location.pathname;
  return ROTAS_SEMPRE_OLHANDO.some(r => caminho === r || caminho.startsWith(r + '/'));
}

function avisarVolta() {
  for (const v of voltas) {
    try { v(); } catch { /* quem ouve não derruba os outros */ }
  }
}

function recalcular() {
  if (!temDocumento) return;
  const novo = calcularAtencao({
    oculta: document.visibilityState === 'hidden',
    isenta: isenta(),
    perdeuFoco,
    ultimoSinal,
    agora: Date.now(),
  });
  // Ainda olhando, mas sem foco: confere de novo quando o prazo vencer.
  if (timer) { clearTimeout(timer); timer = null; }
  if (novo === 'olhando' && perdeuFoco !== null && document.visibilityState !== 'hidden') {
    const desde = Math.max(perdeuFoco, ultimoSinal);
    timer = setTimeout(recalcular, Math.max(50, desde + SEM_FOCO_MS - Date.now()));
  }
  if (novo === estado) return;
  const antes = estado;
  estado = novo;
  if (novo === 'olhando') document.documentElement.removeAttribute('data-ninguem-olhando');
  else document.documentElement.setAttribute('data-ninguem-olhando', novo);

  // De lado: a «volta» também acontece de tempos em tempos (a tela não envelhece demais).
  if (revisita) { clearInterval(revisita); revisita = null; }
  if (novo === 'de-lado') revisita = setInterval(avisarVolta, REVISITA_MS);

  for (const o of ouvintes) {
    try { o(novo); } catch { /* idem */ }
  }
  if (novo === 'olhando' && antes !== 'olhando') avisarVolta();
}

/** Mexeu por cima da página: está olhando (de leve: no máximo um recálculo a cada 1 s). */
function sinal() {
  const agora = Date.now();
  if (agora - ultimoSinal < 1000 && estado === 'olhando') return;
  ultimoSinal = agora;
  recalcular();
}

if (temDocumento) {
  window.addEventListener('blur', () => {
    // Confere depois do evento: o foco pode ter ido para um iframe da própria
    // página (a corrida de cavalos), e aí a pessoa continua aqui.
    setTimeout(() => {
      if (document.hasFocus()) return;
      perdeuFoco = Date.now();
      recalcular();
    }, 0);
  });
  window.addEventListener('focus', () => { perdeuFoco = null; recalcular(); });
  document.addEventListener('visibilitychange', () => {
    const voltou = document.visibilityState === 'visible';
    if (voltou && document.hasFocus()) perdeuFoco = null;
    const antes = estado;
    recalcular();
    // A aba voltou e já está olhando (sem troca de estado registrada): quem ficou devendo paga igual.
    if (voltou && estado === 'olhando' && antes === 'olhando') avisarVolta();
  });
  for (const tipo of ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const) {
    window.addEventListener(tipo, sinal, { passive: true, capture: true });
  }
  // Troca de rota (a TV é isenta): o `history` do React Router não dispara evento.
  window.addEventListener('popstate', recalcular);
}

/** Alguém olhando? */
export function atencaoAgora(): Atencao { return estado; }

/** Ninguém olhando (de lado ou oculta): pausar o que for enfeite, adiar o que for releitura. */
export function ninguemOlhando(): boolean {
  // A aba oculta é lida na hora (o evento pode não ter chegado ainda).
  return estado !== 'olhando' || (temDocumento && document.visibilityState === 'hidden');
}

/** Avisa a cada troca de estado. Devolve o cancelamento. */
export function ouvirAtencao(f: (a: Atencao) => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/**
 * A hora de pagar o que ficou devendo: a pessoa voltou a olhar, ou (de lado)
 * passou `REVISITA_MS`. Devolve o cancelamento.
 */
export function ouvirVolta(f: () => void): () => void {
  voltas.add(f);
  return () => { voltas.delete(f); };
}

/**
 * Para laços de desenho (`requestAnimationFrame`): chama `retomar` uma vez,
 * quando alguém voltar a olhar. Devolve o cancelamento.
 *
 *     if (ninguemOlhando()) { dormindo = acordarQuandoOlhar(() => { quadro = requestAnimationFrame(passo); }); return; }
 */
export function acordarQuandoOlhar(retomar: () => void): () => void {
  let feito = false;
  const uma = () => {
    if (feito || ninguemOlhando()) return;
    feito = true;
    pararA(); pararV();
    retomar();
  };
  const pararA = ouvirAtencao(uma);
  const pararV = ouvirVolta(uma);
  return () => { feito = true; pararA(); pararV(); };
}

export function useAtencao(): Atencao {
  return useSyncExternalStore(
    o => ouvirAtencao(o),
    atencaoAgora,
    () => 'olhando' as const,
  );
}

/** Só para os testes: volta ao começo. */
export function zerarAtencaoParaTeste(): void {
  perdeuFoco = null;
  ultimoSinal = 0;
  if (timer) { clearTimeout(timer); timer = null; }
  if (revisita) { clearInterval(revisita); revisita = null; }
  estado = 'olhando';
  if (temDocumento) document.documentElement.removeAttribute('data-ninguem-olhando');
}
