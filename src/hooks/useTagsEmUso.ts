/**
 * useTagsEmUso — as tags da empresa que aparecem em algum acordo visível.
 *
 * Cruza o catálogo de tags da empresa (`useEmpresaTags`) com os ids realmente
 * presentes nos acordos que esta pessoa enxerga. Oferecer no filtro uma tag que
 * ela nunca vai encontrar deixa a tela parecendo quebrada: seleciona, some tudo.
 *
 * O escopo vem de quem chama e é o MESMO da lista — sem busca, status ou aba,
 * para as opções não se reescreverem enquanto a pessoa digita.
 */

import { useEffect, useState } from 'react';
import { fetchTagsEmUso } from '@/services/acordos.service';
import { useEmpresaTags } from './useEmpresaTags';
import type { AcordoTag } from '@/lib/supabase';

export interface EscopoTags {
  empresa_id?: string;
  operador_id?: string;
  setor_id?: string;
  equipe_id?: string;
  data_inicio?: string;
  data_fim?: string;
}

export function useTagsEmUso(escopo: EscopoTags): { tags: AcordoTag[]; loading: boolean } {
  const { tags: catalogo, loading: carregandoCatalogo } = useEmpresaTags();
  const [emUso, setEmUso] = useState<string[] | null>(null);

  const { empresa_id, operador_id, setor_id, equipe_id, data_inicio, data_fim } = escopo;

  useEffect(() => {
    if (!empresa_id) { setEmUso(null); return; }
    let vivo = true;
    fetchTagsEmUso({ empresa_id, operador_id, setor_id, equipe_id, data_inicio, data_fim })
      .then(ids => { if (vivo) setEmUso(ids); })
      // Falhou? Cai para o catálogo inteiro. Um filtro com opção demais
      // atrapalha bem menos do que um filtro que sumiu.
      .catch(() => { if (vivo) setEmUso(null); });
    return () => { vivo = false; };
  }, [empresa_id, operador_id, setor_id, equipe_id, data_inicio, data_fim]);

  const tags = emUso === null
    ? catalogo
    : catalogo.filter(t => emUso.includes(t.id));

  return { tags, loading: carregandoCatalogo };
}
