// Os dados de mentira que aparecem nas telas. Nada aqui vem do banco.
//
// Os números de cada recorte (Minha visão, Minha equipe, Meu setor) são
// derivados da mesma conta que o painel de metas do app faz — projeção =
// recebido ÷ (meta × dias úteis passados ÷ dias úteis do mês) —, para a tela
// nunca mostrar um percentual que não bate com os valores ao lado.

export const OPERADORA = {
  nome: 'Juliana Prado',
  primeiroNome: 'Juliana',
  iniciais: 'JP',
  cargo: 'Operador',
  setor: 'Play 5',
  equipe: 'Equipe Águia',
  marca: 'BookPlay',
};

export const LIDER = { nome: 'Carlos Mendes', iniciais: 'CM' };

/** Outubro de 2026: 21 dias úteis (12/10 é feriado). Hoje é terça, 13/10. */
export const HOJE = { iso: '2026-10-13', br: '13/10/2026', dia: 13, semana: 'terça-feira', extenso: '13 de outubro de 2026' };
export const DIAS_UTEIS = { passados: 8, restantes: 13, total: 21 };
export const MES_ROTULO = 'Outubro de 2026';

export type Recorte = 'individual' | 'equipe' | 'setor';

export type NumerosDoRecorte = {
  rotulo: string;
  meta: number;
  recebido: number;
  esperado: number;
  projecaoPct: number;
  diferenca: number;
  pctMeta: number;
  falta: number;
  quartil: number;
};

function numeros(rotulo: string, meta: number, recebido: number): NumerosDoRecorte {
  const esperado = (meta * DIAS_UTEIS.passados) / DIAS_UTEIS.total;
  const projecaoPct = Math.round((recebido / esperado) * 100);
  return {
    rotulo,
    meta,
    recebido,
    esperado,
    projecaoPct,
    diferenca: recebido - esperado,
    pctMeta: Math.round((recebido / meta) * 1000) / 10,
    falta: meta - recebido,
    quartil: projecaoPct >= 100 ? 1 : projecaoPct >= 80 ? 2 : projecaoPct >= 50 ? 3 : 4,
  };
}

export const RECORTES: Record<Recorte, NumerosDoRecorte> = {
  individual: numeros('individual', 22000, 9486.4),
  equipe: numeros('da equipe', 132000, 54308.6),
  setor: numeros('do setor', 480000, 213943.15),
};

/** Recebido por dia útil (só a operadora), para o gráfico de evolução. */
export const POR_DIA: Record<number, number> = {
  1: 1380.5, 2: 840.0, 5: 1622.9, 6: 1110.0, 7: 1265.0, 8: 1488.6, 9: 942.9, 13: 836.5,
};
/** Agendado por dia (a linha tracejada). */
export const AGENDADO_POR_DIA: Record<number, number> = {
  13: 1640, 14: 1210, 15: 980, 16: 1520, 19: 860, 20: 1190, 21: 1430, 22: 740, 23: 1010,
  26: 1280, 27: 920, 28: 1100, 29: 660, 30: 1340,
};
/** Fins de semana e o feriado do mês (sem barra). */
export const SEM_EXPEDIENTE = new Set([3, 4, 10, 11, 12, 17, 18, 24, 25, 31]);

// ── Desempenho do Dia ───────────────────────────────────────────────────
export const DIA = {
  recebidoAntes: 836.5,
  recebidoDepois: 1148.9,
  metaDia: 1047.62,
  vsOntem: 34,
  vsMedia: 18,
  agendados: 9,
  pagos: 5,
  aVerificar: 3,
  naoPagos: 1,
  formalizados: 4,
  conversao: 83,
};

// ── Acordos ─────────────────────────────────────────────────────────────
export type Status = 'verificar_pendente' | 'pago' | 'nao_pago';
export type Tipo = 'boleto' | 'pix' | 'cartao' | 'pix_automatico' | 'cartao_recorrente';

export type Acordo = {
  id: string;
  nr: string;
  cliente: string;
  instituicao: string;
  whatsapp: string;
  vencimento: string;
  valor: number;
  tipo: Tipo;
  parcela: string;
  status: Status;
};

export const ACORDOS_HOJE: Acordo[] = [
  { id: 'a1', nr: '12748301', cliente: 'Marcos Oliveira', instituicao: 'FACULDADE BOOKPLAY', whatsapp: '(18) 99731-4402', vencimento: '13/10/2026', valor: 189.9, tipo: 'boleto', parcela: '1/3', status: 'verificar_pendente' },
  { id: 'a2', nr: '12690457', cliente: 'Fernanda Lima', instituicao: 'MUNDIAL EDITORA', whatsapp: '(18) 99654-1187', vencimento: '13/10/2026', valor: 312.4, tipo: 'pix', parcela: '2/4', status: 'pago' },
  { id: 'a3', nr: '12711962', cliente: 'Ricardo Souza', instituicao: 'FACULDADE PLAY', whatsapp: '(14) 99812-0365', vencimento: '13/10/2026', valor: 145.0, tipo: 'cartao', parcela: '—', status: 'verificar_pendente' },
  { id: 'a4', nr: '12659203', cliente: 'Patrícia Gomes', instituicao: 'BOOKPLAY', whatsapp: '(18) 99107-5528', vencimento: '13/10/2026', valor: 228.75, tipo: 'boleto', parcela: '5/5', status: 'pago' },
];

export const ACORDOS_AMANHA: Acordo[] = [
  { id: 'b1', nr: '12733518', cliente: 'André Martins', instituicao: 'FACULDADE BOOKPLAY', whatsapp: '(18) 99420-7731', vencimento: '14/10/2026', valor: 267.3, tipo: 'pix', parcela: '1/2', status: 'verificar_pendente' },
  { id: 'b2', nr: '12702644', cliente: 'Camila Rocha', instituicao: 'MUNDIAL EDITORA', whatsapp: '(17) 99238-0914', vencimento: '14/10/2026', valor: 198.0, tipo: 'boleto', parcela: '—', status: 'verificar_pendente' },
  { id: 'b3', nr: '12687790', cliente: 'Bruno Carvalho', instituicao: 'FACULDADE PLAY', whatsapp: '(18) 99563-2270', vencimento: '14/10/2026', valor: 350.0, tipo: 'cartao', parcela: '2/3', status: 'nao_pago' },
];

/** O acordo que a operadora lança na cena 4. */
export const NOVO = {
  nr: '12751840',
  valor: '189,90',
  parcelas: '3',
  vencimentoDia: 20,
  vencimento: '20/10/2026',
  cliente: 'Luciana Ferreira',
  whatsapp: '(18) 99645-3321',
  instituicao: 'FACULDADE BOOKPLAY',
};

// ── mensagens prontas (Acordos → WhatsApp) ──────────────────────────────
export const MENSAGENS = [
  {
    titulo: 'Lembrete do vencimento',
    texto:
      'Olá, Marcos! Tudo bem? 😊 Passando para lembrar que a parcela 1/3 do seu acordo (NR 12748301), no valor de R$ 189,90, vence hoje, 13/10/2026. Qualquer dúvida, estou à disposição!',
  },
  {
    titulo: 'Lembrete com segunda via',
    texto:
      'Oi, Marcos! Sua parcela de R$ 189,90 vence hoje. Se precisar da segunda via do boleto, é só me chamar por aqui que eu envio na hora.',
  },
];

export const brl = (n: number) =>
  'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
