/**
 * PainelDoRelogio.tsx — o controle do portal no localhost (pedido de
 * 26/10/2026: «acelerar, desacelerar, ver o mural completo»). Só no
 * `npm run dev`; recolhe num botãozinho no canto de baixo à direita.
 *
 * - a régua da semana: arrastar leva o portal para qualquer hora;
 * - os atalhos: cada dia às 9h, sexta 15h59m30s e 16h;
 * - a velocidade: parado, 1×, 1 min/s, 10 min/s, 1 h/s, 4 h/s;
 * - o mural: abertura agora, só o mural, a Coisa agora (a cena e o mural
 *   puxado, sem a abertura), esquecer que viu, zerar os cliques das Lendas, e a
 *   velocidade do mural (vale também para a abertura e para a Coisa);
 * - «Relógio real» desliga tudo isso.
 */
import { useState } from 'react';
import { ABERTURA, BARCO_ANTES_DA_ABERTURA_MS, DIAS, FIM, JANELA_MS, NOME_DA_FASE, dataCurta, emSaoPaulo, estadoDoPortal } from './fases';
import { irPara, mudarVelocidade, pausar, useAgoraDoPortal, useSimulacao, voltarAoReal } from './relogio';
import {
  VELOCIDADES_DO_MURAL, abrirAbertura, abrirCoisa, abrirMural, comecarEnsaio, esquecerParticipacao, esquecerVisto,
  mudarVelocidadeDoMural, useJaViu, useParticipa, useVelocidadeDoMural, zerarCliquesDasLendas,
} from './estado';

const VELOCIDADES: readonly [number, string][] = [[1, '1×'], [60, '1 min/s'], [600, '10 min/s'], [3600, '1 h/s'], [14400, '4 h/s']];

const ATALHOS: readonly [string, number][] = [
  ['Seg 9h', DIAS[1] + 9 * 3_600_000],
  ['Ter 9h', DIAS[2] + 9 * 3_600_000],
  ['Qua 9h', DIAS[3] + 9 * 3_600_000],
  ['Qui 9h', DIAS[4] + 9 * 3_600_000],
  ['Sex 9h', DIAS[5] + 9 * 3_600_000],
  ['O bueiro (15:55)', ABERTURA - JANELA_MS],
  ['A água (15:57:12)', ABERTURA - BARCO_ANTES_DA_ABERTURA_MS - 3_000],
  ['Sex 15:59:30', ABERTURA - 30_000],
  ['Sex 16h', ABERTURA],
];

const DE = DIAS[1];
const ATE = FIM;

export function PainelDoRelogio() {
  const [aberto, setAberto] = useState(true);
  const s = useSimulacao();
  const agora = useAgoraDoPortal(500);
  const viu = useJaViu();
  const participa = useParticipa();
  const vMural = useVelocidadeDoMural();
  const estado = estadoDoPortal(agora);

  if (!aberto) {
    return <button type="button" className="portal-painel-botao" data-portal-fora onClick={() => setAberto(true)}>Mural ⏱</button>;
  }
  return (
    <div className="portal-painel" data-portal-fora>
      <div className="portal-painel-topo">
        <strong>Mural de Outubro · teste</strong>
        <button type="button" onClick={() => setAberto(false)} aria-label="Recolher">–</button>
      </div>
      <p className="portal-painel-hora">
        {dataCurta(agora)} <span>· {NOME_DA_FASE[estado.fase]}{s ? (s.pausado ? ' · parado' : ` · ${VELOCIDADES.find(v => v[0] === s.velocidade)?.[1] ?? `${s.velocidade}×`}`) : ' · relógio real'}</span>
      </p>
      <input
        type="range"
        min={DE}
        max={ATE}
        step={60_000}
        value={Math.min(ATE, Math.max(DE, agora))}
        onChange={e => irPara(Number(e.target.value))}
        className="portal-painel-regua"
      />
      <div className="portal-painel-linha">
        {ATALHOS.map(([nome, quando]) => <button key={nome} type="button" onClick={() => irPara(quando)}>{nome}</button>)}
        <button type="button" onClick={() => irPara(emSaoPaulo(2026, 10, 31, 10))}>Sáb 10h</button>
      </div>
      <div className="portal-painel-linha">
        <button type="button" className={s?.pausado ? 'portal-ligado' : ''} onClick={() => pausar(!s?.pausado)}>{s?.pausado ? '▶ Continuar' : '⏸ Parar'}</button>
        {VELOCIDADES.map(([v, nome]) => (
          <button key={v} type="button" className={s && !s.pausado && s.velocidade === v ? 'portal-ligado' : ''} onClick={() => { mudarVelocidade(v); pausar(false); }}>{nome}</button>
        ))}
      </div>
      <div className="portal-painel-linha">
        <button type="button" onClick={comecarEnsaio}>Ensaio completo</button>
        <button type="button" onClick={abrirAbertura}>Abertura agora</button>
        <button type="button" onClick={abrirMural}>Só o mural</button>
        <button type="button" onClick={abrirCoisa}>A Coisa agora</button>
        <button type="button" onClick={esquecerVisto} disabled={!viu}>Esquecer que vi</button>
        <button type="button" onClick={esquecerParticipacao} disabled={!participa}>Não participar</button>
        <button type="button" onClick={zerarCliquesDasLendas}>Zerar cliques</button>
      </div>
      <div className="portal-painel-linha">
        <span>Mural:</span>
        {VELOCIDADES_DO_MURAL.map(v => (
          <button key={v} type="button" className={v === vMural ? 'portal-ligado' : ''} onClick={() => mudarVelocidadeDoMural(v)}>{v}×</button>
        ))}
        <span className="portal-painel-sep" />
        <button type="button" onClick={voltarAoReal} disabled={!s}>Relógio real</button>
      </div>
    </div>
  );
}
