/**
 * PainelVotacoes — as votações gravadas no banco (09/11/2026), em
 * Configurações › Votação da Liderança, acima do rascunho.
 *
 *   aberta     quantos já votaram e quem falta (nunca em quem), Encerrar
 *   encerrada  Apurar e liberar → `ApuracaoDiretoria` (empates e liberação)
 *   liberada   Ver resultado (a mesma revelação dos líderes)
 *
 * Cancelar existe até liberar. Lê só quando a tela abre e no «Atualizar»:
 * nada de pergunta periódica ao banco.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Ban, CheckCircle2, ChevronDown, Loader2, Lock, RefreshCw, Scale, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  cancelarVotacao, encerrarVotacao, faltaMigration, lerApuracao, lerResultado, listarVotacoes, mensagemDoErro,
  montarDoRetrato, resultadosDoRetrato, type ApuracaoDaVotacao, type RetratoDaVotacao, type VotacaoNaLista,
} from './banco';
import { NOME_DO_PRODUTO } from './participantes';
import { ehProduto } from '@/lib/produto';

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
  const [andamento, setAndamento] = useState<Record<string, ApuracaoDaVotacao>>({});
  const [apurando, setApurando] = useState<VotacaoNaLista | null>(null);
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

  const atuais = useMemo(() => (lista ?? []).filter(v => v.estado === 'aberta' || v.estado === 'encerrada'), [lista]);
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

  const acao = async (v: VotacaoNaLista, tipo: 'encerrar' | 'cancelar') => {
    const pergunta = tipo === 'encerrar'
      ? `Encerrar «${v.titulo}»? ${v.votaram} de ${v.participantes} votaram. Depois de encerrada ninguém mais vota, e vem a apuração.`
      : `Cancelar «${v.titulo}»? Ninguém mais vota e o resultado não sai. Não dá para desfazer.`;
    if (!window.confirm(pergunta)) return;
    setOcupado(v.id);
    try {
      await (tipo === 'encerrar' ? encerrarVotacao(v.id) : cancelarVotacao(v.id));
      toast.success(tipo === 'encerrar' ? 'Votação encerrada' : 'Votação cancelada');
      await carregar();
    } catch (e) {
      toast.error('Não deu certo', { description: mensagemDoErro(e) });
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
    return { cedula, pessoas, resultados: resultadosDoRetrato(vendo.retrato, cedula) };
  }, [vendo]);

  const linha = (v: VotacaoNaLista) => {
    const pct = v.participantes ? Math.floor((v.votaram / v.participantes) * 100) : 0;
    const quem = andamento[v.id];
    const votou = new Set((quem?.envios ?? []).map(e => e.eleitor_id));
    const faltam = (quem?.participantes ?? []).filter(p => !votou.has(p.id));
    const travado = ocupado === v.id;
    return (
      <li key={v.id} className="space-y-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{v.titulo}</p>
            <p className="text-[11px] text-muted-foreground">
              {ehProduto(v.produto) ? NOME_DO_PRODUTO[v.produto] : v.produto} · {v.perguntas} perguntas
              {v.aberta_em ? ` · aberta ${dataHora(v.aberta_em)}` : ''}
              {v.encerrada_em ? ` · encerrada ${dataHora(v.encerrada_em)}` : ''}
              {v.liberada_em ? ` · liberada ${dataHora(v.liberada_em)}` : ''}
            </p>
          </div>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', COR[v.estado])}>{ROTULO[v.estado]}</span>
        </div>

        {v.estado !== 'cancelada' && (
          <div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">Votaram</span>
              <span className="font-semibold tabular-nums">{v.votaram} de {v.participantes}</span>
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
          {(v.estado === 'aberta' || v.estado === 'encerrada') && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => void verQuemVotou(v.id)}>
              <Users className="h-3.5 w-3.5" /> {quem ? 'Esconder quem votou' : 'Quem já votou'}
            </Button>
          )}
          {v.estado === 'aberta' && (
            <Button size="sm" className="h-7 gap-1 text-xs" disabled={travado} onClick={() => void acao(v, 'encerrar')}>
              <Lock className="h-3.5 w-3.5" /> Encerrar votação
            </Button>
          )}
          {v.estado === 'encerrada' && (
            <Button size="sm" className="h-7 gap-1 text-xs" disabled={travado} onClick={() => setApurando(v)}>
              <Scale className="h-3.5 w-3.5" /> Apurar e liberar o resultado
            </Button>
          )}
          {v.estado === 'liberada' && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={travado} onClick={() => void verResultado(v)}>
              <Trophy className="h-3.5 w-3.5" /> Ver resultado
            </Button>
          )}
          {(v.estado === 'aberta' || v.estado === 'encerrada' || v.estado === 'rascunho') && (
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
        {apurando && (
          <ApuracaoDiretoria votacaoId={apurando.id} titulo={apurando.titulo}
            onFechar={() => setApurando(null)}
            onLiberado={() => { setApurando(null); void carregar(); }} />
        )}
        {vendo && resultado && (
          <TelaResultado titulo={vendo.titulo} cedula={resultado.cedula} resultados={resultado.resultados} pessoas={resultado.pessoas}
            onFechar={() => setVendo(null)} />
        )}
      </Suspense>
    </section>
  );
}
