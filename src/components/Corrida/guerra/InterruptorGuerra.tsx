/**
 * InterruptorGuerra — o «⚔ Guerra nesta corrida» do card da Corrida, em
 * Configurações (23/10/2026). Só na de cavalos, só antes da largada; o banco
 * confere as duas coisas também (`fn_corrida_guerra_ligar`). Desligada (o
 * padrão), a corrida segue igual.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Swords } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { mensagemDoErro } from '../banco';
import { faltaMigrationGuerra, lerGuerra, ligarGuerra, useGuerra } from './banco';

export function InterruptorGuerra({ corridaId, travado = false }: { corridaId: number; travado?: boolean }) {
  const estado = useGuerra(corridaId);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { lerGuerra(corridaId).catch(() => { /* sem permissão ou sem banco: fica desligada */ }); }, [corridaId]);

  const trocar = async (ligar: boolean) => {
    setOcupado(true);
    try {
      await ligarGuerra(corridaId, ligar);
      toast.success(ligar ? 'Guerra ligada nesta corrida' : 'Guerra desligada', { description: ligar ? 'No meio da prova aparece o botão de atacar para todo mundo. O resultado da corrida não muda.' : 'A corrida segue normal.' });
    } catch (e) {
      if (faltaMigrationGuerra(e)) toast.error('Falta a guerra no banco', { description: 'Aplique a migration 20261023150000_corrida_guerra.sql. A corrida continua funcionando sem ela.' });
      else toast.error('Não deu', { description: mensagemDoErro(e) });
    } finally { setOcupado(false); }
  };

  return (
    <label className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs">
      <Swords className="h-4 w-4 text-destructive" />
      <span className="font-semibold">Guerra nesta corrida</span>
      <Switch checked={!!estado?.ligada} disabled={ocupado || travado} onCheckedChange={v => void trocar(v)} aria-label="Guerra nesta corrida" />
      <span className="text-muted-foreground">No meio da prova a corrida vira guerra: todo mundo ataca, os cavalos caem, e o último vira o Cavalo da Guerra na página.</span>
    </label>
  );
}
