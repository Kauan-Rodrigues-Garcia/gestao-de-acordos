/**
 * DialogoNumero — cadastrar um número num aparelho, ou corrigir um já cadastrado.
 *
 * ## Um diálogo, dois verbos
 *
 * Cadastrar e corrigir pedem exatamente o mesmo do usuário: um número de
 * WhatsApp, com a mesma máscara, a mesma validação e a mesma normalização. Duas
 * telas para isso divergiriam no primeiro ajuste — alguém melhora a mensagem de
 * erro de um lado e esquece o outro.
 *
 * O que muda entre os dois é o título, o botão e o que acontece depois de
 * salvar: o cadastro segue aberto (quem cadastra um chip costuma cadastrar os
 * seis seguidos), a correção fecha.
 *
 * ## O que ele valida, e o que ele NÃO promete
 *
 * A validação aqui é para a mensagem ser boa: dizer «DDD entre 11 e 99» antes de
 * gastar uma ida ao banco é melhor do que devolver `23514` depois. As travas de
 * verdade continuam no Postgres — o `CHECK` de formato, o `UNIQUE` que recusa
 * duplicado, a trigger que conta os 6, e a que recusa corrigir um número que já
 * está com um setor.
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
import { criarNumero, corrigirNumero, type NumeroRow } from '@/services/numeros/numeros.service';
import type { CelularComNumeros } from '@/hooks/useControleNumeros';

export interface DialogoNumeroProps {
  aberto: boolean;
  empresaId: string;
  aparelho: CelularComNumeros | null;
  /**
   * O número que está sendo corrigido. `null` = cadastro novo.
   *
   * Quem recusa a correção fora de hora é a trigger `fn_numeros_whatsapp_valida`
   * (número com setor ou com operador não se corrige); a tela só oferece o botão
   * quando `podeCorrigirNumero` diz sim.
   */
  numeroEmEdicao?: NumeroRow | null;
  /** O nome do setor do aparelho, só para a frase de ajuda. */
  setorNome?: string;
  autor?: { id: string; nome: string } | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function DialogoNumero({
  aberto, empresaId, aparelho, numeroEmEdicao = null, setorNome, autor,
  onFechar, onSalvo,
}: DialogoNumeroProps) {
  const [numero, setNumero] = useState('');
  const [salvando, setSalvando] = useState(false);

  const corrigindo = numeroEmEdicao !== null;

  // Ao abrir: em branco para cadastrar, com o valor atual para corrigir. Reagir
  // ao `id` e não ao objeto evita reescrever o campo a cada releitura de
  // realtime enquanto a pessoa digita.
  useEffect(() => {
    if (aberto) setNumero(numeroEmEdicao?.numero ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, numeroEmEdicao?.id]);

  if (!aparelho) return null;

  const usados = aparelho.numeros.length;
  const problema = numero.trim() ? erroDoNumero(numero) : null;
  const normalizado = normalizarNumero(numero);
  // Salvar por igual seria uma ida ao banco para não mudar nada. Só vale para a
  // correção — no cadastro não há valor anterior com que comparar.
  const mudou = !corrigindo || normalizado !== numeroEmEdicao.numero;
  const podeSalvar =
    (corrigindo || !aparelho.cheio) && !problema && normalizado !== '' && mudou && !salvando;

  async function salvar() {
    if (!aparelho) return;
    setSalvando(true);

    const r = corrigindo
      ? await corrigirNumero(numeroEmEdicao.id, numero)
      : await criarNumero({
          empresaId,
          celularId: aparelho.celular.id,
          setorId: aparelho.celular.setor_id,
          numero,
          autorId: autor?.id ?? null,
          autorNome: autor?.nome ?? null,
        });

    setSalvando(false);

    if (!r.ok) {
      toast.error(r.erro ?? (corrigindo
        ? 'Não foi possível corrigir.'
        : 'Não foi possível cadastrar.'));
      return;
    }

    if (corrigindo) {
      toast.success('Número corrigido. A correção ficou no histórico.');
      onSalvo();
      onFechar();
      return;
    }

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
          <DialogTitle>
            {corrigindo
              ? `Corrigir número em ${aparelho.celular.identificacao}`
              : `Novo número em ${aparelho.celular.identificacao}`}
          </DialogTitle>
          <DialogDescription>
            {corrigindo ? (
              <>
                Hoje cadastrado como{' '}
                <span className="font-mono">{mascararNumero(numeroEmEdicao.numero)}</span>.
                O registro é o mesmo — o histórico e o aparelho não mudam.
              </>
            ) : (
              <>
                {usados} de {LIMITE_POR_CELULAR} ocupados.{' '}
                {aparelho.cheio
                  ? 'Este aparelho está cheio.'
                  : `Ainda ${aparelho.vagas === 1 ? 'cabe 1 número' : `cabem ${aparelho.vagas} números`}.`}
              </>
            )}
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
            disabled={!corrigindo && aparelho.cheio}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && podeSalvar) void salvar(); }}
          />
          {problema && <p className="text-xs text-destructive">{problema}</p>}
          <p className="text-xs text-muted-foreground">
            {corrigindo
              ? 'Corrigir só vale enquanto o número está no Núcleo e sem operador. '
                + 'Depois de lançado, relance ao Núcleo antes.'
              : `O número herda o setor do aparelho${setorNome ? ` — ${setorNome}` : ''}. `
                + 'Não há como escolher outro.'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            {corrigindo ? 'Cancelar' : 'Fechar'}
          </Button>
          <Button onClick={() => void salvar()} disabled={!podeSalvar}>
            {corrigindo ? 'Salvar correção' : 'Cadastrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
