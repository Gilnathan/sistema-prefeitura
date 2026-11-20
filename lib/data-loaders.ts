import {
  listEventos,
  listMidiasByEventoIds,
  listSecretarias,
  listUsers,
} from "@/lib/firestore-repo";
import type { EventoStatus, Role } from "@/lib/types";

export interface EventoListItemDTO {
  id: string;
  titulo: string;
  dataRealizacao: string;
  local: string;
  resumo: string;
  status: EventoStatus;
  createdAt: string;
  secretaria: { id: string; nome: string; sigla: string | null };
  secretariasParceiras: { id: string; nome: string; sigla: string | null }[];
  orgaosParceirosExternos: string[];
  isParceira: boolean;
  criadoPor: { id: string; name: string; email?: string };
  editadoPor: { name: string; email: string; em: string } | null;
  totalMidias: number;
  totalFotos: number;
  totalVideos: number;
}

export interface EventosPaginadosDTO {
  items: EventoListItemDTO[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export async function queryEventosPaginados(params: {
  role: Role;
  userSecretariaId: string | null;
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
  secretariaId?: string;
  mes?: string;
  ano?: string;
}): Promise<EventosPaginadosDTO> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 10));
  const q = (params.q || "").trim().toLowerCase();
  const statusParam = params.status || "";
  const secretariaParam = params.secretariaId || "";
  const mesParam = params.mes || "";
  const anoParam = params.ano || "";

  const effectiveSecId =
    params.role === "SECRETARIA"
      ? params.userSecretariaId ?? "__none__"
      : secretariaParam && secretariaParam !== "TODAS"
      ? secretariaParam
      : null;

  // secretarias e users vêm do cache em memória quando warm -> 1 único query de eventos
  const [eventosRaw, secretarias, usuarios] = await Promise.all([
    listEventos(effectiveSecId ? { secretariaId: effectiveSecId } : undefined),
    listSecretarias(),
    listUsers(),
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

  // Busca mídias APENAS dos 10 eventos da página atual (não baixa a coleção toda!)
  const midiasDaPagina = await listMidiasByEventoIds(slice.map((e) => e.id));

  const secMap = new Map(secretarias.map((s) => [s.id, s]));
  const userMap = new Map(usuarios.map((u) => [u.id, u]));

  const midiasByEvento = new Map<
    string,
    { total: number; fotos: number; videos: number }
  >();
  for (const m of midiasDaPagina) {
    const curr = midiasByEvento.get(m.eventoId) ?? {
      total: 0,
      fotos: 0,
      videos: 0,
    };
    curr.total += 1;
    if (m.tipo === "FOTO") curr.fotos += 1;
    if (m.tipo === "VIDEO") curr.videos += 1;
    midiasByEvento.set(m.eventoId, curr);
  }

  const items: EventoListItemDTO[] = slice.map((ev) => {
    const sec = secMap.get(ev.secretariaId);
    const autor = userMap.get(ev.criadoPorId);
    const counts = midiasByEvento.get(ev.id) ?? {
      total: 0,
      fotos: 0,
      videos: 0,
    };
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

  return {
    items,
    pagination: { page, pageSize, total, totalPages },
  };
}

export interface RelatorioMensalDTO {
  periodo: { mes: number; ano: number; secretariaId: string };
  kpis: {
    totalEventos: number;
    totalFotos: number;
    totalVideos: number;
    totalMidias: number;
    totalBytes: number;
    porStatus: Record<EventoStatus, number>;
  };
  rankingSecretarias: {
    secretariaId: string;
    nome: string;
    sigla: string | null;
    eventos: number;
    fotos: number;
    videos: number;
  }[];
  eventos: {
    id: string;
    titulo: string;
    dataRealizacao: string;
    local: string;
    resumo: string;
    status: EventoStatus;
    secretaria: { id: string; nome: string; sigla: string | null };
    criadoPor: string;
    fotos: number;
    videos: number;
    totalMidias: number;
  }[];
}

export async function buildRelatorioMensal(params: {
  role: Role;
  userSecretariaId: string | null;
  mes: number;
  ano: number;
  requestedSecretariaId?: string;
}): Promise<RelatorioMensalDTO> {
  const secretariaId =
    params.role === "SECRETARIA"
      ? params.userSecretariaId ?? "__none__"
      : params.requestedSecretariaId || "TODAS";

  const [eventosRaw, secretarias, usuarios] = await Promise.all([
    listEventos(secretariaId !== "TODAS" ? { secretariaId } : undefined),
    listSecretarias(),
    listUsers(),
  ]);

  const eventosPeriodo = eventosRaw
    .filter((ev) => {
      const d = new Date(ev.dataRealizacao);
      return d.getUTCFullYear() === params.ano && d.getUTCMonth() + 1 === params.mes;
    })
    .sort((a, b) => a.dataRealizacao.localeCompare(b.dataRealizacao));

  // Busca mídias APENAS dos eventos do mês filtrado (muito mais rápido!)
  const midiasPeriodo = await listMidiasByEventoIds(
    eventosPeriodo.map((e) => e.id)
  );

  const secMap = new Map(secretarias.map((s) => [s.id, s]));
  const userMap = new Map(usuarios.map((u) => [u.id, u]));

  const midiasByEvento = new Map<
    string,
    { fotos: number; videos: number; total: number; bytes: number }
  >();
  for (const m of midiasPeriodo) {
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

  const porStatus: Record<EventoStatus, number> = {
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
      criadoPor: autor?.name || ev.criadoPorNome || "Usuário",
      fotos: mStats.fotos,
      videos: mStats.videos,
      totalMidias: mStats.total,
    };
  });

  const rankingSecretarias = Array.from(rankingMap.values()).sort(
    (a, b) => b.eventos - a.eventos || b.fotos + b.videos - (a.fotos + a.videos)
  );

  return {
    periodo: { mes: params.mes, ano: params.ano, secretariaId },
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
  };
}
