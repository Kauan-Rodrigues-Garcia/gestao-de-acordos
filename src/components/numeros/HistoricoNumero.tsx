/**
 * HistoricoNumero — o caminho de um número, do mais recente para o mais antigo.
 *
 * Vive em `components/` e não dentro de uma das duas páginas porque as DUAS o
 * usam: o Núcleo abre o histórico para saber o que tratar, e a liderança abre
 * para saber por onde o número andou. É o mesmo dado visto do mesmo jeito.
 *
 * ## A tela não interpreta código
 *
 * `descricao` chega pronta do banco, montada por `fn_numeros_movimentacao` em
 * português. Aqui não há `switch (tipo)` traduzindo — o que se lê é o que foi
 * gravado na hora do fato, e continua igual mesmo que alguém renomeie um setor
 * amanhã.
 */
import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  listarMovimentacoes, type MovimentacaoRow,
} from '@/services/numeros/numeros.service';

export interface HistoricoNumeroProps {
  /** O número cujo caminho se quer ver. `null` fecha o diálogo. */
  numeroId: string | null;
  /** Só para o cabeçalho — evita uma consulta a mais só pelo rótulo. */
  numero?: string;
  /**
   * De onde vem a trilha. Por padrão, da tabela viva. A Lixeira de Números
   * passa a trilha GUARDADA (`listarHistoricoDaLixeira`), e aí `numeroId` é o
   * id do item na lixeira — o número em si não existe mais para consultar.
   */
  buscar?: (id: string) => Promise<MovimentacaoRow[]>;
  onFechar: () => void;
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function HistoricoNumero({
  numeroId, numero, buscar = listarMovimentacoes, onFechar,
}: HistoricoNumeroProps) {
  const [linhas, setLinhas] = useState<MovimentacaoRow[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!numeroId) { setLinhas([]); return; }
    let cancelado = false;
    setCarregando(true);
    buscar(numeroId)
      .then(m => { if (!cancelado) setLinhas(m); })
      .catch(() => { if (!cancelado) setLinhas([]); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [numeroId, buscar]);

  return (
    <Dialog open={numeroId !== null} onOpenChange={aberto => { if (!aberto) onFechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico {numero ? `de ${mascararNumero(numero)}` : ''}
          </DialogTitle>
          <DialogDescription>
            Cada movimentação deste número, da mais recente para a mais antiga.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : linhas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma movimentação registrada.
          </p>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-3">
            <ol className="space-y-3">
              {linhas.map(m => (
                <li key={m.id} className="border-l-2 border-border pl-3">
                  <p className="text-sm">{m.descricao}</p>
                  {m.observacao && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{m.observacao}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {dataHora(m.criado_em)}
                    {m.autor_nome ? ` · ${m.autor_nome}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
