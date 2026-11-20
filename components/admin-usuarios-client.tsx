"use client";

import { useMemo, useState } from "react";
import type { Role } from "@/lib/types";
import { toast } from "sonner";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Pencil,
  Power,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UsuarioItem {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: Role;
  ativo: boolean;
  secretariaId: string | null;
  secretaria: { id: string; nome: string; sigla: string | null } | null;
}

interface SecretariaOption {
  id: string;
  nome: string;
  sigla: string | null;
}

function gerarSenha(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `Belmonte@${rand}`;
}

export function AdminUsuariosClient({
  initialUsuarios,
  secretarias,
  currentUserId,
}: {
  initialUsuarios: UsuarioItem[];
  secretarias: SecretariaOption[];
  currentUserId: string;
}) {
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>(initialUsuarios);
  const [filtroSecretaria, setFiltroSecretaria] = useState("TODAS");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UsuarioItem | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UsuarioItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("SECRETARIA");
  const [secretariaId, setSecretariaId] = useState(secretarias[0]?.id ?? "");

  const usuariosFiltrados = useMemo(() => {
    if (filtroSecretaria === "TODAS") return usuarios;
    if (filtroSecretaria === "ADMIN") {
      return usuarios.filter((u) => u.role === "ADMIN");
    }
    return usuarios.filter((u) => u.secretariaId === filtroSecretaria);
  }, [usuarios, filtroSecretaria]);

  function openCreate() {
    setEditing(null);
    setName("");
    setEmail("");
    setUsername("");
    setPassword(gerarSenha());
    setRole("SECRETARIA");
    setSecretariaId(
      filtroSecretaria !== "TODAS" && filtroSecretaria !== "ADMIN"
        ? filtroSecretaria
        : secretarias[0]?.id ?? ""
    );
    setModalOpen(true);
  }

  function openEdit(u: UsuarioItem) {
    setEditing(u);
    setName(u.name);
    setEmail(u.email);
    setUsername(u.username ?? "");
    setPassword("");
    setRole(u.role);
    setSecretariaId(u.secretariaId ?? secretarias[0]?.id ?? "");
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/usuarios/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            username: username.trim() || null,
            password: password || undefined,
            role,
            secretariaId: role === "ADMIN" ? null : secretariaId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao atualizar usuário");
        setUsuarios((prev) =>
          prev.map((u) => (u.id === editing.id ? data.usuario : u))
        );
        toast.success("Usuário atualizado!");
      } else {
        const res = await fetch("/api/usuarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            username: username.trim(),
            password,
            role,
            secretariaId: role === "ADMIN" ? null : secretariaId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao criar usuário");
        setUsuarios((prev) => [...prev, data.usuario]);
        toast.success("Usuário cadastrado com sucesso!");
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleAtivo(u: UsuarioItem) {
    try {
      const res = await fetch(`/api/usuarios/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !u.ativo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao alterar status");
      setUsuarios((prev) =>
        prev.map((item) => (item.id === u.id ? data.usuario : item))
      );
      toast.success(
        data.usuario.ativo ? "Usuário reativado." : "Usuário desativado."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar.");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/usuarios/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir usuário");
      setUsuarios((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      toast.success(`Usuário "${deleteTarget.name}" excluído.`);
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
            <Users className="h-6 w-6 text-primary" />
            Gestão de Usuários & Acessos
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Crie quantos logins precisar por secretaria, edite senhas ou exclua usuários.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <select
            aria-label="Filtrar por Secretaria"
            className="flex h-10 w-full sm:w-auto rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={filtroSecretaria}
            onChange={(e) => setFiltroSecretaria(e.target.value)}
          >
            <option value="TODAS">Todos os Perfis ({usuarios.length})</option>
            <option value="ADMIN">Somente Agência (ADMIN)</option>
            {secretarias.map((sec) => (
              <option key={sec.id} value={sec.id}>
                Sec. {sec.nome}
              </option>
            ))}
          </select>

          <Button onClick={openCreate} className="w-full sm:w-auto">
            <UserPlus className="h-4 w-4" />
            Novo Usuário
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Nome / Login</th>
                <th className="px-4 py-3 font-semibold">Perfil</th>
                <th className="px-4 py-3 font-semibold">Secretaria Vinculada</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {usuariosFiltrados.map((u) => (
                <tr key={u.id} className={!u.ativo ? "opacity-60" : undefined}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.email}
                      {u.username ? ` • @${u.username}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="secondary"
                      className={
                        u.role === "ADMIN"
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-blue-100 text-blue-800 border-blue-200"
                      }
                    >
                      {u.role === "ADMIN" ? (
                        <span className="inline-flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          ADMIN
                        </span>
                      ) : (
                        "SECRETARIA"
                      )}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.role === "ADMIN"
                      ? "Acesso Global (Agência)"
                      : u.secretaria?.nome || "Sem vínculo"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={u.ativo ? "default" : "outline"}
                      className={
                        u.ativo
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                          : ""
                      }
                    >
                      {u.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(u)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                      {u.id !== currentUserId && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleAtivo(u)}
                          >
                            {u.ativo ? (
                              <>
                                <Power className="h-3.5 w-3.5" />
                                Desativar
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Ativar
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => setDeleteTarget(u)}
                            title="Excluir usuário"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Modal Criar / Editar Usuário */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar Usuário" : "Cadastrar Novo Usuário"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Deixe o campo de senha em branco para manter a senha atual."
                : "Defina as credenciais e vincule à secretaria desejada (múltiplos logins por secretaria são permitidos)."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="u-name">Nome Completo *</Label>
              <Input
                id="u-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="u-email">E-mail *</Label>
                <Input
                  id="u-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-username">Usuário (opcional)</Label>
                <Input
                  id="u-username"
                  placeholder="ex: educacao2"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="u-pass">
                {editing ? "Nova Senha (opcional)" : "Senha *"}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="u-pass"
                  type={editing ? "password" : "text"}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!editing}
                  minLength={editing && !password ? undefined : 6}
                />
                {!editing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPassword(gerarSenha())}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Gerar
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="u-role">Perfil de Acesso *</Label>
                <select
                  id="u-role"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="SECRETARIA">SECRETARIA</option>
                  <option value="ADMIN">ADMIN (Agência)</option>
                </select>
              </div>

              {role === "SECRETARIA" && (
                <div className="space-y-2">
                  <Label htmlFor="u-sec">Secretaria *</Label>
                  <select
                    id="u-sec"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            </div>

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
                {editing ? "Salvar Alterações" : "Criar Usuário"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Exclusão de Usuário */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Excluir usuário &quot;{deleteTarget?.name}&quot;?
            </DialogTitle>
            <DialogDescription>
              O login <strong>{deleteTarget?.email}</strong> será removido
              permanentemente. Os eventos já cadastrados por este usuário
              continuarão preservados no histórico da secretaria.
            </DialogDescription>
          </DialogHeader>

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
              Excluir Usuário
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
