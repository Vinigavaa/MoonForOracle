# Resumo do Projeto

## O que e o projeto

O GavaDB, empacotado como **Moon For Oracle**, e uma ferramenta desktop para gerenciamento de bancos de dados Oracle. A proposta e oferecer uma experiencia semelhante a clientes SQL como TOAD, com foco em conexao com Oracle, execucao de comandos SQL, navegacao por objetos do banco e visualizacao/edicao de resultados em uma interface desktop.

O projeto e construido como um monorepo TypeScript e separado em aplicacao desktop, interface React e pacotes compartilhados. Essa divisao permite manter a camada visual, a comunicacao IPC, os tipos de dominio e o acesso ao Oracle em modulos independentes.

## Como atua

A aplicacao roda como um app Electron. O usuario interage com a interface React, mas as operacoes sensiveis, como conexao ao banco, execucao de SQL, leitura de arquivos TNS, exportacao e atualizacao da aplicacao, acontecem no processo principal do Electron.

O fluxo principal de uma query e:

```text
Interface React
  -> hooks e componentes do editor SQL
  -> API segura exposta no preload via window.gavadb
  -> IPC do Electron
  -> use cases do processo desktop
  -> OracleRepository
  -> node-oracledb
  -> Banco Oracle
```

Principais capacidades do produto:

- Conectar em bancos Oracle por host/porta/service name ou via aliases TNS.
- Salvar, listar, favoritar e reutilizar conexoes.
- Executar SQL no editor com suporte a consultas, DML, DDL e blocos PL/SQL.
- Executar multiplos statements em lote.
- Inferir parametros bind usados nas queries.
- Listar objetos do schema atual, como tabelas, views, triggers, packages, procedures e functions.
- Abrir detalhes de objetos e visualizar SQL relacionado.
- Exibir resultados em grade com paginacao.
- Atualizar linhas inline quando a query for editavel e possuir chave primaria no resultado.
- Controlar transacoes com commit e rollback.
- Exportar resultados de consultas para CSV ou XLSX.
- Oferecer autocomplete e recursos de edicao SQL usando CodeMirror.
- Gerenciar tema/preferencias da interface.
- Verificar, baixar e instalar atualizacoes via electron-updater.

## Arquitetura

O repositorio segue uma estrutura de monorepo:

```text
apps/
  desktop/       Processo principal do Electron, preload, IPC, use cases e servicos nativos
  renderer/      Interface React, editor SQL, sidebar, abas, grade de resultados e dialogs

packages/
  types/         Tipos compartilhados de conexao, query, erro, exportacao e dominio
  ipc-contract/  Contrato tipado dos canais IPC entre renderer e main process
  oracle/        Repositorio de acesso Oracle usando node-oracledb
  utils/         Utilitarios de SQL, binds, escopo e referencias de objetos
```

A camada `renderer` nao acessa o Oracle diretamente. Ela chama metodos da API `window.gavadb`, exposta pelo `preload` com `contextBridge`. O processo `desktop` recebe essas chamadas por IPC, executa os casos de uso e delega o acesso ao banco ao pacote `@gavadb/oracle`.

Essa separacao melhora o isolamento entre UI e operacoes nativas, reduz acoplamento e preserva contratos tipados entre as camadas.

## Tecnologias usadas

- **TypeScript** como linguagem principal do monorepo.
- **Electron** para criar a aplicacao desktop.
- **React** e **React DOM** para a interface.
- **Vite** para desenvolvimento e build do renderer.
- **CodeMirror** para o editor SQL, autocomplete e recursos de edicao.
- **node-oracledb / oracledb** para comunicacao com Oracle Database.
- **PNPM Workspaces** para gerenciar os pacotes do monorepo.
- **Turbo** para orquestrar builds, typecheck, lint e tarefas entre apps/pacotes.
- **tsup** para empacotar o processo desktop.
- **electron-builder** para gerar pacote e instalador Windows.
- **electron-updater** para atualizacoes automaticas publicadas via GitHub Releases.
- **lucide-react** para icones da interface.
- **shx, concurrently e wait-on** como ferramentas auxiliares de scripts.

## Pontos tecnicos importantes

- O projeto exige **Node.js 20 ou superior** e **pnpm 9 ou superior**.
- O app desktop e distribuido para Windows com instalador NSIS.
- O produto final usa o nome **Moon For Oracle** e o identificador `com.moonfororacle.app`.
- O acesso ao Oracle fica centralizado no `OracleRepository`.
- Os canais IPC ficam padronizados no pacote `@gavadb/ipc-contract`.
- Operacoes de mutacao inline usam validacao de identificadores, chave primaria e controle transacional.
- Exportacoes sao processadas em paginas para lidar melhor com resultados maiores.

## Objetivo pratico

Na pratica, o projeto busca entregar um cliente Oracle desktop moderno para desenvolvedores, analistas e usuarios tecnicos que precisam consultar schemas, executar scripts SQL, revisar dados, fazer pequenas edicoes controladas e exportar resultados sem depender de ferramentas pesadas ou pouco integradas ao fluxo atual de desenvolvimento.
