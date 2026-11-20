"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { EventoStatus } from "@/lib/types";
import { toast } from "sonner";
import {
  Calendar,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Film,
  Handshake,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Search,
  SlidersHorizontal,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { MESES_PT, formatarDataBR } from "@/lib/utils";

interface SecretariaOption {
  id: string;
  nome: string;
  sigla: string | null;
}

interface EventoListItem {
  id: string;
  titulo: string;
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
}

export function EventosListClient({
  isAdmin,
  secretariaNome,
  secretarias,
}: EventosListClientProps) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2];

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("");
  const [secretariaId, setSecretariaId] = useState("TODAS");
  const [mes, setMes] = useState("");
  const [ano, setAno] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EventoListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
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
    }, 350);
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
      if (status) params.set("status", status);
      if (isAdmin && secretariaId !== "TODAS") {
        params.set("secretariaId", secretariaId);
      }
      if (ano) params.set("ano", ano);
      if (mes && ano) params.set("mes", mes);

      const res = await fetch(`/api/eventos?${params}`);
      if (!res.ok) throw new Error("Falha ao buscar demandas");
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.pagination?.total ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ, status, isAdmin, secretariaId, ano, mes]);

  useEffect(() => {
    loadEventos();
  }, [loadEventos]);

  function limparFiltros() {
    setQ("");
    setStatus("");
    setSecretariaId("TODAS");
    setMes("");
    setAno("");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isAdmin
              ? "Ações Realizadas — Todas as Secretarias"
              : `Ações Realizadas — Secretaria de ${secretariaNome || ""}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdmin
              ? "Acompanhe ações realizadas, relatórios e mídias enviados pelas secretarias municipais."
              : "Acompanhe as ações realizadas registradas pela sua secretaria e o andamento da publicação."}
          </p>
        </div>

        <Button asChild size="default" className="w-full sm:w-auto shrink-0">
          <Link href="/eventos/novo">
            <CalendarPlus className="h-4 w-4" />
            Nova Ação
          </Link>
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
            <div className="relative lg:col-span-4">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, local ou resumo..."
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            {isAdmin && (
              <div className="lg:col-span-3">
                <select
                  aria-label="Filtrar por Secretaria"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={secretariaId}
                  onChange={(e) => {
                    setSecretariaId(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="TODAS">Todas as Secretarias</option>
                  {secretarias.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={isAdmin ? "lg:col-span-2" : "lg:col-span-3"}>
              <select
                aria-label="Filtrar por Status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos os Status</option>
                <option value="NOVO">Novo</option>
                <option value="EM_PRODUCAO">Em Produção</option>
                <option value="PUBLICADO">Publicado</option>
              </select>
            </div>

            <div className={isAdmin ? "lg:col-span-2" : "lg:col-span-3"}>
              <select
                aria-label="Filtrar por Mês"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={mes}
                onChange={(e) => {
                  const val = e.target.value;
                  setMes(val);
                  if (val && !ano) setAno(String(currentYear));
                  setPage(1);
                }}
              >
                <option value="">Todos os Meses</option>
                {MESES_PT.map((nomeMes, i) => (
                  <option key={nomeMes} value={String(i + 1)}>
                    {String(i + 1).padStart(2, "0")} - {nomeMes}
                  </option>
                ))}
              </select>
            </div>

            <div className={isAdmin ? "lg:col-span-1" : "lg:col-span-2"}>
              <select
                aria-label="Filtrar por Ano"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {total} {total === 1 ? "evento encontrado" : "eventos encontrados"}
            </span>
            {(q || status || secretariaId !== "TODAS" || mes || ano) && (
              <button
                type="button"
                onClick={limparFiltros}
                className="text-primary hover:underline font-medium"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de Eventos */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando demandas...</span>
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <p className="text-base font-medium">Nenhuma demanda encontrada</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Não há eventos registrados para os filtros selecionados. Clique abaixo para cadastrar uma nova ação.
            </p>
            <Button asChild className="mt-2">
              <Link href="/eventos/novo">
                <CalendarPlus className="h-4 w-4" />
                Cadastrar Primeiro Evento
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((ev, index) => (
            <Card
              key={ev.id}
              className="group card-interactive animate-fade-up"
              style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }}
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={ev.status} />
                      <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {ev.secretaria.nome}
                      </span>
                      {ev.isParceira && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-800 border border-sky-200 px-2 py-0.5 text-[11px] font-semibold">
                          <Handshake className="h-3 w-3" />
                          Parceira
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 text-primary/80" />
                        {formatarDataBR(ev.dataRealizacao)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 text-primary/80" />
                        {ev.local}
                      </span>
                    </div>

                    <Link
                      href={`/eventos/${ev.id}`}
                      className="block text-base sm:text-lg font-semibold hover:text-primary transition-colors truncate"
                    >
                      {ev.titulo}
                    </Link>

                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {ev.resumo}
                    </p>

                    {((ev.secretariasParceiras && ev.secretariasParceiras.length > 0) ||
                      (ev.orgaosParceirosExternos && ev.orgaosParceirosExternos.length > 0)) && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
                        <Handshake className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>Parceria:</span>
                        {ev.secretariasParceiras?.map((p) => (
                          <span
                            key={p.id}
                            className="rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium"
                          >
                            Sec. {p.nome}
                          </span>
                        ))}
                        {ev.orgaosParceirosExternos?.map((org) => (
                          <span
                            key={org}
                            className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground/80"
                          >
                            {org}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between md:flex-col md:items-end gap-3 shrink-0 border-t md:border-t-0 pt-3 md:pt-0">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5 text-primary" />
                        {ev.totalFotos} foto{ev.totalFotos === 1 ? "" : "s"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Film className="h-3.5 w-3.5 text-[#1373E6]" />
                        {ev.totalVideos} vídeo{ev.totalVideos === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button asChild variant="outline" size="sm" className="group-hover:border-primary/50 group-hover:text-primary">
                        <Link href={`/eventos/${ev.id}`}>
                          Abrir Ação
                          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                        </Link>
                      </Button>
                      {isAdmin && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:border-destructive/50"
                          title="Excluir ação"
                          onClick={() => setDeleteTarget(ev)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Paginação Server-Side */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Página <span className="font-medium text-foreground">{page}</span> de{" "}
            <span className="font-medium text-foreground">{totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
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
