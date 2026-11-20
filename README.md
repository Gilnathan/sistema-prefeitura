# Portal de Demandas — Prefeitura de Belmonte

Aplicação web monolítica (**Next.js 14 App Router**) pronta para deploy único na **Vercel**, utilizando **Firebase Firestore (`firebase-admin`)** para dados textuais e **Google Drive API v3 (Resumable Upload em Chunks direto do navegador)** para fotos e vídeos pesados com **zero tráfego de mídia no servidor**.

---

## Arquitetura & Stack

- **Frontend & Backend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Shadcn/UI (Radix UI), Lucide Icons, Sonner
- **Banco de Dados:** Firebase Firestore via SDK oficial do servidor `firebase-admin` (`lib/firebase-admin.ts`), coleções `users`, `secretarias`, `eventos`, `midias`
- **Autenticação & RBAC:** NextAuth.js (Credentials Provider + `bcryptjs` + JWT) validando diretamente na coleção `users` do Firestore, com perfis `ADMIN` e `SECRETARIA`
- **Storage Headless (Zero Banda na Vercel):**
  1. `POST /api/drive/init-upload` recebe apenas JSON de metadados (~200 bytes), garante a hierarquia `Secretaria / Ano / MM - Mês / YYYY-MM-DD - Título` e inicia a sessão resumable com header `Origin` para CORS.
  2. O navegador envia os bytes diretamente para a `uploadUrl` do Google Drive em **chunks de 8 MB (`Content-Range`)** com retry automático e barra de progresso real (suportando vídeos de 300 MB – 500 MB+ sem atingir o limite de 4,5 MB da Vercel).
  3. `POST /api/drive/finalize-upload` recebe apenas o `driveFileId`, aplica permissão pública `anyone` (`reader`) e grava na coleção `midias` do Firestore.
- **Relatórios Mensais:** Exportação em PDF (`jsPDF` + `jspdf-autotable`) e CSV/Excel UTF-8 (Admin vê todas ou filtra por secretaria; Secretaria vê apenas seus próprios dados).

---

## Como Configurar e Executar

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar `.env`
Copie `.env.example` para `.env` e preencha:
- **Firebase Admin SDK:** `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (obtidos em *Firebase Console → Configurações do Projeto → Contas de serviço → Gerar nova chave privada*).
- **NextAuth:** `NEXTAUTH_URL` e `NEXTAUTH_SECRET`.
- **Google Drive OAuth2:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`.
- **Seed:** `SEED_SECRET`.

### 3. Popular o Firestore (Seed Inicial — ADMIN + 10 Secretarias)
**Localmente via CLI:**
```bash
npm run db:seed
```

**Ou em produção (Vercel) via rota protegida:**
```bash
curl -X POST https://SEU-DOMINIO.vercel.app/api/seed \
  -H "x-seed-secret: SEU_SEED_SECRET"
```

### 4. Rodar em desenvolvimento
```bash
npm run dev
```

### 5. Deploy na Vercel
1. Conecte o repositório na Vercel (Framework Preset: **Next.js**).
2. Configure todas as variáveis do `.env.example` em *Project Settings → Environment Variables*.
3. Faça o deploy e chame `POST /api/seed` com o header `x-seed-secret` para criar o ADMIN e as 10 secretarias iniciais.
