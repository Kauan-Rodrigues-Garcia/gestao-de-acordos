/**
 * HistoricoRh — a trilha da competência.
 *
 * Tudo o que aconteceu com dinheiro nesta competência: valor informado, valor
 * alterado, equipe concluída, validada, enviada, devolvida (com o motivo),
 * aprovada, prazo prorrogado, competência finalizada e reaberta.
 *
 * A tela só desenha: a frase vem pronta do banco (`rh_eventos.descricao`),
 * montada pela própria RPC que executou a ação. Frase montada aqui teria de ser
 * mantida em sincronia com a lógica que ela descreve, e a primeira divergência
 * seria invisível.
 *
 * A trilha é append-only — não há política de UPDATE nem de DELETE em
 * `rh_eventos`. Histórico que se pode reescrever não resolve discordância sobre
 * pagamento.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { listarEventos, type RhEventoRow } from '@/services/rh/rhGestao.service';

/** Rótulo e cor por tipo de evento. Mesma paleta dos estados do módulo. */
const EVENTO_META: Record<string, { label: string; cls: string }> = {
  competencia_aberta:     { label: 'Competência', cls: 'border-border text-muted-foreground' },
  competencia_finalizada: { label: 'Finalizada',  cls: 'border-border text-muted-foreground' },
  competencia_reaberta:   { label: 'Reaberta',    cls: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
  prazo_definido:         { label: 'Prazo',       cls: 'border-border text-muted-foreground' },
  prazo_alterado:         { label: 'Prazo',       cls: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
  valor_informado:        { label: 'Valor',       cls: 'border-sky-500/30 bg-sky-500/10 text-sky-400' },
  valor_alterado:         { label: 'Valor',       cls: 'border-violet-500/30 bg-violet-500/10 text-violet-400' },
  equipe_concluida:       { label: 'Concluída',   cls: 'border-sky-500/30 bg-sky-500/10 text-sky-400' },
  equipe_validada:        { label: 'Validada',    cls: 'border-violet-500/30 bg-violet-500/10 text-violet-400' },
  setor_enviado:          { label: 'Enviado',     cls: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
  aprovado:               { label: 'Aprovado',    cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
  devolvido_operador:     { label: 'Devolvido',   cls: 'border-red-500/30 bg-red-500/10 text-red-400' },
  devolvido_equipe:       { label: 'Devolvida',   cls: 'border-red-500/30 bg-red-500/10 text-red-400' },
};

export interface HistoricoRhProps {
  aberto: boolean;
  fechamentoId: string | null;
  onFechar: () => void;
}

export function HistoricoRh({ aberto, fechamentoId, onFechar }: HistoricoRhProps) {
  const [eventos, setEventos] = useState<RhEventoRow[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    if (!fechamentoId) { setEventos([]); return; }
    setCarregando(true);
    try {
      setEventos(await listarEventos(fechamentoId));
    } finally {
      setCarregando(false);
    }
  }, [fechamentoId]);

  useEffect(() => { if (aberto) void carregar(); }, [aberto, carregar]);

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? eventos.filter(e =>
        e.descricao.toLowerCase().includes(termo)
        || (e.autor_nome ?? '').toLowerCase().includes(termo)
        || (e.motivo ?? '').toLowerCase().includes(termo))
    : eventos;

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4" /> Histórico da competência
          </DialogTitle>
          <DialogDescription>
            Tudo o que aconteceu com valores nesta competência. O registro não pode
            ser editado nem apagado.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por pessoa, ação ou motivo…" className="h-8 text-xs"
        />

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {carregando ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : visiveis.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">
              {eventos.length === 0 ? 'Nada registrado ainda.' : 'Nenhum evento com esse termo.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {visiveis.map(e => {
                const meta = EVENTO_META[e.tipo] ?? {
                  label: e.tipo, cls: 'border-border text-muted-foreground',
                };
                return (
                  <li key={e.id} className="flex items-start gap-2.5 rounded-lg border border-border/50 px-3 py-2">
                    <Badge variant="outline" className={cn('text-[10px] font-semibold shrink-0 mt-0.5', meta.cls)}>
                      {meta.label}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground leading-snug">{e.descricao}</p>
                      {e.motivo && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Motivo: {e.motivo}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {e.autor_nome ?? 'Sistema'} ·{' '}
                        {new Date(e.criado_em).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default HistoricoRh;
