"use client";

import { useRef, useState } from "react";
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
  Send,
  Settings,
  Sparkles,
  Trash2,
  User,
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
  "Quais ações da Saúde mencionam atendimento odontológico ou atendimento médico no relatório?",
  "Quais ações foram feitas em parceria com outras secretarias ou órgãos externos?",
  "Faça um resumo executivo das principais entregas registradas neste filtro.",
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
        model: "gemini-3.8-flash",
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

    const historicoParaEnviar = messages.slice(-8).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages((prev) => [...prev, userMsg]);
    if (!textoPergunta) setPergunta("");
    setAsking(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 35_000);

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
      const isAbort =
        err instanceof DOMException && err.name === "AbortError";
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
    <div className="space-y-5">
      {/* Navegação interna da aba Relatórios */}
      <div className="flex items-center justify-between gap-4 border-b border-border/80">
        <div className="flex items-center gap-6 -mb-px overflow-x-auto">
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

        {/* Botão alternar Consultas <-> Configurações */}
        <div className="pb-2 shrink-0">
          <Button
            type="button"
            variant={subTab === "config" ? "default" : "outline"}
            size="sm"
            onClick={() =>
              setSubTab((t) => (t === "config" ? "consulta" : "config"))
            }
          >
            {subTab === "config" ? (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Voltar para Consultas
              </>
            ) : (
              <>
                <Settings className="h-3.5 w-3.5" />
                Configurar API Key
              </>
            )}
          </Button>
        </div>
      </div>

      {subTab === "config" ? (
        /* TELA DE CONFIGURAÇÕES DA CHAVE DO GOOGLE AI STUDIO */
        <div className="max-w-2xl space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#0E3A5D] flex items-center gap-2">
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
                    Chave ativa: <code className="font-mono">{config.maskedKey}</code> • Modelo:{" "}
                    <strong>{config.model}</strong>
                  </p>
                  {config.updatedAt && (
                    <p className="text-[11px] text-emerald-800/70">
                      Atualizada em {formatarDataHoraBR(config.updatedAt)}
                      {config.updatedByEmail ? ` por ${config.updatedByEmail}` : ""}
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
                {config.configured ? "Atualizar Chave da API" : "Cadastrar Chave da API"}
              </CardTitle>
              <CardDescription>
                A chave fica armazenada apenas no servidor (Firestore) e nunca é exposta no navegador dos usuários.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="gemini-key">Chave da API (Google AI Studio) *</Label>
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
                    <option value="gemini-3.8-flash">
                      Gemini 3.8 Flash (Recomendado — mais recente e rápido)
                    </option>
                    <option value="gemini-3.7-flash">
                      Gemini 3.7 Flash
                    </option>
                    <option value="gemini-3.6-flash">
                      Gemini 3.6 Flash
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
      ) : (
        /* TELA DE CONSULTAS VIA IA (100% BASEADA NO BANCO DE DADOS) */
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#0E3A5D] flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Consultas Inteligentes no Banco de Dados
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Pesquise eventos, relatórios, atendimentos e datas usando IA — respostas baseadas exclusivamente nos registros salvos no sistema.
              </p>
            </div>
            {messages.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMessages([])}
              >
                Limpar Conversa
              </Button>
            )}
          </div>

          {/* Filtros Prévios de Escopo */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-[#0E3A5D]">
                <Database className="h-3.5 w-3.5 text-primary" />
                <span>Filtre a base de dados antes de perguntar</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    Secretaria (Escopo)
                  </label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-white px-2.5 text-sm"
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

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    Situação
                  </label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-white px-2.5 text-sm"
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

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    Ano (opcional)
                  </label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-white px-2.5 text-sm"
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

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    Mês (opcional)
                  </label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-white px-2.5 text-sm"
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
            </CardContent>
          </Card>

          {/* Área de Conversa / Respostas */}
          <Card className="overflow-hidden">
            <CardContent className="p-4 sm:p-5 space-y-4">
              {messages.length === 0 ? (
                <div className="py-6 space-y-4">
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      O que você deseja consultar nos registros da Prefeitura?
                    </p>
                    <p className="text-xs text-muted-foreground">
                      A IA analisa títulos, resumos, relatórios completos, locais, datas e parcerias — sem buscar dados fora do sistema.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-3xl mx-auto">
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
                <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {msg.role === "model" && (
                        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}

                      <div
                        className={`max-w-[88%] rounded-xl px-4 py-3 text-sm space-y-2 ${
                          msg.role === "user"
                            ? "bg-[#0E3A5D] text-white"
                            : "bg-muted/40 border border-border/80 text-foreground"
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
                                        <span className="inline-flex items-center gap-0.5 truncate max-w-[160px]">
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
                              Base consultada: <strong>{msg.meta.registrosAnalisados}</strong>{" "}
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
                        <div className="h-8 w-8 rounded-lg bg-secondary text-secondary-foreground flex items-center justify-center shrink-0 mt-0.5">
                          <User className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  ))}

                  {asking && (
                    <div className="flex items-center justify-between gap-2.5 text-xs text-muted-foreground pl-11">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        Analisando registros no banco de dados...
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
                </div>
              )}

              {/* Campo de Pergunta */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAsk();
                }}
                className="flex gap-2 pt-2 border-t"
              >
                <Input
                  placeholder="Ex: Quantos eventos da Saúde tiveram atendimento odontológico em novembro?"
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                  disabled={asking}
                  className="bg-white h-11"
                />
                <Button
                  type="submit"
                  size="lg"
                  className="h-11 px-5 shrink-0"
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
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
