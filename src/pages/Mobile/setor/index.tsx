/**
 * Tela do setor no celular — `/m/setor` (06/10/2026).
 *
 * Desenho: docs/superpowers/specs/2026-10-06-app-celular-gerencia-design.md §2.
 *
 * A irmã da tela do líder, voltada ao setor do cadastro: abas Setor, Quartis,
 * Gráfico e Hoje. A gerência abre aqui; elite e líder chegam pela troca de
 * visão. Os números são os do Painel do Líder (`useTelaSetor`).
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { ROUTE_PATHS } from '@/lib/index';
import { ehSuperAdmin, gravarVersao, ofereceVersaoCompleta } from '@/lib/mobile/preferencia';
import { acessoDasVisoes, rotaDaVisao } from '@/lib/mobile/visoes';
import { useUnidadeApp } from '@/lib/mobile/unidadeApp';
import { registrarServiceWorker } from '@/lib/mobile/sw';
import { mesPorExtenso } from '@/pages/Dashboard/Analitico/mensagemOperador';
import { getImpersonacaoAtiva, sairImpersonacao } from '@/services/impersonacao.service';
import type { EscopoAnalitico } from '@/services/analitico/escopoAnalitico';
import { FotoOuLogo, FundoVivo } from '../comum/partesComuns';
import { ChatDoApp } from '../comum/ChatDoApp';
import { InterruptorUnidade, TrocaDeVisao } from '../comum/Topo';
import { BotaoInstalar, PassoIPhone } from '../equipe/InstalarApp';
import { IconeAba } from '../equipe/partes';
import { AbaGrafico } from '../equipe/AbaGrafico';
import { AbaHoje } from '../equipe/AbaHoje';
import { usePagamentosEquipe } from '../equipe/useTelaEquipe';
import { useTelaSetor } from './useTelaSetor';
import { AbaSetor } from './AbaSetor';
import { AbaQuartisSetor } from './AbaQuartisSetor';
import { EquipesRecolhiveis } from './EquipesRecolhiveis';
import { hojeDoConjunto } from './contas';
import '../equipe/equipe.css';
import './setor.css';

type Aba = 'setor' | 'quartis' | 'grafico' | 'hoje';
const ABAS: { id: Aba; rotulo: string; icone: 'equipe' | 'quartis' | 'grafico' | 'hoje' }[] = [
  { id: 'setor', rotulo: 'Setor', icone: 'equipe' },
  { id: 'quartis', rotulo: 'Quartis', icone: 'quartis' },
  { id: 'grafico', rotulo: 'Gráfico', icone: 'grafico' },
  { id: 'hoje', rotulo: 'Hoje', icone: 'hoje' },
];

const TODO_O_SETOR = '__setor__';

export default function MobileSetor() {
  const { perfil } = useAuth();
  // Super admin testa entrando como alguém — o seletor mora na `/m`.
  if (ehSuperAdmin(perfil?.perfil)) return <Navigate to={ROUTE_PATHS.MOBILE} replace />;
  return <TelaDoSetor />;
}

function TelaDoSetor() {
  const tela = useTelaSetor();
  const { perfil, signOut } = useAuth();
  const { temPermissao } = useCargoPermissoes();
  const navigate = useNavigate();
  const location = useLocation();
  const [aba, setAba] = useState<Aba>(() => {
    const pedida = new URLSearchParams(location.search).get('aba');
    return ABAS.some(a => a.id === pedida) ? (pedida as Aba) : 'setor';
  });
  const [doHoje, setDoHoje] = useState<string>(TODO_O_SETOR);
  const [passoIPhone, setPassoIPhone] = useState(false);
  const impersonando = !!getImpersonacaoAtiva();
  const acesso = acessoDasVisoes(perfil?.perfil, temPermissao('ver_painel_lider'));
  const cofen = tela.setor?.cofen ?? false;
  const { unidade } = useUnidadeApp(cofen);

  useEffect(() => { void registrarServiceWorker(); }, []);
  useEffect(() => { window.scrollTo?.({ top: 0 }); }, [aba]);

  // Hoje: o setor inteiro ou uma equipe.
  const equipeDoHoje = tela.equipes.find(e => e.id === doHoje) ?? null;
  const conjuntoHoje = equipeDoHoje
    ? { operadorIds: equipeDoHoje.operadorIds, nomes: equipeDoHoje.nomes,
        totalPessoas: equipeDoHoje.detalhe.totalOperadores, rotulo: 'da equipe' }
    : { operadorIds: tela.operadorIds, nomes: tela.nomes, totalPessoas: tela.operadorIds.length, rotulo: 'do setor' };
  const escopoHoje: EscopoAnalitico | undefined = equipeDoHoje
    ? undefined
    : cofen ? { tipo: 'equipe', operadores: new Set(tela.operadorIds) } : tela.escopoSetor ?? undefined;
  // Setor Cofen: o total do dia é o da conciliação (as linhas do setor).
  const totalHojeCofen = useMemo(
    () => (cofen && !equipeDoHoje ? hojeDoConjunto(tela.linhasSetor, tela.hojeISO, null).total : null),
    [cofen, equipeDoHoje, tela.linhasSetor, tela.hojeISO],
  );
  const pagamentos = usePagamentosEquipe({
    empresaId: tela.empresaId, mes: tela.mes, operadorIds: conjuntoHoje.operadorIds, ativo: aba === 'hoje',
  });

  const abrirVersaoCompleta = () => {
    gravarVersao('completa');
    navigate(ROUTE_PATHS.DASHBOARD);
  };
  const rodape = (
    <>
      <BotaoInstalar onPassoIPhone={() => setPassoIPhone(true)} />
      <div className="e-links">
        {ofereceVersaoCompleta() && <button type="button" onClick={abrirVersaoCompleta}>Versão completa</button>}
        <button type="button" onClick={() => { void (impersonando ? sairImpersonacao() : signOut()); }}>
          {impersonando ? 'Voltar à minha conta' : 'Sair'}
        </button>
      </div>
    </>
  );

  const temSetor = !!tela.setor && !tela.semSetor;

  return (
    <div className="tela-equipe">
      <FundoVivo />
      <div className="e-conteudo">
        <header className="e-topo">
          <FotoOuLogo foto={tela.fotoUrl} nome={tela.nomePessoa} />
          <div className="e-quem">
            <div className="e-eq"><span>{tela.setor ? `Setor ${tela.setor.nome}` : (tela.carregando ? ' ' : 'Setor')}</span></div>
            <div className="e-sub">{mesPorExtenso(tela.mes).split('/')[0]}</div>
          </div>
        </header>

        <div className="v-faixa-topo">
          <TrocaDeVisao visoes={acesso.visoes} atual="setor"
            onEscolher={v => navigate(rotaDaVisao(v, acesso.completo))} />
          <InterruptorUnidade unidade={unidade} visivel={cofen} />
        </div>

        {tela.semSetor ? (
          <>
            <p className="e-vazio"><b>Seu cadastro está sem setor</b>Peça para a administração definir o seu setor. Enquanto isso, use a versão completa.</p>
            {rodape}
          </>
        ) : tela.carregando ? (
          <div aria-busy="true" aria-label="Carregando">
            <div className="e-esq" style={{ margin: '0 16px', height: 250, borderRadius: 24 }} />
            <div className="e-esq" style={{ margin: '14px 16px 0', height: 160 }} />
          </div>
        ) : tela.erro || !temSetor ? (
          <>
            <p className="e-vazio"><b>Não foi possível carregar o setor</b>Confira a conexão e tente de novo.</p>
            <button type="button" className="e-btn e-sec-btn" onClick={tela.recarregar}>Tentar de novo</button>
            {rodape}
          </>
        ) : (
          <main className="v-entra" key={aba}>
            {aba === 'setor' && (
              <AbaSetor nome={tela.setor!.nome} recebido={tela.recebido} ritmo={tela.ritmo} emHO={tela.emHO}
                cofen={cofen} equipes={tela.equipes} linhasSetor={tela.linhasSetor}
                escopoSetor={cofen ? null : tela.escopoSetor} hojeISO={tela.hojeISO} rodape={rodape} />
            )}
            {aba === 'quartis' && <AbaQuartisSetor nome={tela.setor!.nome} equipes={tela.equipes} emHO={tela.emHO} />}
            {aba === 'grafico' && tela.escopoSetor && (
              <AbaGrafico
                escopo={cofen ? { tipo: 'empresa' } : tela.escopoSetor}
                mes={tela.mes} hojeISO={tela.hojeISO}
                linhas={tela.linhasSetor} carregando={tela.carregandoLinhas} erro={tela.erroLinhas}
                isPaguePlay={tela.isPaguePlay} emHO={tela.emHO}
                rodape={<EquipesRecolhiveis equipes={tela.equipes} linhas={tela.linhasPessoas}
                  mes={tela.mes} hojeISO={tela.hojeISO} />} />
            )}
            {aba === 'hoje' && (
              <>
                <div className="s-chips" role="group" aria-label="De quem é o Hoje">
                  <button type="button" aria-pressed={doHoje === TODO_O_SETOR} onClick={() => setDoHoje(TODO_O_SETOR)}>
                    Setor
                  </button>
                  {tela.equipes.map(e => (
                    <button key={e.id} type="button" aria-pressed={doHoje === e.id} onClick={() => setDoHoje(e.id)}>
                      {e.nome}
                    </button>
                  ))}
                </div>
                <AbaHoje conjunto={conjuntoHoje} escopo={escopoHoje} hojeISO={tela.hojeISO}
                  linhas={tela.linhasPessoas} carregando={tela.carregandoLinhas}
                  pagamentos={pagamentos.data} carregandoPagamentos={pagamentos.isLoading}
                  isPaguePlay={tela.isPaguePlay} emHO={tela.emHO}
                  totalHoje={totalHojeCofen}
                  notaTotal={totalHojeCofen !== null ? 'Total do relatório de conciliação.' : null} />
              </>
            )}
          </main>
        )}
      </div>

      <PassoIPhone aberto={passoIPhone} onFechar={() => setPassoIPhone(false)} />
      <ChatDoApp acimaDoRodape={temSetor ? 72 : 0} />

      {temSetor && !tela.carregando && (
        <nav className="e-abas" aria-label="Abas">
          {ABAS.map(a => (
            <button key={a.id} type="button" aria-current={aba === a.id ? 'page' : undefined}
              onClick={() => setAba(a.id)}>
              <IconeAba aba={a.icone} />{a.rotulo}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
