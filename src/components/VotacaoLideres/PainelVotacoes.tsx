/**
 * PainelVotacoes — as votações gravadas no banco (09/11/2026), em
 * Configurações › Votação da Liderança, acima do rascunho.
 *
 *   (todas)    Acompanhar → `AcompanhamentoVotacao` (por setor, quem falta, parcial)
 *   aberta     quantos já votaram e quem falta (nunca em quem), Encerrar
 *   encerrada  Apurar e liberar → `ApuracaoDiretoria` (empates e liberação)
 *   liberada   Ver resultado (a mesma revelação dos líderes)
 *
 * Desde 12/11/2026 (migration 20261112160000): a votação dos GERENTES aparece
 * aqui também (etiqueta «Gerentes», «votaram X de N» conta os eleitores), e a
 * encerrada pode ser GUARDADA sem liberar — vai para «Guardadas», some do
 * card da diretoria, e «Tirar da gaveta» devolve como estava — ou REABERTA
 * para quem faltou votar.
 *
 * Cancelar existe até liberar. Lê só quando a tela abre e no «Atualizar»:
 * nada de pergunta periódica ao banco.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Ban, BarChart3, CheckCircle2, ChevronDown, FileSpreadsheet, Loader2, Lock, RefreshCw, RotateCcw, Scale, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  cancelarVotacao, encerrarVotacao, faltaMigration, guardarVotacao, lerApuracao, lerResultado, listarVotacoes, mensagemDoErro,
  montarDoRetrato, reabrirVotacao, regrasDoRetrato, resultadosDoRetrato, tirarDaGaveta,
  type ApuracaoDaVotacao, type RetratoDaVotacao, type VotacaoNaLista,
} from './banco';
import { textosDo } from './textos';
import { NOME_DO_PRODUTO } from './participantes';
import { baixarCampeoes } from './baixarCampeoes';
import { ehProduto } from '@/lib/produto';

const AcompanhamentoVotacao = lazy(() => import('./AcompanhamentoVotacao').then(m => ({ default: m.AcompanhamentoVotacao })));
const ApuracaoDiretoria = lazy(() => import('./ApuracaoDiretoria').then(m => ({ default: m.ApuracaoDiretoria })));
const TelaResultado = lazy(() => import('./TelaResultado').then(m => ({ default: m.TelaResultado })));

const ROTULO: Record<VotacaoNaLista['estado'], string> = {
  rascunho: 'Rascunho', aberta: 'Aberta', encerrada: 'Encerrada · falta liberar', liberada: 'Resultado liberado', cancelada: 'Cancelada',
};
const COR: Record<VotacaoNaLista['estado'], string> = {
  rascunho: 'bg-muted text-muted-foreground',
  aberta: 'bg-primary/15 text-primary',
  encerrada: 'bg-warning/15 text-warning',
  liberada: 'bg-success/15 text-success',
  cancelada: 'bg-muted text-muted-foreground line-through',
};
const dataHora = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '');

interface Props {
  /** Muda quando o rascunho foi liberado: a lista lê de novo. */
  versao: number;
}

export function PainelVotacoes({ versao }: Props) {
  const [lista, setLista] = useState<VotacaoNaLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [mostrarAntigas, setMostrarAntigas] = useState(false);
  const [mostrarGuardadas, setMostrarGuardadas] = useState(true);
  const [andamento, setAndamento] = useState<Record<string, ApuracaoDaVotacao>>({});
  const [apurando, setApurando] = useState<VotacaoNaLista | null>(null);
  const [acompanhando, setAcompanhando] = useState<VotacaoNaLista | null>(null);
  const [vendo, setVendo] = useState<{ titulo: string; retrato: RetratoDaVotacao } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLendo(true);
    setAndamento({});
    try {
      setLista(await listarVotacoes());
      setErro(null);
    } catch (e) {
      setErro(faltaMigration(e) ? 'O banco ainda não tem a votação (migration 20261104230000).' : mensagemDoErro(e));
    } finally {
      setLendo(false);
    }
  }, []);
  useEffect(() => { void carregar(); }, [carregar, versao]);

  const atuais = useMemo(() => (lista ?? []).filter(v => (v.estado === 'aberta' || v.estado === 'encerrada') && !v.guardada_em), [lista]);
  const guardadas = useMemo(() => (lista ?? []).filter(v => v.estado === 'encerrada' && !!v.guardada_em), [lista]);
  const antigas = useMemo(() => (lista ?? []).filter(v => v.estado !== 'aberta' && v.estado !== 'encerrada'), [lista]);

  const verQuemVotou = async (id: string) => {
    if (andamento[id]) { setAndamento(({ [id]: _, ...resto }) => resto); return; }
    try {
      const r = await lerApuracao(id);
      setAndamento(a => ({ ...a, [id]: r }));
    } catch (e) {
      toast.error('Não deu para ver o andamento', { description: mensagemDoErro(e) });
    }
  };

  type Acao = 'encerrar' | 'cancelar' | 'guardar' | 'desguardar' | 'reabrir';
  const acao = async (v: VotacaoNaLista, tipo: Acao) => {
    const eleitores = v.eleitores ?? v.participantes;
    const pergunta: Record<Acao, string> = {
      encerrar: `Encerrar «${v.titulo}»? ${v.votaram} de ${eleitores} votaram. Depois de encerrada ninguém mais vota, e vem a apuração.`,
      cancelar: `Cancelar «${v.titulo}»? Ninguém mais vota e o resultado não sai. Não dá para desfazer.`,
      guardar: `Guardar «${v.titulo}» sem liberar o resultado? Ninguém vê o resultado, a diretoria para de receber o aviso de apurar, e tudo fica gravado (votos, decisões, horários). Dá para tirar da gaveta quando quiser.`,
      desguardar: `Tirar «${v.titulo}» da gaveta? Ela volta a ficar encerrada como estava: dá para apurar, decidir, liberar ou reabrir. A diretoria volta a ver o aviso de apurar.`,
      reabrir: `Reabrir «${v.titulo}» para votar? Quem ainda não votou (${eleitores - v.votaram}) volta a ver o card «Votar agora». Os votos e decisões já gravados continuam.`,
    };
    const feito: Record<Acao, string> = {
      encerrar: 'Votação encerrada', cancelar: 'Votação cancelada', guardar: 'Votação guardada, sem liberar',
      desguardar: 'Votação de volta: encerrada', reabrir: 'Votação reaberta',
    };
    if (!window.confirm(pergunta[tipo])) return;
    setOcupado(v.id);
    try {
      await ({ encerrar: encerrarVotacao, cancelar: cancelarVotacao, guardar: guardarVotacao, desguardar: tirarDaGaveta, reabrir: reabrirVotacao }[tipo])(v.id);
      toast.success(feito[tipo]);
      await carregar();
    } catch (e) {
      toast.error('Não deu certo', {
        description: faltaMigration(e) || /Ação desconhecida/i.test(mensagemDoErro(e))
          ? 'O banco ainda não tem guardar/reabrir (migration 20261112160000).'
          : mensagemDoErro(e),
      });
    } finally {
      setOcupado(null);
    }
  };

  /** Excel dos campeões (11/11/2026): lê a apuração e baixa. */
  const baixarExcel = async (v: VotacaoNaLista) => {
    setOcupado(v.id);
    try {
      await baixarCampeoes(await lerApuracao(v.id));
    } catch (e) {
      toast.error('Não deu para montar o Excel', { description: mensagemDoErro(e) });
    } finally {
      setOcupado(null);
    }
  };

  const verResultado = async (v: VotacaoNaLista) => {
    setOcupado(v.id);
    try {
      setVendo({ titulo: v.titulo, retrato: await lerResultado(v.id) });
    } catch (e) {
      toast.error('Não deu para abrir o resultado', { description: mensagemDoErro(e) });
    } finally {
      setOcupado(null);
    }
  };

  const resultado = useMemo(() => {
    if (!vendo) return null;
    const { cedula, pessoas } = montarDoRetrato(vendo.retrato);
    return { cedula, pessoas, resultados: resultadosDoRetrato(vendo.retrato, cedula), tipo: regrasDoRetrato(vendo.retrato).tipo };
  }, [vendo]);

  const linha = (v: VotacaoNaLista) => {
    const eleitores = v.eleitores ?? v.participantes;
    const pct = eleitores ? Math.floor((v.votaram / eleitores) * 100) : 0;
    const guardada = !!v.guardada_em;
    const gerentes = v.tipo === 'gerentes';
    const quem = andamento[v.id];
    const votou = new Set((quem?.envios ?? []).map(e => e.eleitor_id));
    const faltam = (quem?.participantes ?? []).filter(p => !votou.has(p.id));
    const travado = ocupado === v.id;
    return (
      <li key={v.id} className="space-y-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
              <span className="truncate">{v.titulo}</span>
              <span className={cn('shrink-0 rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide',
                gerentes ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                {gerentes ? 'Gerentes' : 'Liderança'}
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              {ehProduto(v.produto) ? NOME_DO_PRODUTO[v.produto] : v.produto} · {v.perguntas} perguntas
              {gerentes ? ` · ${v.participantes} ${textosDo('gerentes').pessoas}` : ''}
              {v.aberta_em ? ` · aberta ${dataHora(v.aberta_em)}` : ''}
              {v.encerrada_em ? ` · encerrada ${dataHora(v.encerrada_em)}` : ''}
              {v.liberada_em ? ` · liberada ${dataHora(v.liberada_em)}` : ''}
              {v.guardada_em ? ` · guardada ${dataHora(v.guardada_em)}` : ''}
            </p>
          </div>
          {guardada
            ? <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Guardada · sem liberar</span>
            : <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', COR[v.estado])}>{ROTULO[v.estado]}</span>}
        </div>

        {v.estado !== 'cancelada' && (
          <div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">Votaram</span>
              <span className="font-semibold tabular-nums">{v.votaram} de {eleitores}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {quem && (
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <p className="mb-1 font-semibold text-success">Já votaram ({quem.envios?.length ?? 0})</p>
              <p className="text-muted-foreground">{(quem.envios ?? []).map(e => e.nome ?? '—').join(', ') || 'Ninguém ainda.'}</p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-warning">Faltam ({faltam.length})</p>
              <p className="text-muted-foreground">{faltam.map(p => p.nome).join(', ') || 'Ninguém: todos votaram.'}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {(v.estado === 'aberta' || v.estado === 'encerrada' || v.estado === 'liberada') && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setAcompanhando(v)}>
              <BarChart3 className="h-3.5 w-3.5" /> Acompanhar
            </Button>
          )}
          {(v.estado === 'aberta' || v.estado === 'encerrada') && !guardada && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => void verQuemVotou(v.id)}>
              <Users className="h-3.5 w-3.5" /> {quem ? 'Esconder quem votou' : 'Quem já votou'}
            </Button>
          )}
          {v.estado === 'aberta' && (
            <Button size="sm" className="h-7 gap-1 text-xs" disabled={travado} onClick={() => void acao(v, 'encerrar')}>
              <Lock className="h-3.5 w-3.5" /> Encerrar votação
            </Button>
          )}
          {v.estado === 'encerrada' && !guardada && (
            <Button size="sm" className="h-7 gap-1 text-xs" disabled={travado} onClick={() => setApurando(v)}>
              <Scale className="h-3.5 w-3.5" /> Apurar e liberar o resultado
            </Button>
          )}
          {v.estado === 'encerrada' && guardada && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={travado} onClick={() => setApurando(v)}>
              <Scale className="h-3.5 w-3.5" /> Ver a apuração
            </Button>
          )}
          {v.estado === 'encerrada' && !guardada && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={travado} onClick={() => void acao(v, 'guardar')}
              title="Guarda sem liberar o resultado: some dos avisos, tudo fica gravado">
              <Archive className="h-3.5 w-3.5" /> Guardar sem liberar
            </Button>
          )}
          {v.estado === 'encerrada' && !guardada && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={travado} onClick={() => void acao(v, 'reabrir')}
              title="Volta a aceitar votos de quem ainda não votou">
              <RotateCcw className="h-3.5 w-3.5" /> Reabrir para votar
            </Button>
          )}
          {guardada && (
            <Button size="sm" className="h-7 gap-1 text-xs" disabled={travado} onClick={() => void acao(v, 'desguardar')}>
              <ArchiveRestore className="h-3.5 w-3.5" /> Tirar da gaveta
            </Button>
          )}
          {v.estado === 'liberada' && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={travado} onClick={() => void verResultado(v)}>
              <Trophy className="h-3.5 w-3.5" /> Ver resultado
            </Button>
          )}
          {(v.estado === 'encerrada' || v.estado === 'liberada') && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={travado} onClick={() => void baixarExcel(v)}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel dos campeões
            </Button>
          )}
          {(v.estado === 'aberta' || v.estado === 'encerrada' || v.estado === 'rascunho') && !guardada && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" disabled={travado}
              onClick={() => void acao(v, 'cancelar')}>
              <Ban className="h-3.5 w-3.5" /> Cancelar
            </Button>
          )}
        </div>
      </li>
    );
  };

  return (
    <section className="space-y-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3" aria-label="Votações valendo">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-primary" /> Votações valendo</h3>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={lendo} onClick={() => void carregar()}>
          <RefreshCw className={cn('h-3.5 w-3.5', lendo && 'animate-spin')} /> Atualizar
        </Button>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      {!lista && !erro && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo…</p>}
      {lista && atuais.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhuma votação aberta agora. Monte abaixo e use «Liberar para os líderes».</p>
      )}
      {atuais.length > 0 && <ul className="space-y-2">{atuais.map(linha)}</ul>}
      {guardadas.length > 0 && (
        <div>
          <button type="button" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            onClick={() => setMostrarGuardadas(m => !m)} aria-expanded={mostrarGuardadas}>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', mostrarGuardadas && 'rotate-180')} />
            <Archive className="h-3.5 w-3.5" /> Guardadas sem liberar ({guardadas.length})
          </button>
          {mostrarGuardadas && (
            <>
              <p className="mt-1 text-[11px] text-muted-foreground">
                O resultado não sai e ninguém recebe aviso. Votos, decisões da diretoria e horários continuam gravados. «Tirar da gaveta» volta como estava.
              </p>
              <ul className="mt-2 space-y-2">{guardadas.map(linha)}</ul>
            </>
          )}
        </div>
      )}
      {antigas.length > 0 && (
        <div>
          <button type="button" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            onClick={() => setMostrarAntigas(m => !m)} aria-expanded={mostrarAntigas}>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', mostrarAntigas && 'rotate-180')} />
            Anteriores ({antigas.length})
          </button>
          {mostrarAntigas && <ul className="mt-2 space-y-2">{antigas.map(linha)}</ul>}
        </div>
      )}

      <Suspense fallback={null}>
        {acompanhando && (
          <AcompanhamentoVotacao votacaoId={acompanhando.id} titulo={acompanhando.titulo} estado={acompanhando.estado}
            onFechar={() => { setAcompanhando(null); void carregar(); }} />
        )}
        {apurando && (
          <ApuracaoDiretoria votacaoId={apurando.id} titulo={apurando.titulo}
            onFechar={() => setApurando(null)}
            onLiberado={() => { setApurando(null); void carregar(); }} />
        )}
        {vendo && resultado && (
          <TelaResultado titulo={vendo.titulo} cedula={resultado.cedula} resultados={resultado.resultados} pessoas={resultado.pessoas}
            tipo={resultado.tipo} onFechar={() => setVendo(null)} />
        )}
      </Suspense>
    </section>
  );
}
