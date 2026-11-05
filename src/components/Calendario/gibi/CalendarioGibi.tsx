/**
 * O Calendário do setor em gibi (pedido de 30/10/2026, a partir do «Estúdio do
 * Calendário»).
 *
 *   ┌ capa: desenho do tema · título com contorno · balão com a frase · dias úteis ┐
 *   ├ régua do mês: o que passou, hoje, feriados                                   ┤
 *   ├ grade de quadrinhos                         │ Faltam (próximo marco)         ┤
 *   │ (o «hoje» estoura, figurinha no destaque    │ Aniversariantes (em destaque)  │
 *   │  e no aniversário)                          │ O dia escolhido · Expediente   │
 *   │                                             │ Próximos dias                  │
 *   └─────────────────────────────────────────────┴────────────────────────────────┘
 *
 * Só desenha: quem lê o banco e decide dia útil e feriado é o painel
 * (`PainelCalendario`), e o laboratório (`lab-calendario.html`) passa dados de
 * exemplo. As regras de cor das casas são as de antes, na mesma ordem:
 * destaque › feriado das Metas › banco de horas › dia não útil › dia comum.
 *
 * Clicar num dia escolhe o dia (a caixa do lado mostra o que tem nele). Quem
 * monta o calendário, e quem está no celular — onde a caixa fica lá embaixo —,
 * já cai direto no dia aberto.
 *
 * Leve de propósito (30/10/2026: «o site já está pesado»): sem enfeite caindo,
 * sem confete. Desde 03/11/2026 há só umas animações curtas, de uma vez — o
 * mês novo surgindo, o «hoje» estourando, o quadrinho subindo no mouse (ver
 * «Movimento leve» em gibi.css).
 *
 * No «Copiar imagem», a caixa do dia escolhido fica de fora
 * (`data-html2canvas-ignore`): a imagem é o mês, não a tela de quem copiou.
 */
import { useEffect, useMemo, useState, type CSSProperties, type Ref } from 'react';
import { CalendarDays, Cake, ChevronDown, Clock, Megaphone, PartyPopper, Target } from 'lucide-react';
import { AvatarParticipante } from '@/pages/Analitico/Desafios/AvatarParticipante';
import { cn } from '@/lib/utils';
import {
  INFO_TIPO, SEMANA_CURTA, TIPOS_EVENTO, agendaPorDia, diaDaSemana, rotuloDoDia, rotuloDoMesLongo, semanasDoMes,
  type EventoCalendario, type FeriadoDoDia, type PaletaGibi, type TemaCalendario, type TipoEvento,
} from '@/lib/calendarioSetor';
import { misturar, primeiroNome, proximoMarco, reguaDoMes, varsDaPaleta } from '@/lib/calendarioGibi';
import { ICONE_TIPO } from '../estiloTipo';
import { Bolo, Estouro, Motivo } from './desenhos';
import { carregarFontesGibi } from './fontes';
import './gibi.css';

const COR_FERIADO = '#DC2626';
/** O feriado em que se trabalha: azul, de informação, e não o vermelho de folga. */
const COR_FERIADO_TRABALHADO = '#0284C7';
/** Quantos eventos cabem por extenso num quadrinho. */
const VISIVEIS = 3;
/** Quantas coisas de um mesmo dia a agenda do lado escreve antes do «+N neste dia». */
const POR_DIA_NA_AGENDA = 5;
/** Até onde a caixa e o toque se comportam como no celular (a grade vira pontos). */
const ESTREITO = '(max-width: 900px)';

export interface PropsCalendarioGibi {
  mes: string;
  setorNome: string | null;
  tema: TemaCalendario;
  paleta: PaletaGibi;
  titulo: string;
  frase: string | null;
  expedienteSemana: string | null;
  expedienteSabado: string | null;
  eventos: EventoCalendario[];
  porDia: ReadonlyMap<string, EventoCalendario[]>;
  ehDiaUtil: (iso: string) => boolean;
  feriados: ReadonlyMap<string, FeriadoDoDia>;
  hojeISO: string;
  podeEditar: boolean;
  onAbrirDia: (iso: string) => void;
  /** O que vira imagem no «Copiar imagem». */
  cartaoRef?: Ref<HTMLDivElement>;
}

function corDoTipo(tipo: TipoEvento): string {
  return INFO_TIPO[tipo].cor ?? 'var(--ac)';
}

function estiloTipo(cor: string): CSSProperties {
  return { '--tipo': cor } as CSSProperties;
}

export function CalendarioGibi(p: PropsCalendarioGibi) {
  const {
    mes, setorNome, tema, paleta, titulo, frase, eventos, porDia, ehDiaUtil, feriados, hojeISO,
    podeEditar, onAbrirDia, cartaoRef,
  } = p;

  useEffect(carregarFontesGibi, []);

  // O dia escolhido: hoje, no mês corrente; o dia 1, nos outros.
  const inicial = hojeISO.slice(0, 7) === mes ? hojeISO : `${mes}-01`;
  const [escolha, setEscolha] = useState<{ mes: string; iso: string } | null>(null);
  const sel = escolha?.mes === mes ? escolha.iso : inicial;

  const regua = useMemo(() => reguaDoMes(mes, ehDiaUtil, feriados, hojeISO), [mes, ehDiaUtil, feriados, hojeISO]);
  const marco = useMemo(
    () => (regua.tempo === 'passado' ? null : proximoMarco(eventos, feriados, hojeISO)),
    [regua.tempo, eventos, feriados, hojeISO],
  );
  const desde = regua.tempo === 'corrente' ? hojeISO : `${mes}-01`;
  const aniversarios = useMemo(() => eventos.filter(e => e.tipo === 'aniversario'), [eventos]);
  // A diretoria ganha o cartão grande; o resto segue na lista (04/11/2026).
  const niverDiretoria = useMemo(() => aniversarios.filter(a => a.pessoa_diretoria && a.pessoa_nome), [aniversarios]);
  const niverDemais = useMemo(() => aniversarios.filter(a => !(a.pessoa_diretoria && a.pessoa_nome)), [aniversarios]);
  const [agendaAberta, setAgendaAberta] = useState(lerAgendaAberta);
  const alternarAgenda = () => setAgendaAberta(v => { gravarAgendaAberta(!v); return !v; });
  const agenda = useMemo(() => agendaPorDia(eventos, feriados, desde), [eventos, feriados, desde]);
  const tiposNoMes = useMemo(
    () => TIPOS_EVENTO.filter(t => t !== 'feriado' && eventos.some(e => e.tipo === t)),
    [eventos],
  );
  const temFolga = [...feriados.values()].some(f => f.folga);
  const temTrabalhado = [...feriados.values()].some(f => !f.folga);

  // As listras do dia não útil e do feriado também em hex: gradiente com
  // `color-mix` some inteiro no «Copiar imagem».
  const estilo = {
    ...varsDaPaleta(paleta),
    '--listra': misturar(paleta.ink, 8, paleta.surf),
    '--feriado-1': misturar(COR_FERIADO, 20, paleta.surf),
    '--feriado-2': misturar(COR_FERIADO, 30, paleta.surf),
    '--niver': misturar(INFO_TIPO.aniversario.cor ?? paleta.ac, 16, paleta.surf),
    '--niver-forte': misturar(INFO_TIPO.aniversario.cor ?? paleta.ac, 38, paleta.surf),
  } as CSSProperties;
  const nomeDoMes = rotuloDoMesLongo(mes).replace(' de ', ' ');

  function escolher(iso: string) {
    setEscolha({ mes, iso });
    if (podeEditar || window.matchMedia(ESTREITO).matches) onAbrirDia(iso);
  }

  return (
    <div ref={cartaoRef} className="gb" style={estilo}>
      <div className="gb-in">
        <header className="gb-capa">
          <div className="gb-motivo" aria-hidden><Motivo id={tema.motivo} cores={paleta} /></div>
          <div className="gb-capa-txt">
            <p className="gb-mes">{setorNome ? `${setorNome} · ${nomeDoMes}` : nomeDoMes}</p>
            <h3 className="gb-titulo">{titulo}</h3>
            {frase && <p className="gb-frase">{frase}</p>}
          </div>
          <div className="gb-capa-num"><b>{regua.uteis}</b><span>dias úteis</span></div>
        </header>

        <div className="gb-regua">
          <div className="gb-regua-seg" aria-hidden>
            {regua.segmentos.map(s => (
              <span
                key={s.iso}
                className="gb-seg"
                title={rotuloDoDia(s.iso)}
                data-quando={s.quando}
                data-feriado={s.feriado ? '' : undefined}
                data-nao-util={!s.util && !s.feriado ? '' : undefined}
              />
            ))}
          </div>
          <div className="gb-regua-txt">
            {regua.tempo === 'corrente' ? (
              <>
                <span>Dia útil {regua.uteisAteHoje} de {regua.uteis}</span>
                <span>{regua.uteisRestantes} {regua.uteisRestantes === 1 ? 'útil' : 'úteis'} pela frente</span>
              </>
            ) : (
              <>
                <span>{regua.uteis} dias úteis</span>
                <span>{regua.tempo === 'passado' ? 'Mês encerrado' : 'Ainda vai começar'}</span>
              </>
            )}
          </div>
        </div>

        <div className="gb-corpo">
          <div className="gb-grade-wrap">
            <div className="gb-semana" aria-hidden>{SEMANA_CURTA.map(d => <span key={d}>{d}</span>)}</div>
            {/* A chave do mês refaz a grade na troca de mês: é o que roda o «surgir» de leve (gibi.css). */}
            <div key={mes} role="grid" aria-label="Dias do mês" className="gb-grade">
              {semanasDoMes(mes).flat().map((iso, i) => iso
                ? (
                  <Quadrinho
                    key={iso}
                    iso={iso}
                    eventos={porDia.get(iso) ?? []}
                    util={ehDiaUtil(iso)}
                    feriado={feriados.get(iso) ?? null}
                    hoje={iso === hojeISO}
                    escolhido={iso === sel}
                    tema={tema}
                    paleta={paleta}
                    onClick={() => escolher(iso)}
                  />
                )
                : <span key={`fora-${i}`} className="gb-fora" aria-hidden />)}
            </div>

            <div className="gb-legenda">
              {tiposNoMes.map(t => <span key={t}><i style={estiloTipo(corDoTipo(t))} />{INFO_TIPO[t].rotulo}</span>)}
              {temFolga && <span><i style={estiloTipo(COR_FERIADO)} />Feriado (não trabalha)</span>}
              {temTrabalhado && <span><i style={estiloTipo(COR_FERIADO_TRABALHADO)} />Feriado com expediente</span>}
              <span><i data-q style={estiloTipo('#94A3B8')} />Não é dia útil</span>
              {podeEditar && <span className="gb-dica">Clique num dia para lançar</span>}
            </div>
          </div>

          <aside className="gb-lado">
            {regua.tempo !== 'passado' && (
              <section className="gb-box gb-box-proximo">
                <h4><Target className="h-4 w-4" aria-hidden />Faltam</h4>
                {marco ? (
                  <div className="gb-prox">
                    <div className="gb-prox-num">
                      <Estouro forma="marco" cor={paleta.ac} className="gb-estouro" />
                      <div><b>{marco.faltam}</b><small>{marco.faltam === 1 ? 'dia' : 'dias'}</small></div>
                    </div>
                    <div className="gb-prox-txt"><b>{marco.titulo}</b><span>{rotuloDoDia(marco.dia)}</span></div>
                  </div>
                ) : (
                  <p className="gb-vazio">Nada marcado até o fim do mês.</p>
                )}
              </section>
            )}

            {/* Aniversariantes logo abaixo do «Faltam» e em destaque (04/11/2026):
                não é todo dia, e é o que mais se procura no calendário. O Mural
                saiu no mesmo dia: repetia os avisos que já estão em «Próximos
                dias» e na grade. */}
            {aniversarios.length > 0 && (
              <section className="gb-box gb-box-niver">
                <h4><Cake className="h-4 w-4" aria-hidden />Aniversariantes</h4>
                {niverDiretoria.map(a => (
                  <DestaqueDiretoria key={a.id} evento={a} hojeISO={hojeISO} paleta={paleta} onAbrir={() => escolher(a.dia)} />
                ))}
                {niverDemais.length > 0 && (
                <ul className="gb-niver">
                  {niverDemais.map(a => (
                    <li key={a.id} data-passou={a.dia < hojeISO ? '' : undefined}>
                      <button type="button" onClick={() => escolher(a.dia)}>
                        <AvatarParticipante nome={a.pessoa_nome ?? a.titulo} fotoUrl={a.pessoa_foto} className="gb-av h-9 w-9" />
                        <span className="min-w-0">
                          <b className="truncate">{a.pessoa_nome ?? a.titulo}</b>
                          <span>{a.dia === hojeISO ? 'Hoje! 🎉' : `Dia ${Number(a.dia.slice(8, 10))}`}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                )}
              </section>
            )}

            <CaixaDoDia
              iso={sel}
              hojeISO={hojeISO}
              eventos={porDia.get(sel) ?? []}
              util={ehDiaUtil(sel)}
              feriado={feriados.get(sel) ?? null}
              podeEditar={podeEditar}
              onAbrir={() => onAbrirDia(sel)}
            />

            {(p.expedienteSemana || p.expedienteSabado) && (
              <section className="gb-box">
                <h4><Clock className="h-4 w-4" aria-hidden />Expediente</h4>
                <dl className="gb-expediente">
                  {p.expedienteSemana && <div><dt>Segunda a sexta</dt><dd>{p.expedienteSemana}</dd></div>}
                  {p.expedienteSabado && <div><dt>Sábado</dt><dd>{p.expedienteSabado}</dd></div>}
                </dl>
              </section>
            )}

            <section className="gb-box">
              {/* Minimizar é escolha de quem olha, e fica lembrada neste navegador
                  (04/11/2026). Na cópia em imagem o botão não entra. */}
              <div className="gb-box-topo">
                <h4><Megaphone className="h-4 w-4" aria-hidden />{regua.tempo === 'corrente' ? 'Próximos dias' : 'Agenda do mês'}</h4>
                {agenda.dias.length > 0 && (
                  <button type="button" className="gb-recolher" onClick={alternarAgenda} aria-expanded={agendaAberta}
                    aria-controls="gb-agenda-lista" data-html2canvas-ignore>
                    {agendaAberta ? 'Minimizar' : 'Mostrar'}
                    <ChevronDown aria-hidden className={cn('h-3.5 w-3.5 transition-transform', agendaAberta && 'rotate-180')} />
                  </button>
                )}
              </div>
              {agenda.dias.length > 0 && !agendaAberta ? (
                <button type="button" className="gb-agenda-resumo" onClick={alternarAgenda}>
                  {resumoDaAgenda(agenda.dias)}
                </button>
              ) : agenda.dias.length === 0 ? (
                <p className="gb-vazio">{regua.tempo === 'corrente' ? 'Nada marcado daqui até o fim do mês.' : 'Nada marcado neste mês.'}</p>
              ) : (
                <ol className="gb-agenda" id="gb-agenda-lista">
                  {agenda.dias.map(d => {
                    const visiveis = d.eventos.slice(0, POR_DIA_NA_AGENDA - (d.feriado ? 1 : 0));
                    const sobra = d.eventos.length - visiveis.length;
                    return (
                      <li key={d.dia}>
                        <button type="button" onClick={() => escolher(d.dia)} aria-label={`Abrir ${rotuloDoDia(d.dia)}`}>
                          <span className={cn('gb-ag-data', d.dia === hojeISO && 'gb-ag-hoje')}>
                            <b>{d.dia.slice(8, 10)}</b>
                            <span>{d.dia === hojeISO ? 'hoje' : SEMANA_CURTA[diaDaSemana(d.dia)]}</span>
                          </span>
                          <span className="gb-ag-itens">
                            {d.feriado && (
                              <span className="gb-ag-item" style={estiloTipo(d.feriado.folga ? COR_FERIADO : COR_FERIADO_TRABALHADO)}>
                                <span className="gb-ag-txt">
                                  <b>{d.feriado.nome}</b>
                                  <span>{d.feriado.folga ? 'Feriado: não trabalha' : 'Feriado com expediente normal'}</span>
                                </span>
                              </span>
                            )}
                            {visiveis.map(e => (
                              <span key={e.id} className="gb-ag-item" style={estiloTipo(corDoTipo(e.tipo))}>
                                {e.tipo === 'aniversario' && e.pessoa_nome && (
                                  <AvatarParticipante nome={e.pessoa_nome} fotoUrl={e.pessoa_foto} className="gb-av gb-ag-av h-7 w-7 text-[9px]" />
                                )}
                                <span className="gb-ag-txt">
                                  <b>{e.tipo === 'aniversario' && e.pessoa_nome ? `Aniversário: ${e.pessoa_nome}` : e.titulo}</b>
                                  {e.detalhe && <span>{e.detalhe}</span>}
                                </span>
                              </span>
                            ))}
                            {sobra > 0 && <span className="gb-ag-mais">+{sobra} neste dia</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {agenda.proximoOculto && (
                    <li>
                      <button type="button" className="gb-ag-rodape" onClick={() => escolher(agenda.proximoOculto!)}>
                        <span>{agenda.ocultos === 1 ? 'Mais 1 dia marcado' : `Mais ${agenda.ocultos} dias marcados`}</span>
                        <b>Ver o dia {agenda.proximoOculto.slice(8, 10)} →</b>
                      </button>
                    </li>
                  )}
                </ol>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Um dia da grade ──────────────────────────────────────────────────────────

function Quadrinho({ iso, eventos, util, feriado, hoje, escolhido, tema, paleta, onClick }: {
  iso: string;
  eventos: EventoCalendario[];
  util: boolean;
  feriado: FeriadoDoDia | null;
  hoje: boolean;
  escolhido: boolean;
  tema: TemaCalendario;
  paleta: PaletaGibi;
  onClick: () => void;
}) {
  const dia = Number(iso.slice(8, 10));
  const forte = eventos.some(e => e.destaque);
  const folga = feriado?.folga === true;
  const banco = eventos.some(e => e.tipo === 'banco_horas');
  const aniversario = eventos.some(e => e.tipo === 'aniversario');
  const aniversariante = eventos.find(e => e.tipo === 'aniversario' && e.pessoa_nome) ?? null;
  const diretoria = eventos.some(e => e.tipo === 'aniversario' && e.pessoa_diretoria);
  const corFeriado = folga ? COR_FERIADO : COR_FERIADO_TRABALHADO;

  const linhas: {
    chave: string; titulo: string; detalhe: string | null; cor: string;
    /** O aniversariante marcado: a foto vai na etiqueta, ao lado do nome. */
    pessoa: { nome: string; foto: string | null } | null;
  }[] = [
    ...(feriado ? [{ chave: 'feriado', titulo: feriado.nome, detalhe: folga ? null : 'expediente normal', cor: corFeriado, pessoa: null }] : []),
    ...eventos.map(e => ({
      chave: e.id,
      titulo: e.tipo === 'aniversario' && e.pessoa_nome ? primeiroNome(e.pessoa_nome) : e.titulo,
      detalhe: e.detalhe,
      cor: corDoTipo(e.tipo),
      pessoa: e.tipo === 'aniversario' && e.pessoa_nome ? { nome: e.pessoa_nome, foto: e.pessoa_foto } : null,
    })),
  ];

  const descricao = [
    `Dia ${dia}`,
    hoje ? 'hoje' : null,
    util ? 'dia útil' : 'não é dia útil',
    feriado ? (folga ? `feriado: ${feriado.nome}` : `${feriado.nome}, expediente normal`) : null,
    ...eventos.map(e => [e.titulo, e.detalhe, e.pessoa_nome].filter(Boolean).join(' ')),
  ].filter(Boolean).join(', ');

  return (
    <button
      type="button"
      role="gridcell"
      onClick={onClick}
      aria-label={descricao}
      aria-selected={escolhido}
      data-sel={escolhido ? '' : undefined}
      className={cn(
        'gb-dia',
        forte ? 'gb-forte' : folga ? 'gb-feriado' : banco ? 'gb-tinta' : !util && 'gb-nao-util',
        hoje && 'gb-hoje',
        diretoria && 'gb-dia-dir',
      )}
    >
      <span className="gb-dia-top">
        <span className="gb-n">
          {hoje && <Estouro forma="hoje" cor={paleta.ac2} className="gb-estouro" />}
          {String(dia).padStart(2, '0')}
        </span>
        {hoje && <span className="gb-selo-hoje">Hoje</span>}
      </span>

      <span className="gb-evs" aria-hidden>
        {linhas.slice(0, VISIVEIS).map(l => (
          <span key={l.chave} className="gb-ev" style={estiloTipo(l.cor)}>
            {l.pessoa && (
              <AvatarParticipante nome={l.pessoa.nome} fotoUrl={l.pessoa.foto} className="gb-av gb-ev-av h-[22px] w-[22px] text-[8px]" />
            )}
            <span className="gb-ev-tx">
              <span className="gb-ev-t">{l.titulo}</span>
              {l.detalhe && <span className="gb-ev-d">{l.detalhe}</span>}
            </span>
          </span>
        ))}
        {linhas.length > VISIVEIS && <span className="gb-mais">+{linhas.length - VISIVEIS} mais</span>}
      </span>

      {linhas.length > 0 && (
        <span className="gb-pontos" aria-hidden>
          {linhas.slice(0, 5).map(l => <i key={l.chave} style={estiloTipo(l.cor)} />)}
        </span>
      )}

      {/* A foto do aniversariante marcado (04/11/2026). Na casa larga ela vai na
          etiqueta, ao lado do nome (acima); na estreita a casa só tem pontos, e
          a foto toma o canto no lugar da figurinha — ver `gibi.css`. */}
      {aniversariante && (
        <span className="gb-niver-foto" aria-hidden>
          <AvatarParticipante nome={aniversariante.pessoa_nome ?? aniversariante.titulo} fotoUrl={aniversariante.pessoa_foto} className="gb-av gb-niver-av h-full w-full text-[8px]" />
        </span>
      )}
      {forte
        ? <span className={cn('gb-figurinha', aniversariante && 'gb-fig-com-foto')} aria-hidden><Motivo id={tema.motivo} cores={paleta} /></span>
        : aniversario && <span className={cn('gb-figurinha', aniversariante && 'gb-fig-com-foto')} aria-hidden><Bolo cores={paleta} /></span>}
    </button>
  );
}

// ── O dia escolhido ──────────────────────────────────────────────────────────

function CaixaDoDia({ iso, hojeISO, eventos, util, feriado, podeEditar, onAbrir }: {
  iso: string;
  hojeISO: string;
  eventos: EventoCalendario[];
  util: boolean;
  feriado: FeriadoDoDia | null;
  podeEditar: boolean;
  onAbrir: () => void;
}) {
  const vazio = eventos.length === 0 && !feriado;

  return (
    <section className="gb-box" data-html2canvas-ignore>
      <h4>
        <CalendarDays className="h-4 w-4" aria-hidden />
        <span>{iso === hojeISO ? 'Hoje' : rotuloDoDia(iso).split(',')[0]}</span>
      </h4>
      <p className="gb-vazio" style={{ marginTop: 6 }}>{rotuloDoDia(iso)}</p>

      {vazio ? (
        <p className="gb-vazio">{util ? 'Nada marcado. Dia útil normal.' : 'Nada marcado. Não é dia útil.'}</p>
      ) : (
        <ul className="gb-lista">
          {feriado && (
            <li className="gb-item">
              <span className="gb-ic" style={estiloTipo(feriado.folga ? COR_FERIADO : COR_FERIADO_TRABALHADO)}>
                <PartyPopper aria-hidden />
              </span>
              <div><b>{feriado.nome}</b><span>{feriado.folga ? 'Feriado: não trabalha' : 'Feriado com expediente normal'}</span></div>
            </li>
          )}
          {eventos.map(e => {
            const Icone = ICONE_TIPO[e.tipo];
            return (
              <li key={e.id} className="gb-item">
                {e.tipo === 'aniversario' && e.pessoa_nome
                  ? <AvatarParticipante nome={e.pessoa_nome} fotoUrl={e.pessoa_foto} className="gb-av h-9 w-9" />
                  : <span className="gb-ic" style={estiloTipo(corDoTipo(e.tipo))}><Icone aria-hidden /></span>}
                <div>
                  <b>{e.tipo === 'aniversario' && e.pessoa_nome ? e.pessoa_nome : e.titulo}</b>
                  <span>{e.tipo === 'aniversario' ? 'Aniversário' : (e.detalhe || INFO_TIPO[e.tipo].rotulo)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className="gb-botao" onClick={onAbrir}>
        {podeEditar ? 'Lançar neste dia' : 'Abrir o dia'}
      </button>
    </section>
  );
}

// ── O aniversário da diretoria, em destaque (04/11/2026) ─────────────────────

/** Dias de `de` até `ate` (datas ISO), contando pelo calendário, não pelo fuso. */
function diasEntre(de: string, ate: string): number {
  const [a, b, c] = de.split('-').map(Number);
  const [x, y, z] = ate.split('-').map(Number);
  return Math.round((Date.UTC(x, y - 1, z) - Date.UTC(a, b - 1, c)) / 86_400_000);
}

function contagem(dia: string, hojeISO: string): string {
  const n = diasEntre(hojeISO, dia);
  if (n === 0) return 'É hoje! 🎉';
  if (n === 1) return 'É amanhã!';
  if (n > 1) return `Faltam ${n} dias`;
  return n === -1 ? 'Foi ontem' : `Foi há ${-n} dias`;
}

function DestaqueDiretoria({ evento, hojeISO, paleta, onAbrir }: {
  evento: EventoCalendario;
  hojeISO: string;
  paleta: PaletaGibi;
  onAbrir: () => void;
}) {
  const nome = evento.pessoa_nome ?? evento.titulo;
  return (
    <button type="button" className="gb-dir" data-hoje={evento.dia === hojeISO ? '' : undefined}
      data-passou={evento.dia < hojeISO ? '' : undefined} onClick={onAbrir}
      aria-label={`Aniversário de ${nome}, da diretoria: ${rotuloDoDia(evento.dia)}`}>
      <span className="gb-dir-selo">Diretoria</span>
      <AvatarParticipante nome={nome} fotoUrl={evento.pessoa_foto} className="gb-av gb-dir-av h-16 w-16 text-base" />
      <span className="gb-dir-txt">
        <small>Aniversário</small>
        <b>{nome}</b>
        <span>{rotuloDoDia(evento.dia)}</span>
        <em>{contagem(evento.dia, hojeISO)}</em>
      </span>
      <span className="gb-dir-bolo" aria-hidden><Bolo cores={paleta} /></span>
    </button>
  );
}

// ── «Próximos dias» minimizado ───────────────────────────────────────────────

const CHAVE_AGENDA = 'calendario:proximos-dias:aberta';

function lerAgendaAberta(): boolean {
  try { return window.localStorage.getItem(CHAVE_AGENDA) !== 'nao'; } catch { return true; }
}

function gravarAgendaAberta(aberta: boolean): void {
  try { window.localStorage.setItem(CHAVE_AGENDA, aberta ? 'sim' : 'nao'); } catch { /* sem armazenamento: só não lembra */ }
}

/** «4 coisas marcadas nos próximos 3 dias · toque para ver». */
function resumoDaAgenda(dias: readonly { feriado: unknown; eventos: readonly unknown[] }[]): string {
  const coisas = dias.reduce((n, d) => n + d.eventos.length + (d.feriado ? 1 : 0), 0);
  const quantos = dias.length === 1 ? 'no próximo dia' : `nos próximos ${dias.length} dias`;
  return `${coisas} ${coisas === 1 ? 'coisa marcada' : 'coisas marcadas'} ${quantos} · toque para ver`;
}
