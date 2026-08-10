/**
 * src/pages/AcordoForm/index.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * As duas rotas de tela cheia — `/acordos/novo` e `/acordos/:id/editar`.
 *
 * Este arquivo NÃO tem formulário. Ele é só a moldura de página (cabeçalho,
 * voltar, carregar o acordo na edição) em volta dos MESMOS componentes que a
 * lista de Acordos usa:
 *
 *   criar  → AcordoNovoInline
 *   editar → AcordoEditInline
 *
 * Antes ele carregava a própria implementação de cada um: dois formulários por
 * tenant (FormBP/FormPP), schemas zod próprios, e uma cópia da escada de
 * conflito de NR com os cinco desvios de Direto/Extra. A criação já tinha sido
 * migrada; a edição não, e as duas cópias divergiram — a autenticação de líder
 * daqui barrava elite, gerência e diretoria, e a checagem de NR rodava mesmo
 * quando o Código não tinha mudado.
 *
 * Uma tela por operação, em qualquer lugar do app. A regra de Direto/Extra vive
 * em `conflitoNr.service`, que os dois componentes consomem.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase, type Acordo, type Perfil } from '@/lib/supabase';
import { ROUTE_PATHS } from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { AcordoNovoInline } from '@/components/AcordoNovoInline';
import { AcordoEditInline } from '@/components/AcordoEditInline';

export default function AcordoForm() {
  const { id }   = useParams<{ id: string }>();
  const isEdit   = !!id;
  const { perfil, user, perfilLoading } = useAuth();
  const navigate = useNavigate();
  const tenant   = useTenant();
  const isPP     = tenant.isPaguePlay;

  const [perfilLocal, setPerfilLocal] = useState<Perfil | null>(null);
  const [acordo, setAcordo]           = useState<Acordo | null>(null);
  const [loadingData, setLoadingData] = useState(isEdit);

  // ── Garantir perfil disponível ────────────────────────────────────────
  useEffect(() => {
    if (perfil) { setPerfilLocal(perfil); return; }
    if (!user) return;
    supabase.from('perfis').select('*, setores(id, nome)').eq('id', user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          supabase.from('perfis').select('*').eq('id', user.id).maybeSingle()
            .then(({ data: d2 }) => { if (d2) setPerfilLocal(d2 as Perfil); });
          return;
        }
        if (data) setPerfilLocal(data as Perfil);
      });
  }, [perfil, user]);

  // ── Carregar o acordo na edição ───────────────────────────────────────
  // O join com `perfis` acompanha o que a lista de Acordos entrega ao
  // AcordoEditInline — o componente devolve o acordo atualizado para o pai, e
  // sem o join ele voltaria sem o operador.
  useEffect(() => {
    if (!isEdit || !id) return;
    supabase
      .from('acordos')
      .select('*, perfis(id, nome, email, perfil, setor_id)')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) { toast.error('Erro ao carregar acordo'); navigate(ROUTE_PATHS.ACORDOS); return; }
        if (data) setAcordo(data as Acordo);
        setLoadingData(false);
      });
  }, [id, isEdit, navigate]);

  if (loadingData) return <div className="p-6 text-center text-muted-foreground">Carregando...</div>;
  if (!perfilLocal && perfilLoading) return <div className="p-6 text-center text-muted-foreground">Carregando perfil...</div>;

  const p         = perfilLocal ?? perfil;
  const nomeSetor = (p?.setores as { nome?: string } | undefined)?.nome;
  const voltar    = () => navigate(-1);
  const aposSalvar = () => navigate(isPP ? ROUTE_PATHS.DASHBOARD : ROUTE_PATHS.ACORDOS);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={voltar} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {isEdit ? 'Editar Acordo' : 'Novo Acordo'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="font-medium text-foreground">{p?.nome ?? user?.email}</span>
            {nomeSetor && <span className="text-primary"> · {nomeSetor}</span>}
          </p>
        </div>
      </div>

      {/* Os dois componentes são <tr> — nasceram para a lista de Acordos. A
          tabela de uma coluna é a moldura que permite reaproveitá-los aqui
          sem duplicar o formulário. */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <tbody>
            {isEdit && acordo ? (
              <AcordoEditInline
                acordo={acordo}
                isPaguePlay={isPP}
                colSpan={1}
                onSaved={aposSalvar}
                onCancel={voltar}
              />
            ) : (
              <AcordoNovoInline
                isPaguePlay={isPP}
                colSpan={1}
                onSaved={aposSalvar}
                onCancel={voltar}
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
