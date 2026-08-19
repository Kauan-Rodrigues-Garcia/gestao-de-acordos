/**
 * DialogoTransferencia.tsx — a confirmação de mover alguém de setor ou empresa.
 *
 * ## Por que uma tela só para isto
 *
 * Antes a transferência acontecia sem confirmação: bastava trocar o campo Setor
 * ou Empresa e salvar. Os dois faziam coisas diferentes e nenhum dizia qual:
 * setor mantinha as tabulações (carimbadas no setor antigo, contando lá para
 * sempre) e empresa APAGAVA todas, sem perguntar.
 *
 * Esta tela existe para que as três coisas que mudam apareçam ANTES de mudarem:
 * quantas tabulações estão em jogo, o que acontece com elas, e o que fica na
 * equipe de origem.
 *
 * ## As duas escolhas
 *
 * **Chegar limpo** é o padrão, e o único caminho na troca de empresa. Baixa o
 * relatório e apaga o histórico — os NRs voltam a ficar livres para outros
 * tabularem.
 *
 * **Levar as tabulações** só aparece na troca de setor. É rara de propósito: o
 * texto diz isso, porque uma opção que parece simétrica convida ao clique
 * errado.
 */
import { useEffect, useState } from 'react';
import { ArrowRightLeft, Loader2, AlertTriangle, FileDown, Users2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { preverTransferencia, type AlvoTransferencia, type PreviaTransferencia }
  from '@/services/admin/transferenciaUsuario.service';
import { cn } from '@/lib/utils';

interface Props {
  aberto: boolean;
  /** `null` enquanto nada foi pedido — o diálogo não busca prévia à toa. */
  alvo: AlvoTransferencia | null;
  origemSetorNome: string;
  destinoSetorNome: string;
  origemEmpresaNome: string;
  destinoEmpresaNome: string;
  salvando: boolean;
  onCancelar: () => void;
  onConfirmar: (levarAcordos: boolean) => void;
}

export function DialogoTransferencia({
  aberto, alvo, origemSetorNome, destinoSetorNome,
  origemEmpresaNome, destinoEmpresaNome, salvando, onCancelar, onConfirmar,
}: Props) {
  const [previa, setPrevia] = useState<PreviaTransferencia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [levarAcordos, setLevarAcordos] = useState(false);

  useEffect(() => {
    if (!aberto || !alvo) { setPrevia(null); return; }
    let cancelado = false;
    setCarregando(true);
    // Toda abertura recomeça em "chegar limpo": é o padrão, e herdar a escolha
    // da transferência anterior é como se apaga um histórico sem querer.
    setLevarAcordos(false);
    void preverTransferencia(alvo).then(p => {
      if (!cancelado) { setPrevia(p); setCarregando(false); }
    });
    return () => { cancelado = true; };
  }, [aberto, alvo]);

  const trocaDeEmpresa = previa?.tipo === 'empresa';
  const bloqueado = !!previa?.impedimento;
  const acordos = previa?.acordos ?? 0;

  return (
    <AlertDialog open={aberto} onOpenChange={o => { if (!o && !salvando) onCancelar(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Transferir {alvo?.nome ?? 'usuário'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              {carregando ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Verificando o que será movido…
                </p>
              ) : (
                <>
                  {/* De onde, para onde */}
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1">
                    {trocaDeEmpresa && (
                      <p className="flex items-center gap-2 flex-wrap">
                        <span className="text-muted-foreground">Empresa:</span>
                        <strong>{origemEmpresaNome}</strong>
                        <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                        <strong>{destinoEmpresaNome}</strong>
                      </p>
                    )}
                    <p className="flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground">Setor:</span>
                      <strong>{origemSetorNome}</strong>
                      <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                      <strong>{destinoSetorNome}</strong>
                    </p>
                  </div>

                  {bloqueado ? (
                    <p className="flex items-start gap-2 text-sm text-destructive">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{previa?.impedimento}</span>
                    </p>
                  ) : (
                    <>
                      {/* A escolha. Só troca de setor a tem. */}
                      {!trocaDeEmpresa && acordos > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            As {acordos.toLocaleString('pt-BR')} tabulações dele
                          </p>
                          <OpcaoRadio
                            marcada={!levarAcordos}
                            onEscolher={() => setLevarAcordos(false)}
                            titulo="Chegar limpo no setor novo"
                            detalhe="Baixa o relatório das tabulações e apaga o histórico. Os NRs voltam a ficar livres para outros tabularem."
                            icone={<FileDown className="w-4 h-4" />}
                          />
                          <OpcaoRadio
                            marcada={levarAcordos}
                            onEscolher={() => setLevarAcordos(true)}
                            titulo="Levar as tabulações junto"
                            detalhe="As tabulações mudam de setor com ele e os vínculos (EXTRA/pareado) continuam de pé. Nada é apagado. Use só quando o setor inteiro mudou de nome na prática."
                            icone={<Users2 className="w-4 h-4" />}
                          />
                        </div>
                      )}

                      {trocaDeEmpresa && acordos > 0 && (
                        <p className="text-sm">
                          As <strong>{acordos.toLocaleString('pt-BR')}</strong> tabulações
                          dele em {origemEmpresaNome} serão apagadas e o relatório
                          será baixado antes. Troca de empresa não leva tabulação:
                          são cadastros de clientes de CNPJs diferentes.
                        </p>
                      )}

                      {acordos === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Ele não tem nenhuma tabulação — não há histórico a mover nem a apagar.
                        </p>
                      )}

                      {/* O que fica para trás */}
                      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs space-y-1.5">
                        <p>
                          <strong>O recebimento dele continua na equipe de origem</strong> até
                          o fim deste mês, marcado como transferido. A liderança de lá decide
                          se tira.
                        </p>
                        {(previa?.clones ?? 0) > 0 && (
                          trocaDeEmpresa ? (
                            <p className="text-muted-foreground">
                              Ele sai das {previa?.clones} equipe(s) em que era clone: elas
                              pertencem ao CNPJ que ele está deixando.
                            </p>
                          ) : (
                            <p className="text-muted-foreground">
                              Ele CONTINUA nas {previa?.clones} equipe(s) em que é clone, com o
                              recebimento contando lá. Quem tira é a liderança de cada uma,
                              na tela de Equipes.
                            </p>
                          )
                        )}
                        <p className="text-muted-foreground">
                          Dá para desfazer depois: volta empresa, setor, equipe e clones.
                          {!levarAcordos && acordos > 0
                            && ' Tabulação apagada NÃO volta — o relatório baixado é o registro.'}
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={e => { e.preventDefault(); onConfirmar(levarAcordos); }}
            disabled={salvando || carregando || bloqueado}
            className="gap-1.5"
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            {salvando ? 'Transferindo…' : 'Confirmar transferência'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Opção de rádio desenhada como cartão.
 *
 * `<button>` em vez de `<input type=radio>` porque o alvo de clique é o cartão
 * inteiro, com título e explicação — e é a explicação que evita o clique errado
 * na opção rara.
 */
function OpcaoRadio({ marcada, onEscolher, titulo, detalhe, icone }: {
  marcada: boolean;
  onEscolher: () => void;
  titulo: string;
  detalhe: string;
  icone: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcada}
      onClick={onEscolher}
      className={cn(
        'w-full text-left rounded-md border p-2.5 flex gap-2.5 transition-colors',
        marcada
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40 hover:bg-muted/40',
      )}
    >
      <span className={cn('mt-0.5 shrink-0', marcada ? 'text-primary' : 'text-muted-foreground')}>
        {icone}
      </span>
      <span className="space-y-0.5">
        <span className={cn('block text-sm font-medium', marcada && 'text-primary')}>
          {titulo}
        </span>
        <span className="block text-xs text-muted-foreground leading-snug">{detalhe}</span>
      </span>
    </button>
  );
}
