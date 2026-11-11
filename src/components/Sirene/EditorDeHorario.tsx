/**
 * EditorDeHorario — criar ou editar um horário da sirene numa janela própria
 * (11/11/2026). Antes era um quadro dentro do cartão, com tudo apertado.
 *
 *   1 Quando      hora e dias (com «Seg a Sex», «Todos os dias»)
 *   2 Para quem   `EscolhaDeQuemOuve`
 *   3 Como toca   cor, duração, volume e o texto na tela
 *
 * Horário novo vem SEM hora, SEM dias e SEM ninguém escolhido (pedido de
 * 11/11/2026: «já vem tudo selecionado»). O «Salvar» diz o que falta.
 */
import { useEffect, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Etapa, EscolhaDeCor, EscolhaDeDias, EscolhaDeDuracao, EscolhaDeVolume } from './CamposDaSirene';
import { EscolhaDeQuemOuve } from './EscolhaDeQuemOuve';
import { DURACAO_PADRAO_S, duracaoSegura, type CorDaSirene } from './horario';
import { faltaNoHorario, juntar, type EquipeDaSirene, type HorarioNaTela, type SetorDaSirene } from './quemOuve';

interface Props {
  /** `null`: janela fechada. */
  horario: HorarioNaTela | null;
  setores: readonly SetorDaSirene[];
  equipes: readonly EquipeDaSirene[];
  salvando: boolean;
  onSalvar: (h: HorarioNaTela) => void;
  onTestar: (cor: CorDaSirene, duracaoS: number, volume: number) => void;
  onFechar: () => void;
}

export function EditorDeHorario({ horario, setores, equipes, salvando, onSalvar, onTestar, onFechar }: Props) {
  const [h, setH] = useState<HorarioNaTela | null>(horario);
  const [duracao, setDuracao] = useState(String(horario?.duracao_s ?? DURACAO_PADRAO_S));
  useEffect(() => { setH(horario); setDuracao(String(horario?.duracao_s ?? DURACAO_PADRAO_S)); }, [horario]);

  const falta = h ? faltaNoHorario(h) : [];
  const mudar = (parte: Partial<HorarioNaTela>) => setH(atual => (atual ? { ...atual, ...parte } : atual));

  return (
    <Dialog open={!!horario} onOpenChange={aberto => { if (!aberto && !salvando) onFechar(); }}>
      <DialogContent className="max-w-2xl gap-5">
        <DialogHeader>
          <DialogTitle>{horario?.id ? 'Editar horário da sirene' : 'Novo horário da sirene'}</DialogTitle>
          <DialogDescription>Escolha quando toca, para quem, e como.</DialogDescription>
        </DialogHeader>

        {h && (
          <div className="space-y-6">
            <Etapa n={1} titulo="Quando">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="sirene-hora" className="text-xs text-muted-foreground">Hora</Label>
                  <Input id="sirene-hora" type="time" value={h.hora} onChange={e => mudar({ hora: e.target.value })} className="h-9 w-32 text-sm" />
                  <span className="text-xs text-muted-foreground">horário de Brasília</span>
                </div>
                <EscolhaDeDias valor={h.dias} onMudar={dias => mudar({ dias })} />
              </div>
            </Etapa>

            <Etapa n={2} titulo="Para quem toca">
              <EscolhaDeQuemOuve id="sirene-horario" setores={setores} equipes={equipes} valor={h.alvo} onMudar={alvo => mudar({ alvo })} />
            </Etapa>

            <Etapa n={3} titulo="Como toca">
              <div className="space-y-3">
                <EscolhaDeCor valor={h.cor} onMudar={cor => mudar({ cor })} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Duração</p>
                    <EscolhaDeDuracao id="sirene-dur" valor={duracao} onMudar={setDuracao} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Volume</p>
                    <EscolhaDeVolume id="sirene-vol" valor={h.volume} onMudar={volume => mudar({ volume })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sirene-desc" className="text-xs text-muted-foreground">Texto na tela (opcional)</Label>
                  <Input id="sirene-desc" maxLength={80} value={h.descricao} placeholder="Ex.: Hora do café"
                    onChange={e => mudar({ descricao: e.target.value })} className="h-9 text-sm" />
                </div>
              </div>
            </Etapa>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
          <p className="text-xs text-warning">{falta.length > 0 && `Falta escolher ${juntar(falta)}.`}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" className="gap-1.5" disabled={!h} onClick={() => h && onTestar(h.cor, duracaoSegura(duracao), h.volume)}>
              <Eye className="h-4 w-4" /> Testar em mim
            </Button>
            <Button variant="ghost" disabled={salvando} onClick={onFechar}>Cancelar</Button>
            <Button className="gap-1.5" disabled={!h || falta.length > 0 || salvando}
              onClick={() => h && onSalvar({ ...h, duracao_s: duracaoSegura(duracao) })}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
