// O cardápio e os pedidos do vídeo da cantina. O cardápio é o mesmo cadastrado
// na migration 20261022153000 (nomes, preços, ingredientes e horários); as
// pessoas e os pedidos são fictícios. O relógio do vídeo marca 11:40.

import type { Pessoa } from '../app/pessoa';

export type Categoria = 'lanches' | 'bebidas';

export type Item = {
  codigo: number;
  nome: string;
  preco: number;
  categoria: Categoria;
  ingredientes: string[];
  descricao?: string;
  pedido: string;
  /** Às 11:40: `null` = dá para pedir; senão, o aviso do cadeado. */
  bloqueio: string | null;
  foto: string;
};

const lanche = (codigo: number, nome: string, preco: number, ingredientes: string[], de: string, ate: string, foto: string, descricao?: string): Item => ({
  codigo, nome, preco, categoria: 'lanches', ingredientes, descricao, pedido: `pedidos ${de}–${ate}`, bloqueio: null, foto,
});
const bebida = (codigo: number, nome: string, preco: number, foto: string, descricao?: string): Item => ({
  codigo, nome, preco, categoria: 'bebidas', ingredientes: [], descricao, pedido: 'pedidos 13:30–15:30', bloqueio: 'Pedidos a partir das 13:30', foto,
});

export const ITENS: Item[] = [
  lanche(50, 'X-Salada', 18, ['Pão de hambúrguer', 'Hambúrguer artesanal', 'Queijo muçarela', 'Presunto', 'Alface', 'Tomate', 'Maionese caseira'], '07:00', '13:00', 'xsalada'),
  lanche(51, 'X-Frango', 18, ['Pão de hambúrguer', 'Hambúrguer de frango artesanal', 'Queijo muçarela', 'Presunto', 'Alface', 'Tomate', 'Maionese caseira'], '11:00', '14:00', 'xfrango'),
  lanche(53, 'X-Saladinha', 10, [], '11:00', '14:00', 'xsaladinha', 'O novo lanche econômico da cantina: saboroso e feito na medida para matar a fome sem pesar no bolso.'),
  lanche(59, 'X-Egg', 20, ['Pão de hambúrguer', 'Hambúrguer artesanal', 'Presunto', 'Queijo prato', 'Ovo frito', 'Alface', 'Tomate'], '07:00', '14:00', 'xegg'),
  lanche(58, 'X-Calabresa', 23, ['Pão de hambúrguer', 'Hambúrguer artesanal', 'Presunto', 'Queijo prato', 'Calabresa', 'Alface', 'Tomate'], '07:00', '14:00', 'xcalabresa'),
  lanche(52, 'Hot-Dog', 14, ['Pão de hot dog', 'Salsicha', 'Maionese caseira', 'Ketchup', 'Mostarda', 'Alface', 'Cenoura', 'Batata palha'], '07:00', '12:00', 'hotdog'),
  lanche(57, 'Hot Duplo', 17, ['Pão de hot dog', '2 salsichas', 'Maionese caseira', 'Ketchup', 'Mostarda', 'Alface', 'Cenoura', 'Batata palha'], '07:00', '14:00', 'hotduplo'),
  bebida(8, 'Refrigerante lata', 6, 'refri', 'Lata de 350 ml.'),
  bebida(9, 'Coca-Cola KS', 5, 'coca', 'Garrafinha de vidro.'),
];

/** As fotos da vitrine do cabeçalho, na ordem em que giram. */
export const VITRINE = ['xsalada', 'xfrango', 'xegg', 'hotdog', 'xcalabresa'].map((foto) => ITENS.find((i) => i.foto === foto)!);

/** As faixas de retirada às 11:40 (preparo de 15 min, faixas de 15). */
export const FAIXAS = ['12:00', '12:15', '12:30', '12:45', '13:00', '13:15', '13:30', '13:45'];

export const AVISO = {
  titulo: 'Bom dia! A cantina já está funcionando.',
  texto: 'Encomendas não retiradas serão cobradas e não haverá reembolso. Cancelamentos são aceitos com até 15 minutos de antecedência.',
};

/** Quem pede no vídeo. */
export const COLABORADORA: Pessoa = {
  nome: 'Ana Souza',
  primeiroNome: 'Ana',
  iniciais: 'AS',
  cargo: 'Operador',
  setor: 'Play 3',
  equipe: 'Equipe Águia',
  marca: 'BookPlay',
  papel: 'operador',
};

/** Quem atende: o login da cantina. */
export const BALCAO: Pessoa = {
  nome: 'Cantina',
  primeiroNome: 'Cantina',
  iniciais: 'CT',
  cargo: 'Cantina',
  setor: 'Balcão',
  equipe: '',
  marca: 'Cantina',
  papel: 'operador',
};

// ── a fila do painel ────────────────────────────────────────────────────
export type Coluna = 'novo' | 'preparando' | 'pronto' | 'encerrado';

export type Pedido = {
  id: string;
  numero: number;
  nome: string;
  setor: string;
  retirada: string;
  itens: [number, string][];
  total: number;
  /** Na coluna Encerrados: o selo. */
  selo?: 'Retirado';
};

export const PEDIDO_NOVO: Pedido = {
  id: 'p128', numero: 128, nome: COLABORADORA.nome, setor: 'Play 3 · BookPlay', retirada: '12:15',
  itens: [[1, 'X-Salada'], [1, 'X-Egg']], total: 38,
};

export const FILA: { pedido: Pedido; coluna: Coluna }[] = [
  { coluna: 'novo', pedido: { id: 'p127', numero: 127, nome: 'Bruno Lima', setor: 'Play 2 · BookPlay', retirada: '12:00', itens: [[1, 'Hot-Dog']], total: 14 } },
  { coluna: 'preparando', pedido: { id: 'p125', numero: 125, nome: 'Carla Dias', setor: 'Receptivo · BookPlay', retirada: '11:45', itens: [[2, 'X-Frango']], total: 36 } },
  { coluna: 'pronto', pedido: { id: 'p124', numero: 124, nome: 'Elisa Prado', setor: 'Play 1 · BookPlay', retirada: '11:45', itens: [[1, 'X-Saladinha']], total: 10 } },
  { coluna: 'encerrado', pedido: { id: 'p122', numero: 122, nome: 'Fábio Nunes', setor: 'Play 3 · BookPlay', retirada: '11:30', itens: [[1, 'X-Egg']], total: 20, selo: 'Retirado' } },
  { coluna: 'encerrado', pedido: { id: 'p121', numero: 121, nome: 'Gabi Torres', setor: 'Comercial · BookPlay', retirada: '11:15', itens: [[1, 'Hot-Dog']], total: 14, selo: 'Retirado' } },
];

export const PRODUCAO: [number, string][] = [[2, 'X-Frango'], [1, 'Hot-Dog']];

export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
