"use client";

import { useCallback, useEffect, useState } from "react";
import type { MidiaTipo } from "@/lib/types";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  Film,
  Image as ImageIcon,
  Layers,
  Loader2,
  Play,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatarTamanhoArquivo,
  getDriveDownloadUrl,
  getDrivePhotoThumbUrl,
  getDriveVideoPreviewUrl,
} from "@/lib/utils";

interface MidiaItem {
  id: string;
  driveFileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  tipo: MidiaTipo;
  createdAt: string;
}

interface MediaGalleryProps {
  eventoId: string;
  refreshTrigger?: number;
}

export function MediaGallery({ eventoId, refreshTrigger = 0 }: MediaGalleryProps) {
  const [aba, setAba] = useState<"TODAS" | "FOTO" | "VIDEO">("TODAS");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MidiaItem[]>([]);
  const [counts, setCounts] = useState({ todas: 0, fotos: 0, videos: 0 });
  const [totalPages, setTotalPages] = useState(1);
  const [lightboxItem, setLightboxItem] = useState<MidiaItem | null>(null);

  const fetchMidias = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "12",
        tipo: aba,
      });
      const res = await fetch(`/api/eventos/${eventoId}/midias?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar mídias");
      const data = await res.json();
      setItems(data.items || []);
      setCounts(data.counts || { todas: 0, fotos: 0, videos: 0 });
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [eventoId, page, aba]);

  useEffect(() => {
    fetchMidias();
  }, [fetchMidias, refreshTrigger]);

  function handleTabChange(val: string) {
    setAba(val as "TODAS" | "FOTO" | "VIDEO");
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Tabs value={aba} onValueChange={handleTabChange} className="w-full sm:w-auto">
          <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
            <TabsTrigger value="TODAS" className="gap-1.5 text-xs sm:text-sm">
              <Layers className="h-3.5 w-3.5 shrink-0" />
              Todas ({counts.todas})
            </TabsTrigger>
            <TabsTrigger value="FOTO" className="gap-1.5 text-xs sm:text-sm">
              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
              Fotos ({counts.fotos})
            </TabsTrigger>
            <TabsTrigger value="VIDEO" className="gap-1.5 text-xs sm:text-sm">
              <Film className="h-3.5 w-3.5 shrink-0" />
              Vídeos ({counts.videos})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando galeria de mídias...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-muted-foreground">
          <p className="text-sm font-medium">Nenhuma mídia encontrada nesta aba.</p>
          <p className="text-xs mt-1">
            Use a área de upload abaixo para anexar fotos e vídeos a este evento.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item, idx) => (
            <div
              key={item.id}
              style={{ animationDelay: `${Math.min(idx * 30, 240)}ms` }}
              className="group overflow-hidden rounded-xl border bg-card shadow-xs flex flex-col card-interactive animate-fade-up"
            >
              {item.tipo === "FOTO" ? (
                <div
                  className="relative aspect-[4/3] bg-slate-100 overflow-hidden cursor-pointer"
                  onClick={() => setLightboxItem(item)}
                >
                  <img
                    src={getDrivePhotoThumbUrl(item.driveFileId, 800)}
                    alt={item.fileName}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">
                      <Expand className="h-3.5 w-3.5" />
                      Ver em alta resolução
                    </span>
                  </div>
                </div>
              ) : (
                <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
                  <iframe
                    src={getDriveVideoPreviewUrl(item.driveFileId)}
                    title={item.fileName}
                    className="h-full w-full border-0"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              )}

              <div className="p-3 flex items-center justify-between gap-2 border-t bg-card">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" title={item.fileName}>
                    {item.fileName}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {item.tipo === "VIDEO" ? "Vídeo" : "Foto"} •{" "}
                    {formatarTamanhoArquivo(item.fileSize)}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {item.tipo === "VIDEO" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Expandir player"
                      onClick={() => setLightboxItem(item)}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                  >
                    <a
                      href={getDriveDownloadUrl(item.driveFileId)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Baixar
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox para foto em alta resolução ou player de vídeo expandido */}
      <Dialog
        open={Boolean(lightboxItem)}
        onOpenChange={(open) => !open && setLightboxItem(null)}
      >
        <DialogContent className="max-w-4xl p-4 sm:p-6">
          {lightboxItem && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-8 text-base">
                  {lightboxItem.fileName}
                </DialogTitle>
              </DialogHeader>

              {lightboxItem.tipo === "FOTO" ? (
                <div className="relative flex items-center justify-center bg-slate-950 rounded-lg overflow-hidden max-h-[72vh]">
                  <img
                    src={getDrivePhotoThumbUrl(lightboxItem.driveFileId, 1920)}
                    alt={lightboxItem.fileName}
                    className="max-h-[72vh] w-auto object-contain"
                  />
                </div>
              ) : (
                <div className="aspect-video w-full bg-slate-950 rounded-lg overflow-hidden">
                  <iframe
                    src={getDriveVideoPreviewUrl(lightboxItem.driveFileId)}
                    title={lightboxItem.fileName}
                    className="h-full w-full border-0"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  Tamanho: {formatarTamanhoArquivo(lightboxItem.fileSize)}
                </span>
                <Button asChild size="sm">
                  <a
                    href={getDriveDownloadUrl(lightboxItem.driveFileId)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="h-4 w-4" />
                    Download Original
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
