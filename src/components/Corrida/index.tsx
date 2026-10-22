/**
 * Corrida — a porta da Corrida da Sorte no `Layout` (20/10/2026).
 *
 *   <CorridaDaSorte />  decide, pelo estado da pessoa (`banco.ts`), o que
 *                       aparece: o card de divulgação, a escolha do bichinho
 *                       (só quem corre), o convite «Assistir» (só quem foi
 *                       chamado) e o palco.
 *
 * Leve de propósito: o palco (o motor, os mapas, os vídeos) só desce quando a
 * pessoa foi chamada para uma corrida — e desce com a tela já assentada
 * (`precarregarQuandoOcioso`), não no segundo em que a corrida abre para 250
 * pessoas (o que derrubou o site na Caça às Bruxas, 14/10/2026).
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Flag, Trophy } from 'lucide-react';
import { useAuthOpcional } from '@/hooks/useAuth';
import { comNovaTentativa, precarregarQuandoOcioso } from '@/lib/sobDemanda';
import { categoriaDe, ligarCorrida, useCorridaMinha, type CorridaJson, type PessoaJson } from './banco';
import { destravarAudio, nomeDaCorrida } from './nome';
import './corrida.css';

const carregarPalco = comNovaTentativa(() => import('./PalcoAoVivo'));
const carregarEscolha = comNovaTentativa(() => import('./EscolhaBichinho'));
const carregarDivulgacao = comNovaTentativa(() => import('./CardDivulgacao'));
// A corrida de cavalos (22/10/2026): a página da corrida num iframe; o que desce aqui é só a moldura.
const carregarPalcoCavalos = comNovaTentativa(() => import('./cavalos/PalcoCavalos'));
const carregarEscolhaCavalo = comNovaTentativa(() => import('./cavalos/EscolhaCavalo'));
const PalcoAoVivo = lazy(carregarPalco);
const EscolhaBichinho = lazy(carregarEscolha);
const CardDivulgacao = lazy(carregarDivulgacao);
const PalcoCavalos = lazy(carregarPalcoCavalos);
const EscolhaCavalo = lazy(carregarEscolhaCavalo);

/** «Agora não» vale para esta aba e esta fase da corrida: abriu ou largou, o convite volta. */
const chaveDispensa = (c: CorridaJson) => `corrida-dispensa:${c.id}:${c.estado}`;
const lerDispensa = (k: string) => { try { return sessionStorage.getItem(k) === '1'; } catch { return false; } };
const gravarDispensa = (k: string) => { try { sessionStorage.setItem(k, '1'); } catch { /* aba sem sessionStorage */ } };

export function CorridaDaSorte() {
  const auth = useAuthOpcional();
  const usuario = auth?.user?.id ?? null;
  const { minha } = useCorridaMinha();
  const [palco, setPalco] = useState<number | null>(null);
  const [escolhaFechada, setEscolhaFechada] = useState<number | null>(null);
  const [trocar, setTrocar] = useState(false);
  const [, forcar] = useState(0);

  useEffect(() => (usuario ? ligarCorrida(usuario) : undefined), [usuario]);

  const corrida = minha?.corrida ?? null;
  const eu = minha?.eu ?? null;
  const ativa = !!corrida && (corrida.estado === 'aberta' || corrida.estado === 'correndo');
  const cavalos = categoriaDe(corrida) === 'cavalos';

  // Chamado para uma corrida: o palco desce com a tela assentada, antes de precisar dele.
  const corridaId = corrida?.id ?? 0, chamado = !!eu, divulgacaoId = minha?.divulgacao?.id ?? 0;
  useEffect(() => (corridaId && chamado
    ? precarregarQuandoOcioso(cavalos ? [carregarPalcoCavalos, carregarEscolhaCavalo] : [carregarPalco, carregarEscolha], 10_000)
    : undefined), [corridaId, chamado, cavalos]);
  useEffect(() => (divulgacaoId ? precarregarQuandoOcioso([carregarDivulgacao], 3_000) : undefined), [divulgacaoId]);

  // A corrida acabou ou cancelaram: o palco fecha sozinho quando ela sai do estado da pessoa.
  useEffect(() => { if (palco && (!corrida || corrida.id !== palco)) setPalco(null); }, [corrida, palco]);

  const assistir = useCallback((id: number) => {
    destravarAudio(); // dentro do clique: o som da corrida fica liberado
    setPalco(id);
  }, []);
  const fecharPalco = useCallback(() => setPalco(null), []);

  if (!usuario) return null;

  const podeEscolher = !!corrida && !!eu?.corre && !corrida.gravada_em && (corrida.estado === 'preparando' || corrida.estado === 'aberta');
  const mostraEscolha = podeEscolher && ((eu!.escolha == null && escolhaFechada !== corrida!.id) || trocar);
  const dispensado = corrida ? lerDispensa(chaveDispensa(corrida)) : false;
  const mostraConvite = ativa && !palco && !mostraEscolha && !dispensado;

  return (
    <>
      {minha?.divulgacao && !palco && !mostraEscolha && !mostraConvite && (
        <Suspense fallback={null}>
          <CardDivulgacao divulgacao={minha.divulgacao} />
        </Suspense>
      )}
      {mostraEscolha && (
        <Suspense fallback={null}>
          {cavalos
            ? <EscolhaCavalo corrida={corrida!} usuario={usuario} onDepois={() => { setEscolhaFechada(corrida!.id); setTrocar(false); }} />
            : <EscolhaBichinho corrida={corrida!} usuario={usuario} escolhaAtual={eu!.escolha} onDepois={() => { setEscolhaFechada(corrida!.id); setTrocar(false); }} />}
        </Suspense>
      )}
      {mostraConvite && (
        <ConviteCorrida corrida={corrida!} eu={eu!}
          onAssistir={() => assistir(corrida!.id)}
          onDepois={() => { gravarDispensa(chaveDispensa(corrida!)); forcar(n => n + 1); }} />
      )}
      {ativa && !palco && !mostraConvite && !mostraEscolha && (
        <BotaoVoltar corrida={corrida!} onAssistir={() => assistir(corrida!.id)} />
      )}
      {/* No cavalo não tem troca: cada cavalo tem um dono, e escolheu, ele é seu até a chegada. */}
      {podeEscolher && !cavalos && !mostraEscolha && !palco && eu!.escolha != null && corrida!.estado === 'preparando' && (
        <BotaoTrocar onTrocar={() => setTrocar(true)} />
      )}
      {palco && (
        <Suspense fallback={null}>
          {cavalos ? <PalcoCavalos corridaId={palco} onFechar={fecharPalco} /> : <PalcoAoVivo corridaId={palco} onFechar={fecharPalco} />}
        </Suspense>
      )}
    </>
  );
}

function ConviteCorrida({ corrida, eu, onAssistir, onDepois }: { corrida: CorridaJson; eu: PessoaJson; onAssistir: () => void; onDepois: () => void }) {
  const largou = corrida.estado === 'correndo';
  const cavalos = categoriaDe(corrida) === 'cavalos', NOME_CORRIDA = nomeDaCorrida(categoriaDe(corrida));
  return (
    <div className="fixed inset-0 z-[84] grid place-items-center bg-[#04060d]/55 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="cds-convite-titulo">
      <div className="relative w-full max-w-[440px] overflow-hidden rounded-[18px] border border-[#ffd678]/55 bg-gradient-to-b from-[#16203c] to-[#0b1022] px-6 pb-6 pt-9 text-center text-[#e8eefc] shadow-[0_30px_80px_rgba(0,0,0,.65),0_0_70px_rgba(255,77,94,.22)] cds-palco cds-entra">
        <div className="cds-xadrez absolute inset-x-0 top-0 h-3" aria-hidden="true" />
        <span className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.16em] text-[#ff6b6b]">
          <i className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#ff4d5e] shadow-[0_0_10px_#ff4d5e]" aria-hidden="true" /> {largou ? 'Ao vivo' : 'Agora'}
        </span>
        <h3 id="cds-convite-titulo" className="cds-titulo mt-2 -skew-x-6 text-[32px] leading-none text-[#fff6e6] [text-shadow:2px_2px_0_#e2343f]">
          {largou ? `A ${NOME_CORRIDA} está rolando!` : `A ${NOME_CORRIDA} vai começar!`}
        </h3>
        <p className="mx-auto mt-3 max-w-[34ch] text-[15px] text-[#b8c4e0]">
          {eu.corre ? (cavalos ? 'Seu cavalo está no paddock. ' : 'Seu bichinho está no grid de largada. ') : ''}
          {corrida.corredores} {corrida.corredores === 1 ? 'pessoa correndo' : 'pessoas correndo'}.{' '}
          {cavalos ? 'Entre no paddock, dê seu palpite e veja a corrida ao vivo, junto com todo mundo.' : 'Entre para ver o sorteio do mapa e a corrida ao vivo, junto com todo mundo.'}
        </p>
        {corrida.premio && (
          <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-[#ffe68a] to-[#e0a92a] px-3 py-1 text-sm font-bold text-[#2a1a02]">
            <Trophy className="h-4 w-4" aria-hidden="true" /> Prêmio: {corrida.premio}
          </p>
        )}
        <div className="mt-5 flex flex-col items-center gap-2">
          <button type="button" onClick={onAssistir} autoFocus
            className="rounded-xl bg-[#e2343f] px-7 py-3 text-[17px] font-bold text-white shadow-[0_8px_30px_rgba(226,52,63,.4)] transition-colors hover:bg-[#f04450]">
            {largou ? 'Assistir agora' : 'Assistir à corrida'}
          </button>
          <button type="button" onClick={onDepois} className="text-[13px] text-[#8f9cbd] underline-offset-2 hover:underline">Agora não</button>
        </div>
      </div>
    </div>
  );
}

function BotaoVoltar({ corrida, onAssistir }: { corrida: CorridaJson; onAssistir: () => void }) {
  const NOME_CORRIDA = nomeDaCorrida(categoriaDe(corrida));
  return (
    <button type="button" onClick={onAssistir}
      className="fixed bottom-4 left-4 z-[70] flex items-center gap-2 rounded-full border border-[#ffd678]/50 bg-[#0b1022] px-4 py-2 text-sm font-semibold text-[#fff6e6] shadow-xl hover:border-[#ffd84d]">
      <i className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#ff4d5e]" aria-hidden="true" />
      <Flag className="h-4 w-4 text-[#ffd84d]" aria-hidden="true" />
      {corrida.estado === 'correndo' ? `${NOME_CORRIDA} ao vivo · assistir` : `${NOME_CORRIDA} · entrar no lobby`}
    </button>
  );
}

function BotaoTrocar({ onTrocar }: { onTrocar: () => void }) {
  return (
    <button type="button" onClick={onTrocar}
      className="fixed bottom-4 left-4 z-[70] flex items-center gap-2 rounded-full border border-[#ffd678]/50 bg-[#0b1022] px-4 py-2 text-sm font-semibold text-[#fff6e6] shadow-xl hover:border-[#ffd84d]">
      <Flag className="h-4 w-4 text-[#ffd84d]" aria-hidden="true" /> {nomeDaCorrida('bichinhos')}: trocar o meu bichinho
    </button>
  );
}
