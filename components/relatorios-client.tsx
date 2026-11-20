"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { EventoStatus } from "@/lib/types";
import { toast } from "sonner";
import {
  Award,
  CalendarCheck2,
  FileBarChart2,
  FileDown,
  FileSpreadsheet,
  Film,
  Image as ImageIcon,
  Loader2,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { MESES_PT, STATUS_CONFIG, formatarDataBR } from "@/lib/utils";

interface SecretariaOption {
  id: string;
  nome: string;
  sigla: string | null;
}

interface RelatorioResponse {
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

export function RelatoriosClient({
  isAdmin,
  secretarias,
  userSecretariaId,
  userSecretariaNome,
  initialMes,
  initialAno,
  initialData,
}: {
  isAdmin: boolean;
  secretarias: SecretariaOption[];
  userSecretariaId: string | null;
  userSecretariaNome: string | null;
  initialMes?: number;
  initialAno?: number;
  initialData?: RelatorioResponse;
}) {
  const now = new Date();
  const [mes, setMes] = useState(initialMes ?? now.getMonth() + 1);
  const [ano, setAno] = useState(initialAno ?? now.getFullYear());
  const [secretariaId, setSecretariaId] = useState(
    isAdmin ? "TODAS" : userSecretariaId ?? ""
  );
  const [loading, setLoading] = useState(!initialData);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [data, setData] = useState<RelatorioResponse | null>(initialData ?? null);
  const skipInitialFetch = useRef(Boolean(initialData));

  const years = [
    now.getFullYear() + 1,
    now.getFullYear(),
    now.getFullYear() - 1,
    now.getFullYear() - 2,
  ];

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        mes: String(mes),
        ano: String(ano),
        secretariaId,
      });
      const res = await fetch(`/api/relatorios/mensal?${params}`);
      if (!res.ok) throw new Error("Falha ao carregar relatório");
      const json: RelatorioResponse = await res.json();
      setData(json);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao gerar relatório."
      );
    } finally {
      setLoading(false);
    }
  }, [mes, ano, secretariaId]);

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    loadReport();
  }, [loadReport]);

  const mesNome = MESES_PT[mes - 1] || "";
  const secretariaFiltroNome = !isAdmin
    ? `Secretaria de ${userSecretariaNome || ""}`
    : secretariaId === "TODAS"
    ? "Todas as Secretarias"
    : secretarias.find((s) => s.id === secretariaId)?.nome || "Secretaria";

  function handleExportCSV() {
    if (!data) return;
    const headers = [
      "Data",
      "Secretaria",
      "Título do Evento",
      "Local",
      "Status",
      "Fotos",
      "Vídeos",
      "Total Mídias",
      "Responsável",
    ];

    const escapeCsv = (val: string | number) => {
      const str = String(val ?? "").replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = data.eventos.map((ev) => [
      formatarDataBR(ev.dataRealizacao),
      ev.secretaria.nome,
      ev.titulo,
      ev.local,
      STATUS_CONFIG[ev.status].label,
      ev.fotos,
      ev.videos,
      ev.totalMidias,
      ev.criadoPor,
    ]);

    const csvContent =
      "\uFEFF" +
      [headers, ...rows].map((row) => row.map(escapeCsv).join(";")).join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Relatorio_Belmonte_${ano}_${String(mes).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Planilha CSV exportada com sucesso!");
  }

  async function handleExportPDF() {
    if (!data) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Cabeçalho institucional — Azul Belmonte + filete Verde/Dourado
      doc.setFillColor(14, 58, 93);
      doc.rect(0, 0, pageWidth, 82, "F");
      doc.setFillColor(18, 140, 35);
      doc.rect(0, 82, pageWidth, 3, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("PREFEITURA MUNICIPAL DE BELMONTE", 40, 34);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(
        `Relatório Mensal de Ações Realizadas — ${mesNome} / ${ano}`,
        40,
        52
      );
      doc.text(`Escopo: ${secretariaFiltroNome}`, 40, 67);

      // Resumo KPIs
      doc.setTextColor(17, 34, 23);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Resumo Executivo do Período", 40, 108);

      autoTable(doc, {
        startY: 116,
        head: [["Total de Ações", "Total de Fotos", "Total de Vídeos", "Publicadas", "Em Produção", "Novas"]],
        body: [
          [
            String(data.kpis.totalEventos),
            String(data.kpis.totalFotos),
            String(data.kpis.totalVideos),
            String(data.kpis.porStatus.PUBLICADO),
            String(data.kpis.porStatus.EM_PRODUCAO),
            String(data.kpis.porStatus.NOVO),
          ],
        ],
        theme: "grid",
        headStyles: { fillColor: [18, 140, 35], textColor: 255, fontSize: 9 },
        bodyStyles: { halign: "center", fontStyle: "bold", fontSize: 10 },
        margin: { left: 40, right: 40 },
      });

      // Ranking de Secretarias
      const afterKpiY =
        (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
          ?.finalY || 170;

      if (isAdmin && data.rankingSecretarias.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Ranking de Secretarias Mais Ativas", 40, afterKpiY + 24);

        autoTable(doc, {
          startY: afterKpiY + 32,
          head: [["#", "Secretaria", "Eventos", "Fotos", "Vídeos"]],
          body: data.rankingSecretarias.map((r, idx) => [
            `${idx + 1}º`,
            r.nome,
            String(r.eventos),
            String(r.fotos),
            String(r.videos),
          ]),
          theme: "striped",
          headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          margin: { left: 40, right: 40 },
        });
      }

      // Tabela Cronológica de Eventos
      const afterRankY =
        (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
          ?.finalY || afterKpiY + 40;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Detalhamento Cronológico de Eventos", 40, afterRankY + 26);

      autoTable(doc, {
        startY: afterRankY + 34,
        head: [["Data", "Secretaria", "Evento / Local", "Status", "Fotos", "Vídeos"]],
        body: data.eventos.map((ev) => [
          formatarDataBR(ev.dataRealizacao),
          ev.secretaria.nome,
          `${ev.titulo}\n(${ev.local})`,
          STATUS_CONFIG[ev.status].label,
          String(ev.fotos),
          String(ev.videos),
        ]),
        theme: "striped",
        headStyles: { fillColor: [14, 58, 93], textColor: 255, fontSize: 8.5 },
        bodyStyles: { fontSize: 8.5, valign: "middle" },
        columnStyles: {
          0: { cellWidth: 58 },
          1: { cellWidth: 85 },
          3: { cellWidth: 68 },
          4: { cellWidth: 40, halign: "center" },
          5: { cellWidth: 42, halign: "center" },
        },
        margin: { left: 40, right: 40 },
      });

      // Rodapé de paginação
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `Portal de Demandas — Prefeitura de Belmonte | Gerado em ${new Date().toLocaleDateString("pt-BR")}`,
          40,
          doc.internal.pageSize.getHeight() - 24
        );
        doc.text(
          `Página ${i} de ${totalPages}`,
          pageWidth - 95,
          doc.internal.pageSize.getHeight() - 24
        );
      }

      doc.save(`Relatorio_Belmonte_${ano}_${String(mes).padStart(2, "0")}.pdf`);
      toast.success("Relatório PDF exportado com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar PDF.");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileBarChart2 className="h-6 w-6 text-primary" />
            Relatórios Mensais — Prestação de Contas
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Consolidado de eventos, mídias recebidas e desempenho das secretarias em{" "}
            <span className="font-medium text-foreground">
              {mesNome} de {ano}
            </span>{" "}
            ({secretariaFiltroNome}).
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            disabled={!data}
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={!data}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar CSV / Excel
          </Button>
          <Button
            size="sm"
            onClick={handleExportPDF}
            disabled={!data || exportingPdf}
          >
            {exportingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Filtros de Período */}
      <Card className="no-print">
        <CardContent className="p-4">
          <div className={isAdmin ? "grid grid-cols-1 sm:grid-cols-3 gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Mês de Referência
              </label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
              >
                {MESES_PT.map((nome, idx) => (
                  <option key={nome} value={idx + 1}>
                    {String(idx + 1).padStart(2, "0")} - {nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Ano
              </label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {isAdmin && (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Secretaria
                </label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={secretariaId}
                  onChange={(e) => setSecretariaId(e.target.value)}
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
          </div>
        </CardContent>
      </Card>

      {loading || !data ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Consolidando indicadores do período...</span>
        </div>
      ) : (
        <>
          {/* Cards de KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="card-interactive animate-fade-up">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Total de Ações
                  </p>
                  <p className="text-3xl font-bold mt-1">
                    {data.kpis.totalEventos}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.kpis.porStatus.PUBLICADO} publicadas •{" "}
                    {data.kpis.porStatus.EM_PRODUCAO} em produção
                  </p>
                </div>
                <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <CalendarCheck2 className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="card-interactive animate-fade-up" style={{ animationDelay: "50ms" }}>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Fotos Recebidas
                  </p>
                  <p className="text-3xl font-bold mt-1">
                    {data.kpis.totalFotos}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Imagens arquivadas no período
                  </p>
                </div>
                <div className="h-11 w-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <ImageIcon className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="card-interactive animate-fade-up" style={{ animationDelay: "100ms" }}>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Vídeos Recebidos
                  </p>
                  <p className="text-3xl font-bold mt-1">
                    {data.kpis.totalVideos}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Vídeos enviados em alta qualidade
                  </p>
                </div>
                <div className="h-11 w-11 rounded-xl bg-blue-100 text-[#1373E6] flex items-center justify-center">
                  <Film className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="card-interactive animate-fade-up" style={{ animationDelay: "150ms" }}>
              <CardContent className="p-5 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    {isAdmin ? "Secretaria Destaque" : "Total de Mídias"}
                  </p>
                  <p className="text-xl font-bold mt-1 truncate">
                    {isAdmin
                      ? data.rankingSecretarias[0]?.nome || "—"
                      : data.kpis.totalMidias}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isAdmin
                      ? data.rankingSecretarias[0]
                        ? `${data.rankingSecretarias[0].eventos} ação(ões) no mês`
                        : "Sem registros no período"
                      : "Fotos + vídeos no período"}
                  </p>
                </div>
                <div className="h-11 w-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Award className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ranking de Secretarias (exibido apenas para ADMIN) */}
          {isAdmin && data.rankingSecretarias.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Ranking de Secretarias Mais Ativas
                </CardTitle>
                <CardDescription>
                  Classificação por volume de eventos e mídias enviadas em {mesNome}/{ano}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.rankingSecretarias.map((sec, idx) => {
                    const maxEventos = data.rankingSecretarias[0]?.eventos || 1;
                    const pct = Math.round((sec.eventos / maxEventos) * 100);
                    return (
                      <div key={sec.secretariaId} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">
                            {idx + 1}º {sec.nome}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            <strong className="text-foreground">{sec.eventos}</strong>{" "}
                            evento(s) • {sec.fotos} foto(s) • {sec.videos} vídeo(s)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabela Cronológica Detalhada */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Tabela Cronológica de Eventos ({data.eventos.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {data.eventos.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum evento registrado no período selecionado.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Data</th>
                      <th className="px-4 py-3 font-semibold">Secretaria</th>
                      <th className="px-4 py-3 font-semibold">Evento / Local</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold text-center">Fotos</th>
                      <th className="px-4 py-3 font-semibold text-center">Vídeos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.eventos.map((ev) => (
                      <tr key={ev.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 whitespace-nowrap font-medium">
                          {formatarDataBR(ev.dataRealizacao)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {ev.secretaria.nome}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/eventos/${ev.id}`}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {ev.titulo}
                          </Link>
                          <p className="text-xs text-muted-foreground">{ev.local}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusBadge status={ev.status} />
                        </td>
                        <td className="px-4 py-3 text-center font-medium">
                          {ev.fotos}
                        </td>
                        <td className="px-4 py-3 text-center font-medium">
                          {ev.videos}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
