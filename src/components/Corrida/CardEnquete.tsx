/**
 * CardEnquete — a votação de 30 s entre bichinhos e cavalos (22/10/2026), no
 * alto da tela de quem foi chamado para a corrida. Dá para trocar o voto até o
 * fim; acabou a contagem, o painel do super_admin fecha a votação e o resultado
 * chega aqui (empate vai no sorteio). Quem votou entra direto no lobby quando a
 * corrida abrir (`voteiNaCorrida`).
 *
 * Fica fora do carregamento sob demanda de propósito: são 30 s, e o card tem que
 * aparecer no segundo em que o aviso chega.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { agoraBanco, esconderEnquete, mensagemDoErro, segundos, votarEnquete, type Categoria, type EnqueteJson } from './banco';
import { destravarAudio } from './nome';

const OPCOES: Array<{ c: Categoria; emoji: string; nome: string }> = [
  { c: 'bichinhos', emoji: '🐾', nome: 'Bichinhos' },
  { c: 'cavalos', emoji: '🐎', nome: 'Cavalos' },
];
const DURACAO = 30;
/** Sem resultado até aqui depois da contagem (o painel fechou no meio): o card sai. */
const ESPERA_RESULTADO = 15;
/** Quanto o resultado fica na tela. */
const MOSTRA_RESULTADO = 9;

export function CardEnquete({ enquete }: { enquete: EnqueteJson }) {
  const [agora, setAgora] = useState(agoraBanco);
  const [enviando, setEnviando] = useState<Categoria | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setAgora(agoraBanco()), 250);
    return () => window.clearInterval(id);
  }, []);

  const fim = segundos(enquete.encerra_em) ?? 0;
  const restante = Math.max(0, Math.ceil(fim - agora));
  const resultado = enquete.vencedora;
  const votando = !resultado && !enquete.fechada_em && agora < fim;

  // O card sai sozinho: o resultado depois de alguns segundos; a votação sem resultado, depois da espera.
  const sair = resultado
    ? (segundos(enquete.fechada_em) ?? fim) + MOSTRA_RESULTADO
    : fim + ESPERA_RESULTADO;
  useEffect(() => { if (agora > sair) esconderEnquete(); }, [agora, sair]);

  const votar = async (c: Categoria) => {
    destravarAudio(); // dentro do clique: o som do lobby fica liberado
    setEnviando(c); setErro(null);
    try { await votarEnquete(enquete, c); }
    catch (e) { setErro(mensagemDoErro(e)); }
    finally { setEnviando(null); }
  };

  const vencedora = OPCOES.find(o => o.c === resultado);
  const fracao = Math.max(0, Math.min(1, (fim - agora) / DURACAO));

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[86] flex justify-center px-4">
      <section role="dialog" aria-labelledby="cds-enquete-titulo" aria-live="polite"
        className="cds-palco cds-entra pointer-events-auto relative w-full max-w-[400px] overflow-hidden rounded-2xl border border-[#ffd678]/50 bg-[#0d1428] text-[#e8eefc] shadow-[0_18px_50px_rgba(0,0,0,.55)]">
        <div className="cds-xadrez h-2" aria-hidden="true" />
        <button type="button" onClick={esconderEnquete} aria-label="Fechar"
          className="absolute right-2.5 top-4 rounded-full p-1 text-[#8f9cbd] transition-colors hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>

        <div className="px-5 pb-4 pt-3">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#ff6b6b]">
            <i className={cn('inline-block h-1.5 w-1.5 rounded-full bg-[#ff4d5e]', votando && 'animate-pulse')} aria-hidden="true" />
            {votando ? 'Votação' : resultado ? 'Resultado' : 'Votação encerrada'}
          </span>

          {vencedora ? (
            <div className="mt-1 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#fff6e6] text-[38px] leading-none shadow-[0_0_0_3px_#ffd84d]" aria-hidden="true">{vencedora.emoji}</div>
              <h3 id="cds-enquete-titulo" className="cds-titulo mt-1 -skew-x-6 text-[28px] leading-none text-[#fff6e6] [text-shadow:2px_2px_0_#e2343f]">
                Deu {vencedora.nome}!
              </h3>
              <p className="mt-2 text-sm text-[#b8c4e0]">
                {enquete.empate
                  ? `Empate em ${enquete.votos?.bichinhos ?? 0} × ${enquete.votos?.cavalos ?? 0}: o sorteio escolheu.`
                  : `${enquete.votos?.[vencedora.c] ?? 0} × ${enquete.votos?.[vencedora.c === 'cavalos' ? 'bichinhos' : 'cavalos'] ?? 0} nos votos.`}
              </p>
              <p className="mt-1 text-xs text-[#8f9cbd]">
                {enquete.meu_voto ? 'Você votou: entra direto no lobby quando a corrida abrir.' : 'A corrida já vai abrir: o convite chega na sua tela.'}
              </p>
            </div>
          ) : (
            <>
              <div className="mt-1 flex items-end justify-between gap-3 pr-6">
                <h3 id="cds-enquete-titulo" className="cds-titulo -skew-x-6 text-[24px] leading-none text-[#fff6e6]">Qual corrida vem aí?</h3>
                <span className={cn('tabular-nums text-[26px] font-bold leading-none', restante <= 10 ? 'text-[#ff6b6b]' : 'text-[#ffd84d]')}>
                  {votando ? `${restante}s` : '0s'}
                </span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                <div className={cn('h-full rounded-full transition-[width] duration-200 ease-linear', restante <= 10 ? 'bg-[#ff4d5e]' : 'bg-[#ffd84d]')} style={{ width: `${fracao * 100}%` }} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Sua escolha">
                {OPCOES.map(o => {
                  const meu = enquete.meu_voto === o.c;
                  return (
                    <button key={o.c} type="button" role="radio" aria-checked={meu} disabled={!votando || !!enviando}
                      onClick={() => { if (!meu) void votar(o.c); }}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 transition-colors disabled:cursor-not-allowed',
                        meu ? 'border-[#ffd84d] bg-[#ffd84d]/15' : 'border-white/15 bg-white/[0.04] enabled:hover:border-[#ffd84d]/60 enabled:hover:bg-white/[0.08]',
                        !votando && !meu && 'opacity-50',
                      )}>
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-[#fff6e6] text-[28px] leading-none" aria-hidden="true">{o.emoji}</span>
                      <span className="text-[15px] font-bold">{o.nome}</span>
                      <span className={cn('text-[11px]', meu ? 'font-semibold text-[#ffd84d]' : 'text-[#8f9cbd]')}>
                        {enviando === o.c ? 'Votando…' : meu ? 'Seu voto ✓' : votando ? 'Votar' : ' '}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="mt-2.5 text-center text-[11px] text-[#8f9cbd]">
                {erro ?? (votando
                  ? (enquete.meu_voto ? 'Pode trocar até o fim. Quem votar entra direto no lobby.' : 'Vence a mais votada; empate vai no sorteio.')
                  : 'Contando os votos…')}
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
