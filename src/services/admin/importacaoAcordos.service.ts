/**
 * importacaoAcordos.service.ts — devolver ao operador as tabulações que a saída
 * dele apagou.
 *
 * ## Por que existe
 *
 * Sair "limpo" (transferência de setor ou exclusão de usuário) baixa o relatório
 * das tabulações ANTES de qualquer DELETE — ver `exclusaoUsuario.service` e
 * `transferenciaUsuario.service`. Essa ordem sempre foi a garantia de que nada
 * se perde; o que faltava era o caminho de volta. Quando a saída foi um engano,
 * o relatório é a única cópia, e até 19/08/2026 ele só servia para alguém
 * retabular à mão, linha por linha.
 *
 * Este módulo LÊ aquele mesmo arquivo — o que já é baixado, sem mudar nada na
 * exportação — e reconstrói os acordos no operador escolhido.
 *
 * ## O que o arquivo carrega, e o que não carrega
 *
 * As colunas são exatamente as de `COLUNAS` em `exclusaoUsuario.service`. Delas
 * sai quase o acordo inteiro. O que NÃO está lá, e de onde vem:
 *
 *   • `empresa_id` / `setor_id` → do perfil escolhido. `setor_id` fica nulo de
 *     propósito: o trigger `trg_setor_acordo` carimba o setor de quem tabula, e
 *     é isso que o painel deve mostrar depois da volta.
 *   • `acordo_grupo_id` → recriado. A coluna "Parcela" guarda `n/m`, então as
 *     linhas de um mesmo parcelamento voltam a se reconhecer por NR + cliente +
 *     total de parcelas, e ganham um grupo novo.
 *   • `tag_ids`, `tipo_receptivo`, `usou_quarenta_pct` → não existem no
 *     relatório. Voltam no padrão.
 *   • `estado_uf` (só PaguePlay, onde é obrigatório por trigger) → do prefixo
 *     legado `[ESTADO:XX]` em Observações, ou do campo que a tela oferece.
 *
 * ## O NR manda
 *
 * `trg_sync_nr_registros` registra o NR no INSERT e chama `fn_nr_exigir_livre`.
 * Se alguém tabulou aquele NR no intervalo, o banco RECUSA — e recusaria o lote
 * inteiro, porque um INSERT de várias linhas é uma instrução só. Por isso a
 * conferência acontece ANTES (`verificarNrsEmLote`) e o conflito vira aviso na
 * tela, com o nome de quem está com o NR agora. Quem já tem dono não entra;
 * todo o resto entra.
 */
import { supabase } from '@/lib/supabase';
import { verificarNrsEmLote, type NrCampo } from '@/services/nr_registros.service';

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Uma linha do relatório já traduzida para o formato do banco. */
export interface AcordoDoRelatorio {
  /** 1-based, contando o cabeçalho — o número que a pessoa vê no Excel. */
  linha: number;
  nr_cliente: string;
  nome_cliente: string;
  instituicao: string | null;
  vencimento: string;
  valor: number;
  valor_total: number | null;
  valor_entrada: number | null;
  numero_parcela: number;
  parcelas: number;
  tipo: string;
  status: string;
  data_pagamento: string | null;
  data_cadastro: string | null;
  tipo_vinculo: string;
  vinculo_operador_nome: string | null;
  whatsapp: string | null;
  observacoes: string | null;
  estado_uf: string | null;
}

/** Linha que o arquivo trouxe mas que não dá para gravar. */
export interface LinhaRecusada {
  linha: number;
  rotulo: string;
  motivo: string;
}

/** NR que já pertence a outro operador — não entra, e a tela avisa. */
export interface ConflitoDeNr {
  linha: number;
  nr: string;
  rotulo: string;
  operadorNome: string;
}

export interface PreviaImportacao {
  /** Prontas para gravar. */
  aptas: AcordoDoRelatorio[];
  conflitos: ConflitoDeNr[];
  recusadas: LinhaRecusada[];
  /** Total de linhas lidas do arquivo, incluindo as que não passaram. */
  totalLido: number;
}

export interface ResultadoImportacao {
  gravados: number;
  /** Linhas que o banco recusou uma a uma, depois do lote falhar. */
  falhas: LinhaRecusada[];
}

/** Cabeçalhos que o relatório exportado usa, na ordem em que ele os escreve. */
const CABECALHOS = [
  'NR / Código', 'Cliente', 'Instituição', 'Vencimento', 'Valor', 'Valor total',
  'Entrada', 'Parcela', 'Tipo', 'Status', 'Pagamento em', 'Cadastrado em',
  'Vínculo', 'Pareado com', 'WhatsApp', 'Observações',
] as const;

/** O mínimo para reconhecer o arquivo como sendo o relatório de acordos. */
const OBRIGATORIOS = ['NR / Código', 'Cliente', 'Vencimento', 'Valor'] as const;

export class RelatorioIlegivel extends Error {}

// ── Leitura do arquivo ───────────────────────────────────────────────────────

/**
 * Lê a planilha e traduz cada linha.
 *
 * O `import()` é dinâmico pela mesma razão da exportação: `@e965/xlsx` pesa
 * ~484 KB e não pode entrar no chunk de Configurações, que abre em toda sessão
 * de admin. Ver `services/xlsx-fora-do-caminho-de-leitura.test.ts`.
 *
 * @throws RelatorioIlegivel quando o arquivo não é o relatório — dizer isso na
 *         hora é melhor que devolver 300 linhas recusadas uma a uma.
 */
export async function lerRelatorioAcordos(
  arquivo: File,
): Promise<{ linhas: AcordoDoRelatorio[]; recusadas: LinhaRecusada[] }> {
  const { read, utils } = await import('@e965/xlsx');

  let planilha: ReturnType<typeof read>;
  try {
    planilha = read(await arquivo.arrayBuffer(), { type: 'array' });
  } catch (e) {
    throw new RelatorioIlegivel(
      `Não foi possível abrir "${arquivo.name}". ${e instanceof Error ? e.message : ''}`.trim(),
    );
  }

  const primeira = planilha.SheetNames[0];
  if (!primeira) throw new RelatorioIlegivel('A planilha não tem nenhuma aba.');

  const bruto = utils.sheet_to_json<Record<string, unknown>>(planilha.Sheets[primeira], {
    // Datas e números viram texto: o relatório grava `date` do Postgres como
    // 'yyyy-MM-dd', e deixar o xlsx adivinhar produzia um `Date` no fuso local
    // que voltava um dia atrás.
    raw: false,
    defval: '',
  });

  if (!bruto.length) throw new RelatorioIlegivel('A planilha está vazia.');

  const colunas = new Set(Object.keys(bruto[0]));
  const faltando = OBRIGATORIOS.filter(c => !colunas.has(c));
  if (faltando.length) {
    throw new RelatorioIlegivel(
      `Este arquivo não parece o relatório de acordos: faltam as colunas ${faltando.join(', ')}. `
      + `O esperado é o .xlsx que o próprio sistema baixa (${CABECALHOS.slice(0, 4).join(', ')}…).`,
    );
  }

  const linhas: AcordoDoRelatorio[] = [];
  const recusadas: LinhaRecusada[] = [];

  bruto.forEach((r, i) => {
    // +2: a linha 1 é o cabeçalho e o índice começa em zero.
    const numero = i + 2;
    const codigo = texto(r['NR / Código']);
    const instituicao = texto(r['Instituição']);
    const cliente = texto(r['Cliente']);
    const rotulo = codigo || cliente || `linha ${numero}`;

    if (!cliente) {
      recusadas.push({ linha: numero, rotulo, motivo: 'Sem nome do cliente.' });
      return;
    }
    const vencimento = data(r['Vencimento']);
    if (!vencimento) {
      recusadas.push({ linha: numero, rotulo, motivo: 'Vencimento vazio ou em formato desconhecido.' });
      return;
    }
    const valor = numero_(r['Valor']);
    if (valor === null) {
      recusadas.push({ linha: numero, rotulo, motivo: 'Valor vazio ou não numérico.' });
      return;
    }

    const [parcelaAtual, totalParcelas] = parcela(r['Parcela']);

    linhas.push({
      linha: numero,
      // O relatório escreve `nr_cliente || instituicao` nesta coluna. Quando os
      // dois vêm iguais, foi o fallback — o acordo não tinha NR.
      nr_cliente: codigo && codigo !== instituicao ? codigo : '',
      nome_cliente: cliente,
      instituicao: instituicao || null,
      vencimento,
      valor,
      valor_total: numero_(r['Valor total']),
      valor_entrada: numero_(r['Entrada']),
      numero_parcela: parcelaAtual,
      parcelas: totalParcelas,
      tipo: texto(r['Tipo']) || 'boleto',
      status: texto(r['Status']) || 'verificar_pendente',
      data_pagamento: data(r['Pagamento em']),
      data_cadastro: data(r['Cadastrado em']),
      tipo_vinculo: texto(r['Vínculo']) || 'direto',
      vinculo_operador_nome: texto(r['Pareado com']) || null,
      whatsapp: texto(r['WhatsApp']) || null,
      observacoes: texto(r['Observações']) || null,
      estado_uf: ufDasObservacoes(texto(r['Observações'])),
    });
  });

  return { linhas, recusadas };
}

// ── Prévia ───────────────────────────────────────────────────────────────────

/**
 * Separa o que entra do que não entra, ANTES de gravar qualquer coisa.
 *
 * O conflito de NR é a razão de a prévia existir: descobrir no INSERT que um
 * NR virou de outra pessoa derruba o lote inteiro, e o admin fica sem saber
 * quantas das 38 linhas eram o problema.
 */
export async function analisarImportacao(params: {
  linhas: AcordoDoRelatorio[];
  recusadas: LinhaRecusada[];
  empresaId: string;
  /** BookPlay chaveia por `nr_cliente`; PaguePlay, por `instituicao`. */
  campoNr: NrCampo;
}): Promise<PreviaImportacao> {
  const { linhas, recusadas, empresaId, campoNr } = params;

  const chaveDe = (a: AcordoDoRelatorio) =>
    (campoNr === 'nr_cliente' ? a.nr_cliente : a.instituicao ?? '').trim();

  // `nao_pago` e `extra` não são titulares do NR (ver `fn_sync_nr_registros`),
  // então não disputam nada e nem precisam ser consultados.
  const disputa = (a: AcordoDoRelatorio) =>
    a.tipo_vinculo !== 'extra' && a.status !== 'nao_pago' && !!chaveDe(a);

  const ocupados = await verificarNrsEmLote(
    linhas.filter(disputa).map(chaveDe), empresaId, campoNr,
  );

  const aptas: AcordoDoRelatorio[] = [];
  const conflitos: ConflitoDeNr[] = [];

  for (const a of linhas) {
    const chave = chaveDe(a);
    const dono = disputa(a) ? ocupados.get(chave) : undefined;
    if (dono) {
      conflitos.push({
        linha: a.linha, nr: chave,
        rotulo: a.nome_cliente,
        operadorNome: dono.operadorNome,
      });
      continue;
    }
    aptas.push(a);
  }

  return { aptas, conflitos, recusadas, totalLido: linhas.length + recusadas.length };
}

// ── Gravação ─────────────────────────────────────────────────────────────────

/**
 * Grava as linhas aptas no operador escolhido.
 *
 * Vai em lotes de 200 para não estourar o tamanho do payload. Um lote que falha
 * é reprocessado LINHA A LINHA: o erro do Postgres nomeia o problema mas não a
 * linha, e sem esse segundo passe uma única tabulação estranha levaria as
 * outras 199 junto.
 */
export async function importarAcordos(params: {
  aptas: AcordoDoRelatorio[];
  operadorId: string;
  empresaId: string;
  /** Resolve "Pareado com" → `vinculo_operador_id`. Nome → id, minúsculo. */
  perfisPorNome: Map<string, string>;
  /** PaguePlay exige UF por trigger; usado quando a linha não trouxe a dela. */
  ufPadrao?: string | null;
}): Promise<ResultadoImportacao> {
  const { aptas, operadorId, empresaId, perfisPorNome, ufPadrao } = params;
  if (!aptas.length) return { gravados: 0, falhas: [] };

  const grupos = gruposDeParcelamento(aptas);

  const registros = aptas.map(a => ({
    linha:  a.linha,
    rotulo: a.nr_cliente || a.nome_cliente,
    registro: {
    empresa_id:   empresaId,
    operador_id:  operadorId,
    // `setor_id` de fora: `trg_setor_acordo` carimba o setor atual do operador,
    // que é onde estas tabulações passam a contar.
    nr_cliente:   a.nr_cliente,
    nome_cliente: a.nome_cliente,
    instituicao:  a.instituicao,
    vencimento:   a.vencimento,
    valor:        a.valor,
    valor_total:  a.valor_total,
    valor_entrada: a.valor_entrada,
    numero_parcela: a.numero_parcela,
    parcelas:     a.parcelas,
    tipo:         a.tipo,
    status:       a.status,
    data_pagamento: a.data_pagamento,
    ...(a.data_cadastro ? { data_cadastro: a.data_cadastro } : {}),
    tipo_vinculo: a.tipo_vinculo,
    vinculo_operador_nome: a.vinculo_operador_nome,
    vinculo_operador_id:
      perfisPorNome.get((a.vinculo_operador_nome ?? '').trim().toLowerCase()) ?? null,
    whatsapp:     a.whatsapp,
    observacoes:  a.observacoes,
    estado_uf:    a.estado_uf ?? (ufPadrao ? ufPadrao.toUpperCase() : null),
    acordo_grupo_id: grupos.get(a.linha) ?? null,
    },
  }));

  let gravados = 0;
  const falhas: LinhaRecusada[] = [];

  for (let i = 0; i < registros.length; i += 200) {
    const lote = registros.slice(i, i + 200);
    const { error } = await supabase.from('acordos').insert(lote.map(r => r.registro));
    if (!error) { gravados += lote.length; continue; }

    for (const r of lote) {
      const { error: erroLinha } = await supabase.from('acordos').insert([r.registro]);
      if (erroLinha) {
        falhas.push({ linha: r.linha, rotulo: r.rotulo, motivo: traduzir(erroLinha.message) });
      } else {
        gravados += 1;
      }
    }
  }

  return { gravados, falhas };
}

/**
 * Reconstrói os parcelamentos.
 *
 * `acordo_grupo_id` não vai no relatório, mas "Parcela" (`n/m`) vai. Linhas com
 * o MESMO cliente, mesmo NR e o mesmo `m` eram o mesmo parcelamento — e voltam
 * a ser, com um id novo. Grupo de uma parcela só não existe: `m = 1` fica nulo,
 * como no cadastro comum.
 */
function gruposDeParcelamento(linhas: AcordoDoRelatorio[]): Map<number, string> {
  const porChave = new Map<string, string>();
  const saida = new Map<number, string>();

  for (const a of linhas) {
    if (a.parcelas <= 1) continue;
    const chave = `${a.nr_cliente}|${a.nome_cliente}|${a.parcelas}`;
    let id = porChave.get(chave);
    if (!id) { id = crypto.randomUUID(); porChave.set(chave, id); }
    saida.set(a.linha, id);
  }
  return saida;
}

/** Texto cru do Postgres → frase que diz o que aconteceu naquela linha. */
function traduzir(mensagem: string): string {
  if (/NR_JA_REGISTRADO/i.test(mensagem)) {
    const limpa = mensagem.split('NR_JA_REGISTRADO:')[1]?.trim();
    return limpa || 'O NR passou a ser de outro operador entre a conferência e a gravação.';
  }
  if (/Estado \(UF\) obrigat/i.test(mensagem)) {
    return 'A PaguePlay exige o estado (UF), e o relatório não traz essa coluna. '
      + 'Preencha o estado padrão no formulário e importe de novo.';
  }
  if (/CPF/i.test(mensagem)) return 'O banco recusou: o NR desta linha parece um CPF.';
  if (/violates row-level security|permission denied/i.test(mensagem)) {
    return 'Sem permissão para gravar esta tabulação no operador escolhido.';
  }
  return mensagem;
}

// ── Conversões ───────────────────────────────────────────────────────────────

function texto(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

/**
 * Número em qualquer das formas que a planilha pode ter.
 *
 * `raw: false` faz o xlsx devolver o texto formatado, então "1.234,56" e
 * "R$ 1.234,56" chegam aqui — e o `Number()` direto daria `NaN`, que virava
 * zero e apagava o valor do acordo sem avisar.
 */
function numero_(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;

  // \u00A0: o Excel escreve moeda com espaço NÃO separável entre "R$" e o número.
  let t = String(v).replace(/[R$\s\u00A0]/g, '');
  if (!t) return null;
  // "1.234,56" → vírgula é o decimal. "1234.56" → ponto é o decimal.
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Data no formato que o Postgres aceita em coluna `date`.
 *
 * O relatório grava 'yyyy-MM-dd' — o caminho comum. Os outros dois casos são
 * de arquivo que passou pelo Excel: 'dd/MM/yyyy' e o serial numérico, cuja
 * origem é 30/12/1899.
 */
function data(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);

  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const [, d, m, a] = br;
    return `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  if (/^\d+(\.\d+)?$/.test(t)) {
    const serial = Number(t);
    if (serial > 0 && serial < 100000) {
      const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
      return new Date(ms).toISOString().slice(0, 10);
    }
  }
  return null;
}

/** "3/12" → [3, 12]. Vazio ou ilegível → [1, 1], o mesmo padrão do cadastro. */
function parcela(v: unknown): [number, number] {
  const m = texto(v).match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return [1, 1];
  const atual = Number(m[1]) || 1;
  const total = Number(m[2]) || 1;
  return [atual, Math.max(total, atual)];
}

/**
 * UF do prefixo legado `[ESTADO:XX]` em Observações.
 *
 * A coluna `estado_uf` nasceu depois do prefixo, e `fn_acordo_exige_estado`
 * ainda lê os dois. Como o relatório carrega Observações inteiras, o estado de
 * um acordo antigo da PaguePlay volta sozinho.
 */
function ufDasObservacoes(obs: string): string | null {
  const m = obs.match(/^\[ESTADO:([A-Za-z]{2})\]/);
  return m ? m[1].toUpperCase() : null;
}
