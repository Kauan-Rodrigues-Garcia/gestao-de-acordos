/**
 * normalizar.ts — normalizações seguras para a importação de planilhas de
 * operador (leitura + vínculo). Determinístico e sem dependência de arquivo:
 * cobre login, cabeçalhos e o mapeamento semântico das colunas.
 *
 * IMPORTANTE: o objetivo do módulo é LER os Excel e vincular ao operador certo.
 * Nada aqui move dinheiro nem dispara pagamento.
 */

/** Espaços "invisíveis" (nbsp, zero-width, narrow/ideographic, BOM) → espaço. */
const ESPACOS_UNICODE = /[\u00A0\u1680\u2000-\u200D\u202F\u205F\u3000\uFEFF]/g;
/** Diacríticos combinantes (para remover acentos após NFD). */
const DIACRITICOS = /[\u0300-\u036F]/g;

/**
 * Normaliza o Login da planilha para casar com o operador cadastrado.
 * - remove espaços (inclui Unicode/nbsp) das extremidades;
 * - colapsa espaços internos;
 * - minúsculas;
 * - normalização Unicode (NFKC).
 * O valor ORIGINAL deve ser preservado pelo chamador (auditoria).
 */
export function normalizarLogin(bruto: string | null | undefined): string {
  if (bruto == null) return '';
  return String(bruto)
    .replace(ESPACOS_UNICODE, ' ')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Normaliza um cabeçalho de coluna para o mapeamento semântico:
 * - nbsp/espaços Unicode → espaço;
 * - quebras de linha → espaço;
 * - colapsa espaços duplicados + trim;
 * - minúsculas;
 * - remove acentos.
 * Mantém pontuação relevante (ex.: "%", "-").
 */
export function normalizarCabecalho(bruto: unknown): string {
  if (bruto == null) return '';
  return String(bruto)
    .replace(ESPACOS_UNICODE, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Normaliza o NR (mesma regra do pix_automatico.service: trim + minúsculas). */
export function normalizarNr(nr: string | null | undefined): string {
  return String(nr ?? '').trim().toLowerCase();
}

/** Chaves semânticas das colunas da planilha. */
export type CampoPlanilha =
  | 'data'
  | 'login'
  | 'matricula'
  | 'nr'
  | 'valorNota'
  | 'percentual'
  | 'valorCalculado'
  | 'metaBatidaPendente'
  | 'super';

/** Cabeçalho normalizado → campo semântico. Ordem importa (mais específico 1º). */
const CABECALHO_PARA_CAMPO: Array<[matcher: (h: string) => boolean, campo: CampoPlanilha]> = [
  [h => h === 'data', 'data'],
  [h => h === 'login', 'login'],
  [h => h === 'matricula' || h === 'cracha', 'matricula'],
  [h => h === 'nr', 'nr'],
  [h => h === 'valor de nota', 'valorNota'],
  [h => h === '%' || h === 'percentual', 'percentual'],
  [h => h === 'meta batida-pendente' || h === 'meta batida pendente', 'metaBatidaPendente'],
  // "valor" isolado só DEPOIS de "valor de nota" e "meta batida-pendente"
  [h => h === 'valor', 'valorCalculado'],
  [h => h === 'super', 'super'],
];

/**
 * Mapeia a linha de cabeçalhos para { campo → índice de coluna }.
 * Localiza por conteúdo (não por letra fixa de coluna). A primeira ocorrência
 * de cada campo vence. Campos ausentes simplesmente não aparecem no mapa.
 */
export function mapearCabecalhos(linhaCabecalho: unknown[]): Partial<Record<CampoPlanilha, number>> {
  const mapa: Partial<Record<CampoPlanilha, number>> = {};
  linhaCabecalho.forEach((celula, idx) => {
    const h = normalizarCabecalho(celula);
    if (!h) return;
    for (const [matcher, campo] of CABECALHO_PARA_CAMPO) {
      if (mapa[campo] === undefined && matcher(h)) { mapa[campo] = idx; break; }
    }
  });
  return mapa;
}

/** Campos obrigatórios para a linha ser considerada financeira/válida. */
export const CAMPOS_OBRIGATORIOS: CampoPlanilha[] = ['login', 'nr', 'metaBatidaPendente'];

/** true se o mapa tem todas as colunas obrigatórias para ler pagamentos. */
export function cabecalhoTemObrigatorios(mapa: Partial<Record<CampoPlanilha, number>>): boolean {
  return CAMPOS_OBRIGATORIOS.every(c => mapa[c] !== undefined);
}
