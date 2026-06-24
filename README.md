# MSG Mineracao - Sistema Fiscal

App web para controle fiscal interno da MSG Mineracao Serra Geral Ltda.

## Rodar localmente

```bash
pnpm install
pnpm dev
```

## Sincronizacao online

O app funciona em modo demonstracao local sem configuracao. Para publicar com dados compartilhados entre todos os usuarios:

1. Crie um projeto no Supabase.
2. Execute o SQL em `supabase/schema.sql`.
3. Copie `.env.example` para `.env`.
4. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
5. Publique em Vercel, Netlify ou outro host estatico.

Com as variaveis configuradas, o app salva registros no Supabase e assina atualizacoes em tempo real.
