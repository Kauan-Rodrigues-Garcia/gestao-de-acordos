/**
 * aguenta.ts — o tema de Halloween se ajusta à máquina sozinho (09/10/2026).
 *
 * Pedido: «o tema de Halloween no Analítico está pesando em PC fraco». Medido
 * na bancada `playground/desempenho` (CPU 4× mais lenta, Chrome sem placa de
 * vídeo): o Analítico caía para 14 quadros por segundo, com a thread
 * principal 100% ocupada — sem placa de vídeo, o canvas da fumaça é pintado
 * pixel a pixel pelo processador. Com placa, o mesmo canvas custa quase nada.
 *
 * O modo leve (`lib/modoLeve.ts`) já resolve, mas depende de a pessoa aceitar
 * a oferta — e quem disse «Agora não» fica sete dias com a tela travando. Aqui
 * é o tema que se recolhe, sem perguntar e sem mexer em mais nada do sistema:
 * fica só o que é parado (teias, chapéus, marca), como no modo leve.
 *
 * Dois sinais, e basta um:
 *
 *   - **Sem placa de vídeo** — o navegador desenha tudo no processador. Visto
 *     pelo nome do renderizador do WebGL (SwiftShader, «Microsoft Basic Render
 *     Driver», llvmpipe) ou pela falta de WebGL: o Chrome novo não cria mais o
 *     contexto quando não há placa.
 *   - **A tela sufocou** — com as camadas animadas na tela, quadros longos em
 *     sequência (`halloweenSufocou`). Uma carga pesada isolada não conta.
 *
 * Vale para a aba até ela fechar (`sessionStorage`): um F5 não volta a pesar,
 * e amanhã a máquina tem outra chance.
 */
import { useEffect, useSyncExternalStore } from 'react';

// ── Sem placa de vídeo ──────────────────────────────────────────────────────

const RENDERIZADOR_DE_SOFTWARE = /swiftshader|basic render|llvmpipe|softpipe|software/i;

let semPlaca: boolean | null = null;

/** O navegador está desenhando sem placa de vídeo? Pergunta uma vez por carga. */
export function semPlacaDeVideo(): boolean {
  if (semPlaca !== null) return semPlaca;
  semPlaca = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) {
      semPlaca = true;
      return semPlaca;
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const nome = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    semPlaca = RENDERIZADOR_DE_SOFTWARE.test(nome);
    // O contexto só existiu para a pergunta: devolve a memória da placa já.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    semPlaca = false;
  }
  return semPlaca;
}

// ── A tela sufocou ──────────────────────────────────────────────────────────

/** Um quadro longo: quando terminou (ms, relógio da página) e quanto durou. */
export interface QuadroLongo {
  fim: number;
  duracao: number;
}

/** A janela em que os quadros longos são somados. */
export const JANELA_SUFOCO_MS = 20_000;

/**
 * Hora de parar o tema? Pede quantidade E tempo somado na janela: 8 quadros de
 * 50 ms ou mais, somando 1,2 s em 20 s. Abrir uma tela pesada dá um quadro
 * longo e não é máquina fraca; o Analítico sem placa dava 111 em 8 s.
 */
export function halloweenSufocou(quadros: readonly QuadroLongo[], agora: number): boolean {
  let qtd = 0;
  let soma = 0;
  for (const q of quadros) {
    if (q.duracao < 50 || agora - q.fim > JANELA_SUFOCO_MS) continue;
    qtd += 1;
    soma += q.duracao;
  }
  return qtd >= 8 && soma >= 1_200;
}

const CHAVE = 'gestao:halloween-parado';

function lerSufocado(): boolean {
  try { return sessionStorage.getItem(CHAVE) === '1'; } catch { return false; }
}

let sufocado = typeof window !== 'undefined' ? lerSufocado() : false;
const ouvintes = new Set<() => void>();

function marcarSufocado(): void {
  if (sufocado) return;
  sufocado = true;
  try { sessionStorage.setItem(CHAVE, '1'); } catch { /* modo privado: vale até recarregar */ }
  for (const o of ouvintes) {
    try { o(); } catch { /* quem ouve não derruba o aviso */ }
  }
}

function assinar(o: () => void) {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

/**
 * O tema deve ficar só com o que é parado nesta máquina? Com o tema desligado
 * a resposta é `false` sem perguntar nada à placa — quem não vê o Halloween
 * não paga nem o contexto de WebGL da pergunta.
 */
export function useHalloweenParado(ligado: boolean): boolean {
  const sufocou = useSyncExternalStore(assinar, () => sufocado, () => false);
  return ligado && (sufocou || semPlacaDeVideo());
}

/** Espera depois de as camadas montarem: a primeira pintura sempre pesa. */
const CARENCIA_MS = 8_000;

/**
 * Vigia os quadros longos enquanto as camadas animadas estão na tela. Quem
 * mede é o navegador (`long-animation-frame`), sem laço nosso rodando — vigiar
 * com `requestAnimationFrame` gastaria processador justamente em quem já está
 * sem. Navegador sem a medida (Firefox, Safari) fica só com o sinal da placa.
 */
export function useVigiaDoHalloween(ativo: boolean): void {
  useEffect(() => {
    if (!ativo || sufocado) return;
    if (typeof PerformanceObserver === 'undefined') return;
    if (!(PerformanceObserver.supportedEntryTypes ?? []).includes('long-animation-frame')) return;

    const inicio = performance.now();
    let quadros: QuadroLongo[] = [];
    const observador = new PerformanceObserver(lista => {
      // Aba escondida não conta: o navegador segura a aba de fundo.
      if (document.visibilityState !== 'visible') return;
      const agora = performance.now();
      for (const e of lista.getEntries()) quadros.push({ fim: e.startTime + e.duration, duracao: e.duration });
      quadros = quadros.filter(q => agora - q.fim <= JANELA_SUFOCO_MS);
      if (agora - inicio < CARENCIA_MS) return;
      if (halloweenSufocou(quadros, agora)) {
        observador.disconnect();
        marcarSufocado();
      }
    });
    try {
      observador.observe({ type: 'long-animation-frame', buffered: false });
    } catch {
      return;
    }
    return () => observador.disconnect();
  }, [ativo]);
}
