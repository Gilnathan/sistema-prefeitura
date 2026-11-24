import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import {
  DEFAULT_GEMINI_MODEL,
  getGeminiConfig,
  getSystemSettings,
} from "@/lib/firestore-repo";
import { AdminConfiguracoesClient } from "@/components/admin-configuracoes-client";

function maskApiKey(key: string): string {
  if (key.length <= 10) return "••••••••";
  return `${key.slice(0, 6)}••••••••••••${key.slice(-4)}`;
}

export default async function AdminConfiguracoesPage() {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [systemSettings, geminiConfig] = await Promise.all([
    getSystemSettings(),
    getGeminiConfig(),
  ]);

  return (
    <AdminConfiguracoesClient
      initialSettings={systemSettings}
      initialGemini={{
        configured: Boolean(geminiConfig?.apiKey),
        maskedKey: geminiConfig?.apiKey ? maskApiKey(geminiConfig.apiKey) : null,
        model: geminiConfig?.model || DEFAULT_GEMINI_MODEL,
        updatedAt: geminiConfig?.updatedAt || null,
        updatedByEmail: geminiConfig?.updatedByEmail || null,
      }}
    />
  );
}
