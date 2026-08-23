/**
 * DialogoCracha — o número do crachá, cadastrado de dentro do módulo.
 *
 * O crachá vive em `rh_dados_operadores`, e não em `perfis`, justamente para
 * não aparecer nas telas que fazem `select *` no perfil. Este diálogo é o único
 * lugar do sistema que o escreve.
 *
 * ## O crachá gravado agora não muda o fechamento de ontem
 *
 * Cada lançamento carrega `cracha_snapshot`, tirado no momento em que a
 * competência foi aberta. Cadastrar um crachá hoje aparece na competência ATUAL
 * quando ela for reaberta pela semeadura, e nunca reescreve uma folha antiga —
 * é a mesma proteção que vale para nome, equipe e setor.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { salvarCracha } from '@/services/rh/rhGestao.service';
import type { LancamentoComPercentual } from '@/hooks/useRhGestao';

export interface DialogoCrachaProps {
  /** `null` fecha o diálogo. */
  lancamento: LancamentoComPercentual | null;
  empresaId: string;
  onFechar: () => void;
  onSalvo: () => void | Promise<void>;
}

export function DialogoCracha({ lancamento, empresaId, onFechar, onSalvo }: DialogoCrachaProps) {
  const [cracha, setCracha]     = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setCracha(lancamento?.cracha_snapshot ?? '');
  }, [lancamento]);

  async function salvar() {
    if (!lancamento) return;
    setSalvando(true);
    try {
      const r = await salvarCracha({
        empresaId, operadorId: lancamento.operador_id, cracha: cracha.trim() || null,
      });
      if (!r.ok) {
        // O índice único devolve a mensagem crua do Postgres; traduzir aqui é o
        // que diz o que fazer — dois crachás iguais é erro de digitação, e o
        // erro só apareceria na hora de pagar.
        const duplicado = /duplicate key|idx_rh_cracha_unico/i.test(r.erro ?? '');
        toast.error(duplicado
          ? 'Este crachá já está cadastrado para outra pessoa.'
          : (r.erro ?? 'Não foi possível salvar o crachá.'));
        return;
      }
      toast.success('Crachá salvo.');
      await onSalvo();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={!!lancamento} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Crachá de {lancamento?.nome_snapshot}</DialogTitle>
          <DialogDescription>
            O crachá é usado apenas neste módulo — ele não aparece nas outras telas
            do Gestão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="rh-cracha" className="text-xs">Número do crachá</Label>
          <Input
            id="rh-cracha" value={cracha} onChange={e => setCracha(e.target.value)}
            placeholder="Ex.: 14582" className="h-8 text-xs font-mono"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') void salvar(); }}
          />
          <p className="text-[11px] text-muted-foreground">
            Deixe em branco para remover o crachá desta pessoa.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DialogoCracha;
