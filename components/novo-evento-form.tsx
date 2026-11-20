"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  FileText,
  Handshake,
  ImagePlus,
  Loader2,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  QueuedFile,
  ResumableUploader,
  uploadFileResumable,
} from "@/components/resumable-uploader";

interface NovoEventoFormProps {
  isAdmin: boolean;
  userSecretariaId: string | null;
  secretariaNome: string | null;
  secretarias: { id: string; nome: string }[];
}

const TEMPLATE_RELATORIO = `1. OBJETIVO DA AÇÃO:
Descreva o propósito principal do evento/ação realizada.

2. PÚBLICO ATINGIDO:
Informe estimativa de participantes, comunidade beneficiada e autoridades presentes.

3. ATIVIDADES REALIZADAS E RESULTADOS:
Detalhe as entregas, atendimentos realizados, depoimentos e próximos passos.

4. CONTATO / FONTES PARA REDAÇÃO:
Nome e cargo de quem pode fornecer declarações ou dados complementares.`;

export function NovoEventoForm({
  isAdmin,
  userSecretariaId,
  secretariaNome,
  secretarias,
}: NovoEventoFormProps) {
  const router = useRouter();
  const hojeISO = new Date().toISOString().slice(0, 10);

  const [titulo, setTitulo] = useState("");
  const [dataRealizacao, setDataRealizacao] = useState(hojeISO);
  const [local, setLocal] = useState("");
  const [secretariaId, setSecretariaId] = useState(secretarias[0]?.id ?? "");
  const [secretariasParceirasIds, setSecretariasParceirasIds] = useState<string[]>([]);
  const [orgaosExternos, setOrgaosExternos] = useState<string[]>([]);
  const [novoOrgao, setNovoOrgao] = useState("");
  const [parceirosOpen, setParceirosOpen] = useState(false);
  const [resumo, setResumo] = useState("");
  const [relatorioCompleto, setRelatorioCompleto] = useState("");
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [statusLabel, setStatusLabel] = useState("");
  const [activeTab, setActiveTab] = useState("dados");

  const secretariaPrincipalId = isAdmin ? secretariaId : userSecretariaId;
  const secretariasDisponiveisParceiras = secretarias.filter(
    (s) => s.id !== secretariaPrincipalId
  );

  function toggleSecretariaParceira(id: string) {
    setSecretariasParceirasIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function handleAddOrgaoExterno() {
    const clean = novoOrgao.trim();
    if (clean.length < 2) return;
    if (!orgaosExternos.some((o) => o.toLowerCase() === clean.toLowerCase())) {
      setOrgaosExternos((prev) => [...prev, clean]);
    }
    setNovoOrgao("");
  }

  function handleRemoveOrgaoExterno(orgao: string) {
    setOrgaosExternos((prev) => prev.filter((o) => o !== orgao));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!titulo.trim() || !local.trim() || !resumo.trim()) {
      toast.error("Preencha todos os dados básicos do evento.");
      setActiveTab("dados");
      return;
    }

    if (relatorioCompleto.trim().length < 10) {
      toast.error(
        "Preencha a aba 'Relatório Completo' com os detalhes do evento."
      );
      setActiveTab("relatorio");
      return;
    }

    if (isAdmin && !secretariaId) {
      toast.error("Selecione a secretaria responsável.");
      return;
    }

    setSubmitting(true);
    setStatusLabel("Registrando evento e preparando pastas...");

    try {
      const res = await fetch("/api/eventos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo.trim(),
          dataRealizacao,
          local: local.trim(),
          resumo: resumo.trim(),
          relatorioCompleto: relatorioCompleto.trim(),
          secretariasParceirasIds: secretariasParceirasIds.filter(
            (id) => id !== secretariaPrincipalId
          ),
          orgaosParceirosExternos: orgaosExternos,
          ...(isAdmin ? { secretariaId } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao cadastrar evento");
      }

      if (data.driveWarning) {
        toast.warning(data.driveWarning);
      }

      const eventoId: string = data.evento.id;

      // Se houver arquivos selecionados, dispara o Resumable Upload direto para o Drive
      if (files.length > 0) {
        setActiveTab("midias");
        setStatusLabel(`Enviando ${files.length} arquivo(s) de mídia...`);

        let okCount = 0;
        let errCount = 0;
        const queue = [...files];
        const hasVideo = queue.some(
          (f) =>
            f.file.type.startsWith("video/") ||
            /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(f.file.name)
        );
        const concurrency = hasVideo ? 1 : Math.min(2, queue.length);

        const workers = Array.from(
          { length: concurrency },
          async () => {
            while (queue.length > 0) {
              const item = queue.shift();
              if (!item) break;
              try {
                await uploadFileResumable({
                  eventoId,
                  file: item.file,
                  onProgress: (progress) => {
                    setFiles((prev) =>
                      prev.map((f) =>
                        f.id === item.id ? { ...f, progress } : f
                      )
                    );
                  },
                  onPhaseChange: (status) => {
                    setFiles((prev) =>
                      prev.map((f) =>
                        f.id === item.id
                          ? { ...f, status, error: undefined }
                          : f
                      )
                    );
                  },
                });
                okCount++;
              } catch (err) {
                errCount++;
                const msg =
                  err instanceof Error ? err.message : "Falha no upload";
                setFiles((prev) =>
                  prev.map((f) =>
                    f.id === item.id
                      ? { ...f, status: "error", error: msg }
                      : f
                  )
                );
              }
            }
          }
        );

        await Promise.all(workers);

        if (errCount > 0) {
          toast.warning(
            `Evento criado! ${okCount} mídia(s) enviada(s) e ${errCount} com falha. Você pode reenviar na página do evento.`
          );
        } else {
          toast.success(
            `Evento cadastrado e ${okCount} mídia(s) enviada(s) com sucesso!`
          );
        }
      } else {
        toast.success("Evento cadastrado com sucesso!");
      }

      router.push(`/eventos/${eventoId}`);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao salvar demanda."
      );
      setSubmitting(false);
      setStatusLabel("");
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para ações realizadas
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            Registrar Nova Ação Realizada
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Registre uma ação já realizada em nome de qualquer secretaria municipal."
              : `Secretaria vinculada: ${secretariaNome}`}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 h-auto p-1">
            <TabsTrigger value="dados" className="gap-1.5 py-2 text-xs sm:text-sm px-1.5 sm:px-3">
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span className="sm:hidden">1. Dados</span>
              <span className="hidden sm:inline">1. Dados do Evento</span>
            </TabsTrigger>
            <TabsTrigger value="relatorio" className="gap-1.5 py-2 text-xs sm:text-sm px-1.5 sm:px-3">
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span className="sm:hidden">2. Relatório</span>
              <span className="hidden sm:inline">2. Relatório Completo</span>
            </TabsTrigger>
            <TabsTrigger value="midias" className="gap-1.5 py-2 text-xs sm:text-sm px-1.5 sm:px-3">
              <ImagePlus className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span className="sm:hidden">3. Mídias ({files.length})</span>
              <span className="hidden sm:inline">3. Fotos e Vídeos ({files.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* Aba 1: Dados Básicos */}
          <TabsContent value="dados">
            <Card>
              <CardHeader>
                <CardTitle>Informações Principais</CardTitle>
                <CardDescription>
                  Dados essenciais para identificação e agendamento da comunicação.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isAdmin && (
                  <div className="space-y-2">
                    <Label htmlFor="secretariaId">Secretaria Responsável *</Label>
                    <select
                      id="secretariaId"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={secretariaId}
                      onChange={(e) => setSecretariaId(e.target.value)}
                      required
                    >
                      <option value="">Selecione...</option>
                      {secretarias.map((sec) => (
                        <option key={sec.id} value={sec.id}>
                          {sec.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="titulo">Título do Evento / Ação *</Label>
                  <Input
                    id="titulo"
                    placeholder="Ex: Mutirão de Vacinação no Bairro São Benedito"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataRealizacao">Data de Realização *</Label>
                    <Input
                      id="dataRealizacao"
                      type="date"
                      value={dataRealizacao}
                      onChange={(e) => setDataRealizacao(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="local">Local *</Label>
                    <Input
                      id="local"
                      placeholder="Ex: UBS Central, Escola Municipal, Praça..."
                      value={local}
                      onChange={(e) => setLocal(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resumo">Resumo / O que aconteceu *</Label>
                  <Textarea
                    id="resumo"
                    rows={4}
                    placeholder="Faça um resumo objetivo da ação para rápida visualização da equipe de marketing..."
                    value={resumo}
                    onChange={(e) => setResumo(e.target.value)}
                    required
                  />
                </div>

                {/* Secretarias ou Órgãos Parceiros (oculto por padrão; abre ao clicar) */}
                <div className="rounded-xl border bg-muted/20 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setParceirosOpen((v) => !v)}
                    aria-expanded={parceirosOpen}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-sm font-medium flex items-center gap-2 text-foreground">
                      <Handshake className="h-4 w-4 text-primary shrink-0" />
                      <span>Secretarias ou Órgãos Parceiros (opcional)</span>
                      {secretariasParceirasIds.length + orgaosExternos.length > 0 && (
                        <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px] font-semibold">
                          {secretariasParceirasIds.length + orgaosExternos.length}
                        </span>
                      )}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
                        parceirosOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {parceirosOpen && (
                    <div className="px-4 pb-4 pt-2 border-t space-y-4 animate-fade-in">
                      <p className="text-xs text-muted-foreground">
                        Marque outras secretarias que participaram em parceria (esta ação também aparecerá na lista delas como parceira) ou adicione qualquer outro órgão.
                      </p>

                      {secretariasDisponiveisParceiras.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">
                            Secretarias Municipais Parceiras
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {secretariasDisponiveisParceiras.map((sec) => {
                              const selected = secretariasParceirasIds.includes(sec.id);
                              return (
                                <button
                                  key={sec.id}
                                  type="button"
                                  onClick={() => toggleSecretariaParceira(sec.id)}
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                                    selected
                                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                                      : "bg-white text-foreground border-input hover:border-primary/50"
                                  }`}
                                >
                                  <span>{sec.nome}</span>
                                  {selected && <X className="h-3 w-3" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="orgao-externo" className="text-xs text-muted-foreground">
                          Outro Órgão / Parceiro Externo
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="orgao-externo"
                            placeholder="Ex: Polícia Militar, Governo da Bahia, Câmara Municipal, SEBRAE..."
                            value={novoOrgao}
                            onChange={(e) => setNovoOrgao(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddOrgaoExterno();
                              }
                            }}
                            className="bg-white"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="default"
                            onClick={handleAddOrgaoExterno}
                            disabled={novoOrgao.trim().length < 2}
                            className="shrink-0"
                          >
                            <Plus className="h-4 w-4" />
                            Adicionar
                          </Button>
                        </div>

                        {orgaosExternos.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {orgaosExternos.map((orgao) => (
                              <span
                                key={orgao}
                                className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                              >
                                {orgao}
                                <button
                                  type="button"
                                  aria-label={`Remover ${orgao}`}
                                  onClick={() => handleRemoveOrgaoExterno(orgao)}
                                  className="rounded-full hover:bg-black/10 p-0.5"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setActiveTab("relatorio")}
                  >
                    Avançar para Relatório Completo
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba 2: Relatório Completo */}
          <TabsContent value="relatorio">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Relatório Completo do Evento</CardTitle>
                  <CardDescription>
                    Detalhe objetivos, público atingido, números e resultados para subsidiar matérias e posts.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!relatorioCompleto.trim()) {
                      setRelatorioCompleto(TEMPLATE_RELATORIO);
                    } else {
                      setRelatorioCompleto(
                        (prev) => `${prev}\n\n${TEMPLATE_RELATORIO}`
                      );
                    }
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Inserir Modelo
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="relatorioCompleto">
                    Texto Detalhado do Relatório *
                  </Label>
                  <Textarea
                    id="relatorioCompleto"
                    rows={12}
                    placeholder="Descreva os objetivos da ação, quantidade de pessoas atendidas, autoridades participantes, resultados alcançados..."
                    value={relatorioCompleto}
                    onChange={(e) => setRelatorioCompleto(e.target.value)}
                    className="leading-relaxed"
                    required
                  />
                </div>

                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveTab("dados")}
                  >
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setActiveTab("midias")}
                  >
                    Avançar para Fotos e Vídeos
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba 3: Upload Múltiplo de Mídias */}
          <TabsContent value="midias">
            <Card>
              <CardHeader>
                <CardTitle>Fotos e Vídeos do Evento</CardTitle>
                <CardDescription>
                  Selecione todas as fotos e vídeos em alta qualidade. Os arquivos serão organizados automaticamente nos bastidores ao enviar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResumableUploader
                  files={files}
                  onFilesChange={setFiles}
                  disabled={submitting}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">
            {submitting ? (
              <span className="inline-flex items-center gap-2 text-primary font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                {statusLabel}
              </span>
            ) : (
              <span>
                Os arquivos serão enviados diretamente com barra de progresso individual após salvar.
              </span>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full sm:w-auto"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Salvar Ação{files.length > 0 ? ` e Enviar ${files.length} Mídia(s)` : ""}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
