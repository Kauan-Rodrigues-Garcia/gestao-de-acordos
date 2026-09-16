/**
 * SeletorPessoas — pesquisar pelo nome e marcar várias pessoas do setor.
 *
 * Pedido de 16/09/2026: «um campo pra pesquisar o nome do usuário, só que
 * clicando ali aparece também a lista dos operadores do setor, onde eu consigo
 * selecionar mais de um». O campo abre a lista inteira ao receber o foco; digitar
 * filtra. Quem está marcado aparece embaixo, com o × para tirar.
 *
 * Só as pessoas que a tela passa: a aba Comissão entrega as do setor em tela —
 * o do líder, ou o do filtro de setor para quem tem visão geral.
 *
 * `bloqueio` desabilita a pessoa com o motivo escrito ao lado (ex.: «já tem
 * exceção»): some da escolha, mas não some da lista — sumir faria a pessoa
 * procurar alguém que existe.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface PessoaSelecionavel {
  id: string;
  nome: string;
  /** Linha de apoio — a equipe. */
  detalhe?: string | null;
  /** Motivo de não poder ser escolhida. */
  bloqueio?: string | null;
}

interface SeletorPessoasProps {
  pessoas: readonly PessoaSelecionavel[];
  selecionadas: readonly string[];
  onMudar: (ids: string[]) => void;
  placeholder?: string;
  desabilitado?: boolean;
  /** Rótulo acessível do campo. */
  rotulo: string;
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function SeletorPessoas({
  pessoas, selecionadas, onMudar, placeholder = 'Pesquisar pelo nome…', desabilitado, rotulo,
}: SeletorPessoasProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const marcadas = useMemo(() => new Set(selecionadas), [selecionadas]);
  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim());
    return [...pessoas]
      .filter(p => !termo || semAcento(p.nome).includes(termo) || semAcento(p.detalhe ?? '').includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [pessoas, busca]);
  const livresVisiveis = visiveis.filter(p => !p.bloqueio);
  const todasVisiveisMarcadas = livresVisiveis.length > 0 && livresVisiveis.every(p => marcadas.has(p.id));

  const nomeDe = useMemo(() => new Map(pessoas.map(p => [p.id, p.nome])), [pessoas]);

  function alternar(id: string) {
    onMudar(marcadas.has(id) ? selecionadas.filter(x => x !== id) : [...selecionadas, id]);
  }

  function alternarVisiveis() {
    const ids = new Set(livresVisiveis.map(p => p.id));
    onMudar(todasVisiveisMarcadas
      ? selecionadas.filter(x => !ids.has(x))
      : [...new Set([...selecionadas, ...ids])]);
  }

  return (
    <div className="space-y-2">
      <div ref={caixa} className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          aria-label={rotulo}
          aria-expanded={aberto}
          role="combobox"
          className="h-8 pl-8 text-sm"
          placeholder={placeholder}
          value={busca}
          disabled={desabilitado}
          onFocus={() => setAberto(true)}
          onClick={() => setAberto(true)}
          onChange={e => { setBusca(e.target.value); setAberto(true); }}
          onKeyDown={e => { if (e.key === 'Escape') setAberto(false); }}
        />
        {aberto && !desabilitado && (
          <div
            role="listbox"
            aria-multiselectable="true"
            className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
          >
            {visiveis.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {pessoas.length === 0 ? 'Nenhuma pessoa neste setor.' : 'Ninguém com esse nome no setor.'}
              </p>
            ) : (
              <>
                {livresVisiveis.length > 1 && (
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/50">
                    <input
                      type="checkbox"
                      checked={todasVisiveisMarcadas}
                      onChange={alternarVisiveis}
                      className="h-3.5 w-3.5 cursor-pointer accent-primary"
                    />
                    {busca.trim() ? `Marcar as ${livresVisiveis.length} da busca` : `Marcar todas (${livresVisiveis.length})`}
                  </label>
                )}
                {visiveis.map(p => (
                  <label
                    key={p.id}
                    role="option"
                    aria-selected={marcadas.has(p.id)}
                    aria-disabled={!!p.bloqueio || undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                      p.bloqueio ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-accent/50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={marcadas.has(p.id)}
                      disabled={!!p.bloqueio}
                      onChange={() => alternar(p.id)}
                      className="h-3.5 w-3.5 cursor-pointer accent-primary disabled:cursor-not-allowed"
                    />
                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                    {(p.bloqueio || p.detalhe) && (
                      <span className={cn('shrink-0 truncate text-[11px]', p.bloqueio ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                        {p.bloqueio ?? p.detalhe}
                      </span>
                    )}
                  </label>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {selecionadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selecionadas.map(id => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
              {nomeDe.get(id) ?? 'Pessoa fora do setor'}
              {!desabilitado && (
                <button
                  type="button"
                  className="rounded-full text-muted-foreground hover:text-destructive"
                  aria-label={`Tirar ${nomeDe.get(id) ?? 'pessoa'}`}
                  onClick={() => alternar(id)}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {!desabilitado && selecionadas.length > 1 && (
            <button type="button" className="text-[11px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => onMudar([])}>
              Limpar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
