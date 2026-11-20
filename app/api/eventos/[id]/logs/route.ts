import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  canUserAccessEvento,
  getEventoById,
  listEventoLogs,
  listMidiasByEvento,
} from "@/lib/firestore-repo";

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

  const [logs, midias] = await Promise.all([
    listEventoLogs(evento.id),
    listMidiasByEvento(evento.id),
  ]);

  const totalFotos = midias.filter((m) => m.tipo === "FOTO").length;
  const totalVideos = midias.filter((m) => m.tipo === "VIDEO").length;

  return NextResponse.json({
    logs,
    resumo: {
      totalRegistros: logs.length,
      totalFotos,
      totalVideos,
      totalMidias: midias.length,
    },
  });
}
