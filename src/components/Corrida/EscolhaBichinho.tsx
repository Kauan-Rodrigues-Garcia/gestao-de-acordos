/**
 * EscolhaBichinho — o convite de quem foi escolhido para CORRER: três bichinhos
 * sorteados para a pessoa, ela escolhe um. Só aparece para quem corre (a regra
 * é do banco: `fn_corrida_minha` nem conta a corrida para os outros nessa
 * fase). Dá para trocar até a corrida ser gravada.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { descreve, opcoesDe } from './motor/bichinhos';
import { escolherBichinho, mensagemDoErro, type CorridaJson } from './banco';
import { MiniBichinho } from './MiniBichinho';
import { NOME_CORRIDA } from './nome';

interface Props {
  corrida: CorridaJson;
  usuario: string;
  escolhaAtual: number | null;
  onDepois: () => void;
}

export default function EscolhaBichinho({ corrida, usuario, escolhaAtual, onDepois }: Props) {
  const opcoes = opcoesDe(corrida.id, usuario);
  const [sel, setSel] = useState<number | null>(escolhaAtual);
  const [salvando, setSalvando] = useState(false);
  const trocando = escolhaAtual != null;

  const confirmar = async () => {
    if (sel == null) return;
    setSalvando(true);
    try {
      await escolherBichinho(corrida.id, sel);
      const d = descreve(opcoes[sel]);
      toast.success(`${d.modelo} na pista!`, { description: 'Ele corre por você. Quando a corrida abrir, aparece o convite para assistir.' });
      onDepois();
    } catch (e) {
      toast.error('Não deu para escolher', { description: mensagemDoErro(e) });
    } finally { setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-[#04060d]/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cds-escolha-titulo">
      <div className="cds-palco cds-entra relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-[#ffd678]/40 bg-gradient-to-b from-[#16203c] to-[#0b1022] px-6 pb-6 pt-8 text-center text-[#e8eefc] shadow-2xl">
        <div className="cds-xadrez absolute inset-x-0 top-0 h-3" aria-hidden="true" />
        <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[#ff6b6b]">Você vai correr!</p>
        <h3 id="cds-escolha-titulo" className="cds-titulo mt-1 -skew-x-6 text-3xl text-[#fff6e6] [text-shadow:2px_2px_0_#e2343f]">{NOME_CORRIDA}</h3>
        <p className="mx-auto mt-2 max-w-[42ch] text-[15px] text-[#b8c4e0]">
          Você foi escolhido para a corrida. Escolha o bichinho que vai correr por você: ganhou quem cruzar primeiro.
        </p>
        {corrida.premio && (
          <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-[#ffe68a] to-[#e0a92a] px-3 py-1 text-sm font-bold text-[#2a1a02]">
            <Trophy className="h-4 w-4" aria-hidden="true" /> Prêmio: {corrida.premio}
          </p>
        )}
        <div className="mt-5 grid grid-cols-3 gap-3" role="radiogroup" aria-label="Escolha o seu bichinho">
          {opcoes.map((est, i) => {
            const d = descreve(est), ativo = sel === i;
            return (
              <button key={i} type="button" role="radio" aria-checked={ativo} onClick={() => setSel(i)}
                className={cn('relative flex flex-col items-center rounded-xl border-2 bg-[#0a0e1c]/70 px-1 pb-2 pt-1 transition-all',
                  ativo ? 'border-[#ffd84d] shadow-[0_0_24px_rgba(255,216,77,.35)]' : 'border-white/10 hover:border-white/30')}>
                {ativo && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#ffd84d] text-[#1b1405]"><Check className="h-3.5 w-3.5" /></span>}
                <MiniBichinho est={est} tamanho={112} feliz={ativo} fase={i * 1.3} />
                <span className="text-[15px] font-bold leading-tight">{d.modelo}</span>
                <span className="text-[12px] leading-tight text-[#9fb0d8]">{d.cor}{est.acessorio !== 'nenhum' ? ` ${d.acessorio}` : ''}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex flex-col items-center gap-2">
          <button type="button" disabled={sel == null || salvando || (trocando && sel === escolhaAtual)} onClick={confirmar}
            className="rounded-xl bg-[#e2343f] px-7 py-3 text-[17px] font-bold text-white shadow-[0_8px_30px_rgba(226,52,63,.4)] transition-colors hover:bg-[#f04450] disabled:opacity-50">
            {salvando ? 'Salvando…' : trocando ? 'Trocar o bichinho' : 'É esse que vai correr!'}
          </button>
          <button type="button" onClick={onDepois} className="text-[13px] text-[#8f9cbd] underline-offset-2 hover:underline">
            {trocando ? 'Fechar' : 'Escolher depois'}
          </button>
          <small className="text-[12px] text-[#8f9cbd]">Dá para trocar até a largada. Se não escolher, corre um dos três.</small>
        </div>
      </div>
    </div>
  );
}
