/**
 * PainelConfiguracao — qual setor é o Núcleo.
 *
 * ## Uma linha por empresa, e ela decide quem manda no módulo
 *
 * Trocar este setor entrega o Controle de Números inteiro a outro setor: os
 * celulares, os números de todos os setores e as ações sobre eles. Por isso a
 * chave `numeros_configurar` exige concessão nominal — nem administrador a
 * recebe por herança — e por isso a tela avisa o efeito ANTES de salvar, em vez
 * de um seletor que aplica sozinho.
 *
 * ## Sem configuração, ninguém é do Núcleo
 *
 * Falha fechada, e a tela diz isso com todas as letras. É o estado em que o
 * módulo nasce, e alguém precisa saber que é preciso escolher.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { salvarConfigNucleo, type NumerosConfigRow } from '@/services/numeros/numeros.service';

/** O mínimo que um seletor de setor precisa saber. */
export interface SetorOpcao { id: string; nome: string }

export interface PainelConfiguracaoProps {
  empresaId: string;
  /**
   * Só `id` e `nome`: é tudo o que um seletor precisa, e pedir o `Setor`
   * inteiro obrigaria quem chama a carregar colunas que a tela não usa.
   */
  setores: readonly SetorOpcao[];
  config: NumerosConfigRow | null;
  autor?: { id: string; nome: string } | null;
  onSalvo: () => void;
}

export function PainelConfiguracao({
  empresaId, setores, config, autor, onSalvo,
}: PainelConfiguracaoProps) {
  const [setorId, setSetorId] = useState(config?.setor_nucleo_id ?? '');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setSetorId(config?.setor_nucleo_id ?? ''); }, [config]);

  const mudou = setorId !== '' && setorId !== (config?.setor_nucleo_id ?? '');
  const atual = setores.find(s => s.id === config?.setor_nucleo_id)?.nome;
  const escolhido = setores.find(s => s.id === setorId)?.nome;

  async function salvar() {
    setSalvando(true);
    const r = await salvarConfigNucleo(empresaId, setorId, autor?.id, autor?.nome);
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar.'); return; }
    toast.success(`O Núcleo agora é ${escolhido}.`);
    onSalvo();
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Setor do Núcleo</CardTitle>
        <CardDescription>
          Quem pertence a este setor administra o Controle de Números desta
          empresa.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!config && (
          <div className="flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm">
              Nenhum setor está configurado. Enquanto ficar assim,{' '}
              <strong>ninguém</strong> é reconhecido como Núcleo e o módulo não
              abre para nenhum usuário.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="setor-nucleo">Setor</Label>
          <Select value={setorId} onValueChange={setSetorId}>
            <SelectTrigger id="setor-nucleo">
              <SelectValue placeholder="Escolha o setor" />
            </SelectTrigger>
            <SelectContent>
              {setores.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {atual && <p className="text-xs text-muted-foreground">Hoje: {atual}.</p>}
        </div>

        {mudou && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            Ao salvar, <strong>{escolhido}</strong> passa a administrar todos os
            celulares e números de todos os setores
            {atual ? <>, e <strong>{atual}</strong> perde esse acesso</> : null}.
          </div>
        )}

        <Button onClick={() => void salvar()} disabled={!mudou || salvando}>
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}
