/** As pessoas do cadastro para os seletores da corrida (o super_admin lê todo mundo, das duas empresas). */
import { supabase } from '@/lib/supabase';

export interface PessoaDoCadastro {
  id: string;
  nome: string;
  foto: string | null;
  perfil: string;
  setor: string;
  equipe: string | null;
}

interface Linha {
  id: string;
  nome: string | null;
  foto_url: string | null;
  perfil: string | null;
  ativo: boolean | null;
  arquivado: boolean | null;
  situacao: string | null;
  robo: boolean | null;
  setores: { nome: string | null } | null;
  equipes: { nome: string | null } | null;
}

/** Só quem trabalha hoje: ativo, não arquivado, não desligado, não robô. */
export async function lerPessoasDoCadastro(): Promise<PessoaDoCadastro[]> {
  const { data, error } = await supabase
    .from('perfis')
    .select('id, nome, foto_url, perfil, ativo, arquivado, situacao, robo, setores!perfis_setor_id_fkey(nome), equipes!perfis_equipe_id_fkey(nome)')
    .eq('ativo', true)
    .order('nome');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Linha[])
    .filter(l => !l.arquivado && l.situacao !== 'desligado' && !l.robo && (l.nome ?? '').trim())
    .map(l => ({
      id: l.id,
      nome: (l.nome ?? '').trim(),
      foto: l.foto_url || null,
      perfil: l.perfil ?? 'operador',
      setor: l.setores?.nome?.trim() || 'Sem setor',
      equipe: l.equipes?.nome?.trim() || null,
    }));
}
