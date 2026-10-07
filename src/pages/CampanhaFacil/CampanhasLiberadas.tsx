/**
 * Campanhas que o líder liberou nos últimos 2 dias, com o andamento de cada
 * operador (enviadas / total, 20261007150000) e o repasse.
 *
 * «Líder fez campanha com todos, três não foram: ele pode escolher um para
 * receber os três, ou separar.» (29/09/2026) — o diálogo tem uma lista só de
 * quem recebe: um marcado leva tudo, vários dividem em rodízio.
 */
import { useMemo, useState } from 'react';
import { ArrowRightLeft, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { EnvioResumo } from './campanhaFacilEnvios.service';
import type { OperadorCampanha } from './envios';
import type { useEnviosCampanha } from './useEnviosCampanha';

type Envios = ReturnType<typeof useEnviosCampanha>;

interface Lote {
  loteId: string;
  titulo: string;
  criadoEm: string;
  expiraEm: string;
  envios: EnvioResumo[];
  /** Um por operador, somando original e repasses. */
  porOperador: { id: string; nome: string; qtd: number; enviados: number; naoEnviados: number; repasse: boolean }[];
}

function agrupar(envios: readonly EnvioResumo[]): Lote[] {
  const mapa = new Map<string, Lote>();
  for (const e of envios) {
    let lote = mapa.get(e.lote_id);
    if (!lote) {
      lote = { loteId: e.lote_id, titulo: e.titulo, criadoEm: e.criado_em, expiraEm: e.expira_em, envios: [], porOperador: [] };
      mapa.set(e.lote_id, lote);
    }
    lote.envios.push(e);
    if (e.criado_em < lote.criadoEm) lote.criadoEm = e.criado_em;
    if (e.expira_em < lote.expiraEm) lote.expiraEm = e.expira_em;
    const op = lote.porOperador.find((o) => o.id === e.operador_id);
    // O que está na aba agora (o repasse tira o pendente de quem faltou).
    const qtd = e.progresso.total || e.qtd;
    if (op) {
      op.qtd += qtd; op.enviados += e.progresso.enviados; op.naoEnviados += e.progresso.nao_enviados;
      op.repasse ||= e.repasse;
    } else {
      lote.porOperador.push({
        id: e.operador_id, nome: e.operador_nome, qtd,
        enviados: e.progresso.enviados, naoEnviados: e.progresso.nao_enviados, repasse: e.repasse,
      });
    }
  }
  for (const l of mapa.values()) l.porOperador.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return [...mapa.values()].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function CampanhasLiberadas({ envios }: { envios: Envios }) {
  const lotes = useMemo(() => agrupar(envios.enviados), [envios.enviados]);
  const [repasseDe, setRepasseDe] = useState<Lote | null>(null);
  const [cancelarDe, setCancelarDe] = useState<Lote | null>(null);

  if (lotes.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Send className="h-4 w-4 text-primary" /> Campanhas liberadas
        </div>
        <p className="text-xs text-muted-foreground">
          Cada operador envia a parte dele em Campanhas de WhatsApp. Ficam disponíveis por 2 dias.
        </p>
        {lotes.map((l) => (
          <div key={l.loteId} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={l.titulo}>{l.titulo}</p>
                <p className="text-[11px] text-muted-foreground">
                  Liberada {quando(l.criadoEm)} · expira {quando(l.expiraEm)}
                </p>
              </div>
            </div>
            <ul className="space-y-0.5 text-xs">
              {l.porOperador.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{o.nome}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                    {o.repasse && <Badge variant="secondary" className="h-4 px-1 text-[10px]">repasse</Badge>}
                    {o.naoEnviados > 0 && (
                      <span className="text-amber-600 dark:text-amber-400" title="Não deu para enviar">
                        {o.naoEnviados.toLocaleString('pt-BR')} não
                      </span>
                    )}
                    <span className={cn('tabular-nums', o.qtd > 0 && o.enviados >= o.qtd && 'text-emerald-600 dark:text-emerald-400')}>
                      {o.enviados.toLocaleString('pt-BR')}/{o.qtd.toLocaleString('pt-BR')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 flex-1 gap-1.5 text-xs" onClick={() => setRepasseDe(l)}>
                <ArrowRightLeft className="h-3.5 w-3.5" /> Repassar
              </Button>
              <Button
                size="sm" variant="ghost"
                className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setCancelarDe(l)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Cancelar
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      {repasseDe && (
        <DialogoRepasse
          lote={repasseDe}
          operadoresDoSetor={envios.operadores}
          onFechar={() => setRepasseDe(null)}
          onConfirmar={async (faltaram, recebedores) => {
            const ok = await envios.repassar(faltaram, recebedores);
            if (ok) setRepasseDe(null);
          }}
        />
      )}

      <AlertDialog open={!!cancelarDe} onOpenChange={(v) => { if (!v) setCancelarDe(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              “{cancelarDe?.titulo}” deixa de estar disponível para os {cancelarDe?.porOperador.length} operadores.
              A notificação continua com eles, mas a campanha some da aba Campanhas de WhatsApp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (cancelarDe) void envios.cancelar(cancelarDe.loteId); setCancelarDe(null); }}
            >Cancelar campanha</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function DialogoRepasse({
  lote, operadoresDoSetor, onFechar, onConfirmar,
}: {
  lote: Lote;
  operadoresDoSetor: OperadorCampanha[];
  onFechar: () => void;
  onConfirmar: (faltaram: EnvioResumo[], recebedores: OperadorCampanha[]) => Promise<void>;
}) {
  const [faltaram, setFaltaram] = useState<Set<string>>(new Set());
  // Começa com quem já está na campanha marcado como recebedor; quem for
  // marcado como faltante sai da lista sozinho.
  const [recebem, setRecebem] = useState<Set<string>>(() => new Set(lote.porOperador.map((o) => o.id)));
  const [salvando, setSalvando] = useState(false);

  /** Recebedor pode ser qualquer operador do setor, não só quem está no lote. */
  const candidatos = useMemo(() => {
    const m = new Map<string, OperadorCampanha>();
    for (const o of lote.porOperador) m.set(o.id, { id: o.id, nome: o.nome });
    for (const o of operadoresDoSetor) if (!m.has(o.id)) m.set(o.id, o);
    return [...m.values()]
      .filter((o) => !faltaram.has(o.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [lote, operadoresDoSetor, faltaram]);

  // Só o que ainda não saiu: o enviado fica com quem enviou.
  const qtdRepasse = lote.porOperador.filter((o) => faltaram.has(o.id)).reduce((s, o) => s + o.qtd - o.enviados, 0);
  const recebedores = candidatos.filter((o) => recebem.has(o.id));

  function alternar(set: Set<string>, id: string): Set<string> {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  }

  async function confirmar() {
    setSalvando(true);
    try {
      await onConfirmar(lote.envios.filter((e) => faltaram.has(e.operador_id)), recebedores);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Repassar contatos de quem faltou</DialogTitle>
          <DialogDescription>
            Marque quem faltou e quem vai receber. Vai só o que ainda não foi enviado. Um recebedor leva tudo; vários dividem em rodízio.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold">Quem faltou</p>
            <ul className="max-h-60 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
              {lote.porOperador.map((o) => (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                    <Checkbox checked={faltaram.has(o.id)} onCheckedChange={() => setFaltaram((s) => alternar(s, o.id))} />
                    <span className="flex-1 truncate">{o.nome}</span>
                    <span className="text-xs text-muted-foreground">{(o.qtd - o.enviados).toLocaleString('pt-BR')}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold">Quem recebe</p>
            <ul className="max-h-60 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
              {candidatos.map((o) => (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                    <Checkbox checked={recebem.has(o.id)} onCheckedChange={() => setRecebem((s) => alternar(s, o.id))} />
                    <span className="truncate">{o.nome}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs">
          {faltaram.size === 0
            ? 'Marque ao menos uma pessoa que faltou.'
            : recebedores.length === 0
              ? 'Marque ao menos uma pessoa para receber.'
              : recebedores.length === 1
                ? <><strong>{qtdRepasse.toLocaleString('pt-BR')}</strong> mensagens vão para <strong>{recebedores[0].nome}</strong>.</>
                : <><strong>{qtdRepasse.toLocaleString('pt-BR')}</strong> mensagens divididas entre <strong>{recebedores.length}</strong> operadores.</>}
          {' '}Quem recebe ganha uma notificação e acha as mensagens em Campanhas de WhatsApp.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button
            className="gap-2"
            disabled={salvando || faltaram.size === 0 || recebedores.length === 0}
            onClick={confirmar}
          >
            <ArrowRightLeft className="h-4 w-4" /> {salvando ? 'Repassando…' : 'Repassar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
