/**
 * O que cada variável da mensagem é, de onde vem, e o valor que ela daria
 * (25/10/2026: «mais fácil de entender as variáveis e escolher elas»).
 *
 * É o mesmo conteúdo do documento «Campanha Fácil — mailing e variáveis»,
 * agora dentro da tela: o editor mostra a ficha da variável sob o mouse e a
 * prévia da mensagem montada para um cliente.
 */
import { CampaignCore, type CampaignItem, type Discounts, type RawRecord } from './lib/campaign-core';

export interface DetalheDaVariavel {
  /** O que a variável escreve na mensagem. */
  oQue: string;
  /** A coluna do mailing, a conta ou a configuração de onde ela sai. */
  origem: string;
}

export const DETALHE_DA_VARIAVEL: Readonly<Record<string, DetalheDaVariavel>> = {
  // Cliente e empresa
  primeiro_nome: { oQue: 'A primeira palavra do nome. Sem nome, sai «Cliente».', origem: 'Coluna Nome' },
  nome: { oQue: 'O nome completo, com a inicial de cada palavra maiúscula.', origem: 'Coluna Nome' },
  cpf: { oQue: 'O CPF mascarado: só os 5 últimos dígitos.', origem: 'Coluna CPF (o 245 não traz)' },
  contrato: { oQue: 'O número do contrato (NR).', origem: 'Coluna Contratos' },
  protocolo: { oQue: 'O código do cliente. Sem código, repete o contrato.', origem: 'Coluna Código' },
  empresa: { oQue: 'Bookplay, Faculdade Bookplay, Mundial Editora ou Pagueplay.', origem: 'Coluna Tp. Venda, traduzida' },
  atendimento: { oQue: 'O 0800 da empresa do cliente.', origem: 'Calculado pela empresa' },
  link: { oQue: 'O link enviado ao cliente.', origem: 'Coluna Link curto' },
  telefone: { oQue: 'O telefone usado no envio, só dígitos.', origem: 'Whats Titular → 1 → 2' },
  // Do mailing
  endereco: { oQue: 'O endereço do cliente.', origem: 'Coluna Endereço' },
  cidade: { oQue: 'A cidade do cliente.', origem: 'Coluna Cidade' },
  local_trabalho: { oQue: 'Onde o cliente trabalha.', origem: 'Coluna Local de trabalho' },
  ocupacao: { oQue: 'A profissão do cliente.', origem: 'Coluna Ocupação' },
  tempo_atraso: { oQue: 'Os dias em atraso, escritos «45 dias».', origem: 'Coluna Tempo de atraso' },
  // Pix Automático
  pix_automatico_12x: { oQue: 'Parcela do Pix Automático em 12x, sem desconto.', origem: 'Valor Aberto ÷ 12' },
  pix_automatico_20x: { oQue: 'Parcela do Pix Automático em 20x, sem desconto.', origem: 'Valor Aberto ÷ 20' },
  pix_automatico_21x: { oQue: 'Parcela do Pix Automático em 21x, sem desconto.', origem: 'Valor Aberto ÷ 21' },
  pix_automatico_desconto_12x: { oQue: 'Parcela do Pix Automático em 12x, com desconto.', origem: '(Valor Aberto − % Pix Automático) ÷ 12' },
  pix_automatico_desconto_20x: { oQue: 'Parcela do Pix Automático em 20x, com desconto.', origem: '(Valor Aberto − % Pix Automático) ÷ 20' },
  pix_automatico_desconto_21x: { oQue: 'Parcela do Pix Automático em 21x, com desconto.', origem: '(Valor Aberto − % Pix Automático) ÷ 21' },
  pix_automatico_parcela: { oQue: 'Uma parcela em atraso no Pix Automático, com desconto.', origem: '1 parcela − % Pix Automático' },
  // Quitação
  quitacao: { oQue: 'Quitação à vista no Pix, com desconto.', origem: 'Valor Aberto − % quitação' },
  cartao_quitacao: { oQue: 'Parcela da quitação no cartão em 12x.', origem: 'Quitação ÷ 12' },
  cartao_quitacao_20x: { oQue: 'Parcela da quitação no cartão em 20x.', origem: 'Quitação ÷ 20' },
  cartao_quitacao_21x: { oQue: 'Parcela da quitação no cartão em 21x.', origem: 'Quitação ÷ 21' },
  // Atrasadas e junção
  parcela_desconto: { oQue: 'A soma de TODAS as parcelas em atraso, com desconto.', origem: 'Valor − % parcela' },
  uma_parcela_desconto: { oQue: 'UMA parcela em atraso, com desconto.', origem: '(Valor ÷ parcelas em atraso) − % parcela' },
  juncao: { oQue: 'As atrasadas mais a próxima parcela, com desconto.', origem: '1 parcela × (atrasadas + 1) − % junção' },
  juncao_6x: { oQue: 'Parcela da junção em 6x.', origem: 'Junção ÷ 6' },
  juncao_12x: { oQue: 'Parcela da junção em 12x.', origem: 'Junção ÷ 12' },
  // Plano anual
  anual: { oQue: 'O plano anual à vista, com desconto.', origem: '(1 parcela × 12) − % anual' },
  cartao_anual: { oQue: 'Parcela do plano anual no cartão em 12x.', origem: 'Anual ÷ 12' },
  cartao_anual_20x: { oQue: 'Parcela do plano anual no cartão em 20x.', origem: 'Anual ÷ 20' },
  cartao_anual_21x: { oQue: 'Parcela do plano anual no cartão em 21x.', origem: 'Anual ÷ 21' },
  // Saldo com juros
  valor_com_juros: { oQue: 'O saldo do contrato com juros.', origem: 'Valor Atualizado − % juros (padrão 0%)' },
  // Percentuais
  pct_atraso: { oQue: 'O número do % da parcela, para citar no texto.', origem: '«Descontos e cálculos» → Atrasadas' },
  pct_juncao: { oQue: 'O número do % da junção, para citar no texto.', origem: '«Descontos e cálculos» → Junção' },
  pct_quitacao: { oQue: 'O número do % da quitação, para citar no texto.', origem: '«Descontos e cálculos» → Quitação' },
  pct_juros: { oQue: 'O número do % dos juros, para citar no texto.', origem: '«Descontos e cálculos» → Juros' },
  pct_anual: { oQue: 'O número do % do plano anual, para citar no texto.', origem: '«Descontos e cálculos» → Anual' },
  pct_pix_automatico: { oQue: 'O número do % do Pix Automático, para citar no texto.', origem: '«Descontos e cálculos» → Pix Automático' },
};

/** O cliente de exemplo da prévia: o mesmo do documento, fictício. */
function registroDeExemplo(): RawRecord {
  const values: Record<string, string> = {
    'Código': '558812', Nome: 'KLEBER CARLOS DA SILVA', CPF: '12345678900', Contratos: 'NR123456',
    'Parcelas em atraso': '2', Protesto: '0', Valor: '400,00', 'Valor Aberto': '2.000,00',
    'Valor Atualizado': '2.100,00', 'Tp. Venda': 'PRO', 'Whats Titular': '14999990000',
    Cidade: 'Marília', 'Endereço': 'Rua das Flores, 100', 'Local de Trabalho': 'Hospital Central',
    'Ocupação': 'Enfermeiro', 'Dias de atraso': '45', 'Link curto': 'https://exemplo.link/abc',
  };
  const normalized = Object.fromEntries(Object.entries(values).map(([k, v]) => [CampaignCore.normalizeHeader(k), v]));
  return { rowNumber: 2, values, normalized, sourceType: 'report-247', financialDataAvailable: true };
}

export interface ExemploDaMensagem {
  /** Quem é o cliente da prévia, para a legenda. */
  rotulo: string;
  /** `true` quando é um cliente do mailing carregado; `false`, o fictício. */
  real: boolean;
  variaveis: Record<string, string>;
}

/**
 * As variáveis para a prévia: as do cliente selecionado no mailing ou, sem
 * mailing, as do cliente fictício — sempre com os percentuais da tela.
 */
export function exemploDaMensagem(item: CampaignItem | null, discounts: Discounts): ExemploDaMensagem {
  if (item) {
    return {
      rotulo: `${item.firstName} · linha ${item.rowNumber} do mailing`,
      real: true,
      variaveis: CampaignCore.variablesFor(item, discounts),
    };
  }
  const ficticio = CampaignCore.deriveRecord(registroDeExemplo(), discounts);
  return {
    rotulo: 'Cliente de exemplo (fictício)',
    real: false,
    variaveis: CampaignCore.variablesFor(ficticio, discounts),
  };
}

/**
 * Qualquer coisa entre chaves duplas. A campanha só troca o nome escrito com
 * letras sem acento, números e «_» (`renderTemplate`), e procura o nome como
 * foi escrito: {{ Quitacao }} sai em branco, e {{quitacão}} vai para o cliente
 * com as chaves.
 */
const ENTRE_CHAVES = /{{\s*([^{}]*?)\s*}}/g;

const existe = (nome: string) => Object.prototype.hasOwnProperty.call(DETALHE_DA_VARIAVEL, nome);

/** As variáveis que a mensagem cita e não existem (erro de escrita). */
export function variaveisDesconhecidas(texto: string): string[] {
  const desconhecidas = new Set<string>();
  for (const m of texto.matchAll(ENTRE_CHAVES)) if (!existe(m[1])) desconhecidas.add(m[1]);
  return [...desconhecidas];
}

/**
 * As variáveis que já saem com «R$» (`formatCurrency`). Escrever «R$» antes
 * ou «,00» depois delas manda «R$R$ 1.400,00,00» ao cliente — achado em 44
 * mensagens salvas em 25/10/2026, vindas de modelos de planilha.
 */
export const VARIAVEIS_EM_REAIS: readonly string[] = [
  'parcela_desconto', 'uma_parcela_desconto', 'quitacao', 'valor_com_juros',
  'juncao', 'juncao_6x', 'juncao_12x', 'anual',
  'cartao_quitacao', 'cartao_quitacao_20x', 'cartao_quitacao_21x',
  'cartao_anual', 'cartao_anual_20x', 'cartao_anual_21x',
  'pix_automatico_12x', 'pix_automatico_20x', 'pix_automatico_21x',
  'pix_automatico_desconto_12x', 'pix_automatico_desconto_20x', 'pix_automatico_desconto_21x',
  'pix_automatico_parcela',
];

const EM_REAIS = `\\{\\{\\s*(${VARIAVEIS_EM_REAIS.join('|')})\\s*\\}\\}`;
/** «R$» antes da variável (com espaço, negrito ou aspas no meio), e o «,00» depois, se houver. */
const RS_ANTES = new RegExp(`R\\$\\s*(\\*?)\\s*"?${EM_REAIS}"?(?:\\s*,\\s*00(?!\\d))?`, 'g');
/** «,00» depois da variável, sem «R$» antes. */
const VIRGULA_00_DEPOIS = new RegExp(`${EM_REAIS}\\s*,\\s*00(?!\\d)`, 'g');

/** As variáveis em reais que a mensagem escreve com «R$» antes ou «,00» depois. */
export function reaisDuplicados(texto: string): string[] {
  const nomes = new Set<string>();
  for (const m of texto.matchAll(RS_ANTES)) nomes.add(m[2]);
  for (const m of texto.matchAll(VIRGULA_00_DEPOIS)) nomes.add(m[1]);
  return [...nomes];
}

/** Tira o «R$» e o «,00» que sobram em volta das variáveis em reais; o negrito fica. */
export function corrigirReaisDuplicados(texto: string): string {
  return texto
    .replace(RS_ANTES, (_, negrito: string, nome: string) => `${negrito}{{${nome}}}`)
    .replace(VIRGULA_00_DEPOIS, (_, nome: string) => `{{${nome}}}`);
}

/** Um pedaço da prévia: texto, ou o valor de uma variável (e se ele saiu). */
export type PedacoDaPrevia =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'valor'; variavel: string; texto: string }
  | { tipo: 'vazia'; variavel: string }
  | { tipo: 'desconhecida'; variavel: string };

/**
 * A mensagem montada, em pedaços: o mesmo `renderTemplate` da campanha, mas
 * sabendo onde cada variável entrou — para a prévia pintar o valor, e marcar
 * a que saiu vazia ou não existe. O 0800 escrito à mão vira {{atendimento}},
 * como na campanha.
 */
export function pedacosDaPrevia(texto: string, variaveis: Record<string, string>): PedacoDaPrevia[] {
  const corpo = CampaignCore.withCompanySupportPhone(texto);
  const pedacos: PedacoDaPrevia[] = [];
  let ultimo = 0;
  for (const m of corpo.matchAll(ENTRE_CHAVES)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) pedacos.push({ tipo: 'texto', texto: corpo.slice(ultimo, inicio) });
    const variavel = m[1];
    const valor = variaveis[variavel];
    if (!existe(variavel)) pedacos.push({ tipo: 'desconhecida', variavel });
    else if (valor) pedacos.push({ tipo: 'valor', variavel, texto: valor });
    else pedacos.push({ tipo: 'vazia', variavel });
    ultimo = inicio + m[0].length;
  }
  if (ultimo < corpo.length) pedacos.push({ tipo: 'texto', texto: corpo.slice(ultimo) });
  return pedacos;
}

/** O valor curto do botão: «R$ 1.400,00» vira «R$ 1.400». */
export function valorCurto(valor: string | undefined): string {
  return (valor ?? '').replace(/,00$/, '');
}
