/**
 * Estado da PRIMEIRA entrada no canal de presence nesta carga de página —
 * ver `ESPALHAMENTO_INICIAL_MS` em `PresenceProvider.tsx`. Fica fora do arquivo
 * do provider para ele só exportar componentes (fast refresh).
 */
let feita = false;

/** Marca a entrada inicial como feita; devolve se ela ainda não tinha sido. */
export function tomarEntradaInicial(): boolean {
  if (feita) return false;
  feita = true;
  return true;
}

/** Testes: `true` pula a espera inicial; `false` volta ao estado de página nova. */
export function __entradaInicialParaTestes(valor: boolean): void {
  feita = valor;
}
