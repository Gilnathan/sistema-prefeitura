import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  listAllMidias,
  listEventos,
  listSecretarias,
  listUsers,
} from "@/lib/firestore-repo";

export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const ano = Number(searchParams.get("ano") || now.getUTCFullYear());
  const mes = Number(searchParams.get("mes") || now.getUTCMonth() + 1);
  const requestedSecretariaId = searchParams.get("secretariaId") || "TODAS";

  // Isolamento estrito: SECRETARIA sempre consulta somente a própria secretaria
  const secretariaId =
    session.user.role === "SECRETARIA"
      ? session.user.secretariaId ?? "__none__"
      : requestedSecretariaId;

  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return NextResponse.json({ error: "Ano inválido" }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Mês inválido" }, { status: 400 });
  }

  const [eventosRaw, secretarias, usuarios, todasMidias] = await Promise.all([
    listEventos(
      secretariaId !== "TODAS" ? { secretariaId } : undefined
    ),
    listSecretarias(),
    listUsers(),
    listAllMidias(),
  ]);

  const eventosPeriodo = eventosRaw
    .filter((ev) => {
      const d = new Date(ev.dataRealizacao);
      return d.getUTCFullYear() === ano && d.getUTCMonth() + 1 === mes;
    })
    .sort((a, b) => a.dataRealizacao.localeCompare(b.dataRealizacao));

  const secMap = new Map(secretarias.map((s) => [s.id, s]));
  const userMap = new Map(usuarios.map((u) => [u.id, u]));

  const midiasByEvento = new Map<
    string,
    { fotos: number; videos: number; total: number; bytes: number }
  >();
  for (const m of todasMidias) {
    const curr = midiasByEvento.get(m.eventoId) ?? {
      fotos: 0,
      videos: 0,
      total: 0,
      bytes: 0,
    };
    curr.total += 1;
    curr.bytes += Number(m.fileSize || 0);
    if (m.tipo === "FOTO") curr.fotos += 1;
    if (m.tipo === "VIDEO") curr.videos += 1;
    midiasByEvento.set(m.eventoId, curr);
  }

  let totalFotos = 0;
  let totalVideos = 0;
  let totalBytes = 0;

  const rankingMap = new Map<
    string,
    {
      secretariaId: string;
      nome: string;
      sigla: string | null;
      eventos: number;
      fotos: number;
      videos: number;
    }
  >();

  const porStatus = {
    NOVO: 0,
    EM_PRODUCAO: 0,
    PUBLICADO: 0,
  };

  const eventosDetalhados = eventosPeriodo.map((ev) => {
    const mStats = midiasByEvento.get(ev.id) ?? {
      fotos: 0,
      videos: 0,
      total: 0,
      bytes: 0,
    };
    const sec = secMap.get(ev.secretariaId) ?? {
      id: ev.secretariaId,
      nome: "Secretaria",
      sigla: null,
    };
    const autor = userMap.get(ev.criadoPorId);

    totalFotos += mStats.fotos;
    totalVideos += mStats.videos;
    totalBytes += mStats.bytes;
    porStatus[ev.status] += 1;

    const current = rankingMap.get(sec.id) ?? {
      secretariaId: sec.id,
      nome: sec.nome,
      sigla: sec.sigla,
      eventos: 0,
      fotos: 0,
      videos: 0,
    };
    current.eventos += 1;
    current.fotos += mStats.fotos;
    current.videos += mStats.videos;
    rankingMap.set(sec.id, current);

    return {
      id: ev.id,
      titulo: ev.titulo,
      dataRealizacao: ev.dataRealizacao,
      local: ev.local,
      resumo: ev.resumo,
      status: ev.status,
      secretaria: { id: sec.id, nome: sec.nome, sigla: sec.sigla },
      criadoPor: autor?.name || "Usuário",
      fotos: mStats.fotos,
      videos: mStats.videos,
      totalMidias: mStats.total,
    };
  });

  const rankingSecretarias = Array.from(rankingMap.values()).sort(
    (a, b) => b.eventos - a.eventos || b.fotos + b.videos - (a.fotos + a.videos)
  );

  return NextResponse.json({
    periodo: { mes, ano, secretariaId },
    kpis: {
      totalEventos: eventosPeriodo.length,
      totalFotos,
      totalVideos,
      totalMidias: totalFotos + totalVideos,
      totalBytes,
      porStatus,
    },
    rankingSecretarias,
    eventos: eventosDetalhados,
  });
}
