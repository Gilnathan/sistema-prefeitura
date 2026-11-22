import {
  listEventos,
  listMidiasByEventoIds,
  listSecretarias,
  listUsers,
} from "@/lib/firestore-repo";
import type { EventoStatus, EventoTipo, Role } from "@/lib/types";
import {
  normalizarStatusEvento,
  resolverTipoEventoEfetivo,
} from "@/lib/utils";

export interface EventoListItemDTO {
  id: string;
  titulo: string;
  tipo: EventoTipo;
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
  tipo?: string;
  secretariaId?: string;
  mes?: string;
  ano?: string;
}): Promise<EventosPaginadosDTO> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 10));
  const q = (params.q || "").trim().toLowerCase();
  const statusParam = params.status || "";
  const tipoParam = params.tipo || "";
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
    ["EM_PRODUCAO", "PUBLICADO", "CANCELADA"].includes(statusParam)
  ) {
    filtrados = filtrados.filter(
      (ev) => normalizarStatusEvento(ev.status) === statusParam
    );
  }

  if (tipoParam === "CANCELADA") {
    filtrados = filtrados.filter(
      (ev) => normalizarStatusEvento(ev.status) === "CANCELADA"
    );
  } else if (tipoParam === "REALIZADA" || tipoParam === "FUTURA") {
    filtrados = filtrados.filter(
      (ev) =>
        normalizarStatusEvento(ev.status) !== "CANCELADA" &&
        resolverTipoEventoEfetivo(ev.tipo, ev.dataRealizacao) === tipoParam
    );
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

    const tipoEfetivo = resolverTipoEventoEfetivo(ev.tipo, ev.dataRealizacao);

    return {
      id: ev.id,
      titulo: ev.titulo,
      tipo: tipoEfetivo,
      dataRealizacao: ev.dataRealizacao,
      local: ev.local,
      resumo: ev.resumo,
      status: normalizarStatusEvento(ev.status),
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
    totalRealizadas: number;
    totalFuturas: number;
    totalCanceladas: number;
    porStatus: {
      EM_PRODUCAO: number;
      PUBLICADO: number;
      CANCELADA: number;
    };
  };
  rankingSecretarias: {
    secretariaId: string;
    nome: string;
    sigla: string | null;
    eventosRealizados: number;
  }[];
  eventos: {
    id: string;
    titulo: string;
    tipo: EventoTipo;
    dataRealizacao: string;
    local: string;
    resumo: string;
    status: Exclude<EventoStatus, "NOVO">;
    secretaria: { id: string; nome: string; sigla: string | null };
    criadoPor: string;
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

  const secMap = new Map(secretarias.map((s) => [s.id, s]));
  const userMap = new Map(usuarios.map((u) => [u.id, u]));

  const rankingMap = new Map<
    string,
    {
      secretariaId: string;
      nome: string;
      sigla: string | null;
      eventosRealizados: number;
    }
  >();

  const porStatus = {
    EM_PRODUCAO: 0,
    PUBLICADO: 0,
    CANCELADA: 0,
  };

  let totalRealizadas = 0;
  let totalFuturas = 0;
  let totalCanceladas = 0;

  const eventosDetalhados = eventosPeriodo.map((ev) => {
    const sec = secMap.get(ev.secretariaId) ?? {
      id: ev.secretariaId,
      nome: "Secretaria",
      sigla: null,
    };
    const autor = userMap.get(ev.criadoPorId);
    const tipoEfetivo = resolverTipoEventoEfetivo(ev.tipo, ev.dataRealizacao);
    const statusNorm = normalizarStatusEvento(ev.status);

    porStatus[statusNorm] += 1;

    if (statusNorm === "CANCELADA") {
      totalCanceladas += 1;
    } else if (tipoEfetivo === "FUTURA") {
      totalFuturas += 1;
    } else {
      totalRealizadas += 1;
      // Ranking considera APENAS ações já realizadas (não futuras e não canceladas)
      const current = rankingMap.get(sec.id) ?? {
        secretariaId: sec.id,
        nome: sec.nome,
        sigla: sec.sigla,
        eventosRealizados: 0,
      };
      current.eventosRealizados += 1;
      rankingMap.set(sec.id, current);
    }

    return {
      id: ev.id,
      titulo: ev.titulo,
      tipo: tipoEfetivo,
      dataRealizacao: ev.dataRealizacao,
      local: ev.local,
      resumo: ev.resumo,
      status: statusNorm,
      secretaria: { id: sec.id, nome: sec.nome, sigla: sec.sigla },
      criadoPor: autor?.name || ev.criadoPorNome || "Usuário",
    };
  });

  const rankingSecretarias = Array.from(rankingMap.values()).sort(
    (a, b) =>
      b.eventosRealizados - a.eventosRealizados ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );

  return {
    periodo: { mes: params.mes, ano: params.ano, secretariaId },
    kpis: {
      totalEventos: eventosPeriodo.length,
      totalRealizadas,
      totalFuturas,
      totalCanceladas,
      porStatus,
    },
    rankingSecretarias,
    eventos: eventosDetalhados,
  };
}
