import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  createEventoDoc,
  createEventoLog,
  getSecretariaById,
  listAllMidias,
  listEventos,
  listSecretarias,
  listUsers,
  updateSecretariaDoc,
} from "@/lib/firestore-repo";
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
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") || "10")));
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const statusParam = searchParams.get("status") || "";
  const secretariaParam = searchParams.get("secretariaId") || "";
  const mesParam = searchParams.get("mes") || "";
  const anoParam = searchParams.get("ano") || "";

  // Isolamento estrito RBAC
  const effectiveSecId =
    session.user.role === "SECRETARIA"
      ? session.user.secretariaId ?? "__none__"
      : secretariaParam && secretariaParam !== "TODAS"
      ? secretariaParam
      : null;

  const [eventosRaw, secretarias, usuarios, todasMidias] = await Promise.all([
    listEventos(effectiveSecId ? { secretariaId: effectiveSecId } : undefined),
    listSecretarias(),
    listUsers(),
    listAllMidias(),
  ]);

  let filtrados = eventosRaw;

  if (q) {
    filtrados = filtrados.filter(
      (ev) =>
        ev.titulo.toLowerCase().includes(q) ||
        ev.local.toLowerCase().includes(q) ||
        ev.resumo.toLowerCase().includes(q)
    );
  }

  if (
    statusParam &&
    ["NOVO", "EM_PRODUCAO", "PUBLICADO"].includes(statusParam)
  ) {
    filtrados = filtrados.filter((ev) => ev.status === statusParam);
  }

  if (anoParam && /^\d{4}$/.test(anoParam)) {
    const ano = Number(anoParam);
    const mes = mesParam && /^\d{1,2}$/.test(mesParam) ? Number(mesParam) : null;
    filtrados = filtrados.filter((ev) => {
      const d = new Date(ev.dataRealizacao);
      if (d.getUTCFullYear() !== ano) return false;
      if (mes && mes >= 1 && mes <= 12 && d.getUTCMonth() + 1 !== mes) {
        return false;
      }
      return true;
    });
  }

  const total = filtrados.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const slice = filtrados.slice((page - 1) * pageSize, page * pageSize);

  const secMap = new Map(secretarias.map((s) => [s.id, s]));
  const userMap = new Map(usuarios.map((u) => [u.id, u]));

  const midiasByEvento = new Map<string, { total: number; fotos: number; videos: number }>();
  for (const m of todasMidias) {
    const curr = midiasByEvento.get(m.eventoId) ?? { total: 0, fotos: 0, videos: 0 };
    curr.total += 1;
    if (m.tipo === "FOTO") curr.fotos += 1;
    if (m.tipo === "VIDEO") curr.videos += 1;
    midiasByEvento.set(m.eventoId, curr);
  }

  const items = slice.map((ev) => {
    const sec = secMap.get(ev.secretariaId);
    const autor = userMap.get(ev.criadoPorId);
    const counts = midiasByEvento.get(ev.id) ?? { total: 0, fotos: 0, videos: 0 };
    const secretariasParceiras = (ev.secretariasParceirasIds || [])
      .map((sid) => secMap.get(sid))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((s) => ({ id: s.id, nome: s.nome, sigla: s.sigla }));

    const isParceira = Boolean(
      effectiveSecId &&
        ev.secretariaId !== effectiveSecId &&
        ev.secretariasParceirasIds?.includes(effectiveSecId)
    );

    return {
      id: ev.id,
      titulo: ev.titulo,
      dataRealizacao: ev.dataRealizacao,
      local: ev.local,
      resumo: ev.resumo,
      status: ev.status,
      createdAt: ev.createdAt,
      secretaria: sec
        ? { id: sec.id, nome: sec.nome, sigla: sec.sigla }
        : { id: ev.secretariaId, nome: "Secretaria", sigla: null },
      secretariasParceiras,
      orgaosParceirosExternos: ev.orgaosParceirosExternos || [],
      isParceira,
      criadoPor: autor
        ? { id: autor.id, name: autor.name, email: autor.email }
        : {
            id: ev.criadoPorId,
            name: ev.criadoPorNome || "Usuário",
            email: ev.criadoPorEmail || "",
          },
      editadoPor: ev.editadoPorEmail
        ? {
            name: ev.editadoPorNome || "",
            email: ev.editadoPorEmail,
            em: ev.editadoEm || ev.updatedAt,
          }
        : null,
      totalMidias: counts.total,
      totalFotos: counts.fotos,
      totalVideos: counts.videos,
    };
  });

  return NextResponse.json({
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  });
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
    dataRealizacao,
    local,
    resumo,
    relatorioCompleto,
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
    dataRealizacao: dataObj.toISOString(),
    local,
    resumo,
    relatorioCompleto,
    status: "NOVO",
    driveFolderId: eventoDriveFolderId,
    secretariaId: secretaria.id,
    secretariasParceirasIds: cleanParceirasIds,
    orgaosParceirosExternos: cleanOrgaosExternos,
    criadoPorId: session.user.id,
    criadoPorNome: session.user.name,
    criadoPorEmail: session.user.email,
  });

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
      `Ação "${evento.titulo}" registrada para a secretaria ${secretaria.nome}.` +
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
