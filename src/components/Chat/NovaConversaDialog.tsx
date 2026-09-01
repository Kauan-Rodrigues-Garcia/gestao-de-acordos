/**
 * NovaConversaDialog.tsx — com quem começar.
 *
 * A lista é a mesma de `fn_chat_contatos` do disparo, e por isso mostra só quem
 * eu consigo alcançar E que consegue receber. Oferecer alguém que o banco vai
 * recusar seria abrir uma porta para um cômodo vazio.
 */
import { useEffect, useMemo, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { listarContatos, type ContatoChat } from '@/services/chat/chat.service';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { AvatarChat, TagEmpresa } from './comum';

interface Props {
  aberto:    boolean;
  online:    Set<string>;
  onFechar:  () => void;
  /**
   * O contato inteiro, e não só o id: a tela já tem nome e foto, e passá-los
   * adiante faz a conversa nova abrir com o cabeçalho pronto em vez de esperar
   * uma segunda leitura no banco (ver `esbocoDeConversa`).
   */
  onEscolher: (contato: ContatoChat) => void;
}

/**
 * «Sua equipe», «seu setor», «a empresa inteira» — o alcance, em uma frase.
 *
 * A lista vem do banco já recortada, então a tela não PRECISA saber disto para
 * funcionar. Precisa para EXPLICAR: sem a frase, quem alcança só a própria
 * equipe abre a janela, vê seis nomes e conclui que o sistema está quebrado.
 */
function fraseDoAlcance(niveis: string[]): string | null {
  if (niveis.includes('todos_setores')) return 'Você alcança a empresa inteira.';
  if (niveis.includes('setor'))  return 'Você alcança as pessoas do seu setor.';
  if (niveis.includes('equipe')) return 'Você alcança as pessoas da sua equipe.';
  return null;
}

export function NovaConversaDialog({ aberto, online, onFechar, onEscolher }: Props) {
  const { temPermissao } = useCargoPermissoes();
  const niveis = niveisLiberados('chat', temPermissao);
  const alcance = fraseDoAlcance(niveis);
  const [contatos, setContatos] = useState<ContatoChat[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!aberto) return;
    setBusca('');
    setCarregando(true);
    void listarContatos().then(c => { setContatos(c); setCarregando(false); });
  }, [aberto]);

  /*
   * Uma pessoa por linha, mesmo aparecendo em duas equipes.
   *
   * `fn_chat_contatos` devolve uma linha por equipe — o clone existe nas duas,
   * e para o disparo isso importa. Aqui não: escolher com quem conversar é
   * escolher uma PESSOA, e ver o mesmo nome duas vezes parece defeito.
   */
  const pessoas = useMemo(() => {
    const unicas = new Map<string, ContatoChat>();
    for (const c of contatos) if (!unicas.has(c.perfil_id)) unicas.set(c.perfil_id, c);
    const termo = busca.trim().toLowerCase();
    const lista = [...unicas.values()];
    return termo
      ? lista.filter(c =>
          c.nome.toLowerCase().includes(termo) || (c.usuario ?? '').toLowerCase().includes(termo))
      : lista;
  }, [contatos, busca]);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base">Nova conversa</DialogTitle>
          <DialogDescription className="text-xs">
            {alcance ?? 'Com quem você quer falar?'}
          </DialogDescription>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca} onChange={e => setBusca(e.target.value)} autoFocus
            placeholder="Procurar por nome ou login"
            className="w-full bg-muted/60 rounded-lg pl-8 pr-2 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {carregando && (
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-8">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
            </p>
          )}
          {!carregando && pessoas.length === 0 && (
            <div className="text-center py-8 px-4">
              <p className="text-xs text-muted-foreground">
                {busca.trim() ? 'Ninguém com esse nome.'
                 : niveis.length === 0 ? 'Você ainda não pode iniciar conversas.'
                 : 'Ninguém disponível para conversar.'}
              </p>
              {!busca.trim() && niveis.length === 0 && (
                <p className="text-[11px] text-muted-foreground/70 mt-1.5 leading-relaxed">
                  Você recebe e responde normalmente — só não consegue começar
                  uma conversa nova. Quem libera isso é o administrador, no
                  painel de permissões.
                </p>
              )}
            </div>
          )}
          {pessoas.map(p => (
            <button
              key={p.perfil_id}
              onClick={() => { onEscolher(p); onFechar(); }}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/60 transition-colors text-left"
            >
              <AvatarChat nome={p.nome} foto={p.foto_url} tamanho={34}
                          online={online.has(p.perfil_id)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-tight flex items-center gap-1.5">
                  <span className="truncate">{p.nome}</span>
                  <TagEmpresa slug={p.multiempresa ? null : p.empresa_slug} />
                </p>
                <p className="text-[11px] text-muted-foreground truncate leading-tight">
                  {[p.setor_nome, p.equipe_nome].filter(Boolean).join(' · ') || p.usuario}
                </p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
