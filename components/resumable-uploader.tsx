"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  CheckCircle2,
  CloudUpload,
  FileImage,
  FileVideo,
  File as FileIcon,
  Loader2,
  Trash2,
  AlertCircle,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn, formatarTamanhoArquivo, inferirMimeType } from "@/lib/utils";

export type UploadItemStatus =
  | "pending"
  | "uploading"
  | "finalizing"
  | "done"
  | "error";

export interface QueuedFile {
  id: string;
  file: File;
  progress: number;
  loadedBytes?: number;
  status: UploadItemStatus;
  error?: string;
}

function putViaXhr(params: {
  uploadUrl: string;
  file: File;
  mimeType: string;
  onProgress: (percent: number, loadedBytes?: number) => void;
}): Promise<string> {
  const { uploadUrl, file, mimeType, onProgress } = params;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastPct = 1;
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", mimeType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        lastPct = Math.min(96, Math.round((event.loaded / event.total) * 95));
        onProgress(lastPct, event.loaded);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed?.id) {
            resolve(parsed.id);
            return;
          }
          reject(new Error("[Etapa 2] Resposta do Google Drive sem ID do arquivo."));
        } catch {
          reject(new Error("[Etapa 2] Erro ao interpretar resposta do Google Drive."));
        }
      } else {
        const snippet = (xhr.responseText || "").slice(0, 140);
        reject(
          new Error(
            `[Etapa 2] Google Drive retornou HTTP ${xhr.status}${snippet ? `: ${snippet}` : ""}`
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(
        new Error(
          `XHR_NETWORK_ERROR (progresso: ${lastPct}%, tamanho: ${formatarTamanhoArquivo(file.size)}, tipo: ${mimeType})`
        )
      );
    };

    xhr.onabort = () => reject(new Error("[Etapa 2] Envio cancelado."));

    xhr.send(file);
  });
}

async function putViaFetchFallback(params: {
  uploadUrl: string;
  file: File;
  mimeType: string;
  onProgress: (percent: number, loadedBytes?: number) => void;
}): Promise<string> {
  const { uploadUrl, file, mimeType, onProgress } = params;
  onProgress(15);

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: file,
    mode: "cors",
  });

  if (!res.ok) {
    const txt = (await res.text().catch(() => "")).slice(0, 140);
    throw new Error(
      `[Etapa 2 - Fallback] Google Drive retornou HTTP ${res.status}${txt ? `: ${txt}` : ""}`
    );
  }

  const parsed = (await res.json().catch(() => ({}))) as { id?: string };
  if (!parsed?.id) {
    throw new Error("[Etapa 2 - Fallback] Resposta do Google Drive sem ID.");
  }
  onProgress(95);
  return parsed.id;
}

/**
 * Executa o fluxo completo de Resumable Upload direto para o Google Drive (ZERO tráfego na Vercel):
 * 1. POST /api/drive/init-upload -> envia apenas metadados leves (~200 bytes) e obtém a `uploadUrl`
 * 2. PUT direto do navegador (iOS Safari, Android, Desktop) para a `uploadUrl` do Google Drive
 *    com barra de progresso real e fallback automático para `fetch` em caso de erro XHR no WebKit iOS
 * 3. POST /api/drive/finalize-upload -> envia apenas o `driveFileId` para aplicar permissão pública e salvar no Firestore
 */
export async function uploadFileResumable(params: {
  eventoId: string;
  file: File;
  onProgress: (percent: number, loadedBytes?: number) => void;
  onPhaseChange?: (phase: UploadItemStatus) => void;
}): Promise<void> {
  const { eventoId, file, onProgress, onPhaseChange } = params;
  const mimeType = inferirMimeType(file.name, file.type);
  const totalSize = file.size;

  if (!totalSize || totalSize <= 0) {
    throw new Error(
      "O arquivo selecionado está vazio ou o iPhone não liberou o vídeo. Tente selecionar novamente pela Fototeca."
    );
  }

  onPhaseChange?.("uploading");
  onProgress(2);

  // 1. Inicia sessão de Resumable Upload no backend (apenas JSON de metadados)
  const initSession = async (): Promise<string> => {
    const sessionRes = await fetch("/api/drive/init-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventoId,
        fileName: file.name,
        mimeType,
        fileSize: totalSize,
        origin: typeof window !== "undefined" ? window.location.origin : undefined,
      }),
    });

    const sessionData = await sessionRes.json().catch(() => ({}));
    if (!sessionRes.ok || !sessionData.uploadUrl) {
      throw new Error(
        `[Etapa 1] ${sessionData.error || `Falha ao iniciar upload (HTTP ${sessionRes.status})`}`
      );
    }
    return sessionData.uploadUrl as string;
  };

  let driveFileId: string;
  const uploadUrl = await initSession();

  // 2. Tenta PUT via XHR (progresso granular). Se o iOS Safari falhar no XHR com erro de rede/WebKit, tenta nova sessão via fetch()
  try {
    driveFileId = await putViaXhr({
      uploadUrl,
      file,
      mimeType,
      onProgress,
    });
  } catch (xhrErr) {
    const msg = xhrErr instanceof Error ? xhrErr.message : "";
    if (msg.startsWith("XHR_NETWORK_ERROR")) {
      const freshUrl = await initSession();
      driveFileId = await putViaFetchFallback({
        uploadUrl: freshUrl,
        file,
        mimeType,
        onProgress,
      });
    } else {
      throw xhrErr;
    }
  }

  // 3. Finaliza permissão pública (`anyone` + `reader`) e registra metadados no Firestore
  onPhaseChange?.("finalizing");
  onProgress(98);

  const finalizeRes = await fetch("/api/drive/finalize-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventoId,
      driveFileId,
      fileName: file.name,
      mimeType,
      fileSize: totalSize,
    }),
  });

  const finalizeData = await finalizeRes.json().catch(() => ({}));
  if (!finalizeRes.ok) {
    throw new Error(
      `[Etapa 3] ${finalizeData.error || "Arquivo enviado, mas falhou ao registrar no sistema."}`
    );
  }

  onProgress(100);
  onPhaseChange?.("done");
}

interface ResumableUploaderProps {
  eventoId?: string;
  files?: QueuedFile[];
  onFilesChange?: React.Dispatch<React.SetStateAction<QueuedFile[]>>;
  onUploadComplete?: () => void;
  disabled?: boolean;
}

export function ResumableUploader({
  eventoId,
  files: controlledFiles,
  onFilesChange,
  onUploadComplete,
  disabled = false,
}: ResumableUploaderProps) {
  const [internalFiles, setInternalFiles] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [preparingSelection, setPreparingSelection] = useState(false);
  const nativeInputRef = useRef<HTMLInputElement | null>(null);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const files = controlledFiles ?? internalFiles;
  const setFiles = onFilesChange ?? setInternalFiles;

  const stopPreparing = useCallback(() => {
    if (cancelTimerRef.current) {
      clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
    }
    setPreparingSelection(false);
  }, []);

  const appendFiles = useCallback(
    (selected: File[]) => {
      stopPreparing();
      if (!selected.length) return;
      const novos: QueuedFile[] = selected.map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        progress: 0,
        loadedBytes: 0,
        status: "pending",
      }));
      setFiles((prev) => [...prev, ...novos]);
      toast.success(
        `${selected.length} arquivo${selected.length > 1 ? "s" : ""} pronto${selected.length > 1 ? "s" : ""} para envio.`
      );
    },
    [setFiles, stopPreparing]
  );

  function openNativePicker() {
    setPreparingSelection(true);
    // Se o usuário cancelar no iOS sem disparar onChange, limpa o aviso ao voltar o foco
    const handleWindowFocus = () => {
      cancelTimerRef.current = setTimeout(() => {
        setPreparingSelection(false);
      }, 2500);
      window.removeEventListener("focus", handleWindowFocus);
    };
    window.addEventListener("focus", handleWindowFocus);
    nativeInputRef.current?.click();
  }

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      appendFiles(acceptedFiles);
    },
    [appendFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: disabled || isUploading,
    useFsAccessApi: false,
    noClick: false,
    onDropRejected: () => {
      toast.error("Não foi possível adicionar este arquivo. Tente novamente.");
    },
  });

  function handleNativeFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files ? Array.from(e.target.files) : [];
    appendFiles(list);
    e.target.value = "";
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleUploadStandalone() {
    if (!eventoId) return;
    const pending = files.filter(
      (f) => f.status === "pending" || f.status === "error"
    );
    if (!pending.length) return;

    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    // Se houver vídeo na fila, envia 1 por vez para estabilidade máxima no iPhone/4G
    const hasVideo = pending.some((p) =>
      inferirMimeType(p.file.name, p.file.type).startsWith("video/")
    );
    const concurrency = hasVideo ? 1 : Math.min(2, pending.length);

    const queue = [...pending];
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        try {
          await uploadFileResumable({
            eventoId,
            file: item.file,
            onProgress: (progress, loadedBytes) => {
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === item.id
                    ? { ...f, progress, loadedBytes: loadedBytes ?? f.loadedBytes }
                    : f
                )
              );
            },
            onPhaseChange: (status) => {
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === item.id ? { ...f, status, error: undefined } : f
                )
              );
            },
          });
          successCount++;
        } catch (err) {
          errorCount++;
          const message =
            err instanceof Error ? err.message : "Erro ao enviar arquivo";
          setFiles((prev) =>
            prev.map((f) =>
              f.id === item.id ? { ...f, status: "error", error: message } : f
            )
          );
        }
      }
    });

    await Promise.all(workers);
    setIsUploading(false);

    if (successCount > 0) {
      toast.success(
        `${successCount} arquivo${successCount > 1 ? "s" : ""} enviado${successCount > 1 ? "s" : ""} com sucesso!`
      );
      onUploadComplete?.();
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} arquivo(s) falharam no envio. Veja o detalhe abaixo.`);
    }
  }

  const pendingCount = files.filter(
    (f) => f.status === "pending" || f.status === "error"
  ).length;

  return (
    <div className="space-y-4">
      {/* Input nativo direto para máxima compatibilidade com Fototeca/Vídeos .MOV no iPhone */}
      <input
        ref={nativeInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={handleNativeFileChange}
        disabled={disabled || isUploading}
      />

      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-5 sm:p-6 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/60 hover:bg-muted/30",
          (disabled || isUploading) && "opacity-60 cursor-not-allowed"
        )}
      >
        <input {...getInputProps({ accept: "image/*,video/*" })} />
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
          <CloudUpload className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium">
          {isDragActive
            ? "Solte as fotos e vídeos aqui..."
            : "Arraste fotos e vídeos para cá, ou toque para selecionar"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Suporte a fotos e vídeos do celular (MOV, MP4, JPG, PNG, HEIC) com envio direto otimizado.
        </p>
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || isUploading}
            onClick={(e) => {
              e.stopPropagation();
              openNativePicker();
            }}
          >
            <Upload className="h-3.5 w-3.5" />
            Selecionar da Galeria / Arquivos
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground/80 mt-3 max-w-md mx-auto">
          Dica no iPhone: ao escolher vídeos grandes na Biblioteca de Fotos, o iOS prepara o vídeo antes de retornar ao site. Para carregar mais rápido, toque em <strong>Opções → Formato: Atual</strong> ou selecione 1 vídeo por vez.
        </p>
      </div>

      {preparingSelection && (
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/5 px-3.5 py-2.5 text-xs text-primary animate-fade-in">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>
            Aguardando o celular preparar os arquivos selecionados... Vídeos grandes podem levar alguns segundos antes de aparecerem na lista.
          </span>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {files.length} arquivo{files.length > 1 ? "s" : ""} selecionado
              {files.length > 1 ? "s" : ""}
            </p>
            {eventoId && pendingCount > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={handleUploadStandalone}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando mídias...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Enviar {pendingCount} arquivo{pendingCount > 1 ? "s" : ""}
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {files.map((item) => {
              const resolvedMime = inferirMimeType(item.file.name, item.file.type);
              const isImage = resolvedMime.startsWith("image/");
              const isVideo = resolvedMime.startsWith("video/");

              return (
                <div
                  key={item.id}
                  className="rounded-lg border bg-card p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isImage ? (
                        <FileImage className="h-4 w-4 shrink-0 text-primary" />
                      ) : isVideo ? (
                        <FileVideo className="h-4 w-4 shrink-0 text-[#1373E6]" />
                      ) : (
                        <FileIcon className="h-4 w-4 shrink-0 text-slate-500" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.status === "uploading" && item.loadedBytes
                            ? `${formatarTamanhoArquivo(item.loadedBytes)} de ${formatarTamanhoArquivo(item.file.size)} • ${item.progress}%`
                            : formatarTamanhoArquivo(item.file.size)}
                          {item.status === "uploading" && !item.loadedBytes && ` • Enviando (${item.progress}%)`}
                          {item.status === "finalizing" && " • Finalizando..."}
                          {item.status === "done" && " • Concluído"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === "done" && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      )}
                      {item.status === "error" && (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                      {(item.status === "uploading" ||
                        item.status === "finalizing") && (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      {(item.status === "pending" || item.status === "error") &&
                        !isUploading && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeFile(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                    </div>
                  </div>

                  {(item.status === "uploading" ||
                    item.status === "finalizing" ||
                    item.status === "done") && (
                    <Progress value={item.progress} className="h-1.5" />
                  )}

                  {item.error && (
                    <p className="text-xs text-destructive break-words">
                      {item.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
