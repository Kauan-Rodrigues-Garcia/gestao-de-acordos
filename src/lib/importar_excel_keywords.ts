/**
 * Dicionário de keywords do parser de Excel e função pura `detectarCampo`.
 *
 * Este módulo foi extraído de `src/pages/ImportarExcel.tsx` para permitir
 * testes unitários sem carregar todo o componente (que arrasta supabase,
 * hooks, UI, etc.). A implementação funcional permanece idêntica — o
 * `ImportarExcel.tsx` passa a re-exportar/consumir `detectarCampo` daqui.
 */

export type CampoDestino =
  | 'nome_cliente' | 'nr_cliente' | 'vencimento' | 'valor'
  | 'whatsapp' | 'status' | 'tipo' | 'parcelas'
  | 'observacoes' | 'data_cadastro' | 'instituicao' | 'estado_uf' | '_ignorar';

// ─── Dicionário de correspondência header → campo lógico ──────────────────
//
// Keywords por destino. Ordem dentro do array não importa — a prioridade
// entre destinos é definida por `CAMPO_PRIORIDADE` abaixo.
//
// IMPORTANTE: sem keywords de 1 ou 2 chars — causavam contaminação via
// `startsWith`. 'n' em nr_cliente fazia detectarCampo('NOME') → nr_cliente,
// 'vl' em valor → falso positivo.
export const KEYWORDS: Record<CampoDestino, string[]> = {
  nome_cliente:  ['nome', 'cliente', 'devedor', 'razao social', 'nome cliente', 'nome do cliente', 'tomador'],
  nr_cliente:    ['nr', 'num', 'nro', 'numero', 'cod', 'codigo', 'contrato', 'cpf', 'cnpj', 'acordo'],
  vencimento:    ['venc', 'vencimento', 'data venc', 'data de venc', 'prazo', 'validade', 'data'],
  valor:         ['valor', 'vlr', 'montante', 'r$', 'valor acordo'],
  whatsapp:      ['whats', 'whatsapp', 'wpp', 'cel', 'celular', 'tel', 'telefone', 'fone', 'zap', 'contato', 'numero celular'],
  // 'estado' REMOVIDO daqui — agora pertence a estado_uf (UF do cliente p/ PaguePlay).
  status:        ['status', 'situacao'],
  tipo:          ['tipo', 'forma', 'modalidade'],
  parcelas:      ['parc', 'parcelas', 'parcela', 'qtd parc', 'nparc', 'prestacoes', 'qtd parcelas', 'quant parcelas', 'quantidade parcelas', 'quant. parcelas', 'quantidade de parcelas'],
  data_cadastro: ['cadastro', 'data cadastro', 'inclusao'],
  observacoes:   ['obs', 'observ', 'nota', 'anotacao', 'comentario', 'descricao'],
  // 'inscricao'/'inscrição' são o header natural da planilha PaguePlay para o NR único.
  instituicao:   ['inst', 'instituicao', 'instituição', 'inscricao', 'inscrição', 'banco', 'origem', 'empresa', 'credor', 'entidade', 'financeira'],
  // UF do cliente — usado no fluxo PaguePlay e serializado em observações como [ESTADO:XX].
  estado_uf:     ['estado', 'uf', 'estado uf', 'uf cliente', 'estado cliente'],
  _ignorar:      [],
};

// Ordem de prioridade dos campos na detecção.
// WHATSAPP vem antes de NR para evitar que números de celular sejam capturados como NR.
// PARCELAS vem antes de VALOR para evitar que PARC. seja confundido com VALOR.
// estado_uf antes de status: header 'Estado' vai para UF (PaguePlay), não para status.
export const CAMPO_PRIORIDADE: CampoDestino[] = [
  'parcelas', 'whatsapp', 'nr_cliente', 'nome_cliente', 'vencimento', 'valor',
  'estado_uf', 'status', 'tipo', 'data_cadastro', 'observacoes', 'instituicao',
];

/** Normaliza string para comparação: minúsculo + sem acento + só alfanum. */
export function norm(s: string): string {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detecta qual campo melhor corresponde a um header.
 *
 * Usa `CAMPO_PRIORIDADE` para garantir que 'parc'/'parc.' → parcelas, não valor.
 *
 * BUG FIX: a 2ª passagem (startsWith) só é usada para prefixos com >= 3 chars.
 * Isso evita que 'nr' (2 chars) faça 'NUMERO CELULAR'.startsWith('nr') = false
 * (ok), mas garante que 'num' (3 chars) capture 'NUMERO' corretamente.
 */
export function detectarCampo(header: string): CampoDestino {
  const h = norm(header);
  if (!h) return '_ignorar';

  // 1ª passagem: match exato, na ordem de prioridade
  for (const campo of CAMPO_PRIORIDADE) {
    const palavras = KEYWORDS[campo];
    if (palavras.some(p => norm(p) === h)) return campo;
  }
  // 2ª passagem: prefixo mútuo — só usa startsWith se o prefixo tiver >= 3 chars.
  for (const campo of CAMPO_PRIORIDADE) {
    const palavras = KEYWORDS[campo];
    if (palavras.some(p => {
      const np = norm(p);
      if (np.length < 3 || h.length < 3) return false;
      return h.startsWith(np) || np.startsWith(h);
    })) return campo;
  }
  return '_ignorar';
}
