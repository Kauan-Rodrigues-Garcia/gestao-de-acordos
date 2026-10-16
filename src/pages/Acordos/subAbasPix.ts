/**
 * As sub-abas da tela do Pix Automático — o nome de cada uma, na ordem.
 *
 * Fora de `PixSubAbas.tsx` porque a página lê a lista para validar o `?aba=`
 * da URL, e um arquivo de componente que também exporta constantes perde o
 * recarregamento rápido do Vite. O porquê das abas está lá.
 */
export type SubAbaPix = 'registros' | 'divergencias' | 'premiacao' | 'ranking';

export const SUB_ABAS_PIX: readonly SubAbaPix[] = [
  'registros', 'divergencias', 'premiacao', 'ranking',
];
