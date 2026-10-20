/**
 * PalcoAoVivo — o palco da corrida de verdade: a sala vem do banco (`banco.ts`)
 * e a gravação, do bucket `corridas`.
 *
 * Os arquivos descem quando a corrida é gravada. Se a largada ainda não foi
 * dada, cada tela espera um intervalo aleatório (até 12 s) antes de baixar:
 * 250 telas não pedem o mesmo arquivo no mesmo segundo. Depois da largada,
 * quem abre baixa na hora.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuthOpcional } from '@/hooks/useAuth';
import { PalcoCorrida } from './PalcoCorrida';
import { agoraBanco, assinarSala, baixarArquivo, conferirLobby, entrarNoLobby, mensagemDoErro, useCorridaMinha, type GravacaoResumo } from './banco';
import { desempacotarGravacao } from './gravacao';
import type { Gravacao, VideosDaFesta } from './motor/motor';

interface Props { corridaId: number; onFechar: () => void }

export default function PalcoAoVivo({ corridaId, onFechar }: Props) {
  const auth = useAuthOpcional();
  const eu = auth?.user?.id ?? null;
  const { sala } = useCorridaMinha();
  const [gravacao, setGravacao] = useState<{ rec: Gravacao; faixa: string[]; parada: number } | null>(null);
  const [videos, setVideos] = useState<VideosDaFesta | null>(null);

  // Entra no lobby (marca a entrada e lê a sala inteira).
  useEffect(() => {
    let vivo = true;
    entrarNoLobby(corridaId).catch(e => { if (vivo) { toast.error('Não deu para entrar na corrida', { description: mensagemDoErro(e) }); onFechar(); } });
    return () => { vivo = false; };
  }, [corridaId, onFechar]);

  // A sala ao vivo (quem foi chamado já ouve; o super_admin assistindo sem ter sido chamado, não).
  useEffect(() => assinarSala(corridaId), [corridaId]);

  // A conferência de 30 s: quem entrou e o aviso não trouxe.
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void conferirLobby(corridaId); }, 30_000);
    return () => window.clearInterval(id);
  }, [corridaId]);

  const corrida = sala && sala.corrida.id === corridaId ? sala.corrida : null;
  const resumo: GravacaoResumo | null = corrida?.gravacao ?? null;
  const largou = corrida?.estado === 'correndo' || corrida?.estado === 'encerrada';

  // A gravação e os vídeos do fim.
  useEffect(() => {
    if (!resumo?.arquivo) { setGravacao(null); setVideos(null); return; }
    let vivo = true;
    const urls: string[] = [];
    const espera = largou ? 0 : Math.random() * 12_000;
    const baixar = async (caminho: string, tentativas = 3): Promise<Blob> => {
      for (let i = 1; ; i++) {
        try { return await baixarArquivo(caminho); } catch (e) { if (i >= tentativas) throw e; await new Promise(r => setTimeout(r, 1500 * i)); }
      }
    };
    const t = window.setTimeout(async () => {
      try {
        const arq = await baixar(resumo.arquivo);
        const rec = desempacotarGravacao(new Uint8Array(await arq.arrayBuffer()));
        if (!vivo) return;
        setGravacao({ rec, faixa: resumo.faixa, parada: resumo.parada });
      } catch (e) {
        console.error('[corrida] não baixou a gravação', e);
        if (vivo) toast.error('Não deu para baixar a corrida', { description: 'Feche e abra de novo em alguns segundos.' });
        return;
      }
      // Os vídeos são do fim: sem eles, a festa é desenhada ao vivo.
      if (resumo.video && resumo.loop) {
        try {
          const [f, l] = await Promise.all([baixar(resumo.video), baixar(resumo.loop)]);
          if (!vivo) return;
          const festa = URL.createObjectURL(f), loop = URL.createObjectURL(l);
          urls.push(festa, loop);
          setVideos({ festa, loop, cues: resumo.cues ?? [], dur: resumo.dur_video ?? 26 });
        } catch (e) { console.warn('[corrida] sem os vídeos do fim; a festa vai ser desenhada aqui', e); }
      }
    }, espera);
    return () => { vivo = false; window.clearTimeout(t); urls.forEach(u => URL.revokeObjectURL(u)); };
    // `largou` só decide a espera do primeiro download: não baixa de novo quando a largada chega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumo?.arquivo, resumo?.video, resumo?.loop]);

  const pessoas = useMemo(() => sala?.pessoas ?? [], [sala?.pessoas]);
  if (!corrida) return null;
  return (
    <PalcoCorrida corrida={corrida} pessoas={pessoas} eu={eu} agora={agoraBanco}
      gravacao={gravacao} videos={videos} onFechar={onFechar} />
  );
}
