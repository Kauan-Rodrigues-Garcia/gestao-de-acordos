/**
 * AbaRankingQuitacao — o ranking de quitação do mês (06/10/2026; configurável
 * e ao vivo desde 11/11/2026).
 *
 * A conta é do banco (`fn_ranking_quitacao` → `fn_ranking_quitacao_calcular`),
 * a MESMA do Modo TV, e o pacote é lido por `normalizarRanking`, o mesmo leitor
 * da cena da TV: a aba e a parede mostram a mesma ordem, os mesmos prêmios e os
 * mesmos destaques.
 *
 * Como o setor disputa vem de Configurações → Eventos (RankingQuitacaoConfig):
 * o setor inteiro ou cada equipe, por valor ou por quantidade, até 10 posições
 * premiadas (valor e/ou brinde), mínimo de quitações e os destaques do mês.
 *
 * ## Ao vivo
 *
 * Importar ou mudar a configuração avisa no tópico `ranking-quitacao:<empresa>`
 * (20261111150500), e a aba relê na hora — com um espalhamento de até 3 s para
 * a sala inteira não bater no banco no mesmo instante. Sem o aviso, relê a
 * cada 5 minutos.
 *
 * ## O desenho
 *
 * A altura de cada degrau do pódio, e a barra da lista, são proporcionais ao
 * que ordena (valor ou quantidade): o pódio mostra a distância de verdade. A
 * cor de medalha fica no anel da foto e no degrau dos três primeiros; o resto
 * segue os tokens do tema. Uma linha marca onde acaba a zona de prêmio, e as
 * setas mostram quem subiu ou desceu desde o relatório anterior que a pessoa
 * viu (lembrança do navegador, por pessoa).
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Award, Crown, Gem, Hash, Loader2, Settings2, Trophy, Upload, Users } from 'lucide-react';
import { EditorDoSetor, type EquipeDoEditor } from '@/components/admin/RankingQuitacaoConfig';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { formatBRL } from '@/lib/money';
import { corTexto } from '@/lib/temas';
import { cn } from '@/lib/utils';
import { AvatarParticipante } from '@/pages/Analitico/Desafios/AvatarParticipante';
import { buscarRanking } from '@/services/rankingQuitacao/rankingQuitacao.service';
import {
  atualizarLembranca, categoriasDaDisputa, escolherDisputa, faltaParaPassar, quitacoesTexto, reaisRedondos, temPremio, variacao,
  type CategoriaId, type CategoriaRanking, type Criterio, type DisputaRanking, type Lembranca, type PosicaoRanking, type RankingQuitacao,
} from '@/services/rankingQuitacao/ranking';
import { ImportarRankingModal } from './ImportarRankingModal';
import { useSetoresDoRanking } from './useSetoresDoRanking';
import { nomeDoMes, primeiroDia } from './mes';
import './ranking.css';

interface Props {
  empresaId: string;
  /** Mês da lente do Analítico (`AAAA-MM`). */
  mes: string;
  /** O setor mostrado; `null` quando não há setor habilitado para esta pessoa. */
  setorId: string | null;
  setorNome: string;
  podeImportar: boolean;
  /**
   * Abre a configuração do setor na própria aba: quem tem a chave geral, ou o
   * líder no próprio setor (`ranking_quitacao_configurar_setor`). O banco
   * confere o setor (20261112220000).
   */
  podeConfigurar: boolean;
  /** Quem está olhando: a linha dele ganha destaque. */
  operadorId: string;
  /** A importação foi de outro mês: a lente vai para ele. */
  onMudarMes: (mes: string) => void;
}

/**
 * Ouro, prata e bronze — no anel da foto, no número e no tom do degrau. Entram
 * sempre misturados ao fundo do tema (`ranking.css`); como texto, por
 * `corTexto`, que acerta o contraste no tema claro e no escuro.
 */
const MEDALHA = ['#C9A227', '#A3ADB8', '#B4743F'] as const;

/** Sem aviso do banco, relê a cada 5 min (o aviso é o caminho de verdade). */
const RELEITURA_MS = 5 * 60_000;
/** O aviso chega para a sala inteira junto: cada aba espera um pouco diferente. */
const ESPALHAMENTO_MS = 3_000;

const metrica = (criterio: Criterio, p: { valor: number; quitacoes: number }) =>
  criterio === 'quantidade' ? p.quitacoes : p.valor;

export function AbaRankingQuitacao({ empresaId, mes, setorId, setorNome, podeImportar, podeConfigurar, operadorId, onMudarMes }: Props) {
  const [importando, setImportando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [equipeEscolhida, setEquipeEscolhida] = useState<string | null>(null);
  const mesDoRanking = primeiroDia(mes);
  const queryClient = useQueryClient();
  const chave = useMemo(() => ['ranking-quitacao', empresaId, setorId, mesDoRanking] as const, [empresaId, setorId, mesDoRanking]);

  const consulta = useQuery({
    queryKey: chave,
    enabled: !!setorId,
    queryFn: () => buscarRanking(empresaId, setorId as string, mesDoRanking),
    refetchInterval: RELEITURA_MS,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
  const aoVivo = useAvisoDoRanking(empresaId, useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['ranking-quitacao', empresaId] });
  }, [queryClient, empresaId]));

  // Trocou de setor: a equipe escolhida era de outro.
  useEffect(() => { setEquipeEscolhida(null); setConfigurando(false); }, [setorId]);

  // A configuração do setor, só para quem pode mexer nela.
  const setoresDoRanking = useSetoresDoRanking(empresaId, podeConfigurar);
  const equipesDoSetor = useQuery({
    queryKey: ['ranking-quitacao-equipes', empresaId, setorId],
    enabled: podeConfigurar && configurando && !!setorId,
    queryFn: async () => {
      const { data, error } = await supabase.from('equipes').select('id, nome, setor_id, treinamento')
        .eq('empresa_id', empresaId).eq('setor_id', setorId as string).order('nome');
      if (error) throw new Error(error.message);
      return (data as EquipeDoEditor[] | null) ?? [];
    },
  });
  const aoSalvarConfig = useCallback(async () => {
    await setoresDoRanking.recarregar();
    await queryClient.invalidateQueries({ queryKey: ['ranking-quitacao', empresaId] });
    setConfigurando(false);
  }, [setoresDoRanking, queryClient, empresaId]);

  const aoImportar = useCallback((mesImportado: string) => {
    setImportando(false);
    if (mesImportado.slice(0, 7) !== mes.slice(0, 7)) onMudarMes(mesImportado.slice(0, 7));
    void queryClient.invalidateQueries({ queryKey: ['ranking-quitacao', empresaId] });
  }, [mes, onMudarMes, queryClient, empresaId]);

  const ranking = consulta.data ?? null;
  const disputa = ranking ? escolherDisputa(ranking, equipeEscolhida) : null;
  const posicoes = disputa?.posicoes ?? [];
  // Por equipe, os destaques são os da equipe na tela (a Equipe campeã é do setor).
  const destaques = ranking ? categoriasDaDisputa(ranking, disputa) : [];
  const lembranca = useLembranca(setorId, mesDoRanking, disputa?.equipe_id ?? null, ranking?.importado_em ?? null, posicoes);
  const carregando = !!setorId && consulta.isLoading;
  const erro = consulta.error instanceof Error ? consulta.error.message : consulta.error ? 'Não foi possível carregar o ranking.' : null;

  return (
    <section className="space-y-5" aria-labelledby="ranking-quitacao-titulo">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium capitalize text-muted-foreground">
            {nomeDoMes(mesDoRanking)}{setorNome ? ` · ${setorNome}` : ''}
          </p>
          <h2 id="ranking-quitacao-titulo" className="text-xl font-semibold tracking-tight text-foreground">
            Ranking de quitação
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ranking?.criterio === 'quantidade' ? 'Pela quantidade de quitações no mês' : 'Pelo valor dos acordos quitados no mês'}
            {ranking?.aceita === 'so_quitacao' && ' · só acordo de Quitação'}
            {ranking?.disputa === 'equipe' && ' · cada equipe disputa o seu'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ranking?.habilitado && <StatusAoVivo aoVivo={aoVivo} importadoEm={ranking.importado_em} atualizando={consulta.isFetching && !carregando} />}
          {podeConfigurar && ranking?.habilitado && setorId && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setConfigurando(true)}>
              <Settings2 className="h-4 w-4" /> Configurar
            </Button>
          )}
          {podeImportar && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportando(true)}>
              <Upload className="h-4 w-4" /> Importar relatório
            </Button>
          )}
        </div>
      </header>

      {!setorId ? (
        <Vazio texto="Nenhum setor seu tem o Ranking de quitação. Quem configura liga o setor em Configurações → Eventos e gincanas." />
      ) : carregando ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : erro ? (
        <Vazio texto={erro} />
      ) : !ranking?.habilitado ? (
        <Vazio texto={`O ${setorNome || 'setor'} não tem o Ranking de quitação. Ele é ligado em Configurações → Eventos e gincanas.`} />
      ) : (
        <>
          {ranking.disputa === 'equipe' && ranking.disputas.length > 0 && (
            <SeletorDeEquipe ranking={ranking} atual={disputa?.equipe_id ?? null} onEscolher={setEquipeEscolhida} />
          )}

          {posicoes.length === 0 ? (
            <Vazio
              texto={ranking.importado_em
                ? `Ninguém ${disputa?.nome ? `da ${disputa.nome}` : `do ${setorNome || 'setor'}`} quitou acordo em ${nomeDoMes(mesDoRanking)}.`
                : `O relatório de ${nomeDoMes(mesDoRanking)} ainda não foi importado.`}
              acao={podeImportar && !ranking.importado_em ? () => setImportando(true) : undefined}
            />
          ) : (
            <>
              <Resumo ranking={ranking} disputa={disputa} />
              {destaques.length > 0 && <Destaques categorias={destaques} operadorId={operadorId} />}
              <Podio posicoes={posicoes.slice(0, 3)} criterio={ranking.criterio} lembranca={lembranca} operadorId={operadorId} />
              <Lista ranking={ranking} posicoes={posicoes} lembranca={lembranca} operadorId={operadorId} />
              <MinhaPosicao ranking={ranking} disputa={disputa} posicoesNaTela={posicoes.length} />
              {ranking.equipes.length > 1 && (ranking.disputa === 'equipe' || ranking.categorias.some(c => c.id === 'equipe_campea')) && (
                <PlacarDeEquipes ranking={ranking} />
              )}
            </>
          )}
        </>
      )}

      {configurando && setorId && (
        equipesDoSetor.isLoading || setoresDoRanking.carregando ? null : (
          <EditorDoSetor
            empresaId={empresaId}
            setor={{ id: setorId, nome: setorNome || 'setor' }}
            atual={setoresDoRanking.setores.find(s => s.setor_id === setorId)}
            equipes={equipesDoSetor.data ?? []}
            onFechar={() => setConfigurando(false)}
            onSalvo={aoSalvarConfig}
          />
        )
      )}

      <ImportarRankingModal
        aberto={importando}
        empresaId={empresaId}
        onFechar={() => setImportando(false)}
        onImportado={aoImportar}
      />
    </section>
  );
}

// ── Ao vivo ──────────────────────────────────────────────────────────────────

/**
 * Ouve o aviso do banco (`fn_ranking_quitacao_avisar`, tópico público
 * `ranking-quitacao:<empresa>` — só a hora trafega, nenhum número). Devolve se
 * o canal está de pé.
 */
function useAvisoDoRanking(empresaId: string, aoMudar: () => void): boolean {
  const [conectado, setConectado] = useState(false);
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase
      .channel(`ranking-quitacao:${empresaId}`)
      .on('broadcast', { event: 'mudou' }, () => {
        clearTimeout(espera);
        espera = setTimeout(aoMudar, Math.random() * ESPALHAMENTO_MS);
      })
      .subscribe(status => setConectado(status === 'SUBSCRIBED'));
    return () => { clearTimeout(espera); setConectado(false); void supabase.removeChannel(canal); };
  }, [empresaId, aoMudar]);
  return conectado;
}

/** «há 3 min», «às 14:32 de 10/11». */
function quando(iso: string, agora: number): string {
  const d = new Date(iso);
  const min = Math.round((agora - d.getTime()) / 60_000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const hoje = new Date(agora).toDateString() === d.toDateString();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return hoje ? `hoje às ${hora}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
}

function StatusAoVivo({ aoVivo, importadoEm, atualizando }: { aoVivo: boolean; importadoEm: string | null; atualizando: boolean }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      className="rq-status inline-flex h-8 items-center gap-2 rounded-full border border-border px-3 text-xs text-muted-foreground"
      title={aoVivo ? 'Atualiza sozinho quando um relatório é importado — aqui e no Modo TV.' : 'Reconectando; enquanto isso, relê a cada 5 minutos.'}
    >
      <span className={cn('rq-ponto', aoVivo && 'rq-ponto-vivo')} aria-hidden />
      {atualizando ? 'Atualizando…' : importadoEm ? <>Relatório {quando(importadoEm, agora)}</> : 'Sem relatório no mês'}
    </span>
  );
}

// ── Lembrança: quem subiu e quem desceu ──────────────────────────────────────

function lerLembranca(chave: string): Lembranca {
  try {
    const bruto = localStorage.getItem(chave);
    const l = bruto ? JSON.parse(bruto) as Lembranca : null;
    return l && typeof l === 'object' ? { atual: l.atual ?? null, anterior: l.anterior ?? null } : { atual: null, anterior: null };
  } catch { return { atual: null, anterior: null }; }
}

function useLembranca(setorId: string | null, mes: string, disputaId: string | null, importadoEm: string | null, posicoes: PosicaoRanking[]): Lembranca {
  const chave = `ranking-quitacao:posicoes:${setorId ?? ''}:${mes}:${disputaId ?? 'setor'}`;
  const [lembranca, setLembranca] = useState<Lembranca>(() => lerLembranca(chave));
  useEffect(() => {
    if (!importadoEm || !posicoes.length) { setLembranca(lerLembranca(chave)); return; }
    const nova = atualizarLembranca(lerLembranca(chave), importadoEm, posicoes);
    try { localStorage.setItem(chave, JSON.stringify(nova)); } catch { /* sem armazenamento: sem setas */ }
    setLembranca(nova);
  }, [chave, importadoEm, posicoes]);
  return lembranca;
}

function Variacao({ lembranca, p }: { lembranca: Lembranca; p: PosicaoRanking }) {
  const v = variacao(lembranca, p);
  if (v == null || v === 0) return null;
  if (v === 'novo') {
    return <span className="rq-variacao text-primary" title="Entrou no top 10 desde o último relatório">novo</span>;
  }
  const subiu = v > 0;
  return (
    <span className={cn('rq-variacao', subiu ? 'text-success' : 'text-muted-foreground')}
      title={`${subiu ? 'Subiu' : 'Desceu'} ${Math.abs(v)} desde o último relatório`}>
      {subiu ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(v)}
    </span>
  );
}

// ── Peças ────────────────────────────────────────────────────────────────────

function Vazio({ texto, acao }: { texto: string; acao?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <Trophy className="h-6 w-6 text-muted-foreground/60" />
      <p className="max-w-sm text-sm text-muted-foreground">{texto}</p>
      {acao && <Button size="sm" className="gap-2" onClick={acao}><Upload className="h-4 w-4" /> Importar relatório</Button>}
    </div>
  );
}

/** Por equipe: cada equipe tem a sua disputa. Começa na de quem está olhando. */
function SeletorDeEquipe({ ranking, atual, onEscolher }: { ranking: RankingQuitacao; atual: string | null; onEscolher: (id: string | null) => void }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Equipe">
      {ranking.disputas.map(d => {
        const ativo = d.equipe_id === atual;
        const minha = ranking.eu?.equipe_id != null && ranking.eu.equipe_id === d.equipe_id;
        return (
          <button
            key={d.equipe_id ?? 'sem-equipe'}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onEscolher(d.equipe_id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {d.nome ?? 'Sem equipe'}
            <span className={cn('tabular-nums', ativo ? 'opacity-80' : 'opacity-60')}>{d.participantes}</span>
            {minha && <span className={cn('rounded-full px-1.5 text-[10px]', ativo ? 'bg-primary-foreground/20' : 'bg-primary/15 text-primary')}>sua</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Três números do mês, discretos: o pódio é o protagonista. Por equipe, os da
 * equipe na tela — o placar de equipes, mais abaixo, compara com as outras.
 */
function Resumo({ ranking, disputa }: { ranking: RankingQuitacao; disputa: DisputaRanking | null }) {
  const daEquipe = ranking.disputa === 'equipe';
  const total = { v: disputa?.valor_total ?? 0, q: disputa?.quitacoes_total ?? 0 };
  // Pacote antigo (antes de 20261111150500) não traz os totais.
  if (total.q <= 0) return null;
  const pessoas = daEquipe ? disputa?.participantes ?? 0 : ranking.participantes;
  const itens = [
    { rotulo: daEquipe ? 'Quitado na equipe' : 'Quitado no mês', valor: formatBRL(total.v) },
    { rotulo: 'Quitações', valor: total.q.toLocaleString('pt-BR') },
    { rotulo: 'Ticket médio', valor: formatBRL(total.q ? total.v / total.q : 0) },
    { rotulo: 'No ranking', valor: `${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'}` },
  ];
  return (
    <dl className="rq-resumo grid grid-cols-2 overflow-hidden sm:grid-cols-4">
      {itens.map(i => (
        <div key={i.rotulo} className="px-4 py-3">
          <dt className="text-[11px] font-medium text-muted-foreground">{i.rotulo}</dt>
          <dd className="mt-0.5 truncate text-base font-semibold tabular-nums tracking-tight text-foreground">{i.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

const ICONE_DA_CATEGORIA: Record<CategoriaId, typeof Award> = {
  mais_quitacoes: Hash,
  maior_valor: Crown,
  maior_quitacao: Gem,
  equipe_campea: Users,
};

/** Os destaques do mês, cada um com o seu prêmio. */
function Destaques({ categorias, operadorId }: { categorias: CategoriaRanking[]; operadorId: string }) {
  return (
    <div className={cn('grid gap-3', categorias.length === 1 ? 'grid-cols-1' : categorias.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4')}>
      {categorias.map(c => {
        const Icone = ICONE_DA_CATEGORIA[c.id] ?? Award;
        const v = c.vencedor;
        const eu = !!v && !v.equipe && v.id === operadorId;
        return (
          <div key={c.id} className={cn('rq-destaque flex items-center gap-3 p-3.5', eu && 'rq-eu')}>
            {v && !v.equipe ? (
              <AvatarParticipante nome={v.nome} fotoUrl={v.foto_url} className="h-11 w-11 shrink-0" />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icone className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Icone className="h-3 w-3" /> {c.titulo}
              </p>
              {v ? (
                <>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {v.nome}{eu && <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary">você</span>}
                  </p>
                  <p className="truncate text-xs tabular-nums text-muted-foreground">
                    {c.id === 'mais_quitacoes' ? `${quitacoesTexto(v.quitacoes)} · ${formatBRL(v.valor)}`
                      : c.id === 'maior_quitacao' ? `${formatBRL(v.valor)} numa quitação`
                      : `${formatBRL(v.valor)} · ${quitacoesTexto(v.quitacoes)}`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Ninguém ainda</p>
              )}
            </div>
            {(c.premio != null || c.premio_texto) && (
              <span className="rq-premio rq-premio-compacto shrink-0" style={{ '--medalha': 'var(--primary)' } as CSSProperties}>
                <span className="rq-premio-rotulo">Prêmio</span>
                <ValorDoPremio premio={c.premio} texto={c.premio_texto} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Do 1º ao 3º, na ordem do pódio: 2º, 1º, 3º, num palco (`ranking.css`). A
 * altura do degrau acompanha o critério, e os degraus encostam no chão do palco.
 */
function Podio({ posicoes, criterio, lembranca, operadorId }: {
  posicoes: PosicaoRanking[]; criterio: Criterio; lembranca: Lembranca; operadorId: string;
}) {
  const reduzir = useReducedMotion();
  const maior = Math.max(0, ...posicoes.map(p => metrica(criterio, p)));
  return (
    <div className="rq-palco px-3 pt-8 sm:px-8 sm:pt-10">
      <div className="mx-auto grid max-w-3xl grid-cols-3 items-end gap-2 sm:gap-5" role="list" aria-label="Pódio">
        {[1, 0, 2].map((i, coluna) => {
          const p = posicoes[i];
          if (!p) return <div key={`vazio-${coluna}`} />;
          const primeiro = p.posicao === 1;
          // Degrau: 108 px de base (o número e o selo do prêmio cabem nela), mais
          // até 60 px pela fração do 1º.
          const altura = 108 + Math.round(60 * (maior > 0 ? metrica(criterio, p) / maior : 0));
          const cor = MEDALHA[p.posicao - 1];
          const eu = p.operador_id === operadorId;
          return (
            <div key={p.operador_id} role="listitem" className="flex min-w-0 flex-col items-center" style={{ '--medalha': cor } as CSSProperties}
              aria-label={`${p.posicao}º lugar: ${p.nome}, ${formatBRL(p.valor)} em ${quitacoesTexto(p.quitacoes)}`}>
              <div className="relative isolate">
                {primeiro && <span className="rq-brilho" aria-hidden />}
                {primeiro && <Crown className="rq-coroa absolute -top-5 left-1/2 h-5 w-5 -translate-x-1/2" aria-hidden />}
                <div className="rq-anel rounded-full p-[3px]">
                  <AvatarParticipante
                    nome={p.nome}
                    fotoUrl={p.foto_url}
                    className={cn('border-2 border-card', primeiro ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-14 w-14 sm:h-16 sm:w-16')}
                  />
                </div>
              </div>
              <p className={cn('mt-2 flex w-full items-center justify-center gap-1 text-center font-medium text-foreground', primeiro ? 'text-sm sm:text-base' : 'text-xs sm:text-sm')}>
                <span className="truncate">{p.nome}</span>
                {eu && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary">você</span>}
              </p>
              <p className={cn('font-semibold tabular-nums tracking-tight text-foreground', primeiro ? 'text-lg sm:text-2xl' : 'text-sm sm:text-lg')}>
                {criterio === 'quantidade' ? quitacoesTexto(p.quitacoes) : formatBRL(p.valor)}
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
                {criterio === 'quantidade' ? formatBRL(p.valor) : quitacoesTexto(p.quitacoes)}
                <Variacao lembranca={lembranca} p={p} />
              </p>
              <motion.div
                className="rq-degrau mt-4 flex w-full flex-col items-center justify-start gap-1.5 rounded-t-2xl px-1 pt-3"
                initial={reduzir ? false : { height: 0, opacity: 0 }}
                animate={{ height: altura, opacity: 1 }}
                transition={{ duration: 0.7, delay: reduzir ? 0 : 0.12 * (3 - p.posicao), ease: [0.22, 1, 0.36, 1] }}
                style={reduzir ? { height: altura } : undefined}
              >
                <span className="text-2xl font-bold tabular-nums" style={{ color: corTexto(cor) }}>{p.posicao}º</span>
                {temPremio(p) && <Premio premio={p.premio} texto={p.premio_texto} grande={primeiro} className="mt-1 max-w-full" />}
                {p.abaixo_minimo && <AbaixoDoMinimo />}
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Do 4º ao 10º. Na coluna da direita, sempre da mesma largura: o prêmio (na
 * zona de prêmio) ou quanto falta para passar quem está acima. Uma linha
 * marca onde a zona de prêmio acaba.
 */
function Lista({ ranking, posicoes, lembranca, operadorId }: {
  ranking: RankingQuitacao; posicoes: PosicaoRanking[]; lembranca: Lembranca; operadorId: string;
}) {
  const linhas = posicoes.slice(3);
  if (!linhas.length) return null;
  const premiadas = ranking.posicoes_premiadas;
  const maior = Math.max(0, metrica(ranking.criterio, posicoes[0]));
  const blocos: ReactNode[] = [];
  linhas.forEach(p => {
    if (p.posicao === premiadas + 1 && premiadas >= 3) {
      blocos.push(
        <li key="zona" className="rq-zona" aria-label={`Prêmio até o ${premiadas}º lugar`}>
          <span>Prêmio até o {premiadas}º · daqui para baixo, quanto falta para passar quem está acima</span>
        </li>,
      );
    }
    const acima = posicoes[p.posicao - 2];
    blocos.push(
      <LinhaRanking
        key={p.operador_id}
        p={p}
        criterio={ranking.criterio}
        fracao={maior > 0 ? metrica(ranking.criterio, p) / maior : 0}
        eu={p.operador_id === operadorId}
        lembranca={lembranca}
        falta={!temPremio(p) && !p.abaixo_minimo && acima ? { valor: faltaParaPassar(ranking.criterio, acima, p), posicao: acima.posicao } : undefined}
        minimo={ranking.minimo_quitacoes}
      />,
    );
  });
  return (
    <div className="space-y-2">
      {premiadas < 3 && premiadas > 0 && (
        <p className="px-1 text-xs text-muted-foreground">Prêmio até o {premiadas}º lugar.</p>
      )}
      <ol className="rq-lista overflow-hidden">{blocos}</ol>
      {ranking.minimo_quitacoes > 0 && premiadas > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          Para levar o prêmio da posição é preciso ter pelo menos {quitacoesTexto(ranking.minimo_quitacoes)} no mês.
        </p>
      )}
    </div>
  );
}

function LinhaRanking({ p, criterio, fracao, eu, lembranca, falta, minimo }: {
  p: PosicaoRanking;
  criterio: Criterio;
  fracao: number;
  eu: boolean;
  lembranca: Lembranca;
  falta?: { valor: number; posicao: number };
  minimo: number;
}) {
  return (
    // Na lista o selo usa o destaque do tema: a cor de medalha é só do pódio.
    <li className={cn('flex items-center gap-3 px-4 py-3', eu && 'rq-eu')} style={{ '--medalha': 'var(--primary)' } as CSSProperties}>
      <span className="flex w-7 shrink-0 flex-col items-center">
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">{p.posicao}º</span>
        <Variacao lembranca={lembranca} p={p} />
      </span>
      <AvatarParticipante nome={p.nome} fotoUrl={p.foto_url} className="h-10 w-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
            <span className="truncate">{p.nome}</span>
            {eu && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary">você</span>}
          </p>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {criterio === 'quantidade' ? quitacoesTexto(p.quitacoes) : formatBRL(p.valor)}
          </p>
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          {/* A mesma régua do pódio: a fração do 1º. */}
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="rq-barra h-full rounded-full" style={{ width: `${Math.max(2, fracao * 100)}%` }} />
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {criterio === 'quantidade' ? formatBRL(p.valor) : quitacoesTexto(p.quitacoes)}
          </span>
        </div>
      </div>
      {temPremio(p) && <Premio premio={p.premio} texto={p.premio_texto} className="shrink-0" />}
      {p.abaixo_minimo && <AbaixoDoMinimo minimo={minimo} />}
      {falta && <Falta criterio={criterio} valor={falta.valor} posicao={falta.posicao} />}
    </li>
  );
}

/**
 * Quem está olhando e ficou fora da lista: onde está e quanto falta. Por
 * equipe, só na disputa da própria equipe — olhando outra, a posição dele não
 * é daquela lista.
 */
function MinhaPosicao({ ranking, disputa, posicoesNaTela }: { ranking: RankingQuitacao; disputa: DisputaRanking | null; posicoesNaTela: number }) {
  const eu = ranking.eu;
  if (!eu || eu.posicao <= posicoesNaTela) return null;
  if (ranking.disputa === 'equipe' && eu.equipe_id !== (disputa?.equipe_id ?? null)) return null;
  const total = disputa?.participantes ?? ranking.participantes;
  const falta = eu.acima ? faltaParaPassar(ranking.criterio, eu.acima, eu) : null;
  const fracao = eu.acima ? Math.min(1, metrica(ranking.criterio, eu) / Math.max(1e-9, metrica(ranking.criterio, eu.acima))) : 1;
  return (
    <div className="rq-lista rq-eu space-y-2 px-4 py-3">
      <p className="text-sm text-muted-foreground">
        Você está em <span className="font-semibold text-foreground">{eu.posicao}º</span> de {total},
        com {formatBRL(eu.valor)} em {quitacoesTexto(eu.quitacoes)}.
        {eu.acima && falta != null && (
          <> Faltam <span className="font-semibold text-foreground">{ranking.criterio === 'quantidade' ? quitacoesTexto(falta) : formatBRL(falta)}</span> para
            passar {eu.acima.nome ? `${eu.acima.nome} (${eu.acima.posicao}º)` : `o ${eu.acima.posicao}º`}.</>
        )}
      </p>
      {eu.acima && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="rq-barra h-full rounded-full" style={{ width: `${Math.max(3, fracao * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

/** As equipes do setor, somando todo mundo: a disputa entre elas. */
function PlacarDeEquipes({ ranking }: { ranking: RankingQuitacao }) {
  const maior = Math.max(0, ...ranking.equipes.map(e => metrica(ranking.criterio, e)));
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> Equipes do setor
      </p>
      <ol className="rq-lista overflow-hidden">
        {ranking.equipes.map((e, i) => (
          <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">{i + 1}º</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-medium text-foreground">{e.nome}</p>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {ranking.criterio === 'quantidade' ? quitacoesTexto(e.quitacoes) : formatBRL(e.valor)}
                </p>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="rq-barra h-full rounded-full" style={{ width: `${maior > 0 ? Math.max(2, (metrica(ranking.criterio, e) / maior) * 100) : 0}%` }} />
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {ranking.criterio === 'quantidade' ? formatBRL(e.valor) : quitacoesTexto(e.quitacoes)} · {e.pessoas} {e.pessoas === 1 ? 'pessoa' : 'pessoas'}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Quanto falta para passar quem está acima, no lugar do prêmio. */
function Falta({ criterio, valor, posicao }: { criterio: Criterio; valor: number; posicao: number }) {
  const texto = criterio === 'quantidade' ? quitacoesTexto(valor) : formatBRL(valor);
  return (
    <span className="rq-premio rq-falta shrink-0" aria-label={`Faltam ${texto} para passar o ${posicao}º`}>
      <span className="rq-premio-rotulo">Falta p/ {posicao}º</span>
      <span className="rq-premio-valor text-sm">{texto}</span>
    </span>
  );
}

function AbaixoDoMinimo({ minimo }: { minimo?: number }) {
  return (
    <span className="rq-premio rq-falta shrink-0" title={minimo ? `Prêmio a partir de ${quitacoesTexto(minimo)}` : undefined}>
      <span className="rq-premio-rotulo">Sem prêmio</span>
      <span className="rq-premio-valor text-xs">abaixo do mínimo</span>
    </span>
  );
}

function ValorDoPremio({ premio, texto, grande = false }: { premio: number | null; texto: string | null; grande?: boolean }) {
  return (
    <>
      {premio != null && (
        <span className={cn('rq-premio-valor', grande ? 'text-lg sm:text-xl' : 'text-sm sm:text-base')}>{reaisRedondos(premio)}</span>
      )}
      {texto && (
        <span className={cn('rq-premio-brinde', premio == null && 'rq-premio-brinde-so')} title={texto}>
          {premio != null ? `+ ${texto}` : texto}
        </span>
      )}
    </>
  );
}

/** O selo do prêmio (`ranking.css`): valor e/ou brinde. A cor vem de `--medalha`. */
function Premio({ premio, texto, grande = false, className }: { premio: number | null; texto: string | null; grande?: boolean; className?: string }) {
  const fala = [premio != null ? reaisRedondos(premio) : '', texto ?? ''].filter(Boolean).join(' + ');
  return (
    <span className={cn('rq-premio', className)} aria-label={`Prêmio: ${fala}`}>
      <span className="rq-premio-rotulo">Prêmio</span>
      <ValorDoPremio premio={premio} texto={texto} grande={grande} />
    </span>
  );
}
