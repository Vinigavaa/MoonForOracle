# Geração automática de versões

As versões do Moon for Oracle são preparadas pelo Release Please e publicadas pelo GitHub Actions.
Não é mais necessário alterar a versão, criar tags, gerar o instalador ou anexar arquivos manualmente.

## Fluxo normal

1. Faça commits seguindo o padrão Conventional Commits:

   - `fix: corrige falha ao conectar` gera uma versão patch, por exemplo `1.3.8` → `1.3.9`.
   - `feat: adiciona pastas nas conexões` gera uma versão minor, por exemplo `1.3.8` → `1.4.0`.
   - Um commit com `!` ou `BREAKING CHANGE` gera uma versão major, por exemplo `1.3.8` → `2.0.0`.

2. Envie os commits para a branch `main`.

3. O workflow `Release` criará ou atualizará uma pull request com título semelhante a
   `chore: release 1.4.0`. Essa PR contém:

   - a nova versão em `apps/desktop/package.json`;
   - a nova versão em `.release-please-manifest.json`;
   - o `CHANGELOG.md` atualizado.

4. Revise e faça merge da PR de release.

5. Após o merge, o mesmo workflow executará automaticamente:

   - criação da tag `v<versão>`;
   - criação da GitHub Release;
   - compilação no runner `windows-latest`;
   - geração do instalador NSIS;
   - validação de `latest.yml`;
   - envio do `.exe`, `.exe.blockmap` e `latest.yml` para a Release.

## Arquivos publicados

Para uma versão `1.4.0`, a Release deve conter:

- `MoonForOracle-1.4.0-win-x64.exe`
- `MoonForOracle-1.4.0-win-x64.exe.blockmap`
- `latest.yml`

Esses três arquivos são necessários para o instalador e para o auto-updater do aplicativo.

## Execução manual do workflow

Em caso de necessidade, abra `GitHub → Actions → Release → Run workflow`.
A execução manual não força uma nova versão: ela apenas processa commits convencionais que ainda
não estejam em uma Release.

## Permissões necessárias no repositório

Em `Settings → Actions → General`:

- habilite `Read and write permissions` em `Workflow permissions`;
- habilite `Allow GitHub Actions to create and approve pull requests`;
- permita `actions/*`, `pnpm/action-setup` e `googleapis/release-please-action`, ou permita todas as actions.

Não é necessário manter um token pessoal: o workflow utiliza `GITHUB_TOKEN`.
