/**
 * Laboratório dos quebra-nozes — `npm run dev` e abrir /lab-quebra-nozes.html.
 *
 * Uma página de mentira (sem login e sem banco) com o palco de verdade no pé
 * da janela. O painel escolhe a cidade, o tipo (aparição, o boletim de quem
 * mais recebeu ou a chamada dos destaques), o dia e o número da aparição — que
 * são a semente —, a hora (bom dia, boa tarde, boa noite) e, se quiser, força
 * a entrada, o número, a saída, a conversa, a cerimônia e o final em vez de
 * deixar sortear. «Próxima» avança o número e toca: é o jeito de ver como uma
 * aparição difere da outra. Embaixo, a bancada dos sons, um botão para cada.
 *
 * Na barra de endereço:
 *   ?tema=dark                 tema escuro
 *   ?cidade=birigui|marilia
 *   ?tipo=parabens|aparicao|boletim    ?dia=11  ?indice=0  ?hora=15
 *   ?formacao=dupla|a|b  ?entrada=…  ?numero=…|nenhum  ?saida=…  ?conversa=N
 *   ?cerimonia=…  ?final=…     a chamada dos destaques     ?muitos=1  dez destaques
 *   ?mini=1|0                  o palco pequeno (como a seta ao lado do som)
 *   ?leve=1                    o modo leve de verdade ligado na página (e em quadrinhos)
 *   ?quadrinho=1               em quadrinhos, como no modo leve     ?espera=8  nasce 8 s antes e espera
 *   ?fotoA=URL  ?fotoB=URL     a foto de verdade (padrão: um rosto de exemplo)
 *   ?foto=nao                  sem foto: o rosto de madeira
 *   ?auto=1                    toca ao abrir        ?t=12  começa no segundo 12
 *   ?galeria=1                 todas as poses e adereços, parados, para conferir o desenho
 *
 * Sem StrictMode, como o app.
 */
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import type { ItemDeMao, ItemDePeito, Pose } from './deixas';
import { aplicarNoBoneco } from './deixas';
import type { TipoDeSessao } from './agenda';
import {
  CERIMONIAS, ENTRADAS, FINAIS, NUMEROS, SAIDAS, montarEspetaculo,
  type Cerimonia, type Entrada, type Final, type Formacao, type Numero, type Saida,
} from './diretor';
import { elencoDaCidade, type Cidade } from './elenco';
import { ROSTOS_DE_EXEMPLO as EXEMPLO, destaquesDeExemplo } from './exemplos';
import { CONVERSAS } from './falas';
import { PalcoDosQuebraNozes } from './Palco';
import { emQuadrinhos } from './quadrinho';
import { DefsDoQuebraNozes, QuebraNozes } from './QuebraNozes';
import { SONS, pararMusicaDosDestaques, tocarMusicaDosDestaques, tocarSom, tocarVozinha } from './sons';

const busca = new URLSearchParams(location.search);
/** Uma fala das que tagarelam (`falaTagarela`), para os botões da vozinha. */
const FALA_DE_TESTE = 'Bom dia, Cobrança! Vamos com tudo hoje!';
if (busca.get('tema') === 'dark') document.documentElement.classList.add('dark');
// ?leve=1: a página com o modo leve de verdade ligado (a regra geral de `index.css`), e o espetáculo em quadrinhos.
if (busca.get('leve') === '1') document.documentElement.setAttribute('data-leve', '');
// O palco pequeno é uma escolha guardada no navegador: aqui dá para pôr pela barra de endereço.
if (busca.has('mini')) try { localStorage.setItem('natal:quebra-nozes:mini', busca.get('mini') === '1' ? '1' : '0'); } catch { /* sem armazenamento */ }

function numero(chave: string, padrao: number) {
  const v = Number(busca.get(chave));
  return busca.has(chave) && Number.isFinite(v) ? v : padrao;
}
function opcao<T extends string>(chave: string, validas: readonly T[]): T | '' {
  const v = busca.get(chave) as T | null;
  return v && validas.includes(v) ? v : '';
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label className="flex items-center gap-1.5 text-xs"><span className="text-muted-foreground">{rotulo}</span>{children}</label>;
}
const classeDoCampo = 'h-7 rounded border bg-background px-1.5 text-xs';

function Lab() {
  const [cidade, setCidade] = useState<Cidade>(opcao('cidade', ['birigui', 'marilia'] as const) || 'marilia');
  const [tipo, setTipo] = useState<TipoDeSessao>(opcao('tipo', ['parabens', 'aparicao', 'boletim'] as const) || 'aparicao');
  const [dia, setDia] = useState(numero('dia', 11));
  const [indice, setIndice] = useState(numero('indice', 1));
  const [hora, setHora] = useState(numero('hora', 10));
  const [cerimonia, setCerimonia] = useState<Cerimonia | ''>(opcao('cerimonia', CERIMONIAS));
  const [final, setFinal] = useState<Final | ''>(opcao('final', FINAIS));
  const [formacao, setFormacao] = useState<Formacao | ''>(opcao('formacao', ['dupla', 'a', 'b'] as const));
  const [entrada, setEntrada] = useState<Entrada | ''>(opcao('entrada', ENTRADAS));
  const [num, setNum] = useState<Numero | 'nenhum' | ''>(opcao('numero', [...NUMEROS, 'nenhum'] as const));
  const [saida, setSaida] = useState<Saida | ''>(opcao('saida', SAIDAS));
  const [conversa, setConversa] = useState(busca.has('conversa') ? numero('conversa', 0) : -1);
  const [comFoto, setComFoto] = useState(busca.get('foto') !== 'nao');
  const [quadrinho, setQuadrinho] = useState(busca.get('quadrinho') === '1' || busca.get('leve') === '1');
  const [rodada, setRodada] = useState(busca.get('auto') ? 1 : 0);
  const [tocando, setTocando] = useState(!!busca.get('auto'));

  const elenco = useMemo(() => elencoDaCidade(cidade, comFoto
    ? { a: busca.get('fotoA') ?? EXEMPLO.a, b: busca.get('fotoB') ?? (cidade === 'birigui' ? EXEMPLO.jessica : EXEMPLO.robson) }
    : {}), [cidade, comFoto]);
  const destaques = useMemo(() => {
    if (tipo !== 'parabens') return [];
    const lista = destaquesDeExemplo(cidade);
    // ?muitos=1: dez setores, para ver as duas fileiras e o passo apertado.
    return busca.get('muitos') ? [...lista, ...lista.map(d => ({ ...d, setor: `${d.setor} B`, meu: false }))].slice(0, 10) : lista;
  }, [tipo, cidade]);
  const lider = useMemo(() => (tipo === 'boletim' ? { ...destaquesDeExemplo(cidade)[0], feito: '★ na frente hoje' } : null), [tipo, cidade]);
  const inteiro = useMemo(() => montarEspetaculo({
    tipo: tipo === 'parabens' ? 'parabens' : 'aparicao', cidade, dia, indice, destaques, hora, lider,
    nomes: { a: elenco.a, b: elenco.b },
    forcar: {
      formacao: formacao || undefined, entrada: entrada || undefined, numero: num || undefined,
      saida: saida || undefined, conversa: conversa >= 0 ? conversa : undefined,
      cerimonia: cerimonia || undefined, final: final || undefined,
    },
  }), [tipo, cidade, dia, indice, destaques, hora, lider, elenco, formacao, entrada, num, saida, conversa, cerimonia, final]);
  const espetaculo = useMemo(() => (quadrinho ? emQuadrinhos(inteiro) : inteiro), [inteiro, quadrinho]);
  const comBoletim = lider !== null && espetaculo.formacao === 'dupla';

  const tocar = () => { setRodada(r => r + 1); setTocando(true); };
  const proxima = () => { setIndice(i => i + 1); tocar(); };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="h-14 shrink-0 border-b bg-card" />
      <main className="relative flex-1 overflow-y-auto bg-background p-6">
        <div className="mx-auto max-w-[1400px]">
          <h1 className="text-xl font-bold">Laboratório dos quebra-nozes</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-3">
            <Campo rotulo="Cidade">
              <select className={classeDoCampo} value={cidade} onChange={e => setCidade(e.target.value as Cidade)}>
                <option value="marilia">Marília (Anderson + Robson)</option>
                <option value="birigui">Birigui (Anderson + Jessica)</option>
              </select>
            </Campo>
            <Campo rotulo="Tipo">
              <select className={classeDoCampo} value={tipo} onChange={e => setTipo(e.target.value as TipoDeSessao)}>
                <option value="aparicao">Aparição</option>
                <option value="boletim">Boletim (quem mais recebeu)</option>
                <option value="parabens">Chamada dos destaques</option>
              </select>
            </Campo>
            <Campo rotulo="Hora"><input type="number" min={0} max={23} className={`${classeDoCampo} w-12`} value={hora} onChange={e => setHora(Math.max(0, Math.min(23, Number(e.target.value) || 0)))} /></Campo>
            <Campo rotulo="Dia"><input type="number" className={`${classeDoCampo} w-14`} value={dia} onChange={e => setDia(Number(e.target.value) || 0)} /></Campo>
            <Campo rotulo="Aparição nº"><input type="number" className={`${classeDoCampo} w-14`} value={indice} onChange={e => setIndice(Number(e.target.value) || 0)} /></Campo>
            <button type="button" className="h-7 rounded bg-primary px-3 text-xs font-semibold text-primary-foreground" onClick={tocar}>Tocar</button>
            <button type="button" className="h-7 rounded border px-3 text-xs font-semibold" onClick={proxima}>Próxima ▸</button>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={comFoto} onChange={e => setComFoto(e.target.checked)} /> com foto</label>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={quadrinho} onChange={e => setQuadrinho(e.target.checked)} /> em quadrinhos (modo leve)</label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-3">
            <span className="text-xs font-semibold">Forçar (vazio = sorteia):</span>
            <Campo rotulo="Formação">
              <select className={classeDoCampo} value={formacao} onChange={e => setFormacao(e.target.value as Formacao | '')}>
                <option value="">—</option><option value="dupla">dupla</option><option value="a">só o diretor</option><option value="b">só o head</option>
              </select>
            </Campo>
            <Campo rotulo="Entrada">
              <select className={classeDoCampo} value={entrada} onChange={e => setEntrada(e.target.value as Entrada | '')}>
                <option value="">—</option>{ENTRADAS.map(v => <option key={v}>{v}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Número">
              <select className={classeDoCampo} value={num} onChange={e => setNum(e.target.value as Numero | 'nenhum' | '')}>
                <option value="">—</option><option value="nenhum">nenhum</option>{NUMEROS.map(v => <option key={v}>{v}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Saída">
              <select className={classeDoCampo} value={saida} onChange={e => setSaida(e.target.value as Saida | '')}>
                <option value="">—</option>{SAIDAS.map(v => <option key={v}>{v}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Conversa">
              <select className={classeDoCampo} value={conversa} onChange={e => setConversa(Number(e.target.value))}>
                <option value={-1}>—</option>
                {CONVERSAS.map((c, i) => <option key={i} value={i}>{i} · {c[0][1].slice(0, 34)}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Cerimônia">
              <select className={classeDoCampo} value={cerimonia} onChange={e => setCerimonia(e.target.value as Cerimonia | '')}>
                <option value="">—</option>{CERIMONIAS.map(v => <option key={v}>{v}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Final">
              <select className={classeDoCampo} value={final} onChange={e => setFinal(e.target.value as Final | '')}>
                <option value="">—</option>{FINAIS.map(v => <option key={v}>{v}</option>)}
              </select>
            </Campo>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border bg-card p-3">
            <span className="mr-2 text-xs font-semibold">Sons (clique antes na página):</span>
            {SONS.map(s => (
              <button key={s} type="button" className="h-7 rounded border px-2 text-xs" onClick={() => tocarSom(s, { dur: 1.6, n: 2 })}>{s}</button>
            ))}
            {/* A vozinha só toca nas falas sorteadas: estas três são das que tagarelam. */}
            {([['vozinha diretor', 520], ['vozinha Robson', 600], ['vozinha Jessica', 740]] as const).map(([rotulo, voz]) => (
              <button key={rotulo} type="button" className="h-7 rounded border px-2 text-xs" onClick={() => tocarVozinha(FALA_DE_TESTE, voz)}>{rotulo}</button>
            ))}
            <button type="button" className="h-7 rounded border px-2 text-xs" onClick={() => tocarMusicaDosDestaques()}>música ▶</button>
            <button type="button" className="h-7 rounded border px-2 text-xs" onClick={() => pararMusicaDosDestaques()}>música ■</button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground" data-resumo>
            {tocando ? '▶ ' : ''}{espetaculo.resumo.join(' · ')} · {espetaculo.duracao.toFixed(1)} s · {espetaculo.deixas.length} deixas
          </p>
          <div className="mt-4 grid grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-40 rounded-xl border bg-card" />)}
          </div>
          <div className="mt-4 h-[520px] rounded-xl border bg-card" />
        </div>
      </main>
      {rodada > 0 && (
        <PalcoDosQuebraNozes key={rodada} cidade={cidade} elenco={elenco} espetaculo={espetaculo}
          destaques={comBoletim && lider ? [lider] : destaques} titulo={comBoletim ? 'Quem mais recebeu até agora' : undefined}
          quadrinho={quadrinho} comMusica={tipo === 'parabens'} desde={rodada === 1 && busca.has('t') ? numero('t', 0) : -numero('espera', 0)} aoTerminar={() => setTocando(false)} />
      )}
    </div>
  );
}

// ── A galeria: todas as poses e adereços, parados ────────────────────────────

const POSES: Pose[] = [
  'sentido', 'descanso', 'continencia', 'cintura', 'bracos-cima', 'aplaude', 'le', 'segura', 'aponta-e', 'aponta-d', 'aponta-cima',
  'dedo', 'pensa', 'ombros', 'luneta', 'corneta', 'brinda', 'tchau', 'equilibra', 'espia-e', 'espia-d', 'sem-corda', 'reverencia',
  'cobre-rosto', 'tambor', 'vitoria', 'chapeu', 'queixo', 'relogio', 'da-corda-e', 'da-corda-d',
];
const NA_MAO: Partial<Record<Pose, ItemDeMao>> = { luneta: 'luneta', corneta: 'corneta', brinda: 'xicara', 'aponta-cima': 'bastao', vitoria: 'bastao', segura: 'noz', tambor: 'baqueta' };
const NO_PEITO: Partial<Record<Pose, ItemDePeito>> = { le: 'pergaminho', tambor: 'tambor' };

function Galeria() {
  const elencos = [elencoDaCidade('marilia', { a: EXEMPLO.a, b: EXEMPLO.robson }), elencoDaCidade('birigui', { b: EXEMPLO.jessica })];
  const artistas = [elencos[0].a, elencos[0].b, elencos[1].b, elencos[1].a];
  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <DefsDoQuebraNozes />
      <div className="flex flex-wrap gap-2">
        {POSES.map((pose, i) => (
          <div key={pose} className="relative h-[236px] w-[150px] rounded-lg border bg-card">
            <div className="absolute left-1/2 top-[250px]">
              <QuebraNozes artista={artistas[i % artistas.length]} ref={el => {
                if (!el) return;
                aplicarNoBoneco(el, {
                  mostra: true, pose, itemD: NA_MAO[pose] ?? null, itemE: pose === 'relogio' ? 'relogio' : pose === 'tambor' ? 'baqueta' : null,
                  peito: NO_PEITO[pose] ?? null, enfeite: (['azevinho', 'estrela', 'floco', 'sininho'] as const)[i % 4],
                  boca: pose === 'queixo' ? 8 : 0,
                }, { coxia: 0 }, true);
              }} />
            </div>
            <span className="absolute left-1.5 top-1 text-[11px] font-semibold text-muted-foreground">{pose}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('lab')!).render(busca.get('galeria') ? <Galeria /> : <Lab />);
