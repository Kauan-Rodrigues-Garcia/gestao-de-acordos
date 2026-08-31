/**
 * Identificador persistente desta instalação do navegador.
 *
 * Um site não tem permissão para ler o hostname do Windows. Este UUID não tenta
 * adivinhá-lo: ele apenas cria um marcador estável e auditável por navegador.
 * Se o armazenamento estiver bloqueado, devolvemos null para não produzir um
 * identificador volátil e, consequentemente, alertas falsos a cada recarga.
 */
const CHAVE_DISPOSITIVO = 'gestao-acordos:dispositivo:v1';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let dispositivoEmCache: string | null | undefined;

export function obterDispositivoId(): string | null {
  if (dispositivoEmCache !== undefined) return dispositivoEmCache;
  if (typeof window === 'undefined' || !window.localStorage || !globalThis.crypto?.randomUUID) {
    dispositivoEmCache = null;
    return null;
  }

  try {
    const existente = window.localStorage.getItem(CHAVE_DISPOSITIVO);
    if (existente && UUID_V4.test(existente)) {
      dispositivoEmCache = existente.toLowerCase();
      return dispositivoEmCache;
    }

    const novo = globalThis.crypto.randomUUID().toLowerCase();
    window.localStorage.setItem(CHAVE_DISPOSITIVO, novo);
    // Confirma persistência. Sem isso, um storage que aceita setItem mas não
    // guarda o valor poderia transformar cada carregamento em um “novo PC”.
    dispositivoEmCache = window.localStorage.getItem(CHAVE_DISPOSITIVO) === novo ? novo : null;
    return dispositivoEmCache;
  } catch {
    dispositivoEmCache = null;
    return null;
  }
}

export function rotuloDispositivo(id: string | null | undefined): string {
  return id && UUID_V4.test(id) ? `PC-${id.slice(0, 8).toUpperCase()}` : 'Não identificado';
}

/** Apenas para isolar casos de teste; não faz parte da interface da aplicação. */
export function limparCacheDispositivoParaTeste(): void {
  dispositivoEmCache = undefined;
}
