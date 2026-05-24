## V8.10 — Gravação Supabase corrigida

- Corrigido player de áudio após parar gravação.
- Corrigido botão "Aprovar e avançar" sem depender de `/api`.
- Salvamento agora usa `voziaUploadVoiceRecording()` e Supabase Storage.
- Avanço para próxima frase agora recarrega `recordings` do Supabase.
- Adicionado SQL `supabase_v8_10_fix_recordings.sql` para confirmar tabelas, buckets e policies por usuário.
- Banco de voz agora salva por `user_id`, isolando dados de cada paciente cadastrado.

## V8.9 — Index responsivo mobile

- Adicionado botão de menu mobile na home.
- Ajustada a landing page para telas pequenas.
- Corrigidos grids, cards, botões, formulário de login/cadastro e protocolo para celular.
- Melhorada visualização do gravador, mapa de frases e player de áudio no mobile.
- Adicionados breakpoints para 1100px, 820px e 480px.

## V8.8 — Correções gravação, admin Supabase e Vercel estático

- Adicionado cronômetro visual durante gravação do banco de voz.
- Corrigida prévia de áudio após parar gravação.
- Corrigido salvamento de gravação usando Supabase Storage quando disponível.
- Adicionado arquivo `supabase-recording-fix.js`.
- Substituído admin antigo dependente de `/api` por painel admin Supabase.
- Adicionado `supabase_admin_policies.sql` para liberar leitura administrativa ao e-mail autorizado.
- Adicionado `vercel.json` para publicar como site estático na Vercel.


## V8.7 — Protocolo sequencial do paciente

- Adicionado botão central **Iniciar Protocolo** na página do paciente.
- O contrato não é solicitado novamente: considera o aceite feito no cadastro/compra.
- Fluxo automático em sequência:
  1. Consentimento já aceito
  2. Banco de Voz
  3. Mensagens / Legado prioritário
  4. Solicitação do Vozia Care
- A etapa seguinte só aparece conforme o avanço do paciente.
- Banco de Voz, Mensagens e Vozia Care foram integrados ao fluxo principal.
- Adicionado painel visual de status das etapas.

# Changelog Vozia Vault

## V8.6
- Protocolo Vozia.
- Página de case de impacto.
- Demonstração do Vozia Care.
- Roteiro guiado para mensagens de legado.
- Seção comercial: o que o paciente recebe.

# Changelog Vozia Vault

## V8.5
- Minha Jornada Vozia.
- Mensagem de legado prioritária.
- Contato autorizado 1 e 2.
- Status e painel admin de revisão anual.
- Relatório imprimível do cofre.
- Painel de mensagens futuras mais claro.

# Changelog Vozia Vault

## V8.4
- Removida linguagem antiga de backup do contrato inicial.
- Adicionada revisão anual dos cofres ativos em 01 de janeiro.
- Adicionada política de contato com telefone deixado na plataforma em caso de falecimento informado.
- Mensagem de legado em áudio pode ser encaminhada ao contato autorizado, quando existir.
- Documentos do cofre reorganizados e melhorados.

# Changelog Vozia Vault

## V8.3
- Botões demonstrativos do Vozia Care falam com voz do navegador/Google.
- Criada página /faq.html.
- Removida solicitação de backup da tela do paciente.
- Documentos melhorados como consulta, sem novo aceite.
- Política do cofre reforçada: sem exportação direta pelo paciente.

# Changelog Vozia Vault

## V8.2
- Solicitação de geração do app Vozia Care após concluir as gravações.
- Benefício explícito: botões fixos com a voz gravada do paciente.
- Teclado ativo com voz sintética próxima tratado como upgrade mensal.
- Contrato/termos atualizados.
- Página principal mais humana com ilustração de senhor.
- Admin gerencia solicitações do app Vozia Care.

# Changelog Vozia Vault

## V8.1
- Nova página principal com estrutura inspirada em plataformas globais de voice banking.
- Adicionado posicionamento Vozia Care incluso.
- Explicado: botões fixos com voz real salva e teclado com voz sintética próxima.
- Página /vendas.html atualizada.

# Changelog Vozia Vault

## V8
- Backup automático diário e ao fechar.
- Mantém últimos 7 backups.
- Senha admin obrigatória alterável.
- Modo teste/produção.
- Sistema de licença local.
- Gravação com contagem, pausa, retomada, animação e barra de volume.
- Página /vendas.html.
- Termos legais separados.
- Diagnóstico do sistema no admin.
