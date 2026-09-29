/**
 * Envios da Campanha Fácil — o pedaço de cada operador. Lógica pura.
 *
 * Até 29/09/2026 o líder digitava os nomes em «Encaminhada por» e baixava um
 * Excel só. Agora ele marca operadores do setor, e cada um recebe na
 * notificação a planilha com a parte dele (ver migration 20260929100000).
 *
 * O que vai ao banco é a LINHA já pronta (mensagem renderizada, colunas do
 * Excel), não o arquivo: o navegador do operador remonta o .xlsx no clique com
 * o mesmo `xlsx-export.js` que o líder usa.
 */
import type { CampaignItem } from './lib/campaign-core';

/** Quem pode receber a campanha. */
export interface OperadorCampanha {
  id: string;
  nome: string;
}

/**
 * O que o Excel lê de um item — e nada além.
 *
 * `source` (a linha crua do relatório) fica de fora: é o grosso do tamanho e a
 * planilha não usa. Os campos são os que `xlsx-export.js` consulta.
 */
export type LinhaEnvio = Pick<CampaignItem,
  | 'rowNumber' | 'sourceType' | 'financialDataAvailable'
  | 'name' | 'cpf' | 'contract' | 'company' | 'overdueCount'
  | 'overdueDiscounted' | 'settlement' | 'valueWithInterest' | 'bundle' | 'annual'
  | 'cardSettlement' | 'cardAnnual'
  | 'phone' | 'message' | 'sender' | 'status' | 'issues'>;

export function linhaDoItem(item: CampaignItem): LinhaEnvio {
  return {
    rowNumber: item.rowNumber,
    sourceType: item.sourceType,
    financialDataAvailable: item.financialDataAvailable,
    name: item.name,
    cpf: item.cpf,
    contract: item.contract,
    company: item.company,
    overdueCount: item.overdueCount,
    overdueDiscounted: item.overdueDiscounted,
    settlement: item.settlement,
    valueWithInterest: item.valueWithInterest,
    bundle: item.bundle,
    annual: item.annual,
    cardSettlement: item.cardSettlement,
    cardAnnual: item.cardAnnual,
    phone: item.phone,
    message: item.message,
    sender: item.sender,
    status: item.status,
    issues: item.issues ?? [],
  };
}

/**
 * De volta ao formato que `CampaignXlsx.createWorkbook` recebe.
 *
 * Os campos que o Excel não lê entram vazios só para o tipo fechar. Linha
 * antiga ou mexida sem `issues` vira lista vazia — o escritor faz
 * `issues.length` e quebraria.
 */
export function itemDaLinha(l: LinhaEnvio): CampaignItem {
  return {
    ...l,
    issues: Array.isArray(l.issues) ? l.issues : [],
    firstName: '', protest: null, value: null, openValue: null, updatedValue: null,
    saleType: '', phoneDigits: '', whatsAppPhone: '', protocol: '', birthday: '',
    shortLink: '', blockingIssues: [], hasBlockingIssues: false, source: {},
  };
}

/**
 * A campanha partida por operador.
 *
 * O rodízio já foi feito por `buildCampaign`, que recebeu os IDs como
 * «senders» — então `item.sender` chega com o id. Aqui ele vira o NOME, que é o
 * que sai em «Encaminhada por». Distribuir por id, e não por nome, é o que
 * impede dois operadores homônimos de virarem um só (`normalizeSenders` tira
 * repetidos).
 *
 * Operador marcado que não recebeu nenhuma linha (campanha menor que a lista)
 * não aparece: não há planilha vazia para mandar.
 */
export function repartirPorOperador(
  campanha: readonly CampaignItem[],
  operadores: readonly OperadorCampanha[],
): { operador: OperadorCampanha; linhas: LinhaEnvio[] }[] {
  const porId = new Map(operadores.map(o => [o.id, { operador: o, linhas: [] as LinhaEnvio[] }]));
  for (const item of campanha) {
    const alvo = porId.get(item.sender);
    if (!alvo) continue;
    alvo.linhas.push({ ...linhaDoItem(item), sender: alvo.operador.nome });
  }
  return [...porId.values()].filter(p => p.linhas.length > 0);
}

/**
 * O repasse: as linhas de quem faltou vão para quem ficou.
 *
 * Um recebedor leva tudo; vários dividem em rodízio, na ordem em que as linhas
 * estavam. «Encaminhada por» passa a ser o nome de quem recebeu — o usuário
 * disse que o nome de quem faltou não precisa ficar.
 */
export function repartirRepasse(
  linhas: readonly LinhaEnvio[],
  recebedores: readonly OperadorCampanha[],
): { operador: OperadorCampanha; linhas: LinhaEnvio[] }[] {
  if (recebedores.length === 0) return [];
  const partes = recebedores.map(operador => ({ operador, linhas: [] as LinhaEnvio[] }));
  linhas.forEach((l, i) => {
    const parte = partes[i % partes.length];
    parte.linhas.push({ ...l, sender: parte.operador.nome });
  });
  return partes.filter(p => p.linhas.length > 0);
}
