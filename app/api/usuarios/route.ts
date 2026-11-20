import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAuthSession } from "@/lib/auth";
import {
  createUserDoc,
  findUserByIdentifier,
  getSecretariaById,
  listSecretarias,
  listUsers,
} from "@/lib/firestore-repo";
import { createUsuarioSchema } from "@/lib/validations";

export async function GET() {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const [usuarios, secretarias] = await Promise.all([
    listUsers(),
    listSecretarias(),
  ]);

  const secMap = new Map(secretarias.map((s) => [s.id, s]));

  return NextResponse.json({
    usuarios: usuarios.map((u) => {
      const sec = u.secretariaId ? secMap.get(u.secretariaId) : null;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        username: u.username,
        role: u.role,
        ativo: u.ativo,
        secretariaId: u.secretariaId,
        createdAt: u.createdAt,
        secretaria: sec
          ? { id: sec.id, nome: sec.nome, sigla: sec.sigla }
          : null,
      };
    }),
  });
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createUsuarioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos" },
      { status: 400 }
    );
  }

  const { name, email, username, password, role, secretariaId } = parsed.data;
  const cleanUsername = username && username.length > 0 ? username : null;

  const existingEmail = await findUserByIdentifier(email);
  if (existingEmail) {
    return NextResponse.json(
      { error: "Já existe um usuário com este e-mail." },
      { status: 409 }
    );
  }

  if (cleanUsername) {
    const existingUsername = await findUserByIdentifier(cleanUsername);
    if (existingUsername) {
      return NextResponse.json(
        { error: "Já existe um usuário com este nome de login." },
        { status: 409 }
      );
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const created = await createUserDoc({
    name,
    email,
    username: cleanUsername,
    passwordHash,
    role,
    secretariaId: role === "ADMIN" ? null : secretariaId || null,
    ativo: true,
  });

  const sec = created.secretariaId
    ? await getSecretariaById(created.secretariaId)
    : null;

  return NextResponse.json(
    {
      usuario: {
        id: created.id,
        name: created.name,
        email: created.email,
        username: created.username,
        role: created.role,
        ativo: created.ativo,
        secretariaId: created.secretariaId,
        createdAt: created.createdAt,
        secretaria: sec
          ? { id: sec.id, nome: sec.nome, sigla: sec.sigla }
          : null,
      },
    },
    { status: 201 }
  );
}
