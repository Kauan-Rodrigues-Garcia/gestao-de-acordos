/**
 * As partes puras do card «acordo vinculado alterado» (`CardAcordoVinculado`):
 * ler `sistema_dados`, escolher o acordo de quem lê e montar as frases.
 * Ver migration 20261030235500.
 */
import { formatCurrency, formatDate } from '@/lib/index';

export interface MudancaAcordo {
  campo: string;
  de:    unknown;
  para:  unknown;
}

export interface DadosCardAcordo {
  evento:          'alterado' | 'excluido';
  feitoPor:        string | null;
  feitoPorNome:    string;
  rotulo:          string;
  chave:           string | null;
  cliente:         string | null;
  parcela:         number | null;
  parcelas:        number | null;
  mudancas:        MudancaAcordo[];
  /** operador → acordo dele. Cada um abre o SEU lado. */
  acordos:         Record<string, string>;
  /** `false`: o outro lado recusou a cópia (o card avisa). */
  sincronizado:    boolean;
  /** Exclusão: o que aconteceu com o acordo que ficou. */
  resultado:       'virou_direto' | 'sem_vinculo' | null;
}

const ROTULO_CAMPO: Record<string, string> = {
  status:         'Situação',
  valor:          'Valor',
  vencimento:     'Vencimento',
  data_pagamento: 'Data de pagamento',
  valor_total:    'Valor total',
  valor_entrada:  'Entrada',
  parcelas:       'Parcelas',
  tipo:           'Forma de pagamento',
  nome_cliente:   'Cliente',
  whatsapp:       'WhatsApp',
};

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** `sistema_dados` como chega do banco, já com tipos de que a tela depende. */
export function lerCardAcordo(bruto: Record<string, unknown> | null | undefined): DadosCardAcordo {
  const d = bruto ?? {};
  const acordos: Record<string, string> = {};
  if (d.acordos && typeof d.acordos === 'object') {
    for (const [quem, id] of Object.entries(d.acordos as Record<string, unknown>)) {
      if (typeof id === 'string') acordos[quem] = id;
    }
  }
  const mudancas = Array.isArray(d.mudancas)
    ? (d.mudancas as Record<string, unknown>[])
        .filter(m => typeof m?.campo === 'string')
        .map(m => ({ campo: m.campo as string, de: m.de ?? null, para: m.para ?? null }))
    : [];
  const resultado = d.resultado === 'virou_direto' || d.resultado === 'sem_vinculo' ? d.resultado : null;
  return {
    evento:       d.evento === 'excluido' ? 'excluido' : 'alterado',
    feitoPor:     texto(d.feito_por),
    feitoPorNome: texto(d.feito_por_nome) ?? 'Alguém',
    rotulo:       texto(d.rotulo) ?? 'NR',
    chave:        texto(d.chave),
    cliente:      texto(d.cliente),
    parcela:      numero(d.parcela),
    parcelas:     numero(d.parcelas),
    mudancas,
    acordos,
    sincronizado: d.sincronizado !== false,
    resultado,
  };
}

/** O acordo que este card abre para quem lê: o dele, ou o que houver. */
export function acordoDoLeitor(dados: DadosCardAcordo, meuId: string | null | undefined): string | null {
  if (meuId && dados.acordos[meuId]) return dados.acordos[meuId];
  return Object.values(dados.acordos)[0] ?? null;
}

/** Uma linha «Campo: antes → depois», com os rótulos do tenant de quem lê. */
export function descreverMudanca(
  m: MudancaAcordo,
  rotulos: { status: Record<string, string>; tipo: Record<string, string> },
): { campo: string; de: string | null; para: string | null } {
  const campo = ROTULO_CAMPO[m.campo] ?? m.campo;
  // O WhatsApp viaja sem os números: o card só diz que mudou.
  if (m.campo === 'whatsapp') return { campo, de: null, para: null };

  const formatar = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—';
    switch (m.campo) {
      case 'valor':
      case 'valor_total':
      case 'valor_entrada':  return formatCurrency(v);
      case 'vencimento':
      case 'data_pagamento': return formatDate(String(v));
      case 'status':         return rotulos.status[String(v)] ?? String(v);
      case 'tipo':           return rotulos.tipo[String(v)] ?? String(v);
      default:               return String(v);
    }
  };
  return { campo, de: formatar(m.de), para: formatar(m.para) };
}

/** O título da ação: «Isa marcou como Pago», «Você alterou o acordo». */
export function fraseDoCard(
  dados: DadosCardAcordo,
  meuId: string | null | undefined,
  rotulosStatus: Record<string, string>,
): string {
  const quem = dados.feitoPor && dados.feitoPor === meuId ? 'Você' : dados.feitoPorNome;
  if (dados.evento === 'excluido') {
    return dados.parcela && (dados.parcelas ?? 1) > 1
      ? `${quem} excluiu a parcela ${dados.parcela} do acordo vinculado`
      : `${quem} excluiu o acordo vinculado`;
  }
  const status = dados.mudancas.find(m => m.campo === 'status');
  if (status && dados.mudancas.length <= 2 && typeof status.para === 'string') {
    return `${quem} marcou como ${rotulosStatus[status.para] ?? status.para}`;
  }
  return `${quem} alterou o acordo vinculado`;
}
