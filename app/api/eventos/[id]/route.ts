import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  canUserAccessEvento,
  createEventoLog,
  deleteEventoCascade,
  getEventoById,
  getSecretariaById,
  getUserById,
  listMidiasByEvento,
  listSecretarias,
  updateEventoDoc,
} from "@/lib/firestore-repo";
import { updateEventoSchema } from "@/lib/validations";
import type { EventoLogChange } from "@/lib/types";
import {
  STATUS_CONFIG,
  formatarDataBR,
  normalizarStatusEvento,
} from "@/lib/utils";
import {
  formatarPublicoAtendido,
  formatarTurnos,
} from "@/lib/acao-options";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const evento = await getEventoById(params.id);
  if (!evento) {
    return NextResponse.json({ error: "Ação não encontrada" }, { status: 404 });
  }

  if (!canUserAccessEvento(evento, session.user)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const [secretaria, criadoPor, midias, todasSecretarias] = await Promise.all([
    getSecretariaById(evento.secretariaId),
    getUserById(evento.criadoPorId),
    listMidiasByEvento(evento.id),
    listSecretarias(),
  ]);

  const secMap = new Map(todasSecretarias.map((s) => [s.id, s]));
  const secretariasParceiras = (evento.secretariasParceirasIds || [])
    .map((sid) => secMap.get(sid))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => ({ id: s.id, nome: s.nome, sigla: s.sigla }));

  const totalFotos = midias.filter((m) => m.tipo === "FOTO").length;
  const totalVideos = midias.filter((m) => m.tipo === "VIDEO").length;

  return NextResponse.json({
    evento: {
      ...evento,
      driveFolderId: session.user.role === "ADMIN" ? evento.driveFolderId : undefined,
      secretaria: secretaria
        ? { id: secretaria.id, nome: secretaria.nome, sigla: secretaria.sigla }
        : { id: evento.secretariaId, nome: "Secretaria", sigla: null },
      secretariasParceiras,
      orgaosParceirosExternos: evento.orgaosParceirosExternos || [],
      criadoPor: criadoPor
        ? { id: criadoPor.id, name: criadoPor.name, email: criadoPor.email }
        : {
            id: evento.criadoPorId,
            name: evento.criadoPorNome || "Usuário",
            email: evento.criadoPorEmail || "",
          },
      totalFotos,
      totalVideos,
      totalMidias: midias.length,
    },
  });
}

function resumirTexto(texto: string, max = 140): string {
  const clean = texto.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const existing = await getEventoById(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Ação não encontrada" }, { status: 404 });
  }

  if (!canUserAccessEvento(existing, session.user)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateEventoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos" },
      { status: 400 }
    );
  }

  // SECRETARIA pode marcar/desmarcar como cancelada na edição; apenas ADMIN altera para PUBLICADO
  if (
    parsed.data.status !== undefined &&
    parsed.data.status !== "CANCELADA" &&
    session.user.role !== "ADMIN"
  ) {
    return NextResponse.json(
      { error: "Apenas a agência (ADMIN) pode alterar o status de publicação da ação." },
      { status: 403 }
    );
  }

  const patch: Parameters<typeof updateEventoDoc>[1] = {};
  const changes: EventoLogChange[] = [];

  if (parsed.data.titulo !== undefined && parsed.data.titulo.trim() !== existing.titulo) {
    patch.titulo = parsed.data.titulo.trim();
    changes.push({
      campo: "Título",
      antes: existing.titulo,
      depois: patch.titulo,
    });
  }

  if (parsed.data.local !== undefined && parsed.data.local.trim() !== existing.local) {
    patch.local = parsed.data.local.trim();
    changes.push({
      campo: "Local",
      antes: existing.local,
      depois: patch.local,
    });
  }

  if (parsed.data.resumo !== undefined && parsed.data.resumo.trim() !== existing.resumo) {
    patch.resumo = parsed.data.resumo.trim();
    changes.push({
      campo: "Resumo",
      antes: resumirTexto(existing.resumo),
      depois: resumirTexto(patch.resumo),
    });
  }

  if (
    parsed.data.relatorioCompleto !== undefined &&
    parsed.data.relatorioCompleto.trim() !== existing.relatorioCompleto
  ) {
    patch.relatorioCompleto = parsed.data.relatorioCompleto.trim();
    changes.push({
      campo: "Relatório Completo",
      antes: resumirTexto(existing.relatorioCompleto),
      depois: resumirTexto(patch.relatorioCompleto),
    });
  }

  if (parsed.data.dataRealizacao !== undefined) {
    const d = new Date(
      parsed.data.dataRealizacao.includes("T")
        ? parsed.data.dataRealizacao
        : `${parsed.data.dataRealizacao}T12:00:00.000Z`
    );
    if (!Number.isNaN(d.getTime())) {
      const novaDataISO = d.toISOString();
      if (formatarDataBR(novaDataISO) !== formatarDataBR(existing.dataRealizacao)) {
        patch.dataRealizacao = novaDataISO;
        changes.push({
          campo: "Data de Realização",
          antes: formatarDataBR(existing.dataRealizacao),
          depois: formatarDataBR(novaDataISO),
        });
      }
    }
  }

  if (parsed.data.dataFim !== undefined) {
    let novaDataFimISO: string | null = null;
    if (parsed.data.dataFim && parsed.data.dataFim.trim()) {
      const df = new Date(
        parsed.data.dataFim.includes("T")
          ? parsed.data.dataFim
          : `${parsed.data.dataFim}T12:00:00.000Z`
      );
      if (!Number.isNaN(df.getTime())) {
        novaDataFimISO = df.toISOString();
      }
    }
    const antesFim = existing.dataFim ? formatarDataBR(existing.dataFim) : "Ação de 1 dia";
    const depoisFim = novaDataFimISO ? formatarDataBR(novaDataFimISO) : "Ação de 1 dia";
    if (antesFim !== depoisFim) {
      patch.dataFim = novaDataFimISO;
      changes.push({
        campo: "Data de Término",
        antes: antesFim,
        depois: depoisFim,
      });
    }
  }

  if (parsed.data.turnos !== undefined) {
    const novosTurnos = Array.from(new Set(parsed.data.turnos));
    const antigosTurnos = existing.turnos || [];
    const mudou =
      novosTurnos.length !== antigosTurnos.length ||
      novosTurnos.some((t) => !antigosTurnos.includes(t));
    if (mudou) {
      patch.turnos = novosTurnos;
      changes.push({
        campo: "Turnos",
        antes: formatarTurnos(antigosTurnos) || "Não informado",
        depois: formatarTurnos(novosTurnos) || "Não informado",
      });
    }
  }

  if (
    parsed.data.publicoModo !== undefined ||
    parsed.data.publicoExato !== undefined ||
    parsed.data.publicoEstimativa !== undefined
  ) {
    const novoModo = parsed.data.publicoModo ?? existing.publicoModo ?? "NAO_INFORMADO";
    const novoExato =
      novoModo === "EXATO"
        ? parsed.data.publicoExato ?? existing.publicoExato ?? null
        : null;
    const novaEstimativa =
      novoModo === "ESTIMATIVA"
        ? (parsed.data.publicoEstimativa ?? existing.publicoEstimativa ?? "").trim() || null
        : null;

    const antesPublico =
      formatarPublicoAtendido({
        publicoModo: existing.publicoModo,
        publicoExato: existing.publicoExato,
        publicoEstimativa: existing.publicoEstimativa,
      }) || "Não informado";
    const depoisPublico =
      formatarPublicoAtendido({
        publicoModo: novoModo,
        publicoExato: novoExato,
        publicoEstimativa: novaEstimativa,
      }) || "Não informado";

    if (antesPublico !== depoisPublico || novoModo !== existing.publicoModo) {
      patch.publicoModo = novoModo;
      patch.publicoExato = novoExato;
      patch.publicoEstimativa = novaEstimativa;
      changes.push({
        campo: "Pessoas Atendidas",
        antes: antesPublico,
        depois: depoisPublico,
      });
    }
  }

  if (parsed.data.servicosSaude !== undefined) {
    const novosServicos = Array.from(
      new Set(parsed.data.servicosSaude.map((s) => s.trim()).filter(Boolean))
    );
    const antigosServicos = existing.servicosSaude || [];
    const mudou =
      novosServicos.length !== antigosServicos.length ||
      novosServicos.some((s) => !antigosServicos.includes(s));
    if (mudou) {
      patch.servicosSaude = novosServicos;
      changes.push({
        campo: "Atendimentos / Especialidades",
        antes: antigosServicos.join(", ") || "Nenhum",
        depois: novosServicos.join(", ") || "Nenhum",
      });
    }
  }

  const statusAtual = normalizarStatusEvento(existing.status);
  let novoStatus = parsed.data.status;
  if (parsed.data.cancelada !== undefined) {
    novoStatus = parsed.data.cancelada
      ? "CANCELADA"
      : statusAtual === "CANCELADA"
      ? "EM_PRODUCAO"
      : statusAtual;
  }

  if (novoStatus !== undefined && novoStatus !== statusAtual) {
    patch.status = novoStatus;
    changes.push({
      campo: "Status",
      antes: STATUS_CONFIG[statusAtual].label,
      depois: STATUS_CONFIG[novoStatus].label,
    });
  }

  if (parsed.data.secretariasParceirasIds !== undefined) {
    const novasIds = Array.from(
      new Set(
        parsed.data.secretariasParceirasIds.filter(
          (id) => id && id !== existing.secretariaId
        )
      )
    );
    const antigasIds = existing.secretariasParceirasIds || [];
    const mudou =
      novasIds.length !== antigasIds.length ||
      novasIds.some((id) => !antigasIds.includes(id));

    if (mudou) {
      patch.secretariasParceirasIds = novasIds;
      const todasSecs = await listSecretarias();
      const mapNomes = (ids: string[]) =>
        ids
          .map((id) => todasSecs.find((s) => s.id === id)?.nome)
          .filter(Boolean)
          .join(", ") || "Nenhuma";
      changes.push({
        campo: "Secretarias Parceiras",
        antes: mapNomes(antigasIds),
        depois: mapNomes(novasIds),
      });
    }
  }

  if (parsed.data.orgaosParceirosExternos !== undefined) {
    const novosOrgaos = Array.from(
      new Set(parsed.data.orgaosParceirosExternos.map((o) => o.trim()).filter(Boolean))
    );
    const antigosOrgaos = existing.orgaosParceirosExternos || [];
    const mudou =
      novosOrgaos.length !== antigosOrgaos.length ||
      novosOrgaos.some((o) => !antigosOrgaos.includes(o));

    if (mudou) {
      patch.orgaosParceirosExternos = novosOrgaos;
      changes.push({
        campo: "Órgãos Parceiros",
        antes: antigosOrgaos.join(", ") || "Nenhum",
        depois: novosOrgaos.join(", ") || "Nenhum",
      });
    }
  }

  if (changes.length === 0) {
    const secretaria = await getSecretariaById(existing.secretariaId);
    return NextResponse.json({
      evento: {
        ...existing,
        secretaria: secretaria
          ? { id: secretaria.id, nome: secretaria.nome, sigla: secretaria.sigla }
          : { id: existing.secretariaId, nome: "Secretaria", sigla: null },
      },
    });
  }

  patch.editadoPorId = session.user.id;
  patch.editadoPorNome = session.user.name;
  patch.editadoPorEmail = session.user.email;

  const updated = await updateEventoDoc(params.id, patch);
  if (!updated) {
    return NextResponse.json({ error: "Ação não encontrada" }, { status: 404 });
  }

  const onlyStatus = changes.length === 1 && changes[0].campo === "Status";
  await createEventoLog({
    eventoId: updated.id,
    acao: onlyStatus ? "STATUS_ALTERADO" : "EDICAO",
    descricao: onlyStatus
      ? `Status alterado de "${changes[0].antes}" para "${changes[0].depois}".`
      : `Campos alterados: ${changes.map((c) => c.campo).join(", ")}.`,
    changes,
    usuarioId: session.user.id,
    usuarioNome: session.user.name,
    usuarioEmail: session.user.email,
    usuarioRole: session.user.role,
  });

  const secretaria = await getSecretariaById(updated.secretariaId);

  return NextResponse.json({
    evento: {
      ...updated,
      secretaria: secretaria
        ? { id: secretaria.id, nome: secretaria.nome, sigla: secretaria.sigla }
        : { id: updated.secretariaId, nome: "Secretaria", sigla: null },
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

  await deleteEventoCascade(params.id);
  return NextResponse.json({ ok: true });
}
