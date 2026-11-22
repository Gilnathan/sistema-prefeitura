import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import {
  canUserAccessEvento,
  getEventoById,
  getSecretariaById,
  getUserById,
  listMidiasByEvento,
  listSecretarias,
} from "@/lib/firestore-repo";
import { EventoDetailClient } from "@/components/evento-detail-client";
import { resolverTipoEventoEfetivo } from "@/lib/utils";

export default async function EventoDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  const evento = await getEventoById(params.id);
  if (!evento) {
    notFound();
  }

  // Permite acesso para ADMIN, secretaria principal e secretarias parceiras
  if (!canUserAccessEvento(evento, session.user)) {
    redirect("/dashboard");
  }

  const [secretaria, criadoPor, todasSecretarias, todasMidias] = await Promise.all([
    getSecretariaById(evento.secretariaId),
    getUserById(evento.criadoPorId),
    listSecretarias({ onlyActive: true }),
    listMidiasByEvento(evento.id),
  ]);

  const initialMidias = {
    items: todasMidias.slice(0, 12),
    counts: {
      todas: todasMidias.length,
      fotos: todasMidias.filter((m) => m.tipo === "FOTO").length,
      videos: todasMidias.filter((m) => m.tipo === "VIDEO").length,
    },
    totalPages: Math.max(1, Math.ceil(todasMidias.length / 12)),
  };

  const secMap = new Map(todasSecretarias.map((s) => [s.id, s]));
  const secretariasParceiras = (evento.secretariasParceirasIds || [])
    .map((sid) => secMap.get(sid))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => ({ id: s.id, nome: s.nome, sigla: s.sigla }));

  const isParceira = Boolean(
    session.user.role === "SECRETARIA" &&
      session.user.secretariaId &&
      evento.secretariaId !== session.user.secretariaId &&
      evento.secretariasParceirasIds?.includes(session.user.secretariaId)
  );

  return (
    <EventoDetailClient
      isAdmin={session.user.role === "ADMIN"}
      isParceira={isParceira}
      todasSecretarias={todasSecretarias.map((s) => ({ id: s.id, nome: s.nome }))}
      initialMidias={initialMidias}
      evento={{
        id: evento.id,
        titulo: evento.titulo,
        tipo: resolverTipoEventoEfetivo(evento.tipo, evento.dataRealizacao),
        dataRealizacao: evento.dataRealizacao,
        local: evento.local,
        resumo: evento.resumo,
        relatorioCompleto: evento.relatorioCompleto,
        status: evento.status,
        createdAt: evento.createdAt,
        secretaria: secretaria
          ? { id: secretaria.id, nome: secretaria.nome, sigla: secretaria.sigla }
          : { id: evento.secretariaId, nome: "Secretaria", sigla: null },
        secretariasParceiras,
        orgaosParceirosExternos: evento.orgaosParceirosExternos || [],
        criadoPor: criadoPor
          ? { id: criadoPor.id, name: criadoPor.name, email: criadoPor.email }
          : {
              id: evento.criadoPorId,
              name: evento.criadoPorNome || "Usuário",
              email: evento.criadoPorEmail || "",
            },
        editadoPor: evento.editadoPorEmail
          ? {
              name: evento.editadoPorNome || "",
              email: evento.editadoPorEmail,
              em: evento.editadoEm || evento.updatedAt,
            }
          : null,
      }}
    />
  );
}
