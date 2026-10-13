# SIFAU — cópia com galeria de documentos

Esta pasta contém uma cópia sincronizada da versão principal, acrescida do módulo opcional de documentos. Para a aplicação principal, prefira a raiz do repositório.

## Supabase

Em um projeto Supabase novo, execute uma vez `supabase/SETUP_COMPLETO.sql` no SQL Editor. Para um banco existente, aplique somente as migrations pendentes em `supabase/migrations/`, em ordem. A migration `20261012100000_harden_documents.sql` restringe documentos e registros de assinatura ao fiscal proprietário e remove a falsa validação de certificado.

Crie `.env` local copiando `.env.example` e preencha somente a URL do Supabase e a chave pública/anon. Nunca inclua `service_role` em variáveis `VITE_`.

Ocorrências novas sem responsável aparecem na triagem do painel administrativo para atribuição manual a um fiscal ativo; a distribuição automática por região ainda não é oferecida.

## Desenvolvimento

```bash
npm ci
npm run typecheck
npm run lint
npm run dev
```

A galeria guarda arquivos em base64 no banco e limita uploads pela interface a 5 MB. Para volumes de produção, migre os arquivos para Supabase Storage com políticas de bucket antes de ampliar limites. Assinatura manuscrita é apenas imagem; não é validação criptográfica nem assinatura digital qualificada.
