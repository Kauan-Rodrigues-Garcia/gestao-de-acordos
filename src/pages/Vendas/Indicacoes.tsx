/**
 * Indicações — o mês de quem prospecta, o cadastro, o ranking e a lista.
 *
 * ## A página abre pelo mês, não pelo formulário (01/10/2026)
 *
 * Até aqui a aba abria com duas caixas de cadastro empilhadas, e o que a
 * pessoa quer saber primeiro — quanto já indiquei, como estou — ficava lá
 * embaixo. Agora o topo diz isso numa frase e em quatro números; o cadastro
 * vem logo abaixo, em um bloco só (`NovaIndicacao`, com as abas Digitar e
 * Colar); o ranking fica ao lado; a lista do mês vira cartões com busca.
 *
 * ## Duas visões
 *
 * Quem enxerga a equipe ou o setor vê o ranking. Quem enxerga só as próprias
 * — ou escolheu «só as minhas» — vê `MeuMes`: sequência de dias, melhor dia,
 * o mês anterior e as últimas indicações. O ranking dessa pessoa teria um
 * nome só (`fn_indicacoes_ranking` é INVOKER e devolve o recorte da RLS), e um
 * pódio de um lugar não diz nada.
 *
 * ## Corrigir e cadastrar por outro são a mesma chave
 *
 * `editar_indicacoes` libera as duas coisas: o seletor «em nome de» no rodapé
 * do cadastro e o lápis em cada telefone. O erro mais provável de quem
 * cadastra pelo operador é escolher a pessoa errada — por isso a correção
 * deixa trocar QUEM indicou, e não só o texto.
 *
 * ## O gráfico é de CSS, e é de propósito
 *
 * Barra por dia não precisa de biblioteca, e as variáveis de cor deste projeto
 * são `oklch` — `hsl(var(--x))` apaga o gráfico sem erro nenhum, defeito que já
 * custou caro aqui. Sem biblioteca não há como cair nessa.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Handshake, Info, Building2, CalendarHeart, Medal, Flame, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { KpiTile } from '@/components/KpiTile';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { deslocarMes, rotuloDoMes } from '@/lib/mesReferencia';
import { getTodayISO } from '@/lib/index';
import { supabase } from '@/lib/supabase';
import { niveisLiberados, type NivelEscopo } from '@/lib/permissoes-escopo';
import { cn } from '@/lib/utils';
import {
  porDiaDasIndicacoes, posicaoNoRanking, resumoDoMes,
} from '@/lib/indicacoesResumo';
import {
  buscarIndicacoes, buscarRanking, excluirIndicacao, corrigirIndicacao, buscarQuemPodeIndicar,
  type Indicacao, type LinhaRanking, type PessoaQueIndica,
} from '@/services/vendas/indicacoes.service';
import { NovaIndicacao } from './indicacoes/NovaIndicacao';
import { MeuMes, RankingIndicacoes, RitmoDoMes } from './indicacoes/PainelLateral';
import { ListaIndicacoes } from './indicacoes/ListaIndicacoes';

/** Primeiro e último dia do mês `yyyy-MM`, como o banco os espera. */
function limitesDoMes(mes: string): { de: string; ate: string } {
  const [ano, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

/** O que o diálogo de correção edita. Texto vazio vira nulo ao gravar. */
interface Correcao {
  id: string;
  operadorId: string;
  instituicao: string;
  gestora: string;
  telefone: string;
  dataIndicacao: string;
  observacao: string;
}

function textoOuNulo(v: string): string | null {
  return v.trim() === '' ? null : v;
}

const ROTULO_DO_NIVEL: Record<NivelEscopo, string> = {
  individual:    'Só as minhas',
  equipe:        'Minha equipe',
  setor:         'Meu setor',
  todos_setores: 'Todos',
};

/** «Bom dia» pela hora de São Paulo — a página é aberta o dia todo. */
function saudacao(): string {
  const hora = Number(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false,
  }).format(new Date()));
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export default function Indicacoes() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();

  const empresaId = empresa?.id ?? null;
  const podeCriar = temPermissao('criar_indicacoes');
  const podeExcluir = temPermissao('excluir_indicacoes');
  // Corrigir E cadastrar em nome de outra pessoa. O banco confere de novo.
  const podeEditar = temPermissao('editar_indicacoes');
  const hoje = useMemo(getTodayISO, []);

  const [itens, setItens] = useState<Indicacao[]>([]);
  const [anteriores, setAnteriores] = useState<Indicacao[] | null>(null);
  const [ranking, setRanking] = useState<LinhaRanking[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(false);

  const [quemPodeIndicar, setQuemPodeIndicar] = useState<PessoaQueIndica[]>([]);
  const [correcao, setCorrecao] = useState<Correcao | null>(null);
  const [corrigindo, setCorrigindo] = useState(false);
  const [excluindo, setExcluindo] = useState<Indicacao | null>(null);

  const { de, ate } = useMemo(() => limitesDoMes(mes), [mes]);
  const mesAnterior = useMemo(() => deslocarMes(mes, -1), [mes]);

  /*
   * O filtro de alcance.
   *
   * A RLS já corta o TETO — ninguém vê além do que o cargo alcança. O que este
   * filtro faz é ESTREITAR dentro disso: o líder que enxerga o setor inteiro
   * também precisa poder olhar só a própria equipe.
   *
   * ⚠️ Estreitar aqui NÃO é segurança: o teto é o do banco. Se o cliente
   * escolhesse «todos» sem ter o nível, a lista continuaria vindo recortada.
   */
  const niveis = useMemo(
    () => niveisLiberados('indicacoes', temPermissao),
    [temPermissao],
  );
  const maisAmplo = niveis.length > 0 ? niveis[niveis.length - 1] : null;
  const [nivel, setNivel] = useState<NivelEscopo | null>(null);
  const alcance = nivel ?? maisAmplo;
  const visaoIndividual = alcance === 'individual' || alcance === null;

  /*
   * As equipes que contam como «minha»: a do cadastro e as que a pessoa LIDERA.
   * Mesma regra de `fn_vendas_equipe_que_credita`.
   */
  const [minhasEquipes, setMinhasEquipes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!perfil?.id) return;
    let vivo = true;
    void (async () => {
      const { data } = await supabase
        .from('equipe_lideres').select('equipe_id').eq('lider_id', perfil.id);
      if (!vivo) return;
      const ids = (data ?? []).map(l => String(l.equipe_id));
      if (perfil.equipe_id) ids.push(String(perfil.equipe_id));
      setMinhasEquipes(new Set(ids));
    })();
    return () => { vivo = false; };
  }, [perfil?.id, perfil?.equipe_id]);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    const [lista, rk] = await Promise.all([
      buscarIndicacoes({ empresaId, de, ate }),
      buscarRanking({ empresaId, de, ate }),
    ]);
    setCarregando(false);

    setDisponivel(lista.disponivel);
    if (!lista.disponivel) { setItens([]); setRanking([]); return; }

    setItens(lista.itens);
    setRanking(rk.dado ?? []);
  }, [empresaId, de, ate]);

  useEffect(() => { void carregar(); }, [carregar]);

  // O mês anterior, para o «contra setembro». Só a lista — pequena, e já
  // recortada pela RLS do mesmo jeito.
  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    setAnteriores(null);
    const lim = limitesDoMes(mesAnterior);
    void buscarIndicacoes({ empresaId, de: lim.de, ate: lim.ate }).then(r => {
      if (vivo) setAnteriores(r.disponivel ? r.itens : []);
    });
    return () => { vivo = false; };
  }, [empresaId, mesAnterior]);

  useEffect(() => {
    if (!podeEditar || !empresaId) return;
    let vivo = true;
    void buscarQuemPodeIndicar(empresaId).then(lista => { if (vivo) setQuemPodeIndicar(lista); });
    return () => { vivo = false; };
  }, [podeEditar, empresaId]);

  /*
   * `setor` e `todos_setores` não filtram nada aqui: a RLS já entregou
   * exatamente esse recorte.
   */
  const noAlcance = useCallback(
    (linha: { operador_id: string; equipe_id: string | null }) => {
      if (alcance === 'individual') return linha.operador_id === perfil?.id;
      if (alcance === 'equipe') return linha.equipe_id !== null && minhasEquipes.has(linha.equipe_id);
      return true;
    },
    [alcance, perfil?.id, minhasEquipes],
  );

  const itensVisiveis  = useMemo(() => itens.filter(noAlcance), [itens, noAlcance]);
  const rankingVisivel = useMemo(() => ranking.filter(noAlcance), [ranking, noAlcance]);
  const anterioresVisiveis = useMemo(
    () => (anteriores === null ? null : anteriores.filter(noAlcance)),
    [anteriores, noAlcance],
  );

  // Hoje só existe no mês corrente; num mês passado, o «hoje» do resumo é o
  // último dia dele — a sequência e a semana contam até ali.
  const referencia = hoje.slice(0, 7) === mes ? hoje : ate;
  const resumo = useMemo(() => resumoDoMes(itensVisiveis, referencia), [itensVisiveis, referencia]);
  const porDia = useMemo(() => porDiaDasIndicacoes(itensVisiveis), [itensVisiveis]);
  const minhaPosicao = posicaoNoRanking(rankingVisivel, perfil?.id);
  const meuTotal = rankingVisivel.find(r => r.operador_id === perfil?.id)?.quantidade ?? 0;
  // As últimas por CONTATO: três telefones da mesma escola são uma linha só,
  // com a contagem — repetir a escola três vezes parecia erro.
  const ultimas = useMemo(() => {
    const vistos = new Map<string, { item: Indicacao; telefones: number }>();
    for (const i of [...itensVisiveis].sort((a, b) => b.criado_em.localeCompare(a.criado_em))) {
      const chave = `${i.instituicao.toLowerCase().trim()}|${i.data_indicacao}`;
      const v = vistos.get(chave);
      if (v) v.telefones++;
      else if (vistos.size < 5) vistos.set(chave, { item: i, telefones: 1 });
    }
    return [...vistos.values()];
  }, [itensVisiveis]);

  const mesRotulo = rotuloDoMes(mes);
  const primeiroNome = (perfil?.nome ?? '').split(' ')[0];
  const ehMesAtual = hoje.slice(0, 7) === mes;

  /** A frase do topo: o mês da pessoa, ou o da equipe, numa linha. */
  const frase = (() => {
    if (visaoIndividual) {
      if (resumo.total === 0) {
        return ehMesAtual
          ? 'Nenhuma indicação neste mês ainda. Que tal começar pela primeira?'
          : `Nenhuma indicação em ${mesRotulo}.`;
      }
      const hojeTxt = ehMesAtual && resumo.hoje > 0 ? `, ${plural(resumo.hoje, 'hoje', 'hoje')}` : '';
      return `Você fez ${plural(resumo.total, 'indicação', 'indicações')} em ${mesRotulo}${hojeTxt}.`
        + (resumo.sequencia >= 2 ? ` São ${resumo.sequencia} dias úteis seguidos — segue assim!` : '');
    }
    const base = `${ROTULO_DO_NIVEL[alcance as NivelEscopo]}: ${plural(resumo.total, 'indicação', 'indicações')} em ${mesRotulo}.`;
    if (minhaPosicao) return `${base} Você está em ${minhaPosicao}º, com ${plural(meuTotal, 'indicação', 'indicações')}.`;
    return base;
  })();

  function abrirCorrecao(item: Indicacao) {
    setCorrecao({
      id: item.id,
      operadorId: item.operador_id,
      instituicao: item.instituicao,
      gestora: item.gestora ?? '',
      telefone: item.telefone ?? '',
      dataIndicacao: item.data_indicacao,
      observacao: item.observacao ?? '',
    });
  }

  async function gravarCorrecao() {
    if (!correcao) return;
    if (correcao.instituicao.trim() === '') { toast.error('A instituição não pode ficar vazia.'); return; }
    if (correcao.dataIndicacao === '') { toast.error('A data da indicação é obrigatória.'); return; }

    setCorrigindo(true);
    const r = await corrigirIndicacao({
      id: correcao.id,
      operadorId: correcao.operadorId,
      instituicao: correcao.instituicao,
      gestora: textoOuNulo(correcao.gestora),
      telefone: textoOuNulo(correcao.telefone),
      dataIndicacao: correcao.dataIndicacao,
      observacao: textoOuNulo(correcao.observacao),
    });
    setCorrigindo(false);

    // Nome que já é de outra linha volta com quem e quando — o diálogo fica
    // aberto para a pessoa ajustar, em vez de perder o que digitou.
    if (!r.ok) { toast.error(r.erro ?? 'Não deu para corrigir.', { duration: 9000 }); return; }
    toast.success('Indicação corrigida.');
    setCorrecao(null);
    void carregar();
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    const alvo = excluindo;
    const nome = alvo.telefone ? `${alvo.telefone} (${alvo.instituicao})` : alvo.instituicao;
    const r = await excluirIndicacao(alvo.id);
    setExcluindo(null);
    if (!r.ok) { toast.error(r.erro ?? 'Não deu para excluir.'); return; }
    toast.success(`«${nome}» saiu do ranking.`);
    void carregar();
  }

  if (!disponivel) {
    return (
      <div className="p-4 sm:p-6">
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p>A aba Indicações ainda não foi instalada neste banco.</p>
            <p className="mt-1">
              Falta aplicar a migration
              {' '}<code className="text-xs">20260915200000_vendas_fase7_indicacoes.sql</code>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      {/* ── Topo: quem, quando e como está o mês ───────────────────────── */}
      <header className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.09] via-primary/[0.03] to-transparent p-5 sm:p-6">
        <Handshake className="pointer-events-none absolute -right-4 -top-4 h-36 w-36 text-primary/[0.06]" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
              <Handshake className="h-3.5 w-3.5" aria-hidden /> Indicações
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
              {saudacao()}{primeiroNome ? `, ${primeiroNome}` : ''} 👋
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{frase}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SeletorMes mes={mes} onChange={setMes} />
            {/* Um nível só não é escolha — mostrar o botão sozinho seria enfeite. */}
            {niveis.length > 1 && (
              <div className="flex overflow-hidden rounded-xl border border-border bg-background/70 p-0.5">
                {niveis.map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNivel(n)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      alcance === n
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {ROTULO_DO_NIVEL[n]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile
            rotulo={visaoIndividual ? 'Minhas indicações' : 'Indicações'}
            valor={resumo.total} valorNumerico={resumo.total} formatar={v => String(Math.round(v))}
            sub={anterioresVisiveis !== null
              ? `${anterioresVisiveis.length} em ${rotuloDoMes(mesAnterior)}`
              : undefined}
            Icon={Handshake} tom="primario"
          />
          <KpiTile
            rotulo="Escolas" valor={resumo.escolas} valorNumerico={resumo.escolas} formatar={v => String(Math.round(v))}
            sub="contatos diferentes" Icon={Building2} tom="neutro"
          />
          <KpiTile
            rotulo={ehMesAtual ? 'Hoje' : 'Melhor dia'}
            valor={ehMesAtual ? resumo.hoje : (resumo.melhorDia?.quantidade ?? 0)}
            sub={ehMesAtual
              ? `${resumo.semana} nos últimos 7 dias`
              : resumo.melhorDia ? `em ${resumo.melhorDia.dia.slice(8, 10)}/${resumo.melhorDia.dia.slice(5, 7)}` : 'sem indicação'}
            Icon={CalendarHeart} tom={ehMesAtual && resumo.hoje > 0 ? 'sucesso' : 'neutro'}
          />
          {visaoIndividual ? (
            <KpiTile
              rotulo="Sequência"
              valor={resumo.sequencia > 0 ? plural(resumo.sequencia, 'dia', 'dias') : '—'}
              sub="dias úteis seguidos" Icon={Flame} tom={resumo.sequencia >= 3 ? 'alerta' : 'neutro'}
            />
          ) : minhaPosicao ? (
            <KpiTile
              rotulo="Sua posição" valor={`${minhaPosicao}º`}
              sub={`de ${rankingVisivel.length} pessoas`} Icon={Medal} tom="sucesso"
            />
          ) : (
            <KpiTile
              rotulo="Pessoas indicando" valor={rankingVisivel.length}
              sub="com ao menos uma no mês" Icon={Users} tom="neutro"
            />
          )}
        </div>
      </header>

      {/* ── Cadastro e coluna lateral ──────────────────────────────────── */}
      <div className={cn('grid items-start gap-5', podeCriar && 'lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]')}>
        {podeCriar && empresaId && perfil?.id && (
          <NovaIndicacao
            empresaId={empresaId}
            perfilId={perfil.id}
            hoje={hoje}
            podeEditar={podeEditar}
            quemPodeIndicar={quemPodeIndicar}
            onGravado={() => void carregar()}
          />
        )}
        <div className={cn('space-y-5', !podeCriar && 'grid gap-5 space-y-0 lg:grid-cols-2')}>
          {visaoIndividual ? (
            <MeuMes
              resumo={resumo}
              anterior={anterioresVisiveis === null ? null : anterioresVisiveis.length}
              mesRotulo={mesRotulo}
              mesAnteriorRotulo={rotuloDoMes(mesAnterior)}
              ultimas={ultimas}
            />
          ) : (
            <RankingIndicacoes
              ranking={rankingVisivel} perfilId={perfil?.id ?? null}
              carregando={carregando} mesRotulo={mesRotulo}
            />
          )}
          <RitmoDoMes porDia={porDia} hoje={referencia} semana={resumo.semana} />
        </div>
      </div>

      {/* ── A lista do mês ─────────────────────────────────────────────── */}
      <ListaIndicacoes
        itens={itensVisiveis}
        mesRotulo={mesRotulo}
        carregando={carregando}
        mostrarQuem={!visaoIndividual}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        onCorrigir={abrirCorrecao}
        onExcluir={setExcluindo}
      />

      {/* ── Corrigir ───────────────────────────────────────────────────── */}
      <Dialog open={correcao !== null} onOpenChange={o => { if (!o && !corrigindo) setCorrecao(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corrigir indicação</DialogTitle>
            <DialogDescription>
              O telefone é o que impede contar a mesma indicação duas vezes: se virar o
              número de outra já cadastrada, a correção é recusada. Sem telefone, a
              indicação é a própria escola — e ela não pode já ter outra linha.
            </DialogDescription>
          </DialogHeader>
          {correcao && (
            <div className="grid gap-2">
              <Input value={correcao.instituicao} placeholder="Instituição"
                     onChange={e => setCorrecao({ ...correcao, instituicao: e.target.value })} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={correcao.gestora} placeholder="Gestora"
                       onChange={e => setCorrecao({ ...correcao, gestora: e.target.value })} />
                <Input value={correcao.telefone} placeholder="Telefone"
                       onChange={e => setCorrecao({ ...correcao, telefone: e.target.value })} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input type="date" value={correcao.dataIndicacao}
                       onChange={e => setCorrecao({ ...correcao, dataIndicacao: e.target.value })} />
                {quemPodeIndicar.length > 0 && (
                  <Select value={correcao.operadorId}
                          onValueChange={v => setCorrecao({ ...correcao, operadorId: v })}>
                    <SelectTrigger aria-label="Quem indicou"><SelectValue placeholder="Quem indicou" /></SelectTrigger>
                    <SelectContent>
                      {/* Quem indicou pode ter saído da casa — continua na lista para a
                          correção não trocar a pessoa sem ninguém pedir. */}
                      {!quemPodeIndicar.some(p => p.id === correcao.operadorId) && (
                        <SelectItem value={correcao.operadorId}>
                          {itens.find(i => i.id === correcao.id)?.perfis?.nome ?? 'Quem indicou'}
                        </SelectItem>
                      )}
                      {quemPodeIndicar.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Textarea value={correcao.observacao} placeholder="Observação" rows={2}
                        onChange={e => setCorrecao({ ...correcao, observacao: e.target.value })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCorrecao(null)} disabled={corrigindo}>Cancelar</Button>
            <Button onClick={() => void gravarCorrecao()} disabled={corrigindo}>
              {corrigindo ? 'Gravando…' : 'Gravar correção'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Excluir: agora pergunta antes ──────────────────────────────── */}
      <Dialog open={excluindo !== null} onOpenChange={o => { if (!o) setExcluindo(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir indicação?</DialogTitle>
            <DialogDescription>
              {excluindo && (
                <>
                  {excluindo.telefone ? <>O telefone <strong>{excluindo.telefone}</strong> de </> : null}
                  <strong>{excluindo.instituicao}</strong> sai do ranking.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => void confirmarExclusao()}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
