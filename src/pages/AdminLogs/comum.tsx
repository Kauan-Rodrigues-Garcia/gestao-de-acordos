/**
 * src/pages/AdminLogs/comum.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Componentes visuais compartilhados pelas quatro vistas da tela de Logs
 * (painel, tabela, linha do tempo e detalhe).
 *
 * Ficam aqui para que a mesma severidade tenha a mesma cor em todos os lugares —
 * na versão 1.0 a cor da ação era um objeto solto no topo do arquivo da página, e
 * só a tabela a usava.
 *
 * Funções puras de formatação moram em `formatos.ts`, não aqui: um módulo que
 * exporta componentes e utilitários juntos quebra o Fast Refresh.
 */
import { Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { categoriaMeta, severidadeMeta } from '@/lib/logs-catalogo';
import { iconeDaCategoria, iniciais } from './formatos';

// ═══════════════════════════════════════════════════════════════════════════
// Selos
// ═══════════════════════════════════════════════════════════════════════════
export function SeloCategoria({
  categoria,
  className,
  comIcone = true,
}: {
  categoria: string | null | undefined;
  className?: string;
  comIcone?: boolean;
}) {
  const meta = categoriaMeta(categoria);
  const Icone = iconeDaCategoria(categoria);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold whitespace-nowrap',
        meta.cor,
        className,
      )}
    >
      {comIcone && <Icone className="w-3 h-3 shrink-0" />}
      {meta.label}
    </span>
  );
}

export function SeloSeveridade({
  severidade,
  className,
}: {
  severidade: string | null | undefined;
  className?: string;
}) {
  const meta = severidadeMeta(severidade);

  // 'info' é a maioria absoluta das linhas. Dar selo colorido a ela pintaria a
  // tela inteira e o crítico deixaria de saltar — que é a única razão de existir
  // a coluna de severidade.
  if ((severidade ?? 'info') === 'info') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-[10px] text-muted-foreground', className)}>
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
        {meta.label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap',
        meta.cor,
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', meta.ponto)} />
      {meta.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Autor
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Avatar do autor.
 *
 * A foto vem do join com `perfis` e some quando o usuário é excluído; o NOME
 * fica na própria linha do log (desnormalizado). Por isso as iniciais saem de
 * `usuario_nome`, e não da junção: um log de alguém desligado continua com dono.
 */
export function AvatarAutor({
  nome,
  foto,
  tamanho = 'md',
}: {
  nome: string | null | undefined;
  foto?: string | null;
  tamanho?: 'sm' | 'md';
}) {
  const dim = tamanho === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-[11px]';
  const semAutor = !nome;

  if (foto) {
    return (
      <img
        src={foto}
        alt={nome ?? 'Sistema'}
        className={cn(dim, 'rounded-full object-cover border border-border shrink-0')}
      />
    );
  }

  return (
    <span
      className={cn(
        dim,
        'rounded-full shrink-0 inline-flex items-center justify-center font-bold border',
        semAutor
          ? 'bg-muted text-muted-foreground border-border'
          : 'bg-primary/10 text-primary border-primary/20',
      )}
      title={nome ?? 'Sistema'}
    >
      {semAutor ? <Server className="w-3 h-3" /> : iniciais(nome)}
    </span>
  );
}
