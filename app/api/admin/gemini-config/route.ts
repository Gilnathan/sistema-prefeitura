import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import {
  DEFAULT_GEMINI_MODEL,
  deleteGeminiConfig,
  getGeminiConfig,
  saveGeminiConfig,
} from "@/lib/firestore-repo";

const ALLOWED_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
] as const;

const saveConfigSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(10, "Informe uma chave válida do Google AI Studio."),
  model: z.enum(ALLOWED_MODELS).optional().default(DEFAULT_GEMINI_MODEL),
});

function maskApiKey(key: string): string {
  if (key.length <= 10) return "••••••••";
  return `${key.slice(0, 6)}••••••••••••${key.slice(-4)}`;
}

export async function GET() {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const config = await getGeminiConfig();
  if (!config) {
    return NextResponse.json({
      configured: false,
      model: DEFAULT_GEMINI_MODEL,
    });
  }

  return NextResponse.json({
    configured: true,
    maskedKey: maskApiKey(config.apiKey),
    model: config.model,
    updatedAt: config.updatedAt,
    updatedByEmail: config.updatedByEmail || null,
  });
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = saveConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos" },
      { status: 400 }
    );
  }

  // Testa rapidamente a chave contra a API do Google Gemini antes de salvar
  const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    parsed.data.model
  )}?key=${encodeURIComponent(parsed.data.apiKey)}`;

  try {
    const testRes = await fetch(testUrl, { cache: "no-store" });
    if (!testRes.ok) {
      const errData = (await testRes.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      return NextResponse.json(
        {
          error:
            errData.error?.message ||
            `Chave rejeitada pelo Google AI Studio (HTTP ${testRes.status}). Verifique se a chave está correta.`,
        },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Não foi possível validar a chave junto ao Google AI Studio." },
      { status: 502 }
    );
  }

  const saved = await saveGeminiConfig({
    apiKey: parsed.data.apiKey,
    model: parsed.data.model,
    updatedByEmail: session.user.email,
  });

  return NextResponse.json({
    configured: true,
    maskedKey: maskApiKey(saved.apiKey),
    model: saved.model,
    updatedAt: saved.updatedAt,
    updatedByEmail: saved.updatedByEmail,
  });
}

export async function DELETE() {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  await deleteGeminiConfig();
  return NextResponse.json({ ok: true, configured: false });
}
