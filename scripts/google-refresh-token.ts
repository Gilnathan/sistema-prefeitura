/**
 * Utilitário CLI para gerar o GOOGLE_DRIVE_REFRESH_TOKEN via OAuth2 (usando fetch nativo).
 * Uso:
 *   1. Preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env
 *   2. Execute: npm run google:token
 *   3. Abra a URL exibida no navegador com a conta Google da agência
 *   4. Cole o parâmetro `code` retornado para obter o REFRESH_TOKEN
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawVal = trimmed.slice(eq + 1).trim();
    const val = rawVal.replace(/^"(.*)"$/, "$1");
    if (!process.env[key]) process.env[key] = val;
  }
}

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = "https://developers.google.com/oauthplayground";

if (!clientId || !clientSecret) {
  console.error(
    "Erro: defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente (.env)."
  );
  process.exit(1);
}

const authParams = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  access_type: "offline",
  prompt: "consent",
  scope: "https://www.googleapis.com/auth/drive",
});

console.log("\n1. Abra esta URL no navegador logado na conta Google da agência:\n");
console.log(`https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`);
console.log("\n2. Após autorizar, copie o parâmetro `code` retornado.\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Cole o code aqui: ", async (code) => {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code.trim(),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = (await res.json()) as {
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!res.ok) {
      throw new Error(tokens.error_description || tokens.error || `HTTP ${res.status}`);
    }

    console.log("\n✅ Tokens gerados com sucesso!\n");
    console.log("Adicione ao seu .env:");
    console.log(
      `GOOGLE_DRIVE_REFRESH_TOKEN="${
        tokens.refresh_token ||
        "(não retornado - revogue o acesso anterior e tente novamente)"
      }"`
    );
  } catch (err) {
    console.error("Erro ao trocar o código por tokens:", err);
  } finally {
    rl.close();
  }
});
