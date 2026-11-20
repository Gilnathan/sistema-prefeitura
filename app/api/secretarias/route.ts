import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAuthSession } from "@/lib/auth";
import {
  createSecretariaDoc,
  createUserDoc,
  findSecretariaByNome,
  findUserByIdentifier,
  listEventos,
  listSecretarias,
  listUsers,
} from "@/lib/firestore-repo";
import { createSecretariaSchema } from "@/lib/validations";
import { ensureSecretariaFolder, isGoogleDriveConfigured } from "@/lib/googleDrive";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const [secretarias, usuarios, eventos] = await Promise.all([
    listSecretarias(
      session.user.role === "ADMIN"
        ? undefined
        : { secretariaId: session.user.secretariaId ?? "__none__" }
    ),
    listUsers(),
    listEventos(
      session.user.role === "ADMIN"
        ? undefined
        : { secretariaId: session.user.secretariaId ?? "__none__" }
    ),
  ]);

  const userCountBySec = new Map<string, number>();
  for (const u of usuarios) {
    if (u.secretariaId) {
      userCountBySec.set(u.secretariaId, (userCountBySec.get(u.secretariaId) ?? 0) + 1);
    }
  }

  const eventCountBySec = new Map<string, number>();
  for (const e of eventos) {
    eventCountBySec.set(e.secretariaId, (eventCountBySec.get(e.secretariaId) ?? 0) + 1);
  }

  return NextResponse.json({
    secretarias: secretarias.map((s) => ({
      ...s,
      _count: {
        usuarios: userCountBySec.get(s.id) ?? 0,
        eventos: eventCountBySec.get(s.id) ?? 0,
      },
    })),
  });
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSecretariaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos" },
      { status: 400 }
    );
  }

  const { nome, sigla, descricao, criarUsuarioInicial, usuarioInicial } = parsed.data;

  const existing = await findSecretariaByNome(nome);
  if (existing) {
    return NextResponse.json(
      { error: "Já existe uma secretaria cadastrada com esse nome." },
      { status: 409 }
    );
  }

  let cleanUsername: string | null = null;
  if (criarUsuarioInicial && usuarioInicial) {
    cleanUsername =
      usuarioInicial.username && usuarioInicial.username.length > 0
        ? usuarioInicial.username
        : null;

    const existingEmail = await findUserByIdentifier(usuarioInicial.email);
    if (existingEmail) {
      return NextResponse.json(
        { error: "Já existe um usuário cadastrado com este e-mail." },
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
  }

  let driveFolderId: string | null = null;
  let driveWarning: string | null = null;

  if (isGoogleDriveConfigured()) {
    try {
      driveFolderId = await ensureSecretariaFolder(nome);
    } catch (err) {
      console.error("[GoogleDrive] Falha ao criar pasta da secretaria:", err);
      driveWarning =
        "Secretaria cadastrada, mas não foi possível criar a pasta no Google Drive agora. Ela será criada automaticamente no primeiro evento.";
    }
  }

  const sec = await createSecretariaDoc({
    nome,
    sigla: sigla || null,
    descricao: descricao || null,
    driveFolderId,
    ativa: true,
  });

  let usuarioCriado = null;
  if (criarUsuarioInicial && usuarioInicial) {
    const passwordHash = await bcrypt.hash(usuarioInicial.password, 10);
    const createdUser = await createUserDoc({
      name: usuarioInicial.name,
      email: usuarioInicial.email,
      username: cleanUsername,
      passwordHash,
      role: "SECRETARIA",
      secretariaId: sec.id,
      ativo: true,
    });
    usuarioCriado = {
      id: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
      username: createdUser.username,
      role: createdUser.role,
    };
  }

  return NextResponse.json(
    {
      secretaria: {
        ...sec,
        _count: { usuarios: usuarioCriado ? 1 : 0, eventos: 0 },
      },
      usuarioCriado,
      driveWarning,
    },
    { status: 201 }
  );
}
