/**
 * MuralOutubroConfig.tsx — o cartão de Configurações > Geral que liga o Mural
 * de Outubro para o pessoal e solta a abertura (29/10/2026).
 *
 *   Liberar para o pessoal   o bueiro e os avisos aparecem para todos, no
 *                            ponto da semana em que estamos
 *   Soltar a abertura agora  em 2 min 30 s (migration 20261029233000): o
 *                            barquinho cai no bueiro, a mão sai com ele e os
 *                            2 minutos com o «Participar»; quem participou vê
 *                            a tela desmanchar, os outros ganham o botão do
 *                            mural na barra. Sem isso, sexta 30/10, 16h
 *   Ver o bueiro em mim      o bueiro, os balões e o barquinho com a mão, só
 *                            nesta aba, a cada poucos segundos, até parar
 *   Ver a abertura em mim    só nesta aba, nada gravado, não gasta a vez
 *   O prêmio das Lendas      quem das três já clicou e quem ganhou (sorteio
 *                            do banco, 20261030120000); «Zerar» apaga os dois
 *
 * Só super_admin — as funções `fn_mural_outubro_*` conferem de novo no banco.
 * Ver `PortalOutubro/liberacao.ts`.
 */
import { useState } from 'react';
import { Castle, Eye, Loader2, Play, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  aberturaDe, alternarPreviaDoBueiro, cancelarAbertura, liberarMural, soltarAbertura, useLiberacaoDoMural,
  usePreviaDoBueiro, verPrevia,
} from '@/components/PortalOutubro/liberacao';
import { dataCurta, estadoDoPortal, relogioDaContagem, type EstadoDoPortal } from '@/components/PortalOutubro/fases';
import { useAgoraDoPortal } from '@/components/PortalOutubro/relogio';
import { usePremioDasLendas, zerarPremioDasLendas } from '@/components/PortalOutubro/premio';
import { LENDAS } from '@/components/PortalOutubro/dados';

/** O que o pessoal vê agora, em uma frase. */
function oQueAparece(e: EstadoDoPortal): string {
  if (e.fase === 'fora') return e.dia === 0 ? 'A semana do mural ainda não começou.' : 'O mural já acabou (fim de sábado).';
  if (e.fase === 'aberto') return 'O mural está aberto: quem participou e ainda não viu ganha a abertura ao voltar para a aba; os outros, o botão «Mural de outubro» na barra.';
  if (e.fase === 'final') return `O barquinho caiu e a mão saiu com ele: a contagem com o «Participar», revela em ${relogioDaContagem(e.faltaMs)}.`;
  switch (e.dia) {
    case 1: case 2: return 'O bueiro no alto da tela com os olhos, e de vez em quando um balão.';
    case 3: return 'O bueiro começa a brilhar por dentro; balões mais vezes.';
    case 4: return 'O bueiro treme e aparece o bilhete «Amanhã, às 16h.»';
    case 5: return `A contagem «O mural abre em ${relogioDaContagem(e.faltaMs)}», e balões quase sem parar perto da hora.`;
    default: return '';
  }
}

const DIA_DA_SEMANA = ['', 'segunda (dia 1 de 5)', 'terça (dia 2 de 5)', 'quarta (dia 3 de 5)', 'quinta (dia 4 de 5)', 'sexta (dia 5 de 5)', 'sábado'];

type Pergunta = null | 'liberar' | 'recolher' | 'soltar' | 'zerar';

export default function MuralOutubroConfig() {
  const { empresa } = useEmpresa();
  const lib = useLiberacaoDoMural(empresa?.id);
  const agora = useAgoraDoPortal(1000);
  const estado = estadoDoPortal(agora, aberturaDe(lib));
  const [pergunta, setPergunta] = useState<Pergunta>(null);
  const [enviando, setEnviando] = useState(false);
  const previaDoBueiro = usePreviaDoBueiro();
  const premio = usePremioDasLendas();
  const ganhadora = LENDAS.find(l => l.posicao === premio.ganhador);

  const solta = lib.abreEm !== null;
  const soltaPendente = solta && estado.fase !== 'aberto';

  async function fazer(acao: () => Promise<{ erro: string | null }>, ok: string, falha: string) {
    setEnviando(true);
    const { erro } = await acao();
    setEnviando(false);
    setPergunta(null);
    if (erro) { toast.error(falha, { description: erro }); return; }
    toast.success(ok);
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Castle className="w-4 h-4 text-primary" /> Mural de Outubro
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          A retrospectiva das gincanas. Liberado, o bueiro e os avisos aparecem para todo mundo no ponto
          da semana em que estamos. A abertura (a tela desmancha e o mural aparece) passa sozinha
          sexta 30/10, 16h — ou quando você soltar aqui.
        </p>

        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs space-y-1">
          <p>
            <span className="font-medium">{lib.liberado ? 'Liberado para o pessoal' : 'Ainda não liberado'}</span>
            <span className="text-muted-foreground"> · hoje é {DIA_DA_SEMANA[estado.dia] || dataCurta(agora)}</span>
          </p>
          <p className="text-muted-foreground">
            {lib.liberado ? 'O pessoal vê agora: ' : 'Ao liberar, o pessoal vê: '}{oQueAparece(estado)}
          </p>
          {soltaPendente && (
            <p className="text-warning font-medium">Abertura solta: começa em {relogioDaContagem(estado.faltaMs)}.</p>
          )}
          {solta && estado.fase === 'aberto' && lib.abreEm !== null && (
            <p className="text-muted-foreground">Abertura solta em {dataCurta(lib.abreEm)}.</p>
          )}
          {lib.atualizadoPorNome && lib.atualizadoEm && (
            <p className="text-muted-foreground">Última mudança: {lib.atualizadoPorNome}, {dataCurta(new Date(lib.atualizadoEm).getTime())}.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {lib.liberado ? (
            <Button size="sm" variant="outline" onClick={() => setPergunta('recolher')} disabled={enviando} className="gap-1.5">
              <Undo2 className="w-3.5 h-3.5" /> Recolher
            </Button>
          ) : (
            <Button size="sm" onClick={() => setPergunta('liberar')} disabled={enviando || estado.fase === 'fora'} className="gap-1.5">
              <Castle className="w-3.5 h-3.5" /> Liberar para o pessoal
            </Button>
          )}
          {soltaPendente ? (
            <Button
              size="sm" variant="outline" disabled={enviando} className="gap-1.5"
              onClick={() => void fazer(cancelarAbertura, 'Abertura cancelada: volta para sexta, 16h.', 'Não foi possível cancelar')}
            >
              {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Cancelar a abertura
            </Button>
          ) : (
            <Button
              size="sm" onClick={() => setPergunta('soltar')} disabled={enviando || estado.fase !== 'espreitando'}
              className="gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> Soltar a abertura agora
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={alternarPreviaDoBueiro} className="gap-1.5">
            <Eye className="w-3.5 h-3.5" /> {previaDoBueiro ? 'Parar a prévia do bueiro' : 'Ver o bueiro só em mim'}
          </Button>
          <Button size="sm" variant="outline" onClick={verPrevia} className="gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Ver a abertura só em mim
          </Button>
        </div>

        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs space-y-1">
          <p className="font-medium">O prêmio das Lendas</p>
          {premio.erro ? (
            <p className="text-warning">{premio.erro}</p>
          ) : (
            <>
              <p className="text-muted-foreground">
                Só as três clicam, cada uma na própria tela. {LENDAS.map(l => `${l.nome}: ${premio.clicou.has(l.posicao) ? 'clicou' : 'ainda não'}`).join(' · ')}
              </p>
              <p className={ganhadora ? 'text-success font-medium' : 'text-muted-foreground'}>
                {ganhadora ? `Sorteado pelo banco: ${ganhadora.nome}.` : 'O banco sorteia quando a terceira clicar.'}
              </p>
            </>
          )}
          {(premio.clicou.size > 0 || ganhadora) && (
            <Button size="sm" variant="outline" onClick={() => setPergunta('zerar')} disabled={enviando} className="gap-1.5 mt-1">
              <Undo2 className="w-3.5 h-3.5" /> Zerar o prêmio
            </Button>
          )}
        </div>
      </CardContent>

      <AlertDialog open={pergunta !== null} onOpenChange={v => { if (!v && !enviando) setPergunta(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pergunta === 'liberar' && 'Liberar o mural para o pessoal?'}
              {pergunta === 'recolher' && 'Recolher o mural?'}
              {pergunta === 'soltar' && 'Soltar a abertura para todos?'}
              {pergunta === 'zerar' && 'Zerar o prêmio das Lendas?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pergunta === 'liberar' && `Todo mundo logado, nas duas empresas, passa a ver o mural da semana. Hoje: ${oQueAparece(estado)}`}
              {pergunta === 'zerar' && 'Apaga os cliques das três e o ganhador sorteado. Elas precisam clicar de novo, e o banco sorteia outra vez.'}
              {pergunta === 'recolher' && 'O bueiro, os avisos e o botão do mural somem da tela de todos. Dá para liberar de novo depois.'}
              {pergunta === 'soltar' && 'Para todo mundo logado: daqui a uns 20 segundos o barquinho cai no bueiro, a mão sai com ele e começam os 2 minutos com o botão «Participar». Quando zera, quem participou vê a tela desmanchar e o mural; os outros ganham o botão do mural na barra. Também libera o mural, se ainda não estiver.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Ainda não</AlertDialogCancel>
            <AlertDialogAction
              disabled={enviando}
              onClick={e => {
                e.preventDefault();
                if (pergunta === 'liberar') void fazer(() => liberarMural(true), 'Mural liberado para o pessoal.', 'Não foi possível liberar');
                if (pergunta === 'recolher') void fazer(() => liberarMural(false), 'Mural recolhido.', 'Não foi possível recolher');
                if (pergunta === 'zerar') void fazer(zerarPremioDasLendas, 'Prêmio das Lendas zerado.', 'Não foi possível zerar');
                if (pergunta === 'soltar') void fazer(soltarAbertura, 'Abertura solta: o barquinho cai em instantes.', 'Não foi possível soltar');
              }}
            >
              {enviando ? 'Enviando…' : pergunta === 'recolher' ? 'Recolher' : pergunta === 'zerar' ? 'Zerar' : pergunta === 'soltar' ? 'Soltar agora' : 'Liberar agora'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
