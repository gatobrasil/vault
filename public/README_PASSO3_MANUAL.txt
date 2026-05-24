# Vozia — Passo 3 Manual Supabase

Não consegui alterar seu .7z diretamente aqui. Este pacote traz um arquivo manual para iniciar o Passo 3.

## O que este passo faz

Ele conecta:

- cadastro ao Supabase Auth
- login ao Supabase Auth
- logout ao Supabase Auth
- perfil do paciente à tabela `profiles`

## Como instalar

1. Coloque o arquivo:

`supabase-passo3-login.js`

dentro da pasta:

`public/`

2. Abra:

`public/index.html`

3. No final do arquivo, deixe os scripts assim:

<script src="/phrases.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/supabase-config.js"></script>
<script src="/supabase-api.js"></script>
<script src="/app.js"></script>
<script src="/supabase-passo3-login.js"></script>
</body>
</html>

## Teste

1. Rode o projeto em localhost.
2. Clique em "Começar".
3. Crie uma conta nova.
4. Verifique no Supabase se apareceu:
   - Authentication > Users
   - Table Editor > profiles

## Observação

Para eu devolver o projeto já alterado automaticamente, compacte a pasta como ZIP normal, não como 7z.
