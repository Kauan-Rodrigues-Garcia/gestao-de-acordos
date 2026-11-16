/**
 * VotacaoOpcoesConfig — Configurações › Eventos e gincanas › «Votação de
 * opções» (16/11/2026, só super_admin). Em cima, as votações já liberadas
 * (contagem, quem falta, encerrar); embaixo, montar uma nova — vem com a de
 * dezembro: Sorteio de prêmios OU Happy hour no Ibis.
 *
 * O cadastro (pessoas, setores, equipes) é lido ao abrir, só leitura, pelo
 * mesmo leitor da Votação da Liderança.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { lerParticipantes, type EquipeDaVotacao, type GrupoDaVotacao, type Participante } from '@/components/VotacaoLideres/participantes';
import { MontarVotacaoOpcoes } from '@/components/VotacaoOpcoes/MontarVotacaoOpcoes';
import { PainelVotacaoOpcoes } from '@/components/VotacaoOpcoes/PainelVotacaoOpcoes';

type Dados = { pessoas: Participante[]; grupos: GrupoDaVotacao[]; equipes: EquipeDaVotacao[] };

export default function VotacaoOpcoesConfig() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [versao, setVersao] = useState(0);

  const ler = useCallback(async () => {
    setLendo(true);
    try { setDados(await lerParticipantes()); setErro(null); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não deu para ler o cadastro.'); }
    finally { setLendo(false); }
  }, []);
  useEffect(() => { void ler(); }, [ler]);

  return (
    <div className="space-y-6 rounded-xl border bg-card p-4 sm:p-5">
      <div>
        <h3 className="text-base font-semibold">Votação de opções</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Uma pergunta com 2 a 6 opções, para quem você escolher (operadores, equipes, um setor ou vários). A votação aparece na tela
          de cada um; cada pessoa vota uma vez e o voto é secreto — aqui só aparecem a contagem e quem falta.
        </p>
      </div>

      <PainelVotacaoOpcoes versao={versao} />

      <div className="border-t pt-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Nova votação</h3>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { void ler(); }} disabled={lendo}>
            <RefreshCw className={lendo ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /> Recarregar cadastro
          </Button>
        </div>
        {erro && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{erro}</p>}
        {!dados && !erro && <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo o cadastro…</p>}
        {dados && <MontarVotacaoOpcoes dados={dados} onLiberada={() => setVersao(v => v + 1)} />}
      </div>
    </div>
  );
}
