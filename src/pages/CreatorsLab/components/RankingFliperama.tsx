/**
 * RankingFliperama — o placar da máquina.
 * ─────────────────────────────────────────────────────────────────────────────
 * Três critérios, nesta ordem: pontuação, vidas gastas e tempo. A ordenação
 * em si é feita no banco (`fn_creators_lab_ranking`), porque é lá que estão
 * todas as linhas — ordenar no cliente exigiria trazer tudo e ainda daria
 * resultado diferente do painel de outra pessoa em caso de empate.
 *
 * Uma tabela de verdade, com `<caption>` e cabeçalho: é dado tabular, e leitor
 * de tela precisa da relação entre célula e coluna para ler "Fulano, 320
 * pontos, 2 vidas".
 */
import type { LinhaRanking } from '@/services/creatorsLab.service';
import { formatarDuracao } from '../lib/enquadramento';
import { useCreators } from '../theme/CreatorsProvider';

export function RankingFliperama({
  linhas, meuId,
}: {
  linhas: LinhaRanking[];
  /** Para destacar a própria linha no meio das outras. */
  meuId: string | null;
}) {
  const { tokens } = useCreators();
  const c = tokens.cores;
  const arcade = tokens.id === 'arcade';

  if (linhas.length === 0) {
    return (
      <p
        className="creators-lab__mono py-6 text-center text-xs"
        style={{ color: c.textoSuave }}
      >
        Ninguém jogou ainda. A primeira ficha é sua.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="creators-lab__mono w-full min-w-[30rem] text-left text-[.72rem]">
        <caption className="sr-only">
          Ranking do fliperama: posição, jogador, pontos, vidas usadas e tempo.
        </caption>
        <thead>
          <tr style={{ color: c.textoSuave }}>
            <th scope="col" className="py-2 pr-2 font-normal">#</th>
            <th scope="col" className="py-2 pr-2 font-normal">{arcade ? 'PLAYER' : 'operador'}</th>
            <th scope="col" className="py-2 pr-2 text-right font-normal">{arcade ? 'SCORE' : 'pontos'}</th>
            <th scope="col" className="py-2 pr-2 text-right font-normal">vidas</th>
            <th scope="col" className="py-2 text-right font-normal">tempo</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => {
            const eu = l.usuarioId === meuId;
            return (
              <tr
                key={l.usuarioId}
                style={{
                  borderTop: `1px solid ${c.borda}`,
                  background: eu ? `color-mix(in srgb, ${c.primaria} 12%, transparent)` : undefined,
                  color: eu ? c.texto : c.textoSuave,
                }}
              >
                <td className="py-2 pr-2" style={{ color: l.posicao === 1 ? c.primaria : undefined }}>
                  {l.posicao}
                </td>
                <td className="py-2 pr-2">
                  <span className="flex items-center gap-2">
                    {/* A coroa é o prêmio visível: quem zerou a máquina carrega
                        a marca em toda lista onde aparece. */}
                    {l.venceu && <span title="Zerou a máquina">👑</span>}
                    <span style={{ color: eu ? c.primaria : c.texto }}>{l.nome}</span>
                    {eu && (
                      <span className="text-[.6rem]" style={{ color: c.textoSuave }}>(você)</span>
                    )}
                  </span>
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{l.pontos}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{l.vidasUsadas}</td>
                <td className="py-2 text-right tabular-nums">{formatarDuracao(l.duracaoMs)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
