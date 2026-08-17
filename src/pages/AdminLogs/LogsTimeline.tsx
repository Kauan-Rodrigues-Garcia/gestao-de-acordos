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
import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, ClipboardList, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LogSistema } from '@/lib/supabase';
import { descreverAcao, campoLabel, normalizarDescricao } from '@/lib/logs-catalogo';
import { SeloCategoria, SeloSeveridade, AvatarAutor } from './comum';
import {
  iconeDaCategoria, rotuloDoDia, dataHoraCompleta, horaMinuto, numeroBr,
} from './formatos';
import { agruparEventos, resumirGrupo, type GrupoEventos } from './agruparEventos';

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

          {agruparEventos(doDia).map((grupo) =>
            grupo.eventos.length === 1 ? (
              <LinhaEvento
                key={grupo.chave}
                log={grupo.eventos[0]}
                destacado={grupo.eventos[0].id === idDestacado}
                onAbrir={() => onAbrir(grupo.eventos[0])}
              />
            ) : (
              <CardGrupo
                key={grupo.chave}
                grupo={grupo}
                idDestacado={idDestacado}
                onAbrir={onAbrir}
              />
            ),
          )}
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Vários eventos que foram uma ação, num card que abre.
 *
 * O card FECHADO resume; o aberto lista os eventos um a um, cada um levando ao
 * detalhe completo. Nada é escondido: agrupar aqui é decidir onde o olho pousa,
 * não descartar evidência. Ver `agruparEventos.ts`.
 */
function CardGrupo({
  grupo, idDestacado, onAbrir,
}: {
  grupo: GrupoEventos;
  idDestacado?: string | null;
  onAbrir: (log: LogSistema) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const r = resumirGrupo(grupo);
  const primeiro = grupo.eventos[0];
  const perfis = primeiro.perfis as { nome?: string; foto_url?: string } | undefined;
  const critico = grupo.eventos.some(e => e.severidade === 'critico');
  // Um evento de dentro está selecionado no painel lateral: o card se destaca
  // para a pessoa não perder de onde veio o detalhe aberto.
  const contemDestacado = !!idDestacado && grupo.eventos.some(e => e.id === idDestacado);

  return (
    <div className={cn(
      'border-l-2',
      critico ? 'border-l-destructive' : 'border-l-transparent',
      contemDestacado && 'bg-primary/5',
    )}>
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        aria-expanded={aberto}
        className="w-full text-left flex items-start gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors group"
      >
        <AvatarAutor nome={r.autor} foto={perfis?.foto_url} tamanho="sm" />

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <Layers className="w-3.5 h-3.5 mt-[2px] text-muted-foreground shrink-0" />
            <p className="text-xs text-foreground leading-snug flex-1">
              <span className="font-semibold">
                {numeroBr(r.quantidade)} alterações
              </span>
              {grupo.nr && <> no <span className="font-medium">NR {grupo.nr}</span></>}
              {' '}
              <span className="text-muted-foreground">
                {/* A palavra muda com a certeza: carimbo de transação idêntico é
                    fato, a janela de tempo é aproximação. */}
                {grupo.mesmaTransacao ? 'na mesma operação' : 'em sequência'}
              </span>
            </p>
            <span
              className="text-[10px] text-muted-foreground shrink-0 tabular-nums"
              title={dataHoraCompleta(primeiro.criado_em)}
            >
              {horaMinuto(primeiro.criado_em)}
            </span>
            <ChevronDown className={cn(
              'w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 mt-[1px] transition-transform',
              aberto && 'rotate-180 text-muted-foreground',
            )} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-1 pl-[22px]">
            <span className="text-[10px] text-muted-foreground">
              {r.autor ?? 'Sistema'}
              {primeiro.usuario_cargo && (
                <span className="text-muted-foreground/60"> · {primeiro.usuario_cargo}</span>
              )}
            </span>
            <span className="text-muted-foreground/30">·</span>
            <SeloCategoria categoria={primeiro.categoria} comIcone={false} />
            {critico && <SeloSeveridade severidade="critico" />}
            <span className="text-[10px] text-muted-foreground truncate max-w-[320px]">
              {r.tabelas.join(' · ')}
            </span>
          </div>
        </div>
      </button>

      {aberto && (
        <div className="pl-4 border-t border-border/50 bg-muted/10">
          {grupo.eventos.map(log => (
            <LinhaEvento
              key={log.id}
              log={log}
              destacado={log.id === idDestacado}
              onAbrir={() => onAbrir(log)}
            />
          ))}
        </div>
      )}
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
          {/* `normalizarDescricao` conserta na LEITURA o "NR NR" e os nomes de
              coluna crus que duas falhas gravaram em ~872 linhas até 17/08/2026.
              A migration 20260817200000 corrige a origem; a trilha é
              somente-acréscimo e não se reescreve por causa de rótulo. */}
          <p className="text-xs text-foreground leading-snug flex-1">
            {normalizarDescricao(log.descricao) || descreverAcao(log.acao)}
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
