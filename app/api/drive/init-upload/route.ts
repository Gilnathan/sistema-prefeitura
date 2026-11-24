import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  canUserAccessEvento,
  getEventoById,
  getSecretariaById,
  getSystemSettings,
  updateEventoDoc,
  updateSecretariaDoc,
} from "@/lib/firestore-repo";
import { uploadSessionSchema } from "@/lib/validations";
import {
  createResumableUploadSession,
  ensureEventoFolderHierarchy,
  ensureSecretariaFolder,
  isGoogleDriveConfigured,
} from "@/lib/googleDrive";
import { inferirTipoMidia } from "@/lib/utils";

/**
 * POST /api/drive/init-upload
 * Recebe APENAS metadados leves (~200 bytes) — nenhum binário de mídia passa pela Vercel.
 * Autentica via OAuth2, garante a hierarquia de pastas (Secretaria / Ano / Mês / Evento)
 * e retorna a `uploadUrl` de Resumable Upload com suporte a CORS para PUT direto do navegador.
 */
export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!isGoogleDriveConfigured()) {
    return NextResponse.json(
      {
        error:
          "Integração com Google Drive não está configurada no servidor. Verifique GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN e GOOGLE_DRIVE_ROOT_FOLDER_ID.",
      },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = uploadSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos para upload" },
      { status: 400 }
    );
  }

  const { eventoId, fileName, mimeType, fileSize } = parsed.data;

  const settings = await getSystemSettings();
  if (!settings.permitirEnvioVideos && inferirTipoMidia(mimeType, fileName) === "VIDEO") {
    return NextResponse.json(
      {
        error:
          "O envio de vídeos está temporariamente desabilitado nas configurações do sistema. Envie apenas fotos.",
      },
      { status: 403 }
    );
  }

  const evento = await getEventoById(eventoId);
  if (!evento) {
    return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
  }

  if (!canUserAccessEvento(evento, session.user)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const secretaria = await getSecretariaById(evento.secretariaId);
  if (!secretaria) {
    return NextResponse.json(
      { error: "Secretaria vinculada ao evento não encontrada." },
      { status: 404 }
    );
  }

  try {
    let secretariaFolderId = secretaria.driveFolderId;
    if (!secretariaFolderId) {
      secretariaFolderId = await ensureSecretariaFolder(secretaria.nome);
      await updateSecretariaDoc(secretaria.id, {
        driveFolderId: secretariaFolderId,
      });
    }

    let eventoFolderId = evento.driveFolderId;
    if (!eventoFolderId) {
      eventoFolderId = await ensureEventoFolderHierarchy({
        secretariaFolderId,
        dataRealizacao: new Date(evento.dataRealizacao),
        titulo: evento.titulo,
      });
      await updateEventoDoc(evento.id, { driveFolderId: eventoFolderId });
    }

    // Garante header Origin exato para que o Google Drive libere CORS no PUT direto do navegador
    const originFromBody =
      typeof body?.origin === "string" && body.origin.startsWith("http")
        ? body.origin
        : null;
    const origin =
      req.headers.get("origin") || originFromBody || new URL(req.url).origin;

    const { uploadUrl } = await createResumableUploadSession({
      fileName,
      mimeType,
      fileSize,
      parentFolderId: eventoFolderId,
      origin,
    });

    return NextResponse.json({ uploadUrl, resolvedOrigin: origin });
  } catch (err) {
    console.error("[GoogleDrive] Erro ao gerar sessão resumível:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erro ao iniciar sessão de upload no Google Drive.",
      },
      { status: 500 }
    );
  }
}
