// Cores e fontes do vídeo — tiradas do tema escuro do app (src/index.css do
// projeto principal) e das duas logos: verde (PaguePlay, Marília) e azul
// (BookPlay, Birigui).

import { loadFont as carregarInter } from '@remotion/google-fonts/Inter';
import { loadFont as carregarMono } from '@remotion/google-fonts/JetBrainsMono';

const inter = carregarInter('normal', { weights: ['400', '500', '600', '700', '800'], subsets: ['latin', 'latin-ext'] });
const mono = carregarMono('normal', { weights: ['400', '500', '600'], subsets: ['latin', 'latin-ext'] });

export const FONTE = inter.fontFamily;
export const FONTE_MONO = mono.fontFamily;

export const COR = {
  fundo: '#05090f',
  fundo2: '#0a1420',
  app: '#0b131b',
  sidebar: '#08101a',
  card: '#0f1a24',
  cardElevado: '#132230',
  borda: '#1d2c3a',
  bordaForte: '#2a3d4f',
  texto: '#e8eef4',
  textoSuave: '#93a3b3',
  textoFraco: '#5f7183',
  azul: '#29a8e0',
  azulClaro: '#5cc8f5',
  verde: '#2e9b3e',
  verdeClaro: '#4ade80',
  ambar: '#f5a524',
  rosa: '#f43f5e',
  branco: '#ffffff',
  whatsapp: '#25d366',
  whatsappFundo: '#0b141a',
  whatsappBalao: '#005c4b',
};

export const GRADIENTE_MARCA = `linear-gradient(135deg, ${COR.verdeClaro} 0%, ${COR.azulClaro} 100%)`;

export const SELO = {
  pago: { cor: '#4ade80', fundo: 'rgba(34,197,94,0.12)', borda: 'rgba(34,197,94,0.45)' },
  pendente: { cor: '#f5a524', fundo: 'rgba(245,165,36,0.12)', borda: 'rgba(245,165,36,0.45)' },
  naoPago: { cor: '#fb7185', fundo: 'rgba(244,63,94,0.12)', borda: 'rgba(244,63,94,0.45)' },
  boleto: { cor: '#4ade80', fundo: 'rgba(34,197,94,0.08)', borda: 'rgba(34,197,94,0.35)' },
  cartao: { cor: '#fb923c', fundo: 'rgba(251,146,60,0.08)', borda: 'rgba(251,146,60,0.4)' },
};
