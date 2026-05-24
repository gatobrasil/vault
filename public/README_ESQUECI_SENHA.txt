# Vozia Vault — Esqueci minha senha

Este pacote adiciona recuperação de senha com Supabase.

## Arquivos

- `index.html`
- `supabase-password.js`
- `reset-password.html`

## Onde colocar

Copie os 3 arquivos para a pasta:

`public/`

Substitua o `index.html` antigo pelo novo.

## Importante no Supabase

Entre em:

Authentication > URL Configuration

Em Redirect URLs, adicione:

`http://localhost:3000/reset-password.html`

Quando colocar online na Vercel, adicione também:

`https://SEU-SITE.vercel.app/reset-password.html`

## Como testar

1. Rode o projeto.
2. Abra `http://localhost:3000`.
3. Clique em Começar.
4. Na área de login, digite o e-mail.
5. Clique em "Esqueci minha senha".
6. Abra o e-mail recebido.
7. Clique no link.
8. Crie a nova senha em `reset-password.html`.
