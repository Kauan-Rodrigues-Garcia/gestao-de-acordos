/**
 * janela.ts — tudo que só existe com a janela do chat ABERTA.
 *
 * A bolha fechada monta em toda página e precisa só do contador de não lidas.
 * A lista, a conversa, o monitor e os diálogos passavam a vir no pacote de
 * entrada junto com ela — perto de 100 KB para quem talvez nem abra o chat.
 *
 * Um arquivo só, e não um `import()` por componente: abrir a janela precisa de
 * várias peças ao mesmo tempo, e um pedaço único é um download só. A
 * `BolhaChat` carrega este módulo sob demanda; não o importe estaticamente em
 * nada que monte com a bolha fechada.
 */
export { ListaConversas } from './ListaConversas';
export { Conversa } from './Conversa';
export { PainelMonitor } from './PainelMonitor';
export { DisparoDialog } from './DisparoDialog';
export { NovaConversaDialog } from './NovaConversaDialog';
export { NovoGrupoDialog } from './NovoGrupoDialog';
export { ConfigGrupoDialog } from './ConfigGrupoDialog';
export { GaleriaDialog } from './GaleriaDialog';
export { BoasVindasChat } from './BoasVindasChat';
