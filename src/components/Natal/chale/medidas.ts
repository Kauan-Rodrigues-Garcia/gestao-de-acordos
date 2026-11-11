/**
 * As medidas e as cores de objeto do chalé, num arquivo sem componentes (o
 * recarregamento rápido do Vite não gosta de constante junto de componente).
 */

/** O quadro do chalé: largura, altura (o chão) e o recorte de só a lareira. */
export const L = 600;
export const A = 176;
export const SO_LAREIRA = { x: 196, w: 208 };

/** O vidro da janela, nas coordenadas do quadro. */
export const VIDRO = { x: 84.4, y: 14, w: 67.2, h: 51.2 };
/** A janela é desenhada no quadro antigo (76–160 × 30–94) e encolhida para caber atrás da poltrona. */
export const T_JANELA = 'translate(23.6 -10) scale(.8)';

export const VERMELHO = '#C8353A';
export const VERDE = '#2F7D52';
export const OURO = '#E2B04A';
