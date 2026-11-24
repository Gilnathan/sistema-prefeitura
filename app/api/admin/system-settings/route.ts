import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { getSystemSettings, saveSystemSettings } from "@/lib/firestore-repo";

const patchSettingsSchema = z.object({
  permitirAcoesFuturas: z.boolean().optional(),
  permitirEnvioVideos: z.boolean().optional(),
});

export async function GET() {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const settings = await getSystemSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos" },
      { status: 400 }
    );
  }

  const updated = await saveSystemSettings({
    permitirAcoesFuturas: parsed.data.permitirAcoesFuturas,
    permitirEnvioVideos: parsed.data.permitirEnvioVideos,
    updatedByEmail: session.user.email,
  });

  return NextResponse.json({ settings: updated });
}
