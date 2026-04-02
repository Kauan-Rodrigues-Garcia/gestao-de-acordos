/**
 * src/components/SeedSetores.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Componente de inicialização automática dos setores padrão.
 * Exibido na tela AdminSetores quando nenhum setor existe.
 * Realiza o seed quando o admin clica no botão.
 */
import { useState } from 'react';
import { AlertCircle, Building2, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { seedSetoresIniciais, SETORES_INICIAIS } from '@/services/setores.service';
import { useEmpresa } from '@/hooks/useEmpresa';
import { toast } from 'sonner';

interface Props {
  onSeedComplete: () => void;
}

export default function SeedSetores({ onSeedComplete }: Props) {
  const { empresa } = useEmpresa();
  const [loading, setLoading]   = useState(false);
  const [resultado, setResultado] = useState<{ inseridos: number; erros: string[] } | null>(null);

  async function executarSeed() {
    if (!empresa?.id) {
      toast.error('Tenant do site não carregado.');
      return;
    }
    setLoading(true);
    try {
      const res = await seedSetoresIniciais(empresa.id);
      setResultado({ inseridos: res.inseridos, erros: res.erros });
      if (res.erros.length === 0) {
        toast.success(`${res.inseridos} setor(es) cadastrado(s) com sucesso!`);
        setTimeout(() => onSeedComplete(), 1200);
      } else {
        toast.error(`Erros ao inserir alguns setores. Verifique as permissões.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao cadastrar setores');
    } finally {
      setLoading(false);
    }
  }

  if (resultado && resultado.erros.length === 0) {
    return (
      <Card className="border-success/30 bg-success/5">
        <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="w-8 h-8 text-success" />
          <p className="font-semibold text-success">{resultado.inseridos} setor(es) cadastrado(s)!</p>
          <p className="text-xs text-muted-foreground">Recarregando a lista...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-warning/15 flex items-center justify-center">
          <Building2 className="w-6 h-6 text-warning" />
        </div>
        <div>
          <p className="font-semibold text-foreground mb-1">Nenhum setor cadastrado</p>
          <p className="text-sm text-muted-foreground">
            Clique abaixo para criar automaticamente os {SETORES_INICIAIS.length} setores padrão do sistema:
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {SETORES_INICIAIS.map(s => (
            <span key={s.nome} className="px-2 py-0.5 bg-background border border-border rounded text-xs font-medium">
              {s.nome}
            </span>
          ))}
        </div>
        {resultado?.erros && resultado.erros.length > 0 && (
          <div className="w-full p-3 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive text-left">
            <div className="flex items-center gap-1.5 font-semibold mb-1">
              <AlertCircle className="w-3.5 h-3.5" /> Erros encontrados:
            </div>
            {resultado.erros.map((e, i) => <p key={i}>{e}</p>)}
            <p className="mt-1 text-muted-foreground">
              Verifique se você está logado como administrador e se as permissões do banco estão corretas.
            </p>
          </div>
        )}
        <Button onClick={executarSeed} disabled={loading} className="gap-2 min-w-[200px]">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
          {loading ? 'Criando setores...' : 'Criar Setores Padrão'}
        </Button>
      </CardContent>
    </Card>
  );
}
