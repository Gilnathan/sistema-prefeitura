import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import {
  createLoginSlideDoc,
  DEFAULT_LOGIN_SLIDES,
  listLoginSlides,
} from "@/lib/firestore-repo";

const createSlideSchema = z.object({
  titulo: z.string().trim().max(120).optional().default(""),
  imageUrl: z
    .string()
    .min(10, "Imagem inválida")
    .refine(
      (val) =>
        val.startsWith("data:image/") ||
        val.startsWith("/login-slides/") ||
        val.startsWith("https://"),
      "Formato de imagem não suportado."
    )
    .refine(
      (val) => val.length <= 900_000,
      "Imagem muito grande após otimização. Use uma imagem menor."
    ),
});

export async function GET() {
  if (!isFirebaseConfigured()) {
    return NextResponse.json({
      slides: DEFAULT_LOGIN_SLIDES.map((s, i) => ({
        id: `default-${i}`,
        ...s,
        createdAt: new Date().toISOString(),
      })),
    });
  }

  try {
    const slides = await listLoginSlides();
    return NextResponse.json({ slides });
  } catch (err) {
    console.error("[LoginSlides] Falha ao listar slides:", err);
    return NextResponse.json({
      slides: DEFAULT_LOGIN_SLIDES.map((s, i) => ({
        id: `default-${i}`,
        ...s,
        createdAt: new Date().toISOString(),
      })),
    });
  }
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSlideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos" },
      { status: 400 }
    );
  }

  const slide = await createLoginSlideDoc({
    titulo: parsed.data.titulo || "Belmonte — Bahia",
    imageUrl: parsed.data.imageUrl,
    criadoPorEmail: session.user.email,
  });

  return NextResponse.json({ slide }, { status: 201 });
}
