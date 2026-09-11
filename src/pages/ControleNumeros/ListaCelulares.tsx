/**
 * ListaCelulares — um cartão por aparelho, com os números dentro.
 *
 * O contador `4/6` fica no cabeçalho do cartão e o botão de cadastrar some no
 * sexto. É cortesia — a garantia é a trigger com lock no banco —, mas é a
 * cortesia que evita a pessoa digitar um número inteiro para descobrir no envio
 * que não cabia.
 *
 * ## Corrigir e excluir ficam AQUI, ao lado de cada número
 *
 * É esta a tela de quem está com o celular na mão cadastrando chip, e é aqui que
 * o erro de digitação aparece: cadastrou-se seis números e o terceiro saiu
 * errado. Até então a única saída era apagar o aparelho inteiro, com os outros
 * cinco dentro.
 *
 * As duas ações só existem enquanto o número está no Núcleo e sem operador —
 * ver `podeCorrigirNumero` e `podeExcluirNumero`. Quem recusa de verdade são as
 * triggers `fn_numeros_whatsapp_valida` e `fn_numeros_pode_excluir`.
 *
 * ## Excluir o aparelho
 *
 * A lixeira do cabeçalho abre `DialogoExcluirCelular`, que leva os números junto
 * quando todos eles ainda podem sair do cadastro. Ela fica visível mesmo quando
 * não pode: o diálogo diz o que impede, em vez de a pessoa procurar um botão que
 * sumiu sem explicação.
 */
import { Plus, Pencil, Smartphone, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  EtiquetaSituacao, EtiquetaPosse, EtiquetaMotivo,
  EtiquetaTratamento, EtiquetasOperacionais,
} from '@/components/numeros/EtiquetasNumero';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  LIMITE_POR_CELULAR, podeCorrigirNumero, podeExcluirNumero,
} from '@/services/numeros/numerosRegras';
import type { NumeroRow } from '@/services/numeros/numeros.service';
import type { CelularComNumeros } from '@/hooks/useControleNumeros';

export interface ListaCelularesProps {
  aparelhos: CelularComNumeros[];
  nomeDoSetor: (setorId: string) => string;
  podeAdministrar: boolean;
  onNovoCelular: () => void;
  onEditarCelular: (a: CelularComNumeros) => void;
  onExcluirCelular: (a: CelularComNumeros) => void;
  onNovoNumero: (a: CelularComNumeros) => void;
  onVerHistorico: (numeroId: string, numero: string) => void;
  onCorrigirNumero: (a: CelularComNumeros, n: NumeroRow) => void;
  onExcluirNumero: (a: CelularComNumeros, n: NumeroRow) => void;
}

export function ListaCelulares({
  aparelhos, nomeDoSetor, podeAdministrar,
  onNovoCelular, onEditarCelular, onExcluirCelular, onNovoNumero, onVerHistorico,
  onCorrigirNumero, onExcluirNumero,
}: ListaCelularesProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {aparelhos.length} {aparelhos.length === 1 ? 'aparelho' : 'aparelhos'}
        </p>
        {podeAdministrar && (
          <Button size="sm" onClick={onNovoCelular}>
            <Plus className="mr-1 h-4 w-4" /> Novo celular
          </Button>
        )}
      </div>

      {aparelhos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-2">
            <Smartphone className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum celular cadastrado ainda.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {aparelhos.map(a => (
            <Card key={a.celular.id} className={a.celular.ativo ? '' : 'opacity-60'}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{a.celular.identificacao}</CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {nomeDoSetor(a.celular.setor_id)}
                      {a.celular.modelo ? ` · ${a.celular.modelo}` : ''}
                      {a.celular.ativo ? '' : ' · inativo'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={a.cheio ? 'secondary' : 'outline'}>
                      {a.numeros.length}/{LIMITE_POR_CELULAR}
                    </Badge>
                    {podeAdministrar && (
                      <>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => onEditarCelular(a)}
                          aria-label={`Editar ${a.celular.identificacao}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => onExcluirCelular(a)}
                          aria-label={`Excluir ${a.celular.identificacao}`}
                          title="Excluir celular"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-2">
                {a.numeros.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem números.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {a.numeros.map(n => {
                      const estado = {
                        situacao: n.situacao, posse: n.posse,
                        operadorId: n.operador_id, tratamento: n.tratamento,
                      };
                      return (
                        <li key={n.id} className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            className="font-mono text-sm underline-offset-2 hover:underline"
                            onClick={() => onVerHistorico(n.id, n.numero)}
                          >
                            {mascararNumero(n.numero)}
                          </button>
                          <EtiquetaSituacao situacao={n.situacao} />
                          <EtiquetaPosse posse={n.posse} />
                          <EtiquetaTratamento tratamento={n.tratamento} />
                          <EtiquetaMotivo motivo={n.motivo_retorno} />
                          <EtiquetasOperacionais etiquetas={n.etiquetas} />

                          {/* `ml-auto` empurra as ações para a direita, na mesma
                              coluna em todas as linhas — sem isso elas dançavam
                              conforme a quantidade de etiquetas de cada número. */}
                          {podeAdministrar && (
                            <span className="ml-auto flex items-center gap-0.5">
                              {podeCorrigirNumero(estado) && (
                                <Button
                                  size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={() => onCorrigirNumero(a, n)}
                                  aria-label={`Corrigir ${mascararNumero(n.numero)}`}
                                  title="Corrigir número"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {podeExcluirNumero(estado) && (
                                <Button
                                  size="icon" variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => onExcluirNumero(a, n)}
                                  aria-label={`Excluir ${mascararNumero(n.numero)}`}
                                  title="Excluir do cadastro"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {podeAdministrar && !a.cheio && a.celular.ativo && (
                  <Button
                    size="sm" variant="outline" className="w-full"
                    onClick={() => onNovoNumero(a)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Número
                  </Button>
                )}
                {a.cheio && (
                  <p className="text-xs text-muted-foreground">
                    Aparelho cheio — {LIMITE_POR_CELULAR} números é o limite.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
