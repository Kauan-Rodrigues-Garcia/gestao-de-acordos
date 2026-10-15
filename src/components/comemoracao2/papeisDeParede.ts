/**
 * papeisDeParede.ts — os fundos do card da Comemoração 2.0.
 *
 * Desenhados em CSS (gradientes empilhados), não em arquivo de imagem: carregam
 * no mesmo instante em que o card aparece, ficam nítidos em qualquer monitor e
 * não ocupam o Storage. Um papel de parede é uma string de `background` mais as
 * cores que o texto precisa para ser lido em cima dele — quem escolhe o fundo
 * não tem de escolher a cor da letra.
 *
 * Organizados por tema para a escolha caber num olhar: o tema é a primeira
 * pergunta ("é festa ou é coisa séria?"), o papel é a segunda.
 *
 * Puro, sem React: a tela, o overlay e o teste leem a mesma lista.
 */

export type TemaId = 'conquista' | 'festa' | 'noite' | 'natureza' | 'elegante' | 'datas';

export const TEMAS: readonly { id: TemaId; nome: string }[] = [
  { id: 'conquista', nome: 'Conquista' },
  { id: 'festa',     nome: 'Festa' },
  { id: 'noite',     nome: 'Noite' },
  { id: 'natureza',  nome: 'Natureza' },
  { id: 'elegante',  nome: 'Elegante' },
  { id: 'datas',     nome: 'Datas' },
];

export interface PapelDeParede {
  id:      string;
  nome:    string;
  tema:    TemaId;
  /** Valor de `background`, camadas de cima para baixo. */
  fundo:   string;
  /** Cor do texto corrido (mensagem, nomes). */
  tinta:   string;
  /** Cor de apoio: selo, barra de tempo, contorno das fotos. */
  destaque: string;
  /** Preenchimento do título. Gradiente vira texto "metálico"; ausente = `tinta`. */
  titulo?: string;
  /** Sombra do texto — mais forte nos fundos movimentados. */
  sombra:  string;
  /** Fundo claro: o selo inverte e as bordas escurecem. */
  claro?:  boolean;
}

const SOMBRA_ESCURO = '0 2px 14px rgba(0,0,0,.45)';
const SOMBRA_FORTE  = '0 2px 4px rgba(0,0,0,.35), 0 4px 22px rgba(0,0,0,.55)';
const SOMBRA_CLARO  = '0 1px 0 rgba(255,255,255,.6)';

const OURO = 'linear-gradient(180deg,#FFF5CF 0%,#F6C453 52%,#C2841A 100%)';

export const PAPEIS_DE_PAREDE: readonly PapelDeParede[] = [
  // ── Conquista ─────────────────────────────────────────────────────────────
  {
    id: 'ouro-real', nome: 'Ouro real', tema: 'conquista',
    fundo: [
      'radial-gradient(circle at 50% 36%, rgba(255,214,110,.55) 0%, rgba(255,214,110,0) 52%)',
      'repeating-conic-gradient(from 0deg at 50% 36%, rgba(255,222,140,.13) 0deg 5deg, rgba(0,0,0,0) 5deg 16deg)',
      'linear-gradient(165deg,#4A2C06 0%,#261502 100%)',
    ].join(','),
    tinta: '#FFF6E2', destaque: '#F6C453', titulo: OURO, sombra: SOMBRA_FORTE,
  },
  {
    id: 'podio', nome: 'Pódio', tema: 'conquista',
    fundo: [
      'radial-gradient(ellipse at 50% 110%, rgba(246,196,83,.35) 0%, rgba(246,196,83,0) 55%)',
      'repeating-linear-gradient(135deg, rgba(246,196,83,.09) 0 2px, rgba(0,0,0,0) 2px 24px)',
      'linear-gradient(160deg,#0c2142 0%,#132f5c 60%,#0a1a35 100%)',
    ].join(','),
    tinta: '#F2F6FF', destaque: '#F6C453', titulo: OURO, sombra: SOMBRA_ESCURO,
  },
  {
    id: 'esmeralda', nome: 'Esmeralda', tema: 'conquista',
    fundo: [
      'radial-gradient(circle at 50% 0%, rgba(160,255,210,.28) 0%, rgba(160,255,210,0) 60%)',
      'repeating-linear-gradient(45deg, rgba(255,255,255,.04) 0 1px, rgba(0,0,0,0) 1px 18px)',
      'repeating-linear-gradient(-45deg, rgba(255,255,255,.04) 0 1px, rgba(0,0,0,0) 1px 18px)',
      'linear-gradient(170deg,#0f6b48 0%,#073826 100%)',
    ].join(','),
    tinta: '#ECFFF5', destaque: '#E9C46A', titulo: OURO, sombra: SOMBRA_ESCURO,
  },

  // ── Festa ─────────────────────────────────────────────────────────────────
  {
    id: 'confete', nome: 'Confete', tema: 'festa',
    fundo: [
      'radial-gradient(circle, rgba(255,209,102,.75) 2.6px, rgba(0,0,0,0) 3.2px) 0 0 / 64px 64px',
      'radial-gradient(circle, rgba(6,214,160,.65) 2.2px, rgba(0,0,0,0) 2.8px) 31px 23px / 72px 72px',
      'radial-gradient(circle, rgba(255,255,255,.45) 1.7px, rgba(0,0,0,0) 2.2px) 15px 41px / 56px 56px',
      'linear-gradient(135deg,#FF4D8D 0%,#7B5CFF 100%)',
    ].join(','),
    tinta: '#FFFFFF', destaque: '#FFD166', sombra: SOMBRA_FORTE,
  },
  {
    id: 'serpentina', nome: 'Serpentina', tema: 'festa',
    fundo: [
      'repeating-radial-gradient(circle at 0% 100%, rgba(255,255,255,.16) 0 7px, rgba(0,0,0,0) 7px 30px)',
      'repeating-radial-gradient(circle at 100% 0%, rgba(255,255,255,.10) 0 5px, rgba(0,0,0,0) 5px 26px)',
      'linear-gradient(120deg,#FF8A00 0%,#FF3D6E 100%)',
    ].join(','),
    tinta: '#FFFFFF', destaque: '#FFF1A8', sombra: SOMBRA_FORTE,
  },
  {
    id: 'carnaval', nome: 'Carnaval', tema: 'festa',
    fundo: [
      'radial-gradient(circle at 20% 25%, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 30%)',
      'repeating-linear-gradient(100deg, rgba(255,255,255,.07) 0 14px, rgba(0,0,0,0) 14px 28px)',
      'linear-gradient(90deg,#00B4D8 0%,#7209B7 50%,#F72585 100%)',
    ].join(','),
    tinta: '#FFFFFF', destaque: '#FFE066', sombra: SOMBRA_FORTE,
  },

  // ── Noite ─────────────────────────────────────────────────────────────────
  {
    id: 'neon', nome: 'Neon', tema: 'noite',
    fundo: [
      'radial-gradient(circle at 14% 18%, rgba(255,0,153,.45) 0%, rgba(255,0,153,0) 40%)',
      'radial-gradient(circle at 86% 82%, rgba(0,229,255,.40) 0%, rgba(0,229,255,0) 45%)',
      'linear-gradient(rgba(255,255,255,.05) 1px, rgba(0,0,0,0) 1px) 0 0 / 28px 28px',
      'linear-gradient(90deg, rgba(255,255,255,.05) 1px, rgba(0,0,0,0) 1px) 0 0 / 28px 28px',
      'linear-gradient(#0B0716,#0B0716)',
    ].join(','),
    tinta: '#F5F0FF', destaque: '#00E5FF',
    titulo: 'linear-gradient(90deg,#FF5CC8 0%,#FFFFFF 50%,#5CEBFF 100%)', sombra: SOMBRA_ESCURO,
  },
  {
    id: 'galaxia', nome: 'Galáxia', tema: 'noite',
    fundo: [
      'radial-gradient(circle, rgba(255,255,255,.9) 1px, rgba(0,0,0,0) 1.6px) 0 0 / 61px 61px',
      'radial-gradient(circle, rgba(255,255,255,.6) .8px, rgba(0,0,0,0) 1.3px) 19px 33px / 43px 43px',
      'radial-gradient(ellipse at 70% 30%, rgba(155,93,229,.55) 0%, rgba(155,93,229,0) 50%)',
      'radial-gradient(ellipse at 25% 80%, rgba(241,91,181,.35) 0%, rgba(241,91,181,0) 45%)',
      'linear-gradient(180deg,#120A2A 0%,#05030F 100%)',
    ].join(','),
    tinta: '#F3EEFF', destaque: '#C9A7FF', sombra: SOMBRA_ESCURO,
  },
  {
    id: 'aurora', nome: 'Aurora', tema: 'noite',
    fundo: [
      'radial-gradient(ellipse at 30% 0%, rgba(72,255,180,.45) 0%, rgba(72,255,180,0) 55%)',
      'radial-gradient(ellipse at 80% 10%, rgba(80,170,255,.40) 0%, rgba(80,170,255,0) 50%)',
      'linear-gradient(180deg,#06243A 0%,#020E18 100%)',
    ].join(','),
    tinta: '#EAFBFF', destaque: '#6BFFC8', sombra: SOMBRA_ESCURO,
  },

  // ── Natureza ──────────────────────────────────────────────────────────────
  {
    id: 'por-do-sol', nome: 'Pôr do sol', tema: 'natureza',
    fundo: [
      'radial-gradient(circle at 50% 78%, rgba(255,236,160,.85) 0%, rgba(255,236,160,0) 22%)',
      'linear-gradient(180deg,#FF9A5A 0%,#FF5E62 48%,#6A3093 100%)',
    ].join(','),
    tinta: '#FFFFFF', destaque: '#FFE7A0', sombra: SOMBRA_FORTE,
  },
  {
    id: 'oceano', nome: 'Oceano', tema: 'natureza',
    fundo: [
      'repeating-radial-gradient(ellipse at 50% 140%, rgba(255,255,255,.09) 0 3px, rgba(0,0,0,0) 3px 22px)',
      'linear-gradient(180deg,#0E7C9B 0%,#0B3D63 100%)',
    ].join(','),
    tinta: '#F0FCFF', destaque: '#7FF0FF', sombra: SOMBRA_ESCURO,
  },
  {
    id: 'floresta', nome: 'Floresta', tema: 'natureza',
    fundo: [
      'radial-gradient(circle at 80% 15%, rgba(255,240,170,.35) 0%, rgba(255,240,170,0) 35%)',
      'repeating-linear-gradient(75deg, rgba(255,255,255,.04) 0 2px, rgba(0,0,0,0) 2px 16px)',
      'linear-gradient(180deg,#2F6B3A 0%,#143220 100%)',
    ].join(','),
    tinta: '#F3FFF0', destaque: '#D9F99D', sombra: SOMBRA_ESCURO,
  },

  // ── Elegante ──────────────────────────────────────────────────────────────
  {
    id: 'grafite', nome: 'Grafite', tema: 'elegante',
    fundo: [
      'radial-gradient(circle at 50% 0%, rgba(231,199,123,.18) 0%, rgba(231,199,123,0) 55%)',
      'repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, rgba(0,0,0,0) 1px 4px)',
      'linear-gradient(150deg,#22262C 0%,#121417 100%)',
    ].join(','),
    tinta: '#F1EFEA', destaque: '#E7C77B', titulo: OURO, sombra: SOMBRA_ESCURO,
  },
  {
    id: 'marmore', nome: 'Mármore', tema: 'elegante',
    fundo: [
      'linear-gradient(118deg, rgba(0,0,0,0) 18%, rgba(140,140,150,.16) 19%, rgba(0,0,0,0) 21.5%)',
      'linear-gradient(132deg, rgba(0,0,0,0) 61%, rgba(150,140,130,.13) 62.5%, rgba(0,0,0,0) 64%)',
      'linear-gradient(108deg, rgba(0,0,0,0) 83%, rgba(140,140,150,.10) 84%, rgba(0,0,0,0) 85.5%)',
      'linear-gradient(160deg,#FAFAF8 0%,#E9E7E3 100%)',
    ].join(','),
    tinta: '#24262B', destaque: '#A07A2C',
    titulo: 'linear-gradient(180deg,#3A3D44 0%,#121316 100%)', sombra: SOMBRA_CLARO, claro: true,
  },
  {
    id: 'lavanda', nome: 'Lavanda', tema: 'elegante',
    fundo: [
      'radial-gradient(circle at 85% 20%, rgba(255,255,255,.7) 0%, rgba(255,255,255,0) 35%)',
      'linear-gradient(140deg,#EDE4FF 0%,#D8C6FF 55%,#F7D9EC 100%)',
    ].join(','),
    tinta: '#2A1B47', destaque: '#7A4FE0',
    titulo: 'linear-gradient(180deg,#5B33C9 0%,#2A1B47 100%)', sombra: SOMBRA_CLARO, claro: true,
  },

  // ── Datas ─────────────────────────────────────────────────────────────────
  {
    id: 'natal', nome: 'Natal', tema: 'datas',
    fundo: [
      'radial-gradient(circle, rgba(255,255,255,.85) 1.6px, rgba(0,0,0,0) 2.2px) 0 0 / 34px 34px',
      'radial-gradient(circle, rgba(255,255,255,.55) 1.1px, rgba(0,0,0,0) 1.7px) 17px 13px / 29px 29px',
      'radial-gradient(ellipse at 50% 120%, rgba(30,120,60,.65) 0%, rgba(30,120,60,0) 55%)',
      'linear-gradient(180deg,#A3141F 0%,#5E0A12 100%)',
    ].join(','),
    tinta: '#FFFFFF', destaque: '#F6C453', titulo: OURO, sombra: SOMBRA_FORTE,
  },
  {
    id: 'ano-novo', nome: 'Ano novo', tema: 'datas',
    fundo: [
      'repeating-conic-gradient(from 0deg at 22% 30%, rgba(255,215,120,.14) 0deg 3deg, rgba(0,0,0,0) 3deg 15deg)',
      'repeating-conic-gradient(from 0deg at 78% 24%, rgba(255,255,255,.10) 0deg 3deg, rgba(0,0,0,0) 3deg 18deg)',
      'linear-gradient(180deg,#0D1330 0%,#03050F 100%)',
    ].join(','),
    tinta: '#FFFFFF', destaque: '#FFD36B', titulo: OURO, sombra: SOMBRA_ESCURO,
  },
  {
    id: 'halloween', nome: 'Halloween', tema: 'datas',
    fundo: [
      'radial-gradient(circle at 78% 22%, rgba(255,230,170,.75) 0%, rgba(255,230,170,0) 13%)',
      'radial-gradient(ellipse at 50% 120%, rgba(255,120,0,.55) 0%, rgba(255,120,0,0) 55%)',
      'linear-gradient(180deg,#241238 0%,#0E0716 100%)',
    ].join(','),
    tinta: '#FFF3E6', destaque: '#FF8A1F',
    titulo: 'linear-gradient(180deg,#FFD08A 0%,#FF7A00 100%)', sombra: SOMBRA_ESCURO,
  },
];

export const PAPEL_PADRAO = 'ouro-real';

const POR_ID = new Map(PAPEIS_DE_PAREDE.map((p) => [p.id, p]));

/** Papel guardado no banco → papel que sabemos desenhar. Desconhecido cai no padrão. */
export function papelDeParede(id: string | null | undefined): PapelDeParede {
  return POR_ID.get(id ?? '') ?? (POR_ID.get(PAPEL_PADRAO) as PapelDeParede);
}

export function papelValido(id: unknown): id is string {
  return typeof id === 'string' && POR_ID.has(id);
}

export function papeisDoTema(tema: TemaId | 'todos'): PapelDeParede[] {
  return tema === 'todos'
    ? [...PAPEIS_DE_PAREDE]
    : PAPEIS_DE_PAREDE.filter((p) => p.tema === tema);
}
