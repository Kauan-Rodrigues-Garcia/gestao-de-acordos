/**
 * O total do SETOR no Dashboard — o mesmo número do card do setor no Painel
 * do Líder (12/11/2026, pedido do Cleber: «tem que vir exatamente os dados que
 * tem ali no Painel Líder»).
 *
 * Até aqui o Dashboard somava as linhas do analítico dentro do escopo do setor
 * (`agregarAnalitico` + `escopoDeSetor`), um caminho diferente do Painel:
 *
 *   regra Cofen    o Painel lê o relatório de CONCILIAÇÃO (Cleber, 06/10/2026)
 *                  e o Dashboard lia o analítico — em novembro/2026, R$ 2,36 mi
 *                  contra R$ 1,09 mi no Conecta Play;
 *   demais         o Painel tira as origens excluídas do acumulado e soma o
 *                  Receptivo digitado; o Dashboard não fazia nenhum dos dois.
 *
 * Agora o Dashboard pergunta pelo mesmo caminho do Painel e do app
 * (`carregarTotalDoSetor`). No Cofen o gráfico do setor vem junto, dia a dia
 * da conciliação (`fn_app_conciliacao_diaria`, o mesmo do app), para a curva
 * fechar com o total.
 *
 * Divisão, equipe e pessoa não passam por aqui: o Painel também as conta pelo
 * analítico.
 */
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { setorSomaPorUsuarios } from '@/services/analitico/escopoAnalitico';
import { buscarAlternativosDoRetrato } from '@/services/analitico/analitico.service';
import { carregarConciliacaoSetor } from '@/services/relatorioPaguePlay/conciliacaoSetor';
import {
  carregarTotalDoSetor, type FontesDoTotalDoSetor, type InfoDoSetorApp,
} from '@/pages/Mobile/setor/totalDoSetor';

export interface PontoDoSetor { bruto: number; ho: number; qtd: number }

export interface SetorDoDashboard {
  bruto: number;
  ho: number;
  /** Dia do mês → valores. `null` = o gráfico segue pelo analítico. */
  porDia: Record<number, PontoDoSetor> | null;
  fonte: 'conciliacao' | 'acumulado';
  cofen: boolean;
}

const SEM_FONTES: FontesDoTotalDoSetor = {
  resumos: [], operadorEquipeMap: {}, equipesExtrasPorOperador: {}, equipes: [],
};

/** O setor como o Painel o enxerga NAQUELE mês (alternativo do retrato no mês fechado). */
export async function lerSetorDoMes(empresaId: string, setorId: string, mes: string): Promise<InfoDoSetorApp | null> {
  const [{ data, error }, alternativosDoMes] = await Promise.all([
    supabase.from('setores').select('id, nome, regra, alternativo').eq('id', setorId).maybeSingle(),
    buscarAlternativosDoRetrato(empresaId, mes),
  ]);
  if (error || !data) return null;
  // `regra` é de 03/10 e ainda não está em `database.types.ts`.
  const s = data as unknown as { id: string; nome: string; regra: string | null; alternativo: boolean | null };
  return {
    id: s.id,
    nome: s.nome,
    cofen: s.regra === 'cofen',
    alternativo: alternativosDoMes?.get(s.id) ?? s.alternativo === true,
  };
}

/**
 * A RLS de `analitico_recebimentos` deixa esta pessoa ler o setor inteiro?
 * Mesma função da policy (`fn_user_escopo('analitico') >= 2`). Na dúvida (erro),
 * não: um total menor rotulado «setor» é pior que o analítico do Dashboard.
 */
async function leSetorNoAnalitico(): Promise<boolean> {
  const { data, error } = await rpcSemTipo<number>('fn_user_escopo', { p_aba: 'analitico' });
  return !error && Number(data) >= 2;
}

/** A conciliação dia a dia; `null` se a função não responde (o gráfico fica no analítico). */
async function conciliacaoPorDia(empresaId: string, mes: string): Promise<Record<number, PontoDoSetor> | null> {
  const { data, error } = await rpcSemTipo<{ dia: number; bruto: number; ho: number; qtd: number }[]>(
    'fn_app_conciliacao_diaria', { p_empresa_id: empresaId, p_mes: mes });
  if (error || !Array.isArray(data)) return null;
  const porDia: Record<number, PontoDoSetor> = {};
  for (const d of data) {
    porDia[Number(d.dia)] = { bruto: Number(d.bruto) || 0, ho: Number(d.ho) || 0, qtd: Number(d.qtd) || 0 };
  }
  return porDia;
}

/**
 * O total do setor pelo caminho do Painel do Líder.
 *
 * ## Só para quem lê o setor no Analítico (13/11/2026)
 *
 * Fora do Cofen, o caminho do Painel lê `analitico_recebimentos` direto, e a
 * RLS (`analitico_select`) só entrega linha de outra pessoa com
 * `fn_user_escopo('analitico') >= 2`. O Dashboard, porém, libera «Meu setor»
 * pelo alcance do DASHBOARD. Quem tinha o setor no Dashboard e só o próprio no
 * Analítico via, no card «Total recebido» do setor, o PRÓPRIO total — R$ 21 mil
 * no Play 3, com o gráfico ao lado (que vem do analítico do Dashboard) mostrando
 * R$ 60–80 mil por dia. A pergunta vai ao banco, na mesma função da RLS, para
 * as duas regras não discordarem; sem o alcance, erro — e o analítico do
 * Dashboard, que já traz o setor inteiro, responde.
 *
 * @param carregarFontes só é chamado quando o setor soma as pessoas (alternativo,
 *   ou a regra da sessão é Cofen): é a leitura pesada do Painel, e nos outros
 *   setores o total vem do relatório por carimbo.
 * @throws quando a conciliação nega acesso — quem chama cai no analítico.
 */
export async function carregarSetorDoDashboard(p: {
  empresaId: string;
  mes: string;
  setor: InfoDoSetorApp;
  /** `tenant.isPaguePlay` — o mesmo `setorSomaMembros` do Painel do Líder. */
  isPaguePlay: boolean;
  carregarFontes: () => Promise<FontesDoTotalDoSetor>;
}): Promise<SetorDoDashboard> {
  const { empresaId, mes, setor, isPaguePlay } = p;
  if (setor.cofen) {
    const [c, porDia] = await Promise.all([
      carregarConciliacaoSetor(empresaId, mes),
      conciliacaoPorDia(empresaId, mes),
    ]);
    return { bruto: c.bruto, ho: c.ho, porDia, fonte: 'conciliacao', cofen: true };
  }
  if (!(await leSetorNoAnalitico())) {
    throw new Error('Sem alcance de setor no Analítico: a leitura traria só as próprias linhas');
  }
  const usarSoma = setorSomaPorUsuarios({ isPaguePlay, alternativo: setor.alternativo });
  const fontes = usarSoma ? await p.carregarFontes() : SEM_FONTES;
  const t = await carregarTotalDoSetor({ empresaId, mes, setor, isPaguePlay, fontes });
  return { bruto: t.bruto, ho: t.ho, porDia: null, fonte: 'acumulado', cofen: false };
}
