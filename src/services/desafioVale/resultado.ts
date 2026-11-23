/**
 * O resultado do Desafio do Vale, pessoa a pessoa (23/11/2026): quem bateu as
 * médias, o vale pela faixa do setor e os cupons do Pix. É a «lista de quem
 * ganhou» da tela do super_admin e o que o fechamento grava em
 * `desafio_vale_resultado`.
 *
 * Quem é de qual setor: depois do fim do desafio, o retrato do mês
 * (`composicao_mes`) — quem mudou de setor na virada conta onde estava.
 */
import { buscarSetorNoDesafio } from '@/services/desafioCobranca/equipeNoDesafio';
import { hojeEmSaoPaulo } from '@/services/desafioCobranca/regras';
import { buscarPixDoCupom, buscarRankingVale, type DetalheVale, type ResultadoVale } from './desafioVale.service';
import { cuponsPorOperador, diasDoPeriodo, faixaDoSetor, faixaPiso } from './regras';

export async function montarResultadoVale(d: DetalheVale, empresaId: string): Promise<ResultadoVale[]> {
  const dias = diasDoPeriodo(d.inicio, d.fim);
  const hoje = hojeEmSaoPaulo();
  const iHoje = dias.indexOf(hoje) >= 0 ? dias.indexOf(hoje) : hoje < d.inicio ? 0 : dias.length - 1;
  const retrato = hoje > d.fim ? d.fim.slice(0, 7) : undefined;
  const comCupom = d.cupom_ativo && !!d.cupom_inicio && !!d.cupom_fim;
  const pix = comCupom ? await buscarPixDoCupom({ empresaId, inicio: d.cupom_inicio!, fim: d.cupom_fim! }) : [];
  const cupons = cuponsPorOperador(pix, d.cupom_pix);

  const saida: ResultadoVale[] = [];
  const vistos = new Set<string>();
  // Ganhadores do ranking que não entraram nas médias (sem meta no mês).
  const ganhadoresDoRanking: { perfil_id: string; nome: string; posicao: number; setor_id: string; setor_nome: string }[] = [];
  for (const s of d.todos_setores.filter(x => x.participa)) {
    const r = await buscarSetorNoDesafio({
      empresaId, setorId: s.setor_id, hoje: iHoje, retrato,
      regras: { dias, regra_medias: d.medias, regra_medias_maior: d.medias },
    });
    const valor = (faixaDoSetor(s.pct, d.faixas) ?? faixaPiso(d.faixas))?.valor ?? 0;
    // Setor de ranking (a Manutenção): quem ficou entre os N.
    const ranking = comCupom && s.cupom_regra === 'ranking' ? await buscarRankingVale(s.setor_id) : null;
    const posicao = new Map((ranking?.todos ?? ranking?.topo ?? [])
      .filter(x => x.posicao <= (ranking?.qtd ?? 0)).map(x => [x.perfil_id, x.posicao]));
    for (const x of ranking?.todos ?? ranking?.topo ?? []) {
      if (x.posicao <= (ranking?.qtd ?? 0)) ganhadoresDoRanking.push({ perfil_id: x.perfil_id, nome: x.nome, posicao: x.posicao, setor_id: s.setor_id, setor_nome: s.nome });
    }
    for (const e of r.equipes) for (const p of e.pessoas) {
      if (vistos.has(p.id)) continue;
      vistos.add(p.id);
      const c = cupons.get(p.id);
      saida.push({
        perfil_id: p.id, nome: p.nome, setor_id: s.setor_id, setor_nome: s.nome, equipe_nome: e.nome,
        medias: p.meta.medias, feito: Math.round(p.meta.feito * 100) / 100, meta: p.meta.meta,
        bateu: p.meta.bateu, valor: p.meta.bateu ? valor : 0,
        cupons: c?.cupons ?? 0, pix_pendentes: c?.pendentes ?? 0,
        ranking_posicao: posicao.get(p.id) ?? null,
      });
    }
  }
  for (const g of ganhadoresDoRanking) {
    if (vistos.has(g.perfil_id)) continue;
    vistos.add(g.perfil_id);
    saida.push({
      perfil_id: g.perfil_id, nome: g.nome, setor_id: g.setor_id, setor_nome: g.setor_nome, equipe_nome: null,
      medias: 0, feito: 0, meta: null, bateu: false, valor: 0, cupons: 0, pix_pendentes: 0, ranking_posicao: g.posicao,
    });
  }
  // Quem tem Pix no período mas não entrou nas médias (sem meta, setor fora).
  const nomes = new Map(pix.map(p => [p.operador_id, p.operador_nome ?? 'Sem nome']));
  const setorDoPix = new Map(pix.map(p => [p.operador_id, p.setor_id]));
  for (const [id, c] of cupons) {
    if (vistos.has(id) || (c.cupons === 0 && c.pendentes === 0)) continue;
    saida.push({
      perfil_id: id, nome: nomes.get(id) ?? 'Sem nome', setor_id: setorDoPix.get(id) ?? null,
      setor_nome: d.todos_setores.find(s => s.setor_id === setorDoPix.get(id))?.nome ?? null,
      equipe_nome: null, medias: 0, feito: 0, meta: null, bateu: false, valor: 0,
      cupons: c.cupons, pix_pendentes: c.pendentes,
    });
  }
  return saida.sort((a, b) => Number(b.bateu) - Number(a.bateu) || b.cupons - a.cupons || a.nome.localeCompare(b.nome, 'pt-BR'));
}
