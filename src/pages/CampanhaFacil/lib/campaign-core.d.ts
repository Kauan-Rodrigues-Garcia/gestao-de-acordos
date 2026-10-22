// Tipos da API pública de campaign-core.js (lógica portada verbatim do app
// original). A implementação é JS puro; aqui declaramos só o contrato que a UI
// React consome.

export interface Discounts {
  overdue: number;
  settlement: number;
  interest: number;
  bundle: number;
  annual: number;
  /** % de desconto do Pix Automático sobre o Valor Aberto (21/10/2026; antes, sobre o valor com juros). */
  pix_automatico: number;
}

/** Os dados do cliente que vêm do mailing e viram variável da mensagem. */
export type MailingFieldKey = 'endereco' | 'cidade' | 'local_trabalho' | 'ocupacao' | 'tempo_atraso';

export interface MailingField {
  key: MailingFieldKey;
  /** O nome da coluna, como aparece no aviso de revisão. */
  header: string;
  names: readonly string[];
  partials: readonly string[];
  excludes: readonly string[];
}

export interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  body: string;
}

/** Registro bruto de uma linha do arquivo, antes de derivar/gerar. */
export interface RawRecord {
  rowNumber: number;
  values: Record<string, string>;
  normalized: Record<string, string>;
  sourceType?: string;
  financialDataAvailable?: boolean;
}

export interface FilterStats {
  total: number;
  included: number;
  removed: number;
  maintenance: number;
  cofen: number;
  jornada: number;
  generalUsers: number;
  paid: number;
  invalid: number;
}

export interface ExcludedRecord {
  rowNumber: number;
  reasonCode: string;
  reason: string;
  originalValues: Record<string, string>;
  originalRow: string[];
}

/** Resultado do parse de um arquivo (mailing, relatório 245 ou 247). */
export interface ParsedResult {
  headers: string[];
  records: RawRecord[];
  delimiter: string | null;
  encoding: string;
  missingHeaders: string[];
  originalHeaders?: string[];
  /**
   * `report-245` = .xls de ligações, campanha PREVENTIVA (ignora os valores que
   * o arquivo traz). `report-247` = mailing com colunas de valor, campanha de
   * desconto. `mailing` = CSV de contatos sem valores.
   */
  sourceType?: 'mailing' | 'report-247' | 'report-245';
  reportCode?: string;
  campaignPurpose?: string;
  financialDataAvailable?: boolean;
  filterStats?: FilterStats;
  excludedRecords?: ExcludedRecord[];
  sheetName?: string;
}

/** Item da campanha já derivado e com mensagem/responsável aplicados. */
export interface CampaignItem {
  rowNumber: number;
  sourceType: string;
  financialDataAvailable: boolean;
  name: string;
  firstName: string;
  cpf: string;
  contract: string;
  overdueCount: number | null;
  protest: number | null;
  value: number | null;
  openValue: number | null;
  /** «Valor Aberto» do arquivo, também no 245 (que não o usa na mensagem). `null` = não veio. */
  openValueFile: number | null;
  /** Soma de `openValueFile` do mesmo contrato na campanha — a coluna VALOR EM ABERTO. */
  openValueTotal: number | null;
  updatedValue: number | null;
  overdueDiscounted: number | null;
  settlement: number | null;
  valueWithInterest: number | null;
  bundle: number | null;
  annual: number | null;
  cardSettlement: number | null;
  cardAnnual: number | null;
  /** Parcela do Pix Automático: Valor Aberto ÷ 21, sem desconto (21/10/2026). */
  pixAuto: number | null;
  /** Parcela do Pix Automático com o desconto: Valor Aberto × (1 − % Pix) ÷ 21. */
  pixAutoDiscount: number | null;
  /**
   * Pix Automático só na parcela (20/10/2026): uma parcela (valor ÷ parcelas
   * em atraso) com o desconto da parcela. 0 sem parcela em atraso.
   */
  pixAutoParcela: number | null;
  /**
   * Cada modalidade parcelada em 12x, 20x e 21x (16/10/2026): a chave é o
   * número de parcelas. `null` no relatório sem valores. A junção (`bundle`)
   * sai em 6x e 12x (20/10/2026).
   */
  installments: Record<'bundle' | 'cardSettlement' | 'cardAnnual' | 'pixAuto' | 'pixAutoDiscount', Record<number, number | null>>;
  /** Os dados do cliente que vêm do mailing; vazio quando a coluna falta. */
  mailing: Record<MailingFieldKey, string>;
  saleType: string;
  company: string;
  phone: string;
  phoneDigits: string;
  whatsAppPhone: string;
  /** O segundo número do relatório («Fone 2»), diferente do principal. Vazio se não houver. */
  phone2: string;
  protocol: string;
  birthday: string;
  shortLink: string;
  issues: string[];
  blockingIssues: string[];
  hasBlockingIssues: boolean;
  status: 'Pronto' | 'Revisar';
  source: Record<string, string>;
  sender: string;
  message: string;
}

export interface BuildCampaignOptions {
  discounts?: Partial<Discounts>;
  senders?: string[] | string;
  template?: string;
}

export interface CampaignCoreApi {
  readonly DEFAULT_DISCOUNTS: Discounts;
  readonly DEFAULT_SENDERS: readonly string[];
  readonly TEMPLATES: readonly Template[];
  /** Em quantas vezes as modalidades parceladas saem: 12, 20 e 21. */
  readonly PARCELAMENTOS: readonly number[];
  readonly MAILING_FIELDS: readonly MailingField[];
  normalizeHeader(value: unknown): string;
  parseDelimited(text: string, delimiter: string): string[][];
  detectDelimiter(text: string): string;
  decodeBytes(input: ArrayBuffer | Uint8Array): { text: string; encoding: string };
  parseMailing(input: string | ArrayBuffer | Uint8Array): ParsedResult;
  isReport245Rows(rows: unknown[][]): boolean;
  parseReport245(rows: unknown[][]): ParsedResult;
  parseNumber(value: unknown): number;
  percentToRate(value: unknown): number;
  mapCompany(saleType: unknown): string;
  /** O 0800 de atendimento da empresa (nome de `mapCompany`). */
  supportPhoneFor(company: string): string;
  /** Troca os 0800 conhecidos escritos no texto por {{atendimento}}. */
  withCompanySupportPhone(template: string): string;
  formatOperator(value: unknown): string;
  formatCurrency(value: number | string | null | undefined): string;
  formatPercent(value: unknown): string;
  deriveRecord(record: RawRecord, discounts?: Partial<Discounts>): CampaignItem;
  variablesFor(item: CampaignItem, discounts: Discounts): Record<string, string>;
  /** O CPF com só os 5 últimos dígitos: «xxx.xxx.789-00». */
  maskCpf(value: unknown): string;
  renderTemplate(template: string, variables: Record<string, string>): string;
  templateRequiresFinancialData(template: string): boolean;
  normalizeSenders(senders: string[] | string): string[];
  buildCampaign(records: RawRecord[], options?: BuildCampaignOptions): CampaignItem[];
  campaignToCsv(items: CampaignItem[]): string;
  /** As colunas da campanha exportada (CSV e Excel). */
  readonly CAMPAIGN_COLUMNS: readonly string[];
  campaignRow(item: CampaignItem): string[];
  excludedRecordsToCsv(parsed: ParsedResult): string;
  templateById(id: string): Template;
  isValidPhone(value: unknown): boolean;
  phoneForWhatsApp(value: unknown): string;
}

export const CampaignCore: CampaignCoreApi;
