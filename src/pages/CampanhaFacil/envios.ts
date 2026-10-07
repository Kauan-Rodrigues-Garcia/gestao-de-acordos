/**
 * Envios da Campanha Fácil — o pedaço de cada operador. Lógica pura.
 *
 * Até 29/09/2026 o líder digitava os nomes em «Encaminhada por» e baixava um
 * Excel só. Depois cada operador passou a baixar a parte dele pela notificação.
 * Desde 07/10/2026 a parte dele chega na aba Campanhas de WhatsApp, uma linha
 * por mensagem (migration 20261007150000): ele envia direto dali, sem planilha.
 */
import { CampaignCore, type CampaignItem, type Discounts } from './lib/campaign-core';

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
  /** O segundo número do relatório («Fone 2»). */
  telefone2: string | null;
  whatsapp2: string | null;
  mensagem: string;
  pendencias: string[];
  /**
   * Os valores do modelo ({{nome}}, {{quitacao}}, …), SEM CPF. É com eles que o
   * banco refaz o texto quando o líder troca a mensagem (`fn_cf_renderizar`).
   */
  variaveis: Record<string, string> | null;
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

/** As variáveis do modelo para o banco — sem CPF, que não sai do navegador. */
export function variaveisSemCpf(item: CampaignItem, discounts?: Partial<Discounts>): Record<string, string> {
  const { cpf: _cpf, ...resto } = CampaignCore.variablesFor(item, { ...CampaignCore.DEFAULT_DISCOUNTS, ...discounts });
  return resto;
}

export function contatoDoItem(item: CampaignItem, ordem: number, discounts?: Partial<Discounts>): ContatoEnvio {
  return {
    ordem,
    nome: String(item.name ?? '').trim(),
    contrato: vazioViraNull(item.contract),
    empresa_cliente: vazioViraNull(item.company),
    telefone: vazioViraNull(item.phone),
    whatsapp: numeroWhatsApp(item.phone),
    telefone2: vazioViraNull(item.phone2),
    whatsapp2: numeroWhatsApp(item.phone2),
    mensagem: String(item.message ?? ''),
    // «Quem encaminhará não informado» não se aplica: quem recebe é o operador.
    pendencias: (item.issues ?? []).filter(i => !/encaminhar/i.test(i)),
    variaveis: variaveisSemCpf(item, discounts),
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
  discounts?: Partial<Discounts>,
): { operador: OperadorCampanha; contatos: ContatoEnvio[] }[] {
  const porId = new Map(operadores.map(o => [o.id, { operador: o, contatos: [] as ContatoEnvio[] }]));
  campanha.forEach((item, i) => {
    porId.get(item.sender)?.contatos.push(contatoDoItem(item, i + 1, discounts));
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

// ── Editar a campanha: redistribuir os pendentes ────────────────────────────

/** O que a redistribuição precisa saber de cada mensagem. */
export interface MensagemDaCampanha {
  id: string;
  operador_id: string;
  ordem: number;
  status: 'pendente' | 'enviado' | 'nao_enviado';
}

export interface ParteRedistribuida {
  operador: OperadorCampanha;
  /** Já tocadas por ele (enviadas, copiadas ou «não deu»): ficam com ele. */
  presas: number;
  /** Os ids dos pendentes que ele passa a ter. */
  contatos: string[];
}

/**
 * Redivide os PENDENTES de uma campanha entre os operadores escolhidos.
 *
 * Pedido do Cleber (07/10/2026): «o que foi copiado ou enviado fica preso com
 * a pessoa, mesmo se mais gente for adicionada; as presas ficam fora da
 * redistribuição e cada um recebe só o que falta para todos ficarem com a
 * mesma quantidade (aproximadamente)».
 *
 * Presa = tudo que não está pendente: enviado (clique no WhatsApp ou cópia) e
 * «não deu» — esse a pessoa já tentou, e mandar o mesmo número a outro não
 * resolve.
 *
 * Cada pendente, na ordem da campanha, vai para quem está com MENOS no total
 * (presas + recebidas); no empate, quem vem primeiro na lista. É o
 * nivelamento: quem já enviou muito recebe pouco ou nada.
 *
 * Quem saiu da lista mantém as presas dele (não aparece no resultado). Lista
 * vazia com pendentes é erro — ninguém para receber.
 */
export function redistribuir(
  mensagens: readonly MensagemDaCampanha[],
  operadores: readonly OperadorCampanha[],
): ParteRedistribuida[] {
  const pendentes = mensagens.filter(m => m.status === 'pendente').sort((a, b) => a.ordem - b.ordem);
  if (operadores.length === 0) {
    if (pendentes.length > 0) throw new Error('Escolha ao menos um operador para receber.');
    return [];
  }
  const partes = operadores.map(operador => ({
    operador,
    presas: mensagens.filter(m => m.status !== 'pendente' && m.operador_id === operador.id).length,
    contatos: [] as string[],
  }));
  for (const m of pendentes) {
    let alvo = partes[0];
    for (const p of partes) {
      if (p.presas + p.contatos.length < alvo.presas + alvo.contatos.length) alvo = p;
    }
    alvo.contatos.push(m.id);
  }
  return partes;
}

/** Filtro por nome, sem acento e sem caixa — a busca do passo 3. */
export function casaNome(nome: string, busca: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const b = norm(busca);
  return !b || norm(nome).includes(b);
}
