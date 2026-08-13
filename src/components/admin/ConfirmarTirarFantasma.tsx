/**
 * ConfirmarTirarFantasma.tsx — "tirar da equipe" pede confirmação, com o valor.
 *
 * ## Por que existe
 *
 * Tirar o fantasma é um clique pequeno com efeito grande: o recebimento do mês
 * daquela pessoa some do card da equipe, e o líder que clicou raramente sabe de
 * cabeça quanto era. A confirmação existe para pôr o número na frente do
 * clique — não para criar atrito.
 *
 * ## Os dois caminhos são o mesmo registro
 *
 * O botão aparece em dois lugares: no card do operador na aba Analítico e no
 * card esmaecido do quadro de membros (aba Equipes). Os dois desligam o MESMO
 * `fantasma_ativo`, então tirar num tira nos dois — e esta tela é a mesma nos
 * dois para que a frase também seja.
 *
 * ## O que NÃO acontece
 *
 * Nada é apagado. As linhas do analítico continuam lá, com o `operador_id`
 * dela; elas só deixam de ter equipe, e por isso deixam de somar em qualquer
 * card de equipe. O total da EMPRESA e o do SETOR não mudam: aqueles somam pelo
 * carimbo do relatório, que não depende de quem é a pessoa hoje. A confirmação
 * diz isso, porque "vai tirar o valor" soa como "vai apagar o dinheiro".
 */
import { useEffect, useState } from 'react';
import { Loader2, UserMinus } from 'lucide-react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { buscarValorDoFantasma } from '@/services/analitico/analitico.service';

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  /** `null` = fechado. Preenchido = confirmando a saída desta pessoa. */
  alvo: { perfilId: string; nome: string; equipeNome: string } | null;
  empresaId: string;
  mes: string;
  removendo: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}

export function ConfirmarTirarFantasma({
  alvo, empresaId, mes, removendo, onCancelar, onConfirmar,
}: Props) {
  const [valor, setValor] = useState<{ total: number; linhas: number } | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!alvo) { setValor(null); return; }
    let cancelado = false;
    setCarregando(true);
    void buscarValorDoFantasma(empresaId, mes, alvo.perfilId).then(v => {
      if (!cancelado) { setValor(v); setCarregando(false); }
    });
    return () => { cancelado = true; };
  }, [alvo, empresaId, mes]);

  return (
    <AlertDialog open={!!alvo} onOpenChange={o => { if (!o && !removendo) onCancelar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <UserMinus className="w-5 h-5 text-destructive" />
            Tirar da equipe
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left text-sm">
              <p>
                <strong>{alvo?.nome ?? 'Este usuário'}</strong> foi transferido e ainda
                conta em <strong>{alvo?.equipeNome ?? 'sua equipe de origem'}</strong>.
              </p>

              {carregando ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Calculando o valor…
                </p>
              ) : (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                  A equipe perde <strong>{formatBRL(valor?.total ?? 0)}</strong>
                  {(valor?.linhas ?? 0) > 0 && ` (${valor?.linhas} recebimento${
                    valor?.linhas === 1 ? '' : 's'})`} neste mês.
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                Nada é apagado. Os recebimentos continuam no total da empresa e do
                setor — eles só deixam de somar em qualquer equipe. Dá para voltar
                atrás desfazendo a transferência.
              </p>
              <p className="text-xs text-muted-foreground">
                Vale para as duas telas: o card dele some da aba Analítico e do
                quadro de membros.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removendo}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={e => { e.preventDefault(); onConfirmar(); }}
            disabled={removendo || carregando}
            className="bg-destructive hover:bg-destructive/90 text-white gap-1.5"
          >
            {removendo && <Loader2 className="w-4 h-4 animate-spin" />}
            {removendo ? 'Tirando…' : 'Tirar da equipe'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
