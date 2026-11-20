"use server";

import { revalidatePath } from "next/cache";
import type { EventoStatus } from "@/lib/types";
import { getAuthSession } from "@/lib/auth";
import {
  createEventoLog,
  getEventoById,
  updateEventoDoc,
} from "@/lib/firestore-repo";
import { STATUS_CONFIG } from "@/lib/utils";

export async function atualizarStatusEventoAction(
  eventoId: string,
  status: EventoStatus
) {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return { error: "Apenas a agência (ADMIN) pode alterar o status." };
  }

  if (!["NOVO", "EM_PRODUCAO", "PUBLICADO"].includes(status)) {
    return { error: "Status inválido." };
  }

  const existing = await getEventoById(eventoId);
  if (!existing) {
    return { error: "Ação não encontrada." };
  }

  if (existing.status === status) {
    return { ok: true };
  }

  const updated = await updateEventoDoc(eventoId, {
    status,
    editadoPorId: session.user.id,
    editadoPorNome: session.user.name,
    editadoPorEmail: session.user.email,
  });
  if (!updated) {
    return { error: "Ação não encontrada." };
  }

  const antes = STATUS_CONFIG[existing.status].label;
  const depois = STATUS_CONFIG[status].label;

  await createEventoLog({
    eventoId,
    acao: "STATUS_ALTERADO",
    descricao: `Status alterado de "${antes}" para "${depois}".`,
    changes: [{ campo: "Status", antes, depois }],
    usuarioId: session.user.id,
    usuarioNome: session.user.name,
    usuarioEmail: session.user.email,
    usuarioRole: session.user.role,
  });

  revalidatePath("/dashboard");
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/relatorios");

  return { ok: true };
}
