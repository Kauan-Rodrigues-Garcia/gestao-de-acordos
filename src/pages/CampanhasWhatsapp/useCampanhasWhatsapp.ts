/**
 * Campanhas de WhatsApp — o estado da aba do operador.
 *
 * As campanhas que chegaram para ele, a escolhida (pela URL: a notificação
 * traz `?envio=`), as mensagens dela e as ações: enviar (marca enviada no
 * clique), copiar (também conta como enviada), marcar que não deu, e editar a
 * mensagem de um contato só.
 *
 * O líder pode desativar ou excluir a campanha (20261007190000): o banco manda
 * o sinal `campanhas:<operador>` e a aba aberta relê na hora — a campanha some.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { assinarTabela } from '@/lib/realtime';
import { copiarTextoSilencioso } from '@/lib/clipboard';
import { listarMinhasCampanhas, type EnvioResumo } from '@/pages/CampanhaFacil/campanhaFacilEnvios.service';
import { CampanhaIndisponivel, definirStatus, editarMensagem, listarContatos } from './campanhasWhatsapp.service';
import {
  contar, linkWhatsApp, textoDoContato,
  type Contato, type ModoAbrir, type StatusContato,
} from './whatsapp';
import { entregarNaAbaAberta, ponteInstalada } from './ponteWhatsapp';

const CHAVE_MODO = 'campanhas-whatsapp:modo';

function lerModo(): ModoAbrir {
  try { return localStorage.getItem(CHAVE_MODO) === 'app' ? 'app' : 'web'; } catch { return 'web'; }
}

/** Qual número abrir: o principal ou o «Fone 2». */
export type QualNumero = 1 | 2;

export function useCampanhasWhatsapp() {
  const { perfil } = useAuth();
  const perfilId = perfil?.id ?? null;
  const [params, setParams] = useSearchParams();

  const [campanhas, setCampanhas] = useState<EnvioResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [carregandoContatos, setCarregandoContatos] = useState(false);
  const contatosRef = useRef(contatos);
  contatosRef.current = contatos;
  const [modo, setModoState] = useState<ModoAbrir>(lerModo);

  const setModo = useCallback((m: ModoAbrir) => {
    setModoState(m);
    try { localStorage.setItem(CHAVE_MODO, m); } catch { /* sem armazenamento: vale só nesta visita */ }
  }, []);

  const recarregar = useCallback(async () => {
    if (!perfilId) return;
    try {
      setCampanhas(await listarMinhasCampanhas(perfilId));
    } catch (err) {
      console.error('[CampanhasWhatsapp] campanhas:', err);
      toast.error('Não foi possível carregar as suas campanhas.');
    } finally {
      setCarregando(false);
    }
  }, [perfilId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  // O líder desativou, relançou ou excluiu: relê na hora.
  useEffect(() => {
    if (!perfilId) return;
    return assinarTabela(
      { topico: `campanhas:${perfilId}`, escutas: [{ sinal: 'mudou' }] },
      {
        onSinal: (payload) => {
          if (payload.operacao === 'desativada') toast.info('O líder desativou uma campanha para ajustes. Ela volta quando for liberada de novo.');
          void recarregar();
        },
        onReconectado: () => { void recarregar(); },
      },
    );
  }, [perfilId, recarregar]);

  // A escolhida: a da URL, se ainda existir; senão a mais recente.
  const pedida = params.get('envio');
  const selecionadaId = useMemo(() => {
    if (pedida && campanhas.some(c => c.id === pedida)) return pedida;
    return campanhas[0]?.id ?? null;
  }, [pedida, campanhas]);
  const selecionada = campanhas.find(c => c.id === selecionadaId) ?? null;

  const selecionar = useCallback((id: string) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set('envio', id); return n; }, { replace: true });
  }, [setParams]);

  useEffect(() => {
    if (!selecionadaId) { setContatos([]); return; }
    let ativo = true;
    setCarregandoContatos(true);
    listarContatos(selecionadaId)
      .then((l) => { if (ativo) setContatos(l); })
      .catch((err) => {
        console.error('[CampanhasWhatsapp] mensagens:', err);
        if (ativo) toast.error('Não foi possível carregar as mensagens desta campanha.');
      })
      .finally(() => { if (ativo) setCarregandoContatos(false); });
    return () => { ativo = false; };
  }, [selecionadaId]);

  const contagem = useMemo(() => contar(contatos), [contatos]);

  // O progresso da campanha aberta acompanha a lista na hora.
  useEffect(() => {
    if (!selecionadaId || carregandoContatos) return;
    setCampanhas((cs) => cs.map(c => (c.id === selecionadaId
      ? { ...c, progresso: { total: contagem.total, enviados: contagem.enviados, nao_enviados: contagem.naoEnviados } }
      : c)));
  }, [selecionadaId, carregandoContatos, contagem]);

  /** Troca local + banco; volta atrás se o banco recusar. */
  const alterar = useCallback(async (
    id: string, mudanca: Partial<Contato>, gravar: () => Promise<void>, erro: string,
  ) => {
    const antes = contatosRef.current.find(c => c.id === id);
    setContatos((cs) => cs.map(c => (c.id === id ? { ...c, ...mudanca } : c)));
    try {
      await gravar();
    } catch (err) {
      if (antes) setContatos((cs) => cs.map(c => (c.id === id ? antes : c)));
      if (err instanceof CampanhaIndisponivel) {
        toast.warning(err.message);
        void recarregar();
        return;
      }
      console.error('[CampanhasWhatsapp]', err);
      toast.error(erro);
    }
  }, [recarregar]);

  const marcar = useCallback((c: Contato, status: StatusContato) => alterar(
    c.id, { status, enviado_em: status === 'enviado' ? new Date().toISOString() : null },
    () => definirStatus(c.id, status), 'Não foi possível salvar. Tente de novo.',
  ), [alterar]);

  /** Copiou ou abriu o WhatsApp: está com ele, conta como enviada. */
  const marcarEnviada = useCallback((c: Contato) => {
    const atual = contatosRef.current.find(x => x.id === c.id) ?? c;
    if (atual.status !== 'enviado') void marcar(atual, 'enviado');
  }, [marcar]);

  // O script «mesma aba» foi instalado? Relido ao voltar para a aba (a pessoa
  // instala em outra aba e volta).
  const [mesmaAba, setMesmaAba] = useState(ponteInstalada);
  useEffect(() => {
    const reler = () => setMesmaAba(ponteInstalada());
    window.addEventListener('focus', reler);
    document.addEventListener('visibilitychange', reler);
    return () => {
      window.removeEventListener('focus', reler);
      document.removeEventListener('visibilitychange', reler);
    };
  }, []);

  /**
   * Abre a conversa com a mensagem pronta e marca como enviada — «enviado é a
   * partir do momento que a pessoa clica para enviar».
   *
   * WhatsApp Web: o nome da janela NÃO acha a aba aberta (o WhatsApp isola a
   * aba e cada clique abria uma nova). Com o script «mesma aba», a conversa vai
   * para a aba que já está aberta; sem ele, ou sem aba aberta, abre uma.
   */
  const enviar = useCallback((c: Contato, qual: QualNumero = 1) => {
    const numero = qual === 2 ? c.whatsapp2 : c.whatsapp;
    if (!numero) return;
    const texto = textoDoContato(c);
    const url = linkWhatsApp(numero, texto, modo);
    const abrirAba = () => { window.open(url, 'gestao-whatsapp-web')?.focus(); };
    if (modo === 'app') {
      window.location.href = url;
    } else if (ponteInstalada()) {
      void entregarNaAbaAberta(numero, texto).then((entregue) => { if (!entregue) abrirAba(); });
    } else {
      abrirAba();
    }
    marcarEnviada(c);
  }, [modo, marcarEnviada]);

  /**
   * Para enviar à mão: a única forma de copiar a mensagem (a tela não deixa
   * selecionar o texto), e conta como enviada — «qualquer mensagem copiada
   * fica presa com a pessoa» (Cleber, 07/10/2026).
   */
  const copiar = useCallback(async (c: Contato) => {
    const ok = await copiarTextoSilencioso(textoDoContato(c));
    if (!ok) { toast.error('Não foi possível copiar a mensagem.'); return; }
    toast.success('Mensagem copiada. Ela conta como enviada.');
    marcarEnviada(c);
  }, [marcarEnviada]);

  const salvarMensagem = useCallback((c: Contato, texto: string | null) => {
    const limpo = texto === null || texto.trim() === '' || texto === c.mensagem ? null : texto;
    return alterar(c.id, { mensagem_editada: limpo }, () => editarMensagem(c.id, limpo),
      'Não foi possível salvar a mensagem. Tente de novo.');
  }, [alterar]);

  return {
    perfilId, carregando, campanhas, selecionada, selecionar, recarregar,
    contatos, carregandoContatos, contagem,
    modo, setModo, mesmaAba, enviar, copiar, marcarEnviada, marcar, salvarMensagem,
  };
}
