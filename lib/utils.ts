import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { EventoStatus, EventoTipo, MidiaTipo } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export function formatarNomeMesPasta(date: Date): string {
  const mesIndex = date.getUTCMonth();
  const numero = String(mesIndex + 1).padStart(2, "0");
  return `${numero} - ${MESES_PT[mesIndex]}`;
}

export function formatarDataISO(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function formatarDataBR(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const ano = d.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

export function getHojeBahiaISO(): string {
  // Retorna YYYY-MM-DD no fuso de Belmonte/Bahia (America/Bahia)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value || "2026";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

/**
 * Regra automática: se a ação foi criada como FUTURA mas a data já passou
 * (menor que hoje no fuso America/Bahia), ela passa automaticamente para REALIZADA.
 */
export function resolverTipoEventoEfetivo(
  tipo: EventoTipo | undefined,
  dataRealizacao: Date | string
): EventoTipo {
  if (tipo !== "FUTURA") return "REALIZADA";
  const dataEventoISO = formatarDataISO(dataRealizacao);
  const hojeISO = getHojeBahiaISO();
  return dataEventoISO < hojeISO ? "REALIZADA" : "FUTURA";
}

export function formatarDataHoraBR(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Bahia",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function sanitizarNomePasta(nome: string): string {
  return nome
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function formatarTamanhoArquivo(bytes: number | bigint | string): string {
  const num = typeof bytes === "bigint" ? Number(bytes) : Number(bytes);
  if (!Number.isFinite(num) || num <= 0) return "0 B";
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(num) / Math.log(1024)), unidades.length - 1);
  const valor = num / Math.pow(1024, idx);
  return `${valor.toFixed(idx === 0 ? 0 : 1)} ${unidades[idx]}`;
}

export function inferirMimeType(fileName: string, mimeType?: string): string {
  if (mimeType && mimeType.trim() && mimeType !== "application/octet-stream") {
    return mimeType.trim();
  }
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    "3gp": "video/3gpp",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    gif: "image/gif",
  };
  return map[ext] || mimeType || "application/octet-stream";
}

export function inferirTipoMidia(mimeType: string, fileName?: string): MidiaTipo {
  const resolved = fileName ? inferirMimeType(fileName, mimeType) : mimeType;
  const lower = resolved.toLowerCase();
  if (lower.startsWith("image/")) return "FOTO";
  if (lower.startsWith("video/")) return "VIDEO";
  return "OUTRO";
}

export function getDrivePhotoThumbUrl(driveFileId: string, width = 800): string {
  return `https://lh3.googleusercontent.com/d/${driveFileId}=w${width}`;
}

export function getDriveVideoPreviewUrl(driveFileId: string): string {
  return `https://drive.google.com/file/d/${driveFileId}/preview`;
}

export function getDriveDownloadUrl(driveFileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${driveFileId}`;
}

export function normalizarStatusEvento(
  status: EventoStatus | undefined
): Exclude<EventoStatus, "NOVO"> {
  if (status === "PUBLICADO" || status === "CANCELADA") return status;
  return "EM_PRODUCAO";
}

export const STATUS_CONFIG: Record<
  EventoStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  // Legado "NOVO" é exibido como "Em Produção"
  NOVO: {
    label: "Em Produção",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
    dotClass: "bg-blue-500",
  },
  EM_PRODUCAO: {
    label: "Em Produção",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
    dotClass: "bg-blue-500",
  },
  PUBLICADO: {
    label: "Publicado",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  CANCELADA: {
    label: "Cancelada",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    dotClass: "bg-red-500",
  },
};
