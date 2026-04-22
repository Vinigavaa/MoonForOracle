1. Instale a 0.1.0
Primeiro instale o app usando o executável que você baixou da release v0.1.0:

MoonForOracle-0.1.0-win-x64.exe

Depois abra o app uma vez para confirmar que ele funciona. Pode fechar em seguida.

2. Altere a versão para 0.1.1
No arquivo:

apps/desktop/package.json

troque:

"version": "0.1.0"

para:

"version": "0.1.1"

Não precisa mudar a versão do root package.json.

3. Gere os arquivos da 0.1.1
No terminal, na raiz do projeto:

pnpm --filter @gavadb/renderer run build
pnpm --filter @gavadb/desktop run package:installer

Isso vai gerar os arquivos em:

apps/desktop/release/

Você precisa pegar estes 3 arquivos novos:

MoonForOracle-0.1.1-win-x64.exe
MoonForOracle-0.1.1-win-x64.exe.blockmap
latest.yml

Atenção: o latest.yml deve ser o novo, gerado agora para 0.1.1. Abra ele e confirme que aparece:

version: 0.1.1
path: MoonForOracle-0.1.1-win-x64.exe

4. Commit e tag
Agora faça commit da mudança de versão e crie a tag:

git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "Release v0.1.1"
git tag v0.1.1
git push origin main
git push origin v0.1.1

Mesmo com GitHub Actions bloqueado, isso é útil porque a release manual usa a tag v0.1.1.

5. Crie a release manual no GitHub
Vá em:

GitHub -> MoonForOracle -> Releases -> Draft a new release

Preencha:

Tag: v0.1.1
Release title: v0.1.1

Anexe exatamente estes 3 arquivos da pasta apps/desktop/release/:

MoonForOracle-0.1.1-win-x64.exe
MoonForOracle-0.1.1-win-x64.exe.blockmap
Publish release