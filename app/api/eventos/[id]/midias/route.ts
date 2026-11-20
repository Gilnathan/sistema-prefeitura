import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  canUserAccessEvento,
  getEventoById,
  listMidiasByEvento,
} from "@/lib/firestore-repo";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const evento = await getEventoById(params.id);
  if (!evento) {
    return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
  }

  if (!canUserAccessEvento(evento, session.user)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(48, Math.max(1, Number(searchParams.get("pageSize") || "12")));
  const tipoParam = (searchParams.get("tipo") || "TODAS").toUpperCase();

  const todas = await listMidiasByEvento(evento.id);
  const totalTodas = todas.length;
  const totalFotos = todas.filter((m) => m.tipo === "FOTO").length;
  const totalVideos = todas.filter((m) => m.tipo === "VIDEO").length;

  const filtradas =
    tipoParam === "FOTO" || tipoParam === "VIDEO"
      ? todas.filter((m) => m.tipo === tipoParam)
      : todas;

  const total = filtradas.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = filtradas.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({
    items,
    counts: {
      todas: totalTodas,
      fotos: totalFotos,
      videos: totalVideos,
    },
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  });
}
