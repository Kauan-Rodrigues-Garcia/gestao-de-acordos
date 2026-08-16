/**
 * DevStatus — o painel de brincadeira, com números reais do lado.
 *
 * Os valores "sérios" (commits, testes, linhas) vêm da auditoria e são
 * verdadeiros. Os de piada oscilam devagar — um passo a cada poucos segundos,
 * não a cada quadro: painel de piada não merece `requestAnimationFrame`.
 */
import { useEffect, useState } from 'react';
import { useCreators } from '../theme/CreatorsProvider';
import { SecaoLab } from '../components/SecaoLab';
import { PROJETO_REAL } from '../creators.config';

const HUMORES = [
  '"works on my machine"',
  '"é só um ajuste rápido"',
  '"depois eu refatoro"',
  '"o teste passou, pode subir"',
  '"quem escreveu isso? ...fui eu"',
];

export function DevStatus() {
  const { tokens, movimentoReduzido } = useCreators();
  const [cafe, setCafe] = useState(73);
  const [humor, setHumor] = useState(0);

  useEffect(() => {
    if (movimentoReduzido) return;
    // 4 segundos: rápido o bastante para notar, devagar o bastante para não
    // virar ruído nem custar bateria.
    const t = setInterval(() => {
      setCafe(c => Math.max(12, Math.min(99, c + (Math.random() > 0.5 ? 3 : -4))));
      setHumor(h => (h + 1) % HUMORES.length);
    }, 4000);
    return () => clearInterval(t);
  }, [movimentoReduzido]);

  const arcade = tokens.id === 'arcade';

  const reais: [string, string][] = [
    ['COMMITS',      String(PROJETO_REAL.commitsTotal)],
    ['TESTES',       PROJETO_REAL.testes.toLocaleString('pt-BR')],
    ['LINHAS',       PROJETO_REAL.linhasSrc.toLocaleString('pt-BR')],
    ['USUÁRIOS',     String(PROJETO_REAL.usuarios)],
  ];

  return (
    <SecaoLab
      id="status"
      rotulo={arcade ? 'PLAYER STATUS' : 'DEV STATUS'}
      titulo={arcade ? 'HIGH SCORES' : 'DEV STATUS'}
      descricao="À esquerda, medido de verdade. À direita, nem tanto."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="creators-lab__painel p-5">
          <p className="creators-lab__rotulo mb-3" style={{ color: tokens.cores.acento }}>
            MEDIDO EM 16/08/2026
          </p>
          <dl className="creators-lab__ficha">
            {reais.map(([k, v]) => (
              <div key={k} className="flex items-baseline">
                <dt>{k}</dt>
                <span className="creators-lab__pontilhado" />
                <dd className="font-bold" style={{ color: tokens.cores.primaria }}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="creators-lab__painel p-5">
          <p className="creators-lab__rotulo mb-3" style={{ color: tokens.cores.secundaria }}>
            MENOS CIENTÍFICO
          </p>
          <dl className="creators-lab__ficha">
            <div className="flex items-baseline">
              <dt>SYSTEM</dt><span className="creators-lab__pontilhado" />
              <dd style={{ color: tokens.cores.acento }}>ONLINE</dd>
            </div>
            <div className="flex items-baseline">
              <dt>COFFEE</dt><span className="creators-lab__pontilhado" />
              <dd style={{ color: tokens.cores.primaria }}>{cafe}%</dd>
            </div>
            <div className="flex items-baseline">
              <dt>BUGS CORRIGIDOS</dt><span className="creators-lab__pontilhado" />
              <dd style={{ color: tokens.cores.texto }}>572</dd>
            </div>
            <div className="flex items-baseline">
              <dt>BUGS CRIADOS</dt><span className="creators-lab__pontilhado" />
              <dd style={{ color: tokens.cores.secundaria }}>573</dd>
            </div>
          </dl>
          <div className="creators-lab__barra mt-3">
            <span style={{ width: `${cafe}%`, transition: 'width 1.2s ease' }} />
          </div>
          <p className="creators-lab__mono mt-4 text-xs" style={{ color: tokens.cores.textoSuave }}>
            CURRENT MOOD<br />
            <span style={{ color: tokens.cores.acento }}>{HUMORES[humor]}</span>
          </p>
        </div>
      </div>
    </SecaoLab>
  );
}
