/**
 * Equipe e Setor para o OPERADOR — só o Resumo (desenho §2.0, 06/10/2026).
 *
 * Os totais vêm do banco (`fn_app_resumo_visoes`): a equipe e o setor de quem
 * está logado, sem nome e sem linha de ninguém. O operador tem escopo
 * individual e não lê o analítico dos outros; é a função que soma.
 *
 * Setor Cofen: o total é o do relatório de conciliação (o card do Painel
 * Líder). Unidade: a do interruptor (`useUnidadeApp`).
 */
import { getTodayISO } from '@/lib/index';
import { metaNaUnidade } from '@/lib/unidadeValor';
import { useHoPercentual } from '@/lib/hoPercentual';
import { ritmoDoConjunto } from '@/lib/mobile/ritmo';
import type { Visao } from '@/lib/mobile/visoes';
import { CartaoResumo } from './comum/CartaoResumo';
import { useResumoVisoes } from './useResumoVisoes';

const n = (v: unknown) => Number(v) || 0;

export function ResumoDaVisao({ visao, mes, emHO }: { visao: Exclude<Visao, 'eu'>; mes: string; emHO: boolean }) {
  useHoPercentual(); // a meta em H.O. relê quando o percentual muda
  const q = useResumoVisoes(mes, true);

  if (q.isLoading) {
    return <div className="m-esq" style={{ margin: '0 16px', height: 260, borderRadius: 24 }} aria-busy="true" />;
  }
  if (q.isError || !q.data) {
    return (
      <p className="m-vazio" style={{ margin: '0 16px' }}>
        Não foi possível carregar o resumo agora. Puxe para atualizar ou tente mais tarde.
      </p>
    );
  }
  const c = visao === 'equipe' ? q.data.equipe : q.data.setor;
  if (!c) {
    return (
      <p className="m-vazio" style={{ margin: '0 16px' }}>
        {visao === 'equipe' ? 'Você ainda não está em uma equipe.' : 'Seu cadastro está sem setor.'}
      </p>
    );
  }
  const recebido = emHO ? n(c.recebido_ho) : n(c.recebido);
  const hoje = emHO ? n(c.hoje_ho) : n(c.hoje);
  const metaBruta = c.meta === null ? null : n(c.meta);
  const meta = emHO ? metaNaUnidade(metaBruta, 'ho') : metaBruta;
  const ritmo = ritmoDoConjunto({
    recebido, meta, mes, hojeISO: getTodayISO(),
    feriados: q.data.config?.feriados ?? [], contarHoje: q.data.config?.contar_dia_atual === true,
  });
  const titulo = visao === 'equipe' ? c.nome : `Setor ${c.nome}`;
  const cofen = visao === 'setor' && c.regra === 'cofen';
  return (
    <div className="v-entra">
      <CartaoResumo titulo={titulo} recebido={recebido} hoje={hoje} qtdHoje={n(c.qtd_hoje)}
        ritmo={ritmo} unidadeHO={emHO}
        aviso={cofen ? 'Total do relatório de conciliação, como no Painel do Líder.' : null} />
    </div>
  );
}
