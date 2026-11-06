/**
 * cidadeDoSetor.ts — o nome da cidade de um setor (`setores.cidade_id` ›
 * `rh_celulas.nome`), lido uma vez por setor a cada 30 minutos e com a busca
 * em curso compartilhada.
 *
 * Quem pergunta: a marca (`useMarca`: Birigui é BookPlay, Marília é PaguePlay)
 * e a previsão do tempo do Calendário (`useClima`). Saiu do `useMarca` em
 * 06/11/2026 para os dois usarem a mesma leitura, e não duas.
 */
import { supabase } from '@/lib/supabase';
import { lerComCache } from '@/lib/cacheCurto';

const VALIDADE_MS = 30 * 60 * 1000;

/** O nome da cidade do setor, ou `null` (setor sem cidade). */
export function lerCidadeDoSetor(setorId: string): Promise<string | null> {
  return lerComCache(`cidade-do-setor:${setorId}`, VALIDADE_MS, async () => {
    const { data: setor } = await supabase
      .from('setores').select('cidade_id').eq('id', setorId).maybeSingle();
    const cidadeId = (setor as { cidade_id?: string | null } | null)?.cidade_id ?? null;
    if (!cidadeId) return null;
    const { data: cidade } = await supabase
      .from('rh_celulas').select('nome').eq('id', cidadeId).maybeSingle();
    return (cidade as { nome?: string } | null)?.nome ?? null;
  });
}
