# 📷 FotoGestão Pro — Guia de Instalação

## O que você vai precisar
- Conta gratuita no **GitHub** (github.com)
- Conta gratuita no **Vercel** (vercel.com)
- Chave de API da **Anthropic** (console.anthropic.com)

---

## Passo 1 — Criar conta no GitHub
1. Acesse **github.com** e clique em "Sign up"
2. Crie sua conta com email e senha
3. Confirme o email

## Passo 2 — Criar repositório e subir os arquivos
1. No GitHub, clique em **"New repository"**
2. Nome: `fotografia-crm`
3. Deixe como **Public** e clique em **"Create repository"**
4. Clique em **"uploading an existing file"**
5. Arraste todos os arquivos desta pasta (mantendo a estrutura de pastas)
6. Clique em **"Commit changes"**

## Passo 3 — Criar conta no Vercel
1. Acesse **vercel.com** e clique em "Sign Up"
2. Escolha **"Continue with GitHub"** — isso conecta automaticamente
3. Autorize o Vercel

## Passo 4 — Fazer o deploy
1. No Vercel, clique em **"Add New Project"**
2. Selecione o repositório `fotografia-crm`
3. Clique em **"Deploy"** — o Vercel detecta o Vite automaticamente
4. Aguarde ~2 minutos

## Passo 5 — Configurar a chave da IA (OBRIGATÓRIO)
1. Acesse **console.anthropic.com**
2. Vá em **"API Keys"** e crie uma nova chave
3. Copie a chave (começa com `sk-ant-...`)
4. No Vercel, vá em seu projeto → **Settings → Environment Variables**
5. Adicione:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** sua chave copiada
6. Clique em **Save**
7. Vá em **Deployments** e clique em **"Redeploy"**

## Pronto! 🎉
Seu app estará disponível em um link como:
`https://fotografia-crm.vercel.app`

Você pode acessar de qualquer celular, tablet ou computador.

---

## Custo
- GitHub: **Grátis**
- Vercel: **Grátis** (até 100GB de tráfego/mês)
- Anthropic API: **~R$0,01 por conversa com a IA** (cobrado só pelo uso)

---

## Dúvidas?
Pergunte para o Claude no chat — ele te ajuda em qualquer etapa!
