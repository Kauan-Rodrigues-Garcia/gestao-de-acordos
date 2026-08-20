/**
 * creatorsLab.service.ts — o progresso do Creators Lab preso ao usuário.
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes o "descobriu o Easter Egg" e as conquistas moravam só em localStorage,
 * o que prendia o distintivo ao NAVEGADOR: quem descobria em casa chegava no
 * trabalho sem nada, e limpar cache apagava tudo. Agora a fonte da verdade é a
 * tabela `creators_lab_progresso` (migration 20260816210000).
 *
 * ## Tolerância obrigatória
 *
 * Toda função aqui devolve `null`/`false` quando a tabela não existe, quando
 * não há sessão ou quando a rede caiu — nunca lança. O Lab continua
 * funcionando em localStorage nesses casos.
 *
 * Isso não é excesso de zelo: a migration é aplicada à mão no SQL Editor, e
 * entre o deploy do front e a aplicação da migration existe uma janela em que
 * a tabela não está lá. Um Easter Egg não pode derrubar página nenhuma.
 */
import { supabase } from '@/lib/supabase';
import type { Json } from '@/lib/database.types';
import { logger } from '@/lib/logger';

/** O que a tabela guarda, já traduzido para o front. */
export interface ProgressoLabRemoto {
  /** O objeto `Progresso` de `lib/conquistas.ts`, cru. */
  progresso: Record<string, unknown>;
  /** Quando a pessoa achou o Lab pela primeira vez. */
  descobertoEm: string;
}

/** Id do usuário logado, ou `null` se não houver sessão. */
async function usuarioAtual(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * O progresso salvo desta pessoa.
 *
 * `null` significa "não deu para saber" (sem sessão, sem tabela, sem rede) e
 * também "nunca entrou" — quem chama trata os dois igual, porque a resposta
 * prática é a mesma: siga pelo que houver no localStorage.
 */
export async function buscarProgressoLab(): Promise<ProgressoLabRemoto | null> {
  const id = await usuarioAtual();
  if (!id) return null;

  const { data, error } = await supabase
    .from('creators_lab_progresso')
    .select('progresso, descoberto_em')
    .eq('usuario_id', id)
    .maybeSingle();

  if (error) {
    // Tabela ainda não migrada é o caso esperado, não um defeito: registra em
    // debug e segue. Qualquer outro erro também não pode derrubar o Lab.
    logger.debug('[creatorsLab] progresso indisponível:', error.message);
    return null;
  }
  if (!data) return null;

  return {
    progresso: (data.progresso as Record<string, unknown>) ?? {},
    descobertoEm: data.descoberto_em as string,
  };
}

/**
 * Grava o progresso desta pessoa.
 *
 * `upsert` pela chave primária: a primeira chamada cria a linha (e com ela o
 * `descoberto_em`, que o banco preenche e nunca mais é tocado), as seguintes
 * atualizam. Devolve `true` só quando gravou de fato.
 */
export async function salvarProgressoLab(progresso: object): Promise<boolean> {
  const id = await usuarioAtual();
  if (!id) return false;

  const { error } = await supabase
    .from('creators_lab_progresso')
    .upsert(
      {
        usuario_id: id,
        // O tipo gerado espera `Json`; o objeto de progresso é feito só de
        // booleanos, números e listas de string, então a conversão é honesta.
        progresso: progresso as Json,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'usuario_id' },
    );

  if (error) {
    logger.debug('[creatorsLab] falha ao salvar progresso:', error.message);
    return false;
  }
  return true;
}

/**
 * Só a pergunta do distintivo: esta pessoa já achou o Lab?
 *
 * Existe separado de `buscarProgressoLab` porque quem pergunta é o `Layout`,
 * que roda em toda página do Gestão e não tem nada a ver com conquistas. Traz
 * uma coluna de uma linha.
 */
export async function jaDescobriuOLab(): Promise<boolean> {
  const id = await usuarioAtual();
  if (!id) return false;

  const { data, error } = await supabase
    .from('creators_lab_progresso')
    .select('usuario_id')
    .eq('usuario_id', id)
    .maybeSingle();

  if (error) return false;
  return !!data;
}

// ═════════════════════════════════════════════════════════════════════════════
// Painel de descobridores
// ═════════════════════════════════════════════════════════════════════════════

export interface Descobridor {
  usuarioId: string;
  nome: string;
  fotoUrl: string | null;
  descobertoEm: string;
  /** 1 é quem chegou primeiro. */
  posicao: number;
}

/**
 * Quem descobriu o Lab, na ordem.
 *
 * Vem de `fn_creators_lab_descobridores`, e não de um `select` na tabela, por
 * dois motivos que valem a função a mais: a RLS só deixa cada um ver a própria
 * linha (corretamente), e o recorte — mesma empresa, só nome e foto, sem
 * cargo, e-mail ou progresso — precisa estar num lugar auditável, não montado
 * pelo cliente.
 *
 * `null` = não deu para saber. Lista vazia = ninguém elegível descobriu ainda,
 * que é o estado normal logo depois da migration.
 */
export async function buscarDescobridores(): Promise<Descobridor[] | null> {
  const { data, error } = await supabase.rpc('fn_creators_lab_descobridores');
  if (error) {
    logger.debug('[creatorsLab] painel indisponível:', error.message);
    return null;
  }
  return (data ?? []).map(l => ({
    usuarioId: l.usuario_id,
    nome: l.nome,
    fotoUrl: l.foto_url,
    descobertoEm: l.descoberto_em,
    posicao: l.posicao,
  }));
}

// ═════════════════════════════════════════════════════════════════════════════
// Fliperama — uma ficha por pessoa
// ═════════════════════════════════════════════════════════════════════════════

export interface LinhaRanking {
  usuarioId: string;
  nome: string;
  fotoUrl: string | null;
  pontos: number;
  vidasUsadas: number;
  duracaoMs: number | null;
  venceu: boolean;
  jogadoEm: string;
  posicao: number;
}

/**
 * A situação da ficha desta pessoa.
 *
 * União marcada, e não um objeto com campos opcionais, porque os quatro casos
 * levam a telas diferentes e nenhum pode ser tratado por engano como outro —
 * em especial `indisponivel` (não deu para saber) e `nunca` (pode jogar), que
 * num `null` solto viveriam confundidos.
 */
export type EstadoFicha =
  | { tipo: 'indisponivel' }
  | { tipo: 'nunca' }
  | { tipo: 'emAndamento'; iniciadoEm: string }
  | {
      tipo: 'encerrada';
      pontos: number; vidasUsadas: number; duracaoMs: number | null;
      venceu: boolean; jogadoEm: string;
    };

export async function buscarMinhaFicha(): Promise<EstadoFicha> {
  const id = await usuarioAtual();
  if (!id) return { tipo: 'indisponivel' };

  const { data, error } = await supabase
    .from('creators_lab_fliperama')
    .select('iniciado_em, finalizado_em, pontos, vidas_usadas, duracao_ms, venceu')
    .eq('usuario_id', id)
    .maybeSingle();

  if (error) {
    logger.debug('[creatorsLab] ficha indisponível:', error.message);
    return { tipo: 'indisponivel' };
  }
  if (!data) return { tipo: 'nunca' };

  if (!data.finalizado_em) return { tipo: 'emAndamento', iniciadoEm: data.iniciado_em };

  return {
    tipo: 'encerrada',
    pontos: data.pontos,
    vidasUsadas: data.vidas_usadas,
    duracaoMs: data.duracao_ms,
    venceu: data.venceu,
    jogadoEm: data.finalizado_em,
  };
}

/**
 * Queima a ficha e começa a partida.
 *
 * A linha nasce AQUI, no início — não no fim. É o que fecha a brecha de jogar,
 * ver que o placar ficou ruim e recarregar antes de morrer. O preço é que
 * abandonar no meio queima a ficha do mesmo jeito, e a tela avisa isso antes.
 *
 * O servidor zera pontos, vidas e tempo no gatilho, então não adianta o cliente
 * mandar nada aqui.
 */
export async function iniciarPartida(): Promise<boolean> {
  const id = await usuarioAtual();
  if (!id) return false;

  const { error } = await supabase
    .from('creators_lab_fliperama')
    .insert({ usuario_id: id });

  if (error) {
    // Chave duplicada é resposta legítima: já tinha ficha. Quem chamou
    // relê a situação e mostra o resultado guardado.
    logger.debug('[creatorsLab] não iniciou partida:', error.message);
    return false;
  }
  return true;
}

/**
 * Encerra a partida em andamento.
 *
 * Só o placar vem do cliente. O TEMPO é medido pelo relógio do servidor no
 * gatilho, porque tempo é critério de ranking e um número vindo do navegador
 * seria um campo de texto com nome bonito.
 *
 * O gatilho recusa encerrar uma partida já encerrada, então chamar duas vezes
 * não estraga nada.
 */
export async function encerrarPartida(resultado: {
  pontos: number; vidasUsadas: number; venceu: boolean;
}): Promise<boolean> {
  const id = await usuarioAtual();
  if (!id) return false;

  const { error } = await supabase
    .from('creators_lab_fliperama')
    .update({
      pontos: Math.max(0, Math.round(resultado.pontos)),
      vidas_usadas: resultado.vidasUsadas,
      venceu: resultado.venceu,
      // Qualquer valor serve: o gatilho troca por `now()`. O que importa é o
      // campo deixar de ser nulo, que é o sinal de "encerrando".
      finalizado_em: new Date().toISOString(),
    })
    .eq('usuario_id', id);

  if (error) {
    logger.debug('[creatorsLab] não encerrou partida:', error.message);
    return false;
  }
  return true;
}

/** O ranking da empresa. `null` = não deu para saber. */
export async function buscarRankingFliperama(): Promise<LinhaRanking[] | null> {
  const { data, error } = await supabase.rpc('fn_creators_lab_ranking');
  if (error) {
    logger.debug('[creatorsLab] ranking indisponível:', error.message);
    return null;
  }
  return (data ?? []).map(l => ({
    usuarioId: l.usuario_id,
    nome: l.nome,
    fotoUrl: l.foto_url,
    pontos: l.pontos,
    vidasUsadas: l.vidas_usadas,
    duracaoMs: l.duracao_ms,
    venceu: l.venceu,
    jogadoEm: l.jogado_em,
    posicao: l.posicao,
  }));
}
