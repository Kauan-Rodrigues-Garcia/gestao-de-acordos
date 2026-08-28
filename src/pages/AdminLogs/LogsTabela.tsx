/**
 * src/pages/AdminLogs/LogsTabela.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A vista comparativa: uma linha por evento, colunas fixas, densa.
 *
 * Serve para as perguntas que a linha do tempo responde mal — "quantas ações
 * cada pessoa fez nesta hora", "todas as mudanças na tabela de metas". Mantém a
 * coluna de diferenças resumida (Antes → Depois), que é o que a versão 1.0 não
 * tinha em nenhuma vista.
 *
 * A célula de descrição é a mais larga porque é a que se lê; id de registro fica
 * em fonte monoespaçada e truncado, com o valor inteiro no `title`.
 */
import { cn } from '@/lib/utils';
import type { LogSistema } from '@/lib/supabase';
import { descreverAcao, campoLabel, formatarValorLog, origemLabel, normalizarDescricao } from '@/lib/logs-catalogo';
import { SeloCategoria, SeloSeveridade, AvatarAutor } from './comum';
import { dataHoraCompleta, tempoRelativo } from './formatos';
import { Vazio } from './LogsTimeline';
import { rotuloLocalizacaoIp, type LocalizacoesPorIp } from '@/services/ipLocalizacao.service';

interface Props {
  logs: LogSistema[];
  onAbrir: (log: LogSistema) => void;
  idDestacado?: string | null;
  mostrarEmpresa: boolean;
  localizacoesIp?: LocalizacoesPorIp;
}

export default function LogsTabela({
  logs, onAbrir, idDestacado, mostrarEmpresa, localizacoesIp = {},
}: Props) {
  if (logs.length === 0) return <Vazio />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <Th className="w-[132px]">Quando</Th>
            <Th className="w-[68px]">Nível</Th>
            <Th className="w-[112px]">Categoria</Th>
            <Th>O que aconteceu</Th>
            <Th className="w-[150px]">Autor</Th>
            {mostrarEmpresa && <Th className="w-[110px]">Empresa</Th>}
            <Th className="w-[230px]">Antes → Depois</Th>
            <Th className="w-[110px]">Origem</Th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, i) => {
            const perfis = log.perfis as { nome?: string; foto_url?: string } | undefined;
            const autor = log.usuario_nome ?? perfis?.nome ?? null;
            const empresa = log.empresas?.nome;
            const critico = log.severidade === 'critico';

            return (
              <tr
                key={log.id}
                onClick={() => onAbrir(log)}
                className={cn(
                  'border-b border-border/50 cursor-pointer align-top',
                  log.id === idDestacado ? 'bg-primary/5'
                    : i % 2 === 0 ? 'bg-muted/10 hover:bg-accent/40' : 'hover:bg-accent/40',
                  critico && 'border-l-2 border-l-destructive',
                )}
              >
                <Td>
                  <span className="font-mono text-muted-foreground whitespace-nowrap" title={dataHoraCompleta(log.criado_em)}>
                    {new Date(log.criado_em).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit',
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </span>
                  <span className="block text-[10px] text-muted-foreground/60">
                    {tempoRelativo(log.criado_em)}
                  </span>
                </Td>

                <Td><SeloSeveridade severidade={log.severidade} /></Td>

                <Td><SeloCategoria categoria={log.categoria} /></Td>

                <Td>
                  <p className="text-foreground leading-snug">
                    {normalizarDescricao(log.descricao) || descreverAcao(log.acao)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground/70">{log.acao}</span>
                    {log.tabela && (
                      <>
                        <span className="text-muted-foreground/30">·</span>
                        <span className="text-[10px] font-mono text-muted-foreground/70">{log.tabela}</span>
                      </>
                    )}
                    {log.registro_id && (
                      <>
                        <span className="text-muted-foreground/30">·</span>
                        <span
                          className="text-[10px] font-mono text-muted-foreground/50"
                          title={log.registro_id}
                        >
                          {log.registro_id.slice(0, 8)}
                        </span>
                      </>
                    )}
                  </div>
                </Td>

                <Td>
                  <span className="flex items-center gap-1.5">
                    <AvatarAutor nome={autor} foto={perfis?.foto_url} tamanho="sm" />
                    <span className="min-w-0">
                      <span className="block text-foreground truncate">{autor ?? 'Sistema'}</span>
                      {log.usuario_cargo && (
                        <span className="block text-[10px] text-muted-foreground">{log.usuario_cargo}</span>
                      )}
                    </span>
                  </span>
                </Td>

                {mostrarEmpresa && (
                  <Td><span className="text-muted-foreground">{empresa ?? '—'}</span></Td>
                )}

                <Td><ResumoDiff log={log} /></Td>

                <Td>
                  <span className="text-[10px] text-muted-foreground">{origemLabel(log.origem)}</span>
                  {log.ip && (
                    <>
                      {rotuloLocalizacaoIp(localizacoesIp[log.ip]) && (
                        <span className="block text-[10px] text-foreground/70">
                          {rotuloLocalizacaoIp(localizacoesIp[log.ip])}
                        </span>
                      )}
                      <span className="block text-[10px] font-mono text-muted-foreground/50" title={log.ip}>
                        {log.ip}
                      </span>
                    </>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * As duas primeiras mudanças, em "Campo: antes → depois".
 *
 * Duas e não todas: a coluna tem largura fixa e o objetivo é reconhecer o
 * evento, não auditá-lo — a auditoria completa está no painel de detalhe, a um
 * clique. Mostrar dez campos aqui esticaria a linha e empurraria o resto da
 * tabela para fora da tela.
 */
function ResumoDiff({ log }: { log: LogSistema }) {
  const campos = log.campos ?? [];

  if (campos.length === 0) {
    // Criação e exclusão não têm "antes → depois": o que há é a linha inteira,
    // e ela cabe no detalhe.
    const temPayload = Boolean(log.antes || log.depois);
    return (
      <span className="text-[10px] text-muted-foreground/50">
        {temPayload ? 'ver detalhes' : '—'}
      </span>
    );
  }

  const antes = (log.antes ?? {}) as Record<string, unknown>;
  const depois = (log.depois ?? {}) as Record<string, unknown>;

  return (
    <span className="block space-y-0.5">
      {campos.slice(0, 2).map((c) => (
        <span key={c} className="block text-[10px] leading-tight">
          <span className="text-muted-foreground">{campoLabel(c)}: </span>
          <span className="text-muted-foreground/70 line-through">{formatarValorLog(c, antes[c])}</span>
          <span className="text-muted-foreground/40"> → </span>
          <span className="text-foreground font-medium">{formatarValorLog(c, depois[c])}</span>
        </span>
      ))}
      {campos.length > 2 && (
        <span className="block text-[10px] text-muted-foreground/60">
          +{campos.length - 2} campo(s)
        </span>
      )}
    </span>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'text-left px-3 py-2 font-semibold text-[10px] uppercase tracking-wide text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-3 py-2', className)}>{children}</td>;
}
