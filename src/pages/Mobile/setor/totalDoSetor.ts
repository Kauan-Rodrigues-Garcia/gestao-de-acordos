/**
 * O total do setor na tela da gerência — o MESMO número do card do setor no
 * Painel do Líder (`DesempenhoEquipes`), pelos mesmos caminhos:
 *
 *   regra Cofen    o relatório de conciliação (`carregarConciliacaoSetor`) —
 *                  nunca a soma das pessoas (Cleber, 06/10/2026);
 *   demais         `acumuladoDoSetor`: o total do relatório por carimbo, sem as
 *                  origens excluídas (`buscarTotalPorSetor` + exclusões); a soma
 *                  das pessoas no alternativo; a contribuição digitada do
 *                  Receptivo mesclada como no Painel.
 */
import {
  buscarTotalOrfaosPorSetor, buscarTotalPorSetor, mapaSetorDaEquipe,
} from '@/services/analitico/analitico.service';
import { acumuladoDoSetor, somarAnaliticoPorSetor, type SomaDoSetor } from '@/services/analitico/acumuladoDoSetor';
import { buscarExclusoesSetor } from '@/services/analitico/exclusoesSetor.service';
import { buscarContribuicoesDigitadas, mesclarContribuicoes } from '@/services/analitico/contribuicaoReceptivo.service';
import { carregarConciliacaoSetor } from '@/services/relatorioPaguePlay/conciliacaoSetor';
import type { FontesEquipe } from '../equipe/montarEquipe';

export interface InfoDoSetorApp {
  id: string;
  nome: string;
  cofen: boolean;
  alternativo: boolean;
}

type Fontes = Pick<FontesEquipe, 'resumos' | 'operadorEquipeMap' | 'equipesExtrasPorOperador' | 'equipes'>;

export async function carregarTotalDoSetor(e: {
  empresaId: string;
  mes: string;
  setor: InfoDoSetorApp;
  /** `tenant.isPaguePlay` — o mesmo `setorSomaMembros` do Painel do Líder. */
  isPaguePlay: boolean;
  fontes: Fontes;
}): Promise<SomaDoSetor> {
  const { empresaId, mes, setor, isPaguePlay, fontes } = e;
  if (setor.cofen) {
    const c = await carregarConciliacaoSetor(empresaId, mes);
    return { bruto: c.bruto, ho: c.ho, ajuste: 0 };
  }
  const { porSetor: exclusoes } = await buscarExclusoesSetor(empresaId, mes);
  const [totalPorSetor, orfaosPorSetor, digitadas] = await Promise.all([
    buscarTotalPorSetor(empresaId, mes, exclusoes),
    buscarTotalOrfaosPorSetor(empresaId, mes),
    isPaguePlay ? Promise.resolve({ linhas: {}, dbAtiva: false }) : buscarContribuicoesDigitadas(empresaId, mes),
  ]);
  const somaPorSetor = somarAnaliticoPorSetor({
    resumos: fontes.resumos,
    operadorEquipeMap: fontes.operadorEquipeMap,
    equipesExtrasPorOperador: fontes.equipesExtrasPorOperador,
    setorDaEquipe: mapaSetorDaEquipe(fontes.equipes),
    orfaosPorSetor,
  });
  return acumuladoDoSetor({
    setorId: setor.id,
    isPaguePlay,
    alternativo: setor.alternativo,
    somaPorSetor,
    totalPorSetor,
    receptivoPorSetor: isPaguePlay ? {} : mesclarContribuicoes(digitadas.linhas, totalPorSetor),
  });
}
