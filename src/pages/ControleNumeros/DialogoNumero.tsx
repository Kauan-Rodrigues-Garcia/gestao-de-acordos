/**
 * DialogoNumero — cadastrar um número num aparelho.
 *
 * ## O que ele valida, e o que ele NÃO promete
 *
 * A validação aqui é para a mensagem ser boa: dizer «DDD entre 11 e 99» antes
 * de gastar uma ida ao banco é melhor do que devolver `23514` depois. As travas
 * de verdade continuam no Postgres — o `CHECK` de formato, o `UNIQUE` que
 * recusa duplicado e a trigger que conta os 6.
 *
 * O contador `n/6` e o botão desabilitado no sexto são cortesia pela mesma
 * razão. Uma contagem feita no navegador nunca poderia prometer o limite: duas
 * pessoas cadastrando ao mesmo tempo leriam 5 as duas.
 *
 * ## A máscara não vai ao banco
 *
 * O campo mostra `(18) 99999-9999` enquanto se digita, e o que sai daqui é
 * `18999999999`. É o que faz o `UNIQUE` significar alguma coisa — sem
 * normalizar, a máscara e o número cru seriam duas linhas do mesmo chip.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { mascararNumero, erroDoNumero, normalizarNumero } from '@/services/numeros/numerosFormato';
import { LIMITE_POR_CELULAR } from '@/services/numeros/numerosRegras';
import { criarNumero } from '@/services/numeros/numeros.service';
import type { CelularComNumeros } from '@/hooks/useControleNumeros';

export interface DialogoNumeroProps {
  aberto: boolean;
  empresaId: string;
  aparelho: CelularComNumeros | null;
  /** O nome do setor do aparelho, só para a frase de ajuda. */
  setorNome?: string;
  autor?: { id: string; nome: string } | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function DialogoNumero({
  aberto, empresaId, aparelho, setorNome, autor, onFechar, onSalvo,
}: DialogoNumeroProps) {
  const [numero, setNumero] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (aberto) setNumero(''); }, [aberto]);

  if (!aparelho) return null;

  const usados = aparelho.numeros.length;
  const problema = numero.trim() ? erroDoNumero(numero) : null;
  const podeSalvar = !aparelho.cheio && !problema && normalizarNumero(numero) !== '' && !salvando;

  async function salvar() {
    if (!aparelho) return;
    setSalvando(true);
    const r = await criarNumero({
      empresaId,
      celularId: aparelho.celular.id,
      setorId: aparelho.celular.setor_id,
      numero,
      autorId: autor?.id ?? null,
      autorNome: autor?.nome ?? null,
    });
    setSalvando(false);

    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível cadastrar.'); return; }
    toast.success('Número cadastrado. Ele nasce em aquecimento.');
    onSalvo();
    // Fica aberto: quem cadastra um chip costuma cadastrar os seis seguidos.
    setNumero('');
    if (usados + 1 >= LIMITE_POR_CELULAR) onFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) onFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo número em {aparelho.celular.identificacao}</DialogTitle>
          <DialogDescription>
            {usados} de {LIMITE_POR_CELULAR} ocupados.{' '}
            {aparelho.cheio
              ? 'Este aparelho está cheio.'
              : `Ainda ${aparelho.vagas === 1 ? 'cabe 1 número' : `cabem ${aparelho.vagas} números`}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="numero-whatsapp">Número de WhatsApp</Label>
          <Input
            id="numero-whatsapp"
            value={mascararNumero(numero)}
            onChange={e => setNumero(e.target.value)}
            placeholder="(18) 99999-9999"
            inputMode="numeric"
            disabled={aparelho.cheio}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && podeSalvar) void salvar(); }}
          />
          {problema && <p className="text-xs text-destructive">{problema}</p>}
          <p className="text-xs text-muted-foreground">
            O número herda o setor do aparelho{setorNome ? ` — ${setorNome}` : ''}.
            Não há como escolher outro.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Fechar</Button>
          <Button onClick={() => void salvar()} disabled={!podeSalvar}>Cadastrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
