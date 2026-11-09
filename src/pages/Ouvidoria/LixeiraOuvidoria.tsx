/**
 * LixeiraOuvidoria — as manifestações excluídas do setor (só quem gerencia).
 *
 * Restaurar devolve à lista com tudo (linha do tempo, anexos, grupo). Apagar
 * de vez é o único DELETE de verdade: some do banco, os anexos saem do balde,
 * e só a auditoria (Configurações › Logs) guarda o registro.
 */
import { useState } from 'react';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { apagarDeVez, restaurarManifestacao } from '@/services/ouvidoriaCofen.service';
import { useOuvidoria } from './contexto';
import { dataBr, rotuloAssunto, type Manifestacao } from './ouvidoria';

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', ' às');
}

export function LixeiraOuvidoria({ aberta, aoFechar, itens }: {
  aberta: boolean; aoFechar: () => void; itens: readonly Manifestacao[];
}) {
  const { recarregar } = useOuvidoria();
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function restaurar(m: Manifestacao) {
    setOcupado(m.id);
    try {
      await restaurarManifestacao(m.id);
      toast.success(`${m.codigo} voltou para a lista.`);
      recarregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function apagar(m: Manifestacao) {
    if (!window.confirm(`Apagar ${m.codigo} de vez? Não dá para desfazer: a manifestação, a linha do tempo e os anexos somem.`)) return;
    setOcupado(m.id);
    try {
      const { arquivosQueFicaram } = await apagarDeVez(m.id);
      if (arquivosQueFicaram) {
        toast.warning(`${m.codigo} apagada. ${arquivosQueFicaram} arquivo(s) não saíram do balde — apague em Supabase › Storage › ouvidoria.`);
      } else {
        toast.success(`${m.codigo} apagada de vez.`);
      }
      recarregar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Dialog open={aberta} onOpenChange={o => { if (!o) aoFechar(); }}>
      <DialogContent className="max-w-2xl max-h-[86vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Lixeira da Ouvidoria</DialogTitle>
          <DialogDescription>
            O que foi excluído no setor. Restaurar devolve com tudo; apagar de vez não tem volta.
          </DialogDescription>
        </DialogHeader>
        {itens.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">A lixeira está vazia.</p>
        ) : (
          <ul className="flex-1 overflow-y-auto divide-y rounded-lg border">
            {itens.map(m => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    <span className="font-mono text-xs">{m.codigo}</span> · {m.nome_profissional}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {rotuloAssunto(m.assunto)} · manifestação de {dataBr(m.data_manifestacao)}
                    {m.excluido_em ? ` · excluída ${quando(m.excluido_em)}` : ''}
                    {m.excluido_por_nome ? ` por ${m.excluido_por_nome}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!!ocupado} onClick={() => void restaurar(m)}>
                  {ocupado === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
                  Restaurar
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={!!ocupado} onClick={() => void apagar(m)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Apagar de vez
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
