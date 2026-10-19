/**
 * Os desafios do dia dentro da aba Desafios: a seção em destaque no topo do
 * catálogo, o card ao vivo e a tela do desafio.
 *
 * Ficam separados das campanhas de período porque são lidos de outro jeito: a
 * campanha é ranking; o desafio do dia é um número que diminui até zero.
 */
import { useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, Flag, Pencil, Rocket, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { usePlacarDoDia } from '@/hooks/useDesafioDoDia';
import { definirPrevia, estaEmPrevia, ouvirPrevias, previasDaBarra } from '@/lib/previaDesafioDoDia';
import { mudarStatusDesafio } from '@/services/desafios/desafios.service';
import { rotuloAlvo, rotuloJanela } from '@/services/desafios/desafioDoDia';
import type { Desafio, StatusDesafio } from '@/services/desafios/types';
import { AnelProgresso } from '@/components/DesafioDoDia/AnelProgresso';
import { PainelDesafioDoDia } from '@/components/DesafioDoDia/PainelDesafioDoDia';
import { valorDaMedida } from '@/components/DesafioDoDia/formato';
import { ESTILO_BATIDO, estiloDoDia } from '@/components/DesafioDoDia/estilo';
import { dataBR } from './tema';

const ROTULO_CARD = {
  rascunho: 'Rascunho', agendado: 'Agendado', valendo: 'Valendo agora',
  apurando: 'Apurando', encerrado: 'Encerrado',
} as const;

// ── O card ───────────────────────────────────────────────────────────────────

export function CardDesafioDoDia({ desafio, onAbrir }: { desafio: Desafio; onAbrir: (d: Desafio) => void }) {
  const diario = desafio.regra.diario!;
  const { andamento, situacao } = usePlacarDoDia(desafio);
  const bateu = !!andamento?.bateu;
  const estilo = bateu ? ESTILO_BATIDO : estiloDoDia(desafio.visual.acento);
  const porQtd = diario.medida === 'quantidade';

  return (
    <button
      type="button"
      onClick={() => onAbrir(desafio)}
      className={cn(
        'group flex w-full items-center gap-4 rounded-2xl border bg-gradient-to-br p-4 text-left transition-all',
        'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        estilo.hero, estilo.borda,
      )}
    >
      <AnelProgresso progresso={andamento?.progresso ?? 0} tamanho={68} espessura={7} cor={estilo.traco}>
        <span className="text-sm font-bold tabular-nums text-foreground">{Math.floor(andamento?.progresso ?? 0)}%</span>
      </AnelProgresso>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', estilo.suave, estilo.texto)}>
            {bateu ? 'Batido' : ROTULO_CARD[situacao]}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">{dataBR(desafio.dataInicio)} · {rotuloJanela(diario)}</span>
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-foreground">{desafio.nome}</p>
        <p className="truncate text-xs text-muted-foreground">
          {diario.alvoNome} · {rotuloAlvo(diario, formatBRL)}
        </p>
      </div>
      {andamento?.meta != null && (
        <div className="hidden shrink-0 text-right sm:block">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{bateu ? 'Entraram' : 'Faltam'}</p>
          <p className={cn('text-lg font-bold tabular-nums', estilo.texto)}>
            {valorDaMedida(bateu ? andamento.realizado : andamento.falta, porQtd)}
          </p>
        </div>
      )}
    </button>
  );
}

// ── A seção do catálogo ──────────────────────────────────────────────────────

export function SecaoDesafiosDoDia({
  desafios, hoje, podeCriar, onCriar, onAbrir,
}: {
  desafios: Desafio[];
  hoje: string;
  podeCriar: boolean;
  onCriar: () => void;
  onAbrir: (d: Desafio) => void;
}) {
  const deHoje = desafios.filter(d => d.dataInicio === hoje);
  const proximos = desafios.filter(d => d.dataInicio > hoje).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
  const anteriores = desafios.filter(d => d.dataInicio < hoje)
    .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio)).slice(0, 6);

  if (!podeCriar && !desafios.length) return null;

  return (
    <section className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-orange-500/5 to-card p-5">
        <motion.div
          aria-hidden="true"
          className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-amber-400/20 blur-2xl"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15">
              <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">Desafio do dia</h2>
              <p className="text-xs text-muted-foreground">
                Um alvo para hoje — o setor, uma equipe ou um operador. Aparece na barra superior de quem participa, com a contagem regressiva.
              </p>
            </div>
          </div>
          {podeCriar && (
            <Button onClick={onCriar} className="gap-1.5 bg-amber-500 text-white shadow-sm hover:bg-amber-600">
              <Zap className="h-4 w-4" /> Lançar desafio do dia
            </Button>
          )}
        </div>
      </div>

      {deHoje.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {deHoje.map(d => <CardDesafioDoDia key={d.id} desafio={d} onAbrir={onAbrir} />)}
        </div>
      )}

      {proximos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Próximos</p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {proximos.map(d => <CardDesafioDoDia key={d.id} desafio={d} onAbrir={onAbrir} />)}
          </div>
        </div>
      )}

      {anteriores.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Desafios do dia anteriores ({anteriores.length})
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {anteriores.map(d => <CardDesafioDoDia key={d.id} desafio={d} onAbrir={onAbrir} />)}
          </div>
        </details>
      )}
    </section>
  );
}

// ── A tela do desafio ────────────────────────────────────────────────────────

export function DetalheDesafioDoDia({
  desafio, empresaId, autorId, operadorId, podeEditar, onVoltar, onEditar, onMudou,
}: {
  desafio: Desafio;
  empresaId: string;
  autorId: string;
  operadorId: string;
  podeEditar: boolean;
  onVoltar: () => void;
  onEditar: () => void;
  onMudou: () => void;
}) {
  const uso = usePlacarDoDia(desafio);
  useSyncExternalStore(ouvirPrevias, previasDaBarra, previasDaBarra);
  const emPrevia = estaEmPrevia(desafio.id);
  const estilo = estiloDoDia(desafio.visual.acento);

  async function mudar(status: StatusDesafio) {
    const r = await mudarStatusDesafio({ desafioId: desafio.id, empresaId, autorId, nome: desafio.nome, status });
    if (r.error) { toast.error(r.error); return; }
    if (status === 'ativo') definirPrevia(desafio, false);
    toast.success(status === 'ativo' ? 'Desafio lançado!' : 'Desafio encerrado.');
    onMudou();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onVoltar} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Catálogo
        </Button>
        {podeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            {desafio.status === 'rascunho' && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => definirPrevia(desafio, !emPrevia)}
                title="Mostra este rascunho na SUA barra superior. Ninguém mais vê.">
                {emPrevia ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {emPrevia ? 'Tirar da minha barra' : 'Ver na minha barra'}
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onEditar}>
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
            {desafio.status === 'rascunho' && (
              <Button size="sm" className="gap-1.5" onClick={() => void mudar('ativo')}>
                <Rocket className="h-3.5 w-3.5" /> Lançar
              </Button>
            )}
            {desafio.status === 'ativo' && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void mudar('encerrado')}>
                <Flag className="h-3.5 w-3.5" /> Encerrar
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', estilo.suave)}>
          <Zap className={cn('h-5 w-5', estilo.texto)} aria-hidden="true" />
        </span>
        <div>
          <p className={cn('text-[10px] font-semibold uppercase tracking-[0.18em]', estilo.texto)}>Desafio do dia</p>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{desafio.nome}</h2>
        </div>
      </div>

      <PainelDesafioDoDia desafio={desafio} uso={uso} operadorId={operadorId} variante="pagina" />
    </div>
  );
}
