/**
 * usuariosDoMes.service.ts — a lista de usuários COMO ELA ERA num mês fechado.
 *
 * ## O problema que isto resolve
 *
 * A aba Usuários sempre mostrou `perfis`, ou seja, o estado de agora. Perguntar
 * «como estava a operação em agosto?» não tinha resposta: quem mudou de setor
 * em setembro aparecia no setor novo, quem virou líder aparecia como líder, e
 * quem foi excluído simplesmente não estava lá — apagado de um mês que
 * trabalhou inteiro.
 *
 * `composicao_mes` já congelava o vínculo de TODAS as pessoas da empresa a cada
 * virada; desde a migration `20260903410000` ela congela também a identidade
 * (nome, login, e-mail, cargo, foto). Com as duas coisas, o mês fechado tem
 * lista própria e ela não depende mais de `perfis`.
 *
 * ## As tags de mudança
 *
 * Olhar agosto e ver a pessoa no setor de agosto é metade do que se quer. A
 * outra metade é saber o que aconteceu com ela DEPOIS — foi para outro setor,
 * mudou de equipe, virou líder, foi desligada, foi excluída.
 *
 * Isso não é guardado em lugar nenhum, e nem precisa: é a diferença entre duas
 * fotos que já existem. Comparar o retrato do mês com o estado de hoje devolve
 * exatamente essa lista, sem uma tabela nova para manter em dia.
 *
 * ## Somente leitura, e de propósito
 *
 * Nada aqui escreve. Mês fechado não se edita — é o contrato que faz o retrato
 * valer alguma coisa. Quem precisa corrigir o passado usa os scripts de reparo,
 * que deixam rastro.
 */
import { supabase } from '@/lib/supabase';
import { tabelaSemTipo } from '@/lib/supabaseSemTipo';
import { ehMesAtual } from '@/lib/mesReferencia';

/** O que aconteceu com esta pessoa depois do mês que está sendo olhado. */
export type MudancaDesdeOMes =
  | { tipo: 'setor';     de: string; para: string }
  | { tipo: 'equipe';    de: string; para: string }
  | { tipo: 'cargo';     de: string; para: string }
  | { tipo: 'nome';      de: string; para: string }
  | { tipo: 'desligado' }
  | { tipo: 'excluido' };

export interface UsuarioDoMes {
  id:          string;
  nome:        string;
  usuario:     string | null;
  email:       string | null;
  cargo:       string;
  foto_url:    string | null;
  ativo:       boolean;
  situacao:    string;
  setor_id:    string | null;
  setor_nome:  string | null;
  equipe_id:   string | null;
  equipe_nome: string | null;
  /** Vazio = esta pessoa está hoje exatamente como estava no mês. */
  mudancas:    MudancaDesdeOMes[];
}

export interface SetorDoMes {
  id: string; nome: string; ativo: boolean; alternativo: boolean;
  /** Quantas pessoas o setor tinha NAQUELE mês. */
  pessoas: number;
  /** Sumiu depois: o setor não existe mais no cadastro de hoje. */
  extinto: boolean;
}

export interface EquipeDoMes {
  id: string; nome: string; setor_id: string | null;
  setor_nome: string | null;
  pessoas: number;
  extinta: boolean;
  /** Renomeada depois — o nome de hoje, quando difere. */
  nomeHoje: string | null;
}

export interface RetratoUsuarios {
  usuarios: UsuarioDoMes[];
  setores:  SetorDoMes[];
  equipes:  EquipeDoMes[];
}

interface LinhaPessoa {
  operador_id: string; nome: string | null; usuario: string | null;
  email: string | null; cargo: string | null; foto_url: string | null;
  ativo: boolean | null; situacao: string | null;
  setor_id: string | null; equipe_id: string | null; equipe_nome: string | null;
}
interface LinhaSetor  { setor_id: string; nome: string; ativo: boolean | null; alternativo: boolean | null }
interface LinhaEquipe { equipe_id: string; nome: string; setor_id: string | null }

/** Como está HOJE, para a comparação. Só o que decide uma tag. */
interface HojeResumo {
  perfis:  Map<string, { nome: string; cargo: string; setor_id: string | null; equipe_id: string | null; situacao: string }>;
  setores: Map<string, string>;
  equipes: Map<string, string>;
}

async function lerHoje(empresaId: string): Promise<HojeResumo> {
  const [p, s, e] = await Promise.all([
    supabase.from('perfis').select('id, nome, perfil, setor_id, equipe_id, situacao')
      .eq('empresa_id', empresaId),
    supabase.from('setores').select('id, nome').eq('empresa_id', empresaId),
    supabase.from('equipes').select('id, nome').eq('empresa_id', empresaId),
  ]);

  const perfis = new Map<string, { nome: string; cargo: string; setor_id: string | null; equipe_id: string | null; situacao: string }>();
  for (const r of (p.data ?? []) as { id: string; nome: string; perfil: string; setor_id: string | null; equipe_id: string | null; situacao: string | null }[]) {
    perfis.set(r.id, {
      nome: r.nome, cargo: r.perfil,
      setor_id: r.setor_id, equipe_id: r.equipe_id,
      situacao: r.situacao ?? 'ativo',
    });
  }
  const setores = new Map<string, string>();
  for (const r of (s.data ?? []) as { id: string; nome: string }[]) setores.set(r.id, r.nome);
  const equipes = new Map<string, string>();
  for (const r of (e.data ?? []) as { id: string; nome: string }[]) equipes.set(r.id, r.nome);

  return { perfis, setores, equipes };
}

/**
 * A lista do mês. `null` quando não há retrato — mês corrente, mês antigo sem
 * foto, ou migration pendente. Quem chama segue mostrando a tela de hoje, que é
 * o comportamento de sempre e é melhor que uma aba vazia.
 */
export async function buscarUsuariosDoMes(
  empresaId: string, mes: string,
): Promise<RetratoUsuarios | null> {
  if (ehMesAtual(mes)) return null;

  const [pessoas, setoresRet, equipesRet] = await Promise.all([
    tabelaSemTipo<LinhaPessoa>('composicao_mes')
      .select('operador_id, nome, usuario, email, cargo, foto_url, ativo, situacao, setor_id, equipe_id, equipe_nome')
      .eq('empresa_id', empresaId).eq('mes', mes),
    tabelaSemTipo<LinhaSetor>('composicao_mes_setor')
      .select('setor_id, nome, ativo, alternativo')
      .eq('empresa_id', empresaId).eq('mes', mes),
    tabelaSemTipo<LinhaEquipe>('composicao_mes_equipe')
      .select('equipe_id, nome, setor_id')
      .eq('empresa_id', empresaId).eq('mes', mes),
  ]);

  if (pessoas.error || !pessoas.data?.length) return null;

  const hoje = await lerHoje(empresaId);

  const nomeSetorDoMes = new Map<string, string>();
  for (const s of setoresRet.data ?? []) nomeSetorDoMes.set(s.setor_id, s.nome);
  const nomeEquipeDoMes = new Map<string, string>();
  for (const e of equipesRet.data ?? []) nomeEquipeDoMes.set(e.equipe_id, e.nome);

  const usuarios: UsuarioDoMes[] = (pessoas.data ?? []).map(p => {
    const agora = hoje.perfis.get(p.operador_id);
    const mudancas: MudancaDesdeOMes[] = [];

    if (!agora) {
      // Excluído depois. A linha fica: ela é o registro de um mês trabalhado.
      mudancas.push({ tipo: 'excluido' });
    } else {
      if ((p.setor_id ?? null) !== (agora.setor_id ?? null)) {
        mudancas.push({
          tipo: 'setor',
          de:   nomeSetorDoMes.get(p.setor_id ?? '') ?? 'sem setor',
          para: agora.setor_id ? (hoje.setores.get(agora.setor_id) ?? 'outro setor') : 'sem setor',
        });
      }
      if ((p.equipe_id ?? null) !== (agora.equipe_id ?? null)) {
        mudancas.push({
          tipo: 'equipe',
          de:   p.equipe_nome ?? nomeEquipeDoMes.get(p.equipe_id ?? '') ?? 'sem equipe',
          para: agora.equipe_id ? (hoje.equipes.get(agora.equipe_id) ?? 'outra equipe') : 'sem equipe',
        });
      }
      if (p.cargo && p.cargo !== agora.cargo) {
        mudancas.push({ tipo: 'cargo', de: p.cargo, para: agora.cargo });
      }
      if (p.nome && p.nome !== agora.nome) {
        mudancas.push({ tipo: 'nome', de: p.nome, para: agora.nome });
      }
      // Só marca quem SAIU depois do mês: quem já estava desligado no mês não
      // "mudou" — a lista dele já mostra a situação daquele mês.
      if (agora.situacao === 'desligado' && (p.situacao ?? 'ativo') !== 'desligado') {
        mudancas.push({ tipo: 'desligado' });
      }
    }

    return {
      id: p.operador_id,
      nome: p.nome ?? 'Sem nome',
      usuario: p.usuario,
      email: p.email,
      cargo: p.cargo ?? 'operador',
      foto_url: p.foto_url,
      ativo: p.ativo ?? true,
      situacao: p.situacao ?? 'ativo',
      setor_id: p.setor_id,
      setor_nome: p.setor_id ? (nomeSetorDoMes.get(p.setor_id) ?? null) : null,
      equipe_id: p.equipe_id,
      equipe_nome: p.equipe_nome ?? (p.equipe_id ? nomeEquipeDoMes.get(p.equipe_id) ?? null : null),
      mudancas,
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const porSetor = new Map<string, number>();
  const porEquipe = new Map<string, number>();
  for (const u of usuarios) {
    if (u.setor_id)  porSetor.set(u.setor_id, (porSetor.get(u.setor_id) ?? 0) + 1);
    if (u.equipe_id) porEquipe.set(u.equipe_id, (porEquipe.get(u.equipe_id) ?? 0) + 1);
  }

  const setores: SetorDoMes[] = (setoresRet.data ?? [])
    .map(s => ({
      id: s.setor_id, nome: s.nome,
      ativo: s.ativo ?? true, alternativo: s.alternativo ?? false,
      pessoas: porSetor.get(s.setor_id) ?? 0,
      extinto: !hoje.setores.has(s.setor_id),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const equipes: EquipeDoMes[] = (equipesRet.data ?? [])
    .map(e => {
      const nomeHoje = hoje.equipes.get(e.equipe_id) ?? null;
      return {
        id: e.equipe_id, nome: e.nome, setor_id: e.setor_id,
        setor_nome: e.setor_id ? (nomeSetorDoMes.get(e.setor_id) ?? null) : null,
        pessoas: porEquipe.get(e.equipe_id) ?? 0,
        extinta: nomeHoje === null,
        nomeHoje: nomeHoje && nomeHoje !== e.nome ? nomeHoje : null,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return { usuarios, setores, equipes };
}

/** Os meses que TÊM retrato, do mais novo para o mais velho. */
export async function mesesComRetrato(empresaId: string): Promise<string[]> {
  const { data, error } = await tabelaSemTipo<{ mes: string }>('composicao_mes')
    .select('mes').eq('empresa_id', empresaId);
  if (error || !data) return [];
  return [...new Set(data.map(d => d.mes))].sort().reverse();
}
