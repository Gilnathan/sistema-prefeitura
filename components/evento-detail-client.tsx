"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EventoLogDoc, EventoStatus } from "@/lib/types";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  Clock,
  Copy,
  FileText,
  Film,
  Handshake,
  History,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { MediaGallery } from "@/components/media-gallery";
import { ResumableUploader } from "@/components/resumable-uploader";
import { atualizarStatusEventoAction } from "@/app/actions/eventos";
import { formatarDataBR, formatarDataHoraBR, formatarDataISO } from "@/lib/utils";

interface EventoDetailClientProps {
  isAdmin: boolean;
  isParceira: boolean;
  todasSecretarias: { id: string; nome: string }[];
  evento: {
    id: string;
    titulo: string;
    dataRealizacao: string;
    local: string;
    resumo: string;
    relatorioCompleto: string;
    status: EventoStatus;
    createdAt: string;
    secretaria: { id: string; nome: string; sigla: string | null };
    secretariasParceiras: { id: string; nome: string; sigla: string | null }[];
    orgaosParceirosExternos: string[];
    criadoPor: { id: string; name: string; email: string };
    editadoPor: { name: string; email: string; em: string } | null;
  };
}

const LOG_BADGE: Record<
  EventoLogDoc["acao"],
  { label: string; className: string }
> = {
  CRIACAO: {
    label: "Criação",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  EDICAO: {
    label: "Edição",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  STATUS_ALTERADO: {
    label: "Status",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  MIDIA_ADICIONADA: {
    label: "Mídia",
    className: "bg-purple-100 text-purple-800 border-purple-200",
  },
};

export function EventoDetailClient({
  isAdmin,
  isParceira,
  todasSecretarias,
  evento: initialEvento,
}: EventoDetailClientProps) {
  const router = useRouter();
  const [evento, setEvento] = useState(initialEvento);
  const [status, setStatus] = useState<EventoStatus>(initialEvento.status);
  const [copied, setCopied] = useState(false);
  const [galleryRefresh, setGalleryRefresh] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Modal de Exclusão (somente ADMIN)
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/eventos/${evento.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao excluir ação");
      toast.success("Ação excluída com sucesso.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir ação.");
      setDeleting(false);
    }
  }

  // Modal de Edição da Ação
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editTitulo, setEditTitulo] = useState(initialEvento.titulo);
  const [editData, setEditData] = useState(
    formatarDataISO(initialEvento.dataRealizacao)
  );
  const [editLocal, setEditLocal] = useState(initialEvento.local);
  const [editResumo, setEditResumo] = useState(initialEvento.resumo);
  const [editRelatorio, setEditRelatorio] = useState(
    initialEvento.relatorioCompleto
  );
  const [editParceirasIds, setEditParceirasIds] = useState<string[]>(
    initialEvento.secretariasParceiras.map((p) => p.id)
  );
  const [editOrgaosExternos, setEditOrgaosExternos] = useState<string[]>(
    initialEvento.orgaosParceirosExternos
  );
  const [novoOrgaoEdit, setNovoOrgaoEdit] = useState("");

  // Modal discreto de Registros (Auditoria)
  const [logsOpen, setLogsOpen] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logs, setLogs] = useState<EventoLogDoc[]>([]);
  const [logsResumo, setLogsResumo] = useState<{
    totalRegistros: number;
    totalFotos: number;
    totalVideos: number;
    totalMidias: number;
  } | null>(null);

  function openEditModal() {
    setEditTitulo(evento.titulo);
    setEditData(formatarDataISO(evento.dataRealizacao));
    setEditLocal(evento.local);
    setEditResumo(evento.resumo);
    setEditRelatorio(evento.relatorioCompleto);
    setEditParceirasIds(evento.secretariasParceiras.map((p) => p.id));
    setEditOrgaosExternos(evento.orgaosParceirosExternos);
    setNovoOrgaoEdit("");
    setEditOpen(true);
  }

  function toggleEditParceira(id: string) {
    setEditParceirasIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function addEditOrgao() {
    const clean = novoOrgaoEdit.trim();
    if (clean.length < 2) return;
    if (!editOrgaosExternos.some((o) => o.toLowerCase() === clean.toLowerCase())) {
      setEditOrgaosExternos((prev) => [...prev, clean]);
    }
    setNovoOrgaoEdit("");
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/eventos/${evento.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: editTitulo.trim(),
          dataRealizacao: editData,
          local: editLocal.trim(),
          resumo: editResumo.trim(),
          relatorioCompleto: editRelatorio.trim(),
          secretariasParceirasIds: editParceirasIds,
          orgaosParceirosExternos: editOrgaosExternos,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar alterações");

      const novasParceiras = editParceirasIds
        .map((id) => todasSecretarias.find((s) => s.id === id))
        .filter((s): s is { id: string; nome: string } => Boolean(s))
        .map((s) => ({ id: s.id, nome: s.nome, sigla: null }));

      setEvento((prev) => ({
        ...prev,
        titulo: data.evento.titulo,
        dataRealizacao: data.evento.dataRealizacao,
        local: data.evento.local,
        resumo: data.evento.resumo,
        relatorioCompleto: data.evento.relatorioCompleto,
        secretariasParceiras: novasParceiras,
        orgaosParceirosExternos: editOrgaosExternos,
        editadoPor: data.evento.editadoPorEmail
          ? {
              name: data.evento.editadoPorNome || "",
              email: data.evento.editadoPorEmail,
              em: data.evento.editadoEm || data.evento.updatedAt,
            }
          : prev.editadoPor,
      }));
      toast.success("Ação atualizada e alteração registrada no histórico!");
      setEditOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao editar ação.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function openLogsModal() {
    setLogsOpen(true);
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/eventos/${evento.id}/logs`);
      if (!res.ok) throw new Error("Erro ao carregar registros");
      const data = await res.json();
      setLogs(data.logs || []);
      setLogsResumo(data.resumo || null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao carregar registros."
      );
    } finally {
      setLoadingLogs(false);
    }
  }

  function handleStatusChange(novoStatus: EventoStatus) {
    if (novoStatus === status) return;
    startTransition(async () => {
      const res = await atualizarStatusEventoAction(evento.id, novoStatus);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      setStatus(novoStatus);
      toast.success("Status da ação atualizado!");
    });
  }

  async function handleCopyRelatorio() {
    const parceirosLista = [
      ...evento.secretariasParceiras.map((p) => `Secretaria de ${p.nome}`),
      ...evento.orgaosParceirosExternos,
    ];

    const textoFormatado = [
      `AÇÃO: ${evento.titulo}`,
      `SECRETARIA: ${evento.secretaria.nome}`,
      ...(parceirosLista.length > 0
        ? [`PARCERIA: ${parceirosLista.join(", ")}`]
        : []),
      `DATA: ${formatarDataBR(evento.dataRealizacao)}`,
      `LOCAL: ${evento.local}`,
      "",
      "RESUMO:",
      evento.resumo,
      "",
      "RELATÓRIO COMPLETO:",
      evento.relatorioCompleto,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(textoFormatado);
      setCopied(true);
      toast.success(
        "Texto da ação e relatório copiado para a área de transferência!"
      );
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para ações realizadas
          </Link>

          <div className="flex flex-wrap items-center gap-2.5">
            <StatusBadge status={status} />
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
              <Building2 className="h-3.5 w-3.5" />
              {evento.secretaria.nome}
            </span>
            {isParceira && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-800 border border-sky-200 px-2.5 py-0.5 text-xs font-semibold">
                <Handshake className="h-3.5 w-3.5" />
                Sua secretaria é parceira
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {evento.titulo}
          </h1>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-primary" />
              {formatarDataBR(evento.dataRealizacao)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-primary" />
              {evento.local}
            </span>
          </div>

          {(evento.secretariasParceiras.length > 0 ||
            evento.orgaosParceirosExternos.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
              <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
                <Handshake className="h-3.5 w-3.5 text-primary" />
                Parceiros:
              </span>
              {evento.secretariasParceiras.map((p) => (
                <span
                  key={p.id}
                  className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 font-medium"
                >
                  Sec. {p.nome}
                </span>
              ))}
              {evento.orgaosParceirosExternos.map((org) => (
                <span
                  key={org}
                  className="rounded-full bg-secondary text-secondary-foreground px-2.5 py-0.5 font-medium"
                >
                  {org}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Ações e Controle de Fluxo */}
        <div className="flex flex-col gap-2.5 lg:w-72 shrink-0">
          {isAdmin && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <label
                  htmlFor="status-select"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Status da Publicação (Agência)
                </label>
                <div className="flex items-center gap-2">
                  <select
                    id="status-select"
                    disabled={isPending}
                    value={status}
                    onChange={(e) =>
                      handleStatusChange(e.target.value as EventoStatus)
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="NOVO">Novo</option>
                    <option value="EM_PRODUCAO">Em Produção</option>
                    <option value="PUBLICADO">Publicado</option>
                  </select>
                  {isPending && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={openEditModal}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar Ação
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setDeleteOpen(true)}
                title="Excluir ação"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Resumo e Relatório Completo */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              Resumo & Relatório Completo
            </CardTitle>
            <CardDescription>
              Informações registradas pela secretaria para redação, imprensa e redes sociais.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyRelatorio}
            className="shrink-0"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" />
                Texto Copiado
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copiar Texto
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Resumo Objetivo
            </h3>
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {evento.resumo}
            </p>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Relatório Detalhado
            </h3>
            <div className="rounded-lg bg-muted/40 border p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {evento.relatorioCompleto}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Galeria Paginada */}
      <Card>
        <CardHeader>
          <CardTitle>Galeria de Mídias</CardTitle>
          <CardDescription>
            Clique em uma foto para abrir em alta resolução ou use os botões para download direto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MediaGallery eventoId={evento.id} refreshTrigger={galleryRefresh} />
        </CardContent>
      </Card>

      {/* Envio Adicional de Mídias */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UploadCloud className="h-5 w-5 text-primary" />
            Adicionar mais Fotos ou Vídeos
          </CardTitle>
          <CardDescription>
            Novos arquivos serão salvos automaticamente na pasta desta ação e registrados no histórico com sua assinatura.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResumableUploader
            eventoId={evento.id}
            onUploadComplete={() => setGalleryRefresh((n) => n + 1)}
          />
        </CardContent>
      </Card>

      {/* Botão discreto de Registros (Auditoria completa da ação) */}
      <div className="flex items-center justify-end pt-2">
        <button
          type="button"
          onClick={openLogsModal}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
          title="Ver registros de criação, edições e mídias adicionadas"
        >
          <History className="h-3 w-3" />
          Registros
        </button>
      </div>

      {/* Modal de Confirmação de Exclusão (somente ADMIN) */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Excluir ação &quot;{evento.titulo}&quot;?
            </DialogTitle>
            <DialogDescription>
              Esta ação removerá o registro, o relatório e o histórico desta ação do portal. Os arquivos originais já salvos no Google Drive permanecem intactos.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
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

      {/* Modal de Edição da Ação */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Ação Realizada</DialogTitle>
            <DialogDescription>
              Toda alteração ficará assinada com o seu login e registrada no histórico da ação.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-titulo">Título da Ação *</Label>
              <Input
                id="edit-titulo"
                value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-data">Data de Realização *</Label>
                <Input
                  id="edit-data"
                  type="date"
                  value={editData}
                  onChange={(e) => setEditData(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-local">Local *</Label>
                <Input
                  id="edit-local"
                  value={editLocal}
                  onChange={(e) => setEditLocal(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-resumo">Resumo *</Label>
              <Textarea
                id="edit-resumo"
                rows={3}
                value={editResumo}
                onChange={(e) => setEditResumo(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-relatorio">Relatório Completo *</Label>
              <Textarea
                id="edit-relatorio"
                rows={6}
                value={editRelatorio}
                onChange={(e) => setEditRelatorio(e.target.value)}
                required
              />
            </div>

            {/* Editar Secretarias & Órgãos Parceiros */}
            <div className="rounded-lg border bg-muted/25 p-3.5 space-y-3">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Handshake className="h-3.5 w-3.5 text-primary" />
                Secretarias & Órgãos Parceiros
              </p>

              <div className="flex flex-wrap gap-1.5">
                {todasSecretarias
                  .filter((s) => s.id !== evento.secretaria.id)
                  .map((sec) => {
                    const selected = editParceirasIds.includes(sec.id);
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => toggleEditParceira(sec.id)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-white text-foreground border-input hover:border-primary/50"
                        }`}
                      >
                        {sec.nome}
                        {selected && <X className="h-3 w-3" />}
                      </button>
                    );
                  })}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Adicionar outro órgão externo..."
                  value={novoOrgaoEdit}
                  onChange={(e) => setNovoOrgaoEdit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addEditOrgao();
                    }
                  }}
                  className="bg-white h-9 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEditOrgao}
                  disabled={novoOrgaoEdit.trim().length < 2}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar
                </Button>
              </div>

              {editOrgaosExternos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {editOrgaosExternos.map((org) => (
                    <span
                      key={org}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
                    >
                      {org}
                      <button
                        type="button"
                        onClick={() =>
                          setEditOrgaosExternos((prev) =>
                            prev.filter((o) => o !== org)
                          )
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={savingEdit}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Registros / Auditoria */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Registros & Assinaturas da Ação
            </DialogTitle>
            <DialogDescription>
              Histórico completo de criação, edições, mudanças de status e mídias adicionadas.
            </DialogDescription>
          </DialogHeader>

          {/* Resumo de Assinatura: Criação & Última Atualização */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-lg border bg-muted/20 p-3 text-xs">
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                <User className="h-3 w-3 text-primary" />
                Criado por
              </p>
              <p className="font-medium text-foreground truncate">
                {evento.criadoPor.email || evento.criadoPor.name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {evento.criadoPor.name} • {formatarDataHoraBR(evento.createdAt)}
              </p>
            </div>

            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                <Clock className="h-3 w-3 text-amber-600" />
                Última atualização
              </p>
              {logs[0] ? (
                <>
                  <p className="font-medium text-foreground truncate">
                    {logs[0].usuarioEmail}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {logs[0].usuarioNome} • {formatarDataHoraBR(logs[0].createdAt)}
                  </p>
                </>
              ) : evento.editadoPor ? (
                <>
                  <p className="font-medium text-foreground truncate">
                    {evento.editadoPor.email}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {evento.editadoPor.name} • {formatarDataHoraBR(evento.editadoPor.em)}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Nenhuma atualização após a criação
                </p>
              )}
            </div>
          </div>

          {logsResumo && (
            <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-center">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase">
                  Registros
                </p>
                <p className="text-lg font-bold">{logsResumo.totalRegistros}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase inline-flex items-center gap-1 justify-center">
                  <ImageIcon className="h-3 w-3 text-blue-600" />
                  Fotos
                </p>
                <p className="text-lg font-bold">{logsResumo.totalFotos}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase inline-flex items-center gap-1 justify-center">
                  <Film className="h-3 w-3 text-purple-600" />
                  Vídeos
                </p>
                <p className="text-lg font-bold">{logsResumo.totalVideos}</p>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-1 space-y-3 mt-1">
            {loadingLogs ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Carregando registros...</span>
              </div>
            ) : logs.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                Nenhum registro detalhado encontrado para esta ação (criada antes da ativação do histórico).
              </div>
            ) : (
              logs.map((log) => {
                const badge = LOG_BADGE[log.acao];
                return (
                  <div
                    key={log.id}
                    className="rounded-lg border bg-card p-3.5 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={`text-[11px] ${badge.className}`}
                        >
                          {badge.label}
                        </Badge>
                        <span className="text-xs font-medium text-foreground">
                          {log.usuarioEmail}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          ({log.usuarioNome})
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {formatarDataHoraBR(log.createdAt)}
                      </span>
                    </div>

                    <p className="text-sm text-foreground">{log.descricao}</p>

                    {log.changes && log.changes.length > 0 && (
                      <div className="space-y-1.5 pt-1 border-t">
                        {log.changes.map((ch, idx) => (
                          <div
                            key={`${log.id}-ch-${idx}`}
                            className="text-xs bg-muted/40 rounded px-2.5 py-1.5 space-y-0.5"
                          >
                            <p className="font-semibold text-foreground">
                              {ch.campo}
                            </p>
                            {ch.antes !== undefined && (
                              <p className="text-muted-foreground line-through">
                                Antes: {ch.antes}
                              </p>
                            )}
                            {ch.depois !== undefined && (
                              <p className="text-emerald-700">
                                Depois: {ch.depois}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
