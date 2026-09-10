/**
 * DialogoCelular — cadastrar e editar um aparelho.
 *
 * ## O setor trava depois do primeiro número
 *
 * O campo fica desabilitado, com a explicação ao lado, quando o celular já tem
 * número vinculado. Não é preciosismo de tela: o banco levanta exceção
 * (`fn_numeros_celular_valida`), e sem o aviso a pessoa tentaria, receberia um
 * erro e não saberia o que fazer.
 *
 * A trava existe porque herdar o setor não basta sozinho — sem ela, bastaria
 * cadastrar seis números e trocar o setor do aparelho para mover seis números
 * de setor sem nenhuma movimentação registrada.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { criarCelular, editarCelular, type CelularRow } from '@/services/numeros/numeros.service';

/** O mínimo que um seletor de setor precisa saber. */
export interface SetorOpcao { id: string; nome: string }

export interface DialogoCelularProps {
  aberto: boolean;
  empresaId: string;
  /**
   * Só `id` e `nome`: é tudo o que um seletor precisa, e pedir o `Setor`
   * inteiro obrigaria quem chama a carregar colunas que a tela não usa.
   */
  setores: readonly SetorOpcao[];
  /** Quando presente, é edição. Ausente, é cadastro. */
  celular?: CelularRow | null;
  /** Quantos números o aparelho já tem — trava o setor quando maior que zero. */
  quantidadeNumeros?: number;
  autor?: { id: string; nome: string } | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function DialogoCelular({
  aberto, empresaId, setores, celular, quantidadeNumeros = 0,
  autor, onFechar, onSalvo,
}: DialogoCelularProps) {
  const [identificacao, setIdentificacao] = useState('');
  const [modelo, setModelo] = useState('');
  const [setorId, setSetorId] = useState('');
  const [salvando, setSalvando] = useState(false);

  const editando = !!celular;
  const setorTravado = editando && quantidadeNumeros > 0;

  useEffect(() => {
    if (!aberto) return;
    setIdentificacao(celular?.identificacao ?? '');
    setModelo(celular?.modelo ?? '');
    setSetorId(celular?.setor_id ?? '');
  }, [aberto, celular]);

  const podeSalvar = identificacao.trim().length > 0 && setorId !== '' && !salvando;

  async function salvar() {
    setSalvando(true);
    const r = editando
      ? await editarCelular(celular!.id, {
          identificacao,
          modelo,
          // Mandar o setor num aparelho travado faria o banco recusar a edição
          // inteira, inclusive a troca de nome que a pessoa queria fazer.
          ...(setorTravado ? {} : { setorId }),
        })
      : await criarCelular({
          empresaId, identificacao, modelo, setorId,
          autorId: autor?.id ?? null, autorNome: autor?.nome ?? null,
        });

    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar.'); return; }
    toast.success(editando ? 'Celular atualizado.' : 'Celular cadastrado.');
    onSalvo();
    onFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) onFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar celular' : 'Novo celular'}</DialogTitle>
          <DialogDescription>
            O setor do aparelho define o setor de todos os números dele.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cel-identificacao">Identificação</Label>
            <Input
              id="cel-identificacao"
              value={identificacao}
              onChange={e => setIdentificacao(e.target.value)}
              placeholder="Celular 05"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cel-modelo">Modelo (opcional)</Label>
            <Input
              id="cel-modelo"
              value={modelo}
              onChange={e => setModelo(e.target.value)}
              placeholder="Moto G54"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cel-setor">Setor</Label>
            <Select value={setorId} onValueChange={setSetorId} disabled={setorTravado}>
              <SelectTrigger id="cel-setor">
                <SelectValue placeholder="Escolha o setor" />
              </SelectTrigger>
              <SelectContent>
                {setores.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {setorTravado && (
              <p className="text-xs text-muted-foreground">
                Este aparelho já tem {quantidadeNumeros}{' '}
                {quantidadeNumeros === 1 ? 'número' : 'números'}. Para mudar de
                setor, relance os números ao Núcleo antes — ou cadastre outro
                aparelho.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={!podeSalvar}>
            {editando ? 'Salvar' : 'Cadastrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
