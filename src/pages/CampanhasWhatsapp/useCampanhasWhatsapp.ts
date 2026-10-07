/**
 * Campanhas de WhatsApp — o estado da aba do operador.
 *
 * As campanhas que chegaram para ele, a escolhida (pela URL: a notificação
 * traz `?envio=`), as mensagens dela e as três ações: enviar (marca enviada no
 * clique), marcar que não deu, e editar a mensagem de um contato só.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { listarMinhasCampanhas, type EnvioResumo } from '@/pages/CampanhaFacil/campanhaFacilEnvios.service';
import { definirStatus, editarMensagem, listarContatos } from './campanhasWhatsapp.service';
import {
  contar, linkWhatsApp, textoDoContato,
  type Contato, type ModoAbrir, type StatusContato,
} from './whatsapp';

const CHAVE_MODO = 'campanhas-whatsapp:modo';

function lerModo(): ModoAbrir {
  try { return localStorage.getItem(CHAVE_MODO) === 'app' ? 'app' : 'web'; } catch { return 'web'; }
}

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
      console.error('[CampanhasWhatsapp]', err);
      toast.error(erro);
      if (antes) setContatos((cs) => cs.map(c => (c.id === id ? antes : c)));
    }
  }, []);

  const marcar = useCallback((c: Contato, status: StatusContato) => alterar(
    c.id, { status, enviado_em: status === 'enviado' ? new Date().toISOString() : null },
    () => definirStatus(c.id, status), 'Não foi possível salvar. Tente de novo.',
  ), [alterar]);

  /**
   * Abre a conversa com a mensagem pronta e marca como enviada — «enviado é a
   * partir do momento que a pessoa clica para enviar».
   *
   * O WhatsApp Web abre sempre na MESMA aba (janela com nome): enviar a
   * campanha inteira não enche o navegador de abas.
   */
  const enviar = useCallback((c: Contato) => {
    if (!c.whatsapp) return;
    const url = linkWhatsApp(c.whatsapp, textoDoContato(c), modo);
    if (modo === 'app') {
      window.location.href = url;
    } else {
      const janela = window.open(url, 'gestao-whatsapp-web');
      janela?.focus();
    }
    if (c.status !== 'enviado') void marcar(c, 'enviado');
  }, [modo, marcar]);

  const salvarMensagem = useCallback((c: Contato, texto: string | null) => {
    const limpo = texto === null || texto.trim() === '' || texto === c.mensagem ? null : texto;
    return alterar(c.id, { mensagem_editada: limpo }, () => editarMensagem(c.id, limpo),
      'Não foi possível salvar a mensagem. Tente de novo.');
  }, [alterar]);

  return {
    perfilId, carregando, campanhas, selecionada, selecionar, recarregar,
    contatos, carregandoContatos, contagem,
    modo, setModo, enviar, marcar, salvarMensagem,
  };
}
