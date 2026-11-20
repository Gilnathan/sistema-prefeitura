/**
 * Script CLI de Seed Inicial para Firebase Firestore.
 * Uso: npm run db:seed
 */
import fs from "node:fs";
import path from "node:path";

// Carrega .env manualmente quando executado via `tsx`
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

import { runFirestoreSeed, SECRETARIAS_SEED } from "../lib/seed-service";

async function main() {
  console.log("🌱 Executando seed inicial no Firebase Firestore...");
  const result = await runFirestoreSeed();

  console.log(
    `  ✔ ADMIN: ${result.admin.email} (${result.admin.criado ? "criado" : "já existia"})`
  );

  for (const sec of SECRETARIAS_SEED) {
    const info = result.secretarias.find((s) => s.nome === sec.nome);
    console.log(
      `  ✔ ${sec.nome} (${sec.sigla}) -> ${sec.email} / ${sec.password} [${
        info?.usuarioCriado ? "novo" : "existente"
      }]`
    );
  }

  console.log(
    `\n✅ Seed Firestore concluído! (${result.totalSecretarias} secretarias garantidas)`
  );
}

main().catch((err) => {
  console.error("❌ Erro no seed Firestore:", err?.message || err);
  process.exit(1);
});
