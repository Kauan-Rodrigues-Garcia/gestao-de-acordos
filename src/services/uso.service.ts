/**
 * uso.service.ts — leitura e escrita do monitoramento de uso.
 *
 * A escrita passa por `fn_uso_registrar`, que resolve a identidade de
 * `auth.uid()`: nada aqui manda quem é o usuário. `uso_telas` não tem policy de
 * INSERT/UPDATE, então este é o único caminho — um painel de uso que aceitasse
 * números vindos do cliente sem amarra não mediria nada.
 *
 * A leitura passa por RPCs que agregam no banco. 180 dias de retenção dão
 * ~97 mil linhas; trazer isso para o navegador a cada abertura do painel seriam
 * megabytes para exibir vinte linhas.
 */

import { supabase } from '@/lib/supabase';

export interface UsoPorPessoa {
  usuario_id:   string;
  nome:         string;
  cargo:        string | null;
  empresa_id:   string;
  empresa_nome: string;
  /** Setor e equipe de HOJE — ver o cabeçalho de `JanelaUso`. */
  setor_nome:   string | null;
  equipe_nome:  string | null;
  aberturas:    number;
  segundos:     number;
  dias_ativos:  number;
  telas_usadas: number;
  ultimo_em:    string | null;
}

/**
 * Alguém que NÃO usou o sistema no período.
 *
 * Duas ausências diferentes moram aqui, e a tela tem de distingui-las:
 *
 *   • `ultimo_em === null` → **nunca acessou**. Conta criada e não usada: é
 *     onboarding que não aconteceu;
 *   • `ultimo_em` preenchido → acessou antes e parou. É abandono, e a conversa
 *     com a pessoa é outra.
 *
 * `ultimo_em` é de TODOS os tempos, e não da janela — dentro da janela ele
 * seria sempre nulo, já que a pessoa está aqui justamente por não ter usado.
 */
export interface UsoSemAcesso {
  usuario_id:   string;
  nome:         string;
  usuario:      string | null;
  cargo:        string | null;
  empresa_id:   string;
  empresa_nome: string;
  setor_nome:   string | null;
  equipe_nome:  string | null;
  situacao:     string;
  criado_em:    string;
  ultimo_em:    string | null;
}

/** Uma tela na janela de detalhe de uma pessoa. */
export interface UsoDetalheTela {
  tela:        string;
  aberturas:   number;
  segundos:    number;
  dias:        number;
  primeiro_em: string | null;
  ultimo_em:   string | null;
}

export interface UsoDetalheDia {
  dia:       string;
  aberturas: number;
  segundos:  number;
}

export interface UsoPorTela {
  tela:      string;
  aberturas: number;
  segundos:  number;
  pessoas:   number;
}

export interface UsoPorDia {
  dia:       string;
  aberturas: number;
  segundos:  number;
  pessoas:   number;
}

export interface AdocaoTela {
  usuario_id:   string;
  nome:         string;
  cargo:        string | null;
  /** De qual operação é a pessoa. Vem desde 20260818140000. */
  empresa_id:   string;
  empresa_nome: string;
  setor_nome:   string | null;
  equipe_nome:  string | null;
  aberturas:    number;
  segundos:     number;
  ultimo_em:    string | null;
}

export interface JanelaUso {
  /**
   * Empresa a isolar. `null` = TODAS as que a RLS permitir.
   *
   * O parâmetro amplia o pedido, nunca o direito: a policy de `uso_telas` deixa
   * super_admin ver as duas operações e prende o administrador na própria. Passar
   * `null` sendo administrador devolve só a empresa dele.
   *
   * As QUATRO leituras aceitam `null` desde a migration `20260818140000`. Até
   * ela, só `fn_uso_por_pessoa` aceitava, e as outras três respondiam
   * `where empresa_id = null` — que em SQL não é falso, é NULL, e devolve zero
   * linha sem erro. Com "Todas as empresas" no padrão da tela, três blocos do
   * painel abriam vazios.
   */
  empresaId: string | null;
  /** 'yyyy-MM-dd' */
  desde: string;
  ate:   string;
  /**
   * Cargo a isolar. `null` = todos.
   *
   * Casa com o cargo GRAVADO na linha de uso, que é o do momento em que ela
   * aconteceu — promover alguém não reescreve o histórico dele.
   */
  cargo?: string | null;
  /**
   * Setor e equipe a isolar. `null` = todos.
   *
   * Ao contrário do cargo, os dois vêm do cadastro de HOJE. É deliberado: a
   * pergunta que eles respondem é «de quem eu cobro isso agora», e essa é
   * sempre sobre a estrutura atual. Carimbar o setor do mês passado faria o
   * gerente de hoje não encontrar a própria equipe no filtro.
   */
  setorId?:  string | null;
  equipeId?: string | null;
}

/**
 * Soma uso da tela para o usuário da sessão.
 *
 * Nunca estoura: é chamada de dentro de um efeito de navegação, e derrubar a
 * tela por causa de telemetria seria trocar um dado gerencial por um defeito de
 * produto. Falha vira aviso no console e nada mais.
 */
export async function registrarUso(
  tela: string, segundos: number, abertura: boolean,
): Promise<void> {
  try {
    const { error } = await supabase.rpc('fn_uso_registrar', {
      p_tela: tela,
      p_segundos: Math.max(0, Math.round(segundos)),
      p_abertura: abertura,
    });
    if (error) console.warn('[uso.service] registrarUso:', error.message);
  } catch (e) {
    console.warn('[uso.service] registrarUso:', e instanceof Error ? e.message : e);
  }
}

/**
 * Nomes aceitos por `ler`.
 *
 * União fechada, e não `string`: o cliente do Supabase tipa `rpc()` pelo catálogo
 * de funções, e aceitar `string` aqui desligaria essa checagem para as quatro
 * chamadas — um nome errado de RPC só apareceria em produção, como lista vazia.
 */
type RpcLeituraUso =
  | 'fn_uso_por_pessoa'
  | 'fn_uso_por_tela'
  | 'fn_uso_por_dia'
  | 'fn_uso_adocao_tela'
  | 'fn_uso_sem_acesso';

/** Chamada comum das cinco RPCs de leitura. Erro vira lista vazia. */
async function ler<T>(
  rpc: RpcLeituraUso, janela: JanelaUso, extra: Record<string, unknown> = {},
): Promise<T[]> {
  try {
    const { data, error } = await (supabase.rpc as unknown as (
      n: string, a: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)(rpc, {
      p_empresa_id: janela.empresaId,
      p_desde: janela.desde,
      p_ate:   janela.ate,
      p_cargo: janela.cargo ?? null,
      p_setor_id:  janela.setorId ?? null,
      p_equipe_id: janela.equipeId ?? null,
      ...extra,
    });
    if (error) {
      console.warn(`[uso.service] ${rpc}:`, error.message);
      return [];
    }
    return (data as T[]) ?? [];
  } catch (e) {
    console.warn(`[uso.service] ${rpc}:`, e instanceof Error ? e.message : e);
    return [];
  }
}

export function buscarUsoPorPessoa(j: JanelaUso): Promise<UsoPorPessoa[]> {
  return ler<UsoPorPessoa>('fn_uso_por_pessoa', j);
}

export function buscarUsoPorTela(j: JanelaUso): Promise<UsoPorTela[]> {
  return ler<UsoPorTela>('fn_uso_por_tela', j);
}

export function buscarUsoPorDia(j: JanelaUso): Promise<UsoPorDia[]> {
  return ler<UsoPorDia>('fn_uso_por_dia', j);
}

/**
 * Uso de UMA tela, incluindo quem não a usou.
 *
 * É a consulta que responde a pergunta que originou o painel. O achado útil não
 * é o ranking de quem abre — é a lista de quem NUNCA abriu, e essa lista não
 * existe dentro de `uso_telas`, porque quem não usou não tem linha.
 */
export function buscarAdocaoTela(j: JanelaUso, tela: string): Promise<AdocaoTela[]> {
  return ler<AdocaoTela>('fn_uso_adocao_tela', j, { p_tela: tela });
}

/**
 * Quem NÃO usou o sistema no período — sem escolher tela nenhuma.
 *
 * `buscarAdocaoTela` responde por UMA tela. Esta responde pelo sistema inteiro,
 * que é a pergunta que se faz antes: quem nunca entrou não vai aparecer na
 * adoção de tela nenhuma, e é dele que se cobra primeiro.
 *
 * A lista traz só gente ativa e não arquivada — cobrar acesso de quem foi
 * desligado é ruído, e a lista existe para virar ação.
 */
export function buscarSemAcesso(j: JanelaUso): Promise<UsoSemAcesso[]> {
  return ler<UsoSemAcesso>('fn_uso_sem_acesso', j);
}

/**
 * Detalhe de UMA pessoa: telas e série diária.
 *
 * Duas RPCs numa chamada só porque a janela de detalhe precisa das duas ao abrir,
 * e emendar dois estados de carregamento na tela renderia meio painel.
 *
 * Não recebe empresa: a pessoa já pertence a uma, e a RLS de `uso_telas` recusa
 * quem o solicitante não pode ver — pedir por id sem escopo de empresa é seguro
 * porque a policy é o gate, não o parâmetro.
 */
export async function buscarDetalhePessoa(
  usuarioId: string, desde: string, ate: string,
): Promise<{ telas: UsoDetalheTela[]; dias: UsoDetalheDia[] }> {
  const args = { p_usuario_id: usuarioId, p_desde: desde, p_ate: ate };
  const chamar = async <T>(rpc: 'fn_uso_detalhe_pessoa' | 'fn_uso_detalhe_pessoa_dias') => {
    try {
      const { data, error } = await supabase.rpc(rpc, args);
      if (error) { console.warn(`[uso.service] ${rpc}:`, error.message); return [] as T[]; }
      return (data as T[]) ?? [];
    } catch (e) {
      console.warn(`[uso.service] ${rpc}:`, e instanceof Error ? e.message : e);
      return [] as T[];
    }
  };
  const [telas, dias] = await Promise.all([
    chamar<UsoDetalheTela>('fn_uso_detalhe_pessoa'),
    chamar<UsoDetalheDia>('fn_uso_detalhe_pessoa_dias'),
  ]);
  return { telas, dias };
}
