/**
 * MiniApps — os projetos que RODAM, em vez de virarem captura de tela.
 *
 * As contas ficam em funções puras em `lib/miniApps.ts`, testadas em
 * `lib/__tests__/miniApps.test.ts`. É o que separa "demonstração" de "imagem
 * de demonstração".
 */
import { useMemo, useState } from 'react';
import { useCreators } from '../theme/CreatorsProvider';
import { lerDinheiro, formatarBRL, calcularDesconto, diasUteisEntre } from '../lib/miniApps';

// ── Interfaces ───────────────────────────────────────────────────────────────

function Campo({
  rotulo, valor, aoMudar, tipo = 'text', sufixo, id,
}: {
  rotulo: string; valor: string; aoMudar: (v: string) => void;
  tipo?: string; sufixo?: string; id: string;
}) {
  const { tokens } = useCreators();
  return (
    <label htmlFor={id} className="block">
      <span className="creators-lab__rotulo block" style={{ color: tokens.cores.textoSuave }}>
        {rotulo}
      </span>
      <span className="mt-1 flex items-center gap-2">
        <input
          id={id}
          type={tipo}
          value={valor}
          onChange={e => aoMudar(e.target.value)}
          inputMode={tipo === 'text' ? 'decimal' : undefined}
          className="creators-lab__mono w-full px-3 py-2 text-sm"
          style={{
            background: tokens.cores.fundoAlt,
            border: `${tokens.bordaLargura} solid ${tokens.cores.borda}`,
            borderRadius: tokens.raio,
            color: tokens.cores.texto,
          }}
        />
        {sufixo && (
          <span className="creators-lab__mono text-sm" style={{ color: tokens.cores.textoSuave }}>
            {sufixo}
          </span>
        )}
      </span>
    </label>
  );
}

export function CalculadoraDesconto() {
  const { tokens } = useCreators();
  const [valorTxt, setValorTxt] = useState('');
  const [pctTxt, setPctTxt]     = useState('');

  const r = useMemo(() => {
    const valor = lerDinheiro(valorTxt);
    const pct   = pctTxt.trim() === '' ? null : Number(pctTxt.replace(',', '.'));
    return calcularDesconto(valor, Number.isFinite(pct as number) ? pct : null);
  }, [valorTxt, pctTxt]);

  const mostrar = !r.erro && (valorTxt !== '' || pctTxt !== '');

  return (
    <div className="space-y-3">
      <Campo id="mini-valor" rotulo="Valor original" valor={valorTxt} aoMudar={setValorTxt} sufixo="R$" />
      <Campo id="mini-pct" rotulo="Desconto" valor={pctTxt} aoMudar={setPctTxt} sufixo="%" />

      <div
        className="mt-4 p-3"
        style={{
          background: tokens.cores.fundoAlt,
          border: `${tokens.bordaLargura} solid ${tokens.cores.borda}`,
          borderRadius: tokens.raio,
        }}
        aria-live="polite"
      >
        {r.erro && (valorTxt || pctTxt) ? (
          <p className="creators-lab__mono text-xs" style={{ color: tokens.cores.secundaria }}>
            {r.erro}
          </p>
        ) : mostrar ? (
          <dl className="creators-lab__ficha space-y-1">
            <div className="flex items-baseline">
              <dt>desconto</dt>
              <span className="creators-lab__pontilhado" />
              <dd style={{ color: tokens.cores.secundaria }}>{formatarBRL(r.desconto)}</dd>
            </div>
            <div className="flex items-baseline">
              <dt>valor final</dt>
              <span className="creators-lab__pontilhado" />
              <dd className="text-base font-bold" style={{ color: tokens.cores.acento }}>
                {formatarBRL(r.final)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="creators-lab__mono text-xs" style={{ color: tokens.cores.textoSuave }}>
            preencha para calcular
          </p>
        )}
      </div>
    </div>
  );
}

export function ContadorDiasUteis() {
  const { tokens } = useCreators();
  const [de, setDe]   = useState('');
  const [ate, setAte] = useState('');
  const total = useMemo(() => diasUteisEntre(de, ate), [de, ate]);

  return (
    <div className="space-y-3">
      <Campo id="mini-de"  rotulo="De"  valor={de}  aoMudar={setDe}  tipo="date" />
      <Campo id="mini-ate" rotulo="Até" valor={ate} aoMudar={setAte} tipo="date" />
      <div
        className="mt-4 p-3 text-center"
        style={{
          background: tokens.cores.fundoAlt,
          border: `${tokens.bordaLargura} solid ${tokens.cores.borda}`,
          borderRadius: tokens.raio,
        }}
        aria-live="polite"
      >
        {total === null ? (
          <p className="creators-lab__mono text-xs" style={{ color: tokens.cores.textoSuave }}>
            {de && ate ? 'a data final precisa vir depois da inicial' : 'escolha as duas datas'}
          </p>
        ) : (
          <>
            <p className="creators-lab__mono text-3xl font-bold" style={{ color: tokens.cores.acento }}>
              {total}
            </p>
            <p className="creators-lab__mono text-[.62rem] tracking-widest"
               style={{ color: tokens.cores.textoSuave }}>
              DIAS ÚTEIS (SEM FERIADOS)
            </p>
          </>
        )}
      </div>
    </div>
  );
}
