"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Bot,
  Calendar,
  Check,
  Copy,
  Database,
  ExternalLink,
  KeyRound,
  Loader2,
  MapPin,
  RotateCcw,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
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
import { MESES_PT, formatarDataHoraBR } from "@/lib/utils";

interface SecretariaOption {
  id: string;
  nome: string;
  sigla: string | null;
}

interface GeminiConfigState {
  configured: boolean;
  maskedKey: string | null;
  model: string;
  updatedAt: string | null;
  updatedByEmail: string | null;
}

interface EventoRelacionado {
  id: string;
  titulo: string;
  data: string;
  secretaria: string;
  local: string;
  situacao: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  eventosRelacionados?: EventoRelacionado[];
  meta?: {
    registrosAnalisados: number;
    escopoSecretaria: string;
    escopoPeriodo: string;
    model: string;
  };
}

const SUGESTOES_CONSULTA = [
  "Quantas ações realizadas tivemos no total e quantas por secretaria?",
  "Teve algum atendimento médico, odontológico ou teste rápido este mês?",
  "Quais ações foram feitas em parceria com outras secretarias ou órgãos?",
  "Faça um resumo geral das principais entregas registradas neste filtro.",
];

export function RelatoriosIAClient({
  secretarias,
  initialConfig,
}: {
  secretarias: SecretariaOption[];
  initialConfig: GeminiConfigState;
}) {
  const now = new Date();
  const years = [
    now.getFullYear() + 1,
    now.getFullYear(),
    now.getFullYear() - 1,
    now.getFullYear() - 2,
  ];

  // Sub-aba interna: consulta | config
  const [subTab, setSubTab] = useState<"consulta" | "config">(
    initialConfig.configured ? "consulta" : "config"
  );

  // Gaveta lateral de filtros no mobile
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Estado da configuração Gemini
  const [config, setConfig] = useState<GeminiConfigState>(initialConfig);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelInput, setModelInput] = useState(initialConfig.model);
  const [savingConfig, setSavingConfig] = useState(false);
  const [deletingConfig, setDeletingConfig] = useState(false);

  // Filtros prévios antes de consultar
  const [secretariaId, setSecretariaId] = useState("TODAS");
  const [situacao, setSituacao] = useState<
    "TODAS" | "REALIZADA" | "FUTURA" | "CANCELADA"
  >("TODAS");
  const [ano, setAno] = useState("");
  const [mes, setMes] = useState("");

  // Chat de consultas
  const [pergunta, setPergunta] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [asking, setAsking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

  const activeFiltersCount =
    (secretariaId !== "TODAS" ? 1 : 0) +
    (situacao !== "TODAS" ? 1 : 0) +
    (ano ? 1 : 0) +
    (mes ? 1 : 0);

  const resumoFiltroAtivo = [
    secretariaId === "TODAS"
      ? "Todas Secretarias"
      : secretarias.find((s) => s.id === secretariaId)?.nome || "Secretaria",
    situacao !== "TODAS" ? situacao.toLowerCase() : null,
    ano ? (mes ? `${MESES_PT[Number(mes) - 1]}/${ano}` : ano) : null,
  ]
    .filter(Boolean)
    .join(" • ");

  function limparFiltros() {
    setSecretariaId("TODAS");
    setSituacao("TODAS");
    setAno("");
    setMes("");
    setMessages([]);
  }

  function handleCancelAsk() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setAsking(false);
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKeyInput.trim()) {
      toast.error("Cole a chave da API do Google AI Studio.");
      return;
    }
    setSavingConfig(true);
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

      setConfig({
        configured: true,
        maskedKey: data.maskedKey,
        model: data.model,
        updatedAt: data.updatedAt,
        updatedByEmail: data.updatedByEmail,
      });
      setApiKeyInput("");
      toast.success("Chave do Google Gemini validada e salva com sucesso!");
      setSubTab("consulta");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao validar/salvar chave."
      );
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleDeleteConfig() {
    setDeletingConfig(true);
    try {
      const res = await fetch("/api/admin/gemini-config", { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao remover chave");
      setConfig({
        configured: false,
        maskedKey: null,
        model: "gemini-3.5-flash-lite",
        updatedAt: null,
        updatedByEmail: null,
      });
      toast.success("Chave da API removida.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    } finally {
      setDeletingConfig(false);
    }
  }

  async function handleAsk(textoPergunta?: string) {
    const q = (textoPergunta ?? pergunta).trim();
    if (!q || asking) return;

    if (!config.configured) {
      toast.error("Configure a chave da API do Google Gemini primeiro.");
      setSubTab("config");
      return;
    }

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: q,
    };

    const historicoParaEnviar = messages.slice(-20).map((m) => ({
      role: m.role,
      text: m.text,
      ...(m.role === "model" && m.eventosRelacionados
        ? { eventosRelacionadosIds: m.eventosRelacionados.map((e) => e.id) }
        : {}),
    }));

    setMessages((prev) => [...prev, userMsg]);
    if (!textoPergunta) setPergunta("");
    setAsking(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 28_000);

    try {
      const res = await fetch("/api/relatorios/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          pergunta: q,
          secretariaId,
          ano,
          mes,
          situacao,
          historico: historicoParaEnviar,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Erro ao consultar IA (HTTP ${res.status})`);
      }

      const modelMsg: ChatMessage = {
        id: `m-${Date.now()}`,
        role: "model",
        text: data.resposta,
        eventosRelacionados: data.eventosRelacionados || [],
        meta: data.meta,
      };
      setMessages((prev) => [...prev, modelMsg]);
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      toast.error(
        isAbort
          ? "A consulta excedeu o tempo limite ou foi cancelada. Tente novamente."
          : err instanceof Error
          ? err.message
          : "Falha na consulta."
      );
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    } finally {
      clearTimeout(timeoutId);
      abortControllerRef.current = null;
      setAsking(false);
    }
  }

  async function handleCopyAnswer(msg: ChatMessage) {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopiedId(msg.id);
      toast.success("Resposta copiada!");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-5.25rem)] md:h-[calc(100dvh-3rem)] min-h-[480px]">
      {/* Barra de Navegação Superior fixa */}
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-border/80 pb-0 mb-3">
        <div className="flex items-center gap-5 -mb-px overflow-x-auto">
          <Link
            href="/relatorios"
            className="pb-2.5 text-sm font-medium text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors"
          >
            Prestação de Contas
          </Link>
          <Link
            href="/relatorios/ia"
            className="relative inline-flex items-center gap-1.5 pb-2.5 text-sm font-medium text-[#0E3A5D] whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Consultas com IA
            <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
          </Link>
        </div>

        <div className="flex items-center gap-1.5 pb-2 shrink-0">
          {/* Botão Gaveta de Filtros (Mobile) */}
          {subTab === "consulta" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="lg:hidden h-8 px-2.5 text-xs relative"
              onClick={() => setMobileFiltersOpen(true)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtros
              {activeFiltersCount > 0 && (
                <span className="ml-0.5 rounded-full bg-primary text-primary-foreground px-1.5 text-[10px] font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </Button>
          )}

          <Button
            type="button"
            variant={subTab === "config" ? "default" : "outline"}
            size="sm"
            className="h-8 px-2.5 text-xs"
            onClick={() =>
              setSubTab((t) => (t === "config" ? "consulta" : "config"))
            }
          >
            {subTab === "config" ? (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Voltar ao Chat</span>
                <span className="sm:hidden">Chat</span>
              </>
            ) : (
              <>
                <Settings className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">API Key</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {subTab === "config" ? (
        /* TELA DE CONFIGURAÇÕES DA CHAVE DO GOOGLE AI STUDIO */
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="max-w-2xl space-y-5 pb-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#0E3A5D] flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                Configuração — Google Gemini (AI Studio)
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Informe a chave da API do Google AI Studio para habilitar as consultas inteligentes exclusivamente sobre o banco de dados da Prefeitura.
              </p>
            </div>

            {config.configured && (
              <Card className="border-emerald-200 bg-emerald-50/40">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-emerald-900">
                      API Google Gemini conectada
                    </p>
                    <p className="text-xs text-emerald-800/80">
                      Chave ativa:{" "}
                      <code className="font-mono">{config.maskedKey}</code> •
                      Modelo: <strong>{config.model}</strong>
                    </p>
                    {config.updatedAt && (
                      <p className="text-[11px] text-emerald-800/70">
                        Atualizada em {formatarDataHoraBR(config.updatedAt)}
                        {config.updatedByEmail
                          ? ` por ${config.updatedByEmail}`
                          : ""}
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground shrink-0"
                    disabled={deletingConfig}
                    onClick={handleDeleteConfig}
                  >
                    {deletingConfig ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Remover Chave
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {config.configured
                    ? "Atualizar Chave da API"
                    : "Cadastrar Chave da API"}
                </CardTitle>
                <CardDescription>
                  A chave fica armazenada apenas no servidor (Firestore) e nunca é exposta no navegador.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveConfig} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="gemini-key">
                      Chave da API (Google AI Studio) *
                    </Label>
                    <Input
                      id="gemini-key"
                      type="password"
                      placeholder="AIzaSy..."
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      required
                    />
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline pt-0.5"
                    >
                      Obter chave no Google AI Studio
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="gemini-model">Modelo Gemini</Label>
                    <select
                      id="gemini-model"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={modelInput}
                      onChange={(e) => setModelInput(e.target.value)}
                    >
                      <option value="gemini-3.5-flash-lite">
                        Gemini 3.5 Flash-Lite (Recomendado — ultrarrápido ~1s)
                      </option>
                      <option value="gemini-3.8-flash">
                        Gemini 3.8 Flash
                      </option>
                      <option value="gemini-3.7-flash">
                        Gemini 3.7 Flash
                      </option>
                      <option value="gemini-3.6-flash">
                        Gemini 3.6 Flash
                      </option>
                      <option value="gemini-3.5-flash">
                        Gemini 3.5 Flash
                      </option>
                    </select>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="submit" disabled={savingConfig}>
                      {savingConfig ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Validando chave...
                        </>
                      ) : (
                        <>
                          <KeyRound className="h-4 w-4" />
                          Validar e Salvar Chave
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        /* CHAT DE CONSULTAS EM ALTURA FIXA OCUPANDO 100% DO RESTANTE DA TELA */
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {/* Barra compacta de filtros apenas no DESKTOP (no mobile fica na gaveta lateral) */}
          <div className="hidden lg:flex shrink-0 items-center gap-2 rounded-xl border border-border/80 bg-white px-3.5 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0E3A5D] pr-1 shrink-0">
              <Database className="h-3.5 w-3.5 text-primary" />
              Base:
            </span>

            <select
              aria-label="Filtrar Secretaria"
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs flex-1 min-w-[160px]"
              value={secretariaId}
              onChange={(e) => {
                setSecretariaId(e.target.value);
                setMessages([]);
              }}
            >
              <option value="TODAS">Geral — Todas as Secretarias</option>
              {secretarias.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  Somente {sec.nome}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar Situação"
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs"
              value={situacao}
              onChange={(e) => {
                setSituacao(
                  e.target.value as
                    | "TODAS"
                    | "REALIZADA"
                    | "FUTURA"
                    | "CANCELADA"
                );
                setMessages([]);
              }}
            >
              <option value="TODAS">Todas Situações</option>
              <option value="REALIZADA">Realizadas</option>
              <option value="FUTURA">Futuras</option>
              <option value="CANCELADA">Canceladas</option>
            </select>

            <select
              aria-label="Filtrar Ano"
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs"
              value={ano}
              onChange={(e) => {
                setAno(e.target.value);
                if (!e.target.value) setMes("");
                setMessages([]);
              }}
            >
              <option value="">Todos Anos</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar Mês"
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs"
              value={mes}
              onChange={(e) => {
                const val = e.target.value;
                setMes(val);
                if (val && !ano) setAno(String(now.getFullYear()));
                setMessages([]);
              }}
            >
              <option value="">Todos Meses</option>
              {MESES_PT.map((nomeMes, i) => (
                <option key={nomeMes} value={String(i + 1)}>
                  {nomeMes}
                </option>
              ))}
            </select>

            {messages.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => setMessages([])}
                title="Limpar conversa"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Limpar
              </Button>
            )}
          </div>

          {/* Container Fixo do Chat (ocupa 100% da altura restante sem pular de tamanho) */}
          <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border/80 bg-white overflow-hidden shadow-2xs">
            {/* Sub-header compacto no mobile mostrando escopo ativo */}
            <div className="lg:hidden shrink-0 flex items-center justify-between gap-2 border-b bg-muted/25 px-3.5 py-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 truncate">
                <Database className="h-3 w-3 text-primary shrink-0" />
                <span className="truncate">{resumoFiltroAtivo}</span>
              </span>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  className="text-primary font-medium shrink-0"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Área de Mensagens com Scroll Interno Fixo */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-4 space-y-5">
                  <div className="text-center space-y-1.5 max-w-md">
                    <div className="mx-auto h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <p className="text-base font-semibold text-[#0E3A5D]">
                      Consultas Inteligentes no Banco de Dados
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pesquise ações, relatórios, atendimentos e datas. As respostas usam apenas os registros salvos no sistema.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                    {SUGESTOES_CONSULTA.map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        disabled={asking}
                        onClick={() => handleAsk(sug)}
                        className="rounded-lg border border-border/80 bg-muted/20 hover:bg-muted/50 hover:border-primary/40 px-3.5 py-2.5 text-left text-xs text-foreground transition-colors"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 sm:gap-3 ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {msg.role === "model" && (
                        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}

                      <div
                        className={`max-w-[90%] sm:max-w-[82%] rounded-xl px-3.5 sm:px-4 py-3 text-sm space-y-2.5 ${
                          msg.role === "user"
                            ? "bg-[#0E3A5D] text-white"
                            : "bg-muted/35 border border-border/80 text-foreground"
                        }`}
                      >
                        <div className="whitespace-pre-wrap leading-relaxed">
                          {msg.text}
                        </div>

                        {/* Links clicáveis diretos para os eventos citados pela IA */}
                        {msg.role === "model" &&
                          msg.eventosRelacionados &&
                          msg.eventosRelacionados.length > 0 && (
                            <div className="pt-2 space-y-1.5">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Ações encontradas ({msg.eventosRelacionados.length})
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {msg.eventosRelacionados.map((ev) => (
                                  <Link
                                    key={ev.id}
                                    href={`/eventos/${ev.id}`}
                                    className="group flex items-start justify-between gap-2 rounded-lg border border-border/80 bg-white px-3 py-2 hover:border-primary/50 hover:bg-primary/[0.03] transition-colors"
                                  >
                                    <div className="min-w-0 space-y-0.5">
                                      <p className="text-xs font-semibold text-[#0E3A5D] group-hover:text-primary truncate">
                                        {ev.titulo}
                                      </p>
                                      <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        <span className="inline-flex items-center gap-1">
                                          <Calendar className="h-3 w-3 opacity-70" />
                                          {ev.data}
                                        </span>
                                        <span>• {ev.secretaria}</span>
                                        <span className="inline-flex items-center gap-0.5 truncate max-w-[150px]">
                                          <MapPin className="h-3 w-3 opacity-70 shrink-0" />
                                          <span className="truncate">{ev.local}</span>
                                        </span>
                                      </p>
                                    </div>
                                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0 mt-0.5" />
                                  </Link>
                                ))}
                              </div>
                            </div>
                          )}

                        {msg.role === "model" && msg.meta && (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60 text-[11px] text-muted-foreground">
                            <span>
                              Base: <strong>{msg.meta.registrosAnalisados}</strong>{" "}
                              registro(s) • {msg.meta.escopoSecretaria} ({msg.meta.escopoPeriodo})
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyAnswer(msg)}
                              className="inline-flex items-center gap-1 hover:text-foreground font-medium"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-600" />
                                  Copiado
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  Copiar
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {msg.role === "user" && (
                        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-secondary text-secondary-foreground flex items-center justify-center shrink-0 mt-0.5">
                          <User className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  ))}

                  {asking && (
                    <div className="flex items-center justify-between gap-2.5 text-xs text-muted-foreground pl-10">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        Consultando banco de dados...
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelAsk}
                        className="text-xs text-muted-foreground hover:text-destructive underline"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Campo de Pergunta Fixo na Base */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAsk();
              }}
              className="shrink-0 flex gap-2 p-3 sm:p-3.5 border-t bg-slate-50/70"
            >
              <Input
                placeholder="Pergunte sobre ações, relatórios, datas ou atendimentos..."
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                disabled={asking}
                className="bg-white h-10 sm:h-11 text-base sm:text-sm"
              />
              <Button
                type="submit"
                className="h-10 sm:h-11 px-4 sm:px-5 shrink-0"
                disabled={asking || pergunta.trim().length < 3}
              >
                {asking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span className="hidden sm:inline">Consultar</span>
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Gaveta Lateral (Drawer) de Filtros para Mobile */}
      {mobileFiltersOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[1px]"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="relative z-10 w-[85vw] max-w-xs h-full bg-white shadow-2xl flex flex-col animate-fade-in">
            <div className="flex items-center justify-between px-4 py-3.5 border-b">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-[#0E3A5D]">
                  Filtros da Base de Dados
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Secretaria (Escopo)
                </Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                  value={secretariaId}
                  onChange={(e) => {
                    setSecretariaId(e.target.value);
                    setMessages([]);
                  }}
                >
                  <option value="TODAS">Geral — Todas as Secretarias</option>
                  {secretarias.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      Somente {sec.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Situação</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                  value={situacao}
                  onChange={(e) => {
                    setSituacao(
                      e.target.value as
                        | "TODAS"
                        | "REALIZADA"
                        | "FUTURA"
                        | "CANCELADA"
                    );
                    setMessages([]);
                  }}
                >
                  <option value="TODAS">Todas as Situações</option>
                  <option value="REALIZADA">Somente Realizadas</option>
                  <option value="FUTURA">Somente Futuras</option>
                  <option value="CANCELADA">Somente Canceladas</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Ano (opcional)
                </Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                  value={ano}
                  onChange={(e) => {
                    setAno(e.target.value);
                    if (!e.target.value) setMes("");
                    setMessages([]);
                  }}
                >
                  <option value="">Todos os Anos</option>
                  {years.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Mês (opcional)
                </Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                  value={mes}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMes(val);
                    if (val && !ano) setAno(String(now.getFullYear()));
                    setMessages([]);
                  }}
                >
                  <option value="">Todos os Meses</option>
                  {MESES_PT.map((nomeMes, i) => (
                    <option key={nomeMes} value={String(i + 1)}>
                      {nomeMes}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-4 border-t flex items-center gap-2">
              {activeFiltersCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={limparFiltros}
                >
                  Limpar
                </Button>
              )}
              <Button
                type="button"
                className="flex-1"
                onClick={() => setMobileFiltersOpen(false)}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
