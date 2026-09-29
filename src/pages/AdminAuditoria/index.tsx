/**
 * Administração › Auditoria — o que mudou e quem está usando.
 *
 * Era Configurações › Logs, e o pior caminho do sistema tinha cinco níveis:
 * Configurações › Logs › Monitoramento de uso › Sem acesso › Nunca acessaram.
 * Desde o Mapa de Abas (29/09/2026) são dois: Auditoria › Uso por pessoa, com
 * «sem acesso» virando filtro da lista.
 *
 * As chaves são as de antes: `ver_logs` para a trilha e
 * `ver_monitoramento_uso` para as três abas de uso — duas travas, porque são
 * duas perguntas sobre dados diferentes (ver o cabeçalho de `AdminLogs`).
 *
 * Uma instância de `AdminLogs` desenha as quatro abas: a lista de empresas e a
 * trilha carregada não se perdem ao trocar de aba.
 */
import { lazy, Suspense } from 'react';
import { ClipboardList, Activity, Users, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { TelaComAbas, type AbaDaTela } from '@/components/TelaComAbas';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import type { AbaAuditoria } from '@/pages/AdminLogs';

const AdminLogs = lazy(() => import('@/pages/AdminLogs'));

export default function AdminAuditoria() {
  const { temPermissao, loading } = useCargoPermissoes();
  const trilha = temPermissao('ver_logs');
  const uso = temPermissao('ver_monitoramento_uso');

  const render = (a: string) => (
    <Suspense fallback={<div className="p-6"><Skeleton className="h-64 w-full rounded-xl" /></div>}>
      <AdminLogs aba={a as AbaAuditoria} />
    </Suspense>
  );

  const lista: AbaDaTela[] = [
    { chave: 'trilha',  rotulo: 'Trilha',          Icon: ClipboardList,     visivel: trilha, instancia: 'logs', render },
    { chave: 'uso',     rotulo: 'Uso por tela',    Icon: Activity,          visivel: uso,    instancia: 'logs', render },
    { chave: 'pessoas', rotulo: 'Uso por pessoa',  Icon: Users,             visivel: uso,    instancia: 'logs', render },
    { chave: 'adocao',  rotulo: 'Adoção',          Icon: MonitorSmartphone, visivel: uso,    instancia: 'logs', render },
  ];

  return (
    <TelaComAbas
      titulo="Auditoria"
      descricao="Trilha de tudo que muda no sistema e monitoramento de uso das telas"
      Icon={ShieldCheck}
      abas={lista}
      carregando={loading}
    />
  );
}
