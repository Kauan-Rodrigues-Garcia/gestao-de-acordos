// Tipos da API pública de campaign-core.js (lógica portada verbatim do app
// original). A implementação é JS puro; aqui declaramos só o contrato que a UI
// React consome.

export interface Discounts {
  overdue: number;
  settlement: number;
  interest: number;
  bundle: number;
  annual: number;
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
  sourceType?: 'mailing' | 'collections-report' | 'report-245';
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
  updatedValue: number | null;
  overdueDiscounted: number | null;
  settlement: number | null;
  valueWithInterest: number | null;
  bundle: number | null;
  annual: number | null;
  cardSettlement: number | null;
  cardAnnual: number | null;
  saleType: string;
  company: string;
  phone: string;
  phoneDigits: string;
  whatsAppPhone: string;
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
  normalizeHeader(value: unknown): string;
  parseDelimited(text: string, delimiter: string): string[][];
  detectDelimiter(text: string): string;
  decodeBytes(input: ArrayBuffer | Uint8Array): { text: string; encoding: string };
  parseMailing(input: string | ArrayBuffer | Uint8Array): ParsedResult;
  isCollectionsReportRows(rows: unknown[][]): boolean;
  parseCollectionsReport(rows: unknown[][]): ParsedResult;
  isReport245Rows(rows: unknown[][]): boolean;
  parseReport245(rows: unknown[][]): ParsedResult;
  parseNumber(value: unknown): number;
  percentToRate(value: unknown): number;
  mapCompany(saleType: unknown): string;
  formatOperator(value: unknown): string;
  formatCurrency(value: number | string | null | undefined): string;
  formatPercent(value: unknown): string;
  deriveRecord(record: RawRecord, discounts?: Partial<Discounts>): CampaignItem;
  variablesFor(item: CampaignItem, discounts: Discounts): Record<string, string>;
  renderTemplate(template: string, variables: Record<string, string>): string;
  templateRequiresFinancialData(template: string): boolean;
  normalizeSenders(senders: string[] | string): string[];
  buildCampaign(records: RawRecord[], options?: BuildCampaignOptions): CampaignItem[];
  campaignToCsv(items: CampaignItem[]): string;
  excludedRecordsToCsv(parsed: ParsedResult): string;
  templateById(id: string): Template;
  isValidPhone(value: unknown): boolean;
  phoneForWhatsApp(value: unknown): string;
}

export const CampaignCore: CampaignCoreApi;
