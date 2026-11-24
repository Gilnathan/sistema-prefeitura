import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  canUserAccessEvento,
  createEventoLog,
  getEventoById,
  getSystemSettings,
  upsertMidiaDoc,
} from "@/lib/firestore-repo";
import { finalizeUploadSchema } from "@/lib/validations";
import { setFilePublicReader } from "@/lib/googleDrive";
import { formatarTamanhoArquivo, inferirTipoMidia } from "@/lib/utils";

/**
 * POST /api/drive/finalize-upload
 * Recebe apenas o `driveFileId` e metadados leves após o envio direto do navegador ao Drive.
 * Aplica permissão pública somente leitura (`anyone` + `reader`), grava na coleção `midias`
 * e registra a assinatura no histórico (`evento_logs`).
 */
export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = finalizeUploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos" },
      { status: 400 }
    );
  }

  const { eventoId, driveFileId, fileName, mimeType, fileSize } = parsed.data;

  const settings = await getSystemSettings();
  if (!settings.permitirEnvioVideos && inferirTipoMidia(mimeType, fileName) === "VIDEO") {
    return NextResponse.json(
      {
        error:
          "O envio de vídeos está desabilitado nas configurações do sistema.",
      },
      { status: 403 }
    );
  }

  const evento = await getEventoById(eventoId);
  if (!evento) {
    return NextResponse.json({ error: "Ação não encontrada" }, { status: 404 });
  }

  if (!canUserAccessEvento(evento, session.user)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  try {
    await setFilePublicReader(driveFileId);

    const tipo = inferirTipoMidia(mimeType, fileName);
    const midia = await upsertMidiaDoc({
      driveFileId,
      fileName,
      mimeType,
      fileSize,
      tipo,
      eventoId: evento.id,
      adicionadoPorId: session.user.id,
      adicionadoPorNome: session.user.name,
      adicionadoPorEmail: session.user.email,
    });

    const tipoLabel = tipo === "VIDEO" ? "Vídeo" : tipo === "FOTO" ? "Foto" : "Arquivo";
    await createEventoLog({
      eventoId: evento.id,
      acao: "MIDIA_ADICIONADA",
      descricao: `${tipoLabel} adicionado: "${fileName}" (${formatarTamanhoArquivo(fileSize)}).`,
      metadata: {
        fileName,
        tipoMidia: tipo,
        fileSize,
      },
      usuarioId: session.user.id,
      usuarioNome: session.user.name,
      usuarioEmail: session.user.email,
      usuarioRole: session.user.role,
    });

    return NextResponse.json({ midia }, { status: 201 });
  } catch (err) {
    console.error("[GoogleDrive] Erro ao finalizar upload:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erro ao finalizar permissão e registro da mídia.",
      },
      { status: 500 }
    );
  }
}
