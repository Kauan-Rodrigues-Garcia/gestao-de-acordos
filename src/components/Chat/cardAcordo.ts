/**
 * As partes puras do card «acordo vinculado alterado» (`CardAcordoVinculado`):
 * ler `sistema_dados`, escolher o acordo de quem lê e montar as frases.
 * Ver migration 20261030235500.
 *
 * O mesmo card leva os dois avisos do Analítico (20261116234244): o acordo
 * que mudou de dono no Divergente (`transferido`) e o colega que ficou Extra
 * quando o relatório mostrou o par (`virou_extra`).
 */
import { formatCurrency, formatDate } from '@/lib/index';

export interface MudancaAcordo {
  campo: string;
  de:    unknown;
  para:  unknown;
}

export interface DadosCardAcordo {
  evento:          'alterado' | 'excluido' | 'transferido' | 'virou_extra';
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
  /** Avisos do Analítico: quem tinha o acordo e o dono da linha do relatório. */
  deId:            string | null;
  deNome:          string | null;
  paraId:          string | null;
  paraNome:        string | null;
  /** Avisos do Analítico: quanto entrou no relatório. */
  valorRecebido:   number | null;
}

const EVENTOS: readonly DadosCardAcordo['evento'][] = ['alterado', 'excluido', 'transferido', 'virou_extra'];

/** O card veio do Analítico (transferência ou par pelo relatório)? */
export function ehCardDoAnalitico(dados: Pick<DadosCardAcordo, 'evento'>): boolean {
  return dados.evento === 'transferido' || dados.evento === 'virou_extra';
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
    evento:       EVENTOS.find(e => e === d.evento) ?? 'alterado',
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
    deId:          texto(d.de_id),
    deNome:        texto(d.de_nome),
    paraId:        texto(d.para_id),
    paraNome:      texto(d.para_nome),
    valorRecebido: numero(d.valor_recebido),
  };
}

/**
 * O acordo que este card abre para quem lê: o dele, ou o que houver.
 *
 * Nos avisos do Analítico, quem perdeu o acordo não tem o que abrir: o que
 * sobrou no card é o acordo do colega, fora do alcance dele.
 */
export function acordoDoLeitor(dados: DadosCardAcordo, meuId: string | null | undefined): string | null {
  if (meuId && dados.acordos[meuId]) return dados.acordos[meuId];
  if (ehCardDoAnalitico(dados) && meuId && (meuId === dados.deId || meuId === dados.paraId)) return null;
  return Object.values(dados.acordos)[0] ?? null;
}

/** «você» para quem lê, o nome para os outros. */
function quemE(id: string | null, nome: string | null, meuId: string | null | undefined): string {
  return id && id === meuId ? 'você' : (nome ?? 'outro operador');
}

/**
 * As frases do aviso do Analítico, na voz de quem lê.
 *
 * `titulo` diz o que aconteceu; `detalhe`, por que e o que fica para a pessoa.
 */
export function frasesDoAnalitico(
  dados: DadosCardAcordo,
  meuId: string | null | undefined,
): { titulo: string; detalhe: string } {
  const de = quemE(dados.deId, dados.deNome, meuId);
  const para = quemE(dados.paraId, dados.paraNome, meuId);
  const souDe = !!meuId && meuId === dados.deId;
  const souPara = !!meuId && meuId === dados.paraId;
  const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  if (dados.evento === 'virou_extra') {
    return {
      titulo: souDe
        ? 'Seu acordo virou Extra'
        : souPara
          ? 'Você entrou como Direto'
          : `${maiuscula(para)} entrou como Direto`,
      detalhe: souDe
        ? `O relatório mostra ${para} como Direto e o seu recebimento como Extra. Seu acordo continua com você.`
        : `O relatório mostra ${para} como Direto e ${de} como Extra. Cada um segue com o seu acordo, ligados em par.`,
    };
  }
  return {
    titulo: souDe
      ? `Seu acordo passou para ${para}`
      : souPara
        ? `O acordo de ${de} passou para você`
        : `O acordo passou de ${de} para ${para}`,
    detalhe: souDe
      ? `O pagamento entrou no Analítico em nome de ${para}, por isso o acordo saiu da sua lista.`
      : `O pagamento entrou no Analítico em nome de ${para}. O acordo mudou de dono com os mesmos dados.`,
  };
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
