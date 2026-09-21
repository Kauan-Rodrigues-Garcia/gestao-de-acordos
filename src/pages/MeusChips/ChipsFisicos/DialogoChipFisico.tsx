/**
 * DialogoChipFisico — cadastrar um chip, ou corrigir o que foi cadastrado.
 *
 * No cadastro, o status já pode ser escolhido: quem está registrando os chips
 * que tem na gaveta costuma ter um banido no meio, e obrigar dois passos para
 * isso é pedir para o status ficar errado. Na correção o status sai — ele tem
 * janela própria, e misturar os dois faria corrigir um dígito reiniciar o tempo.
 *
 * O seletor de pessoa só aparece para quem cuida dos chips dos colegas. Para os
 * demais o chip é sempre de quem cadastra, e o banco confere de novo.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { erroDoNumero, mascararNumero, normalizarNumero } from '@/services/numeros/numerosFormato';
import {
  OBSERVACAO_MAX, OPERADORAS, OPERADORA_LABELS, eOperadora, erroDoTempo,
} from '@/services/chipsFisicos/chipsFisicosRegras';
import {
  alterarStatusChip, salvarChipFisico,
  type ChipFisicoRow, type PessoaChipRow,
} from '@/services/chipsFisicos/chipsFisicos.service';
import { SeletorStatusETempo, type ValorStatusETempo } from './SeletorStatusETempo';

/** O Select do Radix não aceita valor vazio. */
const SEM_OPERADORA = 'nao_informada';

export interface DialogoChipFisicoProps {
  aberto: boolean;
  /** Preenchido = correção. */
  chip: ChipFisicoRow | null;
  /** Dono sugerido no cadastro (o bloco de onde o botão foi clicado). */
  donoInicial: string | null;
  /** Quem pode receber o chip. `null` = sem seletor: o chip é de quem cadastra. */
  pessoasEscolhiveis: PessoaChipRow[] | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function DialogoChipFisico({
  aberto, chip, donoInicial, pessoasEscolhiveis, onFechar, onSalvo,
}: DialogoChipFisicoProps) {
  const editando = chip !== null;

  const [dono, setDono]             = useState<string>('');
  const [numero, setNumero]         = useState('');
  const [operadora, setOperadora]   = useState<string>(SEM_OPERADORA);
  const [observacao, setObservacao] = useState('');
  const [statusInicial, setStatusInicial] =
    useState<ValorStatusETempo>({ status: 'ativo', minutos: null });
  const [tentou, setTentou]     = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setDono(chip?.operador_id ?? donoInicial ?? '');
    setNumero(chip ? mascararNumero(chip.numero) : '');
    setOperadora(chip?.operadora ?? SEM_OPERADORA);
    setObservacao(chip?.observacao ?? '');
    setStatusInicial({ status: 'ativo', minutos: null });
    setTentou(false);
  }, [aberto, chip, donoInicial]);

  const erroNumero = numero.trim() === '' ? 'Informe o número do chip.' : erroDoNumero(numero);
  const erroTempo  = editando ? null : erroDoTempo(statusInicial.status, statusInicial.minutos);
  const erroDono   = pessoasEscolhiveis && !dono ? 'Escolha de quem é o chip.' : null;
  const invalido   = !!(erroNumero || erroTempo || erroDono);

  async function salvar() {
    setTentou(true);
    if (invalido) return;
    setSalvando(true);

    const r = await salvarChipFisico({
      id: chip?.id,
      operadorId: pessoasEscolhiveis ? dono : undefined,
      numero: normalizarNumero(numero),
      operadora: eOperadora(operadora) ? operadora : null,
      observacao,
    });
    if (!r.ok) {
      setSalvando(false);
      toast.error(r.erro ?? 'Não foi possível salvar o chip.');
      return;
    }

    if (!editando && statusInicial.status !== 'ativo' && r.dados) {
      const s = await alterarStatusChip(r.dados, statusInicial.status, statusInicial.minutos);
      if (!s.ok) {
        toast.warning(`Chip cadastrado como Ativo. O status não foi salvo: ${s.erro ?? 'erro desconhecido'}`);
      }
    }

    setSalvando(false);
    toast.success(editando ? 'Chip atualizado.' : `Chip ${mascararNumero(numero)} cadastrado.`);
    onSalvo();
    onFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a && !salvando) onFechar(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? 'Corrigir chip' : 'Adicionar chip físico'}</DialogTitle>
          <DialogDescription>
            {editando
              ? 'Número, operadora e observação. O status tem botão próprio.'
              : 'Um chip que está com a pessoa, para o setor saber o que cada um tem.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={e => { e.preventDefault(); void salvar(); }}
          noValidate
        >
          {pessoasEscolhiveis && (
            <div className="space-y-1.5">
              <Label htmlFor="chip-dono">Com quem está</Label>
              <Select value={dono} onValueChange={setDono}>
                <SelectTrigger id="chip-dono" aria-invalid={tentou && !!erroDono}>
                  <SelectValue placeholder="Escolha a pessoa" />
                </SelectTrigger>
                <SelectContent>
                  {pessoasEscolhiveis.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}{p.ativo ? '' : ' (inativo)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tentou && erroDono && <p className="text-xs text-destructive">{erroDono}</p>}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="chip-numero">Número do chip</Label>
              <Input
                id="chip-numero"
                inputMode="tel"
                autoComplete="off"
                placeholder="(18) 99999-9999"
                value={numero}
                onChange={e => setNumero(e.target.value)}
                onBlur={() => { if (!erroDoNumero(numero)) setNumero(mascararNumero(numero)); }}
                aria-invalid={tentou && !!erroNumero}
                className="font-mono"
                autoFocus
              />
              {tentou && erroNumero && <p className="text-xs text-destructive">{erroNumero}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chip-operadora">Operadora</Label>
              <Select value={operadora} onValueChange={setOperadora}>
                <SelectTrigger id="chip-operadora">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_OPERADORA}>Não informar</SelectItem>
                  {OPERADORAS.map(o => (
                    <SelectItem key={o} value={o}>{OPERADORA_LABELS[o]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!editando && (
            <SeletorStatusETempo idBase="novo-chip" valor={statusInicial} onMudar={setStatusInicial} />
          )}

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="chip-obs">Observação <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {observacao.length}/{OBSERVACAO_MAX}
              </span>
            </div>
            <Textarea
              id="chip-obs"
              rows={2}
              maxLength={OBSERVACAO_MAX}
              placeholder="Ex.: chip reserva, fica na gaveta do setor"
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || (tentou && invalido)}>
              {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {editando ? 'Salvar correção' : 'Adicionar chip'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
