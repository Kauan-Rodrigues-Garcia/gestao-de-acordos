/**
 * CodigoAcordoCopiavel — o identificador do acordo como botão que copia.
 *
 * O mesmo campo tem dois nomes: `nr_cliente` na Bookplay (rotulado NR) e
 * `instituicao` na PaguePlay (rotulado Código) — a mesma divergência que
 * `AcordoNovoInline` resolve com `label = isPaguePlay ? 'Código' : 'NR'`.
 *
 * Existe como componente porque a Bookplay já tinha o clique-para-copiar e a
 * PaguePlay não: repetir o JSX numa terceira tabela era garantir que as três
 * divergissem. Quem renderiza o identificador de um acordo numa lista usa isto.
 *
 * `stopPropagation` é obrigatório: as linhas destas tabelas abrem o detalhe no
 * clique. Sem ele, copiar o código abriria o acordo junto.
 */
import { Hash } from 'lucide-react';
import { copiarTexto } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

export interface CodigoAcordoCopiavelProps {
  codigo: string | null | undefined;
  /** Como este tenant chama o campo — vai no título e no toast. */
  label: 'NR' | 'Código';
  className?: string;
}

export function CodigoAcordoCopiavel({ codigo, label, className }: CodigoAcordoCopiavelProps) {
  const texto = (codigo ?? '').trim();

  // Acordo sem código ainda acontece (importação incompleta). Um botão que
  // copia string vazia seria pior que o traço de sempre.
  if (!texto) return <span className="text-muted-foreground">—</span>;

  return (
    <button
      type="button"
      title={`Clique para copiar o ${label}`}
      aria-label={`Copiar ${label} ${texto}`}
      onClick={(e) => {
        e.stopPropagation();
        void copiarTexto(texto, `${label} copiado`, `Não foi possível copiar o ${label}.`);
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/8 px-1.5 py-0.5',
        'font-mono text-[11px] font-bold text-primary transition-colors',
        'cursor-pointer hover:border-primary/40 hover:bg-primary/15',
        className,
      )}
    >
      <Hash className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{texto}</span>
    </button>
  );
}
