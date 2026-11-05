/**
 * PixHistoricoDialog — todo movimento de um registro do Pix: quem criou,
 * quem editou, quem aprovou, quem pagou, quem desfez, quem excluiu.
 *
 * Escrito por triggers (20260811c) — não existe caminho de escrita pelo
 * cliente, porque log que a tela grava tem furo no dia em que alguém esquece
 * de chamar. A leitura mora em `PixCabecalho`, que abre o diálogo; a busca
 * é daqui e sobrevive a fechar e abrir.
 */
import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { PixLogItem } from '@/services/pix_automatico.service';
import { PIX_LOG_ESTILO, PIX_LOG_LABEL } from './pixTelaComum';

interface Props {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  carregando: boolean;
  itens: PixLogItem[];
  podeVerDeOutros: boolean;
}

export function PixHistoricoDialog({ aberto, onAbertoChange, carregando, itens, podeVerDeOutros }: Props) {
  const [historicoBusca, setHistoricoBusca] = useState('');

  /**
   * O histórico filtrado pela busca do painel.
   *
   * Varre a frase inteira, não só o NR: "aprovou", "pagou", o nome de quem fez
   * e o do dono do registro estão todos ali. É o filtro que faz o painel
   * responder a "o que o Bryan mexeu" sem uma tela de filtros por campo.
   */
  const historicoVisivel = useMemo(() => {
    const termo = historicoBusca.trim().toLowerCase();
    if (!termo) return itens;
    return itens.filter(l =>
      `${l.nr_cliente} ${l.descricao} ${l.autor_nome ?? ''} ${l.operador_nome ?? ''} ${PIX_LOG_LABEL[l.acao]}`
        .toLowerCase()
        .includes(termo),
    );
  }, [itens, historicoBusca]);

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-w-3xl" aria-describedby="dlg-itens-pix">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            Histórico do Pix automático
          </DialogTitle>
          <DialogDescription id="dlg-itens-pix">
            Tudo o que aconteceu com os registros: criação, edição, avaliação,
            pagamento, exclusão e NR em disputa mantido com quem já tinha.
            {!podeVerDeOutros && ' Você vê o histórico dos seus registros.'}
          </DialogDescription>
        </DialogHeader>

        <Input
          value={historicoBusca}
          onChange={e => setHistoricoBusca(e.target.value)}
          placeholder="Filtrar por NR, pessoa ou ação…"
          className="h-8 text-xs"
        />

        {carregando ? (
          <div className="space-y-2 py-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
          </div>
        ) : historicoVisivel.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <History className="w-7 h-7 opacity-20" />
            <p className="text-sm">
              {itens.length === 0
                ? 'Nada registrado ainda.'
                : 'Nenhuma ação para esse filtro.'}
            </p>
          </div>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2 space-y-1.5">
            {historicoVisivel.map(item => (
              <div key={item.id}
                className="flex items-start gap-2.5 rounded-lg border border-border/60 px-2.5 py-2">
                <span className={cn(
                  'shrink-0 mt-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  PIX_LOG_ESTILO[item.acao],
                )}>
                  {PIX_LOG_LABEL[item.acao]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-relaxed break-words">{item.descricao}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {item.autor_nome ?? 'Sistema'}
                    {item.operador_nome && item.operador_nome !== item.autor_nome
                      && ` · registro de ${item.operador_nome}`}
                    {' · '}
                    <span className="font-mono">
                      {new Date(item.criado_em).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
