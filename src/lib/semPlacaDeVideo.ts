/**
 * semPlacaDeVideo.ts — o navegador está desenhando sem placa de vídeo?
 *
 * Visto pelo nome do renderizador do WebGL (SwiftShader, «Microsoft Basic
 * Render Driver», llvmpipe) ou pela falta de WebGL: o Chrome novo não cria
 * mais o contexto quando não há placa. Sem placa, canvas e filtros são
 * pintados pelo processador — quem anima por cima da tela se recolhe.
 *
 * Nasceu no tema de Halloween (`aguenta.ts`, 09/10/2026), que foi para
 * `arquivo-morto/halloween/` em 03/11/2026; a Sirene continua usando.
 */

const RENDERIZADOR_DE_SOFTWARE = /swiftshader|basic render|llvmpipe|softpipe|software/i;

let semPlaca: boolean | null = null;

/** Pergunta uma vez por carga. */
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
