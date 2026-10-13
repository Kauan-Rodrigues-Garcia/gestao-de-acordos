/**
 * Jogos.tsx — roleta, bingo e sorteio na parede.
 *
 * ## Quem decide o resultado
 *
 * O SERVIDOR, sempre. `fn_tv_sorteio_girar` e `fn_tv_bingo_sortear` escolhem
 * com `random()` do Postgres e gravam. Estes componentes só ANIMAM até o que já
 * foi decidido.
 *
 * A separação não é preciosismo: um sorteio decidido no navegador é um sorteio
 * que qualquer pessoa com o console aberto escolhe. E como o palco é anônimo e
 * a mesa é autenticada, os dois precisam chegar ao MESMO resultado — só há uma
 * forma de garantir isso, que é ele já existir quando os dois leem.
 *
 * ## Como a roda para no lugar certo
 *
 * O servidor devolve o ÍNDICE. A roda gira um número inteiro de voltas e mais o
 * ângulo que traz o centro daquela fatia até o ponteiro. Como a conta parte do
 * índice, a prévia da mesa e a TV param exatamente na mesma fatia — sem
 * combinar nada entre elas.
 *
 * O ângulo só CRESCE, nunca volta: girar de novo soma voltas em vez de
 * recalcular do zero, senão a roda daria meia-volta para trás quando o índice
 * novo fosse menor que o anterior.
 */
import { useEffect, useRef, useState } from 'react';
import {
  nomeDoItem, fotoDoItem, texto, anguloDaRoleta,
  type DadosSorteio, type ItemSorteio,
} from './geometria';

const CIANO = '#7fd8e8';
const VERDE = '#5fbe7e';
const AMBAR = '#e8a33d';
const CINZA = '#8fa3ab';

/** Quanto dura o giro. Longo o bastante para criar expectativa, curto para não cansar. */
const GIRO_MS = 4200;

const PALETAS: Record<string, string[]> = {
  classica: ['#1f7a8c', '#bfdbf7', '#022b3a', '#e1e5f2', '#0f4c5c', '#a7c7d9'],
  neon:     ['#ff2e88', '#00f5d4', '#7b2ff7', '#fee440', '#00bbf9', '#f15bb5'],
  sobria:   ['#2f3e46', '#52796f', '#84a98c', '#354f52', '#cad2c5', '#40606d'],
};

/**
 * Um contador que sobe a cada giro novo.
 *
 * `girado_em` é a marca do servidor. Quando ela muda, houve um giro — e é isso,
 * e não o índice, que dispara a animação: girar e cair no MESMO item é um
 * resultado legítimo, e a roda tem de girar do mesmo jeito.
 */
function useGiros(giradoEm: string | null | undefined): number {
  const [giros, setGiros] = useState(0);
  const anterior = useRef<string | null | undefined>(giradoEm);
  useEffect(() => {
    if (giradoEm && giradoEm !== anterior.current) {
      anterior.current = giradoEm;
      setGiros(g => g + 1);
    }
  }, [giradoEm]);
  return giros;
}

// ── Roleta ───────────────────────────────────────────────────────────────────

export function Roleta({
  config, dados,
}: { config: Record<string, unknown>; dados: DadosSorteio | null }) {
  const itens: ItemSorteio[] = dados?.participantes ?? [];
  const giros = useGiros(dados?.girado_em);
  const indice = dados?.resultado?.ultimo?.indice ?? 0;
  const paleta = PALETAS[dados?.config?.layout ?? 'classica'] ?? PALETAS.classica;
  const titulo = texto(config, 'titulo', dados?.titulo ?? 'Roleta');

  const n = itens.length;
  const fatia = n > 0 ? 360 / n : 360;
  /*
   * O ângulo final. `-(indice*fatia + fatia/2)` traz o CENTRO da fatia até o
   * ponteiro, que fica no topo; as voltas inteiras vêm antes para o giro ter
   * duração. Só cresce, nunca volta — ver o cabeçalho.
   */
  const angulo = anguloDaRoleta(indice, n, giros);

  if (n === 0) {
    return <Vazio titulo={titulo} recado="Nenhum item na roleta. Monte a lista na mesa." />;
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <Cabecalho>{titulo}</Cabecalho>

      <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', margin: '0 auto' }}>
        {/* O ponteiro NÃO gira: é ele que define onde a roda para. */}
        <div style={{
          position: 'absolute', top: -14, left: '50%', marginLeft: -26, zIndex: 3,
          width: 0, height: 0,
          borderLeft: '26px solid transparent', borderRight: '26px solid transparent',
          borderTop: `46px solid ${AMBAR}`,
          filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.5))',
        }} />

        <svg
          viewBox="0 0 200 200"
          style={{
            width: '100%', height: '100%', display: 'block',
            transform: `rotate(${angulo}deg)`,
            transition: giros > 0 ? `transform ${GIRO_MS}ms cubic-bezier(.16,.84,.28,1)` : 'none',
            filter: 'drop-shadow(0 10px 24px rgba(0,0,0,.45))',
          }}
        >
          {itens.map((item, i) => {
            const a0 = (i * fatia - 90) * Math.PI / 180;
            const a1 = ((i + 1) * fatia - 90) * Math.PI / 180;
            const grande = fatia > 180 ? 1 : 0;
            const x0 = 100 + 96 * Math.cos(a0), y0 = 100 + 96 * Math.sin(a0);
            const x1 = 100 + 96 * Math.cos(a1), y1 = 100 + 96 * Math.sin(a1);
            const meio = (i * fatia + fatia / 2 - 90) * Math.PI / 180;
            const tx = 100 + 62 * Math.cos(meio), ty = 100 + 62 * Math.sin(meio);
            const nome = nomeDoItem(item);
            return (
              <g key={i}>
                <path
                  d={n === 1
                    ? 'M100 4 A96 96 0 1 1 99.9 4 Z'
                    : `M100 100 L${x0} ${y0} A96 96 0 ${grande} 1 ${x1} ${y1} Z`}
                  fill={paleta[i % paleta.length]}
                  stroke="rgba(0,0,0,.28)" strokeWidth="0.7"
                />
                <text
                  x={tx} y={ty}
                  transform={`rotate(${i * fatia + fatia / 2} ${tx} ${ty})`}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="#0b1116" fontSize={n > 14 ? 6 : n > 8 ? 8 : 10} fontWeight="800"
                >
                  {nome.length > 16 ? nome.slice(0, 15) + '…' : nome}
                </text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="14" fill="#0b1116" stroke={AMBAR} strokeWidth="3" />
        </svg>
      </div>

      <Resultado
        rotulo="Saiu"
        valor={nomeDoItem(dados?.resultado?.ultimo?.item)}
        mostrar={!!dados?.resultado?.ultimo}
        atrasoMs={GIRO_MS}
        chave={dados?.girado_em ?? ''}
      />
    </div>
  );
}

// ── Sorteio de pessoa ────────────────────────────────────────────────────────

/**
 * A contagem regressiva.
 *
 * Ela é o sorteio, do ponto de vista de quem assiste: o resultado já está
 * decidido no servidor, e o que cria a expectativa é o tempo entre o clique e o
 * nome. Os rostos embaralham durante a contagem — e param no que o servidor
 * escolheu, nunca no que o embaralhamento estava mostrando.
 */
export function SorteioPessoa({
  config, dados,
}: { config: Record<string, unknown>; dados: DadosSorteio | null }) {
  const itens: ItemSorteio[] = dados?.participantes ?? [];
  const giros = useGiros(dados?.girado_em);
  const titulo = texto(config, 'titulo', dados?.titulo ?? 'Sorteio');
  const vencedor = dados?.resultado?.ultimo?.item;

  const [contagem, setContagem] = useState<number | null>(null);
  const [piscando, setPiscando] = useState<ItemSorteio | null>(null);

  /*
   * A lista entra por `ref`, e não pela dependência do efeito.
   *
   * `dados?.participantes ?? []` é um array NOVO a cada render, e o palco
   * relê de 20 em 20 segundos. Como dependência, ele reiniciaria a contagem
   * regressiva antes de ela terminar — o "3, 2, 1" nunca chegaria ao nome.
   *
   * Quem manda no efeito é `giros`, que só muda quando o servidor gira.
   */
  const listaViva = useRef<ItemSorteio[]>(itens);
  listaViva.current = itens;

  useEffect(() => {
    if (giros === 0 || listaViva.current.length === 0) return;
    setContagem(3);

    const embaralhar = setInterval(() => {
      const lista = listaViva.current;
      if (lista.length) setPiscando(lista[Math.floor(Math.random() * lista.length)]);
    }, 110);

    const passo = setInterval(() => {
      setContagem(c => (c === null || c <= 1 ? null : c - 1));
    }, 1000);

    const fim = setTimeout(() => {
      clearInterval(embaralhar);
      clearInterval(passo);
      setContagem(null);
      setPiscando(null);
    }, 3200);

    return () => { clearInterval(embaralhar); clearInterval(passo); clearTimeout(fim); };
  }, [giros]);

  if (itens.length === 0) {
    return <Vazio titulo={titulo} recado="Ninguém escolhido ainda. Marque quem participa na mesa." />;
  }

  const mostrando = contagem !== null ? piscando : vencedor;
  const acabou = contagem === null && !!vencedor;

  return (
    <div style={{ textAlign: 'center' }}>
      <Cabecalho>{titulo}</Cabecalho>

      {contagem !== null && (
        <p
          key={contagem}
          style={{
            margin: '0 0 24px', color: AMBAR, fontSize: 200, fontWeight: 900, lineHeight: 1,
            animation: 'tv-pulso 900ms ease-out',
          }}
        >
          {contagem}
        </p>
      )}

      {mostrando && (
        <div
          key={acabou ? (dados?.girado_em ?? 'fim') : 'sorteando'}
          style={{ animation: acabou ? 'tv-entra 700ms cubic-bezier(.2,1.2,.3,1)' : undefined }}
        >
          {fotoDoItem(mostrando)
            ? <img src={fotoDoItem(mostrando)!} alt=""
                   style={{ width: 300, height: 300, borderRadius: '50%', objectFit: 'cover',
                            margin: '0 auto 28px', display: 'block',
                            border: `10px solid ${acabou ? VERDE : 'rgba(255,255,255,.25)'}` }} />
            : <div style={{ width: 300, height: 300, borderRadius: '50%', margin: '0 auto 28px',
                            background: 'rgba(255,255,255,.10)',
                            border: `10px solid ${acabou ? VERDE : 'rgba(255,255,255,.25)'}` }} />}
          <p style={{ margin: 0, color: acabou ? VERDE : '#ffffff', fontSize: 96, fontWeight: 900,
                      lineHeight: 1.05 }}>
            {nomeDoItem(mostrando)}
          </p>
        </div>
      )}

      {!mostrando && (
        <p style={{ color: CINZA, fontSize: 46 }}>
          {itens.length} {itens.length === 1 ? 'pessoa' : 'pessoas'} no sorteio
        </p>
      )}

      <Estilos />
    </div>
  );
}

// ── Bingo ────────────────────────────────────────────────────────────────────

export function Bingo({
  config, dados,
}: { config: Record<string, unknown>; dados: DadosSorteio | null }) {
  const titulo = texto(config, 'titulo', dados?.titulo ?? 'Bingo');
  const ate = Math.max(10, Math.min(99, Number(dados?.config?.ate) || 75));
  const numeros = dados?.resultado?.numeros ?? [];
  const saidos = new Set(numeros);
  const ultimo = numeros.length ? numeros[numeros.length - 1] : null;
  const giros = useGiros(dados?.girado_em);
  const bingo = dados?.resultado?.bingo;

  return (
    <div style={{ textAlign: 'center' }}>
      <Cabecalho>
        {titulo}
        <span style={{ color: CINZA, fontSize: 30, marginLeft: 16 }}>
          rodada {dados?.resultado?.rodada ?? 1} · {numeros.length}/{ate}
        </span>
      </Cabecalho>

      {/*
        O BINGO cobre a cartela. É o momento da sala inteira olhar para a
        parede, e uma faixa discreta ao lado dos números não faria isso.
      */}
      {bingo ? (
        <div style={{ padding: '60px 0', animation: 'tv-entra 700ms cubic-bezier(.2,1.2,.3,1)' }}>
          <p style={{ margin: '0 0 18px', color: AMBAR, fontSize: 190, fontWeight: 900,
                      lineHeight: 1, letterSpacing: '.06em' }}>
            BINGO!
          </p>
          <p style={{ margin: 0, color: '#ffffff', fontSize: 84, fontWeight: 800 }}>{bingo.quem}</p>
          <Estilos />
        </div>
      ) : (
        <>
          {ultimo !== null && (
            <p
              key={`${giros}-${ultimo}`}
              style={{
                margin: '0 0 26px', color: AMBAR, fontSize: 190, fontWeight: 900, lineHeight: 1,
                animation: 'tv-entra 700ms cubic-bezier(.2,1.2,.3,1)',
              }}
            >
              {ultimo}
            </p>
          )}

          {/*
            A cartela inteira, com os que já saíram acesos. Dez colunas: é o
            formato que a operação reconhece de cartela de papel, e mantém o
            número legível até 99.
          */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 8,
          }}>
            {Array.from({ length: ate }).map((_, i) => {
              const n = i + 1;
              const saiu = saidos.has(n);
              return (
                <div
                  key={n}
                  style={{
                    padding: '10px 0', borderRadius: 10,
                    background: saiu ? CIANO : 'rgba(255,255,255,.07)',
                    color: saiu ? '#06141b' : 'rgba(255,255,255,.32)',
                    fontSize: 30, fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    outline: n === ultimo ? `4px solid ${AMBAR}` : undefined,
                  }}
                >
                  {n}
                </div>
              );
            })}
          </div>
          <Estilos />
        </>
      )}
    </div>
  );
}

// ── Peças comuns ─────────────────────────────────────────────────────────────

function Cabecalho({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ margin: '0 0 24px', color: CIANO, fontSize: 44, fontWeight: 700,
                 letterSpacing: '.06em', textTransform: 'uppercase' }}>
      {children}
    </h3>
  );
}

function Vazio({ titulo, recado }: { titulo: string; recado: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <Cabecalho>{titulo}</Cabecalho>
      <p style={{ color: CINZA, fontSize: 40, margin: 0 }}>{recado}</p>
    </div>
  );
}

/**
 * O resultado aparece DEPOIS de a roda parar.
 *
 * Mostrá-lo junto com o giro entrega o final antes do suspense — e o suspense é
 * a única coisa que a roda tem a oferecer.
 */
function Resultado({
  rotulo, valor, mostrar, atrasoMs, chave,
}: { rotulo: string; valor: string; mostrar: boolean; atrasoMs: number; chave: string }) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!mostrar) { setVisivel(false); return; }
    setVisivel(false);
    const t = setTimeout(() => setVisivel(true), atrasoMs);
    return () => clearTimeout(t);
  }, [chave, mostrar, atrasoMs]);

  if (!mostrar || !visivel) return <div style={{ height: 108 }} />;

  return (
    <div style={{ marginTop: 22, animation: 'tv-entra 700ms cubic-bezier(.2,1.2,.3,1)' }}>
      <p style={{ margin: '0 0 6px', color: CINZA, fontSize: 30, fontWeight: 600,
                  letterSpacing: '.1em', textTransform: 'uppercase' }}>{rotulo}</p>
      <p style={{ margin: 0, color: VERDE, fontSize: 76, fontWeight: 900, lineHeight: 1 }}>
        {valor}
      </p>
      <Estilos />
    </div>
  );
}

/**
 * As animações, injetadas junto com quem as usa.
 *
 * `prefers-reduced-motion` zera a duração em vez de mudar o efeito: quem pediu
 * menos movimento recebe o estado final, e não uma versão lenta do mesmo salto.
 */
function Estilos() {
  return (
    <style>{`
      @keyframes tv-entra {
        from { opacity: 0; transform: scale(.72); }
        to   { opacity: 1; transform: scale(1); }
      }
      @keyframes tv-pulso {
        0%   { opacity: 0; transform: scale(1.8); }
        40%  { opacity: 1; transform: scale(1); }
        100% { opacity: .85; transform: scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        @keyframes tv-entra { from { opacity: 1; transform: none; } to { opacity: 1; transform: none; } }
        @keyframes tv-pulso { from { opacity: 1; transform: none; } to { opacity: 1; transform: none; } }
      }
    `}</style>
  );
}
