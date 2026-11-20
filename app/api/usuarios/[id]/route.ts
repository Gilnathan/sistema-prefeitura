import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAuthSession } from "@/lib/auth";
import {
  deleteUserPreservingEvents,
  getSecretariaById,
  updateUserDoc,
} from "@/lib/firestore-repo";
import { updateUsuarioSchema } from "@/lib/validations";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateUsuarioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos" },
      { status: 400 }
    );
  }

  if (params.id === session.user.id && parsed.data.ativo === false) {
    return NextResponse.json(
      { error: "Você não pode desativar o seu próprio usuário." },
      { status: 400 }
    );
  }

  const patch: Parameters<typeof updateUserDoc>[1] = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.email !== undefined) patch.email = parsed.data.email;
  if (parsed.data.username !== undefined) {
    patch.username = parsed.data.username || null;
  }
  if (parsed.data.role !== undefined) patch.role = parsed.data.role;
  if (parsed.data.secretariaId !== undefined) {
    patch.secretariaId =
      parsed.data.role === "ADMIN" ? null : parsed.data.secretariaId || null;
  }
  if (parsed.data.ativo !== undefined) patch.ativo = parsed.data.ativo;
  if (parsed.data.password && parsed.data.password.length >= 6) {
    patch.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  }

  const updated = await updateUserDoc(params.id, patch);
  if (!updated) {
    return NextResponse.json(
      { error: "Usuário não encontrado." },
      { status: 404 }
    );
  }

  const sec = updated.secretariaId
    ? await getSecretariaById(updated.secretariaId)
    : null;

  return NextResponse.json({
    usuario: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      username: updated.username,
      role: updated.role,
      ativo: updated.ativo,
      secretariaId: updated.secretariaId,
      createdAt: updated.createdAt,
      secretaria: sec ? { id: sec.id, nome: sec.nome, sigla: sec.sigla } : null,
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  if (params.id === session.user.id) {
    return NextResponse.json(
      { error: "Você não pode excluir o seu próprio usuário." },
      { status: 400 }
    );
  }

  const deleted = await deleteUserPreservingEvents({
    userId: params.id,
    fallbackAdminId: session.user.id,
  });

  if (!deleted) {
    return NextResponse.json(
      { error: "Usuário não encontrado." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
