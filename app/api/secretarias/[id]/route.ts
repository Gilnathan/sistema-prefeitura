import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  deleteSecretariaCascade,
  listEventos,
  listUsers,
  updateSecretariaDoc,
} from "@/lib/firestore-repo";
import { updateSecretariaSchema } from "@/lib/validations";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateSecretariaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos" },
      { status: 400 }
    );
  }

  const secretaria = await updateSecretariaDoc(params.id, {
    ...(parsed.data.nome !== undefined ? { nome: parsed.data.nome } : {}),
    ...(parsed.data.sigla !== undefined ? { sigla: parsed.data.sigla || null } : {}),
    ...(parsed.data.descricao !== undefined
      ? { descricao: parsed.data.descricao || null }
      : {}),
    ...(parsed.data.ativa !== undefined ? { ativa: parsed.data.ativa } : {}),
  });

  if (!secretaria) {
    return NextResponse.json(
      { error: "Secretaria não encontrada." },
      { status: 404 }
    );
  }

  const [usuarios, eventos] = await Promise.all([
    listUsers(),
    listEventos({ secretariaId: params.id }),
  ]);

  return NextResponse.json({
    secretaria: {
      ...secretaria,
      _count: {
        usuarios: usuarios.filter((u) => u.secretariaId === params.id).length,
        eventos: eventos.length,
      },
    },
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const deleteUsers = searchParams.get("deleteUsers") === "true";

  const deleted = await deleteSecretariaCascade({
    secretariaId: params.id,
    deleteUsers,
    actorUserId: session.user.id,
  });

  if (!deleted) {
    return NextResponse.json(
      { error: "Secretaria não encontrada." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
