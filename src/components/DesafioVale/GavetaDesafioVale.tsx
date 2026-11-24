/**
 * A gaveta do Desafio do Vale (23/11/2026): as 9 médias (o vale pelo % do
 * setor) e os Cupons do Pix, juntos numa campanha só. Mesmo molde e mesmas
 * cores da gaveta do Desafio Cobrança (`.dc`, `useTemaDoDesafio`).
 *
 * Abas: «Meu desafio» (todo mundo), «Cupons do Pix» (com o cupom ligado) e
 * «Equipes» (quem tem o Analítico do setor ou de todos — o líder).
 */
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  BarChart3, CalendarDays, Check, Dices, Eye, Hourglass, Lock, Megaphone, PartyPopper, Play, Settings2, Target, Ticket, Trophy, UserRound, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { dataLocalPix } from '@/lib/mesPix';
import { ROUTE_PATHS } from '@/lib';
import { useMeusCuponsDaVisao, useMinhaMetaDaVisao } from './dadosDaVisao';
import { useProjecaoDoVale } from '@/hooks/useDesafioVale';
import type { DesafioVale, ResultadoVale } from '@/services/desafioVale/desafioVale.service';
import {
  cupons as nCupons, diasDoPeriodo, faixaDoSetor, faixaPiso, faseDoPeriodo,
  periodo, premioDoRanking, reais, regraDoSetor, type MetaNoVale,
} from '@/services/desafioVale/regras';
import { brl, dataCurta, horaCurta, maiuscula, medias, semana, semanaCurta } from '@/services/desafioCobranca/regras';
import { atributosDoTema } from '@/components/DesafioCobranca/temas';
import { PiscaPisca } from '@/components/DesafioCobranca/Enfeites';
import { Sincelos } from '@/components/Natal/Sincelos';
import { useTemaDoVale } from './temasVale';
import { EquipesNoVale } from './EquipesNoVale';
import { AberturaVale } from './AberturaVale';
import { CarteiraDeCupons } from './CarteiraDeCupons';
import { RankingDoSetor } from './RankingDoSetor';
import { PremioPeloSetor } from './PremioPeloSetor';
import { PainelDoSetor } from './PainelDoSetor';
import { useVisaoDoVale } from './visao';
import '@/components/DesafioCobranca/desafio-cobranca.css';
import './desafio-vale.css';

type Aba = 'setor' | 'meu' | 'cupons' | 'equipes';

// A abertura é vista uma vez por pessoa, neste navegador. Sem armazenamento
// (aba anônima), ela só aparece de novo — nada quebra.
const jaViu = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const marcarVista = (k: string) => { try { localStorage.setItem(k, '1'); } catch { /* sem armazenamento */ } };

export function GavetaDesafioVale({ d: real, aberta, onFechar }: { d: DesafioVale; aberta: boolean; onFechar: () => void }) {
  // A visão de teste do super_admin (tela /desafio-vale) troca pessoa, dia, %, fechamento e tema.
  const visao = useVisaoDoVale();
  // Natal claro / Noite de Natal / Campanha, pelo Gestão de quem olha (temasVale.ts).
  const tema = useTemaDoVale(visao.tema);
  // O % de cada setor pela projeção do mês (23/11/2026); o simulado é «manual» e ganha.
  const simulado = visao.aplicar(real);
  const d = useProjecaoDoVale(simulado, visao.hoje) ?? simulado;
  const alcance = visao.alcance;
  const [aba, setAba] = useState<Aba>('meu');
  const hoje = visao.hoje;
  // A abertura (a arte da campanha): na 1ª vez de cada pessoa; na visão de
  // teste, quando o super_admin pede. «Rever a abertura» no fim da aba.
  const { perfil } = useAuth();
  const chaveAbertura = `desafio-vale:abertura:${real.id}:${perfil?.id ?? 'anonimo'}`;
  const [naAbertura, setNaAbertura] = useState(() => (visao.abertura === null ? !jaViu(chaveAbertura) : visao.abertura));
  const entrar = () => {
    setNaAbertura(false);
    if (!visao.simulando) marcarVista(chaveAbertura);
  };
  const fase = faseDoPeriodo(d.inicio, d.fim, hoje);
  const dias = diasDoPeriodo(d.inicio, d.fim);
  const iHoje = dias.indexOf(hoje);
  const comCupom = d.cupom_ativo && !!d.cupom_inicio && !!d.cupom_fim;
  // A Manutenção (sem Pix automático): a 2ª parte é o ranking dos N que mais recebem.
  const ranking = regraDoSetor(d.meu_setor) === 'ranking';
  // O LÍDER (23/11/2026): não faz as médias nem lança Pix da campanha — a
  // gaveta dele abre no setor (o painel) e na lista do time. Quem é líder é o
  // painel de permissões (o Analítico do setor ou de todos), nunca o cargo.
  const lider = alcance !== 'nenhum';
  // A ELITE (23/11/2026) lidera e também faz as médias e junta cupons como
  // operador: vê «Meu desafio» e os cupons, e mais o setor e as equipes.
  const participa = visao.participa;
  const soLider = lider && !participa;
  const abas: { id: Aba; rotulo: string; Icone: typeof Target }[] = [
    ...(participa ? [
      { id: 'meu' as const, rotulo: 'Meu desafio', Icone: Target },
      ...(comCupom ? [{ id: 'cupons' as const, rotulo: ranking ? 'Ranking' : 'Cupons do Pix', Icone: ranking ? Trophy : Ticket }] : []),
    ] : []),
    ...(lider ? [
      { id: 'setor' as const, rotulo: alcance === 'todos_setores' ? 'Setores' : 'Meu setor', Icone: BarChart3 },
      { id: 'equipes' as const, rotulo: 'Equipes', Icone: Users },
    ] : []),
  ];
  const atual = abas.some(a => a.id === aba) ? aba : abas[0].id;

  return (
    <Dialog.Root open={aberta} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="veu-desfocado fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          aria-describedby={undefined}
          {...atributosDoTema(tema)}
          className="dc dv fixed inset-y-0 right-0 z-50 flex w-[620px] max-w-[calc(100vw-1rem)] flex-col shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=open]:duration-300 data-[state=closed]:duration-200"
        >
          <header className="dc-cabeca">
            <PiscaPisca largura={620} luzes={22} className="dc-so-natal dc-luzes-topo" />
            <div className="dc-cabeca-linha">
              <span className="dc-selo"><Megaphone size={14} aria-hidden /> Campanha especial · toda a cobrança</span>
              <Dialog.Close className="dc-fechar" aria-label="Fechar"><X size={18} aria-hidden /></Dialog.Close>
            </div>
            <Dialog.Title className="dc-titulo">
              {d.titulo} <span>{soLider ? 'do seu time' : `e ganhe o ${d.premio_nome}`}</span>
            </Dialog.Title>
            <p className="dc-periodo">
              <CalendarDays size={14} aria-hidden />
              <span>{`${maiuscula(semana(d.inicio))} a ${semana(d.fim)} · ${periodo(d.inicio, d.fim)}`}</span>
              <span className="dc-pilula">
                {fase === 'antes' ? `começa ${semana(d.inicio)}` : fase === 'depois' ? (d.fechado_em ? 'Resultado final' : 'Encerrado') : `Dia ${iHoje + 1} de ${dias.length}`}
              </span>
            </p>
            {d.super_admin && <AvisoSuperAdmin d={d} onFechar={onFechar} />}
            {visao.simulando && (
              <p className="dv-aviso dv-aviso-teste">
                Visão de teste · {visao.operadorNome ?? 'sem pessoa'} · {d.meu_setor?.nome ?? 'sem setor'} · dia {dataCurta(hoje)}
                {' · '}{alcance === 'todos_setores' ? 'gerência' : alcance === 'setor' ? (participa ? 'elite' : 'líder') : 'operador'} — nada é gravado
              </p>
            )}
            {abas.length > 1 && !naAbertura && (
              <div className="dc-abas dc-cabeca-abas" role="tablist" aria-label="Abas do desafio">
                {abas.map(({ id, rotulo, Icone }) => (
                  <button key={id} type="button" role="tab" aria-selected={atual === id} className="dc-aba" onClick={() => setAba(id)}>
                    <Icone size={13} aria-hidden /> {rotulo}
                  </button>
                ))}
              </div>
            )}
            <Sincelos largura={170} comprimento={22} semente={31} className="dc-so-natal dc-sincelo-cabeca" />
          </header>

          <div className="dc-corpo">
            {naAbertura
              ? <AberturaVale d={d} hoje={hoje} onEntrar={entrar} paraLider={soLider} />
              : atual === 'setor' && alcance !== 'nenhum'
              ? <PainelDoSetor d={d} aberta={aberta} alcance={alcance} onFechar={onFechar} onEquipes={() => setAba('equipes')} />
              : atual === 'equipes' && alcance !== 'nenhum'
              ? <EquipesNoVale d={d} aberta={aberta} alcance={alcance} onFechar={onFechar} />
              : atual === 'cupons'
                ? (ranking
                  ? <RankingDoSetor d={d} setorId={d.meu_setor?.setor_id ?? null} aberta={aberta} verTodos={alcance !== 'nenhum'} />
                  : <MeusCupons d={d} aberta={aberta} />)
                : <MeuDesafio d={d} aberta={aberta} onCupons={comCupom ? () => setAba('cupons') : undefined} onRever={() => setNaAbertura(true)} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AvisoSuperAdmin({ d, onFechar }: { d: DesafioVale; onFechar: () => void }) {
  return (
    <div className="dv-aviso flex flex-wrap items-center gap-2">
      {d.previa
        ? <span className="dv-aviso-previa inline-flex items-center gap-1.5"><Lock size={13} aria-hidden /> Prévia: ainda não liberado para a operação</span>
        : <span className="dv-aviso-liberado inline-flex items-center gap-1.5"><Eye size={13} aria-hidden /> Liberado para a operação</span>}
      <Link to={ROUTE_PATHS.DESAFIO_VALE} onClick={onFechar} className="dv-aviso-link ml-auto inline-flex items-center gap-1.5">
        <Settings2 size={13} aria-hidden /> Configurar e acompanhar
      </Link>
    </div>
  );
}

// ── Meu desafio ──────────────────────────────────────────────────────────────

function MeuDesafio({ d, aberta, onCupons, onRever }: { d: DesafioVale; aberta: boolean; onCupons?: () => void; onRever: () => void }) {
  const visao = useVisaoDoVale();
  const hoje = visao.hoje;
  // Fechamento confirmado com o resultado gravado: é ele que vale (a virada
  // do mês não muda mais nada). Não busca o Analítico de novo.
  const gravado = d.fechado_em && d.meu_resultado ? d.meu_resultado : null;
  const alvo = visao.operadorId && !gravado ? { id: visao.operadorId, setorId: visao.setorId } : null;
  const meu = useMinhaMetaDaVisao(d, aberta, alvo, hoje);
  const fase = faseDoPeriodo(d.inicio, d.fim, hoje);
  const setor = d.meu_setor ?? null;
  const faixa = faixaDoSetor(setor?.pct ?? null, d.faixas);
  const bateu = gravado ? gravado.bateu : (meu.data?.bateu ?? false);

  return (
    <div className="dc-conteudo">
      {gravado ? <ResultadoGravado d={d} r={gravado} /> : fase === 'depois' && meu.data && (
        <Resultado d={d} meu={meu.data} valor={faixa?.valor ?? faixaPiso(d.faixas)?.valor ?? 0} />
      )}

      {gravado ? null : !alvo && !visao.ficticio
        ? <section className="dc-minha"><p className="dc-dica">Escolha uma pessoa na visão de teste para ver as médias dela.</p></section>
        : meu.data
          ? <MinhasMedias d={d} meu={meu.data} />
          : meu.isError
            ? <section className="dc-minha"><p className="dc-dica">Não deu para carregar as suas médias agora.</p></section>
            : <section className="dc-minha"><p className="dc-dica">Carregando as suas médias…</p></section>}

      <PremioPeloSetor d={d} setor={setor} bateu={bateu} />

      {onCupons && (regraDoSetor(d.meu_setor) === 'ranking'
        ? <ResumoRanking d={d} onAbrir={onCupons} />
        : <ResumoCupons d={d} aberta={aberta} onAbrir={onCupons} />)}

      {meu.data && !gravado && <DiasDoDesafio d={d} meu={meu.data} hoje={hoje} />}

      {d.calculado_lote && (
        <p className="text-center text-[11px]" style={{ color: 'var(--dc-suave)' }}>
          % do setor pelo relatório do ERP de {horaCurta(d.calculado_lote)} · atualiza de hora em hora
        </p>
      )}

      <button type="button" className="dc-rever" onClick={onRever}>
        <Play size={14} aria-hidden /> Rever a abertura
      </button>
    </div>
  );
}

function MinhasMedias({ d, meu }: { d: DesafioVale; meu: MetaNoVale }) {
  const titulo = <><UserRound size={14} aria-hidden /> Suas {medias(d.medias)}</>;
  if (meu.meta === null) {
    return (
      <section className="dc-minha dc-sobe" style={{ ['--d' as string]: 0 }} aria-label="Suas médias">
        <p className="dc-rotulo">{titulo}</p>
        <p className="dc-dica">Você ainda não tem meta cadastrada neste mês, então a regra das {medias(d.medias)} não vale para você agora. Fale com o seu líder.</p>
      </section>
    );
  }
  const p = Math.min((meu.feito / meu.meta) * 100, 100);
  const marcas = Array.from({ length: Math.ceil(d.medias) - 1 }, (_, i) => i + 1);
  return (
    <section className={cn('dc-minha dc-sobe', meu.bateu && 'ok')} style={{ ['--d' as string]: 0 }} aria-label="Suas médias">
      <div className="dc-hoje-linha">
        <p className="dc-rotulo">{titulo}</p>
        <span className="dc-minha-selo">só você vê</span>
      </div>
      <div className="dc-minha-placar">
        <p className="dc-minha-feito">
          {meu.bateu ? <Check size={22} strokeWidth={3} aria-hidden /> : null}
          <strong>{meu.medias.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</strong> de {medias(d.medias)}
        </p>
        <p className="dc-minha-valores">{brl(meu.feito)} de {brl(meu.meta)}</p>
      </div>
      <div className="dc-minha-regua" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(p)}
        aria-label={`Você fez ${medias(meu.medias)} de ${medias(d.medias)}`}>
        <div className="dc-minha-cheia" style={{ width: `${p}%` }} />
        {marcas.map((k) => (
          <span key={k} className="dc-minha-marca" style={{ left: `${(k / d.medias) * 100}%` }} aria-hidden><em>{k}</em></span>
        ))}
        <span className="dc-minha-fim" aria-hidden>{d.medias.toLocaleString('pt-BR')} · vale</span>
      </div>
      <p className={cn('dc-minha-status', meu.bateu && 'ok')}>
        {meu.bateu
          ? <>Bateu as {medias(d.medias)}! O {d.premio_nome} é seu.</>
          : meu.porDiaUtil !== null
            ? <>Faltam <strong>{brl(meu.falta ?? 0)}</strong>{meu.diasUteisRestantes > 1
              ? <> — <strong>{brl(meu.porDiaUtil)}</strong> por dia útil até {semana(d.fim)}</>
              : <> — tudo <strong>hoje</strong></>}.</>
            : <>O desafio acabou. Faltaram {brl(meu.falta ?? 0)}.</>}
      </p>
      <p className="dc-minha-nota">
        Sua média diária: <strong>{brl(meu.mediaDiaria)}</strong> (sua meta do mês, {brl(meu.metaMensal)}, ÷ {meu.diasUteisMes} dias úteis seus).
        {' '}Conta o seu recebimento de {periodo(d.inicio, d.fim)}.
      </p>
    </section>
  );
}

function Resultado({ d, meu, valor }: { d: DesafioVale; meu: MetaNoVale; valor: number }) {
  if (!meu.bateu) {
    return (
      <section className="dc-cartao dc-fim dc-sobe" style={{ ['--d' as string]: 0 }} aria-label="Desafio encerrado">
        <span className="dc-fim-icone" aria-hidden><Hourglass size={26} /></span>
        <p className="dc-rotulo">Desafio encerrado</p>
        <p className="dc-fim-titulo">Não foi dessa vez</p>
        <p className="dc-fim-texto">Você fez {medias(meu.medias)} de {medias(d.medias)}. Virão mais oportunidades — obrigado pelo esforço!</p>
      </section>
    );
  }
  return (
    <section className="dc-cartao dc-parabens dc-sobe" style={{ ['--d' as string]: 0 }} aria-label="Parabéns">
      <span className="dc-parabens-confete" aria-hidden>
        {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ left: `${(i * 41 + 7) % 96}%`, ['--i' as string]: i }} />)}
      </span>
      <span className="dc-parabens-icone" aria-hidden><PartyPopper size={24} /></span>
      <div>
        <p className="dc-parabens-titulo">Parabéns! Você bateu as {medias(d.medias)}</p>
        <p className="dc-parabens-texto">
          Seu {d.premio_nome}: <strong>{reais(valor)}</strong>{d.fechado_em ? '.' : ' — valor provisório até o fechamento oficial do mês.'}
        </p>
      </div>
    </section>
  );
}

/** O resultado gravado no fechamento: o final, que a virada do mês não muda. */
function ResultadoGravado({ d, r }: { d: DesafioVale; r: ResultadoVale }) {
  return r.bateu ? (
    <section className="dc-cartao dc-parabens dc-sobe" style={{ ['--d' as string]: 0 }} aria-label="Parabéns">
      <span className="dc-parabens-confete" aria-hidden>
        {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ left: `${(i * 41 + 7) % 96}%`, ['--i' as string]: i }} />)}
      </span>
      <span className="dc-parabens-icone" aria-hidden><PartyPopper size={24} /></span>
      <div>
        <p className="dc-parabens-titulo">Parabéns! Você bateu as {medias(d.medias)}</p>
        <p className="dc-parabens-texto">
          Foram <strong>{medias(r.medias)}</strong> ({brl(r.feito)}). Seu {d.premio_nome}: <strong>{reais(r.valor)}</strong> — resultado final.
          {r.cupons > 0 ? <> E você tem <strong>{nCupons(r.cupons)}</strong> do Pix.</> : null}
          {r.ranking_posicao ? <> E ficou em <strong>{r.ranking_posicao}º</strong> no ranking do setor.</> : null}
        </p>
      </div>
    </section>
  ) : (
    <section className="dc-cartao dc-fim dc-sobe" style={{ ['--d' as string]: 0 }} aria-label="Resultado final">
      <span className="dc-fim-icone" aria-hidden><Hourglass size={26} /></span>
      <p className="dc-rotulo">Resultado final</p>
      <p className="dc-fim-titulo">{r.meta === null ? 'Sem meta no mês' : 'Não foi dessa vez'}</p>
      <p className="dc-fim-texto">
        {r.meta === null ? `A regra das ${medias(d.medias)} não valeu para você neste mês.` : `Você fez ${medias(r.medias)} de ${medias(d.medias)}. Virão mais oportunidades!`}
        {r.cupons > 0 ? ` Você ficou com ${nCupons(r.cupons)} do Pix.` : ''}
      </p>
    </section>
  );
}

function DiasDoDesafio({ d, meu, hoje }: { d: DesafioVale; meu: MetaNoVale; hoje: string }) {
  const dias = diasDoPeriodo(d.inicio, d.fim);
  return (
    <section className="dc-sobe" style={{ ['--d' as string]: 3 }} aria-labelledby="dv-dias">
      <h3 id="dv-dias" className="dc-rotulo dc-rotulo-solto"><CalendarDays size={14} aria-hidden /> Dia a dia <span>em médias</span></h3>
      <ol className="dv-dias">
        {dias.map((dia, i) => {
          const v = meu.recebidoPorDia[i] ?? 0;
          const m = meu.mediaDiaria > 0 ? v / meu.mediaDiaria : 0;
          const estado = dia > hoje ? 'depois' : dia === hoje ? 'hoje' : '';
          return (
            <li key={dia} className={cn(estado)}>
              <span>{semanaCurta(dia)}</span>
              <em>{dataCurta(dia)}</em>
              <strong>{dia > hoje ? '—' : m.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</strong>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ── Cupons ───────────────────────────────────────────────────────────────────

/** O convite para o ranking (setor sem Pix), no lugar do resumo dos cupons. */
function ResumoRanking({ d, onAbrir }: { d: DesafioVale; onAbrir: () => void }) {
  const qtd = d.meu_setor?.cupom_ranking_qtd ?? 2;
  return (
    <button type="button" className="dc-cartao dv-cupom-resumo dc-sobe" style={{ ['--d' as string]: 2 }} onClick={onAbrir}>
      <span className="dv-cupom-icone" aria-hidden><Trophy size={22} /></span>
      <span className="min-w-0 flex-1 text-left">
        <span className="dv-cupom-resumo-titulo">E tem mais: ranking · {periodo(d.cupom_inicio!, d.cupom_fim!)}</span>
        <span className="dv-cupom-resumo-texto">Os <strong>{qtd} que mais receberem</strong> até {semana(d.cupom_fim!)} {premioDoRanking(d).texto}</span>
      </span>
      <span className="dv-cupom-ver">ver</span>
    </button>
  );
}

function ResumoCupons({ d, aberta, onAbrir }: { d: DesafioVale; aberta: boolean; onAbrir: () => void }) {
  const visao = useVisaoDoVale();
  const c = useMeusCuponsDaVisao(d, aberta, visao.operadorId);
  return (
    <button type="button" className="dc-cartao dv-cupom-resumo dc-sobe" style={{ ['--d' as string]: 2 }} onClick={onAbrir}>
      <span className="dv-cupom-icone" aria-hidden><Ticket size={22} /></span>
      <span className="min-w-0 flex-1 text-left">
        <span className="dv-cupom-resumo-titulo">E tem mais: Cupons do Pix · {periodo(d.cupom_inicio!, d.cupom_fim!)}</span>
        <span className="dv-cupom-resumo-texto">
          {c.data
            ? <>Você tem <strong>{nCupons(c.data.cupons)}</strong>{c.data.pendentes > 0 ? <> · {c.data.pendentes} Pix esperando o líder</> : null}</>
            : <>A cada {d.cupom_pix} Pix aprovados, 1 cupom</>}
        </span>
      </span>
      <span className="dv-cupom-ver">ver</span>
    </button>
  );
}

/** O sorteio do setor, do lado do operador: quantos ganham e, depois, quem ganhou. */
function SorteioDoMeuSetor({ d, eu }: { d: DesafioVale; eu: string | null }) {
  const setor = d.meu_setor;
  if (!setor || !setor.sorteio_qtd) return null;
  const ganhadores = setor.ganhadores ?? [];
  const ganhei = ganhadores.find(g => g.perfil_id === eu);
  return (
    <div className={cn('dv-sorteio-meu', ganhei && 'ganhou')}>
      <p className="dv-sorteio-meu-titulo">
        <Dices size={16} aria-hidden /> Sorteio do {setor.nome}: <strong>{setor.sorteio_qtd} {setor.sorteio_qtd === 1 ? 'ganhador' : 'ganhadores'}</strong>
      </p>
      {ganhadores.length === 0 ? (
        <p className="dv-sorteio-meu-texto">
          {d.sorteio_por_cupom ? 'Cada cupom é uma chance — quanto mais cupons, mais chances.' : 'Com 1 cupom você já concorre — todos com a mesma chance.'}
          {' '}O sorteio sai depois de {dataCurta(d.cupom_fim!)}.
        </p>
      ) : (
        <>
          {ganhei && <p className="dv-sorteio-meu-texto"><PartyPopper size={15} aria-hidden /> <strong>Você foi sorteado!</strong></p>}
          <ol className="dv-ganhadores">
            {ganhadores.map(g => <li key={g.perfil_id} className={cn(g.perfil_id === eu && 'eu')}><b>{g.posicao}º</b> {g.nome}</li>)}
          </ol>
        </>
      )}
    </div>
  );
}

function MeusCupons({ d, aberta }: { d: DesafioVale; aberta: boolean }) {
  const visao = useVisaoDoVale();
  const c = useMeusCuponsDaVisao(d, aberta, visao.operadorId);
  const hoje = visao.hoje;
  const fase = faseDoPeriodo(d.cupom_inicio!, d.cupom_fim!, hoje);
  const k = d.cupom_pix;
  return (
    <div className="dc-conteudo">
      <section className="dc-cartao dv-cupom-heroi dc-sobe" style={{ ['--d' as string]: 0 }} aria-label="Seus cupons">
        <p className="dc-rotulo"><Ticket size={14} aria-hidden /> Cupons do Pix · {periodo(d.cupom_inicio!, d.cupom_fim!)}</p>
        <p className="dv-cupom-regra">A cada <strong>{k} Pix automáticos aprovados</strong> na aba Pix Automático, <strong>1 cupom</strong>.{d.cupom_premio ? <> {d.cupom_premio}</> : null}</p>
        {c.data ? (
          <>
            <CarteiraDeCupons c={c.data} porCupom={k} encerrado={fase === 'depois'} chancePorCupom={d.sorteio_por_cupom === true} />
            <SorteioDoMeuSetor d={d} eu={visao.operadorId} />
          </>
        ) : c.isError ? <p className="dc-dica">Não deu para carregar os seus Pix agora.</p> : <p className="dc-dica">Carregando os seus Pix…</p>}
      </section>

      {c.data && c.data.linhas.length > 0 && (
        <section className="dc-cartao dc-sobe" style={{ ['--d' as string]: 1 }} aria-label="Seus Pix do período">
          <p className="dc-rotulo">Seus Pix do período</p>
          <ul className="dv-pix-lista">
            {c.data.linhas.slice().reverse().map(l => (
              <li key={l.id} className={l.status}>
                <span className="font-mono">NR {l.nr_cliente}</span>
                <em>{dataCurta(dataLocalPix(l.criado_em))}</em>
                <span className="dv-pix-status">{l.status === 'aprovado' ? 'aprovado' : l.status === 'pendente' ? 'esperando o líder' : 'desaprovado'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="dv-dica-cor">
        <span className="dv-tag-cupom" aria-hidden><Ticket size={11} /> cupom</span>
        Na aba <Link to={ROUTE_PATHS.PIX_AUTOMATICO} className="underline">Pix Automático</Link>, os Pix de {periodo(d.cupom_inicio!, d.cupom_fim!)} aparecem destacados nesta cor, para o líder achar e aprovar.
      </p>
    </div>
  );
}
