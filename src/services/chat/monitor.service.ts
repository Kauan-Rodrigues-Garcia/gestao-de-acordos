/**
 * monitor.service.ts — a réplica do chat de outra pessoa.
 *
 * ## O que a monitoria é, e o que ela não é
 *
 * É LEITURA. Quem monitora vê a lista de conversas do operador e o conteúdo de
 * cada uma, ao vivo, e não pode fazer mais nada: não escreve, não curte, não
 * marca como lida, não aparece como digitando. Isso não é disciplina do
 * cliente — `fn_chat_posso_escrever` e `fn_chat_curtir` exigem participação, e
 * o monitor não participa. Se esta tela tentasse escrever, o banco recusaria.
 *
 * A consequência importante: o operador não é alterado pela monitoria. O
 * contador de não lidas dele não mexe, a leitura dele não avança, e o outro
 * lado da conversa não vê dois tiques que não aconteceram.
 *
 * ## Por que a lista vem por RPC e as mensagens não
 *
 * A lista é o ponto de vista DELE — «o outro» de cada conversa é o outro dele,
 * não o meu —, e isso o PostgREST não monta. Já as mensagens são as mesmas
 * linhas de sempre: a RLS foi estendida para admitir o monitor
 * (`fn_chat_monitoro_conversa`), então `listarMensagens` funciona sem saber que
 * existe monitoria — e, o que importa mais, o Realtime também. Sem isso a aba
 * seria uma foto, não um acompanhamento.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import type { AnexoChat } from './chat.service';

export interface PessoaMonitoravel {
  perfil_id:    string;
  nome:         string;
  usuario:      string | null;
  foto_url:     string | null;
  cargo:        string;
  setor_nome:   string | null;
  empresa_slug: string | null;
}

/** Uma conversa vista do lado da pessoa monitorada. */
export interface ConversaMonitorada {
  id:           string;
  /** Quem está do outro lado DELA. `null` em grupo. */
  outro_id:     string | null;
  /** Nome do outro, ou o nome do grupo. */
  outro_nome:   string;
  outro_foto:   string | null;
  outro_perfil: string | null;
  tipo:         'direta' | 'grupo';
  participantes: number;
  ultima_mensagem_em: string | null;
  ultimo_texto:   string | null;
  ultimo_anexos:  AnexoChat[] | null;
  ultimo_autor_id: string | null;
}

/**
 * Quem eu posso acompanhar.
 *
 * A busca é resolvida no banco e limitada a 60 — a lista existe para encontrar
 * uma pessoa, não para navegar a empresa inteira. Quem tem alcance de todos os
 * setores digita o nome.
 */
export async function listarMonitoraveis(busca?: string): Promise<PessoaMonitoravel[]> {
  const { data, error } = await rpcSemTipo<PessoaMonitoravel[]>('fn_chat_monitoraveis', {
    p_busca: busca?.trim() || null,
  });
  if (error) {
    console.warn('[chat/monitor] listarMonitoraveis:', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Uma conversa do setor, vista de fora, para o card «Chats recentes».
 *
 * `quem_id` é a pessoa DO MEU ALCANCE que faz a conversa aparecer aqui — é por
 * ela que a réplica abre, e é o nome que explica ao monitor por que a linha
 * existe. Sem esse campo o clique não teria por onde entrar: a monitoria é
 * sempre do ponto de vista de uma pessoa, nunca da conversa solta.
 */
export interface ConversaRecente {
  conversa_id:        string;
  tipo:               'direta' | 'grupo';
  titulo:             string;
  foto_url:           string | null;
  participantes:      number;
  ultima_mensagem_em: string | null;
  ultimo_texto:       string | null;
  ultimo_anexos:      AnexoChat[] | null;
  ultimo_autor_id:    string | null;
  ultimo_autor_nome:  string | null;
  quem_id:            string | null;
  quem_nome:          string | null;
}

/**
 * As conversas mais recentes dentro do meu alcance de monitoria.
 *
 * O alcance é o mesmo de `listarMonitoraveis` — pessoa a pessoa, por
 * `fn_chat_posso_monitorar`. Isto não abre nada novo: só responde, de uma vez,
 * a pergunta que antes exigia adivinhar em quem clicar.
 *
 * As minhas próprias conversas ficam de fora: elas já estão na minha lista, e
 * o monitor não é para me ver.
 */
export async function listarRecentes(limite = 15): Promise<ConversaRecente[]> {
  const { data, error } = await rpcSemTipo<ConversaRecente[]>('fn_chat_monitor_recentes', {
    p_limite: limite,
  });
  if (error) {
    console.warn('[chat/monitor] listarRecentes:', error.message);
    return [];
  }
  return (data ?? []).map(c => ({
    ...c,
    ultimo_anexos: Array.isArray(c.ultimo_anexos) ? c.ultimo_anexos : [],
  }));
}

export async function listarConversasDe(perfilId: string): Promise<ConversaMonitorada[]> {
  const { data, error } = await rpcSemTipo<ConversaMonitorada[]>('fn_chat_monitor_conversas', {
    p_alvo: perfilId,
  });
  if (error) {
    console.warn('[chat/monitor] listarConversasDe:', error.message);
    return [];
  }
  return (data ?? []).map(c => ({
    ...c,
    ultimo_anexos: Array.isArray(c.ultimo_anexos) ? c.ultimo_anexos : [],
  }));
}
