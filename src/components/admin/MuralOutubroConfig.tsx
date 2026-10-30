/**
 * MuralOutubroConfig.tsx — o cartão de Configurações > Geral que liga o Mural
 * de Outubro para o pessoal e começa a revelação (29/10/2026).
 *
 *   Liberar para o pessoal   o mural liga para todos (sem a revelação, ainda
 *                            não aparece nada na tela de ninguém)
 *   Começar a revelação      os 5 minutos, para todos (migration
 *                            20261029235000): o bueiro com o relógio pequeno,
 *                            faltando 2 min 45 s a água, o barco e a mão, nos
 *                            2 minutos o «Participar» do lado do bueiro; quem
 *                            participou vê a revelação, e quando ela acaba o
 *                            mural abre para todos. Sem isso, sexta 30/10:
 *                            o bueiro às 15h55, a abertura às 16h
 *   Desfazer a revelação     volta para sexta 16h (para testar de novo)
 *   Ver o bueiro em mim      o bueiro, os balões e a água com o barco e a mão,
 *                            só nesta aba, a cada minuto, até parar
 *   Ver a abertura em mim    só nesta aba, nada gravado, não gasta a vez
 *   Ensaio completo em mim   só nesta aba, nada gravado: a revelação inteira,
 *                            os mesmos 5 minutos (com o «Pular para a água»)
 *   O prêmio das Lendas      quem das três já clicou e quem ganhou (sorteio
 *                            do banco, 20261030120000); «Zerar» apaga os dois
 *
 * Só super_admin — as funções `fn_mural_outubro_*` conferem de novo no banco.
 * Ver `PortalOutubro/liberacao.ts`.
 */
import { useState } from 'react';
import { Castle, Clapperboard, Eye, Loader2, Play, Square, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  aberturaDe, alternarPreviaDoBueiro, cancelarAbertura, liberarMural, soltarAbertura, useEnsaio, useLiberacaoDoMural,
  usePreviaDoBueiro, verPrevia,
} from '@/components/PortalOutubro/liberacao';
import { comecarEnsaio, pararEnsaio } from '@/components/PortalOutubro/estado';
import { FIM, dataCurta, estadoDoPortal, relogioDaContagem, type EstadoDoPortal } from '@/components/PortalOutubro/fases';
import { useAgoraDoPortal } from '@/components/PortalOutubro/relogio';
import { usePremioDasLendas, zerarPremioDasLendas } from '@/components/PortalOutubro/premio';
import { LENDAS } from '@/components/PortalOutubro/dados';

/** O que o pessoal vê agora, em uma frase. */
function oQueAparece(e: EstadoDoPortal, agora: number): string {
  switch (e.fase) {
    case 'fora': return agora >= FIM ? 'O mural já acabou (fim de sábado).' : 'Nada ainda: a revelação começa no botão (ou sexta, 15h55).';
    case 'espreitando': return `O bueiro e o relógio pequeno: abre em ${relogioDaContagem(e.faltaMs)}.`;
    case 'final': return `A água, o barco, a mão e o «Participar» do lado do bueiro: abre em ${relogioDaContagem(e.faltaMs)}.`;
    case 'revelando': return 'A revelação passando para quem participou; o mural abre para os outros quando ela acabar.';
    case 'aberto': return 'O mural está aberto: o botão «Mural de outubro» na barra para todos (quem participou e não viu ganha a revelação ao voltar para a aba).';
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
  const ensaio = useEnsaio();
  const premio = usePremioDasLendas();
  const ganhadora = LENDAS.find(l => l.posicao === premio.ganhador);

  const solta = lib.abreEm !== null;
  const soltaPendente = solta && estado.fase !== 'aberto' && estado.fase !== 'revelando';
  const acabou = agora >= FIM;

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
          A retrospectiva das gincanas. A revelação dura 5 minutos, para todo mundo ao mesmo tempo: o bueiro
          com o relógio pequeno, faltando 2 min 45 s a água e o barquinho, nos 2 minutos a mão com o barco e o
          «Participar» do lado do bueiro; quem participou vê a revelação, e quando ela acaba o mural abre para
          todos. Começa no botão abaixo — ou sozinha, sexta 30/10, com a abertura às 16h.
        </p>

        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs space-y-1">
          <p>
            <span className="font-medium">{lib.liberado ? 'Liberado para o pessoal' : 'Ainda não liberado'}</span>
            <span className="text-muted-foreground"> · hoje é {DIA_DA_SEMANA[estado.dia] || dataCurta(agora)}</span>
          </p>
          <p className="text-muted-foreground">
            {lib.liberado ? 'O pessoal vê agora: ' : 'Ao liberar, o pessoal vê: '}{oQueAparece(estado, agora)}
          </p>
          {soltaPendente && (
            <p className="text-warning font-medium">Revelação começada: abre em {relogioDaContagem(estado.faltaMs)}.</p>
          )}
          {solta && !soltaPendente && lib.abreEm !== null && (
            <p className="text-muted-foreground">Abertura em {dataCurta(lib.abreEm)}.</p>
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
            <Button size="sm" onClick={() => setPergunta('liberar')} disabled={enviando || acabou} className="gap-1.5">
              <Castle className="w-3.5 h-3.5" /> Liberar para o pessoal
            </Button>
          )}
          {solta ? (
            <Button
              size="sm" variant="outline" disabled={enviando} className="gap-1.5"
              onClick={() => void fazer(cancelarAbertura, 'Revelação desfeita: volta para sexta, 16h.', 'Não foi possível desfazer')}
            >
              {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} {soltaPendente ? 'Cancelar a revelação' : 'Desfazer a revelação (volta para sexta, 16h)'}
            </Button>
          ) : (
            <Button
              size="sm" onClick={() => setPergunta('soltar')} disabled={enviando || acabou || estado.fase !== 'fora'}
              className="gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> Começar a revelação (5 min)
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={alternarPreviaDoBueiro} className="gap-1.5">
            <Eye className="w-3.5 h-3.5" /> {previaDoBueiro ? 'Parar a prévia do bueiro' : 'Ver o bueiro só em mim'}
          </Button>
          <Button size="sm" variant="outline" onClick={verPrevia} className="gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Ver a abertura só em mim
          </Button>
          <Button size="sm" variant={ensaio ? 'default' : 'outline'} onClick={ensaio ? pararEnsaio : comecarEnsaio} className="gap-1.5">
            {ensaio ? <Square className="w-3.5 h-3.5" /> : <Clapperboard className="w-3.5 h-3.5" />}
            {ensaio ? 'Parar o ensaio' : 'Ensaio completo só em mim'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          O ensaio passa a revelação inteira nesta aba, os mesmos 5 minutos, do jeito que o pessoal vai ver, sem
          gravar nada para ninguém. No canto da tela ficam o «Pular para a água» (para não esperar o bueiro) e o
          «Parar o ensaio». Participando, a revelação começa quando zerar; sem participar, o botão do mural aparece
          na barra quando ela acaba.
        </p>

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
              {pergunta === 'soltar' && 'Começar a revelação para todos?'}
              {pergunta === 'zerar' && 'Zerar o prêmio das Lendas?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pergunta === 'liberar' && `Todo mundo logado, nas duas empresas, passa a ver o mural. Agora: ${oQueAparece(estado, agora)}`}
              {pergunta === 'zerar' && 'Apaga os cliques das três e o ganhador sorteado. Elas precisam clicar de novo, e o banco sorteia outra vez.'}
              {pergunta === 'recolher' && 'O bueiro, os avisos e o botão do mural somem da tela de todos. Dá para liberar de novo depois.'}
              {pergunta === 'soltar' && 'Para todo mundo logado, agora: o bueiro aparece com o relógio de 5 minutos; faltando 2 min 45 s vem a água e o barquinho, e nos 2 minutos a mão sai com ele e aparece o «Participar». Quando zera, quem participou vê a revelação; quando ela acaba, o mural abre para todos. Também libera o mural, se ainda não estiver.'}
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
                if (pergunta === 'soltar') void fazer(soltarAbertura, 'Revelação começada: o bueiro já está na tela de todos.', 'Não foi possível começar');
              }}
            >
              {enviando ? 'Enviando…' : pergunta === 'recolher' ? 'Recolher' : pergunta === 'zerar' ? 'Zerar' : pergunta === 'soltar' ? 'Começar agora' : 'Liberar agora'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
