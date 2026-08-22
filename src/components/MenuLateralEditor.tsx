/**
 * MenuLateralEditor — reordenar as abas do menu, só para super_admin.
 *
 * Setas em vez de arrastar: o menu tem poucas abas, a lista é curta e um botão
 * de subir/descer funciona no teclado e no celular sem biblioteca nenhuma.
 * Arrastar seria mais bonito e menos acessível.
 *
 * A ordem editada aqui é a das abas VISÍVEIS para quem está editando. Isso é
 * intencional e tem uma consequência que o rodapé do diálogo declara: abas que
 * esta pessoa não enxerga não aparecem na lista e mantêm a posição que já
 * tinham. Como super_admin enxerga tudo, na prática a lista é o menu inteiro.
 *
 * Salvar vale para a empresa toda a partir do próximo carregamento de cada
 * pessoa — sem realtime, como foi pedido.
 */

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { salvarOrdemMenu } from '@/services/menuLateral.service';
import { useToast } from '@/hooks/use-toast';

export interface AbaEditavel {
  to: string;
  label: string;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** As abas na ordem em que estão hoje na tela. */
  abas: AbaEditavel[];
  empresaId?: string;
  perfilId?: string;
  /** Chamado depois de gravar, para o menu já refletir a mudança. */
  aoSalvar: (ordem: string[]) => void;
}

export function MenuLateralEditor({
  aberto, onFechar, abas, empresaId, perfilId, aoSalvar,
}: Props) {
  const { toast } = useToast();
  const [rascunho, setRascunho] = useState<AbaEditavel[]>(abas);
  const [salvando, setSalvando] = useState(false);

  // Reabrir descarta o rascunho anterior: quem fechou sem salvar não espera
  // reencontrar a edição pela metade.
  useEffect(() => { if (aberto) setRascunho(abas); }, [aberto, abas]);

  function mover(de: number, para: number) {
    if (para < 0 || para >= rascunho.length) return;
    setRascunho(atual => {
      const copia = [...atual];
      const [item] = copia.splice(de, 1);
      copia.splice(para, 0, item);
      return copia;
    });
  }

  async function salvar() {
    if (!empresaId) return;
    setSalvando(true);
    const ordem = rascunho.map(a => a.to);
    const ok = await salvarOrdemMenu(empresaId, ordem, perfilId);
    setSalvando(false);

    if (!ok) {
      toast({
        title: 'Não deu para salvar',
        description: 'A ordem do menu continua como estava. Tente de novo.',
        variant: 'destructive',
      });
      return;
    }

    aoSalvar(ordem);
    toast({
      title: 'Ordem salva',
      description: 'Vale para toda a empresa no próximo carregamento da página.',
    });
    onFechar();
  }

  async function restaurarPadrao() {
    if (!empresaId) return;
    setSalvando(true);
    const ok = await salvarOrdemMenu(empresaId, [], perfilId);
    setSalvando(false);
    if (!ok) {
      toast({ title: 'Não deu para restaurar', variant: 'destructive' });
      return;
    }
    aoSalvar([]);
    toast({ title: 'Ordem padrão restaurada' });
    onFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={v => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ordem do menu lateral</DialogTitle>
          <DialogDescription>
            Vale para todos da empresa, a partir do próximo carregamento.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[50vh] overflow-y-auto space-y-1 py-1">
          {rascunho.map((aba, i) => (
            <li
              key={aba.to}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
            >
              <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="flex-1 text-sm">{aba.label}</span>
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                disabled={i === 0}
                onClick={() => mover(i, i - 1)}
                aria-label={'Subir ' + aba.label}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                disabled={i === rascunho.length - 1}
                onClick={() => mover(i, i + 1)}
                aria-label={'Descer ' + aba.label}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          Abas que você não enxerga não aparecem aqui e mantêm a posição atual.
          Aba nova criada depois entra no fim da lista.
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={restaurarPadrao} disabled={salvando} className="gap-2">
            <RotateCcw className="h-3.5 w-3.5" />
            Padrão
          </Button>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="gap-2">
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
