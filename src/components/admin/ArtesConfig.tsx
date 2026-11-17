/**
 * ArtesConfig — Configurações › Eventos e gincanas › «Artes para todos»
 * (17/11/2026, só super_admin). Em cima, as artes já lançadas (quem viu,
 * encerrar); embaixo, montar e lançar uma nova.
 *
 * O cadastro (pessoas e setores) é lido ao abrir, só leitura, pelo mesmo
 * leitor da Votação da Liderança — para escolher setores e contar o público.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { lerParticipantes, type GrupoDaVotacao, type Participante } from '@/components/VotacaoLideres/participantes';
import { MontarArte } from '@/components/Artes/MontarArte';
import { PainelArtes } from '@/components/Artes/PainelArtes';
import { encerrar, lancar, listar } from '@/components/Artes/banco';

const FONTE = { listar, encerrar };

export default function ArtesConfig() {
  const [dados, setDados] = useState<{ pessoas: Participante[]; grupos: GrupoDaVotacao[] } | null>(null);
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
        <h3 className="text-base font-semibold">Artes para todos</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Escolha um modelo de arte (card), preencha, escolha as cores e para quem. A arte abre sozinha na tela de cada pessoa,
          uma vez, no computador e no app do celular, enquanto estiver no ar.
        </p>
      </div>

      <PainelArtes fonte={FONTE} versao={versao} />

      <div className="border-t pt-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Nova arte</h3>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { void ler(); }} disabled={lendo}>
            <RefreshCw className={lendo ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /> Recarregar cadastro
          </Button>
        </div>
        {erro && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{erro}</p>}
        {!dados && !erro && <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo o cadastro…</p>}
        {dados && <MontarArte dados={dados} onLancar={lancar} onLancada={() => setVersao(v => v + 1)} />}
      </div>
    </div>
  );
}
