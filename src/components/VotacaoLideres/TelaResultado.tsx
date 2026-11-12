/**
 * TelaResultado — o resultado liberado pela diretoria, em tela cheia, com a
 * mesma revelação pergunta a pergunta (`ResultadoVotacao`). Abre pelo card
 * «Saiu o resultado». O voto de cada um não vem: só a contagem e os desempates.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Candidato, ItemDaCedula, ResultadoDaPergunta } from './cedula';
import { ResultadoVotacao } from './ResultadoVotacao';
import { SeloDemonstracao } from './SeloDemonstracao';
import { PerfilDosGerentes } from './PerfilDosGerentes';
import { textosDo, type TipoDaVotacao } from './textos';

interface Props {
  titulo: string;
  cedula: ItemDaCedula[];
  resultados: ResultadoDaPergunta[];
  pessoas: ReadonlyMap<string, Candidato>;
  demo?: boolean;
  tipo?: TipoDaVotacao;
  onFechar: () => void;
}

export function TelaResultado({ titulo, cedula, resultados, pessoas, demo, tipo = 'lideranca', onFechar }: Props) {
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', tecla);
    return () => { document.body.style.overflow = antes; window.removeEventListener('keydown', tecla); };
  }, [onFechar]);

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-background text-foreground" role="dialog" aria-modal="true" aria-label={`Resultado: ${titulo}`}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning"><Trophy className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{textosDo(tipo).nome}</p>
            <p className="truncate text-[11px] text-muted-foreground">{titulo}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {demo && <span className="hidden sm:inline-flex"><SeloDemonstracao /></span>}
          <Button variant="ghost" size="icon" onClick={onFechar} aria-label="Fechar o resultado"><X className="h-5 w-5" /></Button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {/* Gerentes (12/11/2026): o perfil de cada um, não a revelação por categoria. */}
        {tipo === 'gerentes'
          ? <PerfilDosGerentes resultados={resultados} pessoas={pessoas} />
          : <ResultadoVotacao cedula={cedula} resultados={resultados} pessoas={pessoas} meus={{}} demo={demo} tipo={tipo} />}
      </main>
    </div>,
    document.body,
  );
}
