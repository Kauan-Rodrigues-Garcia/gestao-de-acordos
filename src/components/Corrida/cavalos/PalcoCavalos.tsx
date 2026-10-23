/**
 * PalcoCavalos — o palco da Corrida de Cavalos de verdade: o mesmo papel do
 * `PalcoAoVivo` dos bichinhos. A sala vem do banco (`banco.ts`) e vai para a
 * página da corrida a cada mudança, com o desvio do relógio do banco; a
 * gravação (as posições) desce do bucket `corridas` e vai junto.
 *
 * O arquivo desce quando a corrida é gravada. Antes da largada, cada tela
 * espera um intervalo aleatório (até 6 s): 250 telas não pedem o mesmo
 * arquivo no mesmo segundo. O SOLTAR do organizador só libera depois disso
 * (`ESPERA_SOLTAR` na página), e o super admin baixa na hora. Depois da
 * largada, quem abre baixa na hora.
 *
 * O super admin (assistindo pela Configuração) também comanda daqui: os botões
 * PREPARAR e SOLTAR em cima da janela chegam como mensagem e viram as mesmas
 * funções do card da Configuração.
 *
 * A Guerra na Corrida (23/10/2026, ver `guerra/regras.ts`): o estado da guerra
 * também vai para a página; os cliques do ataque voltam e viram
 * `fn_corrida_guerra_atacar`; quando a janela estoura, o Cavalo da Guerra
 * (`guerra/CenaGuerra.tsx`, carregado só nessa hora) briga na página do Gestão.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuthOpcional } from '@/hooks/useAuth';
import { agoraBanco, assinarSala, baixarArquivo, conferirLobby, entrarNoLobby, mensagemDoErro, ouvirTorcida, palpitar, torcer, useCorridaMinha } from '../banco';
import { gravarCorridaCavalos, iniciarCorrida } from '../admin/acoes';
import { desempacotarCavalos } from './gravacao';
import type { CorridaCavalos } from './simulacao';
import { JanelaCavalos, type EnviarCavalos, type MensagemCavalos } from './JanelaCavalos';
import { atacarGuerra, golpearGuerra, lerGuerra, useGuerra } from '../guerra/banco';
import { GUERRA, type LoteDeGolpes } from '../guerra/regras';
import { useJanelaDaGuerra } from '../guerra/useJanelaDaGuerra';

const carregarCena = () => import('../guerra/CenaGuerra');
const CenaGuerra = lazy(carregarCena);
const agoraMs = () => agoraBanco() * 1000;

interface Props { corridaId: number; onFechar: () => void; adm?: boolean }

export default function PalcoCavalos({ corridaId, onFechar, adm = false }: Props) {
  const auth = useAuthOpcional();
  const eu = auth?.user?.id ?? null;
  // Como na Bruxa: o super_admin ouve o chefe inteiro e fica sem escudo (o clique dele no Gestão continua
  // sendo clique); o operador ouve a 12% e, na briga, todo clique é tiro.
  const souSuperAdmin = auth?.perfil?.perfil === 'super_admin';
  const volumeChefe = souSuperAdmin || adm ? 1 : 0.12;
  const { sala } = useCorridaMinha();
  const conexao = useRef<EnviarCavalos | null>(null);
  const [pronta, setPronta] = useState(false);
  const [rec, setRec] = useState<CorridaCavalos | null>(null);
  const ocupado = useRef(false);
  const quadro = useRef<HTMLIFrameElement | null>(null);
  const guerra = useGuerra(corridaId);
  const { chefe, tratar: tratarGuerra } = useJanelaDaGuerra(quadro, guerra, agoraMs);

  // Entra no lobby (marca a entrada e lê a sala inteira).
  useEffect(() => {
    let vivo = true;
    entrarNoLobby(corridaId).catch(e => { if (vivo) { toast.error('Não deu para entrar na corrida', { description: mensagemDoErro(e) }); onFechar(); } });
    return () => { vivo = false; };
  }, [corridaId, onFechar]);
  useEffect(() => assinarSala(corridaId), [corridaId]);
  // A conferência de 30 s: quem entrou e o aviso não trouxe.
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void conferirLobby(corridaId); }, 30_000);
    return () => window.clearInterval(id);
  }, [corridaId]);

  const corrida = sala && sala.corrida.id === corridaId ? sala.corrida : null;
  const arquivo = corrida?.gravacao?.arquivo ?? null;
  const largou = corrida?.estado === 'correndo' || corrida?.estado === 'encerrada';

  // A gravação: desce uma vez por arquivo (descartada e gravada de novo, é outro arquivo).
  useEffect(() => {
    setRec(null);
    if (!arquivo) return;
    let vivo = true;
    const t = window.setTimeout(async () => {
      for (let i = 1; vivo; i++) {
        try { const r = desempacotarCavalos(new Uint8Array(await (await baixarArquivo(arquivo)).arrayBuffer())); if (vivo) setRec(r); return; }
        catch (e) {
          if (i >= 3) { console.error('[cavalos] não baixou a corrida', e); toast.error('Não deu para baixar a corrida', { description: 'Feche e abra de novo em alguns segundos.' }); return; }
          await new Promise(r => setTimeout(r, 1500 * i));
        }
      }
    }, largou || adm ? 0 : Math.random() * 6_000);
    return () => { vivo = false; window.clearTimeout(t); };
    // `largou` e `adm` só decidem a espera do primeiro download.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivo]);

  // A sala vai para a página a cada mudança (e a cada 15 s, com o relógio acertado).
  const mandarSala = useCallback(() => {
    if (!pronta || !sala || sala.corrida.id !== corridaId) return;
    conexao.current?.({ tipo: 'sala', sala, eu, adm, desvio: agoraBanco() * 1000 - Date.now() });
  }, [pronta, sala, corridaId, eu, adm]);
  useEffect(() => { mandarSala(); }, [mandarSala]);
  useEffect(() => { const id = window.setInterval(mandarSala, 15_000); return () => window.clearInterval(id); }, [mandarSala]);
  useEffect(() => { if (pronta && rec) conexao.current?.({ tipo: 'gravacao', rec }); }, [pronta, rec]);
  // A guerra: lida uma vez (o resto vem no sinal da sala). A página espera por este primeiro
  // estado para seguir o relógio, então ele vai mesmo quando falha («desligada»).
  const [guerraLida, setGuerraLida] = useState(false);
  useEffect(() => {
    let vivo = true;
    lerGuerra(corridaId).catch(e => { console.warn('[guerra] não deu para ler', e); }).finally(() => { if (vivo) setGuerraLida(true); });
    return () => { vivo = false; };
  }, [corridaId]);
  useEffect(() => {
    if (!pronta || !guerraLida) return;
    conexao.current?.({ tipo: 'guerra', guerra: guerra ?? { corrida_id: corridaId, ligada: false } });
  }, [pronta, guerraLida, guerra, corridaId]);
  // Com a guerra ligada, o chefe desce antes de ser preciso (no meio da corrida não dá tempo).
  useEffect(() => { if (guerra?.ligada) void carregarCena(); }, [guerra?.ligada]);
  const golpear = useCallback((l: LoteDeGolpes) => (adm || !eu ? Promise.resolve(true) : golpearGuerra(corridaId, l)), [adm, eu, corridaId]);

  // A torcida dos outros (o banco junta e manda no máximo 1 sinal a cada 2 s).
  useEffect(() => ouvirTorcida((id, s) => { if (id === corridaId) conexao.current?.({ tipo: 'torcida', ...s }); }), [corridaId]);

  const ultimoPalpite = useRef(0);
  const ultimaTorcida = useRef(0);
  const ultimoAtaque = useRef(0);
  const aoReceber = useCallback((m: MensagemCavalos) => {
    if (tratarGuerra(m)) return;
    if (m.tipo === 'pronto') setPronta(true);
    else if (m.tipo === 'guerra-atacar' && eu && !adm && typeof m.cliques === 'number') {
      // A página já junta os cliques (1 envio a cada 2,5 s); aqui é a segunda trava, e o banco a terceira.
      if (Date.now() - ultimoAtaque.current < GUERRA.envioMs - 600) return;
      ultimoAtaque.current = Date.now();
      atacarGuerra(corridaId, m.cliques).catch(e => console.warn('[guerra] o ataque não foi', e));
    }
    else if (m.tipo === 'fechar') onFechar();
    else if (m.tipo === 'palpite' && eu && typeof m.alvo === 'string') {
      // no máximo um pedido por segundo (o banco também segura)
      if (Date.now() - ultimoPalpite.current < 1_000) return;
      ultimoPalpite.current = Date.now();
      palpitar(corridaId, eu, m.alvo).catch(e => toast.error('O palpite não foi', { description: mensagemDoErro(e) }));
    } else if (m.tipo === 'torcida' && eu && !adm && typeof m.barulho === 'number') {
      // A página já junta os cliques (1 envio a cada 3 s); aqui é a segunda trava. Falhar não avisa ninguém:
      // a torcida é enfeite, e a própria tela já mostrou o que a pessoa fez.
      if (Date.now() - ultimaTorcida.current < 2_500) return;
      ultimaTorcida.current = Date.now();
      torcer(corridaId, m.barulho, typeof m.emoji === 'string' ? m.emoji : null).catch(e => console.warn('[cavalos] a torcida não foi', e));
    } else if (m.tipo === 'org' && adm && corrida && !ocupado.current) {
      ocupado.current = true;
      const erro = (e: unknown) => conexao.current?.({ tipo: 'org-erro', texto: mensagemDoErro(e) });
      const feito = () => { ocupado.current = false; };
      if (m.acao === 'preparar') {
        (async () => {
          const p = await gravarCorridaCavalos(corrida, () => undefined, () => false);
          if (!p) throw new Error('A gravação parou no meio.');
        })().catch(erro).finally(feito);
      } else if (m.acao === 'soltar') iniciarCorrida(corrida.id).catch(erro).finally(feito);
      else feito();
    }
  }, [corridaId, eu, adm, corrida, onFechar, tratarGuerra]);

  return (
    <>
      <JanelaCavalos modo="app" onMensagem={aoReceber} conexao={conexao} escondida={!!chefe} quadro={quadro} />
      {chefe && guerra?.ligada && (
        <Suspense fallback={null}>
          <CenaGuerra estado={guerra} agora={agoraMs} numero={chefe.numero} dono={chefe.dono} eu={eu}
            janela={{ rect: chefe.rect, canvas: chefe.canvas }} aoGolpear={golpear} volume={volumeChefe} escudo={!(souSuperAdmin || adm)} />
        </Suspense>
      )}
    </>
  );
}
