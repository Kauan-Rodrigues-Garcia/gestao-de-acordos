/**
 * O ranking da 2ª parte nos setores sem Pix automático (a Manutenção,
 * 23/11/2026): os N que mais receberem no período dos cupons ganham.
 *
 * O operador vê o pódio e a posição dele (quanto falta para entrar); o líder,
 * a gerência e o super_admin veem a lista inteira. A conta é do banco
 * (`fn_desafio_vale_ranking`): o operador não lê o recebido dos colegas.
 */
import { Medal, Megaphone, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DesafioVale, PessoaNoRanking } from '@/services/desafioVale/desafioVale.service';
import { faseDoPeriodo, periodo, premioDoRanking } from '@/services/desafioVale/regras';
import { brl, semana } from '@/services/desafioCobranca/regras';
import { useRankingDaVisao } from './dadosDaVisao';
import { useVisaoDoVale } from './visao';
import { HotDog } from './HotDog';

export function RankingDoSetor({ d, setorId, aberta, verTodos }: {
  d: DesafioVale; setorId: string | null; aberta: boolean; verTodos: boolean;
}) {
  const visao = useVisaoDoVale();
  const r = useRankingDaVisao(d, setorId, aberta, true, verTodos);
  const fase = faseDoPeriodo(d.cupom_inicio!, d.cupom_fim!, visao.hoje);
  const qtd = r.data?.qtd ?? d.meu_setor?.cupom_ranking_qtd ?? 2;
  const premio = premioDoRanking(d);
  const acabou = fase === 'depois';

  return (
    <div className="dc-conteudo">
      <section className="dc-cartao dv-cupom-heroi dv-ranking-heroi dc-sobe" style={{ ['--d' as string]: 0 }} aria-label="Ranking do setor">
        <div className="dv-ranking-cima">
          <div>
            <p className="dc-rotulo"><Trophy size={14} aria-hidden /> Ranking · {periodo(d.cupom_inicio!, d.cupom_fim!)}</p>
            <p className="dv-ranking-regra">
              Os <strong>{qtd} que mais receberem</strong> de {semana(d.cupom_inicio!)} a {semana(d.cupom_fim!)} <strong>{premio.texto}</strong>.
            </p>
            {d.cupom_premio && !premio.hotDog ? <p className="dc-dica">{d.cupom_premio}</p> : null}
          </div>
          {premio.hotDog && <HotDog className="dv-ranking-hotdog" />}
        </div>

        {r.isError ? <p className="dc-dica">Não deu para carregar o ranking agora.</p>
          : !r.data ? <p className="dc-dica">{r.isLoading ? 'Carregando o ranking…' : 'O ranking ainda não está disponível.'}</p>
            : (
              <>
                <ol className="dv-podio" aria-label={acabou ? 'Quem ganhou' : 'O pódio agora'}>
                  {r.data.topo.length === 0
                    ? <li className="dv-podio-vazio">Ninguém recebeu ainda no período.</li>
                    : r.data.topo.map(p => <LinhaDoPodio key={p.perfil_id} p={p} />)}
                </ol>
                <MinhaPosicao eu={r.data.eu} qtd={qtd} corte={r.data.corte} acabou={acabou} />
              </>
            )}
      </section>

      {r.data?.todos && r.data.todos.length > 0 && (
        <section className="dc-cartao dc-sobe" style={{ ['--d' as string]: 1 }} aria-label="O setor inteiro">
          <p className="dc-rotulo">O setor inteiro · {r.data.todos.length} pessoas</p>
          <ol className="dv-ranking-lista">
            {r.data.todos.map(p => (
              <li key={p.perfil_id} className={cn(p.posicao <= qtd && 'ganha', p.eu && 'eu')}>
                <span className="dv-ranking-pos">{p.posicao}º</span>
                <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                <strong>{brl(p.valor)}</strong>
              </li>
            ))}
          </ol>
          <p className="dc-eq-nota" style={{ textAlign: 'left' }}>
            O recebido é o do relatório (o mesmo das médias), de {periodo(d.cupom_inicio!, d.cupom_fim!)}. Líder não concorre.
          </p>
        </section>
      )}
    </div>
  );
}

function LinhaDoPodio({ p }: { p: PessoaNoRanking }) {
  return (
    <li className={cn('dv-podio-linha', `p${Math.min(p.posicao, 3)}`, p.eu && 'eu')}>
      <span className="dv-podio-medalha" aria-hidden><Medal size={18} /></span>
      <span className="dv-podio-pos">{p.posicao}º</span>
      <span className="min-w-0 flex-1 truncate">{p.nome}{p.eu ? ' (você)' : ''}</span>
      <strong>{brl(p.valor)}</strong>
    </li>
  );
}

function MinhaPosicao({ eu, qtd, corte, acabou }: { eu: PessoaNoRanking | null; qtd: number; corte: number | null; acabou: boolean }) {
  if (!eu) return null;
  const dentro = eu.posicao <= qtd;
  const falta = !dentro && corte !== null ? Math.max(0, Math.round((corte - eu.valor + 0.01) * 100) / 100) : null;
  return (
    <p className={cn('dv-ranking-eu', dentro && 'ok')}>
      {dentro
        ? acabou ? <><Trophy size={16} aria-hidden /> Você ficou em <strong>{eu.posicao}º</strong> — ganhou!</>
          : <><Trophy size={16} aria-hidden /> Você está em <strong>{eu.posicao}º</strong>, no pódio. Segura até o fim!</>
        : acabou ? <>Você ficou em <strong>{eu.posicao}º</strong>, com {brl(eu.valor)}. Virão mais oportunidades!</>
          : <><Megaphone size={16} aria-hidden /> Você está em <strong>{eu.posicao}º</strong> ({brl(eu.valor)}).
              {falta !== null ? <> Faltam <strong>{brl(falta)}</strong> para passar o {qtd}º lugar.</> : null}</>}
    </p>
  );
}
