/**
 * importacaoVendas.service.ts — a carga do relatório de prospecção.
 *
 * ## A ordem importa, e o meio do caminho é visível
 *
 *   1. `abrirLote`     — o lote nasce em `carregando`. Nada mudou de lugar.
 *   2. `enviarLinhas`  — em blocos. Falhar aqui deixa um lote pela metade,
 *                        que `descartarLote` limpa.
 *   3. `promoverLote`  — a troca de retrato, numa transação só: o lote vira
 *                        vigente, o anterior do mesmo mês perde as linhas, e as
 *                        franquias aparecem no de-para.
 *
 * Três passos e não um porque o arquivo de agosto tem 6.934 linhas aceitas: uma
 * chamada só ou estoura o limite do payload ou fica minutos sem dar sinal. Com
 * blocos, a tela mostra progresso — e um erro no bloco 12 diz que foi no 12.
 *
 * ## Nada disto toca `vendas`
 *
 * A projeção do relatório sobre a venda — dedupe entre meses, reversão, régua —
 * é a Fase 3. Aqui o relatório entra e as franquias aparecem para vincular.
 */
import { rpcSemTipo, tabelaSemTipo } from '@/lib/supabaseSemTipo';
import type { LinhaProspeccao } from './prospeccaoParser';
import type { LinhaSetor } from './prospeccaoSetorParser';
import { mensagemDoErro, pareceNaoInstalado } from './erroDoBanco';

/**
 * Quantas linhas por ida ao servidor.
 *
 * 500 é o meio termo medido de olho no arquivo real: agosto vira 14 blocos,
 * setembro 6. Blocos muito menores multiplicam a latência; muito maiores
 * voltam a esconder onde o erro aconteceu.
 */
const TAMANHO_DO_BLOCO = 500;

export type OrigemLote = 'setor' | 'geral';
export type EstadoLote = 'carregando' | 'vigente' | 'substituido' | 'descartado';

export interface Lote {
  id: string;
  empresa_id: string;
  mes: string;
  origem: OrigemLote;
  estado: EstadoLote;
  arquivo_nome: string | null;
  arquivo_hash: string | null;
  linhas_arquivo: number;
  linhas_aceitas: number;
  duplicados: number;
  descartadas: number;
  quantidade_na_regua: number;
  faturamento_na_regua: number;
  importado_em: string;
  promovido_em: string | null;
  observacao: string | null;
  perfis?: { id: string; nome: string } | null;
}

export type EstadoFranquia = 'novo' | 'vinculado' | 'ignorado';

export interface Franquia {
  id: string;
  empresa_id: string;
  codigo: string;
  nome: string;
  setor_id: string | null;
  estado: EstadoFranquia;
  primeira_aparicao: string;
  ultima_aparicao: string;
  vinculado_em: string | null;
  observacao: string | null;
  setores?: { id: string; nome: string } | null;
}

export interface Resultado<T = null> {
  ok: boolean;
  dado: T | null;
  erro: string | null;
}

/**
 * O que o banco disse, traduzido para o que é preciso fazer.
 *
 * A classificação mora em `erroDoBanco.ts`, e não aqui, porque esta função
 * existia copiada em três serviços — todas com o mesmo defeito, que em
 * 15/09/2026 fez a tela pedir a aplicação de uma migration **já aplicada**
 * enquanto o problema era uma FOREIGN KEY faltando em `vendas_lotes`.
 */
function traduzir(mensagem: string): string {
  if (/vendas_relatorio_nr_unico_no_lote/i.test(mensagem)) {
    return 'O arquivo trouxe o mesmo NR duas vezes no mesmo lote. '
         + 'Isso deveria ter sido resolvido na leitura — recarregue o arquivo.';
  }
  if (/uq_vendas_lotes_vigente/i.test(mensagem)) {
    return 'Outra importação deste mês terminou primeiro. Recarregue a tela e confira '
         + 'antes de importar de novo.';
  }
  return mensagemDoErro(
    mensagem, 'A importação de vendas', '20260915110000_vendas_fase2_lote_e_depara.sql',
  );
}

function num(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * SHA-256 do conteúdo, em hexadecimal.
 *
 * Serve para uma pergunta só, e útil: «este arquivo é o mesmo de antes?».
 * Reimportar byte a byte idêntico não é erro — é a exportação que não mudou —
 * mas saber disso poupa a conversa de «importei e não mudou nada».
 *
 * `crypto.subtle` exige contexto seguro; em `http://` ele não existe. Por isso
 * o `null`, que a tela trata como «sem hash» em vez de quebrar a importação
 * inteira por causa de um dado acessório.
 */
export async function hashDoArquivo(conteudo: string): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const bytes = new TextEncoder().encode(conteudo);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export async function abrirLote(params: {
  empresaId: string;
  /** 'yyyy-MM' — vira o primeiro dia do mês no banco. */
  mes: string;
  origem: OrigemLote;
  arquivoNome: string | null;
  arquivoHash: string | null;
}): Promise<Resultado<string>> {
  const { data, error } = await rpcSemTipo<string>('fn_vendas_lote_abrir', {
    p_empresa_id:   params.empresaId,
    p_mes:          `${params.mes}-01`,
    p_origem:       params.origem,
    p_arquivo_nome: params.arquivoNome,
    p_arquivo_hash: params.arquivoHash,
  });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  return { ok: true, dado: data ?? null, erro: null };
}

/**
 * Manda as linhas em blocos, avisando o progresso.
 *
 * `onProgresso` recebe quantas linhas já foram aceitas pelo servidor — não
 * quantas foram enviadas. A diferença aparece quando um bloco falha: o número
 * para, em vez de continuar subindo sobre linhas que não entraram.
 */
export async function enviarLinhas(
  loteId: string,
  /**
   * As linhas de QUALQUER um dos dois parsers.
   *
   * O tipo é largo de propósito: a RPC lê cada campo por nome (`j->>'campo'`) e
   * devolve NULL para o que não veio, então a linha do setor — que não tem
   * `codigo_franquia`, `categoria` nem `veio_de_lead` — entra pelo mesmo
   * caminho. Estreitar aqui obrigaria a inventar um tipo de união que não
   * descreve nada além de «o que cabe no JSON».
   */
  linhas: readonly (LinhaProspeccao | LinhaSetor)[],
  onProgresso?: (gravadas: number, total: number) => void,
): Promise<Resultado<number>> {
  let gravadas = 0;

  for (let i = 0; i < linhas.length; i += TAMANHO_DO_BLOCO) {
    const bloco = linhas.slice(i, i + TAMANHO_DO_BLOCO);
    const { data, error } = await rpcSemTipo<number>('fn_vendas_lote_linhas', {
      p_lote_id: loteId,
      p_linhas:  bloco,
    });
    if (error) {
      const qual = Math.floor(i / TAMANHO_DO_BLOCO) + 1;
      const total = Math.ceil(linhas.length / TAMANHO_DO_BLOCO);
      return {
        ok: false, dado: gravadas,
        erro: `Bloco ${qual} de ${total}: ${traduzir(error.message)}`,
      };
    }
    gravadas += num(data);
    onProgresso?.(gravadas, linhas.length);
  }

  return { ok: true, dado: gravadas, erro: null };
}

export interface ResultadoPromocao {
  franquias_novas: number;
  linhas_do_lote: number;
}

export async function promoverLote(loteId: string): Promise<Resultado<ResultadoPromocao>> {
  const { data, error } = await rpcSemTipo<ResultadoPromocao[] | ResultadoPromocao>(
    'fn_vendas_lote_promover', { p_lote_id: loteId },
  );
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };

  // A função devolve TABLE, e o PostgREST entrega uma linha só como array ou
  // como objeto conforme a versão. Aceitar os dois evita um erro que só
  // apareceria em produção.
  const linha = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    dado: {
      franquias_novas: num(linha?.franquias_novas),
      linhas_do_lote:  num(linha?.linhas_do_lote),
    },
    erro: null,
  };
}

export async function descartarLote(loteId: string, motivo: string | null): Promise<Resultado> {
  const { error } = await rpcSemTipo('fn_vendas_lote_descartar', {
    p_lote_id: loteId, p_motivo: motivo,
  });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  return { ok: true, dado: null, erro: null };
}

export interface ListaLotes {
  lotes: Lote[];
  disponivel: boolean;
  erro: string | null;
}

export async function buscarLotes(empresaId: string): Promise<ListaLotes> {
  const { data, error } = await tabelaSemTipo<Record<string, unknown>>('vendas_lotes')
    .select(`
      id, empresa_id, mes, origem, estado, arquivo_nome, arquivo_hash,
      linhas_arquivo, linhas_aceitas, duplicados, descartadas,
      quantidade_na_regua, faturamento_na_regua,
      importado_em, promovido_em, observacao,
      perfis:importado_por ( id, nome )
    `)
    .eq('empresa_id', empresaId)
    .order('importado_em', { ascending: false })
    .limit(50);

  if (error) {
    return { lotes: [], disponivel: !pareceNaoInstalado(error.message), erro: error.message };
  }
  const lotes = (data ?? []).map(l => ({
    ...(l as unknown as Lote),
    faturamento_na_regua: num(l.faturamento_na_regua),
  }));
  return { lotes, disponivel: true, erro: null };
}

export interface ListaFranquias {
  franquias: Franquia[];
  disponivel: boolean;
  erro: string | null;
}

export async function buscarFranquias(empresaId: string): Promise<ListaFranquias> {
  const { data, error } = await tabelaSemTipo<Record<string, unknown>>('vendas_franquias')
    .select(`
      id, empresa_id, codigo, nome, setor_id, estado,
      primeira_aparicao, ultima_aparicao, vinculado_em, observacao,
      setores:setor_id ( id, nome )
    `)
    .eq('empresa_id', empresaId)
    .order('estado', { ascending: true })
    .order('codigo', { ascending: true });

  if (error) {
    return { franquias: [], disponivel: !pareceNaoInstalado(error.message), erro: error.message };
  }
  return { franquias: (data ?? []) as unknown as Franquia[], disponivel: true, erro: null };
}

export async function vincularFranquia(params: {
  id: string;
  setorId: string | null;
  estado: EstadoFranquia;
  observacao: string | null;
}): Promise<Resultado<string>> {
  const { data, error } = await rpcSemTipo<string>('fn_vendas_franquia_vincular', {
    p_id:         params.id,
    p_setor_id:   params.setorId,
    p_estado:     params.estado,
    p_observacao: params.observacao,
  });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  return { ok: true, dado: data ?? null, erro: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Projeção — o relatório vira venda (Fase 3)
// ─────────────────────────────────────────────────────────────────────────────

/** O que a projeção faria. Sempre lido antes de projetar. */
export interface PreviaProjecao {
  total_no_lote: number;
  com_dono: number;
  sem_franquia: number;
  franquia_ignorada: number;
  sem_operador: number;
  a_criar: number;
  a_atualizar: number;
  a_reverter: number;
  reverter_valor: number;
  preservadas: number;
  divergencia_setor: number;
  divergencia_valor: number;
  logins_sem_vinculo: string[];
}

export interface ResultadoProjecao {
  criadas: number;
  atualizadas: number;
  revertidas: number;
  revertido_valor: number;
  preservadas: number;
  sem_dono: number;
  divergencia_setor: number;
  /*
   * O que a projeção NÃO escreveu, e quanto vale.
   *
   * Até a Fase 6 isso era descartado sem número: a linha de franquia que
   * ninguém vinculou sumia, e depois de projetar ninguém mais perguntava.
   * Medido no lote de setembro, é a maior parte do arquivo — 2.834 de 2.973
   * linhas, R$ 13.424.041,59 — porque o relatório é da empresa toda e só um
   * setor está vinculado. Não é erro; é o que ainda não tem dono.
   */
  sem_franquia: number;
  sem_franquia_valor: number;
  franquia_ignorada: number;
  ignorada_valor: number;
  sem_dono_valor: number;
}

/** Uma venda que o retrato anterior tinha e o novo não tem. */
export interface VendaSumida {
  venda_id: string;
  nr_documento: string;
  operador_nome: string | null;
  data_confirmacao: string;
  situacao: string;
  valor_na_meta: number;
}

/**
 * Uma RPC que devolve TABLE com uma linha só chega como array ou como objeto,
 * conforme a versão do PostgREST. Aceitar os dois evita um erro que só
 * apareceria em produção.
 */
function primeira<T>(data: T[] | T | null): T | null {
  if (data === null) return null;
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

export async function previaDaProjecao(loteId: string): Promise<Resultado<PreviaProjecao>> {
  const { data, error } = await rpcSemTipo<PreviaProjecao[] | PreviaProjecao>(
    'fn_vendas_projecao_previa', { p_lote_id: loteId },
  );
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };

  const l = primeira(data);
  if (!l) return { ok: false, dado: null, erro: 'A prévia não devolveu nada.' };

  return {
    ok: true,
    dado: {
      total_no_lote:      num(l.total_no_lote),
      com_dono:           num(l.com_dono),
      sem_franquia:       num(l.sem_franquia),
      franquia_ignorada:  num(l.franquia_ignorada),
      sem_operador:       num(l.sem_operador),
      a_criar:            num(l.a_criar),
      a_atualizar:        num(l.a_atualizar),
      a_reverter:         num(l.a_reverter),
      reverter_valor:     num(l.reverter_valor),
      preservadas:        num(l.preservadas),
      divergencia_setor:  num(l.divergencia_setor),
      divergencia_valor:  num(l.divergencia_valor),
      logins_sem_vinculo: Array.isArray(l.logins_sem_vinculo) ? l.logins_sem_vinculo : [],
    },
    erro: null,
  };
}

export async function projetar(loteId: string): Promise<Resultado<ResultadoProjecao>> {
  const { data, error } = await rpcSemTipo<ResultadoProjecao[] | ResultadoProjecao>(
    'fn_vendas_projetar', { p_lote_id: loteId },
  );
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };

  const l = primeira(data);
  return {
    ok: true,
    dado: {
      criadas:           num(l?.criadas),
      atualizadas:       num(l?.atualizadas),
      revertidas:        num(l?.revertidas),
      revertido_valor:   num(l?.revertido_valor),
      preservadas:       num(l?.preservadas),
      sem_dono:          num(l?.sem_dono),
      divergencia_setor: num(l?.divergencia_setor),
      sem_franquia:       num(l?.sem_franquia),
      sem_franquia_valor: num(l?.sem_franquia_valor),
      franquia_ignorada:  num(l?.franquia_ignorada),
      ignorada_valor:     num(l?.ignorada_valor),
      sem_dono_valor:     num(l?.sem_dono_valor),
    },
    erro: null,
  };
}

export async function buscarSumidas(loteId: string): Promise<Resultado<VendaSumida[]>> {
  const { data, error } = await rpcSemTipo<VendaSumida[]>(
    'fn_vendas_sumidas_do_retrato', { p_lote_id: loteId },
  );
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  const linhas = (Array.isArray(data) ? data : []).map(v => ({
    ...v, valor_na_meta: num(v.valor_na_meta),
  }));
  return { ok: true, dado: linhas, erro: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Conciliação das três camadas (Fase 4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O que a liderança precisa mexer, em ordem.
 *
 *   divergente — prévia e geral discordam em situação, assinatura ou valor
 *   pendente   — a prévia tem, o geral ainda não. Continua contando, marcado
 *   so_manual  — lançado na aba e nenhum relatório viu
 *   so_geral   — só o oficial tem. Normal: o mês de VENDA é outro
 *   conforme   — os dois concordam
 */
export type ClassificacaoConciliacao =
  | 'divergente' | 'pendente' | 'so_manual' | 'so_geral' | 'conforme';

export const CLASSIFICACAO_LABEL: Record<ClassificacaoConciliacao, string> = {
  divergente: 'Prévia e geral discordam',
  pendente:   'Na prévia, ainda não no geral',
  so_manual:  'Lançada e nenhum relatório viu',
  so_geral:   'Só no geral',
  conforme:   'De acordo',
};

export interface LinhaConciliacao {
  nr_documento: string;
  classificacao: ClassificacaoConciliacao;
  operador_nome: string | null;
  venda_existe: boolean;
  venda_origem: string | null;
  venda_situacao: string | null;
  venda_assinado: boolean | null;
  venda_valor: number | null;
  venda_conta: boolean;
  previa_existe: boolean;
  previa_situacao: string | null;
  previa_assinado: boolean | null;
  previa_valor: number | null;
  geral_existe: boolean;
  geral_situacao: string | null;
  geral_assinado: boolean | null;
  geral_valor: number | null;
}

export interface ResumoConciliacao {
  classificacao: ClassificacaoConciliacao;
  linhas: number;
  valor: number;
}

function valorOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  return num(v);
}

export async function resumoDaConciliacao(
  empresaId: string, mes: string,
): Promise<Resultado<ResumoConciliacao[]>> {
  const { data, error } = await rpcSemTipo<ResumoConciliacao[]>(
    'fn_vendas_conciliacao_resumo', { p_empresa_id: empresaId, p_mes: `${mes}-01` },
  );
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  const linhas = (Array.isArray(data) ? data : []).map(r => ({
    ...r, linhas: num(r.linhas), valor: num(r.valor),
  }));
  return { ok: true, dado: linhas, erro: null };
}

export async function buscarConciliacao(
  empresaId: string, mes: string,
): Promise<Resultado<LinhaConciliacao[]>> {
  const { data, error } = await rpcSemTipo<LinhaConciliacao[]>(
    'fn_vendas_conciliacao', { p_empresa_id: empresaId, p_mes: `${mes}-01` },
  );
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  const linhas = (Array.isArray(data) ? data : []).map(l => ({
    ...l,
    venda_valor:  valorOuNulo(l.venda_valor),
    previa_valor: valorOuNulo(l.previa_valor),
    geral_valor:  valorOuNulo(l.geral_valor),
  }));
  return { ok: true, dado: linhas, erro: null };
}
