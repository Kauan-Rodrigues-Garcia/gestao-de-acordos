/**
 * ImportarExcel.tsx — Parser flexível por blocos e palavras-chave
 *
 * NOVO COMPORTAMENTO:
 * - Detecta automaticamente dois modos:
 *   1. Tabela contínua (formato tradicional — 1 cabeçalho no topo)
 *   2. Blocos por data (ex: linha com "02/04/2025" → cabeçalho com NR/VALOR/... → linhas)
 *
 * - Palavras-chave reconhecidas com tolerância a variações:
 *   NR, VALOR, PARC, PARCELA, STATUS, WHATS, WHATSAPP, TELEFONE, INSTITUIÇÃO,
 *   CLIENTE, NOME, DATA, VENCIMENTO
 *
 * - Ignora automaticamente: linhas em branco, cabeçalhos repetidos, rodapés, totais
 * - Cada bloco pode ter colunas em posições diferentes
 * - A data do bloco é usada como vencimento quando não existe coluna específica
 * - Pré-visualização mostra o que foi reconhecido e o que tem problema
 * - Relatório final completo
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { read as xlsxRead, utils as xlsxUtils } from '@e965/xlsx';
import { motion } from 'framer-motion';
import {
  Upload, FileSpreadsheet, ArrowLeft, CheckCircle2,
  XCircle, ChevronRight, RefreshCw, AlertCircle,
  ArrowRight, Info, Building2, Eye, Layers, Bot, Shield,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { supabase } from '@/lib/supabase';
import { ROUTE_PATHS, formatDate, formatCurrency, isPaguePlay, getTodayISO, buildObservacoesComEstado } from '@/lib/index';
import { safeNum } from '@/lib/money';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fetchAIConfig } from '@/services/aiConfig.service';
import { aiNormalizeImport } from '@/services/aiImport.service';
import { criarNotificacao } from '@/services/notificacoes.service';
import { verificarNrsDuplicadosEmLote } from '@/services/acordos.service';
import {
  classificarNrsImportados,
  agruparPorCategoria,
  type ClassificacaoNR,
  type CategoriaImport,
} from '@/services/classificar_nrs_import.service';
import { processarImportacaoEmLote, type PayloadAcordoImport } from '@/services/importar_excel_batch.service';
import { autenticarLider, type AutorizadorInfo } from '@/services/autorizacao_lider.service';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ─── Tipos ─────────────────────────────────────────────────────────────────

import {
  CAMPO_PRIORIDADE, KEYWORDS, detectarCampo as detectarCampoPuro, norm,
  type CampoDestino,
} from '@/lib/importar_excel_keywords';

// Re-export para compatibilidade com o teste unitário que importa daqui.
export const detectarCampo = detectarCampoPuro;

interface AcordoImportado {
  linhaOriginal: number;
  blocoData?:    string;   // data do bloco (quando modo por blocos)
  nome_cliente:  string;
  nr_cliente:    string;
  vencimento:    string | null;
  valor:         number | null;
  whatsapp:      string | null;
  status:        string;
  tipo:          string;
  parcelas:      number;
  observacoes:   string | null;
  instituicao:   string | null;
  /** UF do cliente (PaguePlay). Serializada em observacoes via buildObservacoesComEstado. */
  estado_uf:     string | null;
  valido:        boolean;
  erros:         string[];
}

// Nota: KEYWORDS, CAMPO_PRIORIDADE, norm e detectarCampo foram movidos para
// `src/lib/importar_excel_keywords.ts` para permitir testes unitários puros
// (sem o overhead de carregar o componente inteiro). A função continua
// disponível neste arquivo via re-export acima.
void KEYWORDS; void CAMPO_PRIORIDADE; void norm;

/** Detecta se uma célula é uma data válida de bloco, retornando ISO ou null.
 *  Aceita: dd/mm/yyyy, dd/mm/yy, yyyy-mm-dd e número serial do Excel.
 *
 *  IMPORTANTE: só retorna data se o valor PARECE data — não confunde número
 *  genérico com data. Serial Excel só é aceito na faixa real de 2000-2035. */
function isCelulaData(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null;

  // ── Objeto Date JavaScript (xlsx pode entregar mesmo com cellDates:false) ─
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return null;
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    if (y >= 2000 && y <= 2100) return `${y}-${m}-${d}`;
    return null;
  }

  const s = String(valor).trim();
  if (!s) return null;

  // ── dd/mm/yyyy ou dd-mm-yyyy (1 ou 2 dígitos no dia/mês) ────────────────
  const m1 = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m1) {
    const [, d, mo, y] = m1;
    const year = y.length === 2 ? `20${y}` : y;
    const dd   = d.padStart(2, '0');
    const mm   = mo.padStart(2, '0');
    if (Number(mm) < 1 || Number(mm) > 12) return null;
    if (Number(dd) < 1 || Number(dd) > 31) return null;
    const iso = `${year}-${mm}-${dd}`;
    const dt  = new Date(iso + 'T00:00:00');
    if (!isNaN(dt.getTime()) && dt.getFullYear() >= 2000 && dt.getFullYear() <= 2100) return iso;
    return null;
  }
  // ── dd/mm SEM ANO (ex: "01/02", "15/03") ─────────────────────────────────
  // Usa o ano atual como fallback. Ocorre frequentemente em planilhas de blocos.
  const mSemAno = s.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (mSemAno) {
    const [, d, mo] = mSemAno;
    const dd = d.padStart(2, '0');
    const mm = mo.padStart(2, '0');
    if (Number(mm) < 1 || Number(mm) > 12) return null;
    if (Number(dd) < 1 || Number(dd) > 31) return null;
    const year = new Date().getFullYear();
    const iso = `${year}-${mm}-${dd}`;
    const dt  = new Date(iso + 'T00:00:00');
    if (!isNaN(dt.getTime())) return iso;
    return null;
  }
  // ── yyyy-mm-dd ──────────────────────────────────────────────────────────
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    const dt = new Date(s + 'T00:00:00');
    if (!isNaN(dt.getTime()) && dt.getFullYear() >= 2000) return s;
    return null;
  }
  // ── Número serial Excel ──────────────────────────────────────────────────
  // BUG FIX: serial Excel só é aceito quando o valor vem como JS `number` E
  // NÃO é inteiro "redondo" pequeno (que provavelmente é um NR de cliente).
  // Range válido: 36526 (01/01/2000) a 47848 (31/12/2031).
  // IMPORTANTE: exigimos que seja `number` — strings numéricas não são aceitas
  // como serial para evitar confundir NR de cliente (ex: "40000") com data.
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const n = Math.round(valor);
    if (n > 36526 && n < 47848) {
      const dt = new Date(Math.round((valor - 25569) * 86400 * 1000));
      if (!isNaN(dt.getTime())) {
        const y = dt.getUTCFullYear();
        if (y >= 2000 && y <= 2031) return dt.toISOString().split('T')[0];
      }
    }
  }
  return null;
}

/** Converte valor bruto para data ISO */
function normalizarData(v: unknown): string | null {
  return isCelulaData(v);
}

/** Converte valor para número monetário.
 *  Aceita: "R$ 250,00" | "250.00" | "1.234,56" | 250 (number do Excel) */
function normalizarValor(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  // Se já é número (Excel pode entregar direto)
  if (typeof v === 'number') return isFinite(v) && v > 0 ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  // Remove tudo que não seja dígito, vírgula, ponto ou sinal negativo
  const limpo = s.replace(/[^\d,.-]/g, '');
  if (!limpo) return null;
  let normalizado: string;
  if (limpo.includes(',') && limpo.includes('.')) {
    // Formato BR: "1.234,56" → remove pontos de milhar → troca vírgula por ponto
    normalizado = limpo.replace(/\./g, '').replace(',', '.');
  } else if (limpo.includes(',')) {
    // Só vírgula: pode ser "250,00" (BR) ou "1,234" (EN milhar) — assume BR
    normalizado = limpo.replace(',', '.');
  } else {
    normalizado = limpo;
  }
  const n = parseFloat(normalizado);
  return isNaN(n) || n < 0 ? null : n;
}

/**
 * Normaliza telefone/WhatsApp para string de dígitos.
 * Aceita todos os formatos usados na planilha:
 *   (64) 99328-6416  →  64993286416
 *   95991385857      →  95991385857
 *   64 99328 6416    →  64993286416
 *
 * REGRA: remove tudo que não seja dígito; exige entre 10 e 13 dígitos.
 * Números com < 10 ou > 13 dígitos são descartados (evitar confundir com NR ou valor).
 */
function normalizarTelefone(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  // Se for número do Excel (ex: 64993286416 como número)
  let raw: string;
  if (typeof v === 'number') {
    // Número muito grande → pode ser celular armazenado como número
    raw = String(Math.round(v));
  } else {
    raw = String(v).trim();
  }
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  // Exige entre 10 e 13 dígitos para ser considerado telefone
  // (10 = celular sem DDI, 13 = +55 + DDD + celular)
  if (digits.length < 10 || digits.length > 13) return null;
  return digits;
}

/** Normaliza parcelas: aceita '1x','3x','3.','8.','03x','8 parcelas','1' → inteiro
 *  Qualquer sequência de dígitos + sufixo opcional (x, X, ., texto) → extrai só os dígitos */
function normalizarParcelas(v: unknown): number {
  if (v === null || v === undefined || String(v).trim() === '') return 1;
  // Se já for número direto do Excel
  if (typeof v === 'number') {
    const n = Math.round(v);
    return n >= 1 ? n : 1;
  }
  const s = String(v).trim();
  // Extrai o PRIMEIRO grupo de dígitos — ignora sufixos 'x', '.', ' parcelas', etc.
  const match = s.match(/^0*(\d+)/);
  if (!match) return 1;
  const n = parseInt(match[1], 10);
  return isNaN(n) || n < 1 ? 1 : n;
}

function normalizarStatus(v: unknown): string {
  const s = norm(String(v || ''));
  if (s.includes('pago') || s.includes('quitado') || s.includes('liquidado')
      || s.includes('baixado') || s.includes('pago total')) return 'pago';
  if (s.includes('nao pago') || s.includes('nao_pago') || s.includes('cancelado')
      || s.includes('inadimplente') || s.includes('sem retorno')) return 'nao_pago';
  return 'verificar_pendente';
}

function normalizarTipo(v: unknown): string {
  const s = String(v || '').toLowerCase();
  if (s.includes('recorrente')) return 'cartao_recorrente';
  if (s.includes('automatico') || s.includes('automático') || (s.includes('pix') && s.includes('auto'))) return 'pix_automatico';
  if (s.includes('pix')) return 'pix';
  if (s.includes('cart')) return 'cartao';
  return 'boleto';
}

// ─── Conectores de nome ────────────────────────────────────────────────────────────────────
// Palavras curtas que NÃO desqualificam um nome composto.
// Ex: "LEONARDO DA SILVA E SILVA" → DA e E são conectores válidos.
const CONECTORES_NOME = new Set([
  'da', 'de', 'do', 'dos', 'das', 'e', 'di', 'du', 'del', 'von', 'van',
  'el', 'la', 'los', 'las', 'y',
]);

/**
 * ─── HEURÍSTICA DE NOME COMPLETO (v3) ───────────────────────────────────────
 *
 * Decide se um valor de célula parece um nome de pessoa/empresa.
 * Projetada para ser PERMISSIVA: prefere aceitar um nome duvidoso a rejeitar
 * um nome real. O pior caso é exibir "(sem nome)" incorretamente.
 *
 * ALGORITMO:
 *  1. Rejeições imediatas (data, número puro, muito curto, seq. de 5+ dígitos)
 *  2. Se for palavra-chave de cabeçalho reconhecida → false
 *  3. Tokeniza por espaço; precisa de ≥ 2 tokens
 *  4. Conta tokens alfanuméricos (letras + acentos + hífen) e numéricos puros
 *  5. Precisa de ≥ 1 token substantivo (não conector, ≥ 2 chars)
 *  6. Proporção mínima de tokens alfabéticos: 40% (muito permissivo)
 *
 * CASOS TESTADOS:
 *  ✓ "LEONARDO DA SILVA E SILVA"  → true
 *  ✓ "FABIANA MOREIRA PONCIANO"   → true
 *  ✓ "JOSE CARLOS"               → true
 *  ✓ "SILVA E SOUZA"             → true (E é conector)
 *  ✗ "VALOR"                     → false (palavra-chave)
 *  ✗ "R$ 250,00"                 → false (número puro)
 *  ✗ "05/07/2025"                → false (data)
 *  ✗ "12345678901"               → false (CPF — 11 dígitos)
 */
function pareceNomeCompleto(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  const s = String(valor).trim();
  if (!s || s.length < 4) return false;

  // ── 1. Rejeições rápidas ────────────────────────────────────────────────
  // Data válida → não é nome
  if (isCelulaData(valor)) return false;

  // Só dígitos, pontos, vírgulas, R$, % ou espaços → não é nome
  // ("R$ 250,00", "1.234,56", "250")
  if (/^[\d.,R$%\s+-]+$/.test(s)) return false;

  // Sequência de 5+ dígitos consecutivos → CPF, CNPJ, número de contrato
  if (/\d{5,}/.test(s)) return false;

  // ── 2. Palavra-chave de cabeçalho → não é nome ──────────────────────────
  // detectarCampo retorna '_ignorar' para textos desconhecidos
  if (detectarCampo(s) !== '_ignorar') return false;

  // ── 3. Tokenizar ────────────────────────────────────────────────────────
  // Remove pontuação solta (exceto hífen dentro de palavras) e divide por espaço.
  // Aceita letras acentuadas, hífen no meio (ex: "SOUZA-LIMA").
  const tokens = s
    .split(/\s+/)
    .map(t => t.replace(/^[^a-zA-ZÀ-ÿ0-9]+|[^a-zA-ZÀ-ÿ0-9]+$/g, ''))  // trim pontuação
    .filter(t => t.length > 0);

  if (tokens.length < 2) return false;

  // ── 4. Classificar tokens ───────────────────────────────────────────────
  let substantivos = 0;  // não-conector, ≥ 2 chars
  let alfabeticos  = 0;  // predominantemente letras (inclui hífen)
  let numericos    = 0;  // só dígitos

  for (const t of tokens) {
    const tn = norm(t);
    if (!tn) continue;

    if (/^\d+$/.test(tn)) {
      numericos++;
      continue;
    }

    // Token com pelo menos 50% de caracteres alfabéticos → conta como alfabético
    const letras = (t.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
    if (letras >= Math.ceil(t.length * 0.5)) {
      alfabeticos++;
      // Substantivo: não é conector puro
      if (t.length >= 2 && !CONECTORES_NOME.has(tn)) {
        substantivos++;
      }
    }
  }

  // ── 5. Critérios de aceitação ───────────────────────────────────────────
  // Pelo menos 1 substantivo real
  if (substantivos < 1) return false;

  // Proporção de tokens alfabéticos ≥ 40% do total
  if (alfabeticos < Math.ceil(tokens.length * 0.4)) return false;

  // Numéricos não podem superar alfabéticos
  if (numericos > alfabeticos) return false;

  return true;
}

/**
 * ─── HEURÍSTICA: CÉLULA PARECE TELEFONE/WHATSAPP ────────────────────────────
 *
 * Critérios (qualquer um é suficiente):
 *  1. Contém '(' e ')' E tem pelo menos 8 dígitos  →  ex: (95) 98406-8415
 *  2. 10-13 dígitos após remover não-dígitos        →  ex: 95984068415
 *  3. number do Excel com 10-11 dígitos             →  ex: 95984068415 (stored as number)
 */
function pareceWhatsapp(cell: unknown): boolean {
  if (cell === null || cell === undefined || cell === '') return false;
  if (typeof cell === 'number') {
    const raw = String(Math.round(cell));
    const d = raw.replace(/\D/g, '');
    return d.length >= 10 && d.length <= 13;
  }
  const raw = String(cell).trim();
  if (!raw) return false;
  // Critério 1: formato com parênteses de DDD  →  (XX) XXXXX-XXXX
  if (raw.includes('(') && raw.includes(')')) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 13) return true;
  }
  // Critério 2: 10-13 dígitos após limpeza
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
}

/**
 * ─── HEURÍSTICA: CÉLULA PARECE TEXTO INSTITUCIONAL ──────────────────────────
 *
 * Retorna true se o valor parece ser um nome de instituição:
 *  - Texto puro em maiúsculo com 3-30 caracteres
 *  - Não é número, data ou palavra-chave de acordo
 *  - Pode ser multi-palavra (ex: "BANCO DO BRASIL")
 *  - Exemplos: "BOOKPLAY", "BRADESCO", "BANCO DO BRASIL"
 */
function pareceInstituicao(cell: unknown): boolean {
  if (!cell || String(cell).trim() === '') return false;
  const s = String(cell).trim();
  if (s.length < 3 || s.length > 60) return false;
  if (isCelulaData(cell)) return false;
  // Não pode ser número puro
  if (/^[\d.,\s]+$/.test(s)) return false;
  // Não pode ser palavra-chave de acordo conhecida
  const campo = detectarCampo(s);
  if (campo !== '_ignorar' && campo !== 'instituicao') return false;
  // Deve ter majoritariamente letras (pelo menos 60%)
  const letras = (s.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  if (letras < Math.ceil(s.length * 0.5)) return false;
  // Não pode ter mais de 4 palavras (evitar nomes de pessoa)
  // ... a menos que tenha palavras conhecidas de instituição
  const sNorm = norm(s);
  const palavrasInstituicao = ['banco', 'financeira', 'credito', 'capital', 'invest',
    'seguros', 'previdencia', 'cooperativa', 'fundo', 'grupo', 'cia', 'ltda', 'sa', 's a'];
  const temPalavraInst = palavrasInstituicao.some(p => sNorm.includes(p));
  // Aceita se tem palavra de instituição OU é palavra única/dupla em maiúsculo
  const palavras = s.trim().split(/\s+/);
  const emMaiusculo = s === s.toUpperCase() && s.length > 3;
  return temPalavraInst || palavras.length <= 3 || emMaiusculo;
}

/**
 * ─── MAPA POSICIONAL (SEM CABEÇALHO) ────────────────────────────────────────
 *
 * Usado quando não há linha de cabeçalho formal.
 * Estrutura esperada do acordo em bloco:
 *   [A] nome  [B] NR  [C] valor  [D] parcelas  [E] status  [F] whats  [G] inst
 *
 * Para acordo contínuo (col A = vencimento):
 *   [A] venc  [B] NR  [C] valor  [D] parcelas  ...opcionais
 */

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFICADOR DE LINHAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tipos possíveis de linha numa planilha de acordos.
 *
 * data_bloco    — linha com apenas uma data (ex: "20/07/2025")
 * cabecalho     — linha com ≥2 palavras-chave de campo (NR, VALOR, WHATS…)
 * acordo_bloco  — linha de dado cujo vencimento vem do bloco acima
 * acordo_cont   — linha de dado que já traz a data na col A
 * ruido         — cabeçalho repetido, texto isolado (mês, título), rodapé
 * vazia         — completamente vazia
 */
type TipoLinha =
  | 'data_bloco'
  | 'cabecalho'
  | 'acordo_bloco'
  | 'acordo_cont'
  | 'ruido'
  | 'vazia';

/** Células não-vazias da linha (remove null, undefined, '', '0') */
function celulasDaLinha(row: unknown[]): unknown[] {
  return row.filter(c => {
    if (c === null || c === undefined) return false;
    const s = String(c).trim();
    return s !== '' && s !== '0';
  });
}

/** Verifica se uma linha está totalmente vazia */
function isLinhaVazia(cells: unknown[]): boolean {
  return celulasDaLinha(cells).length === 0;
}

/** Verifica se uma linha é de total/subtotal (ignorar) */
function isLinhaTotaisOuRodape(cells: unknown[]): boolean {
  const primeira = norm(String(cells[0] || ''));
  return (
    primeira.startsWith('total') ||
    primeira.startsWith('subtotal') ||
    primeira === 'soma' ||
    primeira === 'total geral' ||
    primeira === 'media' ||
    primeira === 'média'
  );
}

/**
 * Classifica uma linha em um dos TipoLinha.
 * Esta é a função central que substitui toda a detecção dispersa anterior.
 *
 * ORDEM DE TESTE (importante — não trocar):
 *  1. Vazia
 *  2. Data de bloco   → ≤4 células não-vazias, uma é data, resto são labels
 *  3. Ruído           → só texto (mês, título, totais, cabeçalho repetido)
 *  4. Cabeçalho       → ≥2 palavras-chave de campo
 *  5. Acordo contínuo → col A é data + col B é número
 *  6. Acordo de bloco → col A é texto (nome), demais têm números
 *  7. Ruído           → fallback
 */
/** Campos canônicos usados para identificar linhas de cabeçalho */
const CAMPOS_CANONICOS_LINHA: CampoDestino[] = [
  'nr_cliente','valor','whatsapp','status','parcelas','nome_cliente','vencimento','instituicao','estado_uf','tipo',
];

export function classificarLinha(row: unknown[]): TipoLinha {
  const nv = celulasDaLinha(row);

  // ── 1. Vazia ──────────────────────────────────────────────────────────────
  if (nv.length === 0) return 'vazia';

  // ── 2. Data de bloco ──────────────────────────────────────────────────────
  // Linha isolada com apenas uma data (e opcionalmente labels textuais como
  // "Vencimento:", "FEVEREIRO/2026", "Período: 01/02" etc.)
  if (nv.length <= 4) {
    const LABELS_IGNORAR = new Set([
      'data','vencimento','data venc','data de venc','prazo','vencimento:','data:',
      'periodo','mes','competencia','data vencimento','periodo:','mes:',
      // meses por extenso
      'janeiro','fevereiro','marco','abril','maio','junho',
      'julho','agosto','setembro','outubro','novembro','dezembro',
    ]);
    // Regex para rótulos de mês/período como "NOVEMBRO/2025", "FEV/2026", "02/2026"
    const REG_LABEL_PERIODO = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|[a-z]{4,})[/-]?\d{0,4}$/i;
    const REG_MES_ANO       = /^\d{1,2}\/\d{4}$/;  // "02/2026"

    let dataCandidato: string | null = null;
    let celulasDado = 0;

    for (const c of nv) {
      const s = String(c).trim();
      const n = norm(s);
      if (LABELS_IGNORAR.has(n)) continue;
      if (REG_LABEL_PERIODO.test(n)) continue;   // "novembro/2025", "fev/2026"
      if (REG_MES_ANO.test(s)) continue;         // "02/2026"
      // Remove dois-pontos finais para testar labels como "Vencimento:"
      if (LABELS_IGNORAR.has(n.replace(/:$/, ''))) continue;

      const campoConhecido = detectarCampo(s);
      if (campoConhecido !== '_ignorar' && campoConhecido !== 'vencimento') {
        celulasDado++;   // palavra-chave de acordo → esta linha é cabeçalho
        continue;
      }
      const dt = isCelulaData(c);
      if (dt) { dataCandidato = dt; continue; }

      // Texto que não é label nem data nem campo → dado real
      celulasDado++;
    }

    if (dataCandidato && celulasDado === 0) return 'data_bloco';
  }

  // ── 3. Ruído / Cabeçalho de 1 célula ─────────────────────────────────────
  // Linha com uma única célula não-data.
  // Verificar ANTES de classificar como ruído se a célula é uma keyword canônica
  // (ex: "NR" repetido entre blocos = linha de cabeçalho, não ruído).
  if (nv.length === 1) {
    if (isCelulaData(nv[0])) return 'data_bloco';  // 1 célula de data → data_bloco
    const s1 = String(nv[0]).trim();
    // Se é número puro, é ruído (ex: totais, índices soltos)
    if (/^\d+([.,]\d+)?$/.test(s1)) return 'ruido';
    // Se a única célula é uma keyword de campo → cabeçalho isolado
    const campo1 = detectarCampo(s1);
    if (campo1 !== '_ignorar' && CAMPOS_CANONICOS_LINHA.includes(campo1)) return 'cabecalho';
    // Qualquer outro texto isolado (ex: "NOVEMBRO/2025", "Setor A") → ruído
    return 'ruido';
  }

  // Totais/rodapé
  if (isLinhaTotaisOuRodape(row)) return 'ruido';

  // ── 4. Cabeçalho ─────────────────────────────────────────────────────────
  // ≥2 keywords canônicas entre as células (linha de cabeçalho multi-coluna)
  // Nota: linha de 1 célula com keyword já foi tratada no passo 3.
  {
    let contKeywords = 0;
    for (const c of nv) {
      const s = String(c).trim();
      if (/^\d+([.,]\d+)?$/.test(s)) continue;  // número puro
      if (isCelulaData(c)) continue;             // data
      const campo = detectarCampo(s);
      if (campo !== '_ignorar' && CAMPOS_CANONICOS_LINHA.includes(campo)) contKeywords++;
    }
    if (contKeywords >= 2) return 'cabecalho';
  }

  // ── 5. Acordo contínuo ────────────────────────────────────────────────────
  // Col A é uma data válida E col B parece NR (número)
  {
    const col0 = row[0];
    const col1 = row[1];
    if (isCelulaData(col0) && col1 !== undefined && col1 !== null && col1 !== '') {
      const s1 = String(col1).trim();
      if (/^\d{1,9}$/.test(s1) || (typeof col1 === 'number' && Number.isInteger(col1) && col1 > 0)) {
        return 'acordo_cont';
      }
    }
  }

  // ── 6. Acordo de bloco ────────────────────────────────────────────────────
  // Col A é texto (nome) E existe pelo menos um número nas demais colunas
  {
    const col0 = row[0];
    const s0   = String(col0 ?? '').trim();
    if (s0 && !isCelulaData(col0) && !/^\d+$/.test(s0)) {
      const temNumero = row.slice(1).some(c => {
        if (c === null || c === undefined || String(c).trim() === '') return false;
        if (typeof c === 'number' && c > 0) return true;
        const s = String(c).trim();
        return /^\d[\d,.]*$/.test(s) || /^\d{1,3}[xX.]$/.test(s) || /^R\$/.test(s);
      });
      if (temNumero) return 'acordo_bloco';
    }
  }

  // ── 7. Fallback → ruído ───────────────────────────────────────────────────
  return 'ruido';
}

// ─── Resultado do parser ────────────────────────────────────────────────────

interface ResultadoParser {
  modo:      'tabela' | 'blocos';
  registros: AcordoImportado[];
  blocos?:   number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAPEAMENTO POSICIONAL (sem cabeçalho)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mapeamento posicional para ACORDO DE BLOCO (sem cabeçalho):
 *   col[A=0] nome   col[B=1] NR   col[C=2] valor   col[D=3] parcelas
 *   col[E=4] status col[F=5] whats col[G=6] instituicao
 *
 * Estratégia: posição primeiro, depois conteúdo para validar.
 * Se a célula na posição esperada não bate com o tipo → ignora (campo vazio).
 */
function mapaAcordoBloco(row: unknown[]): Record<number, CampoDestino> {
  const mapa: Record<number, CampoDestino> = {};

  // col[0] → nome (texto não-número, não-data)
  const c0 = String(row[0] ?? '').trim();
  if (c0 && !isCelulaData(row[0]) && !/^\d+$/.test(c0)) {
    mapa[0] = 'nome_cliente';
  }

  // col[1] → NR (inteiro 1-9 dígitos, não é celular)
  if (row[1] !== undefined && row[1] !== null && row[1] !== '') {
    const c1 = String(row[1]).trim();
    if (/^\d{1,9}$/.test(c1) && !pareceWhatsapp(row[1])) {
      mapa[1] = 'nr_cliente';
    } else if (typeof row[1] === 'number' && Number.isInteger(row[1]) &&
               row[1] > 0 && row[1] < 1_000_000_000 && !pareceWhatsapp(row[1])) {
      mapa[1] = 'nr_cliente';
    }
  }

  // col[2] → valor monetário
  if (row[2] !== undefined && row[2] !== null && row[2] !== '') {
    const c2 = row[2];
    const s2 = String(c2).trim();
    const isFloat   = typeof c2 === 'number' && !Number.isInteger(c2) && c2 > 0;
    const isMonStr  = /[\d][,.]\d/.test(s2);
    const isIntNum  = typeof c2 === 'number' && Number.isInteger(c2) && c2 > 0 && c2 <= 999999;
    const isIntStr  = /^\d{1,6}$/.test(s2) && parseInt(s2, 10) > 0 && parseInt(s2, 10) <= 999999;
    if (isFloat || isMonStr || isIntNum || isIntStr) {
      mapa[2] = 'valor';
    }
  }

  // col[3] → parcelas
  if (row[3] !== undefined && row[3] !== null && row[3] !== '') {
    const s3 = String(row[3]).trim();
    if (/^\d{1,3}[xX.]?$/.test(s3) || /^0*(\d{1,2})\s*(parc|parcela)/i.test(s3) ||
        (typeof row[3] === 'number' && Number.isInteger(row[3]) && row[3] >= 1 && row[3] <= 60)) {
      mapa[3] = 'parcelas';
    }
  }

  // col[4] → status (por valor conhecido ou keyword)
  if (row[4] !== undefined && row[4] !== null && row[4] !== '') {
    const s4 = String(row[4]).trim();
    const VALS_STATUS = new Set([
      'pago','quitado','pendente','aberto','em aberto','cancelado',
      'inadimplente','atrasado','negociado','em negociacao',
      'pago parcial','pago parcialmente','liquidado','baixado','aguardando',
      'vencido','a vencer','pago total','sem retorno',
      'verificar pendente','verificar_pendente','nao pago','nao_pago',
      'acordo','verificar','proximo','próximo','em acordo','ativo',
      'regular','irregular','renegociado','cobrar','em cobranca',
    ]);
    if (VALS_STATUS.has(norm(s4)) || detectarCampo(s4) === 'status') {
      mapa[4] = 'status';
    }
  }

  // col[5] → whatsapp (telefone brasileiro)
  if (row[5] !== undefined && row[5] !== null && row[5] !== '') {
    if (pareceWhatsapp(row[5])) {
      mapa[5] = 'whatsapp';
    }
  }

  // col[6+] → instituição (última célula textual não mapeada)
  for (let ci = row.length - 1; ci >= 6; ci--) {
    const c = row[ci];
    const s = String(c ?? '').trim();
    if (!s) continue;
    if (isCelulaData(c)) continue;
    if (/^[\d.,]+$/.test(s)) continue;
    if (s.length < 2 || s.length > 80) continue;
    mapa[ci] = 'instituicao';
    break;
  }

  // Fallback: se col[6] existe e não foi mapeada acima, tentar como instituição
  if (row.length > 6 && row[6] !== undefined && row[6] !== null && row[6] !== '') {
    if (!mapa[6]) {
      const s = String(row[6]).trim();
      if (s && !isCelulaData(row[6]) && !/^[\d.,]+$/.test(s)) {
        mapa[6] = 'instituicao';
      }
    }
  }

  return mapa;
}

/**
 * Mapeamento posicional para ACORDO CONTÍNUO (col A = data):
 *   col[A=0] vencimento  col[B=1] NR  col[C=2] valor  col[D=3] parcelas
 *   demais colunas: opcionais (nome, whats, inst por conteúdo)
 */
function mapaAcordoContinuo(row: unknown[]): Record<number, CampoDestino> {
  const mapa: Record<number, CampoDestino> = {};

  // col[0] → vencimento
  if (isCelulaData(row[0])) mapa[0] = 'vencimento';

  // col[1] → NR
  if (row[1] !== undefined && row[1] !== null && row[1] !== '') {
    const c1 = String(row[1]).trim();
    if (/^\d{1,9}$/.test(c1) && !pareceWhatsapp(row[1])) {
      mapa[1] = 'nr_cliente';
    } else if (typeof row[1] === 'number' && Number.isInteger(row[1]) &&
               row[1] > 0 && row[1] < 1_000_000_000 && !pareceWhatsapp(row[1])) {
      mapa[1] = 'nr_cliente';
    }
  }

  // col[2] → valor
  if (row[2] !== undefined && row[2] !== null && row[2] !== '') {
    const c2 = row[2];
    const s2 = String(c2).trim();
    const isFloat   = typeof c2 === 'number' && !Number.isInteger(c2) && c2 > 0;
    const isMonStr  = /[\d][,.]\d/.test(s2);
    const isIntNum  = typeof c2 === 'number' && Number.isInteger(c2) && c2 > 0 && c2 <= 999999;
    const isIntStr  = /^\d{1,6}$/.test(s2) && parseInt(s2, 10) > 0 && parseInt(s2, 10) <= 999999;
    if (isFloat || isMonStr || isIntNum || isIntStr) {
      mapa[2] = 'valor';
    }
  }

  // col[3] → parcelas
  if (row[3] !== undefined && row[3] !== null && row[3] !== '') {
    const s3 = String(row[3]).trim();
    if (/^\d{1,3}[xX.]?$/.test(s3) || /^0*(\d{1,2})\s*(parc|parcela)/i.test(s3) ||
        (typeof row[3] === 'number' && Number.isInteger(row[3]) && row[3] >= 1 && row[3] <= 60)) {
      mapa[3] = 'parcelas';
    }
  }

  // col[4+]: scanner por conteúdo para nome, whats, status, inst
  const usados = new Set(Object.values(mapa));
  const VALS_STATUS = new Set([
    'pago','quitado','pendente','aberto','em aberto','cancelado',
    'inadimplente','atrasado','negociado','em negociacao',
    'pago parcial','pago parcialmente','liquidado','baixado','aguardando',
    'verificar pendente','verificar_pendente','nao pago','nao_pago',
    'acordo','verificar','proximo','próximo','em acordo','ativo',
    'regular','irregular','renegociado','cobrar','em cobranca',
    'vencido','a vencer','pago total','sem retorno',
  ]);

  for (let ci = 4; ci < row.length; ci++) {
    const c = row[ci];
    const s = String(c ?? '').trim();
    if (!s) continue;

    const campoKw = detectarCampo(s);
    if (campoKw !== '_ignorar' && !usados.has(campoKw)) {
      // palavra-chave de campo no valor da célula (improvável, mas cobre)
      mapa[ci] = campoKw; usados.add(campoKw); continue;
    }
    if (!usados.has('whatsapp') && pareceWhatsapp(c)) {
      mapa[ci] = 'whatsapp'; usados.add('whatsapp'); continue;
    }
    if (!usados.has('status') && VALS_STATUS.has(norm(s))) {
      mapa[ci] = 'status'; usados.add('status'); continue;
    }
    if (!usados.has('nome_cliente') && !isCelulaData(c) && !/^\d+$/.test(s) && s.includes(' ')) {
      mapa[ci] = 'nome_cliente'; usados.add('nome_cliente'); continue;
    }
    if (!usados.has('instituicao') && !isCelulaData(c) && !/^[\d.,]+$/.test(s) && s.length >= 2) {
      mapa[ci] = 'instituicao'; usados.add('instituicao'); continue;
    }
  }

  return mapa;
}

/**
 * Constrói mapa a partir de linha de cabeçalho.
 * Garante que col[0] seja nome_cliente se o cabeçalho não o declarar.
 */
function mapaDeHeader(row: unknown[]): Record<number, CampoDestino> {
  const mapa: Record<number, CampoDestino> = {};
  let colNome = false;

  row.forEach((cell, idx) => {
    const s = String(cell ?? '').trim();
    if (!s) return;
    const campo = detectarCampo(s);
    if (campo !== '_ignorar') {
      mapa[idx] = campo;
      if (campo === 'nome_cliente') colNome = true;
    }
  });

  if (!colNome) mapa[0] = 'nome_cliente';
  return mapa;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSER PRINCIPAL — MÁQUINA DE ESTADOS HÍBRIDA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ponto de entrada do parser. Classifica cada linha e despacha para o
 * processador correto.
 *
 * FLUXO:
 *  1. Passa linha por linha pelo classificarLinha()
 *  2. Mantém dataAtual (vencimento do bloco corrente)
 *  3. Mantém mapa atual (de cabeçalho ou posicional)
 *  4. Linha acordo_bloco → usa dataAtual + mapa de bloco
 *  5. Linha acordo_cont  → usa data da própria linha + mapa contínuo
 */
export function parsearPlanilha(rows: unknown[][]): ResultadoParser {
  if (!rows || rows.length === 0) return { modo: 'tabela', registros: [] };

  // FIX: usar getTodayISO() (BRT) — evita off-by-one pós-21h BRT (ex: 23/04 → 22/04).
  const hoje = getTodayISO();

  // ── Pré-análise: decidir modo dominante ──────────────────────────────────
  // Se encontrarmos ao menos uma linha data_bloco nas primeiras 80 linhas
  // → planilha tem pelo menos um bloco → modo 'blocos'
  let temBlocos = false;
  for (let i = 0; i < Math.min(rows.length, 80); i++) {
    if (classificarLinha(rows[i]) === 'data_bloco') { temBlocos = true; break; }
  }

  console.info('[PARSER] Linhas:', rows.length, '| Modo:', temBlocos ? 'HÍBRIDO/BLOCOS' : 'TABELA CONTÍNUA');
  console.info('[PARSER] Primeiras 5 linhas classificadas:',
    rows.slice(0, 5).map((r, i) => `L${i+1}=${classificarLinha(r)}`).join(', '));

  // Modo tabela contínua pura (nenhum bloco por data)
  if (!temBlocos) return parsearTabela(rows, hoje);

  // Modo híbrido: processa linha a linha com máquina de estados
  return parsearHibrido(rows, hoje);
}

/**
 * Parser híbrido — processa qualquer combinação de blocos e linhas contínuas.
 *
 * Estado mantido:
 *  dataAtual  — data do bloco vigente (atualizada por linha data_bloco)
 *  mapaBloco  — mapa de colunas do bloco vigente (de cabeçalho ou posicional)
 *  modoMapa   — 'header' | 'posicional' | null
 */
function parsearHibrido(rows: unknown[][], hoje: string): ResultadoParser {
  const registros: AcordoImportado[] = [];
  let dataAtual:  string | null = null;
  let mapaBloco:  Record<number, CampoDestino> = {};
  let modoMapa:   'header' | 'posicional' | null = null;
  let blocos = 0;

  for (let i = 0; i < rows.length; i++) {
    const row      = rows[i];
    const linhaNum = i + 1;
    const tipo     = classificarLinha(row);

    console.info(`[HÍBRIDO] L${linhaNum} tipo=${tipo} | cells=${JSON.stringify(row.slice(0,7))}`);

    switch (tipo) {
      // ── Data de bloco: atualiza contexto ────────────────────────────────
      case 'data_bloco': {
        // Extrair a data da linha
        for (const c of row) {
          const dt = isCelulaData(c);
          if (dt) { dataAtual = dt; break; }
        }
        blocos++;
        modoMapa  = null;   // próximo cabeçalho ou 1ª linha decide o mapa
        mapaBloco = {};
        console.info(`[HÍBRIDO] L${linhaNum} → dataAtual=${dataAtual}`);
        break;
      }

      // ── Cabeçalho: define mapa de colunas ────────────────────────────────
      case 'cabecalho': {
        mapaBloco = mapaDeHeader(row);
        modoMapa  = 'header';
        console.info(`[HÍBRIDO] L${linhaNum} → CABEÇALHO. Mapa:`, JSON.stringify(mapaBloco));
        break;
      }

      // ── Acordo de bloco: vencimento = dataAtual ──────────────────────────
      case 'acordo_bloco': {
        if (!dataAtual) {
          // Acordo de bloco sem data de bloco prévia → descarta
          console.info(`[HÍBRIDO] L${linhaNum} → acordo_bloco SEM dataAtual, descartado`);
          break;
        }
        // Se ainda não há mapa posicional, infere agora
        if (modoMapa === null) {
          mapaBloco = mapaAcordoBloco(row);
          modoMapa  = 'posicional';
          console.info(`[HÍBRIDO] L${linhaNum} → mapa posicional bloco inferido:`, JSON.stringify(mapaBloco));
        }

        const dados = aplicarMapa(row, mapaBloco);
        dados.vencimento = dataAtual;   // SEMPRE sobrescreve com a data do bloco

        // Garantia extra: se nome ainda vazio, col[0] é o nome
        if (!dados.nome_cliente) {
          const s0 = String(row[0] ?? '').trim();
          if (s0 && !isCelulaData(row[0]) && !/^\d+$/.test(s0)) {
            dados.nome_cliente = s0;
          }
        }

        // Garantia extra: se inst vazia, última célula textual longa é inst
        if (!dados.instituicao) {
          dados.instituicao = extrairInstituicaoDaLinha(row, mapaBloco);
        }

        console.info(`[HÍBRIDO] L${linhaNum} → dados bloco:`, JSON.stringify(dados));
        const acordo = montarAcordo(dados, hoje, linhaNum, dataAtual);
        if (acordo) registros.push(acordo);
        break;
      }

      // ── Acordo contínuo: vencimento vem da própria linha ─────────────────
      case 'acordo_cont': {
        const mapa = mapaAcordoContinuo(row);
        const dados = aplicarMapa(row, mapa);

        console.info(`[HÍBRIDO] L${linhaNum} → dados contínuo:`, JSON.stringify(dados));
        const acordo = montarAcordo(dados, hoje, linhaNum, undefined);
        if (acordo) registros.push(acordo);
        break;
      }

      // ── Ruído / Vazia: ignorar ───────────────────────────────────────────
      case 'ruido':
      case 'vazia':
        break;
    }
  }

  console.info('[HÍBRIDO] Total registros:', registros.length, '| Blocos:', blocos);
  return { modo: 'blocos', registros, blocos };
}

/** Aplica um mapa (col→campo) sobre uma linha e retorna o dicionário */
function aplicarMapa(row: unknown[], mapa: Record<number, CampoDestino>): Record<string, unknown> {
  const dados: Record<string, unknown> = {};
  Object.entries(mapa).forEach(([idx, campo]) => {
    if (campo !== '_ignorar') {
      dados[campo] = row[Number(idx)] ?? '';
    }
  });
  return dados;
}

/** Extrai instituição: última célula textual da linha não mapeada como campo importante */
function extrairInstituicaoDaLinha(
  row: unknown[],
  mapa: Record<number, CampoDestino>
): string | null {
  const SKIP = new Set<CampoDestino>(['nome_cliente','nr_cliente','valor','whatsapp','status','parcelas','vencimento']);
  for (let ci = row.length - 1; ci >= 1; ci--) {
    if (mapa[ci] && SKIP.has(mapa[ci])) continue;
    const s = String(row[ci] ?? '').trim();
    if (!s) continue;
    if (isCelulaData(row[ci])) continue;
    if (/^[\d.,]+$/.test(s)) continue;
    if (s.length < 2 || s.length > 80) continue;
    return s;
  }
  return null;
}

/** PARSER MODO TABELA: formato sem blocos, cabeçalho no topo */
function parsearTabela(rows: unknown[][], hoje: string): ResultadoParser {
  const registros: AcordoImportado[] = [];

  let idxHeader = -1;
  let mapa: Record<number, CampoDestino> = {};

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (classificarLinha(rows[i]) === 'cabecalho') {
      idxHeader = i;
      mapa = mapaDeHeader(rows[i]);
      break;
    }
  }

  if (idxHeader === -1) {
    // Fallback: usa 1ª linha como cabeçalho
    if (rows.length > 0) {
      idxHeader = 0;
      rows[0].forEach((cell, idx) => {
        mapa[idx] = detectarCampo(String(cell ?? ''));
      });
    } else {
      return { modo: 'tabela', registros: [] };
    }
  }

  for (let i = idxHeader + 1; i < rows.length; i++) {
    const row  = rows[i];
    const tipo = classificarLinha(row);
    if (tipo === 'vazia' || tipo === 'data_bloco') continue;
    if (tipo === 'cabecalho' && i > idxHeader + 1) continue; // cabeçalho repetido

    // FIX: no modo tabela, após o header, linhas de dados onde col[0] é um NR numérico puro
    // (ex: planilha PaguePlay: 1000, 2000, ...) caem no fallback 'ruido' do classificarLinha
    // porque não encaixam em acordo_cont (col[0] não é data) nem acordo_bloco (col[0] é número puro).
    // Como o header já foi detectado e o mapa já está montado, o critério correto para
    // pular uma linha é "não tem dado útil", não "foi classificada como ruído pelo heurístico genérico".
    // O montarAcordo já faz descarte final (linha sem nome/nr/vencimento/valor → retorna null).
    if (tipo === 'ruido') {
      // Ruído REAL: linha com 0-1 célula não-vazia ou linha de totais/rodapé.
      const nv = celulasDaLinha(row);
      if (nv.length <= 1) continue;                    // 0 ou 1 célula → ruído genuíno
      if (isLinhaTotaisOuRodape(row)) continue;        // linha de totais/rodapé
      // Senão: provavelmente é uma linha de dados — segue para o mapeamento posicional.
    }

    const dados = aplicarMapa(row, mapa);
    const acordo = montarAcordo(dados, hoje, i + 1, undefined);
    if (acordo) registros.push(acordo);
  }

  return { modo: 'tabela', registros };
}


/**
 * ─── CONSTRUTOR DE ACORDO ───────────────────────────────────────────────────
 *
 * Constrói um AcordoImportado a partir dos dados mapeados.
 *
 * CAMPOS FORTEMENTE OBRIGATÓRIOS (ausência = inválido, não importa):
 *  - vencimento: precisa de data real
 *  - valor: precisa ser número > 0
 *
 * CAMPOS OPCIONAIS (ausência = vazio, registro ainda é válido):
 *  - nome_cliente: usa fallback se ausente; placeholder '(sem nome)' não invalida
 *  - nr_cliente: ausência gera AVISO no preview, mas NÃO invalida o registro
 *  - whatsapp, instituicao, parcelas, status, observacoes: podem estar em branco
 *
 * DESCARTE (retorna null — nem aparece no preview):
 *  - linha completamente vazia (sem nome, sem NR, sem valor, sem vencimento)
 *  - linha cujo único conteúdo é uma palavra-chave de cabeçalho escapada
 */
function montarAcordo(
  dados: Record<string, unknown>,
  dataFallback: string,
  linha: number,
  blocoData?: string
): AcordoImportado | null {

  console.info('[MONTAR] Linha', linha, '- dados recebidos:', JSON.stringify(dados));

  const nome_cliente = String(dados.nome_cliente ?? '').trim();
  const nr_cliente   = String(dados.nr_cliente   ?? '').trim();

  const vencimento   = normalizarData(dados.vencimento)
                    ?? normalizarData(blocoData)
                    ?? (dataFallback ? dataFallback : null);

  const valor        = normalizarValor(dados.valor);
  const whatsapp     = normalizarTelefone(dados.whatsapp);
  const status       = normalizarStatus(dados.status);
  const tipo         = normalizarTipo(dados.tipo);
  const parcelas     = normalizarParcelas(dados.parcelas);
  const observacoes  = String(dados.observacoes  ?? '').trim() || null;
  const instituicao  = String(dados.instituicao  ?? '').trim() || null;
  // UF do cliente (2 letras). Serializada em observações em confirmarImportacao.
  const estadoRaw    = String(dados.estado_uf ?? '').trim().toUpperCase();
  const estado_uf    = /^[A-Z]{2}$/.test(estadoRaw) ? estadoRaw : null;

  console.info('[MONTAR] Linha', linha, '- normalizado:',
    'nome=', nome_cliente,
    '| nr=', nr_cliente,
    '| venc=', vencimento,
    '| valor=', valor,
    '| whats=', whatsapp,
    '| inst=', instituicao
  );

  // ── Descarte imediato (linha lixo) ──────────────────────────────────────
  // Linha sem nenhum dado útil → ignora completamente (nem aparece no preview)
  if (!nome_cliente && !nr_cliente && !vencimento && valor === null) return null;

  // Linha cujo único texto é uma palavra-chave de cabeçalho (header escapado)
  // Ex: células "NOME" ou "VALOR" que aparecem em linhas de cabeçalho repetido
  const somenteNomeHeader = nome_cliente && norm(nome_cliente) === 'nome' && !nr_cliente && valor === null;
  const somenteValorHeader = !nome_cliente && !nr_cliente && valor === null && !vencimento;
  if (somenteNomeHeader || somenteValorHeader) return null;

  // ── Erros que INVALIDAM o registro (não será importado) ─────────────────
  //  Apenas: vencimento ausente E valor ausente/inválido.
  //  NR ausente e nome ausente são AVISOS, não erros fatais.
  const erros: string[] = [];

  if (!vencimento) {
    erros.push('Vencimento não encontrado');
  }
  if (valor === null || valor <= 0) {
    erros.push('Valor inválido ou ausente');
  }

  // ── Avisos (aparecem no preview mas NÃO invalidam) ─────────────────────
  const avisos: string[] = [];
  if (!nome_cliente) avisos.push('Nome ausente');
  if (!nr_cliente)   avisos.push('NR não encontrado');

  // ── Mescla avisos nos erros APENAS para exibição no preview ────────────
  // O registro ainda é válido (valido=true) mesmo com avisos
  const errosExibicao = [...erros, ...avisos];

  return {
    linhaOriginal: linha,
    blocoData,
    nome_cliente:  nome_cliente || '',
    nr_cliente:    nr_cliente   || '',
    vencimento,
    valor,
    whatsapp,
    status,
    tipo,
    parcelas,
    observacoes:   observacoes || null,
    instituicao,
    estado_uf,
    // VÁLIDO = sem erros fatais (vencimento e valor ok)
    // Avisos de nome/NR ausentes NÃO invalidam
    valido:        erros.length === 0,
    erros:         errosExibicao,
  };
}

// ─── Componente principal ──────────────────────────────────────────────────

type Etapa = 'upload' | 'escolha' | 'preview' | 'resultado';

interface ResultadoImportacao {
  ok:    number;
  erros: number;
  msgs:  string[];
}

export default function ImportarExcel() {
  const { perfil } = useAuth();
  const { empresa, tenantSlug } = useEmpresa();
  const navigate   = useNavigate();
  const inputRef   = useRef<HTMLInputElement>(null);
  const rawRowsRef = useRef<unknown[][] | null>(null);
  const { configs: configsDiretoExtra } = useDiretoExtraConfig();

  const [etapa,     setEtapa]     = useState<Etapa>('upload');
  const [arquivo,   setArquivo]   = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [importando, setImportando] = useState(false);
  const [registros, setRegistros] = useState<AcordoImportado[]>([]);
  const [registrosOriginais, setRegistrosOriginais] = useState<AcordoImportado[] | null>(null);
  const [modoParsed, setModoParsed] = useState<'tabela'|'blocos'>('tabela');
  const [blocosDetectados, setBlocosDetectados] = useState(0);
  const [filtroPreview, setFiltroPreview] = useState<'todos'|'validos'|'erros'>('todos');
  const [aiDisponivel, setAiDisponivel] = useState(false);
  const [usarIA, setUsarIA] = useState(false);
  const [organizandoIA, setOrganizandoIA] = useState(false);
  const [lendoArquivo, setLendoArquivo] = useState(false);
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);

  // ── Classificação em batch dos NRs importados ──────────────────────────
  const [classificacao, setClassificacao] = useState<ClassificacaoNR[]>([]);
  const [carregandoClassif, setCarregandoClassif] = useState(false);

  // ── Modal de autorização de NRs bloqueados ─────────────────────────────
  const [modalAutorizacaoAberto, setModalAutorizacaoAberto] = useState(false);
  const [linhasSelecionadas, setLinhasSelecionadas] = useState<Set<number>>(new Set());
  const [liderEmail, setLiderEmail] = useState('');
  const [liderSenha, setLiderSenha] = useState('');
  const [autorizando, setAutorizando] = useState(false);
  /** Autorizador validado e set de linhas cuja autorização foi concedida. */
  const [autorizador, setAutorizador] = useState<AutorizadorInfo | null>(null);
  const [linhasAutorizadas, setLinhasAutorizadas] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const cfg = await fetchAIConfig();
        const enabled = Boolean(cfg?.enabled);
        setAiDisponivel(enabled);
        setUsarIA(enabled);
        setAiPrompt(cfg?.prompt_system || null);
      } catch {
        setAiDisponivel(false);
        setUsarIA(false);
        setAiPrompt(null);
      }
    })();
  }, []);

  const processarArquivo = useCallback((file: File) => {
    rawRowsRef.current = null;
    setArquivo(file);
    setResultado(null);
    setRegistros([]);
    setRegistrosOriginais(null);
    setFiltroPreview('todos');
    setModoParsed('tabela');
    setBlocosDetectados(0);
    setEtapa('escolha');
    toast.success('Arquivo enviado. Escolha como deseja organizar os dados.');
  }, []);

  function lerArquivoComoMatriz(file: File): Promise<unknown[][]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = xlsxRead(e.target?.result, { type: 'array', cellDates: false, raw: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rawRows = xlsxUtils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
          resolve(rawRows as unknown[][]);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
      reader.readAsArrayBuffer(file);
    });
  }

  function truncarParaIA(rows: unknown[][]) {
    const maxRows = 160;
    const maxCols = 24;
    return rows.slice(0, maxRows).map(r => (Array.isArray(r) ? r.slice(0, maxCols) : []));
  }

  async function obterRawRows(): Promise<unknown[][]> {
    if (rawRowsRef.current && rawRowsRef.current.length > 0) return rawRowsRef.current;
    if (!arquivo) throw new Error('Nenhum arquivo selecionado');

    const rawRows = await lerArquivoComoMatriz(arquivo);
    rawRowsRef.current = rawRows;
    return rawRows;
  }

  /**
   * Classifica todos os NRs dos registros válidos contra o banco + lógica
   * Direto/Extra do operador atual. Armazena o resultado em `classificacao`.
   */
  async function carregarClassificacao(regs: AcordoImportado[]) {
    if (!empresa?.id || !perfil?.id) {
      setClassificacao([]);
      return;
    }
    setCarregandoClassif(true);
    try {
      const ehPaguePay = isPaguePlay(tenantSlug);
      const campoNr: 'nr_cliente' | 'instituicao' = ehPaguePay ? 'instituicao' : 'nr_cliente';

      const validos = regs.filter(r => r.valido);
      const inputs = validos.map(r => ({
        linhaOriginal: r.linhaOriginal,
        nr: ((ehPaguePay ? r.instituicao : r.nr_cliente) ?? '').trim(),
      }));
      const nrs = inputs.map(i => i.nr).filter(Boolean);
      const duplicados = nrs.length > 0
        ? await verificarNrsDuplicadosEmLote(nrs, empresa.id, campoNr)
        : new Map();

      const classif = await classificarNrsImportados({
        registros:            inputs,
        operadorAtualId:      perfil.id,
        operadorAtualSetorId: perfil.setor_id ?? null,
        operadorAtualEquipeId: perfil.equipe_id ?? null,
        configsDiretoExtra,
        duplicados,
        resolverDadosOperador: async (operadorId: string) => {
          const { data } = await supabase
            .from('perfis')
            .select('setor_id, equipe_id')
            .eq('id', operadorId)
            .maybeSingle();
          if (!data) return null;
          return {
            setorId:  data.setor_id  ?? null,
            equipeId: data.equipe_id ?? null,
          };
        },
      });
      setClassificacao(classif);
      // Reseta autorizações anteriores — classificação mudou.
      setLinhasAutorizadas(new Set());
      setAutorizador(null);
    } catch (err) {
      console.error('[ImportarExcel] Erro ao classificar NRs:', err);
      toast.error('Erro ao classificar NRs: ' + (err instanceof Error ? err.message : String(err)));
      setClassificacao([]);
    } finally {
      setCarregandoClassif(false);
    }
  }

  async function organizarLocal() {
    if (!arquivo) { toast.error('Selecione um arquivo primeiro'); return; }
    setUsarIA(false);
    setLendoArquivo(true);
    try {
      const rawRows = await obterRawRows();
      if (rawRows.length === 0) { toast.error('Planilha vazia ou sem dados'); return; }

      const res = parsearPlanilha(rawRows);
      if (res.registros.length === 0) {
        toast.warning('Nenhum registro reconhecido. Verifique o formato da planilha.');
        return;
      }

      setRegistrosOriginais(res.registros);
      setRegistros(res.registros);
      setModoParsed(res.modo);
      setBlocosDetectados(res.blocos ?? 0);
      setEtapa('preview');
      toast.success(`${res.registros.length} registro(s) lido(s) — modo ${res.modo === 'blocos' ? 'por blocos' : 'tabela'}`);
      // Classificação em batch: feita em background enquanto o usuário revisa.
      void carregarClassificacao(res.registros);
    } catch (err) {
      toast.error('Erro ao ler arquivo: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLendoArquivo(false);
    }
  }

  async function organizarComIA() {
    if (!arquivo) { toast.error('Selecione um arquivo primeiro'); return; }
    setOrganizandoIA(true);
    try {
      const hoje = getTodayISO();
      const raw = await obterRawRows();
      if (raw.length === 0) { toast.error('Planilha vazia ou sem dados'); return; }

      // Mantém um fallback do parser local (sem interferir no fluxo), útil para alternar depois.
      if (!registrosOriginais) {
        const baseline = parsearPlanilha(raw);
        if (baseline.registros.length > 0) setRegistrosOriginais(baseline.registros);
      }

      const payloadRows = truncarParaIA(raw);
      const res = await aiNormalizeImport(payloadRows, hoje, aiPrompt || undefined);

      const records = Array.isArray(res?.records) ? res.records : [];
      if (records.length === 0) {
        toast.warning('A IA não retornou registros para importar');
        return;
      }

      const novos: AcordoImportado[] = [];
      for (const rec of records) {
        const linhaOriginal = typeof rec?.linhaOriginal === 'number' ? rec.linhaOriginal : 0;
        const dados: Record<string, unknown> = {
          nome_cliente: rec?.nome_cliente ?? '',
          nr_cliente: rec?.nr_cliente ?? '',
          vencimento: rec?.vencimento ?? null,
          valor: rec?.valor ?? null,
          whatsapp: rec?.whatsapp ?? null,
          status: rec?.status ?? '',
          tipo: rec?.tipo ?? '',
          parcelas: rec?.parcelas ?? '',
          observacoes: rec?.observacoes ?? '',
          instituicao: rec?.instituicao ?? '',
          estado_uf: rec?.estado_uf ?? '',
        };
        const acordo = montarAcordo(dados, hoje, linhaOriginal, undefined);
        if (acordo) novos.push(acordo);
      }

      if (novos.length === 0) {
        toast.warning('A IA não conseguiu montar registros válidos');
        return;
      }

      setRegistros(novos);
      setUsarIA(true);
      setEtapa('preview');
      toast.success(`IA organizou ${novos.length} registro(s)`);
      // Classificação em batch: também no modo IA.
      void carregarClassificacao(novos);
    } catch (e) {
      console.error('[ImportarExcel/IA]', e);
      const msg =
        e instanceof Error && e.message
          ? e.message
          : 'Erro ao organizar com IA. Tente novamente.';
      toast.error(msg);
    } finally {
      setOrganizandoIA(false);
    }
  }

  async function toggleIA(v: boolean) {
    setUsarIA(v);
    if (!v) {
      if (registrosOriginais) setRegistros(registrosOriginais);
      return;
    }
    await organizarComIA();
  }

  const registrosFiltrados = registros.filter(r => {
    if (filtroPreview === 'validos') return r.valido;
    if (filtroPreview === 'erros')   return !r.valido;
    return true;
  });

  const validos   = registros.filter(r => r.valido).length;
  const invalidos = registros.filter(r => !r.valido).length;

  // Cache: sabe se a coluna `instituicao` existe no banco (evita re-testar a cada import)
  const [colunaInstituicaoExiste, setColunaInstituicaoExiste] = useState<boolean | null>(null);

  /** Detecta em runtime se a coluna `instituicao` existe na tabela acordos */
  async function detectarColunaInstituicao(): Promise<boolean> {
    if (colunaInstituicaoExiste !== null) return colunaInstituicaoExiste;
    // Usa select de 0 linhas — se a coluna não existir, o PostgREST retorna erro PGRST204
    const { error } = await supabase.from('acordos').select('instituicao').limit(0);
    const existe = !error;
    setColunaInstituicaoExiste(existe);
    return existe;
  }

  async function confirmarImportacao() {
    const aImportar = registros.filter(r => r.valido);
    if (aImportar.length === 0) { toast.error('Nenhum registro válido para importar'); return; }
    if (!empresa?.id || !perfil?.id) { toast.error('Contexto de empresa/perfil indisponível'); return; }

    setImportando(true);
    const hoje = getTodayISO();
    const errosMsgs: string[] = [];

    const ehPaguePay = isPaguePlay(tenantSlug);
    const labelNr = ehPaguePay ? 'Inscrição' : 'NR';

    // Se a classificação ainda não terminou, recalcula agora de forma síncrona.
    let classifAtual = classificacao;
    if (classifAtual.length === 0 && aImportar.length > 0) {
      await carregarClassificacao(aImportar);
      // Pega o valor atualizado do setState de forma imperativa: usa o retorno
      // direto de classificarNrsImportados via state já atualizado no próximo tick.
      // Como setState é assíncrono em React, usamos o fallback calculado aqui.
      classifAtual = classificacao;
    }

    // Detectar se a coluna instituicao existe no banco (evita erro de schema cache)
    const temInstituicao = await detectarColunaInstituicao();

    // Monta o payload básico por registro (sem tipo_vinculo — service adiciona).
    const payloads: PayloadAcordoImport[] = aImportar.map(r => {
      // Observações: serializa [ESTADO:XX] quando PaguePlay tem estado_uf.
      let obs = r.observacoes;
      if (ehPaguePay && r.estado_uf) {
        // buildObservacoesComEstado recebe (obs, estado) e retorna string com [ESTADO:XX].
        obs = buildObservacoesComEstado(obs ?? '', r.estado_uf);
      }
      // Observações: concatena instituição no texto se a coluna não existir (fallback)
      const obsFinal = (!temInstituicao && r.instituicao)
        ? [obs, `Inst.: ${r.instituicao}`].filter(Boolean).join(' | ')
        : (obs || null);

      const registro: Record<string, unknown> = {
        nome_cliente:  r.nome_cliente,
        nr_cliente:    r.nr_cliente,
        vencimento:    r.vencimento ?? hoje,
        valor:         r.valor ?? 0,
        whatsapp:      r.whatsapp || null,
        status:        r.status,
        tipo:          r.tipo,
        parcelas:      r.parcelas,
        observacoes:   obsFinal,
        data_cadastro: hoje,
        operador_id:   perfil!.id,
        setor_id:      perfil?.setor_id ?? null,
        empresa_id:    empresa?.id ?? null,
      };
      if (temInstituicao) {
        registro.instituicao = r.instituicao || null;
      }
      return {
        linhaOriginal: r.linhaOriginal,
        registro,
        nr: ((ehPaguePay ? r.instituicao : r.nr_cliente) ?? '').trim(),
        nomeCliente: r.nome_cliente,
      };
    });

    const resultadoBatch = await processarImportacaoEmLote({
      payloads,
      classificacao:     classifAtual,
      linhasAutorizadas,
      autorizador,
      operadorAtual:     { id: perfil.id, nome: perfil.nome ?? 'Operador' },
      empresaId:         empresa.id,
      labelNr,
      isPaguePlay:       ehPaguePay,
      batchSize:         50,
    });

    errosMsgs.push(...resultadoBatch.erros);
    const ok = resultadoBatch.inseridos;

    // Mensagem para bloqueados: ajuda o usuário a saber o que sobrou.
    if (resultadoBatch.bloqueados.length > 0) {
      const bloqLista = resultadoBatch.bloqueados.slice(0, 5)
        .map(b => `#${b.linhaOriginal} "${b.nr}" (${b.motivo})`).join('; ');
      errosMsgs.push(
        `${resultadoBatch.bloqueados.length} ${labelNr}(s) bloqueado(s) e não importado(s): ${bloqLista}` +
        (resultadoBatch.bloqueados.length > 5 ? '…' : ''),
      );
    }

    setResultado({ ok, erros: aImportar.length - ok + invalidos, msgs: errosMsgs });
    setImportando(false);
    setEtapa('resultado');
    if (ok > 0) {
      toast.success(`${ok} acordo(s) importado(s)!`);
      if (perfil?.lider_id) {
        criarNotificacao({
          usuario_id: perfil.lider_id,
          titulo: 'Importação de acordos concluída',
          mensagem: `${perfil.nome} importou ${ok} acordo(s) via Excel.`,
          empresa_id: empresa?.id,
        });
      }
    }
    if (!temInstituicao && ok > 0) {
      toast.warning('Coluna "instituição" não existe no banco. Execute a migration SQL para ativá-la.', { duration: 8000 });
    }
  }

  // ── Derivados da classificação (para UI) ────────────────────────────────
  const classifPorLinha = (() => {
    const m = new Map<number, ClassificacaoNR>();
    for (const c of classificacao) m.set(c.linhaOriginal, c);
    return m;
  })();

  /** Linhas que precisam de autorização de líder (duplicado bloqueado). */
  const linhasBloqueadas: ClassificacaoNR[] = classificacao.filter(
    c => c.categoria === 'duplicado' && c.precisaAutorizacao,
  );

  const totaisClassif = agruparPorCategoria(classificacao);

  // ── Abrir modal de autorização ───────────────────────────────────────────
  function abrirModalAutorizacao() {
    if (linhasBloqueadas.length === 0) {
      toast.info('Nenhum NR bloqueado para autorizar');
      return;
    }
    // Por padrão, seleciona todas as linhas bloqueadas.
    const seedSet = new Set<number>();
    for (const l of linhasBloqueadas) seedSet.add(l.linhaOriginal);
    setLinhasSelecionadas(seedSet);
    setLiderEmail('');
    setLiderSenha('');
    setModalAutorizacaoAberto(true);
  }

  function alternarLinhaSelecionada(linha: number) {
    setLinhasSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(linha)) next.delete(linha);
      else                 next.add(linha);
      return next;
    });
  }

  async function confirmarAutorizacaoBloqueados() {
    if (linhasSelecionadas.size === 0) {
      toast.error('Selecione pelo menos um NR para autorizar');
      return;
    }
    setAutorizando(true);
    try {
      const res = await autenticarLider({ email: liderEmail, senha: liderSenha });
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      setAutorizador(res.autorizador);
      setLinhasAutorizadas(new Set(linhasSelecionadas));
      setModalAutorizacaoAberto(false);
      setLiderEmail('');
      setLiderSenha('');
      toast.success(
        `Autorização concedida por ${res.autorizador.nome}. ` +
        `${linhasSelecionadas.size} NR(s) liberado(s).`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao autorizar NRs');
    } finally {
      setAutorizando(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" /> Importar via Excel
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Parser inteligente — aceita tabelas tradicionais e estruturas por blocos/data
          </p>
        </div>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2 mb-6 text-xs">
        {(['upload','escolha','preview','resultado'] as Etapa[]).map((e, i) => {
          const labels = ['Upload','Escolha','Pré-visualização','Resultado'];
          const ativo  = etapa === e;
          const feito  = ['upload','escolha','preview','resultado'].indexOf(etapa) > i;
          return (
            <div key={e} className="flex items-center gap-2">
              <div className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full font-medium',
                ativo ? 'bg-primary text-primary-foreground' :
                feito ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground')}>
                <span>{i+1}.</span> {labels[i]}
              </div>
              {i < 3 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
          );
        })}
      </div>

      {/* ─── ETAPA 1: UPLOAD ─── */}
      {etapa === 'upload' && (
        <div className="space-y-4">
          <Card className="border-border">
            <CardContent className="p-8">
              <div
                className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-12 text-center cursor-pointer transition-colors"
                onClick={() => inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) processarArquivo(f); }}
              >
                <Upload className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
                <p className="text-base font-medium text-foreground mb-1">Arraste o arquivo ou clique para selecionar</p>
                <p className="text-sm text-muted-foreground">Aceita .xlsx e .xls · Máximo 10MB</p>
                <Button variant="outline" className="mt-4" type="button">Selecionar Arquivo</Button>
              </div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processarArquivo(f); }} />
            </CardContent>
          </Card>

          {/* Guia de formatos aceitos */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" /> Formatos aceitos automaticamente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-primary" /> Formato por blocos/data
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Linha com uma data → linha de cabeçalho (NR, VALOR, CLIENTE...) → linhas de dados. Pode repetir vários blocos com datas diferentes.
                  </p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-primary" /> Tabela contínua
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Uma linha de cabeçalho no topo + todas as linhas de dados abaixo. Cabeçalho pode estar em qualquer posição (detectado automaticamente).
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5">Colunas reconhecidas (nomes flexíveis):</p>
                <div className="flex flex-wrap gap-1.5">
                  {['NR / Número / Contrato', 'NOME / Cliente', 'VALOR / Parcela / VLR', 'VENC / Vencimento', 'WHATS / Telefone / Cel', 'STATUS / Situação', 'INST / Instituição / Banco', 'OBS / Observação'].map(c => (
                    <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── ETAPA 2: ESCOLHA ─── */}
      {etapa === 'escolha' && (
        <div className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" /> Arquivo enviado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3 p-3 bg-muted/30 border border-border rounded-lg flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{arquivo?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Selecione como deseja organizar os dados antes da pré-visualização.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setEtapa('upload'); setArquivo(null); rawRowsRef.current = null; }}
                    disabled={lendoArquivo || organizandoIA}
                  >
                    Trocar arquivo
                  </Button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <Card className="border-border">
                  <CardContent className="p-4 space-y-2">
                    <p className="text-sm font-semibold text-foreground">Organizar</p>
                    <p className="text-xs text-muted-foreground">
                      Usa o parser atual do sistema (recomendado para planilhas já bem estruturadas).
                    </p>
                    <Button onClick={organizarLocal} disabled={lendoArquivo || organizandoIA} className="w-full gap-2">
                      <Layers className="w-4 h-4" />
                      {lendoArquivo ? 'Lendo...' : 'Organizar'}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-4 space-y-2">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Bot className="w-4 h-4 text-primary" /> Organizar com IA
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Envia a planilha + prompt para a IA e retorna os registros normalizados.
                    </p>
                    <Button
                      onClick={organizarComIA}
                      disabled={!aiDisponivel || lendoArquivo || organizandoIA}
                      className="w-full gap-2"
                    >
                      <Bot className="w-4 h-4" />
                      {organizandoIA ? 'Analisando...' : 'Organizar com IA'}
                    </Button>
                    {!aiDisponivel && (
                      <p className="text-[11px] text-muted-foreground">
                        IA desabilitada. Ative em Admin → IA.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── ETAPA 2: PRÉ-VISUALIZAÇÃO ─── */}
      {etapa === 'preview' && (
        <div className="space-y-4">
          {/* Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-border">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{registros.length}</p>
                <p className="text-xs text-muted-foreground">Registros lidos</p>
                <Badge variant="outline" className="mt-1 text-[10px]">
                  {modoParsed === 'blocos' ? `${blocosDetectados} blocos` : 'tabela contínua'}
                </Badge>
              </CardContent>
            </Card>
            <Card className="border-success/30 bg-success/5">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-success">{validos}</p>
                <p className="text-xs text-muted-foreground">Válidos</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-destructive">{invalidos}</p>
                <p className="text-xs text-muted-foreground">Com erros</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary font-mono">
                  {formatCurrency(registros.filter(r=>r.valido).reduce((s,r) => s + safeNum(r.valor), 0))}
                </p>
                <p className="text-xs text-muted-foreground">Valor total válido</p>
              </CardContent>
            </Card>
          </div>

          {/* Info do arquivo */}
          <div className="flex items-center gap-2 text-xs p-2.5 bg-primary/5 border border-primary/20 rounded-lg flex-wrap">
            <FileSpreadsheet className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="font-medium text-foreground">{arquivo?.name}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              Modo: <strong className="text-foreground">{modoParsed === 'blocos' ? `blocos por data (${blocosDetectados} blocos)` : 'tabela contínua'}</strong>
            </span>
            {perfil?.setores && (
              <>
                <span className="text-muted-foreground">·</span>
                <Building2 className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium text-foreground">{(perfil.setores as { nome?: string })?.nome}</span>
              </>
            )}
            {aiDisponivel && (
              <>
                <span className="text-muted-foreground">·</span>
                <Bot className="w-3.5 h-3.5 text-primary" />
                <span className="text-muted-foreground">IA</span>
                <Switch checked={usarIA} onCheckedChange={toggleIA} disabled={organizandoIA} />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] px-2 gap-1.5"
                  disabled={!usarIA || organizandoIA}
                  onClick={organizarComIA}
                >
                  <RefreshCw className={cn('w-3 h-3', organizandoIA && 'animate-spin')} />
                  Organizar
                </Button>
              </>
            )}
          </div>

          {/* Tabela de preview */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-sm">Dados reconhecidos</CardTitle>
                <div className="flex gap-1">
                  {(['todos','validos','erros'] as const).map(f => (
                    <Button key={f} size="sm" variant={filtroPreview === f ? 'default' : 'outline'}
                      className="h-7 text-xs px-2" onClick={() => setFiltroPreview(f)}>
                      {f === 'todos' ? `Todos (${registros.length})` : f === 'validos' ? `✓ ${validos}` : `✗ ${invalidos}`}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/70 backdrop-blur-sm border-b border-border z-10">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground w-8">#</th>
                      {modoParsed === 'blocos' && <th className="px-2 py-2 text-left font-semibold text-muted-foreground w-20">BLOCO</th>}
                      <th className="px-2 py-2 text-center font-semibold text-muted-foreground w-8">✓</th>
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground">NR</th>
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground">CLASS.</th>
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground">NOME</th>
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground">VENCIMENTO</th>
                      <th className="px-2 py-2 text-right font-semibold text-muted-foreground">VALOR</th>
                      <th className="px-2 py-2 text-center font-semibold text-muted-foreground">PARC.</th>
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground">STATUS</th>
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground">WHATS</th>
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground">INST.</th>
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground">AVISOS / ERROS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrosFiltrados.map((r, i) => {
                      // Separa erros fatais (vencimento/valor) de avisos (nome/NR)
                      const errosFatais = r.erros.filter(e =>
                        e.includes('Vencimento') || e.includes('Valor')
                      );
                      const avisosMsgs = r.erros.filter(e =>
                        !e.includes('Vencimento') && !e.includes('Valor')
                      );
                      const classif = classifPorLinha.get(r.linhaOriginal);
                      const autorizada = linhasAutorizadas.has(r.linhaOriginal);
                      const bloqueada = classif?.categoria === 'duplicado' && classif?.precisaAutorizacao && !autorizada;
                      const destaqueExtraDireto = classif?.categoria === 'extra' || classif?.categoria === 'direto';
                      return (
                        <motion.tr
                          key={r.linhaOriginal}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.01 }}
                          className={cn(
                            'border-b border-border/50',
                            !r.valido
                              ? 'bg-destructive/5 hover:bg-destructive/8'
                              : bloqueada
                                ? 'bg-destructive/10 hover:bg-destructive/15'
                                : destaqueExtraDireto
                                  ? 'bg-primary/5 hover:bg-primary/10'
                                  : avisosMsgs.length > 0
                                    ? 'bg-warning/5 hover:bg-warning/10'
                                    : 'hover:bg-muted/20'
                          )}
                        >
                          <td className="px-2 py-1.5 text-muted-foreground">{r.linhaOriginal}</td>
                          {modoParsed === 'blocos' && (
                            <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                              {r.blocoData ? formatDate(r.blocoData) : '—'}
                            </td>
                          )}
                          <td className="px-2 py-1.5 text-center">
                            {r.valido
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-success inline" />
                              : <XCircle className="w-3.5 h-3.5 text-destructive inline" />}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-primary">
                            {r.nr_cliente || <span className="text-muted-foreground/40 italic">—</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            <BadgeClassificacao
                              classif={classifPorLinha.get(r.linhaOriginal)}
                              autorizada={linhasAutorizadas.has(r.linhaOriginal)}
                              carregando={carregandoClassif}
                            />
                          </td>
                          <td className="px-2 py-1.5 max-w-[130px] truncate font-medium">
                            {r.nome_cliente || <span className="text-muted-foreground/40 italic">sem nome</span>}
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {r.vencimento
                              ? formatDate(r.vencimento)
                              : <span className="text-destructive font-semibold">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {r.valor !== null
                              ? formatCurrency(r.valor)
                              : <span className="text-destructive font-semibold">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">
                            {r.parcelas > 1 ? `${r.parcelas}x` : r.parcelas === 1 ? '1x' : '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground">
                              {r.status}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground max-w-[90px] truncate">
                            {r.whatsapp || <span className="opacity-30">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-[11px] max-w-[80px] truncate text-muted-foreground">
                            {r.instituicao || <span className="opacity-30">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-[10px] max-w-[180px]">
                            {errosFatais.length > 0 && (
                              <span className="text-destructive block">{errosFatais.join('; ')}</span>
                            )}
                            {avisosMsgs.length > 0 && (
                              <span className="text-warning/80 block">{avisosMsgs.join('; ')}</span>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {invalidos > 0 && (
            <div className="flex items-start gap-2 p-3 bg-warning/8 border border-warning/20 rounded-lg text-xs text-warning">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                {invalidos} registro(s) com erros serão <strong>ignorados</strong>.
                Apenas os {validos} válidos serão importados.
              </span>
            </div>
          )}

          {/* ── Painel de classificação dos NRs ────────────────────────── */}
          {(classificacao.length > 0 || carregandoClassif) && (
            <div className="p-3 bg-muted/30 border border-border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Shield className="w-3.5 h-3.5" />
                  Classificação de NRs
                  {carregandoClassif && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                      <RefreshCw className="w-3 h-3 animate-spin" /> classificando…
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">
                    Novo: {totaisClassif.novo}
                  </Badge>
                  {totaisClassif.extra > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                      Extra: {totaisClassif.extra}
                    </Badge>
                  )}
                  {totaisClassif.direto > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                      Direto: {totaisClassif.direto}
                    </Badge>
                  )}
                  {totaisClassif.duplicado > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                      Duplicado: {totaisClassif.duplicado}
                    </Badge>
                  )}
                </div>
              </div>
              {linhasBloqueadas.length > 0 && (
                <div className="flex items-start justify-between gap-3 p-2.5 bg-destructive/5 border border-destructive/20 rounded-md">
                  <div className="text-[11px] text-destructive/90 leading-relaxed flex-1">
                    <strong>{linhasBloqueadas.length}</strong> NR(s) duplicado(s) estão <strong>bloqueados</strong>.
                    Para importá-los, é necessária a autorização de um líder,
                    elite, gerência ou administrador. Ao autorizar, os NRs
                    selecionados serão transferidos para o operador atual e o
                    acordo anterior será enviado para a lixeira com notificação
                    automática ao operador anterior.
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={abrirModalAutorizacao}
                    className="text-xs h-8 whitespace-nowrap border-destructive/40 text-destructive hover:bg-destructive/10"
                    disabled={importando}
                  >
                    <Shield className="w-3 h-3 mr-1" />
                    Autorizar Nrs bloqueados
                  </Button>
                </div>
              )}
              {linhasAutorizadas.size > 0 && autorizador && (
                <div className="text-[11px] text-success bg-success/5 border border-success/20 rounded-md p-2">
                  ✓ {linhasAutorizadas.size} NR(s) autorizado(s) por {autorizador.nome} ({autorizador.perfil}).
                </div>
              )}
            </div>
          )}


          <div className="flex justify-between">
            <Button variant="outline" onClick={() => { setEtapa('upload'); setArquivo(null); }}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Novo arquivo
            </Button>
            <Button
              onClick={confirmarImportacao}
              disabled={importando || validos === 0}
              className="gap-2"
            >
              {importando
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Importando...</>
                : <><CheckCircle2 className="w-4 h-4" /> Importar {validos} acordo(s)</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* ─── ETAPA 3: RESULTADO ─── */}
      {etapa === 'resultado' && resultado && (
        <div className="space-y-4">
          <Card className={cn('border', resultado.ok > 0 ? 'border-success/30 bg-success/5' : 'border-destructive/30')}>
            <CardContent className="p-8 text-center">
              {resultado.ok > 0
                ? <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
                : <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />}
              <h2 className="text-xl font-bold text-foreground mb-2">
                {resultado.ok > 0 ? 'Importação concluída!' : 'Nenhum acordo importado'}
              </h2>
              <div className="flex justify-center gap-8 mt-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-success">{resultado.ok}</p>
                  <p className="text-sm text-muted-foreground">Importados</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-destructive">{resultado.erros}</p>
                  <p className="text-sm text-muted-foreground">Ignorados</p>
                </div>
              </div>
              {resultado.msgs.length > 0 && (
                <div className="mt-4 p-3 bg-destructive/10 rounded-lg text-left">
                  {resultado.msgs.map((m, i) => <p key={i} className="text-xs text-destructive">{m}</p>)}
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => { setEtapa('upload'); setArquivo(null); setRegistros([]); }}>
              Nova Importação
            </Button>
            <Button onClick={() => navigate(ROUTE_PATHS.ACORDOS)}>Ver Acordos <ArrowRight className="w-4 h-4 ml-1.5" /></Button>
          </div>
        </div>
      )}

      {/* ─── MODAL DE AUTORIZAÇÃO DE NRS BLOQUEADOS ─── */}
      <Dialog open={modalAutorizacaoAberto} onOpenChange={setModalAutorizacaoAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-destructive" /> Autorizar NRs bloqueados
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Selecione os NRs duplicados que devem ser transferidos para o
              operador atual. É necessário e-mail e senha de um líder, elite,
              gerência ou administrador. Ao confirmar, cada NR selecionado será
              transferido e o acordo anterior do outro operador será enviado
              para a lixeira com notificação automática.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[260px] overflow-y-auto border border-border rounded-md divide-y divide-border">
            {linhasBloqueadas.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground text-center">
                Nenhum NR bloqueado.
              </p>
            )}
            {linhasBloqueadas.map(c => (
              <label
                key={c.linhaOriginal}
                className="flex items-start gap-2 p-2 hover:bg-muted/30 cursor-pointer"
              >
                <Checkbox
                  checked={linhasSelecionadas.has(c.linhaOriginal)}
                  onCheckedChange={() => alternarLinhaSelecionada(c.linhaOriginal)}
                  className="mt-0.5"
                />
                <div className="flex-1 text-xs">
                  <div className="font-mono text-primary">
                    #{c.linhaOriginal} — {c.nr}
                  </div>
                  <div className="text-muted-foreground">
                    Atualmente em posse de <strong>{c.donoAtual?.operadorNome ?? '—'}</strong>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="space-y-2 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                E-mail do líder/admin
              </label>
              <Input
                type="email"
                value={liderEmail}
                onChange={e => setLiderEmail(e.target.value)}
                placeholder="lider@empresa.com"
                disabled={autorizando}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Senha
              </label>
              <Input
                type="password"
                value={liderSenha}
                onChange={e => setLiderSenha(e.target.value)}
                disabled={autorizando}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setModalAutorizacaoAberto(false)}
              disabled={autorizando}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmarAutorizacaoBloqueados}
              disabled={autorizando || linhasSelecionadas.size === 0}
              className="gap-2"
            >
              {autorizando
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Autorizando…</>
                : <><Shield className="w-4 h-4" /> Autorizar {linhasSelecionadas.size}</>
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Componente auxiliar: badge visual por categoria de classificação ────────
function BadgeClassificacao({
  classif,
  autorizada,
  carregando,
}: {
  classif: ClassificacaoNR | undefined;
  autorizada: boolean;
  carregando: boolean;
}) {
  if (!classif) {
    return (
      <span className="text-[10px] text-muted-foreground/50 italic">
        {carregando ? '…' : '—'}
      </span>
    );
  }
  const cat: CategoriaImport = classif.categoria;

  if (cat === 'novo' || cat === 'disponivel') {
    return (
      <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">
        Novo
      </Badge>
    );
  }
  if (cat === 'extra') {
    return (
      <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
        Extra
      </Badge>
    );
  }
  if (cat === 'direto') {
    return (
      <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
        Direto
      </Badge>
    );
  }
  // duplicado
  if (autorizada) {
    return (
      <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">
        Autorizado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
      Duplicado
    </Badge>
  );
}
