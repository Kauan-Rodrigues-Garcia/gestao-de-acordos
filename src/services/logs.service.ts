/**
 * src/services/logs.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Acesso à trilha de auditoria (`logs_sistema`) e a única forma de escrever
 * nela a partir do frontend.
 *
 * ## Escrita: sempre por `registrarLog`
 * Antes desta versão, sete lugares do frontend faziam
 * `supabase.from('logs_sistema').insert({...})` com formatos diferentes. Cada
 * um esquecia um campo — um sem `empresa_id` (que é NOT NULL, então o insert
 * falhava em silêncio), outro sem severidade, nenhum com valor anterior.
 *
 * `registrarLog` chama a RPC `fn_log_registrar`, que resolve autor pela sessão,
 * preenche empresa, mascara dado sensível e captura IP/navegador. O que o
 * chamador informa é o que só ele sabe: o que aconteceu e por quê.
 *
 * A escrita NUNCA propaga erro. Log é efeito colateral: derrubar a operação de
 * negócio porque a auditoria falhou trocaria um problema por um pior.
 *
 * ## Leitura: paginada, com agregados do banco
 * A tela pede `fetchLogs` (uma página) e `fetchResumoLogs` (os números). Os
 * números vêm de `fn_logs_resumo`, calculada sobre o filtro inteiro — contar no
 * navegador descreveria apenas a página, e "3 exclusões hoje" seria falso
 * quando houve 300.
 *
 * @see supabase/migrations/20260813225412_remote_schema_baseline.sql
 */
import { supabase } from '@/lib/supabase';
import type { LogSistema } from '@/lib/supabase';
import type { CategoriaLog, SeveridadeLog, OrigemLog } from '@/lib/logs-catalogo';
import { descreverAcao, campoLabel, formatarValorLog, origemLabel, normalizarDescricao } from '@/lib/logs-catalogo';

// ═══════════════════════════════════════════════════════════════════════════
// Escrita
// ═══════════════════════════════════════════════════════════════════════════
export interface RegistrarLogParams {
  /** `<alvo>_<verbo>` em snake_case. Ver o catálogo em `logs-catalogo.ts`. */
  acao: string;
  categoria?: CategoriaLog;
  severidade?: SeveridadeLog;
  /** Frase pronta, em português, na voz de quem agiu: "Excluiu o acordo NR 12". */
  descricao?: string;
  empresaId?: string | null;
  tabela?: string | null;
  registroId?: string | null;
  alvoTipo?: string | null;
  /** Rótulo humano do alvo: "NR 12345 — João da Silva". */
  alvoRotulo?: string | null;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  campos?: string[] | null;
  detalhes?: Record<string, unknown> | null;
  origem?: OrigemLog;
  /** Rota em que a ação partiu. Preenchida automaticamente quando omitida. */
  rota?: string | null;
  /**
   * Autor pretendido. Só é usado quando NÃO há sessão — havendo sessão, o banco
   * usa `auth.uid()` e ignora este valor (autoria forjada não passa; ver
   * `fn_log_registrar`). Serve para casos em que o log é gravado num momento em
   * que a sessão está em transição, como o fim de uma impersonação.
   */
  usuarioId?: string | null;
}

/**
 * Grava um evento na trilha. Devolve o id do log, ou `null` quando não gravou
 * (sem sessão, empresa indefinida, banco recusou).
 *
 * Só para o que o BANCO NÃO VÊ: login, logout, exportação, resumo de
 * importação, leitura por imagem, envio de WhatsApp. Alteração de linha já é
 * auditada por trigger — registrar de novo aqui geraria duas entradas para o
 * mesmo fato.
 */
export async function registrarLog(params: RegistrarLogParams): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('fn_log_registrar', {
      p_acao:        params.acao,
      p_categoria:   params.categoria ?? 'sistema',
      p_severidade:  params.severidade ?? 'info',
      p_descricao:   params.descricao ?? null,
      p_empresa_id:  params.empresaId ?? null,
      p_tabela:      params.tabela ?? null,
      p_registro_id: params.registroId ?? null,
      p_alvo_tipo:   params.alvoTipo ?? null,
      p_alvo_rotulo: params.alvoRotulo ?? null,
      p_antes:       (params.antes ?? null) as never,
      p_depois:      (params.depois ?? null) as never,
      p_campos:      params.campos ?? null,
      p_detalhes:    (params.detalhes ?? null) as never,
      p_origem:      params.origem ?? 'ui',
      p_rota:        params.rota ?? rotaAtual(),
      p_usuario_id:  params.usuarioId ?? null,
    });

    if (error) {
      console.warn('[logs.service] registrarLog recusado:', error.message);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (e) {
    // Rede caiu, RPC ausente, sessão expirada: nada disso pode virar exceção no
    // fluxo de quem chamou.
    console.warn('[logs.service] registrarLog falhou:', e);
    return null;
  }
}

/** Rota atual, sem query string (que pode carregar dado de cliente). */
function rotaAtual(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.pathname || null;
}

/**
 * Tentativa de login recusada. Roda ANTES de haver sessão, então não passa por
 * `fn_log_registrar` — vai na `fn_log_login_recusado`, que é chamável por
 * anônimo, só grava se o identificador existir e agrupa rajadas.
 */
export async function registrarLoginRecusado(
  identificador: string,
  motivo = 'credenciais_invalidas',
): Promise<void> {
  try {
    await supabase.rpc('fn_log_login_recusado', {
      p_identificador: identificador,
      p_motivo: motivo,
    });
  } catch {
    // Silêncio proposital: quem chama está no meio de uma tela de login que
    // falhou, e a mensagem para o usuário é sobre a senha, não sobre o log.
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Leitura
// ═══════════════════════════════════════════════════════════════════════════
export interface FiltrosLogs {
  empresaId?: string | null;
  /** ISO. Inclusivo. */
  de?: string | null;
  /** ISO. Inclusivo. */
  ate?: string | null;
  categoria?: string | null;
  severidade?: string | null;
  acao?: string | null;
  usuarioId?: string | null;
  tabela?: string | null;
  origem?: string | null;
  /** Busca livre em descrição, rótulo do alvo, autor, ação e id do registro. */
  busca?: string | null;
  /** Filtra por campo alterado: "quem mexeu em valor". */
  campo?: string | null;
}

export interface PaginaLogs {
  logs: LogSistema[];
  /** Total que casa com o filtro (não o tamanho da página). */
  total: number;
  /** Há mais páginas depois desta. */
  temMais: boolean;
}

export const LOGS_POR_PAGINA = 50;

const SELECT_LOG = '*, perfis(nome,email,foto_url,perfil), empresas(id,nome)';

/**
 * Uma página de logs, mais recentes primeiro.
 *
 * `count: 'exact'` no primeiro carregamento e `'estimated'` nas páginas
 * seguintes seria mais rápido, mas a tela mostra "1–50 de 12.340" e um número
 * que oscila enquanto se navega é pior do que um número que custa um pouco.
 */
export async function fetchLogs(
  filtros: FiltrosLogs,
  pagina = 0,
  porPagina = LOGS_POR_PAGINA,
): Promise<PaginaLogs> {
  const inicio = pagina * porPagina;
  const fim = inicio + porPagina - 1;

  // Ordem das chamadas importa: os filtros entram ANTES de `order`/`range`.
  // O supabase-js devolve `this` nos transformadores, então encadear na ordem
  // inversa funciona por acidente — mas o tipo devolvido por `range` já não
  // declara `.eq()`, e depender disso é confiar numa coincidência de
  // implementação.
  const comFiltros = aplicarFiltros(
    supabase.from('logs_sistema').select(SELECT_LOG, { count: 'exact' }),
    filtros,
  );

  const { data, count, error } = await comFiltros
    .order('criado_em', { ascending: false })
    .range(inicio, fim);

  if (error) {
    console.warn('[logs.service] fetchLogs error:', error.message);
    return { logs: [], total: 0, temMais: false };
  }

  const logs = (data as unknown as LogSistema[]) ?? [];
  const total = count ?? logs.length;
  return { logs, total, temMais: inicio + logs.length < total };
}

/**
 * Aplica os filtros na query. Extraído porque a exportação percorre todas as
 * páginas com o mesmo filtro — e um filtro divergente entre tela e arquivo
 * exportado é um bug difícil de perceber e fácil de acontecer.
 */
function aplicarFiltros<T>(query: T, f: FiltrosLogs): T {
  // O builder do supabase-js devolve o mesmo tipo em cada chamada encadeada;
  // o genérico só existe para não vazar `any` para quem chama.
  let q = query as unknown as {
    eq: (c: string, v: unknown) => typeof q;
    gte: (c: string, v: unknown) => typeof q;
    lte: (c: string, v: unknown) => typeof q;
    or: (f: string) => typeof q;
    ilike: (c: string, v: string) => typeof q;
    contains: (c: string, v: unknown) => typeof q;
  };

  if (f.empresaId)   q = q.eq('empresa_id', f.empresaId);
  if (f.categoria)   q = q.eq('categoria', f.categoria);
  if (f.severidade)  q = q.eq('severidade', f.severidade);
  if (f.acao)        q = q.eq('acao', f.acao);
  if (f.usuarioId)   q = q.eq('usuario_id', f.usuarioId);
  if (f.tabela)      q = q.eq('tabela', f.tabela);
  if (f.origem)      q = q.eq('origem', f.origem);
  if (f.de)          q = q.gte('criado_em', f.de);
  if (f.ate)         q = q.lte('criado_em', f.ate);
  if (f.campo)       q = q.contains('campos', [f.campo]);

  const busca = f.busca?.trim();
  if (busca) {
    // A busca varre cinco colunas, o que exige a expressão `or` do PostgREST —
    // e nela a vírgula separa condições e os parênteses agrupam. Um termo com
    // esses caracteres ("Silva, João (SP)") quebraria a expressão e a consulta
    // voltaria 400: a pessoa veria erro onde deveria ver "nada encontrado".
    //
    // Em vez de mutilar o termo (trocar a vírgula por espaço muda o que se
    // procura e o resultado passa a não corresponder ao que foi digitado),
    // desistimos do `or` nesses casos e buscamos SÓ na descrição, com o termo
    // intacto — `ilike` isolado aceita qualquer caractere, porque o valor é
    // codificado na URL em vez de interpretado como expressão.
    //
    // A descrição é a coluna certa para esse recuo: ela contém o rótulo do alvo
    // e o nome do cliente, que é o que alguém digita com pontuação.
    if (/[,()]/.test(busca)) {
      q = q.ilike('descricao', `%${busca}%`);
    } else {
      q = q.or(
        [
          `descricao.ilike.*${busca}*`,
          `alvo_rotulo.ilike.*${busca}*`,
          `usuario_nome.ilike.*${busca}*`,
          `acao.ilike.*${busca}*`,
          `registro_id.ilike.*${busca}*`,
        ].join(','),
      );
    }
  }

  return q as unknown as T;
}

// ═══════════════════════════════════════════════════════════════════════════
// Agregados
// ═══════════════════════════════════════════════════════════════════════════
export interface FatiaResumo {
  chave: string;
  total: number;
  id?: string | null;
  criticos?: number;
}

export interface ResumoLogs {
  total: number;
  criticos: number;
  avisos: number;
  exclusoes: number;
  usuariosAtivos: number;
  automaticos: number;
  primeiroEm: string | null;
  ultimoEm: string | null;
  porCategoria: FatiaResumo[];
  porSeveridade: FatiaResumo[];
  porAcao: FatiaResumo[];
  porUsuario: FatiaResumo[];
  porTabela: FatiaResumo[];
  porDia: FatiaResumo[];
  porHora: FatiaResumo[];
}

export const RESUMO_VAZIO: ResumoLogs = {
  total: 0, criticos: 0, avisos: 0, exclusoes: 0, usuariosAtivos: 0, automaticos: 0,
  primeiroEm: null, ultimoEm: null,
  porCategoria: [], porSeveridade: [], porAcao: [], porUsuario: [], porTabela: [],
  porDia: [], porHora: [],
};

/**
 * Os números do painel, calculados no banco sobre o filtro inteiro.
 *
 * `fn_logs_resumo` é SECURITY INVOKER: o RLS de quem chama vale, então um
 * administrador não soma a operação da outra empresa nem por engano.
 */
export async function fetchResumoLogs(filtros: FiltrosLogs): Promise<ResumoLogs> {
  try {
    const { data, error } = await supabase.rpc('fn_logs_resumo', {
      p_empresa_id: filtros.empresaId ?? null,
      p_de:         filtros.de ?? null,
      p_ate:        filtros.ate ?? null,
      p_categoria:  filtros.categoria ?? null,
      p_severidade: filtros.severidade ?? null,
      p_acao:       filtros.acao ?? null,
      p_usuario_id: filtros.usuarioId ?? null,
      p_tabela:     filtros.tabela ?? null,
      p_origem:     filtros.origem ?? null,
      p_busca:      filtros.busca?.trim() || null,
    });

    if (error) {
      console.warn('[logs.service] fetchResumoLogs error:', error.message);
      return RESUMO_VAZIO;
    }
    return normalizarResumo(data);
  } catch (e) {
    console.warn('[logs.service] fetchResumoLogs falhou:', e);
    return RESUMO_VAZIO;
  }
}

/** Converte o JSONB da RPC (snake_case, contagens como string) no tipo da tela. */
export function normalizarResumo(bruto: unknown): ResumoLogs {
  const r = (bruto ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number => {
    // `count(*)` volta como BIGINT, e o driver JSON entrega string.
    const n = typeof v === 'string' ? Number(v) : (v as number);
    return Number.isFinite(n) ? n : 0;
  };
  const fatias = (v: unknown): FatiaResumo[] =>
    Array.isArray(v)
      ? v.map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          return {
            chave: String(o.chave ?? '—'),
            total: num(o.total),
            id: (o.id as string | null) ?? null,
            criticos: o.criticos === undefined ? undefined : num(o.criticos),
          };
        })
      : [];

  return {
    total:          num(r.total),
    criticos:       num(r.criticos),
    avisos:         num(r.avisos),
    exclusoes:      num(r.exclusoes),
    usuariosAtivos: num(r.usuarios_ativos),
    automaticos:    num(r.automaticos),
    primeiroEm:     (r.primeiro_em as string | null) ?? null,
    ultimoEm:       (r.ultimo_em as string | null) ?? null,
    porCategoria:   fatias(r.por_categoria),
    porSeveridade:  fatias(r.por_severidade),
    porAcao:        fatias(r.por_acao),
    porUsuario:     fatias(r.por_usuario),
    porTabela:      fatias(r.por_tabela),
    porDia:         fatias(r.por_dia),
    porHora:        fatias(r.por_hora),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Histórico de um registro
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Tudo que já aconteceu com um registro específico. É o que responde "por que
 * este acordo está assim" sem obrigar ninguém a montar filtro.
 */
export async function fetchHistoricoRegistro(
  registroId: string,
  limite = 50,
): Promise<LogSistema[]> {
  const { data, error } = await supabase
    .from('logs_sistema')
    .select(SELECT_LOG)
    .eq('registro_id', registroId)
    .order('criado_em', { ascending: false })
    .limit(limite);

  if (error) {
    console.warn('[logs.service] fetchHistoricoRegistro error:', error.message);
    return [];
  }
  return (data as unknown as LogSistema[]) ?? [];
}

// ═══════════════════════════════════════════════════════════════════════════
// Filtros disponíveis
// ═══════════════════════════════════════════════════════════════════════════
export interface OpcoesFiltro {
  usuarios: { id: string; nome: string }[];
  acoes: string[];
  tabelas: string[];
}

/**
 * Popula os seletores com o que EXISTE na trilha, não com uma lista fixa.
 *
 * A versão 1.0 oferecia três tabelas escritas à mão no código
 * (`['acordos','perfis','modelos_mensagem']`) — duas delas nunca apareciam nos
 * logs, e o resto do sistema não estava lá. Aqui a lista sai dos agregados, que
 * já respeitam o RLS.
 */
export async function fetchOpcoesFiltro(
  empresaId: string | null,
  de: string | null,
): Promise<OpcoesFiltro> {
  const resumo = await fetchResumoLogs({ empresaId, de });
  return {
    usuarios: resumo.porUsuario
      .filter((u) => u.id)
      .map((u) => ({ id: u.id as string, nome: u.chave })),
    acoes: resumo.porAcao.map((a) => a.chave),
    tabelas: resumo.porTabela.map((t) => t.chave).filter((t) => t !== '—'),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Exportação
// ═══════════════════════════════════════════════════════════════════════════
const EXPORT_MAX_LINHAS = 5000;
const EXPORT_PAGINA = 500;

export interface ResultadoExportacao {
  csv: string;
  linhas: number;
  /** `true` quando o filtro tinha mais do que o teto e o arquivo foi cortado. */
  truncado: boolean;
}

/**
 * CSV do filtro atual, não da página atual — quem exporta quer o recorte que
 * está vendo por inteiro.
 *
 * Teto de 5 mil linhas: acima disso o navegador monta uma string de dezenas de
 * MB e trava a aba. Quando corta, o arquivo diz na última linha que cortou, e a
 * tela avisa — silêncio aqui produziria um relatório incompleto que parece
 * completo.
 */
export async function exportarLogsCsv(filtros: FiltrosLogs): Promise<ResultadoExportacao> {
  const colunas = [
    'Data/Hora', 'Severidade', 'Categoria', 'Ação', 'Descrição',
    'Autor', 'Cargo', 'E-mail', 'Empresa', 'Alvo', 'Tabela',
    'Registro', 'Campos alterados', 'Origem', 'Rota', 'IP', 'Detalhes',
  ];

  const linhas: string[] = [colunas.map(celulaCsv).join(';')];
  let total = 0;
  let truncado = false;

  for (let pagina = 0; pagina * EXPORT_PAGINA < EXPORT_MAX_LINHAS; pagina++) {
    const { logs, temMais } = await fetchLogs(filtros, pagina, EXPORT_PAGINA);
    if (logs.length === 0) break;

    for (const log of logs) {
      linhas.push(linhaCsv(log));
      total++;
    }

    if (!temMais) break;
    if (total >= EXPORT_MAX_LINHAS) {
      truncado = true;
      break;
    }
  }

  if (truncado) {
    linhas.push(
      celulaCsv(
        `— exportação limitada a ${EXPORT_MAX_LINHAS} linhas; refine o período ou os filtros para o restante —`,
      ),
    );
  }

  return { csv: linhas.join('\r\n'), linhas: total, truncado };
}

function linhaCsv(log: LogSistema): string {
  const perfis = log.perfis as { nome?: string; email?: string } | undefined;
  const empresas = (log as unknown as { empresas?: { nome?: string } }).empresas;

  return [
    new Date(log.criado_em).toLocaleString('pt-BR'),
    log.severidade ?? 'info',
    log.categoria ?? 'sistema',
    log.acao,
    normalizarDescricao(log.descricao) || descreverAcao(log.acao),
    log.usuario_nome ?? perfis?.nome ?? 'Sistema',
    log.usuario_cargo ?? '',
    log.usuario_email ?? perfis?.email ?? '',
    empresas?.nome ?? '',
    log.alvo_rotulo ?? '',
    log.tabela ?? '',
    log.registro_id ?? '',
    resumirCampos(log),
    origemLabel(log.origem),
    log.rota ?? '',
    log.ip ?? '',
    log.detalhes ? JSON.stringify(log.detalhes) : '',
  ].map(celulaCsv).join(';');
}

/** "Valor: R$ 100,00 → R$ 250,00 | Status: Pago" — o diff numa célula. */
function resumirCampos(log: LogSistema): string {
  const campos = log.campos ?? [];
  if (campos.length === 0) return '';
  const antes = (log.antes ?? {}) as Record<string, unknown>;
  const depois = (log.depois ?? {}) as Record<string, unknown>;
  return campos
    .map((c) => `${campoLabel(c)}: ${formatarValorLog(c, antes[c])} → ${formatarValorLog(c, depois[c])}`)
    .join(' | ');
}

/**
 * Célula de CSV para o Excel em português.
 *
 * Separador `;` (o Excel em pt-BR usa `,` como decimal e quebra colunas com
 * vírgula). Aspas duplicadas conforme RFC 4180. E o prefixo `'` em texto que
 * começa com `=`, `+`, `-` ou `@`: sem isso o Excel INTERPRETA a célula como
 * fórmula — um log com descrição começando em "=" viraria execução de conteúdo
 * do banco na planilha de quem abriu.
 */
export function celulaCsv(valor: unknown): string {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

/**
 * Marca de ordem de bytes. Sem ela o Excel abre o arquivo UTF-8 como Latin-1 e
 * "Ação" chega "AÃ§Ã£o".
 *
 * Montada por código, e não escrita literal, porque literal ela é um caractere
 * invisível no editor — que o lint acusa como espaço irregular e que qualquer
 * "limpeza" de arquivo remove sem perceber, reintroduzindo o bug.
 */
const BOM_UTF8 = String.fromCharCode(0xfeff);

/** Dispara o download do CSV no navegador. */
export function baixarCsv(csv: string, nomeArquivo: string): void {
  const blob = new Blob([BOM_UTF8 + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════════
// Expurgo
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Apaga logs mais antigos que `dias`. Só super_admin, mínimo de 30 dias, e a
 * própria função registra o expurgo.
 *
 * A versão 1.0 tinha um "Limpar Logs" que chamava DELETE direto pelo PostgREST
 * e apagava a trilha inteira da empresa — sem piso de idade, sem registro de
 * quem apagou, atrás de um `window.confirm`. Agora o caminho é a RPC: o piso de
 * 30 dias é do banco, o expurgo se registra sozinho, e o número devolvido é o
 * de linhas que saíram de verdade.
 */
export async function expurgarLogs(
  dias: number,
  empresaId?: string | null,
): Promise<{ removidos: number; erro: string | null }> {
  const { data, error } = await supabase.rpc('fn_logs_expurgar', {
    p_dias: dias,
    p_empresa_id: empresaId ?? null,
  });

  if (error) {
    return { removidos: 0, erro: error.message };
  }
  return { removidos: Number(data ?? 0), erro: null };
}
