VOZIA VAULT V8.6 - ESTABILIDADE, SEGURANÇA E LICENÇA

Implementado:
- Backup automático diário.
- Backup automático ao fechar pelo Ctrl+C/SIGTERM.
- Mantém somente os últimos 7 backups.
- Alerta/diagnóstico de último backup no admin.
- Senha admin obrigatória alterável no primeiro acesso.
- Modo TESTE e PRODUÇÃO.
- Sistema de licença local.
- Gravação premium:
  contagem 3 segundos,
  pausar/retomar,
  animação gravando,
  aviso de áudio curto,
  barra visual de volume.
- Página comercial /vendas.html.
- Documentos legais separados em /termos.
- Diagnóstico do sistema.
- Backup completo manual no admin.
- Mantém instalação manual no PC.

Como rodar:
npm install
npm start

Abrir:
http://localhost:3000

Admin:
http://localhost:3000/admin.html

Login inicial admin:
admin@vozia.local
admin123

Páginas:
http://localhost:3000/vendas.html
http://localhost:3000/sobre.html
http://localhost:3000/parceiros.html


V8.1:
- Página principal reestruturada no estilo de plataformas globais de voice banking.
- Incluído benefício: paciente tem direito ao app Vozia Care.
- Botões fixos do Vozia Care usam a própria voz gravada.
- Teclado livre pode usar voz sintética o mais próxima possível do paciente.
- Página /vendas.html atualizada com a mesma proposta comercial.


V8.2:
- Após concluir todas as frases do plano, o paciente pode solicitar a geração do app Vozia Care.
- App Vozia Care incluso: botões fixos com a própria voz gravada.
- Teclado ativo com voz sintética próxima: upgrade mensal, mediante contato.
- Removida explicação de tokens da página principal.
- Contrato/termos atualizados com regra do teclado ativo.
- Página principal ganhou ilustração humanizada de um senhor.
- Admin lista solicitações do app Vozia Care.


V8.3:
- Botões do Vozia Care na página principal agora falam usando voz de teste do navegador/Google.
- Adicionada página /faq.html na barra principal.
- Removida oferta de backup/download direto para usuário.
- Contrato e documentos na página do paciente foram melhorados e ficaram apenas como consulta.
- Contrato inicial de compra/cadastro continua rolável e com aceite obrigatório.
- Política de proteção do cofre ajustada: voz permanece protegida na plataforma.


V8.4:
- Contrato inicial ajustado para remover linguagem antiga de backup.
- Adicionada política de revisão anual todo dia 01 de janeiro.
- Em caso de falecimento informado, contato pelo telefone deixado na plataforma.
- Se houver mensagem de legado em áudio, ela poderá ser disponibilizada ao contato autorizado.
- Área Documentos do Cofre de Voz melhorada e organizada.
- Criado termo /termos/revisao-anual.html.
- Criado termo /termos/protecao-cofre.html.

V8.5:
- Adicionada tela Minha Jornada Vozia.
- Adicionada mensagem de legado prioritária.
- Cadastro agora tem contato autorizado 1 e 2.
- Página Meus dados permite atualizar contatos 1 e 2.
- Status de revisão anual no paciente e admin.
- Admin tem painel de revisão anual dos cofres.
- Relatório imprimível do cofre em /api/report.

V8.6:
- Adicionado Protocolo Vozia.
- Adicionada página /case.html para apresentação de impacto.
- Adicionada página /demo-care.html com simulação do Vozia Care.
- Adicionado roteiro guiado para mensagens de legado.
- Adicionada seção "O que o paciente recebe" na página principal.
- Admin recebeu card de orientação para indicadores de impacto.
