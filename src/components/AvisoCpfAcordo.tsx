/**
 * AvisoCpfAcordo — a faixa vermelha na linha do acordo que ainda tem CPF.
 *
 * Os acordos que já estavam no banco quando a trava entrou (migrations
 * 20260803a/b) não foram apagados nem alterados: só a empresa sabe qual é o
 * código certo de cada um. Eles sobem para o TOPO da lista com este aviso, que
 * diz onde está o CPF e o que acontece se ficar.
 *
 * Fica numa linha própria da tabela, logo abaixo da linha do acordo — assim o
 * texto tem largura inteira e não espreme as colunas dos outros registros.
 */
import { ShieldAlert } from 'lucide-react';
import { avisoCpfDoAcordo, type AcordoVerificavel } from '@/lib/cpf';

interface AvisoCpfAcordoProps {
  acordo: AcordoVerificavel;
  colSpan: number;
}

export function AvisoCpfAcordo({ acordo, colSpan }: AvisoCpfAcordoProps) {
  const aviso = avisoCpfDoAcordo(acordo);
  if (!aviso) return null;

  return (
    <tr className="border-b border-destructive/30 bg-destructive/10">
      <td colSpan={colSpan} className="px-3 py-2">
        <p className="flex items-start gap-2 text-[11px] font-medium leading-snug text-destructive">
          <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{aviso}</span>
        </p>
      </td>
    </tr>
  );
}
