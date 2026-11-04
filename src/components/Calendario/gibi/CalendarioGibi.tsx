/**
 * O Calendário do setor em gibi (pedido de 30/10/2026, a partir do «Estúdio do
 * Calendário»).
 *
 *   ┌ capa: desenho do tema · título com contorno · balão com a frase · dias úteis ┐
 *   ├ régua do mês: o que passou, hoje, feriados                                   ┤
 *   ├ grade de quadrinhos                         │ Faltam (próximo marco)         ┤
 *   │ (o «hoje» estoura, figurinha no destaque    │ O dia escolhido                │
 *   │  e no aniversário)                          │ Expediente · Aniversariantes   │
 *   │                                             │ Mural (avisos) · Próximos dias │
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
import { CalendarDays, Cake, Clock, Megaphone, PartyPopper, Pin, Target } from 'lucide-react';
import { AvatarParticipante } from '@/pages/Analitico/Desafios/AvatarParticipante';
import { cn } from '@/lib/utils';
import {
  INFO_TIPO, SEMANA_CURTA, TIPOS_EVENTO, diaDaSemana, rotuloDoDia, rotuloDoMesLongo, semanasDoMes,
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
/** Quantos dias a agenda do lado lista antes do «e mais». */
const AGENDA = 6;
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
  const avisos = useMemo(() => eventos.filter(e => e.tipo === 'aviso' && e.dia >= desde).slice(0, 3), [eventos, desde]);
  const agenda = useMemo(() => eventos.filter(e => e.dia >= desde && e.tipo !== 'banco_horas'), [eventos, desde]);
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

            {aniversarios.length > 0 && (
              <section className="gb-box">
                <h4><Cake className="h-4 w-4" aria-hidden />Aniversariantes</h4>
                <ul className="gb-niver">
                  {aniversarios.map(a => (
                    <li key={a.id}>
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
              </section>
            )}

            {avisos.length > 0 && (
              <section className="gb-box">
                <h4><Pin className="h-4 w-4" aria-hidden />Mural</h4>
                <div className="gb-mural">
                  {avisos.map(e => (
                    <div key={e.id} className="gb-bilhete">
                      {e.titulo}{e.detalhe ? `, ${e.detalhe}` : ''}
                      <small>Aviso · dia {e.dia.slice(8, 10)}</small>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="gb-box">
              <h4><Megaphone className="h-4 w-4" aria-hidden />{regua.tempo === 'corrente' ? 'Próximos dias' : 'Agenda do mês'}</h4>
              {agenda.length === 0 ? (
                <p className="gb-vazio">{regua.tempo === 'corrente' ? 'Nada marcado daqui até o fim do mês.' : 'Nada marcado neste mês.'}</p>
              ) : (
                <ol className="gb-agenda">
                  {agenda.slice(0, AGENDA).map(e => (
                    <li key={e.id}>
                      <button type="button" onClick={() => escolher(e.dia)}>
                        <span className="gb-ag-data">
                          <b>{e.dia.slice(8, 10)}</b>
                          <span>{e.dia === hojeISO ? 'hoje' : SEMANA_CURTA[diaDaSemana(e.dia)]}</span>
                        </span>
                        <span className="gb-ag-txt" style={estiloTipo(corDoTipo(e.tipo))}>
                          <b>{e.tipo === 'aniversario' && e.pessoa_nome ? `Aniversário: ${e.pessoa_nome}` : e.titulo}</b>
                          {e.detalhe && <span>{e.detalhe}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                  {agenda.length > AGENDA && (
                    <li className="gb-vazio">e mais {agenda.length - AGENDA} — toque no dia na grade para ver</li>
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
  const corFeriado = folga ? COR_FERIADO : COR_FERIADO_TRABALHADO;

  const linhas: { chave: string; titulo: string; detalhe: string | null; cor: string }[] = [
    ...(feriado ? [{ chave: 'feriado', titulo: feriado.nome, detalhe: folga ? null : 'expediente normal', cor: corFeriado }] : []),
    ...eventos.map(e => ({
      chave: e.id,
      titulo: e.tipo === 'aniversario' && e.pessoa_nome ? primeiroNome(e.pessoa_nome) : e.titulo,
      detalhe: e.detalhe,
      cor: corDoTipo(e.tipo),
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

      {forte
        ? <span className="gb-figurinha" aria-hidden><Motivo id={tema.motivo} cores={paleta} /></span>
        : aniversario && <span className="gb-figurinha" aria-hidden><Bolo cores={paleta} /></span>}
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
                <span className="gb-ic" style={estiloTipo(corDoTipo(e.tipo))}><Icone aria-hidden /></span>
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
