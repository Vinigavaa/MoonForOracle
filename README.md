# GavaDB

Ferramenta desktop para gerenciamento Oracle, construída com Electron, React, TypeScript e `node-oracledb`.

## Pré-requisitos

- `Node.js` >= 20
- `pnpm` >= 9

## Estrutura do monorepo

```text
apps/
  desktop/       Electron main + preload
  renderer/      Interface React

packages/
  types/         Tipos compartilhados
  ipc-contract/  Contrato dos canais IPC
  oracle/        Acesso Oracle via node-oracledb
  utils/         Utilitários compartilhados
```

## Como rodar em desenvolvimento

```bash
pnpm install
pnpm dev
```

Isso sobe:

- o renderer Vite
- o processo Electron
- o build em watch do `desktop`

## Build

```bash
pnpm build
pnpm build:all
```

## Onde e como as queries são executadas

As queries não são executadas no React diretamente. O fluxo real do projeto é este:

```text
SqlEditor (renderer)
  -> useSqlExecution
  -> window.gavadb.dbExecuteQuery(...)
  -> preload (contextBridge + ipcRenderer.invoke)
  -> IPC handler em apps/desktop
  -> use-case
  -> OracleRepository
  -> node-oracledb
  -> Oracle Database
```

Arquivos principais desse fluxo:

- `apps/renderer/src/components/SqlEditor.tsx`
- `apps/renderer/src/hooks/useSqlExecution.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/ipc/handlers.ts`
- `apps/desktop/src/use-cases/query.ts`
- `packages/oracle/src/oracle-repository.ts`

### Execução de SELECT

- O SQL digitado no editor é enviado para `window.gavadb.dbExecuteQuery`.
- O `ipcMain.handle` recebe a requisição no processo principal do Electron.
- O `OracleRepository.executeQuery()` detecta o tipo do statement.
- Se for `SELECT`, a execução vai para `executeSelect()`.
- O resultado usa paginação com limite padrão de `200` linhas e máximo de `500`.
- A consulta é encapsulada para buscar `pageSize + 1` linhas, permitindo saber se existe mais página.
- O retorno inclui colunas, linhas, tempo de execução, `hasMore`, `offset`, `totalFetched` e metadados de edição inline quando aplicável.

### Execução de DML, DDL e PL/SQL

- Se o statement não for `SELECT`, o repositório executa o SQL diretamente com `autoCommit: true`.
- Isso vale para comandos como `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `CREATE`, `ALTER`, `DROP`, `BEGIN ... END`, entre outros.
- Nesses casos, a resposta volta com `rowsAffected` quando o Oracle informar esse valor.

## Como listar as tabelas

A listagem de tabelas não vem de um `SELECT` digitado pelo usuário. Ela é feita por uma chamada dedicada da sidebar:

```text
Sidebar/useObjectList
  -> window.gavadb.dbListObjects("tables")
  -> IPC
  -> useCases.listObjects(...)
  -> OracleRepository.listObjects("tables")
```

O SQL usado para isso fica em `packages/oracle/src/queries.ts` e hoje consulta `all_objects`:

```sql
SELECT object_name AS name, owner AS schema, status
FROM all_objects
WHERE object_type = 'TABLE'
  AND owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
ORDER BY object_name
```

Pontos importantes:

- lista somente objetos do schema atual
- o mesmo mecanismo serve para `views`, `triggers`, `packages`, `procedures` e `functions`
- ao abrir uma tabela, os detalhes das colunas são buscados em `all_tab_columns`

## Como funciona o UPDATE

Existem dois cenários de `UPDATE` no projeto.

### 1. UPDATE digitado manualmente no editor SQL

Se o usuário escrever um SQL como:

```sql
UPDATE CLIENTES
SET NOME = 'NOVO NOME'
WHERE ID = 10;
```

o fluxo passa por `dbExecuteQuery()` e o Oracle executa o comando diretamente com `autoCommit: true`.

### 2. UPDATE inline na grade de resultados

Quando o usuário executa um `SELECT`, o sistema tenta descobrir se o resultado é editável.

Para isso, `OracleRepository.resolveEditableQueryInfo()` valida:

- a query precisa ser um `SELECT` simples
- não pode ter `JOIN`
- não pode ter `GROUP BY`
- não pode ter `DISTINCT`
- não pode ter `UNION`, `INTERSECT` ou `MINUS`
- não pode ter subquery no `FROM`
- precisa apontar para uma única tabela
- a tabela precisa ter chave primária
- as colunas da chave primária precisam estar no resultado

Se essas regras forem atendidas:

- o frontend monta uma lista de `UpdateRowRequest`
- cada item carrega `tableName`, `primaryKey`, `originalValues` e `changes`
- o renderer chama `window.gavadb.dbUpdateRows(...)`
- o `OracleRepository.updateRows()` executa os updates dentro de uma transação
- cada linha gera um SQL no formato:

```sql
UPDATE TABELA
SET COLUNA = :set_0
WHERE PK = :pk_0
```

Regras relevantes:

- o `WHERE` usa a chave primária da tabela
- nomes de tabela e coluna passam por validação com `sanitizeIdentifier`
- o commit só acontece no final de todas as linhas
- se qualquer update falhar, ocorre `rollback`

## Como funciona o DELETE

Também existem dois cenários de `DELETE`.

### 1. DELETE digitado manualmente no editor SQL

Se o usuário escrever um SQL como:

```sql
DELETE FROM CLIENTES
WHERE ID = 10;
```

o comando vai por `dbExecuteQuery()` e é executado diretamente com `autoCommit: true`.

### 2. DELETE pela grade de resultados

Quando a exclusão é feita pela interface de resultados:

- o frontend envia um `DeleteRowsRequest`
- esse request contém `tableName` e uma lista de `primaryKeys`
- o renderer chama `window.gavadb.dbDeleteRows(...)`
- o backend valida a chave primária da tabela
- cada linha gera um SQL no formato:

```sql
DELETE FROM TABELA
WHERE PK = :pk_0
```

Regras relevantes:

- o delete depende de chave primária
- o `WHERE` é montado usando todas as colunas da PK
- o commit acontece ao final
- em caso de erro, ocorre `rollback`

## Resumo rápido

- queries digitadas no editor são executadas no processo `desktop`, não no `renderer`
- o `renderer` apenas envia requisições via IPC
- listagem de tabelas usa consulta interna em `all_objects`
- `UPDATE` e `DELETE` podem ser manuais via SQL ou inline pela grade
- mutações inline exigem chave primária e usam transação com `commit` e `rollback`

## Arquitetura

```text
Renderer Components -> Hooks -> Preload -> IPC Handlers -> Use Cases -> Repository -> Oracle
```
