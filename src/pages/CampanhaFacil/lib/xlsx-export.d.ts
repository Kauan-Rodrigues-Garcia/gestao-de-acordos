// Tipos da API pública de xlsx-export.js (escritor XLSX portado verbatim).
import type { CampaignItem } from './campaign-core';

export interface CampaignXlsxApi {
  /** Gera o .xlsx (ZIP+XML) da campanha como bytes. */
  createWorkbook(items: CampaignItem[]): Uint8Array;
  /** Confere se os bytes formam um .xlsx válido (assinatura ZIP + EOCD). */
  isValidWorkbook(bytes: Uint8Array): boolean;
}

export const CampaignXlsx: CampaignXlsxApi;
