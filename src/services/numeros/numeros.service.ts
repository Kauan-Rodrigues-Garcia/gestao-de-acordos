/**
 * numeros.service.ts — a camada de acesso do Controle de Números.
 *
 * ## Leitura direta, transição por RPC
 *
 * As consultas são `select` comum: a RLS já recorta o que cada pessoa enxerga
 * (`fn_numeros_visivel`), então repetir o filtro aqui só criaria uma segunda
 * régua para divergir da primeira. O que vem, veio porque o banco deixou.
 *
 * As cinco TRANSIÇÕES passam por RPC. Cada uma confere permissão, alcance e
 * estado de origem, muda duas ou três colunas juntas e grava a movimentação —
 * tudo na mesma transação. Chamar com o id de um número de outro setor encontra
 * a mesma recusa que a tela.
 *
 * O cadastro é `insert` comum, porque a pergunta ali é só «você pode?», e a
 * policy responde. A primeira linha do histórico não depende deste arquivo:
 * quem a grava é `trg_numeros_registra_cadastro`, no banco.
 *
 * ## As mensagens
 *
 * O Postgres devolve `23505`, `23514`, `42501`. Nenhum desses ajuda quem está
 * cadastrando um chip às sete da noite. `mensagemDeErro` traduz cada caso para
 * a frase que diz o próximo passo, e reconhece as exceções das triggers pelo
 * texto que elas levantam.
 *
 * ## Os tipos são declarados aqui, e isso é temporário
 *
 * `database.types.ts` é gerado do schema e ainda não conhece estas quatro
 * tabelas. Declarar as linhas à mão evita bloquear o módulo numa regeneração —
 * quando os tipos forem regenerados, estas interfaces saem e as `Row` entram,
 * como já aconteceu com `rh_lancamentos`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { normalizarNumero, erroDoNumero } from './numerosFormato';
import type {
  Situacao, Posse, MotivoRetorno, Etiqueta, Tratamento,
} from './numerosRegras';
import { LIMITE_POR_CELULAR } from './numerosRegras';

/**
 * O mesmo cliente, sem o schema gerado.
 *
 * `database.types.ts` é gerado do banco e ainda não conhece as quatro tabelas
 * deste módulo, então `supabase.from('numeros_config')` não compila — o nome
 * não está na união de tabelas conhecidas.
 *
 * Um cast, aqui, em vez de regenerar o arquivo de tipos inteiro: a regeneração
 * reescreve um arquivo compartilhado por todo o projeto e traria junto qualquer
 * outra diferença de schema acumulada, no meio de um módulo que ainda não
 * fechou. As linhas continuam tipadas — pelas interfaces acima, que são a
 * declaração explícita do que estas quatro tabelas devolvem.
 *
 * Quando os tipos forem regenerados, esta constante sai e `supabase` volta
 * direto, como em `rhGestao.service.ts`.
 */
const db = supabase as unknown as SupabaseClient;

// ── As linhas ────────────────────────────────────────────────────────────────

export interface NumerosConfigRow {
  empresa_id: string;
  setor_nucleo_id: string;
  atualizado_por: string | null;
  atualizado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface CelularRow {
  id: string;
  empresa_id: string;
  identificacao: string;
  modelo: string | null;
  setor_id: string;
  ativo: boolean;
  criado_por: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface NumeroRow {
  id: string;
  empresa_id: string;
  celular_id: string;
  setor_id: string;
  numero: string;
  situacao: Situacao;
  posse: Posse;
  operador_id: string | null;
  motivo_retorno: MotivoRetorno | null;
  observacao_retorno: string | null;
  /**
   * As marcas operacionais do momento. Sempre um array — a coluna é
   * `NOT NULL DEFAULT '{}'`, e o vazio é o estado da grande maioria.
   */
  etiquetas: Etiqueta[];
  /** Em que pé está o retorno. `null` quando não há nada pendente. */
  tratamento: Tratamento | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface MovimentacaoRow {
  id: string;
  empresa_id: string;
  numero_id: string;
  tipo: string;
  setor_origem_id: string | null;
  setor_origem_nome: string | null;
  setor_destino_id: string | null;
  setor_destino_nome: string | null;
  operador_origem_id: string | null;
  operador_origem_nome: string | null;
  operador_destino_id: string | null;
  operador_destino_nome: string | null;
  situacao_anterior: string | null;
  situacao_nova: string | null;
  motivo: string | null;
  observacao: string | null;
  descricao: string;
  autor_id: string | null;
  autor_nome: string | null;
  criado_em: string;
}

export interface Resultado<T = void> {
  ok: boolean;
  dados?: T;
  erro?: string;
}

// ── Tradução de erro ─────────────────────────────────────────────────────────

interface ErroPostgres { code?: string; message?: string; details?: string }

/**
 * A frase que a tela mostra.
 *
 * Procura primeiro pelo TEXTO das exceções que as triggers e as RPCs levantam,
 * e só depois cai no código. É deliberado: o `23514` cobre o limite de 6, o
 * setor travado e a empresa errada ao mesmo tempo, e um "violação de restrição"
 * genérico não diria a nenhum deles o que fazer a seguir.
 */
export function mensagemDeErro(erro: unknown): string {
  const e = (erro ?? {}) as ErroPostgres;
  const texto = `${e.message ?? ''} ${e.details ?? ''}`;

  if (e.code === '23505') {
    if (texto.includes('numeros_whatsapp_unico_por_empresa')) {
      return 'Este número já possui cadastro no sistema.';
    }
    if (texto.includes('idx_numeros_cel_identificacao')) {
      return 'Já existe um celular com essa identificação.';
    }
    return 'Este registro já existe.';
  }

  if (texto.includes('ja tem 6 numeros')) {
    return 'Este celular já tem 6 números, que é o limite.';
  }
  if (texto.includes('trocar o setor de um celular')) {
    return 'Não dá para trocar o setor de um celular que já tem número. '
         + 'Relance os números ao Núcleo antes, ou cadastre outro aparelho.';
  }
  if (texto.includes('nao pertence a esta empresa')
      || texto.includes('pertence a outra empresa')) {
    return 'O setor escolhido não pertence a esta empresa.';
  }
  if (e.code === '23514' && texto.includes('numeros_whatsapp_formato')) {
    return 'Número inválido. Use DDD entre 11 e 99 e 10 ou 11 dígitos.';
  }
  if (texto.includes('numeros_whatsapp_etiquetas_conhecidas')) {
    return 'Etiqueta desconhecida. Atualize a página e tente de novo.';
  }
  if (texto.includes('numeros_whatsapp_tratamento')) {
    return 'Só um número que está no Núcleo pode estar em tratamento.';
  }

  // As RPCs levantam frases já prontas — devolvê-las é melhor do que traduzir.
  if (e.code === '42501' || e.code === '22023' || e.code === 'P0002') {
    return e.message ?? 'Operação não permitida.';
  }

  return e.message ?? 'Não foi possível concluir a operação.';
}

function falha(erro: unknown): Resultado<never> {
  return { ok: false, erro: mensagemDeErro(erro) };
}

// ── Leituras ─────────────────────────────────────────────────────────────────

/** A configuração do Núcleo desta empresa, ou null quando ninguém configurou. */
export async function buscarConfig(empresaId: string): Promise<NumerosConfigRow | null> {
  const { data } = await db
    .from('numeros_config')
    .select('*')
    .eq('empresa_id', empresaId)
    .maybeSingle();
  return (data as NumerosConfigRow | null) ?? null;
}

export interface SetorNome {
  id: string;
  nome: string;
}

/**
 * Os setores da empresa, só para dar nome ao que o módulo mostra.
 *
 * ## Por que uma consulta própria, e não `useSetoresEquipes`
 *
 * Aquele hook responde a outra pergunta: «entre quais setores esta pessoa pode
 * FILTRAR no Dashboard». Ele devolve lista vazia para quem não tem
 * `dashboard_escopo_todos_setores` — que é o caso do operador e do líder do
 * Núcleo, os dois cargos que mais usam estas telas.
 *
 * O efeito era visível: cada número aparecia como «Setor removido», porque o
 * mapa de nomes chegava vazio. A informação não estava protegida — estava
 * ausente por engano, e o número em si a tela mostrava do mesmo jeito.
 *
 * A pergunta daqui é outra: «como se chama o setor deste celular?». `setores`
 * tem RLS própria (`setores_select`, com `fn_can_access_empresa`), e ela já
 * responde por empresa — quem enxerga a empresa enxerga os nomes dos setores
 * dela, e é assim desde o schema base.
 *
 * Serve também aos dois seletores de setor do módulo: o do cadastro de celular
 * e o que aponta qual setor é o Núcleo. Os dois ofereciam uma lista vazia pelo
 * mesmo motivo.
 */
export async function listarSetores(empresaId: string): Promise<SetorNome[]> {
  const { data, error } = await supabase
    .from('setores')
    .select('id, nome')
    .eq('empresa_id', empresaId)
    .order('nome');
  if (error) throw error;
  return (data as SetorNome[]) ?? [];
}

export async function listarCelulares(empresaId: string): Promise<CelularRow[]> {
  const { data, error } = await db
    .from('numeros_celulares')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('identificacao');
  if (error) throw error;
  return (data as CelularRow[]) ?? [];
}

export interface FiltroNumeros {
  setorId?: string;
  situacao?: Situacao;
  posse?: Posse;
  celularId?: string;
}

export async function listarNumeros(
  empresaId: string, filtro: FiltroNumeros = {},
): Promise<NumeroRow[]> {
  let q = db.from('numeros_whatsapp').select('*').eq('empresa_id', empresaId);

  if (filtro.setorId)   q = q.eq('setor_id', filtro.setorId);
  if (filtro.situacao)  q = q.eq('situacao', filtro.situacao);
  if (filtro.posse)     q = q.eq('posse', filtro.posse);
  if (filtro.celularId) q = q.eq('celular_id', filtro.celularId);

  const { data, error } = await q.order('numero');
  if (error) throw error;
  return (data as NumeroRow[]) ?? [];
}

export interface OperadorDoSetor {
  id: string;
  nome: string;
  perfil: string;
  /**
   * A foto do perfil, quando a pessoa cadastrou uma.
   *
   * Vem daqui e não de uma segunda consulta: a liderança agrupa os números por
   * operador e mostra o rosto de cada um, e buscar a foto separado faria uma ida
   * ao banco por pessoa numa tela que já tem a lista inteira em mãos.
   *
   * `null` é comum e não é falta de dado — a tela cai nas iniciais, que é o
   * padrão do resto do sistema para quem não tem foto.
   */
  foto_url: string | null;
}

/**
 * Quem pode receber um número neste setor.
 *
 * A RPC recusa lançar para pessoa de outro setor ou inativa, então este filtro
 * existe para a lista não OFERECER o que o banco vai recusar — não para ser a
 * trava. `perfis` tem RLS própria; quem não enxerga o setor recebe lista vazia
 * e o diálogo mostra o aviso, em vez de um seletor vazio sem explicação.
 */
export async function listarOperadoresDoSetor(
  empresaId: string, setorId: string,
): Promise<OperadorDoSetor[]> {
  const { data, error } = await supabase
    .from('perfis')
    .select('id, nome, perfil, foto_url')
    .eq('empresa_id', empresaId)
    .eq('setor_id', setorId)
    .eq('ativo', true)
    .order('nome');
  if (error) throw error;
  return (data as OperadorDoSetor[]) ?? [];
}

/** O caminho de um número, do mais recente para o mais antigo. */
export async function listarMovimentacoes(numeroId: string): Promise<MovimentacaoRow[]> {
  const { data, error } = await db
    .from('numeros_movimentacoes')
    .select('*')
    .eq('numero_id', numeroId)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return (data as MovimentacaoRow[]) ?? [];
}

// ── Cadastro ─────────────────────────────────────────────────────────────────

export interface NovoCelular {
  empresaId: string;
  identificacao: string;
  modelo?: string | null;
  setorId: string;
  autorId?: string | null;
  autorNome?: string | null;
}

export async function criarCelular(c: NovoCelular): Promise<Resultado<CelularRow>> {
  const identificacao = c.identificacao.trim();
  if (!identificacao) return { ok: false, erro: 'Informe a identificação do celular.' };

  const { data, error } = await db
    .from('numeros_celulares')
    .insert({
      empresa_id: c.empresaId,
      identificacao,
      modelo: c.modelo?.trim() || null,
      setor_id: c.setorId,
      criado_por: c.autorId ?? null,
      criado_por_nome: c.autorNome ?? null,
    })
    .select()
    .single();

  if (error) return falha(error);
  return { ok: true, dados: data as CelularRow };
}

export interface EdicaoCelular {
  identificacao?: string;
  modelo?: string | null;
  setorId?: string;
  ativo?: boolean;
}

export async function editarCelular(
  id: string, mudancas: EdicaoCelular,
): Promise<Resultado<CelularRow>> {
  const patch: Record<string, unknown> = {};
  if (mudancas.identificacao !== undefined) {
    const t = mudancas.identificacao.trim();
    if (!t) return { ok: false, erro: 'Informe a identificação do celular.' };
    patch.identificacao = t;
  }
  if (mudancas.modelo !== undefined) patch.modelo = mudancas.modelo?.trim() || null;
  if (mudancas.setorId !== undefined) patch.setor_id = mudancas.setorId;
  if (mudancas.ativo !== undefined)   patch.ativo = mudancas.ativo;

  if (Object.keys(patch).length === 0) return { ok: false, erro: 'Nada para alterar.' };

  const { data, error } = await db
    .from('numeros_celulares').update(patch).eq('id', id).select().single();

  if (error) return falha(error);
  return { ok: true, dados: data as CelularRow };
}

export interface NovoNumero {
  empresaId: string;
  celularId: string;
  /**
   * O setor do CELULAR.
   *
   * A coluna é `NOT NULL`, então o INSERT precisa mandar alguma coisa — mas o
   * que vale não é este valor: `fn_numeros_whatsapp_valida` sobrescreve
   * `setor_id` com o do aparelho em toda escrita. Mandar aqui o setor do
   * celular escolhido faz o enviado e o gravado coincidirem, em vez de o
   * cliente afirmar uma coisa e o banco gravar outra.
   */
  setorId: string;
  /** Aceita mascarado — é normalizado antes de sair daqui. */
  numero: string;
  autorId?: string | null;
  autorNome?: string | null;
}

/**
 * As duas recusas do banco que o cadastro pode encontrar, perguntadas ANTES.
 *
 * Não é desconfiança do banco: o índice único e a trigger do limite seguem
 * sendo a verdade, e são eles que aguentam duas pessoas cadastrando o mesmo
 * número no mesmo instante. Isto aqui é para o caminho NORMAL não precisar
 * deles.
 *
 * Uma recusa do banco é uma exceção, e exceção vira linha de ERROR no log do
 * Postgres. Ver «este celular já tem 6 números» no painel de erros do projeto
 * confunde: parece defeito, e é a regra funcionando. Em 24 h de operação eram
 * nove linhas vermelhas que descreviam o sistema fazendo exatamente o que
 * devia.
 *
 * Uma consulta só responde as duas perguntas: os números daquele celular, e
 * se este número já existe na empresa.
 */
async function recusaConhecida(n: NovoNumero, numero: string): Promise<string | null> {
  const { data, error } = await db
    .from('numeros_whatsapp')
    .select('id, celular_id, numero')
    .eq('empresa_id', n.empresaId)
    .or(`celular_id.eq.${n.celularId},numero.eq.${numero}`);

  // Sem resposta, segue para o insert: o banco decide. Recusar aqui por causa
  // de uma falha de rede seria inventar um impedimento que não existe.
  if (error || !data) return null;

  const linhas = data as { celular_id: string; numero: string }[];
  if (linhas.some(l => l.numero === numero)) {
    return 'Este número já possui cadastro no sistema.';
  }
  if (linhas.filter(l => l.celular_id === n.celularId).length >= LIMITE_POR_CELULAR) {
    return `Este celular já tem ${LIMITE_POR_CELULAR} números, que é o limite.`;
  }
  return null;
}

export async function criarNumero(n: NovoNumero): Promise<Resultado<NumeroRow>> {
  // Valida antes de gastar uma ida ao banco. O `CHECK` lá continua valendo:
  // esta conferência é para a mensagem ser boa, não para ser a única.
  const problema = erroDoNumero(n.numero);
  if (problema) return { ok: false, erro: problema };

  const numero = normalizarNumero(n.numero);

  const recusa = await recusaConhecida(n, numero);
  if (recusa) return { ok: false, erro: recusa };

  const { data, error } = await db
    .from('numeros_whatsapp')
    .insert({
      empresa_id: n.empresaId,
      celular_id: n.celularId,
      setor_id: n.setorId,
      numero,
      criado_por: n.autorId ?? null,
      criado_por_nome: n.autorNome ?? null,
    })
    .select()
    .single();

  if (error) return falha(error);
  return { ok: true, dados: data as NumeroRow };
}

// ── Corrigir e apagar um cadastro ────────────────────────────────────────────
//
// São `update` e `delete` comuns, e não RPC, porque pertencem à mesma classe do
// cadastro: a pergunta é «você pode?», e a policy responde. As TRANSIÇÕES é que
// precisam de RPC — elas mexem em três colunas juntas e gravam movimentação.
//
// As travas ficam no banco, em trigger:
//
//   `fn_numeros_whatsapp_valida` .. recusa trocar o número de um chip que está
//                                   com um setor ou com um operador;
//   `fn_numeros_pode_excluir` .... recusa apagar o que já circulou (apagar leva
//                                   a trilha junto, por `ON DELETE CASCADE`);
//   `trg_numeros_registra_correcao` grava a correção no histórico — inclusive
//                                   se o UPDATE vier do SQL Editor.

/**
 * Corrige a digitação de um número já cadastrado.
 *
 * Aceita mascarado e normaliza, exatamente como o cadastro: sem isso
 * `(18) 99999-9999` entraria como uma string diferente de `18999999999` e o
 * `UNIQUE` deixaria o mesmo chip existir duas vezes.
 */
export async function corrigirNumero(
  id: string, numero: string,
): Promise<Resultado<NumeroRow>> {
  const problema = erroDoNumero(numero);
  if (problema) return { ok: false, erro: problema };

  const { data, error } = await db
    .from('numeros_whatsapp')
    .update({ numero: normalizarNumero(numero) })
    .eq('id', id)
    .select()
    .single();

  if (error) return falha(error);
  return { ok: true, dados: data as NumeroRow };
}

/**
 * Apaga um número cadastrado por engano.
 *
 * Só vale para o que nunca saiu do Núcleo. Um número que circulou tem trilha, e
 * a trilha morre junto com ele — para esse caso a saída é marcar `banido`, que
 * preserva tudo. Quem recusa é o banco, e a mensagem dele já diz isso.
 */
export async function excluirNumero(id: string): Promise<Resultado> {
  const { error } = await db.from('numeros_whatsapp').delete().eq('id', id);
  if (error) return falha(error);
  return { ok: true };
}

// ── As transições ────────────────────────────────────────────────────────────

type ChamadaRpc = (nome: string, args: Record<string, unknown>) =>
  Promise<{ error: unknown }>;

/** `supabase.rpc` sem os tipos gerados, que ainda não conhecem estas funções. */
const rpc = supabase.rpc.bind(supabase) as unknown as ChamadaRpc;

async function chamar(nome: string, args: Record<string, unknown>): Promise<Resultado> {
  const { error } = await rpc(nome, args);
  if (error) return falha(error);
  return { ok: true };
}

/** O Núcleo disponibiliza ao setor dono. Exige situação `ativo`. */
export function liberarAoSetor(numeroId: string): Promise<Resultado> {
  return chamar('fn_numeros_liberar_ao_setor', { p_numero_id: numeroId });
}

/** A liderança entrega o número a um operador do mesmo setor. */
export function lancarAoOperador(numeroId: string, operadorId: string): Promise<Resultado> {
  return chamar('fn_numeros_lancar_ao_operador', {
    p_numero_id: numeroId, p_operador_id: operadorId,
  });
}

/** O operador solta o próprio número. Ele continua no setor. */
export function devolverALideranca(
  numeroId: string, motivo: MotivoRetorno, observacao?: string,
): Promise<Resultado> {
  return chamar('fn_numeros_devolver_a_lideranca', {
    p_numero_id: numeroId, p_motivo: motivo, p_observacao: observacao ?? null,
  });
}

/** A liderança devolve ao Núcleo, com motivo. O registro é o mesmo. */
export function relancarAoNucleo(
  numeroId: string, motivo: MotivoRetorno, observacao?: string,
): Promise<Resultado> {
  return chamar('fn_numeros_relancar_ao_nucleo', {
    p_numero_id: numeroId, p_motivo: motivo, p_observacao: observacao ?? null,
  });
}

/**
 * Só o Núcleo. A liderança marca banimento relançando, não aqui.
 *
 * Vale a qualquer momento, inclusive com o número em tratamento — é o ponto do
 * pedido: **alterar o estado e lançar ao setor são ações diferentes**, e o
 * Núcleo não precisa lançar nada para conseguir mexer na situação.
 */
export function alterarSituacao(numeroId: string, situacao: Situacao): Promise<Resultado> {
  return chamar('fn_numeros_alterar_situacao', {
    p_numero_id: numeroId, p_situacao: situacao,
  });
}

/**
 * Substitui as etiquetas operacionais do número.
 *
 * Recebe o conjunto INTEIRO, e não «adicione esta» / «tire aquela»: com dois
 * verbos, duas pessoas mexendo ao mesmo tempo produzem um resultado que depende
 * da ordem de chegada. Mandando o conjunto, a última escrita ganha e é a que
 * está na tela de quem clicou.
 */
export function etiquetarNumero(
  numeroId: string, etiquetas: Etiqueta[],
): Promise<Resultado> {
  return chamar('fn_numeros_etiquetar', {
    p_numero_id: numeroId, p_etiquetas: etiquetas,
  });
}

/** O Núcleo pega para si um número que voltou de um setor. */
export function iniciarTratamento(numeroId: string): Promise<Resultado> {
  return chamar('fn_numeros_iniciar_tratamento', { p_numero_id: numeroId });
}

/**
 * O Núcleo encerra o tratamento. O número **não** volta ao setor por isso.
 *
 * É aqui que o «Voltou: Banido» sai da tela — e não mais dentro de
 * `liberarAoSetor`. Encerrado o tratamento, o número vira um número comum do
 * Núcleo; liberá-lo ao setor é a decisão seguinte, e separada.
 */
export function concluirTratamento(
  numeroId: string, observacao?: string,
): Promise<Resultado> {
  return chamar('fn_numeros_concluir_tratamento', {
    p_numero_id: numeroId, p_observacao: observacao ?? null,
  });
}

// ── Configuração ─────────────────────────────────────────────────────────────

/**
 * Aponta qual setor é o Núcleo.
 *
 * `upsert` por `empresa_id` porque a tabela tem uma linha por empresa: trocar o
 * setor é reescrever a mesma linha, não criar outra.
 */
export async function salvarConfigNucleo(
  empresaId: string, setorId: string, autorId?: string | null, autorNome?: string | null,
): Promise<Resultado<NumerosConfigRow>> {
  const { data, error } = await db
    .from('numeros_config')
    .upsert({
      empresa_id: empresaId,
      setor_nucleo_id: setorId,
      atualizado_por: autorId ?? null,
      atualizado_por_nome: autorNome ?? null,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id' })
    .select()
    .single();

  if (error) return falha(error);
  return { ok: true, dados: data as NumerosConfigRow };
}
