/**
 * SecaoSom e SecaoQuando — etapas 6 e 7.
 *
 * Som: o catálogo sintetizado no app, ou uma música da empresa. O volume segue
 * as regras de `pages/Comemoracoes/volume.ts` (nasce baixo, avisa acima de 60%,
 * trava na meta de setor) — a festa passa por cima de gente em ligação.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Loader2, Lock, Music, Pause, Play, Upload, Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { tocarSomComemoracao } from '@/lib/som-comemoracao';
import { ouvirPrevia, pausarPrevia, tocarPrevia, urlTocando } from '@/lib/previaSom';
import { SONS, type SomId } from '@/pages/Comemoracoes/catalogo';
import {
  VOLUME_SETOR, volumeAtrapalha, volumeEfetivo, volumeTravado,
} from '@/pages/Comemoracoes/volume';
import { MAX_DIAS_AGENDAMENTO } from '@/pages/Comemoracoes/janela';
import { DURACAO_MAX_S, DURACAO_MIN_S } from '@/services/comemoracoes.service';
import { enviarMidia, type MidiaComemoracao } from '@/services/comemoracaoMidias.service';
import { Opcoes } from './Etapa';
import type { Rascunho } from './rascunho';
import type { MudarRascunho } from './tipos';

function usePreviaTocando(): string | null {
  const [url, setUrl] = useState<string | null>(() => urlTocando());
  useEffect(() => ouvirPrevia(setUrl), []);
  useEffect(() => () => pausarPrevia(), []);
  return url;
}

export function SecaoSom({
  r, mudar, musicas, empresaId, usuarioId, onMusicasMudaram,
}: {
  r: Rascunho;
  mudar: MudarRascunho;
  musicas: MidiaComemoracao[] | null;
  empresaId: string;
  usuarioId: string;
  onMusicasMudaram: () => void;
}) {
  const tocando = usePreviaTocando();
  const [enviando, setEnviando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const volume = volumeEfetivo(r.volume, r.alvoTipo);
  const travado = volumeTravado(r.alvoTipo);
  const sons = SONS.filter((s) => s.id !== 'nenhum');
  const daEmpresa = (musicas ?? []).filter((m) => m.tipo === 'som');

  async function enviar(arquivo: File) {
    setEnviando(true);
    try {
      const res = await enviarMidia({ empresaId, criadoPor: usuarioId, tipo: 'som', arquivo });
      if (!res.ok || !res.dados) { toast.error(res.erro ?? 'Não foi possível enviar a música.'); return; }
      toast.success('Música enviada.');
      mudar({ musica: res.dados });
      onMusicasMudaram();
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = '';
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Som do app</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[...sons, { id: 'nenhum' as SomId, nome: 'Sem som', descricao: '' }].map((s) => {
            const ativo = !r.musica && r.som === s.id;
            return (
              <div key={s.id} className={cn(
                'flex items-center gap-1 rounded-lg border pl-2.5',
                ativo ? 'border-primary bg-primary/5' : 'border-border',
              )}>
                <button type="button" onClick={() => mudar({ som: s.id, musica: null })}
                  aria-pressed={ativo}
                  className="min-w-0 flex-1 py-1.5 text-left text-xs font-medium">
                  {s.nome}
                </button>
                {s.id !== 'nenhum' && (
                  <button type="button" title={`Ouvir ${s.nome}`} aria-label={`Ouvir ${s.nome}`}
                    onClick={() => tocarSomComemoracao(s.id, true, volume)}
                    className="rounded-md p-1.5 text-muted-foreground hover:text-foreground">
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {musicas !== null && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Músicas da empresa</p>
            <button type="button" disabled={enviando} onClick={() => arquivoRef.current?.click()}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50">
              {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              Enviar música
            </button>
            <input ref={arquivoRef} type="file" accept="audio/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }} />
          </div>
          {daEmpresa.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Nenhuma música enviada. Até 10 MB; a música fica 3 dias na biblioteca.</p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {daEmpresa.map((m) => {
                const ativo = r.musica?.id === m.id;
                const tocandoEsta = tocando === m.url;
                return (
                  <div key={m.id} className={cn(
                    'flex items-center gap-2 rounded-lg border px-2 py-1',
                    ativo ? 'border-primary bg-primary/5' : 'border-border',
                  )}>
                    <button type="button" aria-label={tocandoEsta ? 'Pausar' : `Ouvir ${m.nome}`}
                      onClick={() => tocarPrevia(m.url, { inicio: Number(m.inicio_s ?? 0), duracao: r.duracaoS, volume })}
                      className="rounded-full bg-muted p-1.5 hover:bg-accent">
                      {tocandoEsta ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </button>
                    <button type="button" onClick={() => mudar({ musica: ativo ? null : m })}
                      aria-pressed={ativo}
                      className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-xs">
                      <Music className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{m.nome}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">Volume</span>
          <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
            {travado && <Lock className="h-3 w-3 text-muted-foreground" />}{volume}%
          </span>
        </div>
        <Slider value={[volume]} min={0} max={100} step={5} disabled={travado}
          onValueChange={([v]) => mudar({ volume: v })} aria-label="Volume" />
        {travado ? (
          <p className="text-[11px] text-muted-foreground">Meta de setor toca em {VOLUME_SETOR}% para a empresa inteira.</p>
        ) : volumeAtrapalha(volume) ? (
          <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> Acima de 60% pode atrapalhar quem está em ligação.
          </p>
        ) : null}
      </div>
    </>
  );
}

export function SecaoQuando({ r, mudar, erroAgendamento }: { r: Rascunho; mudar: MudarRascunho; erroAgendamento: string | null }) {
  return (
    <>
      <Opcoes<'agora' | 'agendar'> rotulo="Quando aparece" colunas={2}
        opcoes={[{ id: 'agora', nome: 'Agora' }, { id: 'agendar', nome: 'Agendar' }]}
        valor={r.agendar ? 'agendar' : 'agora'}
        onEscolher={(v) => mudar({ agendar: v === 'agendar' })} />

      {r.agendar && (
        <div className="space-y-1">
          <Input type="datetime-local" value={r.quando} className="h-9 text-sm" aria-label="Data e hora"
            onChange={(e) => mudar({ quando: e.target.value })} />
          <p className={cn('text-[11px]', erroAgendamento ? 'text-destructive' : 'text-muted-foreground')}>
            {erroAgendamento ?? `Até ${MAX_DIAS_AGENDAMENTO} dias à frente. Aparece para quem estiver logado na hora.`}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">Quanto tempo fica na tela</span>
          <span className="font-semibold tabular-nums">{r.duracaoS}s</span>
        </div>
        <Slider value={[r.duracaoS]} min={DURACAO_MIN_S} max={DURACAO_MAX_S} step={1}
          onValueChange={([v]) => mudar({ duracaoS: v })} aria-label="Duração" />
      </div>
    </>
  );
}
