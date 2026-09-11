/**
 * Controle de Números — a área do Núcleo de Inteligência e Gestão.
 *
 * ## As três abas, e por que são três
 *
 *   Celulares    o aparelho e os números dentro dele, com o cadastro e as
 *                correções. É a visão de quem está com o celular na mão.
 *   Números      os mesmos números, agrupados pelo aparelho, com filtro por
 *                celular, situação e posse, e com as ações do fluxo — tratar,
 *                encerrar, etiquetar, liberar. É a visão de quem trabalha o
 *                acervo.
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
 * O aviso conta só o que ninguém pegou ainda. Tratar e liberar são passos
 * SEPARADOS desde a migration 20260910210000: o Núcleo mexe na situação quantas
 * vezes precisar, encerra o tratamento quando terminou, e libera depois — antes,
 * lançar de volta ao setor era a única forma de tirar o «Voltou: Banido» da
 * tela, e o tratamento acontecia com o número já fora das mãos.
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
import { useControleNumeros, type CelularComNumeros } from '@/hooks/useControleNumeros';
import { HistoricoNumero } from '@/components/numeros/HistoricoNumero';
import { DialogoExcluirNumero } from '@/components/numeros/DialogoExcluirNumero';
import { DialogoExcluirCelular } from '@/components/numeros/DialogoExcluirCelular';
import { EtiquetaTratamento } from '@/components/numeros/EtiquetasNumero';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import { MOTIVO_LABELS, esperaTratamento } from '@/services/numeros/numerosRegras';
import type { NumeroRow } from '@/services/numeros/numeros.service';
import { ListaCelulares } from './ListaCelulares';
import { ListaNumeros } from './ListaNumeros';
import { DialogoCelular } from './DialogoCelular';
import { DialogoNumero } from './DialogoNumero';
import { PainelConfiguracao } from './PainelConfiguracao';

export default function ControleNumeros() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao, temPermissaoExplicita } = useCargoPermissoes();

  const {
    config, setores, nomeDoSetor, aparelhos, relancados, loading, erro, recarregar,
  } = useControleNumeros();

  const [celularEmEdicao, setCelularEmEdicao] = useState<CelularComNumeros | null>(null);
  const [celularAberto, setCelularAberto]     = useState(false);
  const [celularParaExcluir, setCelularParaExcluir] = useState<CelularComNumeros | null>(null);
  const [historico, setHistorico] = useState<{ id: string; numero: string } | null>(null);

  /*
   * Cadastrar e corrigir usam o MESMO diálogo, e por isso um estado só.
   *
   * `numero: null` = cadastro novo naquele aparelho; `numero` preenchido =
   * correção. Dois estados separados abririam a porta para os dois estarem
   * abertos ao mesmo tempo, com dois diálogos empilhados.
   */
  const [dialogoNumero, setDialogoNumero] =
    useState<{ aparelho: CelularComNumeros; numero: NumeroRow | null } | null>(null);
  const [numeroParaExcluir, setNumeroParaExcluir] =
    useState<{ aparelho: CelularComNumeros; numero: NumeroRow } | null>(null);

  const podeAdministrar = temPermissao('numeros_administrar');
  const podeLiberar     = temPermissao('numeros_liberar_ao_setor');
  // Concessão nominal: o acesso total do administrador não concede esta.
  const podeConfigurar  = temPermissaoExplicita('numeros_configurar');

  const autor = perfil ? { id: perfil.id, nome: perfil.nome } : null;
  const empresaId = empresa?.id ?? '';

  /*
   * O aviso do topo mostra só o que ninguém pegou ainda.
   *
   * `relancados` (do hook) traz tudo o que voltou de um setor, inclusive o que
   * já está sendo tratado. Um número em que alguém está trabalhando não é mais
   * uma pendência — deixá-lo no aviso faria a contagem nunca baixar enquanto o
   * tratamento durasse, e o aviso perderia a serventia de ser uma fila.
   */
  const aguardando = useMemo(
    () => relancados.filter(n => esperaTratamento({
      situacao: n.situacao, posse: n.posse,
      operadorId: n.operador_id, tratamento: n.tratamento,
    })),
    [relancados],
  );
  const emTratamento = relancados.length - aguardando.length;

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
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {aguardando.length > 0 ? (
                <>
                  {aguardando.length}{' '}
                  {aguardando.length === 1
                    ? 'número voltou de um setor e espera tratamento'
                    : 'números voltaram dos setores e esperam tratamento'}
                </>
              ) : (
                <>Nada esperando — o que voltou já está sendo tratado</>
              )}
              {emTratamento > 0 && (
                <span className="font-normal text-muted-foreground">
                  · {emTratamento} em tratamento
                </span>
              )}
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
                  <EtiquetaTratamento tratamento={n.tratamento} />
                  <span className="text-muted-foreground">
                    {nomeDoSetor(n.setor_id)}
                    {n.motivo_retorno ? ` · ${MOTIVO_LABELS[n.motivo_retorno]}` : ''}
                    {n.observacao_retorno ? ` · ${n.observacao_retorno}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            {/* A frase existe porque a mudança inverteu um hábito: antes, tirar
                o «Voltou: Banido» da tela obrigava a lançar o número de volta ao
                setor. Agora tratar e lançar são passos separados, e quem usava o
                fluxo antigo precisa saber disso sem ter de descobrir. */}
            <p className="text-xs text-muted-foreground">
              Trate cada número na aba <strong>Números</strong> — a situação muda
              a qualquer momento. Só depois de encerrar o tratamento é que ele
              pode ser liberado de volta ao setor.
            </p>
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
            onExcluirCelular={setCelularParaExcluir}
            onNovoNumero={a => setDialogoNumero({ aparelho: a, numero: null })}
            onVerHistorico={(id, numero) => setHistorico({ id, numero })}
            onCorrigirNumero={(a, n) => setDialogoNumero({ aparelho: a, numero: n })}
            onExcluirNumero={(a, n) => setNumeroParaExcluir({ aparelho: a, numero: n })}
          />
        </TabsContent>

        <TabsContent value="numeros" className="mt-4">
          <ListaNumeros
            aparelhos={aparelhos}
            nomeDoSetor={nomeDoSetor}
            podeAdministrar={podeAdministrar}
            podeLiberar={podeLiberar}
            onMudou={() => void recarregar()}
            onVerHistorico={(id, numero) => setHistorico({ id, numero })}
            onCorrigir={(a, n) => setDialogoNumero({ aparelho: a, numero: n })}
            onExcluir={(a, n) => setNumeroParaExcluir({ aparelho: a, numero: n })}
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

      <DialogoExcluirCelular
        aparelho={celularParaExcluir}
        onFechar={() => setCelularParaExcluir(null)}
        onExcluido={() => void recarregar()}
      />

      <DialogoNumero
        aberto={dialogoNumero !== null}
        empresaId={empresaId}
        aparelho={dialogoNumero?.aparelho ?? null}
        numeroEmEdicao={dialogoNumero?.numero ?? null}
        setorNome={
          dialogoNumero ? nomeDoSetor(dialogoNumero.aparelho.celular.setor_id) : undefined
        }
        autor={autor}
        onFechar={() => setDialogoNumero(null)}
        onSalvo={() => void recarregar()}
      />

      <DialogoExcluirNumero
        numero={numeroParaExcluir?.numero ?? null}
        nomeDoCelular={numeroParaExcluir?.aparelho.celular.identificacao}
        onFechar={() => setNumeroParaExcluir(null)}
        onExcluido={() => void recarregar()}
      />

      <HistoricoNumero
        numeroId={historico?.id ?? null}
        numero={historico?.numero}
        onFechar={() => setHistorico(null)}
      />
    </div>
  );
}
