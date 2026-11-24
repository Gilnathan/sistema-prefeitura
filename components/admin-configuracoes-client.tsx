"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Film,
  KeyRound,
  Loader2,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { SystemSettingsDoc } from "@/lib/types";
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
import { formatarDataHoraBR } from "@/lib/utils";

interface GeminiConfigState {
  configured: boolean;
  maskedKey: string | null;
  model: string;
  updatedAt: string | null;
  updatedByEmail: string | null;
}

interface AdminConfiguracoesClientProps {
  initialSettings: SystemSettingsDoc;
  initialGemini: GeminiConfigState;
}

export function AdminConfiguracoesClient({
  initialSettings,
  initialGemini,
}: AdminConfiguracoesClientProps) {
  const [settings, setSettings] = useState<SystemSettingsDoc>(initialSettings);
  const [savingFlag, setSavingFlag] = useState<string | null>(null);

  const [gemini, setGemini] = useState<GeminiConfigState>(initialGemini);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelInput, setModelInput] = useState(initialGemini.model);
  const [savingGemini, setSavingGemini] = useState(false);
  const [deletingGemini, setDeletingGemini] = useState(false);

  async function toggleSetting(
    key: "permitirAcoesFuturas" | "permitirEnvioVideos"
  ) {
    const nextValue = !settings[key];
    setSavingFlag(key);
    try {
      const res = await fetch("/api/admin/system-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: nextValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar configuração");

      setSettings(data.settings);
      if (key === "permitirAcoesFuturas") {
        toast.success(
          nextValue
            ? "Cadastro de Ações Futuras ativado no portal."
            : "Cadastro de Ações Futuras ocultado (apenas ações realizadas)."
        );
      } else {
        toast.success(
          nextValue
            ? "Envio de vídeos liberado no portal."
            : "Envio de vídeos travado (apenas fotos permitidas)."
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao atualizar configuração."
      );
    } finally {
      setSavingFlag(null);
    }
  }

  async function handleSaveGemini(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKeyInput.trim()) {
      toast.error("Cole a chave da API do Google AI Studio.");
      return;
    }

    setSavingGemini(true);
    try {
      const res = await fetch("/api/admin/gemini-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKeyInput.trim(),
          model: modelInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar chave");

      setGemini({
        configured: true,
        maskedKey: data.maskedKey,
        model: data.model,
        updatedAt: data.updatedAt,
        updatedByEmail: data.updatedByEmail,
      });
      setApiKeyInput("");
      toast.success("Chave do Google Gemini validada e salva com sucesso!");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao validar/salvar chave."
      );
    } finally {
      setSavingGemini(false);
    }
  }

  async function handleDeleteGemini() {
    setDeletingGemini(true);
    try {
      const res = await fetch("/api/admin/gemini-config", { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao remover chave");
      setGemini({
        configured: false,
        maskedKey: null,
        model: "gemini-3.5-flash-lite",
        updatedAt: null,
        updatedByEmail: null,
      });
      toast.success("Chave da API removida.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover chave.");
    } finally {
      setDeletingGemini(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Configurações do Sistema
        </h1>
        <p className="text-sm text-muted-foreground">
          Área exclusiva do administrador para controlar recursos do portal e a integração com Inteligência Artificial.
        </p>
      </div>

      {/* Seção 1: Recursos e Permissões do Portal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Recursos e Permissões de Cadastro
          </CardTitle>
          <CardDescription>
            Ative ou oculte funcionalidades do formulário de ações a qualquer momento sem perder dados já cadastrados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Toggle: Ações Futuras */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  settings.permitirAcoesFuturas
                    ? "bg-sky-100 text-sky-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    Permitir cadastro de Ações Futuras
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      settings.permitirAcoesFuturas
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {settings.permitirAcoesFuturas ? "Ativado" : "Desativado"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Quando desativado, o portal exibe apenas o registro de ações que já aconteceram. Você pode reativar quando quiser liberar agendamentos futuros.
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.permitirAcoesFuturas}
              disabled={savingFlag === "permitirAcoesFuturas"}
              onClick={() => toggleSetting("permitirAcoesFuturas")}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 self-end sm:self-center ${
                settings.permitirAcoesFuturas ? "bg-[#128C23]" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm transition-transform ${
                  settings.permitirAcoesFuturas ? "translate-x-5" : "translate-x-0"
                }`}
              >
                {savingFlag === "permitirAcoesFuturas" && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
              </span>
            </button>
          </div>

          {/* Toggle: Envio de Vídeos */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  settings.permitirEnvioVideos
                    ? "bg-blue-100 text-blue-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Film className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    Permitir envio de Vídeos
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      settings.permitirEnvioVideos
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {settings.permitirEnvioVideos ? "Liberado" : "Travado (Somente Fotos)"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Quando travado, secretarias e usuários podem enviar apenas fotos nas ações (o bloqueio vale na interface e também no servidor). Ative quando quiser liberar vídeos novamente.
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.permitirEnvioVideos}
              disabled={savingFlag === "permitirEnvioVideos"}
              onClick={() => toggleSetting("permitirEnvioVideos")}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 self-end sm:self-center ${
                settings.permitirEnvioVideos ? "bg-[#128C23]" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm transition-transform ${
                  settings.permitirEnvioVideos ? "translate-x-5" : "translate-x-0"
                }`}
              >
                {savingFlag === "permitirEnvioVideos" && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
              </span>
            </button>
          </div>

          {settings.updatedAt && (
            <p className="text-[11px] text-muted-foreground pt-1">
              Última alteração em {formatarDataHoraBR(settings.updatedAt)}
              {settings.updatedByEmail ? ` por ${settings.updatedByEmail}` : ""}.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Seção 2: Integração Google Gemini */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5 text-[#128C23]" />
              Chave da API — Google Gemini (AI Studio)
            </CardTitle>
            <CardDescription>
              Usada exclusivamente nas Consultas Inteligentes dentro da aba Relatórios. A chave fica salva no servidor e nunca é exposta às secretarias.
            </CardDescription>
          </div>
          <Link
            href="/relatorios/ia"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#128C23] hover:underline shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Abrir Consultas com IA
          </Link>
        </CardHeader>
        <CardContent className="space-y-5">
          {gemini.configured ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-[#128C23]" />
                  Chave ativa e validada
                </p>
                <p className="text-xs text-emerald-800 font-mono">
                  {gemini.maskedKey}
                </p>
                <p className="text-[11px] text-emerald-700/90">
                  Modelo: <strong>{gemini.model}</strong>
                  {gemini.updatedAt
                    ? ` • Atualizada em ${formatarDataHoraBR(gemini.updatedAt)}`
                    : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive border-red-200 hover:bg-red-50 self-start sm:self-center"
                onClick={handleDeleteGemini}
                disabled={deletingGemini}
              >
                {deletingGemini ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Remover Chave
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
              Nenhuma chave configurada no momento. Crie uma chave gratuita ou paga no{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline inline-flex items-center gap-1"
              >
                Google AI Studio
                <ExternalLink className="h-3 w-3" />
              </a>{" "}
              e cole abaixo para liberar as consultas com IA.
            </div>
          )}

          <form onSubmit={handleSaveGemini} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="config-gemini-key">
                {gemini.configured ? "Substituir Chave da API" : "Chave da API do Google AI Studio *"}
              </Label>
              <Input
                id="config-gemini-key"
                type="password"
                placeholder="AIzaSy..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="config-gemini-model">Modelo Padrão</Label>
              <select
                id="config-gemini-model"
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="gemini-3.5-flash-lite">
                  gemini-3.5-flash-lite (Recomendado — ultrarrápido e estável)
                </option>
                <option value="gemini-3.8-flash">gemini-3.8-flash</option>
                <option value="gemini-3.7-flash">gemini-3.7-flash</option>
                <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                <option value="gemini-3.5-flash">gemini-3.5-flash</option>
              </select>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={savingGemini}>
                {savingGemini ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validando e salvando...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" />
                    Salvar Chave Gemini
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
