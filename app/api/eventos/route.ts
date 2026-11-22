import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  createEventoDoc,
  createEventoLog,
  getSecretariaById,
  listSecretarias,
  updateSecretariaDoc,
} from "@/lib/firestore-repo";
import { queryEventosPaginados } from "@/lib/data-loaders";
import { createEventoSchema } from "@/lib/validations";
import {
  ensureEventoFolderHierarchy,
  ensureSecretariaFolder,
  isGoogleDriveConfigured,
} from "@/lib/googleDrive";

export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const result = await queryEventosPaginados({
    role: session.user.role,
    userSecretariaId: session.user.secretariaId,
    page: Number(searchParams.get("page") || "1"),
    pageSize: Number(searchParams.get("pageSize") || "10"),
    q: searchParams.get("q") || "",
    status: searchParams.get("status") || "",
    tipo: searchParams.get("tipo") || "",
    secretariaId: searchParams.get("secretariaId") || "",
    mes: searchParams.get("mes") || "",
    ano: searchParams.get("ano") || "",
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createEventoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos" },
      { status: 400 }
    );
  }

  const {
    titulo,
    tipo = "REALIZADA",
    dataRealizacao,
    local,
    resumo,
    relatorioCompleto = "",
    secretariasParceirasIds = [],
    orgaosParceirosExternos = [],
  } = parsed.data;

  const secretariaId =
    session.user.role === "SECRETARIA"
      ? session.user.secretariaId
      : parsed.data.secretariaId;

  if (!secretariaId) {
    return NextResponse.json(
      { error: "Selecione a secretaria responsável pelo evento." },
      { status: 400 }
    );
  }

  const secretaria = await getSecretariaById(secretariaId);
  if (!secretaria || !secretaria.ativa) {
    return NextResponse.json(
      { error: "Secretaria não encontrada ou desativada." },
      { status: 404 }
    );
  }

  const dataObj = new Date(
    dataRealizacao.includes("T") ? dataRealizacao : `${dataRealizacao}T12:00:00.000Z`
  );
  if (Number.isNaN(dataObj.getTime())) {
    return NextResponse.json({ error: "Data de realização inválida." }, { status: 400 });
  }

  let eventoDriveFolderId: string | null = null;
  let driveWarning: string | null = null;

  if (isGoogleDriveConfigured()) {
    try {
      let secretariaFolderId = secretaria.driveFolderId;
      if (!secretariaFolderId) {
        secretariaFolderId = await ensureSecretariaFolder(secretaria.nome);
        await updateSecretariaDoc(secretaria.id, {
          driveFolderId: secretariaFolderId,
        });
      }

      eventoDriveFolderId = await ensureEventoFolderHierarchy({
        secretariaFolderId,
        dataRealizacao: dataObj,
        titulo,
      });
    } catch (err) {
      console.error("[GoogleDrive] Erro ao criar hierarquia de pastas do evento:", err);
      driveWarning =
        "Evento salvo, mas houve falha ao preparar a pasta de arquivos no Google Drive. Tente enviar as mídias novamente na página do evento.";
    }
  } else {
    driveWarning =
      "Google Drive ainda não configurado nas variáveis de ambiente. O evento foi salvo sem pasta de mídias vinculada.";
  }

  // Sanitiza parceiras (remove duplicatas e a própria secretaria principal)
  const cleanParceirasIds = Array.from(
    new Set(secretariasParceirasIds.filter((id) => id && id !== secretaria.id))
  );
  const cleanOrgaosExternos = Array.from(
    new Set(orgaosParceirosExternos.map((o) => o.trim()).filter(Boolean))
  );

  const evento = await createEventoDoc({
    titulo,
    tipo,
    dataRealizacao: dataObj.toISOString(),
    local,
    resumo,
    relatorioCompleto,
    status: "EM_PRODUCAO",
    driveFolderId: eventoDriveFolderId,
    secretariaId: secretaria.id,
    secretariasParceirasIds: cleanParceirasIds,
    orgaosParceirosExternos: cleanOrgaosExternos,
    criadoPorId: session.user.id,
    criadoPorNome: session.user.name,
    criadoPorEmail: session.user.email,
  });

  const tipoLabel = tipo === "FUTURA" ? "Ação Futura (agendada)" : "Ação Realizada";
  const parceirosInfo: string[] = [];
  if (cleanParceirasIds.length > 0) {
    const todasSecs = await listSecretarias();
    const secNomes = cleanParceirasIds
      .map((id) => todasSecs.find((s) => s.id === id)?.nome)
      .filter(Boolean) as string[];
    if (secNomes.length > 0) {
      parceirosInfo.push(`Secretarias parceiras: ${secNomes.join(", ")}`);
    }
  }
  if (cleanOrgaosExternos.length > 0) {
    parceirosInfo.push(`Órgãos parceiros: ${cleanOrgaosExternos.join(", ")}`);
  }

  await createEventoLog({
    eventoId: evento.id,
    acao: "CRIACAO",
    descricao:
      `${tipoLabel} "${evento.titulo}" registrada para a secretaria ${secretaria.nome}.` +
      (parceirosInfo.length > 0 ? ` (${parceirosInfo.join(" | ")})` : ""),
    usuarioId: session.user.id,
    usuarioNome: session.user.name,
    usuarioEmail: session.user.email,
    usuarioRole: session.user.role,
  });

  return NextResponse.json(
    {
      evento: {
        ...evento,
        secretaria: {
          id: secretaria.id,
          nome: secretaria.nome,
          sigla: secretaria.sigla,
        },
      },
      driveWarning,
    },
    { status: 201 }
  );
}
