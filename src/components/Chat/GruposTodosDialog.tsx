/**
 * GruposTodosDialog.tsx — «Gerenciar grupos»: todos os grupos do chat, para
 * o super admin administrar (29/10/2026).
 *
 * Pedido do Kauan: o super admin coloca e tira gente, troca foto e nome de
 * QUALQUER grupo, inclusive de um em que nem está. Escolher um grupo aqui abre
 * o mesmo `ConfigGrupoDialog` de sempre, no modo super admin.
 *
 * Administrar não é ler: a lista traz nome, foto e quantos estão dentro, e o
 * painel traz os membros — nenhuma mensagem. A conversa de quem não está no
 * grupo continua fechada pelas policies (ver a migration 20261029140000).
 */
import { useEffect, useState } from 'react';
import { Loader2, Search, Users, Lock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { listarTodosOsGrupos, type GrupoDoSistema } from '@/services/chat/grupos.service';
import { AvatarChat } from './comum';
import { casaBusca, chaveDeBusca, palavrasDaBusca } from './busca';
import { ConfigGrupoDialog } from './ConfigGrupoDialog';

interface Props {
  aberto:   boolean;
  meuId:    string;
  onFechar: () => void;
  /** Algo mudou num grupo: a lista de conversas lá fora pode precisar reler. */
  onMudou:  () => void;
}

export function GruposTodosDialog({ aberto, meuId, onFechar, onMudou }: Props) {
  const [grupos, setGrupos] = useState<GrupoDoSistema[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [escolhido, setEscolhido] = useState<GrupoDoSistema | null>(null);

  const recarregar = () => {
    setCarregando(true);
    void listarTodosOsGrupos().then(r => {
      setGrupos(r.grupos);
      setErro(r.erro);
      setCarregando(false);
      // O painel aberto acompanha a foto e o nome que acabaram de mudar.
      setEscolhido(atual => (atual ? r.grupos.find(g => g.id === atual.id) ?? null : null));
    });
  };

  useEffect(() => {
    if (!aberto) return;
    setBusca('');
    setEscolhido(null);
    recarregar();
  }, [aberto]);

  const palavras = palavrasDaBusca(busca);
  const visiveis = palavras.length
    ? grupos.filter(g => casaBusca(chaveDeBusca(g.nome), palavras))
    : grupos;

  return (
    <>
      <Dialog open={aberto && !escolhido} onOpenChange={o => { if (!o) onFechar(); }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Gerenciar grupos
            </DialogTitle>
            <DialogDescription className="text-xs">
              Todos os grupos do chat. Como super admin você coloca e tira pessoas, troca a foto
              e o nome de qualquer um — sem ler as mensagens dos grupos em que não está.
            </DialogDescription>
          </DialogHeader>

          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar grupo pelo nome…"
              className="h-8 pl-7 text-sm"
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
            {carregando ? (
              <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
              </p>
            ) : erro ? (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{erro}</p>
            ) : visiveis.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {busca.trim() ? 'Nenhum grupo com esse nome.' : 'Ainda não há grupos.'}
              </p>
            ) : visiveis.map(g => (
              <button
                key={g.id} type="button" onClick={() => setEscolhido(g)}
                className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left hover:bg-muted/50"
              >
                <AvatarChat nome={g.nome} foto={g.foto_url} tamanho={32} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm leading-tight">
                    <span className="truncate">{g.nome}</span>
                    {g.somente_lideranca && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Só a liderança escreve" />}
                  </span>
                  <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                    {g.participantes} {g.participantes === 1 ? 'participante' : 'participantes'}
                    {g.sou_parte ? ' · você está nele' : ' · você não está nele'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {escolhido && (
        <ConfigGrupoDialog
          aberto={aberto}
          conversa={{
            id: escolhido.id,
            outro_nome: escolhido.nome,
            outro_foto: escolhido.foto_url,
            somente_lideranca: escolhido.somente_lideranca,
            sou_admin: false,
            sai: false,
          }}
          meuId={meuId}
          superAdmin
          deFora={!escolhido.sou_parte}
          // Fechar o painel volta para a lista, não fecha tudo.
          onFechar={() => setEscolhido(null)}
          onMudou={() => { recarregar(); onMudou(); }}
          onSai={() => setEscolhido(null)}
          onApagar={() => setEscolhido(null)}
        />
      )}
    </>
  );
}
