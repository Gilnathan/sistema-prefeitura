import { NextResponse } from "next/server";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { runFirestoreSeed } from "@/lib/seed-service";

/**
 * POST /api/seed
 * Rota protegida pelo header `x-seed-secret` (comparado a `process.env.SEED_SECRET`)
 * para inicializar o usuário ADMIN e as 10 secretarias municipais no Firestore
 * diretamente após o deploy na Vercel.
 */
export async function POST(req: Request) {
  const configuredSecret = process.env.SEED_SECRET;
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "SEED_SECRET não configurado nas variáveis de ambiente." },
      { status: 503 }
    );
  }

  const provided = req.headers.get("x-seed-secret");
  if (!provided || provided !== configuredSecret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  if (!isFirebaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Firebase Admin SDK não configurado. Verifique FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY.",
      },
      { status: 503 }
    );
  }

  try {
    const result = await runFirestoreSeed();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[Seed] Erro ao popular Firestore:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro ao executar seed inicial.",
      },
      { status: 500 }
    );
  }
}
