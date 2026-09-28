/**
 * mensagensWhatsapp.ts — as mensagens de WhatsApp da aba Acordos, por status.
 *
 * Pedido de 28/09/2026: cada pessoa escreve as próprias mensagens, separadas
 * por Pendente, Pago e Não pago, com «fórmulas» que puxam os dados do cliente.
 * As mensagens moram em `acordos_mensagens_whatsapp` (migration
 * 20260928160000); aqui fica o que não depende do banco — os grupos, os
 * limites, as variáveis e a troca delas pelo dado do acordo. Puro, para o
 * teste alcançar.
 *
 * ## Sem mensagem própria, nada muda
 *
 * `MENSAGEM_DO_SISTEMA` é, palavra por palavra, o que `buildMensagem` sempre
 * mandou — agora escrito com as variáveis. Quem nunca abrir o editor continua
 * mandando o mesmo texto de antes.
 */
import { formatCurrency, formatDate, TIPO_LABELS } from '@/lib/index';
import type { Acordo, StatusAcordo } from '@/lib/supabase';

/** O grupo de mensagens que atende cada status do acordo. */
export type GrupoMensagem = 'pendente' | 'pago' | 'nao_pago';

export const GRUPOS_MENSAGEM: readonly GrupoMensagem[] = ['pendente', 'pago', 'nao_pago'];

export const ROTULO_DO_GRUPO: Record<GrupoMensagem, string> = {
  pendente: 'Pendente',
  pago:     'Pago',
  nao_pago: 'Não pago',
};

/**
 * Quantas mensagens cada grupo guarda — os números do pedido: «três mensagens
 * para pendente, duas para pago e cinco para não pagos». Regra de tela, não
 * do banco: mudar aqui não pede migration.
 */
export const LIMITE_DO_GRUPO: Record<GrupoMensagem, number> = {
  pendente: 3,
  pago:     2,
  nao_pago: 5,
};

export function grupoDoStatus(status: StatusAcordo | string): GrupoMensagem {
  if (status === 'pago') return 'pago';
  if (status === 'nao_pago') return 'nao_pago';
  return 'pendente';
}

/** Uma mensagem salva (linha de `acordos_mensagens_whatsapp`). */
export interface MensagemWhatsapp {
  id: string;
  status: GrupoMensagem;
  titulo: string;
  conteudo: string;
  ordem: number;
}

/** As variáveis que a pessoa pode usar, na ordem em que o editor as oferece. */
export const VARIAVEIS_MENSAGEM: readonly { chave: string; rotulo: string; exemplo: string }[] = [
  { chave: 'nome_cliente',    rotulo: 'Nome do cliente',   exemplo: 'Maria da Silva' },
  { chave: 'primeiro_nome',   rotulo: 'Primeiro nome',     exemplo: 'Maria' },
  { chave: 'nr_cliente',      rotulo: 'NR',                exemplo: '13073500' },
  { chave: 'valor',           rotulo: 'Valor',             exemplo: 'R$ 350,00' },
  { chave: 'vencimento',      rotulo: 'Vencimento',        exemplo: '30/09/2026' },
  { chave: 'forma_pagamento', rotulo: 'Forma de pagamento', exemplo: 'Boleto' },
  { chave: 'parcela',         rotulo: 'Parcela',           exemplo: '2/5' },
  { chave: 'instituicao',     rotulo: 'Instituição',       exemplo: 'Coren-SP' },
  { chave: 'operador',        rotulo: 'Seu nome',          exemplo: 'Ana' },
];

/** O texto de sempre (`buildMensagem`), escrito com as variáveis. */
export const MENSAGEM_DO_SISTEMA: Record<GrupoMensagem, string> = {
  pendente:
    'Olá *{{nome_cliente}}*, passando para lembrar do seu acordo *NR {{nr_cliente}}*, no valor de '
    + '*{{valor}}*, com vencimento em *{{vencimento}}*. Qualquer dúvida, estamos à disposição.',
  // O sistema nunca teve texto próprio para o pago: mandava o lembrete.
  pago:
    'Olá *{{nome_cliente}}*, passando para lembrar do seu acordo *NR {{nr_cliente}}*, no valor de '
    + '*{{valor}}*, com vencimento em *{{vencimento}}*. Qualquer dúvida, estamos à disposição.',
  nao_pago:
    'Olá *{{nome_cliente}}*, identificamos que o seu acordo *NR {{nr_cliente}}*, no valor de '
    + '*{{valor}}*, com vencimento em *{{vencimento}}*, encontra-se em atraso. Por favor, entre em '
    + 'contato conosco o mais breve possível para regularizar sua situação. Estamos à disposição para ajudar.',
};

type DadosDoAcordo = Pick<Acordo, 'nome_cliente' | 'nr_cliente' | 'valor' | 'vencimento' | 'tipo' | 'parcelas'>
  & Partial<Pick<Acordo, 'numero_parcela' | 'instituicao'>>;

/** O valor de cada variável para um acordo. */
export function valoresDoAcordo(a: DadosDoAcordo, operador?: string | null): Record<string, string> {
  const nome = (a.nome_cliente ?? '').trim();
  const parcela = a.numero_parcela && a.parcelas > 1 ? `${a.numero_parcela}/${a.parcelas}` : '';
  return {
    nome_cliente:    nome,
    primeiro_nome:   nome.split(/\s+/)[0] ?? '',
    nr_cliente:      a.nr_cliente ?? '',
    valor:           formatCurrency(a.valor),
    vencimento:      formatDate(a.vencimento),
    forma_pagamento: TIPO_LABELS[a.tipo] ?? a.tipo ?? '',
    parcela,
    instituicao:     a.instituicao ?? '',
    operador:        (operador ?? '').trim(),
  };
}

/**
 * Troca as variáveis pelo dado. Aceita espaço dentro das chaves
 * (`{{ valor }}`) e maiúscula (`{{VALOR}}`), porque é assim que se digita.
 * Variável desconhecida fica como está: some-la esconderia o erro de digitação
 * de quem escreveu, e o cliente receberia uma frase com um buraco.
 */
export function preencherMensagem(modelo: string, valores: Record<string, string>): string {
  return modelo.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (inteiro, chave: string) => {
    const k = chave.toLowerCase();
    return k in valores ? valores[k] : inteiro;
  });
}

/** Variáveis escritas no texto que não existem — o editor avisa antes de salvar. */
export function variaveisDesconhecidas(modelo: string): string[] {
  const conhecidas = new Set(VARIAVEIS_MENSAGEM.map(v => v.chave));
  const achadas = new Set<string>();
  for (const m of modelo.matchAll(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g)) {
    const k = m[1].toLowerCase();
    if (!conhecidas.has(k)) achadas.add(m[1]);
  }
  return [...achadas];
}

/** Os valores de exemplo, para a prévia do editor. */
export function valoresDeExemplo(operador?: string | null): Record<string, string> {
  const v = Object.fromEntries(VARIAVEIS_MENSAGEM.map(x => [x.chave, x.exemplo]));
  if (operador?.trim()) v.operador = operador.trim();
  return v;
}

/** As mensagens de um grupo, na ordem (a primeira é a padrão). */
export function mensagensDoGrupo(
  mensagens: readonly MensagemWhatsapp[], grupo: GrupoMensagem,
): MensagemWhatsapp[] {
  return mensagens
    .filter(m => m.status === grupo)
    .sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

/**
 * O texto que sai para um acordo.
 *
 * `modeloId` escolhe uma mensagem do grupo; sem ele vale a padrão (a primeira)
 * e, sem mensagem própria, o texto do sistema.
 */
export function mensagemParaAcordo(
  a: DadosDoAcordo & { status: StatusAcordo | string },
  mensagens: readonly MensagemWhatsapp[],
  operador?: string | null,
  modeloId?: string | null,
): string {
  const grupo = grupoDoStatus(a.status);
  const doGrupo = mensagensDoGrupo(mensagens, grupo);
  const escolhida = (modeloId ? doGrupo.find(m => m.id === modeloId) : null) ?? doGrupo[0];
  return preencherMensagem(escolhida?.conteudo ?? MENSAGEM_DO_SISTEMA[grupo], valoresDoAcordo(a, operador));
}
