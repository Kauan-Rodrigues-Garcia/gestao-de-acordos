/**
 * Envios da Campanha Fácil — o pedaço de cada operador. Lógica pura.
 *
 * Até 29/09/2026 o líder digitava os nomes em «Encaminhada por» e baixava um
 * Excel só. Depois cada operador passou a baixar a parte dele pela notificação.
 * Desde 07/10/2026 a parte dele chega na aba Campanhas de WhatsApp, uma linha
 * por mensagem (migration 20261007150000): ele envia direto dali, sem planilha.
 */
import type { CampaignItem } from './lib/campaign-core';

/** Quem pode receber a campanha. */
export interface OperadorCampanha {
  id: string;
  nome: string;
}

/**
 * Uma mensagem como vai ao banco (`campanha_facil_contatos`). Dono, empresa e
 * validade o banco copia do envio. CPF não vai: a aba não precisa dele.
 */
export interface ContatoEnvio {
  ordem: number;
  nome: string;
  contrato: string | null;
  empresa_cliente: string | null;
  telefone: string | null;
  /** Só dígitos, com o 55. `null` = sem número que o WhatsApp aceite. */
  whatsapp: string | null;
  mensagem: string;
  pendencias: string[];
}

const vazioViraNull = (s: string | null | undefined) => {
  const t = String(s ?? '').trim();
  return t ? t : null;
};

/**
 * O número no formato do link do WhatsApp: só dígitos, com o 55. Mesma regra
 * de `phoneForWhatsApp` (campaign-core): 10 ou 11 dígitos ganham o 55; 12 ou 13
 * já vêm com ele. Outro tamanho não é número de celular — sem botão.
 */
export function numeroWhatsApp(telefone: string | null | undefined): string | null {
  const d = String(telefone ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.length === 12 || d.length === 13) return d;
  return null;
}

export function contatoDoItem(item: CampaignItem, ordem: number): ContatoEnvio {
  return {
    ordem,
    nome: String(item.name ?? '').trim(),
    contrato: vazioViraNull(item.contract),
    empresa_cliente: vazioViraNull(item.company),
    telefone: vazioViraNull(item.phone),
    whatsapp: numeroWhatsApp(item.phone),
    mensagem: String(item.message ?? ''),
    // «Quem encaminhará não informado» não se aplica: quem recebe é o operador.
    pendencias: (item.issues ?? []).filter(i => !/encaminhar/i.test(i)),
  };
}

/**
 * A campanha partida por operador.
 *
 * O rodízio já foi feito por `buildCampaign`, que recebeu os IDs como
 * «senders» — então `item.sender` chega com o id. Distribuir por id, e não por
 * nome, é o que impede dois operadores homônimos de virarem um só
 * (`normalizeSenders` tira repetidos).
 *
 * `ordem` é a posição na campanha inteira: a lista do operador sai na mesma
 * ordem do arquivo.
 *
 * Operador marcado que não recebeu nenhuma mensagem (campanha menor que a
 * lista) não aparece: não há campanha vazia para mandar.
 */
export function repartirPorOperador(
  campanha: readonly CampaignItem[],
  operadores: readonly OperadorCampanha[],
): { operador: OperadorCampanha; contatos: ContatoEnvio[] }[] {
  const porId = new Map(operadores.map(o => [o.id, { operador: o, contatos: [] as ContatoEnvio[] }]));
  campanha.forEach((item, i) => {
    porId.get(item.sender)?.contatos.push(contatoDoItem(item, i + 1));
  });
  return [...porId.values()].filter(p => p.contatos.length > 0);
}

/**
 * O repasse: as mensagens de quem faltou vão para quem ficou.
 *
 * Um recebedor leva tudo; vários dividem em rodízio, na ordem em que as
 * mensagens estavam.
 */
export function repartirRepasse<T>(
  contatos: readonly T[],
  recebedores: readonly OperadorCampanha[],
): { operador: OperadorCampanha; contatos: T[] }[] {
  if (recebedores.length === 0) return [];
  const partes = recebedores.map(operador => ({ operador, contatos: [] as T[] }));
  contatos.forEach((c, i) => { partes[i % partes.length].contatos.push(c); });
  return partes.filter(p => p.contatos.length > 0);
}

/** Filtro por nome, sem acento e sem caixa — a busca do passo 3. */
export function casaNome(nome: string, busca: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const b = norm(busca);
  return !b || norm(nome).includes(b);
}
