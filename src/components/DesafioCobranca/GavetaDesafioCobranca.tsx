/**
 * A gaveta do Desafio Cobrança «para folgar mais cedo» (620 px, da direita).
 * Veio do modelo de teste de 16/11/2026 (`lab-desafio-cobranca.tsx`), agora
 * com o placar do banco.
 *
 * O foco é a meta GERAL (todos os setores que somam): o relógio, o prêmio e a
 * parte de hoje. A meta individual (4,5 médias do operador = 1 hora mais cedo)
 * fica à parte — só ele vê, e não conta para a geral nem vai para a TV.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { CalendarDays, Check, Clock, Eye, Flag, Gift, Hourglass, Info, Lock, PartyPopper, RotateCcw, Settings2, Snowflake, Sun, Target, UserRound, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTE_PATHS } from '@/lib';
import { useMinhaMetaNoDesafio, type MinhaMetaNoDesafio } from '@/hooks/useDesafioCobranca';
import { useAlcanceNoDesafio } from '@/hooks/useEquipeNoDesafio';
import { EquipesNoDesafio } from './EquipesNoDesafio';
import type { PlacarCobranca } from '@/services/desafioCobranca/desafioCobranca.service';
import {
  brl, brlCurto, dataCurta, diaLocal, diasRestantes, esperadoAteODia, horaCurta, maiuscula, medias, metaDoDia, pct, semana, semanaCurta,
} from '@/services/desafioCobranca/regras';
import { Sincelos } from '@/components/Natal/Sincelos';
import { Laco, MontesDeNeve, PiscaPisca } from './Enfeites';
import { atributosDoTema, caminhoDaEstrela, useTemaDoDesafio } from './temas';
import './desafio-cobranca.css';

export function GavetaDesafioCobranca({ placar, hoje, aberta, onFechar, jaAbriu, encerrado = false, onAbriu, onVerAbertura }: {
  placar: PlacarCobranca;
  hoje: number;
  aberta: boolean;
  onFechar: () => void;
  jaAbriu: boolean;
  /** Acabou sem a meta geral (19/11/2026): «não foi dessa vez», sem ingresso. */
  encerrado?: boolean;
  onAbriu: () => void;
  /** Só o super_admin (para testar). A operação vê a abertura uma vez e pronto. */
  onVerAbertura?: () => void;
}) {
  const ultimo = placar.dias.length - 1;
  // As cores seguem o Gestão da pessoa: Natal ligado ou não, claro ou escuro.
  const tema = useTemaDoDesafio();
  // A aba «Equipes» (19/11/2026): quem tem o Analítico do setor (ou de todos)
  // no painel de permissões acompanha a meta individual de cada operador.
  const alcance = useAlcanceNoDesafio();
  const [aba, setAba] = useState<'desafio' | 'equipes'>('desafio');
  const comAbas = (jaAbriu || encerrado) && alcance !== 'nenhum';
  const naEquipe = comAbas && aba === 'equipes';
  return (
    <Dialog.Root open={aberta} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="veu-desfocado fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          aria-describedby={undefined}
          {...atributosDoTema(tema)}
          className="dc fixed inset-y-0 right-0 z-50 flex w-[620px] max-w-[calc(100vw-1rem)] flex-col shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=open]:duration-300 data-[state=closed]:duration-200"
        >
          <header className="dc-cabeca">
            <PiscaPisca largura={620} luzes={22} className="dc-so-natal dc-luzes-topo" />
            <div className="dc-cabeca-linha">
              <span className="dc-selo">
                <Sun size={14} className="dc-so-sol" aria-hidden /><Snowflake size={14} className="dc-so-natal" aria-hidden /> Desafio geral · todos os setores
              </span>
              <Dialog.Close className="dc-fechar" aria-label="Fechar"><X size={18} aria-hidden /></Dialog.Close>
            </div>
            <Dialog.Title className="dc-titulo">
              {placar.titulo} <span>{placar.subtitulo}</span>
            </Dialog.Title>
            <p className="dc-periodo">
              <CalendarDays size={14} aria-hidden />
              <span>{`${maiuscula(semana(placar.dias[0]))} a ${semana(placar.dias[ultimo])} · ${dataCurta(placar.dias[0])} a ${dataCurta(placar.dias[ultimo])}`}</span>
              <span className="dc-pilula">
                {encerrado ? 'Encerrado' : `Dia ${hoje + 1} de ${placar.dias.length}${hoje === ultimo ? ' · último!' : ''}`}
              </span>
            </p>
            {placar.super_admin && <AvisoSuperAdmin placar={placar} onFechar={onFechar} />}
            {comAbas && (
              <div className="dc-abas dc-cabeca-abas" role="tablist" aria-label="Abas do desafio">
                <button type="button" role="tab" aria-selected={!naEquipe} className="dc-aba" onClick={() => setAba('desafio')}>
                  <Sun size={13} aria-hidden /> Desafio
                </button>
                <button type="button" role="tab" aria-selected={naEquipe} className="dc-aba" onClick={() => setAba('equipes')}>
                  <Users size={13} aria-hidden /> Equipes
                </button>
              </div>
            )}
            <Sincelos largura={170} comprimento={22} semente={23} className="dc-so-natal dc-sincelo-cabeca" />
          </header>

          <div className="dc-corpo">
            {naEquipe
              ? <EquipesNoDesafio placar={placar} hoje={hoje} aberta={aberta} alcance={alcance} />
              : encerrado
                ? <Encerrado placar={placar} hoje={hoje} aberta={aberta} onVerAbertura={onVerAbertura} />
              : jaAbriu
                ? <Conteudo placar={placar} hoje={hoje} aberta={aberta} onVerAbertura={onVerAbertura} />
              : <Ingresso placar={placar} onAbrir={onAbriu} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Só o super_admin: se é prévia, e o atalho para configurar. */
function AvisoSuperAdmin({ placar, onFechar }: { placar: PlacarCobranca; onFechar: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs">
      {placar.previa
        ? <span className="inline-flex items-center gap-1.5 font-bold text-amber-300"><Lock size={13} aria-hidden /> Prévia: ainda não liberado para a operação</span>
        : <span className="inline-flex items-center gap-1.5 font-bold text-emerald-300"><Eye size={13} aria-hidden /> Liberado para a operação</span>}
      <Link
        to={ROUTE_PATHS.DESAFIO_COBRANCA} onClick={onFechar}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-semibold hover:bg-white/20"
      >
        <Settings2 size={13} aria-hidden /> Configurar e acompanhar
      </Link>
    </div>
  );
}

/** A 1ª vez: o ingresso fechado. Rasga ao tocar e revela o desafio. */
function Ingresso({ placar, onAbrir }: { placar: PlacarCobranca; onAbrir: () => void }) {
  const [abrindo, setAbrindo] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => { botao.current?.focus(); }, []);
  function abrir() {
    if (abrindo) return;
    setAbrindo(true);
    window.setTimeout(onAbrir, 900);
  }
  const ultimo = placar.dias.length - 1;
  return (
    <div className="dc-palco">
      <div className="dc-ceu" aria-hidden>
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} style={{ left: `${(i * 37 + 11) % 97}%`, top: `${(i * 23 + 7) % 80}%`, ['--i' as string]: i }} />
        ))}
      </div>
      <MontesDeNeve className="dc-so-natal" />
      <button ref={botao} type="button" className={`dc-ingresso${abrindo ? ' abrindo' : ''}`} onClick={abrir} aria-label="Abrir o desafio">
        <Laco className="dc-so-natal dc-laco" />
        <span className="dc-ingresso-corpo">
          <span className="dc-ingresso-sol" aria-hidden><Sun size={32} className="dc-so-sol" /><Gift size={32} className="dc-so-natal" /></span>
          <span className="dc-ingresso-chamada">Chegou um desafio para toda a Cobrança</span>
          <span className="dc-ingresso-titulo">Folgar mais cedo</span>
          <span className="dc-ingresso-datas">
            <CalendarDays size={14} aria-hidden /> <span>{`${maiuscula(semanaCurta(placar.dias[0]))} a ${semanaCurta(placar.dias[ultimo])} · ${dataCurta(placar.dias[0])} a ${dataCurta(placar.dias[ultimo])}`}</span>
          </span>
          <span className="dc-ingresso-niveis">
            <span>Batendo <strong>{brlCurto(placar.meta_geral)}</strong> juntos, <strong>todo mundo sai às {placar.premio_hora}</strong></span>
            <em>
              {placar.premio_dia ? `folga na ${semana(placar.premio_dia)}, ${dataCurta(placar.premio_dia)} · ` : ''}
              {placar.premio_requisito.toLowerCase()}
            </em>
          </span>
        </span>
        <span className="dc-ingresso-picote" aria-hidden />
        <span className="dc-ingresso-canhoto">
          <span className="dc-toque">Toque para abrir</span>
        </span>
      </button>
    </div>
  );
}

function Conteudo({ placar, hoje, aberta, onVerAbertura }: { placar: PlacarCobranca; hoje: number; aberta: boolean; onVerAbertura?: () => void }) {
  const metaDia = metaDoDia(placar);
  const porDia = placar.dias.map((d, i) => (i <= hoje ? (placar.por_dia.find(x => x.dia === d)?.total ?? 0) : null));
  const somadoHoje = porDia[hoje] ?? 0;
  const diasBatidos = porDia.filter((v) => v !== null && v >= metaDia).length;
  const faltaHoje = Math.max(metaDia - somadoHoje, 0);
  const meu = useMinhaMetaNoDesafio(placar, hoje, aberta);

  return (
    <div className="dc-conteudo">
      <section className="dc-cartao dc-heroi dc-sobe" style={{ ['--d' as string]: 0 }} aria-label="Desafio geral">
        <Snowflake size={96} className="dc-so-natal dc-floco" aria-hidden />
        <RelogioDaFolga placar={placar} hoje={hoje} />
        <div className="dc-heroi-texto">
          <p className="dc-rotulo">Todos os setores juntos</p>
          <p className="dc-heroi-valor">{brl(placar.total)}</p>
          <p className="dc-heroi-meta">de {brl(placar.meta_geral)}</p>
          <Ritmo placar={placar} hoje={hoje} />
        </div>
      </section>

      <PremioGeral placar={placar} hoje={hoje} />

      {meu.data
        ? <MinhaMeta placar={placar} meu={meu.data} />
        : meu.isError
          ? <section className="dc-minha"><p className="dc-dica">Não deu para carregar a sua meta individual agora.</p></section>
          : null}

      <section className="dc-cartao dc-sobe" style={{ ['--d' as string]: 3 }} aria-label="A parte de hoje">
        <div className="dc-hoje-linha">
          <p className="dc-rotulo"><Target size={14} aria-hidden /> Hoje · todos juntos</p>
          <p className="dc-hoje-dias"><strong>{diasBatidos}</strong>/{placar.dias.length} dias batidos</p>
        </div>
        {faltaHoje === 0 ? (
          <p className="dc-hoje-valor ok"><Check size={22} strokeWidth={3} aria-hidden /> Parte de hoje feita!</p>
        ) : (
          <p className="dc-hoje-valor">faltam <strong>{brl(faltaHoje)}</strong></p>
        )}
        <Barra valor={somadoHoje} meta={metaDia} rotulo={`${brl(somadoHoje)} de ${brl(metaDia)}`} />
      </section>

      <section className="dc-sobe" style={{ ['--d' as string]: 4 }} aria-labelledby="dc-dias-titulo">
        <h3 id="dc-dias-titulo" className="dc-rotulo dc-rotulo-solto">
          <CalendarDays size={14} aria-hidden /> Os {placar.dias.length} dias <span>toque para ver o detalhe</span>
        </h3>
        <ol className="dc-dias dc-dias-3">
          {placar.dias.map((d, i) => (
            <li key={d}><CartaoDia iso={d} indice={i} hoje={hoje} valor={porDia[i]} metaDia={metaDia} /></li>
          ))}
        </ol>
      </section>

      {placar.atualizado_em && (
        <p className="text-center text-[11px]" style={{ color: 'var(--dc-suave)' }}>
          {placar.fonte === 'manual'
            ? `Atualizado às ${horaCurta(placar.atualizado_em)}`
            : `Recebimento do relatório do ERP de ${horaCurta(placar.atualizado_em)} · atualiza de hora em hora`}
        </p>
      )}

      {onVerAbertura && (
        <button type="button" className="dc-rever" onClick={onVerAbertura}>
          <RotateCcw size={14} aria-hidden /> Ver a abertura de novo (só super admin, para testar)
        </button>
      )}
    </div>
  );
}

/**
 * O fim sem a meta geral (19/11/2026): «não foi dessa vez» para todo mundo e,
 * para quem bateu um dos níveis da meta individual, os parabéns à parte.
 */
function Encerrado({ placar, hoje, aberta, onVerAbertura }: { placar: PlacarCobranca; hoje: number; aberta: boolean; onVerAbertura?: () => void }) {
  const meu = useMinhaMetaNoDesafio(placar, hoje, aberta);
  const metaDia = metaDoDia(placar);
  const porDia = placar.dias.map(d => placar.por_dia.find(x => x.dia === d)?.total ?? 0);
  const p = pct(placar.total, placar.meta_geral);
  const bateu = meu.data && (meu.data.maior.bateu || meu.data.bateu) ? meu.data : null;

  return (
    <div className="dc-conteudo">
      <section className="dc-cartao dc-fim dc-sobe" style={{ ['--d' as string]: 0 }} aria-label="Desafio encerrado">
        <span className="dc-fim-icone" aria-hidden><Flag size={26} /></span>
        <p className="dc-rotulo">Desafio encerrado</p>
        <p className="dc-fim-titulo">Não foi dessa vez</p>
        <p className="dc-fim-texto">
          Mas virão mais oportunidades pela frente. Obrigado pelo esforço de cada um nestes {placar.dias.length} dias!
        </p>
        <div className="dc-fim-numeros">
          <span>Todos juntos fizemos <strong>{brl(placar.total)}</strong></span>
          <span>de {brl(placar.meta_geral)} · {p}%</span>
        </div>
        <Barra valor={placar.total} meta={placar.meta_geral} rotulo={`${brl(placar.total)} de ${brl(placar.meta_geral)}`} />
      </section>

      {bateu && <Parabens placar={placar} meu={bateu} />}

      <section className="dc-sobe" style={{ ['--d' as string]: 2 }} aria-labelledby="dc-dias-fim">
        <h3 id="dc-dias-fim" className="dc-rotulo dc-rotulo-solto">
          <CalendarDays size={14} aria-hidden /> Os {placar.dias.length} dias <span>toque para ver o detalhe</span>
        </h3>
        <ol className="dc-dias dc-dias-3">
          {placar.dias.map((d, i) => (
            <li key={d}><CartaoDia iso={d} indice={i} hoje={placar.dias.length - 1} valor={porDia[i]} metaDia={metaDia} /></li>
          ))}
        </ol>
      </section>

      {onVerAbertura && (
        <button type="button" className="dc-rever" onClick={onVerAbertura}>
          <RotateCcw size={14} aria-hidden /> Ver a abertura de novo (só super admin, para testar)
        </button>
      )}
    </div>
  );
}

/** Bateu um dos níveis da meta individual: o cartãozinho de parabéns (só ele vê). */
function Parabens({ placar, meu }: { placar: PlacarCobranca; meu: MinhaMetaNoDesafio }) {
  const maior = meu.maior.bateu;
  const nivel = maior ? placar.regra_medias_maior : placar.regra_medias;
  const premio = maior ? placar.regra_premio_maior : placar.regra_premio;
  return (
    <section className="dc-cartao dc-parabens dc-sobe" style={{ ['--d' as string]: 1 }} aria-label="Parabéns pela meta individual">
      <span className="dc-parabens-confete" aria-hidden>
        {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ left: `${(i * 41 + 7) % 96}%`, ['--i' as string]: i }} />)}
      </span>
      <span className="dc-parabens-icone" aria-hidden><PartyPopper size={24} /></span>
      <div>
        <p className="dc-parabens-titulo">Parabéns! Você bateu a sua meta individual</p>
        <p className="dc-parabens-texto">
          Foram <strong>{medias(meu.medias)}</strong> ({brl(meu.feito)}) — passou das {medias(nivel)}: você <strong>{premio}</strong>.
        </p>
        <p className="dc-parabens-nota">{placar.premio_requisito}. Só você vê este cartão.</p>
      </div>
    </section>
  );
}

/** O prêmio do desafio geral, como um ingresso. */
function PremioGeral({ placar, hoje }: { placar: PlacarCobranca; hoje: number }) {
  const ok = placar.total >= placar.meta_geral;
  return (
    <section className="dc-niveis dc-sobe" style={{ ['--d' as string]: 1 }} aria-label="O prêmio">
      <div className="dc-niveis-topo">
        <p className="dc-rotulo">
          <Clock size={14} aria-hidden /> {placar.premio_dia ? `Folga na ${semana(placar.premio_dia)}, ${dataCurta(placar.premio_dia)}` : 'O prêmio'}
        </p>
        <span className="dc-niveis-prazo">{diasRestantes(placar.dias.length, hoje)}</span>
      </div>
      <div className="dc-nivel-caixa">
      <div className={cn('dc-nivel maior', ok && 'ok')}>
        <div className="dc-nivel-canhoto" aria-hidden>
          <span>saída</span>
          <strong>{placar.premio_hora}</strong>
        </div>
        <div className="dc-nivel-texto">
          <p className="dc-nivel-titulo">{ok ? `Meta batida! Todo mundo sai às ${placar.premio_hora}` : `Bateu a meta, todo mundo sai às ${placar.premio_hora}`}</p>
          <p className="dc-nivel-regra">Meta geral · {brl(placar.meta_geral)}</p>
        </div>
        <div className="dc-nivel-situacao">
          {ok ? (
            <span className="dc-nivel-ok"><Check size={16} strokeWidth={3} aria-hidden /> Garantido!</span>
          ) : (
            <>
              <span className="dc-nivel-falta-rotulo">faltam</span>
              <span className="dc-nivel-falta">{brlCurto(placar.meta_geral - placar.total)}</span>
            </>
          )}
        </div>
      </div>
      <Sincelos largura={150} comprimento={16} semente={41} gota={false} className="dc-so-natal dc-sincelo-premio" />
      </div>
      <p className="dc-info-extra"><Info size={14} aria-hidden /> {placar.premio_requisito} para sair mais cedo.</p>
    </section>
  );
}

const nomeDoMes = (iso: string) => diaLocal(iso).toLocaleDateString('pt-BR', { month: 'long' });

/**
 * A meta INDIVIDUAL de quem está olhando, em dois níveis (16/11/2026):
 * 4,5 médias diárias dele = 1 hora mais cedo; 5 médias = sai às 14:00.
 * A média é a meta do mês ÷ os dias úteis dele no mês. A régua vai até o 2º nível;
 * a marca «1h» fica no 1º.
 */
function MinhaMeta({ placar, meu }: { placar: PlacarCobranca; meu: MinhaMetaNoDesafio }) {
  const n1 = placar.regra_medias;
  const n2 = placar.regra_medias_maior;
  const ultimo = placar.dias.length - 1;
  const titulo = <><UserRound size={14} aria-hidden /> Sua meta individual</>;
  if (meu.meta === null || meu.maior.meta === null) {
    return (
      <section className="dc-minha dc-minha-compacta dc-sobe" style={{ ['--d' as string]: 2 }} aria-label="Sua meta individual">
        <p className="dc-rotulo">{titulo}</p>
        <p className="dc-dica">Você ainda não tem meta cadastrada em {nomeDoMes(placar.dias[0])}, então a regra das {medias(n1)} e {medias(n2)} não vale para você agora.</p>
      </section>
    );
  }
  const alto = meu.maior;
  const p = Math.min((meu.feito / alto.meta!) * 100, 100);
  const pNivel1 = (n1 / n2) * 100;
  // As médias inteiras antes do fim; a que cai no 1º nível vira a marca «1h».
  const marcas = Array.from({ length: Math.ceil(n2) - 1 }, (_, i) => i + 1).filter(k => k !== n1);
  const curto = (premio: string) => premio.replace(/^sai /, '');
  const porDiaTexto = (m: { porDia: number | null; diasRestantes: number }) => (m.porDia === null ? null
    : m.diasRestantes > 1 ? <> (<strong>{brl(m.porDia)}</strong> por dia até {semana(placar.dias[ultimo])})</> : <> (tudo <strong>hoje</strong>)</>);

  return (
    <section className={cn('dc-minha dc-minha-compacta dc-sobe', meu.bateu && 'ok')} style={{ ['--d' as string]: 2 }} aria-label="Sua meta individual">
      <div className="dc-hoje-linha">
        <p className="dc-rotulo">{titulo}</p>
        <span className="dc-minha-selo">só você vê</span>
      </div>

      <div className="dc-minha-placar">
        <p className="dc-minha-feito">
          {meu.bateu ? <Check size={20} strokeWidth={3} aria-hidden /> : null}
          <strong>{medias(meu.medias)}</strong> feitas
        </p>
        <p className="dc-minha-valores">{brl(meu.feito)}</p>
      </div>

      <ul className="dc-minha-niveis" aria-label="Os dois níveis">
        <li className={cn(meu.bateu && 'ok')}>
          {meu.bateu ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
          <strong>{medias(n1)}</strong> = {placar.regra_premio} · {brl(meu.meta)}
        </li>
        <li className={cn(alto.bateu && 'ok')}>
          {alto.bateu ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
          <strong>{medias(n2)}</strong> = {placar.regra_premio_maior} · {brl(alto.meta!)}
        </li>
      </ul>

      <div className="dc-minha-regua" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(p)}
        aria-label={`Você fez ${medias(meu.medias)}: ${medias(n1)} ${placar.regra_premio}, ${medias(n2)} ${placar.regra_premio_maior}`}>
        <div className="dc-minha-cheia" style={{ width: `${p}%` }} />
        {marcas.map((k) => (
          <span key={k} className="dc-minha-marca" style={{ left: `${(k / n2) * 100}%` }} aria-hidden>
            <em>{k}</em>
          </span>
        ))}
        <span className="dc-minha-marca nivel" style={{ left: `${pNivel1}%` }} aria-hidden>
          <em>{n1.toLocaleString('pt-BR')} · 1h</em>
        </span>
        <span className="dc-minha-fim" aria-hidden>{n2.toLocaleString('pt-BR')} · {curto(placar.regra_premio_maior).replace('às ', '').replace(':00', 'h')}</span>
      </div>

      <p className={cn('dc-minha-status', alto.bateu && 'ok')}>
        {alto.bateu
          ? <>Bateu as {medias(n2)}! Você {placar.regra_premio_maior}.</>
          : meu.bateu
            ? <>Já garantiu: você {placar.regra_premio}! Faltam <strong>{brl(alto.falta ?? 0)}</strong> para {curto(placar.regra_premio_maior)}{porDiaTexto(alto)}.</>
            : meu.porDia !== null
              ? <>Faltam <strong>{brl(meu.falta ?? 0)}</strong> para {curto(placar.regra_premio)}{porDiaTexto(meu)} e <strong>{brl(alto.falta ?? 0)}</strong> para {curto(placar.regra_premio_maior)}.</>
              : 'O desafio acabou.'}
      </p>

      <p className="dc-minha-nota">
        Sua média diária: <strong>{brl(meu.mediaDiaria)}</strong> (sua meta de {nomeDoMes(placar.dias[0])}, {brl(meu.metaMensal)}, ÷ {meu.diasUteisMes} dias úteis seus no mês).
        {' '}Não muda durante o desafio e não conta para a meta geral. {placar.premio_requisito}.
      </p>
    </section>
  );
}

/** Onde o ponteiro está em relação ao ponto do fim de hoje. */
function Ritmo({ placar, hoje }: { placar: PlacarCobranca; hoje: number }) {
  const alvo = esperadoAteODia(placar, hoje);
  const pAlvo = pct(alvo, placar.meta_geral);
  const falta = Math.max(alvo - placar.total, 0);
  const emDia = falta === 0;
  return (
    <div className={`dc-ritmo${emDia ? ' em-dia' : ''}`}>
      <p className="dc-ritmo-titulo">
        {emDia ? <Check size={16} strokeWidth={3} aria-hidden /> : <Clock size={16} aria-hidden />}
        {emDia ? `No ponto de hoje (${pAlvo}%)${placar.total > alvo ? ' e adiantado!' : '!'}` : `Ponto de hoje: ${pAlvo}%`}
      </p>
      <p className="dc-ritmo-texto">
        {emDia
          ? (placar.total > alvo ? `${brl(placar.total - alvo)} à frente.` : 'Bora adiantar amanhã!')
          : `Faltam ${brl(falta)} para chegar.`}
      </p>
    </div>
  );
}

/** O relógio: o sol anda pelo anel conforme todos somam. A marca tracejada é o ponto do fim de hoje. */
function RelogioDaFolga({ placar, hoje }: { placar: PlacarCobranca; hoje: number }) {
  const meta = placar.meta_geral;
  const p = pct(placar.total, meta);
  const [mostrado, setMostrado] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setMostrado(p), 150);
    return () => window.clearTimeout(t);
  }, [p]);
  const r = 96;
  const volta = 2 * Math.PI * r;
  const alvo = Math.min(esperadoAteODia(placar, hoje) / meta, 1) * 2 * Math.PI;
  const n = placar.dias.length;
  return (
    <div className="dc-relogio" role="img" aria-label={`${p}% da meta de todos os setores: ${brl(placar.total)} de ${brl(meta)}`}>
      <svg viewBox="0 0 240 240" aria-hidden>
        <defs>
          <linearGradient id="dc-anel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--dc-ouro)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--dc-coral)' }} />
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r={r} className="dc-relogio-fundo" />
        <circle
          cx="120" cy="120" r={r} className="dc-relogio-anel"
          strokeDasharray={volta} strokeDashoffset={volta * (1 - mostrado / 100)}
          transform="rotate(-90 120 120)"
        />
        {placar.dias.map((d, i) => {
          const a = (i / n) * 2 * Math.PI;
          const meio = ((i + 0.5) / n) * 2 * Math.PI;
          return (
            <g key={d}>
              <line x1={120 + Math.sin(a) * 82} y1={120 - Math.cos(a) * 82} x2={120 + Math.sin(a) * 110} y2={120 - Math.cos(a) * 110} className="dc-marca" />
              <text x={120 + Math.sin(meio) * 64} y={120 - Math.cos(meio) * 64 + 5} className={`dc-marca-dia${i === hoje ? ' hoje' : ''}`} textAnchor="middle">
                {semanaCurta(d)}
              </text>
            </g>
          );
        })}
        <text x={120 + 14} y={120 - 116} className="dc-marca-premio-txt" textAnchor="start">{placar.premio_hora.replace(':00', 'h')}</text>
        <line x1={120 + Math.sin(alvo) * 84} y1={120 - Math.cos(alvo) * 84} x2={120 + Math.sin(alvo) * 112} y2={120 - Math.cos(alvo) * 112} className="dc-marca-alvo" />
        <g className="dc-ponteiro" style={{ transform: `rotate(${(mostrado / 100) * 360}deg)` }}>
          <circle cx="120" cy={120 - r} r="14" className="dc-sol-halo" />
          <circle cx="120" cy={120 - r} r="9" className="dc-sol dc-so-sol" />
          <path d={caminhoDaEstrela(120, 120 - r, 12)} className="dc-so-natal dc-estrela-ponteiro" />
        </g>
      </svg>
      <div className="dc-relogio-centro">
        <span className="dc-relogio-pct">{p}%</span>
      </div>
    </div>
  );
}

function Barra({ valor, meta, rotulo }: { valor: number; meta: number; rotulo: string }) {
  const p = pct(valor, meta);
  return (
    <div className="dc-barra-caixa">
      <div className="dc-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={`Hoje: ${rotulo}`}>
        <div className="dc-barra-cheia" style={{ width: `${p}%` }} />
      </div>
      <p className="dc-barra-texto"><span>{rotulo}</span><strong>{p}%</strong></p>
    </div>
  );
}

type EstadoDia = 'batido' | 'nao' | 'hoje' | 'hoje-batido' | 'futuro';

/** Cada dia vira (como uma carta) para mostrar o detalhe. */
function CartaoDia({ iso, indice, hoje, valor, metaDia }: { iso: string; indice: number; hoje: number; valor: number | null; metaDia: number }) {
  const [virado, setVirado] = useState(false);
  const estado: EstadoDia = indice > hoje ? 'futuro'
    : indice === hoje ? ((valor ?? 0) >= metaDia ? 'hoje-batido' : 'hoje')
      : (valor ?? 0) >= metaDia ? 'batido' : 'nao';

  const Icone = estado === 'batido' || estado === 'hoje-batido' ? Check : estado === 'nao' ? X : estado === 'hoje' ? Hourglass : Lock;
  const legenda = { batido: 'Batida', 'hoje-batido': 'Batida', hoje: 'Hoje', nao: 'Não bateu', futuro: 'Em breve' }[estado];
  const legendaLonga = { batido: 'meta batida', 'hoje-batido': 'hoje, meta batida', hoje: 'hoje, em andamento', nao: 'não bateu', futuro: 'ainda vai chegar' }[estado];
  const falta = Math.max(metaDia - (valor ?? 0), 0);

  return (
    <button
      type="button" className={`dc-dia ${estado}${virado ? ' virado' : ''}`}
      onClick={() => setVirado((v) => !v)} aria-pressed={virado}
      aria-label={`${semana(iso)}, ${dataCurta(iso)}: ${legendaLonga}${valor !== null ? `, ${brl(valor)}` : ''}. Toque para ${virado ? 'voltar' : 'ver o detalhe'}.`}
    >
      <span className="dc-dia-interno">
        <span className="dc-dia-frente">
          <span className="dc-dia-semana">{semanaCurta(iso)}</span>
          <span className="dc-dia-data">{dataCurta(iso)}</span>
          <span className="dc-dia-icone" aria-hidden><Icone size={18} strokeWidth={2.8} /></span>
          <span className="dc-dia-legenda">{legenda}</span>
        </span>
        <span className="dc-dia-verso">
          {estado === 'futuro' ? (
            <>
              <span className="dc-dia-verso-titulo">Meta</span>
              <span className="dc-dia-verso-valor">{brlCurto(metaDia)}</span>
              <span className="dc-dia-verso-texto">abre {semanaCurta(iso)}</span>
            </>
          ) : (
            <>
              <span className="dc-dia-verso-titulo">Fizemos</span>
              <span className="dc-dia-verso-valor">{brlCurto(valor ?? 0)}</span>
              <span className="dc-dia-verso-texto">{falta === 0 ? `+${brlCurto((valor ?? 0) - metaDia)}` : `faltam ${brlCurto(falta)}`}</span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}
