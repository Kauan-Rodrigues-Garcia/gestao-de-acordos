/**
 * laboratorio.tsx — o Calendário em gibi com dados de exemplo, SÓ no localhost
 * (http://localhost:8080/lab-calendario.html). Troca de tema, claro/escuro,
 * quem monta × operador, o «hoje» e o botão do topo com o lembrete,
 * sem passar pelo login nem pelo banco. Os nomes são fictícios.
 *
 * `?tema=halloween&escuro=1&hoje=2026-10-29&largura=390` abre já escolhido
 * (é por aqui que dá para tirar print de cada tema).
 *
 * O tempo (06/11/2026), sem rede: `?clima=chuva&noite=1&estacao=inverno&chao=cidade&temp=31`,
 * `&tempo=1` já abre o card do tempo, e `&galeria=1` mostra todos os
 * personagens e cenários da estação.
 */
import { StrictMode, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import {
  TEMAS, eventosPorDia, feriadosDoMes, idDaCorLivre, rotuloDoDia, temaEfetivo, type EventoCalendario,
} from '@/lib/calendarioSetor';
import { paletaGibi } from '@/lib/calendarioGibi';
import { copiarImagemDoElemento } from '@/lib/copiarImagem';
import { BotaoDoMes } from './BotaoDoMes';
import { CalendarioGibi } from './CalendarioGibi';
import { CaixaDoTempo } from '../clima/CaixaDoTempo';
import { BotaoDoTempo } from '../clima/BotaoDoTempo';
import { CHAOS, CONDICOES, ESTACOES, GaleriaDoTempo, previsaoDeExemplo, type Chao } from '../clima/laboratorioClima';
import { estacaoDoDia, resumoDoClima, type CondicaoClima, type Estacao } from '@/lib/clima';

const URL_INICIAL = new URLSearchParams(window.location.search);

let seq = 0;
function ev(dia: string, tipo: EventoCalendario['tipo'], titulo: string, extra: Partial<EventoCalendario> = {}): EventoCalendario {
  seq += 1;
  return {
    id: `ev-${seq}`, dia, tipo, titulo, detalhe: null, destaque: false,
    pessoa_id: null, pessoa_nome: null, pessoa_foto: null, ...extra,
  };
}

/** Um mês de exemplo: o mesmo desenho de dias em qualquer mês, com o dia do mês trocado. */
function eventosDoMes(mes: string): EventoCalendario[] {
  const d = (n: number) => `${mes}-${String(n).padStart(2, '0')}`;
  return [
    ev(d(3), 'banco_horas', 'Banco de horas', { detalhe: '08:30 às 12:00' }),
    ev(d(6), 'aviso', 'Entrada Play 1'),
    ev(d(8), 'aniversario', 'Aniversário', { pessoa_nome: 'Ana Souza', pessoa_id: 'p1' }),
    ev(d(8), 'evento', 'Reunião de resultados', { detalhe: '09:00' }),
    ev(d(8), 'evento', 'Treinamento do novo roteiro', { detalhe: '14:00' }),
    ev(d(10), 'banco_horas', 'Banco de horas', { detalhe: '08:30 às 12:00' }),
    ev(d(13), 'banco_horas', 'Banco de horas', { detalhe: 'até às 19:00' }),
    // Aniversário da diretoria, lançado em outro setor (20261104160000): cartão grande.
    ev(d(13), 'aniversario', 'Aniversário', {
      pessoa_nome: 'Rita Moraes', pessoa_id: 'p3', pessoa_diretoria: true, de_outro_setor: true, setor_origem: 'Play 1',
    }),
    ev(d(16), 'aviso', 'Prazo da escala', { detalhe: 'até 18:00' }),
    ev(d(19), 'evento', 'Dia D do tema', { detalhe: 'Todo mundo no clima', destaque: true }),
    ev(d(21), 'aviso', 'Entrada Play 1'),
    ev(d(24), 'banco_horas', 'Banco de horas', { detalhe: '08:30 às 12:00' }),
    ev(d(26), 'aniversario', 'Aniversário', { pessoa_nome: 'Diego Alves', pessoa_id: 'p2' }),
    ev(d(28), 'folga', 'Folga da equipe B'),
    ev(d(29), 'horario', 'Fechamento do mês', { detalhe: 'até 18:00' }),
  ];
}

/** Segunda a sexta, menos o feriado das Metas. */
function regraDoDia(feriados: readonly string[]) {
  return (iso: string) => {
    const [y, m, dd] = iso.split('-').map(Number);
    const dow = new Date(y, m - 1, dd).getDay();
    return dow >= 1 && dow <= 5 && !feriados.includes(iso);
  };
}

function Laboratorio() {
  const [temaId, setTemaId] = useState(URL_INICIAL.get('tema') ?? 'automatico');
  const [cor, setCor] = useState('#0D9488');
  const [escuro, setEscuro] = useState(URL_INICIAL.get('escuro') === '1');
  const [editor, setEditor] = useState(URL_INICIAL.get('editor') === '1');
  const [hojeISO, setHojeISO] = useState(URL_INICIAL.get('hoje') ?? '2026-10-08');
  const [largura, setLargura] = useState(Number(URL_INICIAL.get('largura')) || 0);
  const [chamando, setChamando] = useState(URL_INICIAL.get('tempo') !== '1');
  const [aviso, setAviso] = useState('');
  const [condicao, setCondicao] = useState<CondicaoClima>((URL_INICIAL.get('clima') as CondicaoClima | null) ?? 'limpo');
  const [noite, setNoite] = useState(URL_INICIAL.get('noite') === '1');
  const [estacaoForcada, setEstacaoForcada] = useState<Estacao | ''>((URL_INICIAL.get('estacao') as Estacao | null) ?? '');
  const [chao, setChao] = useState<Chao | ''>((URL_INICIAL.get('chao') as Chao | null) ?? '');
  const [variante, setVariante] = useState(Number(URL_INICIAL.get('variante')) || 0);
  const [temp, setTemp] = useState(Number(URL_INICIAL.get('temp')) || 29);
  const [galeria, setGaleria] = useState(URL_INICIAL.get('galeria') === '1');
  const [tempoAberto, setTempoAberto] = useState(URL_INICIAL.get('tempo') === '1');
  const cartao = useRef<HTMLDivElement>(null);

  const mes = hojeISO.slice(0, 7);
  const tema = temaEfetivo(temaId === 'cor_livre' ? idDaCorLivre(cor) : temaId, Number(mes.slice(5, 7)));
  const paleta = useMemo(() => paletaGibi(tema, escuro), [tema, escuro]);
  const eventos = useMemo(() => eventosDoMes(mes), [mes]);
  const porDia = useMemo(() => eventosPorDia(eventos), [eventos]);
  // O feriado das Metas: o nacional do mês, se houver (12/10 em outubro, 02/11 e 20/11 em novembro…).
  const oficiais = useMemo(
    () => [...feriadosDoMes(mes, []).keys()].filter(iso => !iso.endsWith('-28')),
    [mes],
  );
  const feriados = useMemo(() => feriadosDoMes(mes, oficiais), [mes, oficiais]);
  const ehDiaUtil = useMemo(() => regraDoDia(oficiais), [oficiais]);
  const hoje = porDia.get(hojeISO) ?? [];
  const previsao = useMemo(() => previsaoDeExemplo(condicao, noite, temp, hojeISO), [condicao, noite, temp, hojeISO]);
  const estacao = estacaoForcada || estacaoDoDia(hojeISO);

  const fundo: CSSProperties = escuro
    ? { background: '#0F1115', color: '#ECEEF3', colorScheme: 'dark' }
    : { background: '#F3F4F7', color: '#15171C', colorScheme: 'light' };

  async function copiar() {
    if (!cartao.current) return;
    try {
      const r = await copiarImagemDoElemento(cartao.current, `calendario-${tema.id}.png`, paleta.paper);
      setAviso(r === 'copiado' ? 'Imagem copiada.' : 'Imagem baixada.');
    } catch (e) {
      setAviso(`Falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div style={{ ...fundo, minHeight: '100vh', padding: 16 }} className={escuro ? 'dark' : undefined}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 14 }}>
          <b style={{ fontSize: 18 }}>Laboratório do Calendário</b>
          <label>Tema{' '}
            <select value={temaId} onChange={e => setTemaId(e.target.value)}>
              <option value="automatico">Automático</option>
              <optgroup label="Campanhas do mês">
                {TEMAS.filter(t => t.id === 'padrao' || t.mes).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </optgroup>
              <optgroup label="Datas comemorativas">
                {TEMAS.filter(t => t.id !== 'padrao' && !t.mes).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </optgroup>
              <option value="cor_livre">Cor livre</option>
            </select>
          </label>
          {temaId === 'cor_livre' && <input type="color" value={cor} onChange={e => setCor(e.target.value)} />}
          <label>Hoje <input type="date" value={hojeISO} onChange={e => e.target.value && setHojeISO(e.target.value)} /></label>
          <label><input type="checkbox" checked={escuro} onChange={e => setEscuro(e.target.checked)} /> Escuro</label>
          <label><input type="checkbox" checked={editor} onChange={e => setEditor(e.target.checked)} /> Quem monta</label>
          <label>Largura{' '}
            <select value={largura} onChange={e => setLargura(Number(e.target.value))}>
              <option value={0}>Tela toda</option>
              <option value={390}>Celular (390)</option>
              <option value={768}>Tablet (768)</option>
            </select>
          </label>
          <button type="button" onClick={() => void copiar()} style={{ border: '1px solid currentColor', borderRadius: 8, padding: '2px 10px' }}>
            Copiar imagem
          </button>
          {aviso && <span>{aviso}</span>}
        </header>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 14 }}>
          <b>Tempo:</b>
          <select value={condicao} onChange={e => setCondicao(e.target.value as CondicaoClima)}>
            {CONDICOES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label><input type="checkbox" checked={noite} onChange={e => setNoite(e.target.checked)} /> Noite</label>
          <label>Estação{' '}
            <select value={estacaoForcada} onChange={e => setEstacaoForcada(e.target.value as Estacao | '')}>
              <option value="">Pelo dia</option>
              {ESTACOES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Chão{' '}
            <select value={chao} onChange={e => setChao(e.target.value as Chao | '')}>
              <option value="">Pelo dia</option>
              {CHAOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Acessório <select value={variante} onChange={e => setVariante(Number(e.target.value))}><option value={0}>1</option><option value={1}>2</option></select></label>
          <label>Temp <input type="number" value={temp} onChange={e => setTemp(Number(e.target.value))} style={{ width: 56 }} /></label>
          <label><input type="checkbox" checked={galeria} onChange={e => setGaleria(e.target.checked)} /> Galeria</label>
        </div>

        {galeria && <GaleriaDoTempo cores={paleta} estacao={estacao} variante={variante} />}

        {/* `relative`, como o header do app: no celular o lembrete se mede por esta barra. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 12, border: '1px solid #8884', minHeight: 56 }}>
          <span style={{ fontWeight: 700 }}>Barra do app:</span>
          <BotaoDoMes
            tema={tema}
            paleta={paleta}
            hojeISO={hojeISO}
            eventosHoje={hoje}
            chamando={chamando}
            rascunhoParaPublicar={editor}
            onAbrir={() => setChamando(false)}
            onDispensar={() => setChamando(false)}
          />
          <BotaoDoTempo
            paleta={paleta}
            clima={{ condicao, noite, temp, estacao, variante, resumo: resumoDoClima('birigui', previsao) }}
            aberto={tempoAberto}
            onAlternar={() => setTempoAberto(v => !v)}
            onFechar={() => setTempoAberto(false)}
          >
            <CaixaDoTempo
              cidade="birigui"
              previsao={previsao}
              geradoEm={new Date().toISOString()}
              carregando={false}
              hojeISO={hojeISO}
              cores={paleta}
              forcar={{ estacao, chao: chao || undefined, variante }}
            />
          </BotaoDoTempo>
          {!chamando && hoje.length > 0 && (
            <button type="button" onClick={() => setChamando(true)} style={{ marginLeft: 'auto', textDecoration: 'underline' }}>
              Mostrar o lembrete de novo
            </button>
          )}
        </div>

        <div style={{ maxWidth: largura || undefined, width: '100%', margin: largura ? '0 auto' : undefined, marginTop: chamando || tempoAberto ? (tempoAberto ? 620 : 260) : 0 }}>
          <CalendarioGibi
            mes={mes}
            setorNome="Receptivo"
            tema={tema}
            paleta={paleta}
            titulo={tema.titulo || 'Calendário do setor'}
            frase={tema.frase || null}
            expedienteSemana="08:00 às 17:00"
            expedienteSabado="08:30 às 12:00"
            eventos={eventos}
            porDia={porDia}
            ehDiaUtil={ehDiaUtil}
            feriados={feriados}
            hojeISO={hojeISO}
            podeEditar={editor}
            onAbrirDia={iso => setAviso(`Abriria o dia ${rotuloDoDia(iso)}`)}
            cartaoRef={cartao}
          />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Laboratorio />
  </StrictMode>,
);
