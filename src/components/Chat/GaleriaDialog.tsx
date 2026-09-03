/**
 * GaleriaDialog.tsx — «ver mídia enviada», a partir da lista de conversas.
 *
 * ## Por que é um diálogo, e não o painel deslizante do grupo
 *
 * `InfoGrupoPainel` desliza POR CIMA DA CONVERSA — ele existe dentro dela, e é
 * de lá que ele nasce e para onde volta. Aqui o clique acontece na LISTA, com a
 * conversa possivelmente fechada (ou sendo outra), e não há de onde o painel
 * sair. Um diálogo é honesto sobre isso: veio de um menu, fecha e devolve a
 * pessoa exatamente onde ela estava.
 *
 * A grade em si é a mesma dos dois lugares — ver `GradeMidias`.
 */
import { Images } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { GradeMidias } from './GradeMidias';

interface Props {
  aberto: boolean;
  /** `null` quando nenhuma conversa foi escolhida — o diálogo nem monta. */
  conversaId: string | null;
  nome: string;
  onFechar: () => void;
}

export function GaleriaDialog({ aberto, conversaId, nome, onFechar }: Props) {
  return (
    <Dialog open={aberto && !!conversaId} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Images className="h-4 w-4" /> Fotos, GIFs e vídeos
          </DialogTitle>
          <DialogDescription className="text-xs">
            Tudo que já foi enviado na conversa com {nome}.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {/*
            A chave por conversa descarta o estado ao trocar de linha no menu.
            Sem ela, abrir a galeria de A e depois a de B mostraria as fotos de
            A por um quadro — o `useEffect` de limpeza roda depois da pintura.
          */}
          {conversaId && (
            <GradeMidias key={conversaId} conversaId={conversaId} ativo={aberto} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
