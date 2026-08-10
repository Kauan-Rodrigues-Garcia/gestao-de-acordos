/**
 * ModalSetorClone — "esse usuário faz parte de 2 setores, qual deve exibir?"
 *
 * Aparece entre o clique em "Comemorar agora"/"Agendar" e a criação, e só
 * quando ALGUM homenageado está em mais de um setor. Quem trabalha num setor
 * só nunca vê este modal: não haveria o que escolher.
 *
 * Até a 20260810a a pergunta não existia — o banco unia os setores do clone
 * sozinho e a festa caía nos dois times, sempre. "Todos os setores" continua
 * disponível como resposta, e é exatamente aquele comportamento; a diferença é
 * que agora alguém escolheu.
 *
 * Uma pergunta por pessoa numa tela só: com até 12 homenageados, abrir um modal
 * por clone seria uma fila de cliques.
 */
import { Users2, PartyPopper, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { TODOS_OS_SETORES, type EscolhaDeSetor } from './clones';

export interface ModalSetorCloneProps {
  /** Vazio = fechado. São os homenageados com 2+ setores. */
  ambiguos:   EscolhaDeSetor[];
  /** operadorId → setorId escolhido, ou TODOS_OS_SETORES. */
  respostas:  Record<string, string>;
  nomeDaPessoa: (id: string) => string;
  nomeDoSetor:  (id: string) => string;
  /** Rótulo do botão de seguir — a ação que ficou esperando esta resposta. */
  agendando:  boolean;
  confirmando: boolean;
  onResponder: (operadorId: string, escolha: string) => void;
  onConfirmar: () => void;
  onCancelar:  () => void;
}

export function ModalSetorClone({
  ambiguos, respostas, nomeDaPessoa, nomeDoSetor, agendando, confirmando,
  onResponder, onConfirmar, onCancelar,
}: ModalSetorCloneProps) {
  const varios = ambiguos.length > 1;

  return (
    <Dialog open={ambiguos.length > 0} onOpenChange={(aberto) => { if (!aberto) onCancelar(); }}>
      <DialogContent className="max-w-md" aria-describedby="dlg-setor-clone-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5 shrink-0 text-primary" />
            {varios ? 'Essas pessoas trabalham em mais de um setor'
                    : 'Essa pessoa trabalha em mais de um setor'}
          </DialogTitle>
          <DialogDescription id="dlg-setor-clone-desc">
            {varios
              ? 'Escolha em qual setor cada uma deve ser comemorada.'
              : 'Escolha em qual setor a comemoração deve aparecer.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          {ambiguos.map(({ operadorId, setores }) => (
            <div key={operadorId} className="space-y-1.5">
              <Label className="text-xs font-medium">{nomeDaPessoa(operadorId)}</Label>
              <Select
                value={respostas[operadorId] ?? TODOS_OS_SETORES}
                onValueChange={(v) => onResponder(operadorId, v)}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {setores.map((s) => (
                    <SelectItem key={s} value={s}>{nomeDoSetor(s)}</SelectItem>
                  ))}
                  <SelectItem value={TODOS_OS_SETORES}>
                    Todos os setores
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      ({setores.length})
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}

          <div className="flex gap-2 border-t border-border pt-3">
            <Button variant="outline" className="flex-1" onClick={onCancelar} disabled={confirmando}>
              Cancelar
            </Button>
            <Button className="flex-1 gap-2" onClick={onConfirmar} disabled={confirmando}>
              {agendando ? <CalendarClock className="h-4 w-4" /> : <PartyPopper className="h-4 w-4" />}
              {agendando ? 'Agendar' : 'Comemorar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
