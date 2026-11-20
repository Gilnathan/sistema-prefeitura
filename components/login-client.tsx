"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Mail, Loader2, ShieldCheck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface LoginSlideItem {
  id: string;
  titulo: string;
  imageUrl: string;
}

export function LoginClient({ slides }: { slides: LoginSlideItem[] }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);

  // Crossfade contínuo e bem calmo (troca a cada 8s com transição de 2.4s)
  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [slides.length]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error("Informe usuário/e-mail e senha.");
      return;
    }

    setLoading(true);
    try {
      const result = await signIn("credentials", {
        identifier: identifier.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error("Credenciais inválidas ou usuário inativo.");
        return;
      }

      toast.success("Bem-vindo ao Portal da Prefeitura de Belmonte!");
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Erro inesperado ao autenticar.");
    } finally {
      setLoading(false);
    }
  }

  const activeSlide = slides[currentIndex] || slides[0];

  return (
    <div className="min-h-[100dvh] grid grid-cols-1 lg:grid-cols-[3fr_2fr] bg-white">
      {/* ESQUERDA (60% no desktop | faixa topo no mobile): Slideshow suave de Belmonte */}
      <div className="relative h-52 sm:h-64 lg:h-auto overflow-hidden bg-[#071A2B]">
        {slides.map((slide, idx) => {
          const isCurrent = idx === currentIndex;
          return (
            <img
              key={slide.id}
              src={slide.imageUrl}
              alt={slide.titulo}
              className={cn(
                "absolute inset-0 h-full w-full object-cover will-change-transform transition-all duration-[2400ms] ease-in-out",
                isCurrent
                  ? "opacity-100 scale-100 brightness-100"
                  : "opacity-0 scale-[1.05] brightness-75 pointer-events-none"
              )}
            />
          );
        })}

        {/* Véu suave para conforto visual e leitura da legenda */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#061829]/80 via-[#061829]/20 to-[#061829]/15" />

        {/* Legenda discreta + indicadores */}
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 lg:p-8 flex items-end justify-between gap-4 text-white">
          <div className="space-y-0.5 max-w-md">
            <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-sky-200/90">
              <MapPin className="h-3.5 w-3.5 text-[#4ADE80]" />
              Belmonte — Bahia
            </span>
            {activeSlide?.titulo && (
              <p className="text-sm sm:text-base lg:text-lg font-semibold leading-snug drop-shadow-xs transition-opacity duration-1000">
                {activeSlide.titulo}
              </p>
            )}
          </div>

          {slides.length > 1 && (
            <div className="flex items-center gap-1.5 pb-1">
              {slides.map((slide, idx) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`Ver foto ${idx + 1}: ${slide.titulo}`}
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    "h-2 rounded-full transition-all duration-700",
                    idx === currentIndex
                      ? "w-7 bg-white"
                      : "w-2 bg-white/45 hover:bg-white/80"
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DIREITA (40% no desktop): Login Clean, Simples e Direto */}
      <div className="relative flex flex-col justify-between px-5 py-6 sm:px-10 lg:px-12 bg-gradient-to-b from-white via-[#F9FCFE] to-[#F3F8FC]">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#0E3A5D] via-[#128C23] to-[#F4C419]" />

        {/* Cabeçalho com logo oficial */}
        <div className="flex items-center gap-3 pt-1">
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-[#DCE8F0] bg-[#084D12] shadow-xs">
            <img
              src="/logo-belmonte.jpg"
              alt="Prefeitura Municipal de Belmonte"
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <p className="text-sm font-bold text-[#0E3A5D] leading-tight">
              Prefeitura de Belmonte
            </p>
            <p className="text-xs text-muted-foreground">
              Portal de Ações Realizadas
            </p>
          </div>
        </div>

        {/* Formulário */}
        <div className="w-full max-w-sm mx-auto my-8 lg:my-auto space-y-6 animate-fade-up">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-[#0E3A5D]">
              Entrar no portal
            </h1>
            <p className="text-sm text-muted-foreground">
              Use o e-mail ou usuário da sua secretaria para acessar.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="identifier" className="text-[#0E3A5D]">
                E-mail ou Usuário
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="identifier"
                  type="text"
                  placeholder="ex: saude@belmonte.ba.gov.br"
                  className="pl-9 h-11 bg-white text-base sm:text-sm"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[#0E3A5D]">
                Senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-9 h-11 bg-white text-base sm:text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full h-11 font-semibold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Autenticando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          <div className="flex items-center gap-2 rounded-lg bg-[#EFF6FB] border border-[#DCEAF4] px-3.5 py-2.5 text-xs text-[#46637A]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            <span>
              Acesso exclusivo para secretarias municipais e equipe de comunicação.
            </span>
          </div>
        </div>

        {/* Rodapé */}
        <p className="text-[11px] text-muted-foreground/80 text-center lg:text-left">
          © {new Date().getFullYear()} Prefeitura Municipal de Belmonte — Bahia
        </p>
      </div>
    </div>
  );
}
