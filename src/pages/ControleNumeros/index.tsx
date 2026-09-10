/**
 * Controle de Números — a área do Núcleo de Inteligência e Gestão.
 *
 * ## As três abas, e por que são três
 *
 *   Celulares    o aparelho e os números dentro dele. É a visão de quem está
 *                com o celular na mão cadastrando chip.
 *   Números      a lista plana, com filtro por situação e por onde o número
 *                está. É a visão de quem vai liberar, ou de quem procura um
 *                número específico.
 *   Configuração qual setor é o Núcleo. Só aparece com `numeros_configurar`.
 *
 * As duas primeiras mostram o MESMO dado por recortes diferentes — não são
 * telas distintas, são perguntas distintas sobre a mesma lista.
 *
 * ## O aviso de relançados vem primeiro
 *
 * Número que voltou de um setor é a única coisa aqui que alguém está esperando.
 * Ele aparece no topo, antes das abas, porque enterrá-lo numa lista de duzentos
 * faria o Núcleo descobrir o banimento pelo líder cobrando, não pela tela.
 *
 * ## O que esta tela NÃO decide
 *
 * Nada sobre acesso. Quem chega aqui passou por `ProtectedRoute`
 * (`ver_controle_numeros`) e pela RLS, que só entrega linha para quem está no
 * setor apontado em `numeros_config`. As chaves abaixo decidem quais BOTÕES
 * existem, não quais dados chegam.
 */
import { useMemo, useState } from 'react';
import { Smartphone, Hash, Settings, AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useSetoresEquipes } from '@/hooks/useSetoresEquipes';
import { useControleNumeros, type CelularComNumeros } from '@/hooks/useControleNumeros';
import { HistoricoNumero } from '@/components/numeros/HistoricoNumero';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import { MOTIVO_LABELS } from '@/services/numeros/numerosRegras';
import { ListaCelulares } from './ListaCelulares';
import { ListaNumeros } from './ListaNumeros';
import { DialogoCelular } from './DialogoCelular';
import { DialogoNumero } from './DialogoNumero';
import { PainelConfiguracao } from './PainelConfiguracao';

export default function ControleNumeros() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao, temPermissaoExplicita } = useCargoPermissoes();
  const { setores } = useSetoresEquipes();

  const {
    config, aparelhos, numeros, relancados, celulares, loading, erro, recarregar,
  } = useControleNumeros();

  const [celularEmEdicao, setCelularEmEdicao] = useState<CelularComNumeros | null>(null);
  const [celularAberto, setCelularAberto]     = useState(false);
  const [aparelhoDoNumero, setAparelhoDoNumero] = useState<CelularComNumeros | null>(null);
  const [historico, setHistorico] = useState<{ id: string; numero: string } | null>(null);

  const podeAdministrar = temPermissao('numeros_administrar');
  const podeLiberar     = temPermissao('numeros_liberar_ao_setor');
  // Concessão nominal: o acesso total do administrador não concede esta.
  const podeConfigurar  = temPermissaoExplicita('numeros_configurar');

  const autor = perfil ? { id: perfil.id, nome: perfil.nome } : null;
  const empresaId = empresa?.id ?? '';

  const nomeDoSetor = useMemo(() => {
    const mapa = new Map(setores.map(s => [s.id, s.nome]));
    return (id: string) => mapa.get(id) ?? 'Setor removido';
  }, [setores]);

  const nomeDoCelular = useMemo(() => {
    const mapa = new Map(celulares.map(c => [c.id, c.identificacao]));
    return (id: string) => mapa.get(id) ?? '—';
  }, [celulares]);

  if (loading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Controle de Números</h1>
        <p className="text-sm text-muted-foreground">
          Celulares, números de WhatsApp, aquecimento e liberação aos setores.
        </p>
      </header>

      {erro && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{erro}</CardContent>
        </Card>
      )}

      {relancados.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="space-y-2 py-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {relancados.length}{' '}
              {relancados.length === 1
                ? 'número voltou de um setor e espera tratamento'
                : 'números voltaram dos setores e esperam tratamento'}
            </div>
            <ul className="space-y-1 text-sm">
              {relancados.map(n => (
                <li key={n.id} className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="font-mono underline-offset-2 hover:underline"
                    onClick={() => setHistorico({ id: n.id, numero: n.numero })}
                  >
                    {mascararNumero(n.numero)}
                  </button>
                  <span className="text-muted-foreground">
                    {nomeDoSetor(n.setor_id)}
                    {n.motivo_retorno ? ` · ${MOTIVO_LABELS[n.motivo_retorno]}` : ''}
                    {n.observacao_retorno ? ` · ${n.observacao_retorno}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="celulares">
        <TabsList>
          <TabsTrigger value="celulares">
            <Smartphone className="mr-1.5 h-4 w-4" /> Celulares
          </TabsTrigger>
          <TabsTrigger value="numeros">
            <Hash className="mr-1.5 h-4 w-4" /> Números
          </TabsTrigger>
          {podeConfigurar && (
            <TabsTrigger value="configuracao">
              <Settings className="mr-1.5 h-4 w-4" /> Configuração
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="celulares" className="mt-4">
          <ListaCelulares
            aparelhos={aparelhos}
            nomeDoSetor={nomeDoSetor}
            podeAdministrar={podeAdministrar}
            onNovoCelular={() => { setCelularEmEdicao(null); setCelularAberto(true); }}
            onEditarCelular={a => { setCelularEmEdicao(a); setCelularAberto(true); }}
            onNovoNumero={setAparelhoDoNumero}
            onVerHistorico={(id, numero) => setHistorico({ id, numero })}
          />
        </TabsContent>

        <TabsContent value="numeros" className="mt-4">
          <ListaNumeros
            numeros={numeros}
            nomeDoSetor={nomeDoSetor}
            nomeDoCelular={nomeDoCelular}
            podeAdministrar={podeAdministrar}
            podeLiberar={podeLiberar}
            onMudou={() => void recarregar()}
            onVerHistorico={(id, numero) => setHistorico({ id, numero })}
          />
        </TabsContent>

        {podeConfigurar && (
          <TabsContent value="configuracao" className="mt-4">
            <PainelConfiguracao
              empresaId={empresaId}
              setores={setores}
              config={config}
              autor={autor}
              onSalvo={() => void recarregar()}
            />
          </TabsContent>
        )}
      </Tabs>

      <DialogoCelular
        aberto={celularAberto}
        empresaId={empresaId}
        setores={setores}
        celular={celularEmEdicao?.celular ?? null}
        quantidadeNumeros={celularEmEdicao?.numeros.length ?? 0}
        autor={autor}
        onFechar={() => setCelularAberto(false)}
        onSalvo={() => void recarregar()}
      />

      <DialogoNumero
        aberto={aparelhoDoNumero !== null}
        empresaId={empresaId}
        aparelho={aparelhoDoNumero}
        setorNome={aparelhoDoNumero ? nomeDoSetor(aparelhoDoNumero.celular.setor_id) : undefined}
        autor={autor}
        onFechar={() => setAparelhoDoNumero(null)}
        onSalvo={() => void recarregar()}
      />

      <HistoricoNumero
        numeroId={historico?.id ?? null}
        numero={historico?.numero}
        onFechar={() => setHistorico(null)}
      />
    </div>
  );
}
