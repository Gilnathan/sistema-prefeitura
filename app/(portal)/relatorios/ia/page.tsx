import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import {
  DEFAULT_GEMINI_MODEL,
  getGeminiConfig,
  listSecretarias,
} from "@/lib/firestore-repo";
import { RelatoriosIAClient } from "@/components/relatorios-ia-client";

function maskApiKey(key: string): string {
  if (key.length <= 10) return "••••••••";
  return `${key.slice(0, 6)}••••••••••••${key.slice(-4)}`;
}

export default async function RelatoriosIAPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  // Tela de Consultas com IA é estritamente exclusiva para ADMIN
  if (session.user.role !== "ADMIN") {
    redirect("/relatorios");
  }

  const [secretariasRaw, geminiConfig] = await Promise.all([
    listSecretarias(),
    getGeminiConfig(),
  ]);

  const secretarias = secretariasRaw.map((s) => ({
    id: s.id,
    nome: s.nome,
    sigla: s.sigla,
  }));

  return (
    <RelatoriosIAClient
      secretarias={secretarias}
      initialConfig={
        geminiConfig
          ? {
              configured: true,
              maskedKey: maskApiKey(geminiConfig.apiKey),
              model: geminiConfig.model,
              updatedAt: geminiConfig.updatedAt,
              updatedByEmail: geminiConfig.updatedByEmail || null,
            }
          : {
              configured: false,
              maskedKey: null,
              model: DEFAULT_GEMINI_MODEL,
              updatedAt: null,
              updatedByEmail: null,
            }
      }
    />
  );
}
