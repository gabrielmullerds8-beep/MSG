# MSG Mineração - Sistema Fiscal

App web para controle fiscal interno da MSG Mineração Serra Geral Ltda.

## Rodar localmente

```bash
pnpm install
pnpm dev
```

## Operação online segura

O app exige Supabase configurado para login, leitura e gravação dos dados. Para publicar com dados compartilhados entre todos os usuários:

1. Crie ou abra o projeto no Supabase.
2. Execute o SQL em `supabase/schema.sql`.
3. Em Authentication > Providers, mantenha o login por e-mail ativo e desative cadastro público de usuários, quando essa opção estiver disponível no painel.
4. Cadastre os usuários somente em Authentication > Users.
5. Copie `.env.example` para `.env` no ambiente local.
6. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
7. Na Vercel, Netlify ou outro host estático, cadastre as mesmas variáveis de ambiente.
8. Publique o app.

Com as variáveis configuradas, o app:

- permite acesso apenas por usuários existentes no Supabase Auth;
- não usa senhas locais antigas;
- não grava notas, cadastros, patrimônio ou configurações em armazenamento local;
- salva os registros nas tabelas do Supabase;
- assina atualizações em tempo real para refletir mudanças feitas por outros usuários;
- verifica `version.json` periodicamente para evitar que navegadores continuem usando uma versão antiga após publicação.

## Regra financeira por CFOP

Em Configurações > Alterar/adicionar > CFOP, marque cada CFOP como “Considerar venda” ou “Considerar custo” quando o valor da nota deve entrar em cards, gráficos, relatórios, DRE, apuração e financeira.

CFOPs sem marcação continuam sendo listados nas telas de notas, mas não entram em cálculos financeiros. Use essa opção para remessas, simbólicas e demais notas sem efeito financeiro.

## Validações antes de publicar

```bash
pnpm typecheck
pnpm build
```

Se o indicador do app mostrar “Sem conexão com Supabase”, confira as variáveis de ambiente, o SQL do banco e se o usuário está confirmado em Authentication > Users.
