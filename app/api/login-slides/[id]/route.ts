import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { deleteLoginSlideDoc } from "@/lib/firestore-repo";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const deleted = await deleteLoginSlideDoc(params.id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Foto não encontrada." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
