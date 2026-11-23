/**
 * A visão do LÍDER no Desafio do Vale (23/11/2026): ele não faz as 9 médias,
 * então a gaveta dele abre no setor — fácil de ler de relance:
 *
 *   • 4 números grandes: % do setor (e o vale de hoje), quantos bateram as
 *     médias, a 2ª parte (cupons ou ranking) e o que espera a aprovação dele;
 *   • as faixas do vale do time;
 *   • o sorteio do setor (quantos ganham e, depois, quem ganhou) ou o ranking.
 *
 * Quem é «líder» é o painel de permissões (o Analítico do setor ou de todos),
 * o mesmo alcance da aba Equipes — nunca o cargo.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Clock, Dices, Megaphone, Percent, Ticket, Trophy, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTE_PATHS } from '@/lib';
import { useSetoresDoDesafio, type AlcanceNoDesafio } from '@/hooks/useEquipeNoDesafio';
import type { DesafioVale, SetorNoVale } from '@/services/desafioVale/desafioVale.service';
import { faixaDoSetor, faixaPiso, faseDoPeriodo, pctCortado, periodo, premioDoRanking, reais, regraDoSetor } from '@/services/desafioVale/regras';
import { dataCurta, medias, semana } from '@/services/desafioCobranca/regras';
import { useSetorDaVisao } from './dadosDaVisao';
import { useVisaoDoVale } from './visao';
import { PremioPeloSetor } from './PremioPeloSetor';
import { QuemViu } from './QuemViu';

export function PainelDoSetor({ d, aberta, alcance, onFechar, onEquipes }: {
  d: DesafioVale; aberta: boolean; alcance: Exclude<AlcanceNoDesafio, 'nenhum'>;
  onFechar?: () => void;
  /** Abre a aba Equipes (a lista de cada operador). */
  onEquipes: () => void;
}) {
  const visao = useVisaoDoVale();
  const todos = alcance === 'todos_setores';
  const lista = useSetoresDoDesafio(aberta && todos);
  const opcoes = useMemo(() => {
    const ids = d.setores ? new Set(d.setores.map(s => s.setor_id)) : null;
    return (lista.data ?? []).filter(s => !ids || ids.has(s.id));
  }, [lista.data, d.setores]);
  const [setorId, setSetorId] = useState<string | null>(visao.setorId);
  useEffect(() => {
    if (!todos || !opcoes.length) return;
    if (!setorId || !opcoes.some(s => s.id === setorId)) setSetorId(opcoes[0].id);
  }, [todos, opcoes, setorId]);

  const alvo = todos ? setorId : visao.setorId;
  const setor: SetorNoVale | null = (d.setores ?? []).find(s => s.setor_id === alvo)
    ?? (d.meu_setor?.setor_id === alvo ? d.meu_setor : null) ?? null;
  const q = useSetorDaVisao(d, alvo, aberta, visao.hoje);
  const comCupom = d.cupom_ativo && !!d.cupom_inicio && !!d.cupom_fim;
  const ranking = regraDoSetor(setor) === 'ranking';
  const faixa = faixaDoSetor(setor?.pct ?? null, d.faixas) ?? faixaPiso(d.faixas);
  const pct = setor?.pct ?? null;

  const bateram = q.data?.setor.bateram ?? null;
  const total = q.data?.setor.total ?? null;
  const pix = q.data?.pix ?? [];
  const pendentes = pix.filter(p => p.status === 'pendente').length;
  const cuponsNoSetor = q.data ? [...q.data.cupons.values()].reduce((a, c) => a + c.cupons, 0) : null;
  const concorrendo = q.data ? [...q.data.cupons.values()].filter(c => c.cupons > 0).length : null;
  const linkPendentes = `${ROUTE_PATHS.PIX_AUTOMATICO}?pendentes_de=${d.cupom_inicio}&pendentes_ate=${d.cupom_fim}`;
  const cupomAcabou = comCupom && faseDoPeriodo(d.cupom_inicio!, d.cupom_fim!, visao.hoje) === 'depois';

  return (
    <div className="dc-conteudo">
      <section className="dc-cartao dv-painel dc-sobe" style={{ ['--d' as string]: 0 }} aria-label="O seu setor no desafio">
        <div className="dc-hoje-linha">
          <p className="dc-rotulo"><Users size={14} aria-hidden /> {todos ? 'Setor' : 'O seu setor'}</p>
          {todos ? (
            <select className="dc-eq-setor" aria-label="Setor" value={setorId ?? ''} onChange={(e) => setSetorId(e.target.value || null)}>
              {opcoes.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          ) : <span className="dv-painel-nome">{setor?.nome ?? '—'}</span>}
        </div>
        <p className="dv-painel-regra">
          Você acompanha e aprova; <strong>quem faz as {medias(d.medias)} é o time</strong>.
          {comCupom ? (ranking
            ? <> Na 2ª parte, os <strong>{setor?.cupom_ranking_qtd ?? 2} que mais receberem</strong> até {semana(d.cupom_fim!)} {premioDoRanking(d).texto}.</>
            : <> Na 2ª parte, cada {d.cupom_pix} Pix aprovados = 1 cupom, e <strong>{setor?.sorteio_qtd || '—'} {setor?.sorteio_qtd === 1 ? 'pessoa é sorteada' : 'pessoas são sorteadas'}</strong> no setor.</>)
            : null}
        </p>

        <ul className="dv-kpis">
          <li className={cn('dv-kpi', pct !== null && pct >= 90 && 'bom')}>
            <span className="dv-kpi-icone" aria-hidden><Percent size={16} /></span>
            <strong>{pct === null ? '—' : `${pctCortado(pct)}%`}</strong>
            <span>{setor?.origem === 'projecao' ? 'projeção do mês' : 'da meta do mês'}</span>
            <em>
              {setor?.origem === 'projecao' && setor.pct_realizado != null ? `realizado ${pctCortado(setor.pct_realizado)}% · ` : ''}
              vale hoje: {reais(faixa?.valor ?? 0)}
            </em>
          </li>
          <li className={cn('dv-kpi', bateram !== null && bateram > 0 && 'bom')}>
            <span className="dv-kpi-icone" aria-hidden><Check size={16} strokeWidth={3} /></span>
            <strong>{bateram === null ? '…' : `${bateram}/${total}`}</strong>
            <span>bateram as {medias(d.medias)}</span>
            <button type="button" className="dv-kpi-link" onClick={onEquipes}>ver cada um <ChevronRight size={12} aria-hidden /></button>
          </li>
          {comCupom && (ranking ? (
            <li className="dv-kpi">
              <span className="dv-kpi-icone" aria-hidden><Trophy size={16} /></span>
              <strong>top {setor?.cupom_ranking_qtd ?? 2}</strong>
              <span>ranking de recebimento</span>
              <button type="button" className="dv-kpi-link" onClick={onEquipes}>ver o ranking <ChevronRight size={12} aria-hidden /></button>
            </li>
          ) : (
            <li className="dv-kpi">
              <span className="dv-kpi-icone" aria-hidden><Ticket size={16} /></span>
              <strong>{cuponsNoSetor ?? '…'}</strong>
              <span>cupons no setor</span>
              <em>{concorrendo ?? '…'} {concorrendo === 1 ? 'pessoa concorre' : 'pessoas concorrem'}</em>
            </li>
          ))}
          {comCupom && !ranking && (
            <li className={cn('dv-kpi', pendentes > 0 ? 'atencao' : 'bom')}>
              <span className="dv-kpi-icone" aria-hidden>{pendentes > 0 ? <Clock size={16} /> : <Check size={16} strokeWidth={3} />}</span>
              <strong>{q.data ? pendentes : '…'}</strong>
              <span>Pix esperando você</span>
              {pendentes > 0
                ? <Link to={linkPendentes} onClick={onFechar} className="dv-kpi-link forte">aprovar agora <ChevronRight size={12} aria-hidden /></Link>
                : <em>{q.data ? 'nada pendente' : ''}</em>}
            </li>
          )}
        </ul>

        {d.liberado && !visao.simulando && <QuemViu compacto setorId={alvo} />}

        {comCupom && !ranking && pendentes > 0 && (
          <p className="dv-cobre mt-3">
            <Megaphone size={16} aria-hidden />
            <span><strong>{pendentes} Pix da campanha esperando a sua aprovação.</strong> Sem aprovar, não vira cupom e a pessoa não concorre no sorteio.</span>
          </p>
        )}
      </section>

      <PremioPeloSetor d={d} setor={setor} bateu={false} paraLider />

      {comCupom && !ranking && setor && (
        <section className="dc-cartao dv-sorteio-cartao dc-sobe" style={{ ['--d' as string]: 2 }} aria-label="Sorteio do setor">
          <p className="dc-rotulo"><Dices size={14} aria-hidden /> Sorteio do setor · {setor.sorteio_qtd || '—'} {setor.sorteio_qtd === 1 ? 'ganhador' : 'ganhadores'}</p>
          {setor.ganhadores && setor.ganhadores.length > 0 ? (
            <ol className="dv-ganhadores">
              {setor.ganhadores.map(g => <li key={g.perfil_id}><b>{g.posicao}º</b> {g.nome}</li>)}
            </ol>
          ) : (
            <p className="dc-dica">
              {cupomAcabou ? 'O período dos cupons acabou; o sorteio sai em breve.' : `Concorre quem tiver cupom até ${dataCurta(d.cupom_fim!)} (${periodo(d.cupom_inicio!, d.cupom_fim!)}).`}
              {' '}{d.sorteio_por_cupom ? 'Cada cupom é uma chance.' : 'Uma chance por pessoa com cupom.'}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
