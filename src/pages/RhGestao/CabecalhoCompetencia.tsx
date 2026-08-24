/**
 * CabecalhoCompetencia — a competência, o prazo e as ações que valem para ela.
 *
 * ## O prazo é a informação mais lida desta tela
 *
 * Os gestores abrem o módulo para saber duas coisas: qual mês está aberto e até
 * quando dá para enviar. Por isso o prazo aparece no cabeçalho com estado
 * visível (dentro, próximo, encerrado, enviado) e não escondido num menu.
 *
 * «Enviado» vence os outros de propósito: quem entregou não precisa ver o aviso
 * vermelho no dia seguinte. O alerta existe para quem ainda deve algo.
 *
 * ## Prorrogar exige motivo, e a tela cobra antes do banco
 *
 * Definir o prazo pela primeira vez não pede justificativa — não há o que
 * justificar. Alterar um prazo já publicado, sim: os gestores se organizaram
 * por aquela data. O banco recusa de qualquer forma
 * (`RH_MOTIVO_OBRIGATORIO`); aqui é a cortesia de avisar antes.
 */
import { useState } from 'react';
import {
  CalendarDays, Plus, Lock, Unlock, Download, RefreshCw, History, Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getTodayISO } from '@/lib/index';
import { estadoDoPrazo, PRAZO_META } from '@/services/rh/rhEstados';
import { rotuloCompetencia } from '@/services/rh/rhExportacao';
import type { RhFechamentoRow } from '@/services/rh/rhGestao.service';
import type { PermissoesRh } from '@/hooks/useRhGestao';

export interface CabecalhoCompetenciaProps {
  fechamentos: RhFechamentoRow[];
  fechamento: RhFechamentoRow | null;
  permissoes: PermissoesRh;
  /** Tudo do escopo já chegou ao RH? Decide o rótulo do prazo. */
  jaEnviou: boolean;
  atualizando: boolean;
  onSelecionar: (id: string) => void;
  onAbrirNova: () => void;
  onEditarPrazo: () => void;
  onFinalizar: () => void;
  onReabrir: () => void;
  onExportar: () => void;
  onHistorico: () => void;
  onConfigurar: () => void;
  onRecarregar: () => void;
}

export function CabecalhoCompetencia({
  fechamentos, fechamento, permissoes, jaEnviou, atualizando,
  onSelecionar, onAbrirNova, onEditarPrazo, onFinalizar, onReabrir,
  onExportar, onHistorico, onConfigurar, onRecarregar,
}: CabecalhoCompetenciaProps) {
  const [hoje] = useState(getTodayISO);

  const finalizada = fechamento?.status === 'finalizado';
  const prazo = fechamento?.prazo ?? null;
  const estadoPrazo = estadoDoPrazo(prazo, hoje, jaEnviou || finalizada);
  const metaPrazo = PRAZO_META[estadoPrazo];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight">RH Gestão</h1>
          <p className="text-xs text-muted-foreground">
            Controle de Premiação e Comissão
          </p>
        </div>

        {fechamentos.length > 0 && (
          <Select value={fechamento?.id ?? ''} onValueChange={onSelecionar}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <CalendarDays className="w-3 h-3 mr-1 shrink-0" />
              <SelectValue placeholder="Competência" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {fechamentos.map(f => (
                <SelectItem key={f.id} value={f.id}>
                  {rotuloCompetencia(String(f.competencia))}
                  {f.status === 'finalizado' ? ' · finalizada' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {finalizada && (
          <Badge variant="outline" className="text-[10px] font-semibold bg-muted text-muted-foreground border-border">
            <Lock className="w-3 h-3 mr-1" /> Finalizada
          </Badge>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"
                  onClick={onRecarregar} disabled={atualizando}>
            <RefreshCw className={cn('w-3.5 h-3.5', atualizando && 'animate-spin')} />
            Atualizar
          </Button>

          {fechamento && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onHistorico}>
              <History className="w-3.5 h-3.5" /> Histórico
            </Button>
          )}

          {/* Exportar vale para quem responde por um SETOR também, e não só
              para o RH: a gerência confere a folha do setor dela na planilha
              antes de enviar, e a exportação sai do que o escopo já entregou —
              ninguém baixa o que não enxerga. Alcance de equipe fica de fora:
              ali a tabela na tela já é a lista inteira. */}
          {fechamento && (permissoes.escopoTodos || permissoes.escopoSetor) && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onExportar}>
              <Download className="w-3.5 h-3.5" /> Exportar
            </Button>
          )}

          {permissoes.podeConfigurar && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onConfigurar}>
              <Settings2 className="w-3.5 h-3.5" /> Configurar
            </Button>
          )}

          {permissoes.podeGerenciarFechamento && !finalizada && fechamento && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onFinalizar}>
              <Lock className="w-3.5 h-3.5" /> Finalizar
            </Button>
          )}

          {/* Reabrir só aparece para quem tem a concessão nominal. Ver
              `PERMISSOES_EXPLICITAS`: acesso total não concede isto sozinho. */}
          {permissoes.podeReabrir && finalizada && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onReabrir}>
              <Unlock className="w-3.5 h-3.5" /> Reabrir
            </Button>
          )}

          {permissoes.podeGerenciarFechamento && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onAbrirNova}>
              <Plus className="w-3.5 h-3.5" /> Competência
            </Button>
          )}
        </div>
      </div>

      {fechamento && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] px-3 py-2 rounded-lg border border-border/60 bg-muted/20">
          <span className="text-muted-foreground">
            Competência{' '}
            <strong className="text-foreground">
              {rotuloCompetencia(String(fechamento.competencia))}
            </strong>
          </span>
          <span className="text-muted-foreground">
            Desempenho de{' '}
            <strong className="text-foreground">
              {rotuloCompetencia(String(fechamento.mes_apuracao))}
            </strong>
          </span>
          <span className={cn('font-semibold', metaPrazo.cls)}>
            {prazo
              ? `Prazo dos gestores: ${formatarData(prazo)} · ${metaPrazo.label}`
              : metaPrazo.label}
          </span>
          {permissoes.podeGerenciarFechamento && !finalizada && (
            <button
              onClick={onEditarPrazo}
              className="text-[11px] underline text-muted-foreground hover:text-foreground"
            >
              {prazo ? 'alterar prazo' : 'definir prazo'}
            </button>
          )}
          {fechamento.finalizado_por_nome && (
            <span className="text-muted-foreground ml-auto">
              Finalizada por {fechamento.finalizado_por_nome}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** `2026-09-02` → `02/09/2026`, sem passar por `Date` (que desloca o fuso). */
function formatarData(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export default CabecalhoCompetencia;
