"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EventoStatus, EventoTipo } from "@/lib/types";
import { toast } from "sonner";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Film,
  Handshake,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MESES_PT } from "@/lib/utils";
import type { EventosPaginadosDTO } from "@/lib/data-loaders";

interface SecretariaOption {
  id: string;
  nome: string;
  sigla: string | null;
}

interface EventoListItem {
  id: string;
  titulo: string;
  tipo: EventoTipo;
  dataRealizacao: string;
  local: string;
  resumo: string;
  status: EventoStatus;
  secretaria: { id: string; nome: string; sigla: string | null };
  secretariasParceiras?: { id: string; nome: string; sigla: string | null }[];
  orgaosParceirosExternos?: string[];
  isParceira?: boolean;
  criadoPor: { id: string; name: string; email?: string };
  editadoPor?: { name: string; email: string; em: string } | null;
  totalMidias: number;
  totalFotos: number;
  totalVideos: number;
}

interface EventosListClientProps {
  isAdmin: boolean;
  secretariaNome: string | null;
  secretarias: SecretariaOption[];
  initialData?: EventosPaginadosDTO;
}

const MESES_CURTOS = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];

function extrairPartesData(iso: string) {
  const d = new Date(iso);
  return {
    dia: String(d.getUTCDate()).padStart(2, "0"),
    mesCurto: MESES_CURTOS[d.getUTCMonth()] || "",
    ano: d.getUTCFullYear(),
  };
}

export function EventosListClient({
  isAdmin,
  secretariaNome,
  secretarias,
  initialData,
}: EventosListClientProps) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const years = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2];

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<"" | EventoTipo | "CANCELADA">("");
  const [secretariaId, setSecretariaId] = useState("TODAS");
  const [mes, setMes] = useState("");
  const [ano, setAno] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(!initialData);
  const [items, setItems] = useState<EventoListItem[]>(initialData?.items ?? []);
  const [total, setTotal] = useState(initialData?.pagination.total ?? 0);
  const [totalPages, setTotalPages] = useState(
    initialData?.pagination.totalPages ?? 1
  );
  const skipInitialFetch = useRef(Boolean(initialData));
  const [deleteTarget, setDeleteTarget] = useState<EventoListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/eventos/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao excluir ação");
      setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setTotal((t) => Math.max(0, t - 1));
      toast.success(`Ação "${deleteTarget.titulo}" excluída.`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir ação.");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const loadEventos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "10",
      });
      if (debouncedQ) params.set("q", debouncedQ);
      if (tipoFiltro) params.set("tipo", tipoFiltro);
      if (isAdmin && secretariaId !== "TODAS") {
        params.set("secretariaId", secretariaId);
      }
      if (ano) params.set("ano", ano);
      if (mes && ano) params.set("mes", mes);

      const res = await fetch(`/api/eventos?${params}`);
      if (!res.ok) throw new Error("Falha ao buscar ações");
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.pagination?.total ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ, tipoFiltro, isAdmin, secretariaId, ano, mes]);

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    loadEventos();
  }, [loadEventos]);

  function limparFiltros() {
    setQ("");
    setTipoFiltro("");
    setSecretariaId("TODAS");
    setMes("");
    setAno("");
    setPage(1);
  }

  const hasFilters = Boolean(
    q || tipoFiltro || secretariaId !== "TODAS" || mes || ano
  );

  return (
    <div className="space-y-5">
      {/* Cabeçalho limpo */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#0E3A5D]">
            {isAdmin
              ? "Ações do Município"
              : `Ações — ${secretariaNome || "Secretaria"}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdmin
              ? "Acompanhamento de ações realizadas e agendadas pelas secretarias."
              : "Registro de ações realizadas e agenda da sua secretaria."}
          </p>
        </div>

        <Button asChild size="default" className="w-full sm:w-auto shrink-0">
          <Link href="/eventos/novo">
            <CalendarPlus className="h-4 w-4" />
            Nova Ação
          </Link>
        </Button>
      </div>

      {/* Abas limpas + legenda discreta de cor */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/80">
        <div className="flex items-center gap-6 -mb-px overflow-x-auto">
          {(
            [
              { value: "", label: "Todas" },
              { value: "REALIZADA", label: "Realizadas" },
              { value: "FUTURA", label: "Futuras" },
              { value: "CANCELADA", label: "Canceladas" },
            ] as const
          ).map((tab) => {
            const active = tipoFiltro === tab.value;
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => {
                  setTipoFiltro(tab.value);
                  setPage(1);
                }}
                className={`relative pb-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "text-[#0E3A5D]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {active && (
                  <span
                    className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full ${
                      tab.value === "FUTURA"
                        ? "bg-sky-600"
                        : tab.value === "REALIZADA"
                        ? "bg-[#128C23]"
                        : tab.value === "CANCELADA"
                        ? "bg-red-500"
                        : "bg-[#0E3A5D]"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="hidden sm:flex items-center gap-4 pb-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#128C23]" />
            Realizada
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            Futura
          </span>
          <span className="text-border">|</span>
          <span>
            {total} {total === 1 ? "registro" : "registros"}
          </span>
        </div>
      </div>

      {/* Barra de busca e filtros enxuta (sem caixa pesada) */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Buscar por título, local ou resumo..."
            className="pl-9 h-9 bg-white border-border/80 text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          {isAdmin && (
            <select
              aria-label="Filtrar por Secretaria"
              className="h-9 rounded-md border border-border/80 bg-white px-2.5 text-xs sm:text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={secretariaId}
              onChange={(e) => {
                setSecretariaId(e.target.value);
                setPage(1);
              }}
            >
              <option value="TODAS">Todas Secretarias</option>
              {secretarias.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.nome}
                </option>
              ))}
            </select>
          )}

          <select
            aria-label="Filtrar por Mês"
            className="h-9 rounded-md border border-border/80 bg-white px-2.5 text-xs sm:text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={mes}
            onChange={(e) => {
              const val = e.target.value;
              setMes(val);
              if (val && !ano) setAno(String(currentYear));
              setPage(1);
            }}
          >
            <option value="">Mês</option>
            {MESES_PT.map((nomeMes, i) => (
              <option key={nomeMes} value={String(i + 1)}>
                {nomeMes}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por Ano"
            className="h-9 rounded-md border border-border/80 bg-white px-2.5 text-xs sm:text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={ano}
            onChange={(e) => {
              setAno(e.target.value);
              if (!e.target.value) setMes("");
              setPage(1);
            }}
          >
            <option value="">Ano</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>

          {hasFilters && (
            <button
              type="button"
              onClick={limparFiltros}
              className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1 h-9 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Lista Unificada Clean (sem excesso de bordas/pílulas) */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white py-14 px-4 text-center space-y-2.5">
          <p className="text-sm font-medium text-foreground">
            Nenhuma ação encontrada
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Ajuste os filtros acima ou registre uma nova ação realizada ou agendada.
          </p>
          <div className="pt-1">
            <Button asChild size="sm">
              <Link href="/eventos/novo">
                <CalendarPlus className="h-4 w-4" />
                Nova Ação
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border/80 bg-white overflow-hidden divide-y divide-border/60 shadow-2xs">
          {items.map((ev) => {
            const isCancelada = ev.status === "CANCELADA";
            const isFutura = ev.tipo === "FUTURA" && !isCancelada;
            const { dia, mesCurto } = extrairPartesData(ev.dataRealizacao);
            const parceirosNomes = [
              ...(ev.secretariasParceiras?.map((p) => p.nome) || []),
              ...(ev.orgaosParceirosExternos || []),
            ];

            return (
              <div
                key={ev.id}
                onClick={() => router.push(`/eventos/${ev.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/eventos/${ev.id}`);
                  }
                }}
                className={`group relative flex flex-col sm:flex-row sm:items-center gap-3.5 sm:gap-5 px-4 sm:px-5 py-4 cursor-pointer transition-colors border-l-[3px] ${
                  isCancelada
                    ? "border-l-red-400 bg-red-50/20 hover:bg-red-50/40 opacity-80"
                    : isFutura
                    ? "border-l-sky-500 bg-sky-50/30 hover:bg-sky-50/65"
                    : "border-l-[#128C23] bg-white hover:bg-slate-50/75"
                }`}
              >
                {/* Bloco de Data Minimalista */}
                <div className="flex sm:flex-col items-center sm:justify-center gap-2 sm:gap-0 sm:w-14 shrink-0">
                  <div
                    className={`flex sm:flex-col items-baseline sm:items-center gap-1 sm:gap-0 rounded-lg px-2.5 py-1 sm:py-1.5 sm:w-14 text-center ${
                      isCancelada
                        ? "bg-red-100/70 text-red-800"
                        : isFutura
                        ? "bg-sky-100/80 text-sky-900"
                        : "bg-slate-100/90 text-slate-800"
                    }`}
                  >
                    <span className="text-base sm:text-lg font-bold leading-none tabular-nums">
                      {dia}
                    </span>
                    <span className="text-[10px] font-semibold tracking-wider uppercase opacity-75">
                      {mesCurto}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide sm:mt-1 ${
                      isCancelada
                        ? "text-red-600"
                        : isFutura
                        ? "text-sky-700"
                        : "text-[#128C23]"
                    }`}
                  >
                    {isCancelada ? "Cancelada" : isFutura ? "Futura" : "Realizada"}
                  </span>
                </div>

                {/* Conteúdo Principal */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/eventos/${ev.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-[15px] font-semibold transition-colors truncate ${
                        isCancelada
                          ? "line-through text-muted-foreground"
                          : "text-foreground group-hover:text-[#0E3A5D]"
                      }`}
                    >
                      {ev.titulo}
                    </Link>
                    {ev.isParceira && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700">
                        <Handshake className="h-3 w-3" />
                        Parceira
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {ev.resumo}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground/90 pt-0.5">
                    <span className="font-medium text-foreground/80">
                      {ev.secretaria.nome}
                    </span>
                    <span className="text-border">•</span>
                    <span className="inline-flex items-center gap-1 truncate max-w-[240px]">
                      <MapPin className="h-3 w-3 shrink-0 opacity-65" />
                      <span className="truncate">{ev.local}</span>
                    </span>
                    {parceirosNomes.length > 0 && (
                      <>
                        <span className="text-border">•</span>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Handshake className="h-3 w-3 shrink-0 text-primary/80" />
                          <span>{parceirosNomes.join(", ")}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Coluna Direita: mídias e ações */}
                <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-5 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50 shrink-0">
                  {/* Contagem de mídias sutil */}
                  <div className="flex items-center gap-2.5 text-xs text-muted-foreground tabular-nums">
                    <span
                      className="inline-flex items-center gap-1"
                      title={`${ev.totalFotos} foto(s)`}
                    >
                      <ImageIcon className="h-3.5 w-3.5 opacity-70" />
                      {ev.totalFotos}
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      title={`${ev.totalVideos} vídeo(s)`}
                    >
                      <Film className="h-3.5 w-3.5 opacity-70" />
                      {ev.totalVideos}
                    </span>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1">
                    {isAdmin && (
                      <button
                        type="button"
                        title="Excluir ação"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(ev);
                        }}
                        className="p-1.5 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            Página <span className="font-medium text-foreground">{page}</span> de{" "}
            <span className="font-medium text-foreground">{totalPages}</span>
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 bg-white"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 bg-white"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão de Ação (somente ADMIN) */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Excluir ação &quot;{deleteTarget?.titulo}&quot;?
            </DialogTitle>
            <DialogDescription>
              Esta ação removerá o registro, o relatório e o histórico desta ação do portal. Os arquivos originais já salvos no Google Drive permanecem intactos.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Exclusão
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
