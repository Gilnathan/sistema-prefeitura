"use client";

import { useCallback, useState } from "react";
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
import { cn, formatarTamanhoArquivo } from "@/lib/utils";

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
  status: UploadItemStatus;
  error?: string;
}

// Tamanho de chunk: 8 MB (múltiplo obrigatório de 256 KB na API Resumable do Google Drive)
const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_CHUNK_RETRIES = 3;

function sendChunkXhr(params: {
  uploadUrl: string;
  chunk: Blob;
  mimeType: string;
  start: number;
  end: number;
  totalSize: number;
  onChunkProgress: (loadedInChunk: number) => void;
}): Promise<{ status: number; responseText: string }> {
  const { uploadUrl, chunk, mimeType, start, end, totalSize, onChunkProgress } =
    params;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onChunkProgress(event.loaded);
      }
    };

    xhr.onload = () => {
      resolve({ status: xhr.status, responseText: xhr.responseText });
    };

    xhr.onerror = () => {
      reject(
        new Error(
          "Erro de rede ou CORS durante o envio direto ao Google Drive."
        )
      );
    };

    xhr.send(chunk);
  });
}

/**
 * Executa o fluxo completo de Resumable Upload direto para o Google Drive (ZERO tráfego na Vercel):
 * 1. POST /api/drive/init-upload -> envia apenas metadados leves (~200 bytes) e obtém a `uploadUrl`
 * 2. PUT em chunks de 8 MB com `Content-Range` diretamente do navegador para o Google Drive
 *    (trata 308 Resume Incomplete entre chunks, retry automático e progresso real em vídeos de 300MB–500MB+)
 * 3. POST /api/drive/finalize-upload -> envia apenas o `driveFileId` para aplicar permissão pública e salvar no Firestore
 */
export async function uploadFileResumable(params: {
  eventoId: string;
  file: File;
  onProgress: (percent: number) => void;
  onPhaseChange?: (phase: UploadItemStatus) => void;
}): Promise<void> {
  const { eventoId, file, onProgress, onPhaseChange } = params;
  const mimeType = file.type || "application/octet-stream";
  const totalSize = file.size;

  onPhaseChange?.("uploading");
  onProgress(1);

  // 1. Inicia sessão de Resumable Upload no backend (payload apenas JSON de metadados)
  const sessionRes = await fetch("/api/drive/init-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventoId,
      fileName: file.name,
      mimeType,
      fileSize: totalSize,
    }),
  });

  const sessionData = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok || !sessionData.uploadUrl) {
    throw new Error(
      sessionData.error || "Não foi possível iniciar o envio do arquivo."
    );
  }

  const uploadUrl: string = sessionData.uploadUrl;

  // 2. Envia os bytes diretamente do navegador para o Google Drive em chunks com Content-Range
  let offset = 0;
  let driveFileId: string | null = null;

  while (offset < totalSize) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize) - 1;
    const chunk = file.slice(offset, end + 1);

    let attempt = 0;
    let chunkDone = false;

    while (!chunkDone) {
      attempt += 1;
      try {
        const result = await sendChunkXhr({
          uploadUrl,
          chunk,
          mimeType,
          start: offset,
          end,
          totalSize,
          onChunkProgress: (loadedInChunk) => {
            const totalLoaded = Math.min(totalSize, offset + loadedInChunk);
            const pct = Math.min(96, Math.round((totalLoaded / totalSize) * 95));
            onProgress(pct);
          },
        });

        if (result.status === 308) {
          // Google Drive confirmou o chunk intermediário
          chunkDone = true;
          offset = end + 1;
        } else if (result.status >= 200 && result.status < 300) {
          // Chunk final concluído: resposta JSON contém o ID do arquivo no Drive
          const parsed = JSON.parse(result.responseText);
          if (!parsed?.id) {
            throw new Error("Resposta do Google Drive sem ID do arquivo.");
          }
          driveFileId = parsed.id;
          chunkDone = true;
          offset = totalSize;
        } else if (
          (result.status >= 500 || result.status === 429) &&
          attempt < MAX_CHUNK_RETRIES
        ) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        } else {
          throw new Error(
            `Falha no envio direto ao Google Drive (HTTP ${result.status}).`
          );
        }
      } catch (err) {
        if (attempt >= MAX_CHUNK_RETRIES) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  if (!driveFileId) {
    throw new Error("Upload concluído sem retorno do ID do arquivo no Google Drive.");
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
      finalizeData.error || "Arquivo enviado, mas falhou ao registrar no sistema."
    );
  }

  onProgress(100);
  onPhaseChange?.("done");
}

interface ResumableUploaderProps {
  /** Se informado, permite enviar imediatamente para este evento */
  eventoId?: string;
  /** Modo controlado (usado no formulário de criação antes do evento existir) */
  files?: QueuedFile[];
  onFilesChange?: React.Dispatch<React.SetStateAction<QueuedFile[]>>;
  /** Callback após concluir uploads no modo standalone */
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

  const files = controlledFiles ?? internalFiles;
  const setFiles = onFilesChange ?? setInternalFiles;

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (!acceptedFiles.length) return;
      const novos: QueuedFile[] = acceptedFiles.map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        progress: 0,
        status: "pending",
      }));
      setFiles((prev) => [...prev, ...novos]);
    },
    [setFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: disabled || isUploading,
    accept: {
      "image/*": [],
      "video/*": [],
    },
  });

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

    // Envia até 2 arquivos simultaneamente para equilibrar banda e estabilidade
    const queue = [...pending];
    const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        try {
          await uploadFileResumable({
            eventoId,
            file: item.file,
            onProgress: (progress) => {
              setFiles((prev) =>
                prev.map((f) => (f.id === item.id ? { ...f, progress } : f))
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
      toast.error(`${errorCount} arquivo(s) falharam no envio.`);
    }
  }

  const pendingCount = files.filter(
    (f) => f.status === "pending" || f.status === "error"
  ).length;

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/60 hover:bg-muted/30",
          (disabled || isUploading) && "opacity-60 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
          <CloudUpload className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium">
          {isDragActive
            ? "Solte as fotos e vídeos aqui..."
            : "Arraste fotos e vídeos para cá, ou clique para selecionar"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Suporte a múltiplos arquivos e vídeos pesados (MP4, MOV, JPG, PNG, HEIC) com envio direto otimizado.
        </p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
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
              const isImage = item.file.type.startsWith("image/");
              const isVideo = item.file.type.startsWith("video/");

              return (
                <div
                  key={item.id}
                  className="rounded-lg border bg-card p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isImage ? (
                        <FileImage className="h-4 w-4 shrink-0 text-blue-600" />
                      ) : isVideo ? (
                        <FileVideo className="h-4 w-4 shrink-0 text-purple-600" />
                      ) : (
                        <FileIcon className="h-4 w-4 shrink-0 text-slate-500" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatarTamanhoArquivo(item.file.size)}
                          {item.status === "uploading" && ` • Enviando (${item.progress}%)`}
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
                    <p className="text-xs text-destructive">{item.error}</p>
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
