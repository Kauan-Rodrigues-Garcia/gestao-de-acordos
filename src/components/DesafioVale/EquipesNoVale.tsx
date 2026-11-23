/**
 * A aba «Equipes» do Desafio do Vale (23/11/2026): o líder acompanha cada
 * operador do setor, como na aba Equipes do Desafio Cobrança — as 9 médias
 * (com o valor do vale pela faixa do setor) e os cupons do Pix, com os Pix
 * que ainda esperam a aprovação dele.
 *
 * Alcance: o da aba Analítico (`useAlcanceNoDesafio`): o próprio setor, ou
 * escolher o setor para quem vê todos.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Megaphone, Ticket, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTE_PATHS } from '@/lib';
import { useVisaoDoVale } from './visao';
import { RankingDoSetor } from './RankingDoSetor';
import { useSetoresDoDesafio, type AlcanceNoDesafio } from '@/hooks/useEquipeNoDesafio';
import { useSetorDaVisao } from './dadosDaVisao';
import type { DesafioVale, PixDoCupom, SetorNoVale } from '@/services/desafioVale/desafioVale.service';
import { dataLocalPix } from '@/lib/mesPix';
import { dataCurta } from '@/services/desafioCobranca/regras';
import type { EquipeNoDesafio, PessoaNoDesafio } from '@/services/desafioCobranca/equipeNoDesafio';
import { brl, medias } from '@/services/desafioCobranca/regras';
import { faixaDoSetor, faixaPiso, faseDoPeriodo, pctCortado, reais, regraDoSetor, type CuponsDoPix } from '@/services/desafioVale/regras';

type Filtro = 'todos' | 'bateram' | 'nao';
type Visao = 'medias' | 'cupons';

export function EquipesNoVale({ d, aberta, alcance, onFechar }: {
  d: DesafioVale; aberta: boolean; alcance: Exclude<AlcanceNoDesafio, 'nenhum'>;
  /** Ir aprovar fecha a gaveta. */
  onFechar?: () => void;
}) {
  const visao = useVisaoDoVale();
  const todos = alcance === 'todos_setores';
  const lista = useSetoresDoDesafio(aberta && todos);
  // Quem vê todos: só os setores que estão no desafio, quando o banco diz quais.
  const opcoes = useMemo(() => {
    const ids = d.setores ? new Set(d.setores.map(s => s.setor_id)) : null;
    return (lista.data ?? []).filter(s => !ids || ids.has(s.id));
  }, [lista.data, d.setores]);
  const [setorId, setSetorId] = useState<string | null>(visao.setorId);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const comCupom = d.cupom_ativo && !!d.cupom_inicio && !!d.cupom_fim;
  const [olhar, setOlhar] = useState<Visao>('medias');

  useEffect(() => {
    if (!todos || !opcoes.length) return;
    if (!setorId || !opcoes.some(s => s.id === setorId)) setSetorId(opcoes[0].id);
  }, [todos, opcoes, setorId]);

  const alvo = todos ? setorId : visao.setorId;
  const q = useSetorDaVisao(d, alvo, aberta, visao.hoje);
  const setorInfo: SetorNoVale | null = (d.setores ?? []).find(s => s.setor_id === alvo)
    ?? (d.meu_setor?.setor_id === alvo ? d.meu_setor : null) ?? null;
  const faixa = faixaDoSetor(setorInfo?.pct ?? null, d.faixas) ?? faixaPiso(d.faixas);
  const acabou = faseDoPeriodo(d.inicio, d.fim, visao.hoje) === 'depois';
  // Setor sem Pix (a Manutenção): a 2ª vista é o ranking, e não há Pix a aprovar.
  const ranking = regraDoSetor(setorInfo) === 'ranking';

  const setor = q.data?.setor;
  const passa = (p: PessoaNoDesafio) => filtro === 'todos' || (filtro === 'bateram') === p.meta.bateu;
  const equipes = (setor?.equipes ?? []).map(e => ({ ...e, visiveis: e.pessoas.filter(passa) })).filter(e => e.visiveis.length > 0);

  return (
    <div className="dc-conteudo">
      <section className="dc-cartao dc-sobe" style={{ ['--d' as string]: 0 }} aria-label="Resumo do setor">
        <div className="dc-hoje-linha">
          <p className="dc-rotulo"><Users size={14} aria-hidden /> {acabou ? 'Resultado' : 'Até agora'}</p>
          {todos && (
            <select className="dc-eq-setor" aria-label="Setor" value={setorId ?? ''} onChange={(e) => setSetorId(e.target.value || null)}>
              {opcoes.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          )}
        </div>
        {setor && (
          <p className="dc-eq-total">
            <strong>{setor.bateram}</strong> de {setor.total} {setor.bateram === 1 ? 'bateu' : 'bateram'} as {medias(d.medias)}
          </p>
        )}
        <ul className="dc-eq-resumo">
          {setorInfo?.pct != null && <li>Setor {setorInfo.origem === 'projecao' ? 'projetando' : 'em'} {pctCortado(setorInfo.pct)}%</li>}
          {faixa && <li className="maior"><Ticket size={13} aria-hidden /> vale de {reais(faixa.valor)} {d.fechado_em ? '(final)' : 'hoje'}</li>}
        </ul>
        {comCupom && !ranking && q.data && <FaltaAprovar d={d} pix={q.data.pix} onFechar={onFechar} onVer={() => setOlhar('cupons')} />}
        {comCupom && (
          <div className="dc-abas mt-3" role="tablist" aria-label="O que ver">
            <button type="button" role="tab" aria-selected={olhar === 'medias'} className="dc-aba" onClick={() => setOlhar('medias')}>{medias(d.medias)}</button>
            <button type="button" role="tab" aria-selected={olhar === 'cupons'} className="dc-aba" onClick={() => setOlhar('cupons')}>{ranking ? 'Ranking' : 'Cupons do Pix'}</button>
          </div>
        )}
        {olhar === 'medias' && (
          <div className="dc-abas mt-2" role="tablist" aria-label="Filtrar">
            {([['todos', 'Todos'], ['bateram', 'Bateram'], ['nao', 'Não bateram']] as const).map(([id, rotulo]) => (
              <button key={id} type="button" role="tab" aria-selected={filtro === id} className="dc-aba" onClick={() => setFiltro(id)}>{rotulo}</button>
            ))}
          </div>
        )}
      </section>

      {!alvo ? (
        <p className="dc-eq-vazio">Seu cadastro não tem setor, então não há operadores para mostrar.</p>
      ) : q.isError ? (
        <p className="dc-eq-vazio">Não deu para carregar os operadores agora.</p>
      ) : olhar === 'cupons' && ranking ? (
        <RankingDoSetor d={d} setorId={alvo} aberta={aberta} verTodos />
      ) : !q.data ? (
        <p className="dc-eq-vazio">Carregando os operadores…</p>
      ) : olhar === 'cupons' ? (
        <CuponsDoSetor d={d} cupons={q.data.cupons} nomes={q.data.pix} onFechar={onFechar} />
      ) : equipes.length === 0 ? (
        <p className="dc-eq-vazio">
          {setor!.total === 0 ? 'Ninguém deste setor tem meta cadastrada no mês.' : filtro === 'bateram' ? 'Ninguém bateu ainda.' : 'Todo mundo bateu!'}
        </p>
      ) : (
        equipes.map((e, i) => (
          <CartaoEquipe key={e.id ?? 'sem'} d={d} equipe={e} visiveis={e.visiveis} acabou={acabou}
            valor={faixa?.valor ?? 0} cupons={comCupom && !ranking ? q.data!.cupons : null} indice={i} />
        ))
      )}

      {olhar === 'medias' && setor && setor.semMeta > 0 && (
        <p className="dc-eq-nota">
          {setor.semMeta} {setor.semMeta === 1 ? 'pessoa do setor não tem' : 'pessoas do setor não têm'} meta cadastrada no mês, então a regra das médias não vale para {setor.semMeta === 1 ? 'ela' : 'elas'}.
        </p>
      )}
      <p className="dc-eq-nota">
        A média de cada um é a meta do mês dele ÷ os dias úteis dele no mês. O feito é o recebimento dele no relatório nos dias do desafio.
      </p>
    </div>
  );
}

function CartaoEquipe({ d, equipe, visiveis, acabou, valor, cupons, indice }: {
  d: DesafioVale; equipe: EquipeNoDesafio; visiveis: PessoaNoDesafio[]; acabou: boolean; valor: number;
  cupons: Map<string, CuponsDoPix> | null; indice: number;
}) {
  return (
    <section className="dc-cartao dc-sobe" style={{ ['--d' as string]: Math.min(indice + 1, 6) }} aria-label={`Equipe ${equipe.nome}`}>
      <div className="dc-hoje-linha">
        <h3 className="dc-eq-nome">{equipe.nome}</h3>
        <span className="dc-eq-contagem"><strong>{equipe.bateram}</strong>/{equipe.pessoas.length} bateram</span>
      </div>
      <ul className="dc-eq-lista">
        {visiveis.map(p => {
          const { meta } = p;
          const pc = meta.meta ? Math.min((meta.feito / meta.meta) * 100, 100) : 0;
          const nivel = meta.bateu ? 'maior' : 'nao';
          const Icone = meta.bateu ? Check : acabou ? X : Clock;
          const c = cupons?.get(p.id);
          return (
            <li key={p.id} className={cn('dc-eq-linha', nivel)}>
              <div className="dc-eq-topo">
                <span className="dc-eq-pessoa">{p.nome}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {c && (c.cupons > 0 || c.pendentes > 0) && (
                    <span className="dv-tag-cupom" title={`${c.aprovados} Pix aprovados, ${c.pendentes} esperando aprovação`}>
                      <Ticket size={11} aria-hidden /> {c.cupons}{c.pendentes > 0 ? ` · ${c.pendentes} pend.` : ''}
                    </span>
                  )}
                  <span className={cn('dc-eq-selo', nivel)}>
                    <Icone size={12} strokeWidth={3} aria-hidden /> {meta.bateu ? `vale ${reais(valor)}` : acabou ? 'não bateu' : `faltam ${brl(meta.falta ?? 0)}`}
                  </span>
                </span>
              </div>
              <div className="dc-eq-regua" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(pc)}
                aria-label={`${p.nome}: ${medias(meta.medias)} de ${medias(d.medias)}`}>
                <div className="dc-eq-cheia" style={{ width: `${pc}%` }} />
              </div>
              <p className="dc-eq-numeros">
                <span><strong>{medias(meta.medias)}</strong> · {brl(meta.feito)}</span>
                <span>{medias(d.medias)} = {brl(meta.meta ?? 0)}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Os cupons de cada um no setor e o que espera a aprovação do líder. */
function CuponsDoSetor({ d, cupons, nomes, onFechar }: {
  d: DesafioVale; cupons: Map<string, CuponsDoPix>; nomes: PixDoCupom[]; onFechar?: () => void;
}) {
  const nomeDe = new Map(nomes.map(n => [n.operador_id, n.operador_nome ?? 'Sem nome']));
  const linhas = [...cupons.entries()]
    .map(([id, c]) => ({ id, nome: nomeDe.get(id) ?? 'Sem nome', c }))
    .sort((a, b) => b.c.cupons - a.c.cupons || b.c.aprovados - a.c.aprovados || a.nome.localeCompare(b.nome, 'pt-BR'));
  const pendentes = linhas.reduce((s, l) => s + l.c.pendentes, 0);
  const total = linhas.reduce((s, l) => s + l.c.cupons, 0);
  return (
    <>
      <section className="dc-cartao dc-sobe" style={{ ['--d' as string]: 1 }} aria-label="Cupons do setor">
        <div className="dc-hoje-linha">
          <p className="dc-rotulo"><Ticket size={14} aria-hidden /> {total} {total === 1 ? 'cupom' : 'cupons'} no setor</p>
          <span className="dc-eq-contagem">{d.cupom_pix} Pix aprovados = 1 cupom</span>
        </div>
        {pendentes > 0 ? (
          <ListaPendentes d={d} pix={nomes} onFechar={onFechar} />
        ) : (
          <p className="dc-eq-nota mt-2" style={{ textAlign: 'left' }}>Nenhum Pix do período esperando aprovação.</p>
        )}
      </section>
      {linhas.length === 0 ? (
        <p className="dc-eq-vazio">Ninguém do setor registrou Pix no período ainda.</p>
      ) : (
        <section className="dc-cartao dc-sobe" style={{ ['--d' as string]: 2 }} aria-label="Cupons por operador">
          <ul className="dv-cupom-tabela">
            {linhas.map(({ id, nome, c }) => (
              <li key={id}>
                <span className="dc-eq-pessoa">{nome}</span>
                <span className="dv-cupom-tabela-n"><Ticket size={12} aria-hidden /> <strong>{c.cupons}</strong></span>
                <span className="dv-cupom-tabela-det">{c.aprovados} aprov.{c.pendentes > 0 ? <> · <b>{c.pendentes} pend.</b></> : null}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** O link da aba Pix já filtrada nos pendentes do período da campanha. */
function linkDosPendentes(d: Pick<DesafioVale, 'cupom_inicio' | 'cupom_fim'>): string {
  return `${ROUTE_PATHS.PIX_AUTOMATICO}?pendentes_de=${d.cupom_inicio}&pendentes_ate=${d.cupom_fim}`;
}

/**
 * O aviso do líder (23/11/2026): quantos Pix da campanha esperam a aprovação
 * dele, com o atalho para a aba Pix já filtrada.
 */
function FaltaAprovar({ d, pix, onFechar, onVer }: { d: DesafioVale; pix: PixDoCupom[]; onFechar?: () => void; onVer: () => void }) {
  const pendentes = pix.filter(p => p.status === 'pendente');
  if (!pendentes.length) return null;
  const pessoas = new Set(pendentes.map(p => p.operador_id)).size;
  return (
    <div className="dv-cobre mt-3">
      <Megaphone size={16} aria-hidden />
      <span className="flex-1">
        <strong>{pendentes.length} Pix da campanha esperando aprovação</strong> ({pessoas} {pessoas === 1 ? 'pessoa' : 'pessoas'}).
        {' '}Sem aprovar, não vira cupom.
        <span className="dv-aprovar-acoes">
          <Link to={linkDosPendentes(d)} onClick={onFechar} className="dv-aprovar-botao">Aprovar agora</Link>
          <button type="button" className="dv-aprovar-ver" onClick={onVer}>ver quais são</button>
        </span>
      </span>
    </div>
  );
}

/** Os Pix pendentes, um por linha: NR, quem lançou e o dia. */
function ListaPendentes({ d, pix, onFechar }: { d: DesafioVale; pix: PixDoCupom[]; onFechar?: () => void }) {
  const pendentes = pix.filter(p => p.status === 'pendente')
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  return (
    <div className="mt-2">
      <p className="dv-cobre">
        <Megaphone size={16} aria-hidden />
        <span><strong>{pendentes.length} Pix esperando a sua aprovação.</strong> Na aba Pix Automático eles aparecem em laranja.</span>
      </p>
      <ul className="dv-pix-lista">
        {pendentes.map(p => (
          <li key={p.id} className="pendente">
            <span className="font-mono">NR {p.nr_cliente}</span>
            <span className="min-w-0 flex-1 truncate">{p.operador_nome ?? 'Sem nome'}</span>
            <em>{dataCurta(dataLocalPix(p.criado_em))}</em>
          </li>
        ))}
      </ul>
      <Link to={linkDosPendentes(d)} onClick={onFechar} className="dv-aprovar-botao mt-2 inline-flex">
        Abrir no Pix Automático e aprovar
      </Link>
    </div>
  );
}
