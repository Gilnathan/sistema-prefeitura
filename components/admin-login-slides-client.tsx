"use client";

import { useRef, useState } from "react";
import type { LoginSlideDoc } from "@/lib/types";
import { toast } from "sonner";
import { ImagePlus, Images, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Redimensiona e comprime a foto no navegador (máx 1600px, JPEG 0.82)
 * para manter a tela de login leve, rápida e compatível com deploy na Vercel/Firestore.
 */
async function optimizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
      img.onload = () => {
        const maxWidth = 1600;
        const maxHeight = 1200;
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Erro ao processar imagem no navegador."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.82;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        // Garante que fique bem abaixo do limite de 900 KB
        while (dataUrl.length > 820_000 && quality > 0.45) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function AdminLoginSlidesClient({
  initialSlides,
}: {
  initialSlides: LoginSlideDoc[];
}) {
  const [slides, setSlides] = useState<LoginSlideDoc[]>(initialSlides);
  const [titulo, setTitulo] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem (JPG, PNG ou WebP).");
      return;
    }

    setUploading(true);
    try {
      const optimized = await optimizeImageToDataUrl(file);
      const res = await fetch("/api/login-slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo:
            titulo.trim() ||
            file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
          imageUrl: optimized,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar foto");

      setSlides((prev) => [...prev, data.slide]);
      setTitulo("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success(
        "Foto adicionada! Ela já está visível para todos na tela de login."
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao adicionar foto."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(slide: LoginSlideDoc) {
    setRemovingId(slide.id);
    try {
      const res = await fetch(`/api/login-slides/${slide.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao remover foto");
      setSlides((prev) => prev.filter((s) => s.id !== slide.id));
      toast.success("Foto removida da tela de login.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover foto.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Images className="h-6 w-6 text-primary" />
          Fotos da Tela de Login
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Adicione ou remova fotos de Belmonte exibidas no slideshow da tela de login. As alterações valem imediatamente para todos os usuários.
        </p>
      </div>

      {/* Card de Adição */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar Nova Foto</CardTitle>
          <CardDescription>
            A imagem é otimizada automaticamente para carregamento leve e salva diretamente no portal (sem usar Google Drive).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="flex-1 w-full space-y-1.5">
              <Label htmlFor="slide-titulo">Legenda da Foto (opcional)</Label>
              <Input
                id="slide-titulo"
                placeholder="Ex: Farol de Belmonte, Praça Central, Orla do Rio..."
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                disabled={uploading}
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />

            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full sm:w-auto shrink-0"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Otimizando e salvando...
                </>
              ) : (
                <>
                  <ImagePlus className="h-4 w-4" />
                  Escolher Foto
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Grade de Fotos Ativas */}
      {slides.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma foto cadastrada. Adicione fotos acima para exibi-las no slide da tela de login.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {slides.map((slide, idx) => (
            <Card
              key={slide.id}
              style={{ animationDelay: `${Math.min(idx * 40, 240)}ms` }}
              className="overflow-hidden card-interactive animate-fade-up"
            >
              <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden">
                <img
                  src={slide.imageUrl}
                  alt={slide.titulo}
                  className="h-full w-full object-cover"
                />
              </div>
              <CardContent className="p-3.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{slide.titulo}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Slide #{idx + 1}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground shrink-0"
                  disabled={removingId === slide.id}
                  onClick={() => handleRemove(slide)}
                >
                  {removingId === slide.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Remover
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
