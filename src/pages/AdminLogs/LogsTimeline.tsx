/**
 * src/pages/AdminLogs/LogsTimeline.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A vista de leitura: eventos agrupados por dia, em ordem decrescente.
 *
 * Existe porque auditoria costuma ser lida como narrativa ("o que aconteceu
 * ontem à tarde"), e não como planilha. A tabela continua disponível para quando
 * a pergunta é comparativa; esta é a vista padrão.
 *
 * Cada linha mostra a frase pronta que o banco gravou (`descricao`) — não a ação
 * crua. A diferença entre "UPDATE / acordos" e "Mudou o status do acordo NR
 * 12345 — João da Silva de Verificar/Pendente para Pago" é a diferença entre um
 * log que existe e um log que serve.
 */
import { Fragment, useMemo } from 'react';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LogSistema } from '@/lib/supabase';
import { descreverAcao, campoLabel } from '@/lib/logs-catalogo';
import { SeloCategoria, SeloSeveridade, AvatarAutor } from './comum';
import {
  iconeDaCategoria, rotuloDoDia, dataHoraCompleta, horaMinuto, numeroBr,
} from './formatos';

interface Props {
  logs: LogSistema[];
  onAbrir: (log: LogSistema) => void;
  idDestacado?: string | null;
}

export default function LogsTimeline({ logs, onAbrir, idDestacado }: Props) {
  // Agrupa por dia LOCAL. `toDateString()` já usa o fuso do navegador, que é o
  // fuso de quem lê — agrupar por data UTC jogaria tudo depois das 21h para o
  // dia seguinte.
  const grupos = useMemo(() => {
    const mapa = new Map<string, LogSistema[]>();
    for (const log of logs) {
      const chave = new Date(log.criado_em).toDateString();
      const atual = mapa.get(chave);
      if (atual) atual.push(log);
      else mapa.set(chave, [log]);
    }
    return Array.from(mapa.entries());
  }, [logs]);

  if (logs.length === 0) return <Vazio />;

  return (
    <div className="divide-y divide-border">
      {grupos.map(([chave, doDia]) => (
        <Fragment key={chave}>
          {/* Cabeçalho do dia — fica colado no topo durante a rolagem, para que
              a data não se perca depois de 40 linhas. */}
          <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 bg-muted/80 backdrop-blur-sm border-y border-border">
            <span className="text-[11px] font-bold text-foreground">
              {rotuloDoDia(doDia[0].criado_em)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {numeroBr(doDia.length)} evento(s)
            </span>
          </div>

          {doDia.map((log) => (
            <LinhaEvento
              key={log.id}
              log={log}
              destacado={log.id === idDestacado}
              onAbrir={() => onAbrir(log)}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}

function LinhaEvento({
  log, destacado, onAbrir,
}: {
  log: LogSistema;
  destacado: boolean;
  onAbrir: () => void;
}) {
  const Icone = iconeDaCategoria(log.categoria);
  const perfis = log.perfis as { nome?: string; foto_url?: string } | undefined;
  const autor = log.usuario_nome ?? perfis?.nome ?? null;
  const critico = log.severidade === 'critico';

  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        'w-full text-left flex items-start gap-3 px-4 py-2.5 transition-colors group',
        destacado ? 'bg-primary/5' : 'hover:bg-accent/40',
        critico && 'border-l-2 border-l-destructive',
      )}
    >
      {/* Autor */}
      <AvatarAutor nome={autor} foto={perfis?.foto_url} tamanho="sm" />

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <Icone className="w-3.5 h-3.5 mt-[2px] text-muted-foreground shrink-0" />
          <p className="text-xs text-foreground leading-snug flex-1">
            {log.descricao || descreverAcao(log.acao)}
          </p>
          <span
            className="text-[10px] text-muted-foreground shrink-0 tabular-nums"
            title={dataHoraCompleta(log.criado_em)}
          >
            {horaMinuto(log.criado_em)}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 mt-[1px]" />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-1 pl-[22px]">
          <span className="text-[10px] text-muted-foreground">
            {autor ?? 'Sistema'}
            {log.usuario_cargo && (
              <span className="text-muted-foreground/60"> · {log.usuario_cargo}</span>
            )}
          </span>
          <span className="text-muted-foreground/30">·</span>
          <SeloCategoria categoria={log.categoria} comIcone={false} />
          {log.severidade !== 'info' && <SeloSeveridade severidade={log.severidade} />}

          {/* Campos alterados: o resumo do diff sem abrir o detalhe. É o que
              permite varrer 40 linhas e achar "quem mexeu no valor". */}
          {log.campos && log.campos.length > 0 && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[380px]">
              {log.campos.slice(0, 4).map(campoLabel).join(' · ')}
              {log.campos.length > 4 && ` +${log.campos.length - 4}`}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function Vazio({ mensagem }: { mensagem?: string }) {
  return (
    <div className="px-4 py-16 text-center">
      <ClipboardList className="w-9 h-9 text-muted-foreground/25 mx-auto mb-3" />
      <p className="text-sm text-foreground font-medium">
        {mensagem ?? 'Nenhum evento neste recorte'}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Amplie o período ou remova filtros para ver mais.
      </p>
    </div>
  );
}
