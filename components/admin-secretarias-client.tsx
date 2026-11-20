"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  FolderCheck,
  KeyRound,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Power,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SecretariaItem {
  id: string;
  nome: string;
  sigla: string | null;
  descricao: string | null;
  ativa: boolean;
  driveFolderId: string | null;
  _count: { usuarios: number; eventos: number };
}

function slugifyLogin(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

function gerarSenhaForte(prefixo = "Belmonte"): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  const clean = prefixo.replace(/[^a-zA-Z]/g, "").slice(0, 8) || "Sec";
  const cap = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  return `${cap}@${rand}`;
}

export function AdminSecretariasClient({
  initialSecretarias,
}: {
  initialSecretarias: SecretariaItem[];
}) {
  const [secretarias, setSecretarias] =
    useState<SecretariaItem[]>(initialSecretarias);

  // Modal Criar/Editar Secretaria
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SecretariaItem | null>(null);
  const [saving, setSaving] = useState(false);

  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [descricao, setDescricao] = useState("");

  // Usuário inicial ao criar secretaria
  const [criarUsuarioInicial, setCriarUsuarioInicial] = useState(true);
  const [uName, setUName] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uUsername, setUUsername] = useState("");
  const [uPassword, setUPassword] = useState("");

  // Modal Rápido: Adicionar Novo Login para Secretaria existente
  const [addLoginSec, setAddLoginSec] = useState<SecretariaItem | null>(null);
  const [savingLogin, setSavingLogin] = useState(false);

  // Modal Confirmar Exclusão de Secretaria
  const [deleteTarget, setDeleteTarget] = useState<SecretariaItem | null>(null);
  const [deleteUsersTogether, setDeleteUsersTogether] = useState(true);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setEditing(null);
    setNome("");
    setSigla("");
    setDescricao("");
    setCriarUsuarioInicial(true);
    setUName("");
    setUEmail("");
    setUUsername("");
    setUPassword(gerarSenhaForte());
    setModalOpen(true);
  }

  function handleNomeChange(val: string) {
    setNome(val);
    if (!editing && criarUsuarioInicial) {
      const slug = slugifyLogin(val);
      setUName(val.trim() ? `Equipe Secretaria de ${val.trim()}` : "");
      setUEmail(slug ? `${slug}@belmonte.ba.gov.br` : "");
      setUUsername(slug);
    }
  }

  function openEdit(sec: SecretariaItem) {
    setEditing(sec);
    setNome(sec.nome);
    setSigla(sec.sigla ?? "");
    setDescricao(sec.descricao ?? "");
    setCriarUsuarioInicial(false);
    setModalOpen(true);
  }

  function openAddLogin(sec: SecretariaItem) {
    const slug = slugifyLogin(sec.nome);
    const num = sec._count.usuarios + 1;
    setAddLoginSec(sec);
    setUName(`Equipe ${sec.nome} ${num}`);
    setUEmail(`${slug}${num}@belmonte.ba.gov.br`);
    setUUsername(`${slug}${num}`);
    setUPassword(gerarSenhaForte(slug));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setSaving(true);

    try {
      if (editing) {
        const res = await fetch(`/api/secretarias/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: nome.trim(),
            sigla: sigla.trim() || null,
            descricao: descricao.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao atualizar");
        setSecretarias((prev) =>
          prev.map((s) => (s.id === editing.id ? data.secretaria : s))
        );
        toast.success("Secretaria atualizada!");
      } else {
        const payload: Record<string, unknown> = {
          nome: nome.trim(),
          sigla: sigla.trim() || null,
          descricao: descricao.trim() || null,
          criarUsuarioInicial,
        };

        if (criarUsuarioInicial) {
          payload.usuarioInicial = {
            name: uName.trim(),
            email: uEmail.trim(),
            username: uUsername.trim(),
            password: uPassword,
          };
        }

        const res = await fetch("/api/secretarias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao cadastrar");
        setSecretarias((prev) =>
          [...prev, data.secretaria].sort((a, b) =>
            a.nome.localeCompare(b.nome)
          )
        );
        if (data.driveWarning) {
          toast.warning(data.driveWarning);
        }
        if (data.usuarioCriado) {
          toast.success(
            `Secretaria "${data.secretaria.nome}" e login (${data.usuarioCriado.email}) criados com sucesso!`
          );
        } else {
          toast.success(
            `Secretaria "${data.secretaria.nome}" cadastrada com sucesso!`
          );
        }
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAdditionalLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!addLoginSec) return;
    setSavingLogin(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: uName.trim(),
          email: uEmail.trim(),
          username: uUsername.trim(),
          password: uPassword,
          role: "SECRETARIA",
          secretariaId: addLoginSec.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar login");

      setSecretarias((prev) =>
        prev.map((s) =>
          s.id === addLoginSec.id
            ? {
                ...s,
                _count: { ...s._count, usuarios: s._count.usuarios + 1 },
              }
            : s
        )
      );
      toast.success(
        `Novo login criado para ${addLoginSec.nome}: ${data.usuario.email}`
      );
      setAddLoginSec(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar login.");
    } finally {
      setSavingLogin(false);
    }
  }

  async function handleToggleAtiva(sec: SecretariaItem) {
    try {
      const res = await fetch(`/api/secretarias/${sec.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativa: !sec.ativa }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao alterar status");
      setSecretarias((prev) =>
        prev.map((s) => (s.id === sec.id ? data.secretaria : s))
      );
      toast.success(
        data.secretaria.ativa
          ? `Secretaria "${sec.nome}" reativada.`
          : `Secretaria "${sec.nome}" desativada.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar.");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/secretarias/${deleteTarget.id}?deleteUsers=${deleteUsersTogether}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir secretaria");
      setSecretarias((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      toast.success(`Secretaria "${deleteTarget.nome}" excluída.`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Landmark className="h-6 w-6 text-primary" />
            Gestão de Secretarias
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cadastre, edite, desative ou remova secretarias municipais e gere um ou mais logins dedicados para cada secretaria.
          </p>
        </div>

        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nova Secretaria
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {secretarias.map((sec, idx) => (
          <Card
            key={sec.id}
            style={{ animationDelay: `${Math.min(idx * 30, 240)}ms` }}
            className={
              !sec.ativa
                ? "opacity-65 bg-muted/30 animate-fade-up"
                : "card-interactive animate-fade-up"
            }
          >
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base">{sec.nome}</h3>
                    {sec.sigla && (
                      <Badge variant="secondary" className="text-[11px]">
                        {sec.sigla}
                      </Badge>
                    )}
                  </div>
                  {sec.descricao && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {sec.descricao}
                    </p>
                  )}
                </div>

                <Badge
                  variant={sec.ativa ? "default" : "outline"}
                  className={
                    sec.ativa
                      ? "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                      : "text-muted-foreground"
                  }
                >
                  {sec.ativa ? "Ativa" : "Inativa"}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
                <div className="flex items-center gap-3">
                  <span>{sec._count.usuarios} login(s)</span>
                  <span>•</span>
                  <span>{sec._count.eventos} evento(s)</span>
                </div>
                {sec.driveFolderId && (
                  <span
                    className="inline-flex items-center gap-1 text-emerald-700"
                    title="Pasta provisionada no Google Drive"
                  >
                    <FolderCheck className="h-3.5 w-3.5" />
                    Drive OK
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openAddLogin(sec)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  + Login
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(sec)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button
                  variant={sec.ativa ? "outline" : "default"}
                  size="sm"
                  onClick={() => handleToggleAtiva(sec)}
                >
                  {sec.ativa ? (
                    <>
                      <Power className="h-3.5 w-3.5" />
                      Desativar
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Reativar
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => {
                    setDeleteUsersTogether(true);
                    setDeleteTarget(sec);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal Criar / Editar Secretaria */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar Secretaria" : "Cadastrar Nova Secretaria"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Atualize os dados da secretaria municipal."
                : "Cadastre a secretaria, crie automaticamente sua pasta no Google Drive e já gere um login inicial se desejar."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sec-nome">Nome da Secretaria *</Label>
                <Input
                  id="sec-nome"
                  placeholder="Ex: Assistência Social"
                  value={nome}
                  onChange={(e) => handleNomeChange(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sec-sigla">Sigla</Label>
                <Input
                  id="sec-sigla"
                  placeholder="Ex: SMAS"
                  value={sigla}
                  onChange={(e) => setSigla(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sec-desc">Descrição</Label>
              <Textarea
                id="sec-desc"
                rows={2}
                placeholder="Descrição breve da secretaria..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            {!editing && (
              <div className="rounded-lg border bg-muted/30 p-3.5 space-y-3">
                <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={criarUsuarioInicial}
                    onChange={(e) => setCriarUsuarioInicial(e.target.checked)}
                  />
                  Já gerar usuário e senha para esta secretaria
                </label>

                {criarUsuarioInicial && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                      <Label htmlFor="init-u-name">Nome do Usuário *</Label>
                      <Input
                        id="init-u-name"
                        placeholder="Ex: Equipe Assistência Social"
                        value={uName}
                        onChange={(e) => setUName(e.target.value)}
                        required={criarUsuarioInicial}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="init-u-email">E-mail de Login *</Label>
                        <Input
                          id="init-u-email"
                          type="email"
                          placeholder="assistencia@belmonte.ba.gov.br"
                          value={uEmail}
                          onChange={(e) => setUEmail(e.target.value)}
                          required={criarUsuarioInicial}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="init-u-user">Usuário (opcional)</Label>
                        <Input
                          id="init-u-user"
                          placeholder="assistencia"
                          value={uUsername}
                          onChange={(e) => setUUsername(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="init-u-pass">Senha *</Label>
                      <div className="flex gap-2">
                        <Input
                          id="init-u-pass"
                          type="text"
                          value={uPassword}
                          onChange={(e) => setUPassword(e.target.value)}
                          required={criarUsuarioInicial}
                          minLength={6}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() =>
                            setUPassword(gerarSenhaForte(slugifyLogin(nome)))
                          }
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Gerar
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing
                  ? "Salvar Alterações"
                  : criarUsuarioInicial
                  ? "Criar Secretaria + Login"
                  : "Cadastrar Secretaria"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Adicionar Novo Login para Secretaria */}
      <Dialog
        open={Boolean(addLoginSec)}
        onOpenChange={(open) => !open && setAddLoginSec(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Novo Login — {addLoginSec?.nome}
            </DialogTitle>
            <DialogDescription>
              Você pode criar quantos logins desejar para a mesma secretaria. Todos terão acesso restrito apenas aos eventos e relatórios de{" "}
              <strong>{addLoginSec?.nome}</strong>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveAdditionalLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-u-name">Nome Completo *</Label>
              <Input
                id="add-u-name"
                value={uName}
                onChange={(e) => setUName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-u-email">E-mail *</Label>
                <Input
                  id="add-u-email"
                  type="email"
                  value={uEmail}
                  onChange={(e) => setUEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-u-user">Usuário (opcional)</Label>
                <Input
                  id="add-u-user"
                  value={uUsername}
                  onChange={(e) => setUUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-u-pass">Senha *</Label>
              <div className="flex gap-2">
                <Input
                  id="add-u-pass"
                  type="text"
                  value={uPassword}
                  onChange={(e) => setUPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setUPassword(
                      gerarSenhaForte(slugifyLogin(addLoginSec?.nome || ""))
                    )
                  }
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Gerar
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddLoginSec(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={savingLogin}>
                {savingLogin && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar Login
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Exclusão de Secretaria */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Excluir Secretaria &quot;{deleteTarget?.nome}&quot;?
            </DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita.
              {deleteTarget && deleteTarget._count.eventos > 0 && (
                <>
                  {" "}
                  <strong>{deleteTarget._count.eventos} evento(s)</strong>{" "}
                  vinculados no portal também serão removidos do banco de dados
                  (os arquivos já enviados ao Google Drive permanecem intactos).
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {deleteTarget && deleteTarget._count.usuarios > 0 && (
            <label className="flex items-center gap-2.5 text-sm rounded-lg border bg-muted/40 p-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-destructive"
                checked={deleteUsersTogether}
                onChange={(e) => setDeleteUsersTogether(e.target.checked)}
              />
              <span>
                Excluir também os{" "}
                <strong>{deleteTarget._count.usuarios} login(s)</strong>{" "}
                vinculados a esta secretaria
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Exclusão
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
