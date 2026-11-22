import { COLLECTIONS, getDb } from "@/lib/firebase-admin";
import type {
  EventoDoc,
  EventoLogAcao,
  EventoLogChange,
  EventoLogDoc,
  EventoStatus,
  EventoTipo,
  LoginSlideDoc,
  MidiaDoc,
  MidiaTipo,
  Role,
  SecretariaDoc,
  UserDoc,
} from "@/lib/types";

function nowIso(): string {
  return new Date().toISOString();
}

// ============================================================================
// CACHE LEVE EM MEMÓRIA (TTL 60s) PARA SECRETARIAS E USUÁRIOS
// Evita round-trips repetidos no Firestore em warm lambdas da Vercel e local
// ============================================================================
const CACHE_TTL_MS = 60_000;

const globalCache = globalThis as unknown as {
  __belmonteSecretariasCache?: { data: SecretariaDoc[]; expiresAt: number };
  __belmonteUsersCache?: { data: UserDoc[]; expiresAt: number };
};

export function invalidateSecretariasCache() {
  globalCache.__belmonteSecretariasCache = undefined;
}

export function invalidateUsersCache() {
  globalCache.__belmonteUsersCache = undefined;
}

// ============================================================================
// SECRETARIAS
// ============================================================================

export async function listSecretarias(options?: {
  onlyActive?: boolean;
  secretariaId?: string | null;
}): Promise<SecretariaDoc[]> {
  let items: SecretariaDoc[];

  if (
    globalCache.__belmonteSecretariasCache &&
    Date.now() < globalCache.__belmonteSecretariasCache.expiresAt
  ) {
    items = globalCache.__belmonteSecretariasCache.data;
  } else {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.SECRETARIAS).get();
    items = snap.docs
      .map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SecretariaDoc, "id">),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    globalCache.__belmonteSecretariasCache = {
      data: items,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  }

  let filtered = items;
  if (options?.secretariaId) {
    filtered = filtered.filter((s) => s.id === options.secretariaId);
  }
  if (options?.onlyActive) {
    filtered = filtered.filter((s) => s.ativa);
  }
  return filtered;
}

export async function getSecretariaById(
  id: string
): Promise<SecretariaDoc | null> {
  if (
    globalCache.__belmonteSecretariasCache &&
    Date.now() < globalCache.__belmonteSecretariasCache.expiresAt
  ) {
    return (
      globalCache.__belmonteSecretariasCache.data.find((s) => s.id === id) ??
      null
    );
  }
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.SECRETARIAS).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<SecretariaDoc, "id">) };
}

export async function findSecretariaByNome(
  nome: string
): Promise<SecretariaDoc | null> {
  const db = getDb();
  const nomeLower = nome.trim().toLowerCase();
  const snap = await db
    .collection(COLLECTIONS.SECRETARIAS)
    .where("nomeLower", "==", nomeLower)
    .limit(1)
    .get();
  const doc = snap.docs[0];
  if (!doc) return null;
  return { id: doc.id, ...(doc.data() as Omit<SecretariaDoc, "id">) };
}

export async function createSecretariaDoc(data: {
  nome: string;
  sigla?: string | null;
  descricao?: string | null;
  driveFolderId?: string | null;
  ativa?: boolean;
}): Promise<SecretariaDoc> {
  const db = getDb();
  const ts = nowIso();
  const ref = db.collection(COLLECTIONS.SECRETARIAS).doc();
  const payload: Omit<SecretariaDoc, "id"> = {
    nome: data.nome.trim(),
    nomeLower: data.nome.trim().toLowerCase(),
    sigla: data.sigla || null,
    descricao: data.descricao || null,
    ativa: data.ativa ?? true,
    driveFolderId: data.driveFolderId ?? null,
    createdAt: ts,
    updatedAt: ts,
  };
  await ref.set(payload);
  invalidateSecretariasCache();
  return { id: ref.id, ...payload };
}

export async function updateSecretariaDoc(
  id: string,
  patch: Partial<{
    nome: string;
    sigla: string | null;
    descricao: string | null;
    ativa: boolean;
    driveFolderId: string | null;
  }>
): Promise<SecretariaDoc | null> {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.SECRETARIAS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;

  const updates: Record<string, unknown> = { updatedAt: nowIso() };
  if (patch.nome !== undefined) {
    updates.nome = patch.nome.trim();
    updates.nomeLower = patch.nome.trim().toLowerCase();
  }
  if (patch.sigla !== undefined) updates.sigla = patch.sigla || null;
  if (patch.descricao !== undefined) updates.descricao = patch.descricao || null;
  if (patch.ativa !== undefined) updates.ativa = patch.ativa;
  if (patch.driveFolderId !== undefined) updates.driveFolderId = patch.driveFolderId;

  await ref.update(updates);
  invalidateSecretariasCache();
  const updated = await ref.get();
  return { id: updated.id, ...(updated.data() as Omit<SecretariaDoc, "id">) };
}

export async function deleteSecretariaCascade(params: {
  secretariaId: string;
  deleteUsers: boolean;
  actorUserId: string;
}): Promise<boolean> {
  const db = getDb();
  const secRef = db.collection(COLLECTIONS.SECRETARIAS).doc(params.secretariaId);
  const secSnap = await secRef.get();
  if (!secSnap.exists) return false;

  // Coleta eventos e mídias da secretaria
  const eventosSnap = await db
    .collection(COLLECTIONS.EVENTOS)
    .where("secretariaId", "==", params.secretariaId)
    .get();

  const refsToDelete: FirebaseFirestore.DocumentReference[] = [];
  for (const evDoc of eventosSnap.docs) {
    const midiasSnap = await db
      .collection(COLLECTIONS.MIDIAS)
      .where("eventoId", "==", evDoc.id)
      .get();
    for (const m of midiasSnap.docs) {
      refsToDelete.push(m.ref);
    }
    refsToDelete.push(evDoc.ref);
  }

  // Trata usuários vinculados
  const usersSnap = await db
    .collection(COLLECTIONS.USERS)
    .where("secretariaId", "==", params.secretariaId)
    .get();

  const userUpdates: FirebaseFirestore.DocumentReference[] = [];
  for (const u of usersSnap.docs) {
    if (params.deleteUsers && u.id !== params.actorUserId) {
      refsToDelete.push(u.ref);
    } else {
      userUpdates.push(u.ref);
    }
  }

  refsToDelete.push(secRef);

  // Executa em lotes seguros (máx 400 operações por WriteBatch)
  const chunkSize = 400;
  for (let i = 0; i < refsToDelete.length; i += chunkSize) {
    const batch = db.batch();
    for (const ref of refsToDelete.slice(i, i + chunkSize)) {
      batch.delete(ref);
    }
    await batch.commit();
  }

  if (userUpdates.length > 0) {
    const ts = nowIso();
    for (let i = 0; i < userUpdates.length; i += chunkSize) {
      const batch = db.batch();
      for (const ref of userUpdates.slice(i, i + chunkSize)) {
        batch.update(ref, { secretariaId: null, ativo: false, updatedAt: ts });
      }
      await batch.commit();
    }
  }

  invalidateSecretariasCache();
  invalidateUsersCache();
  return true;
}

// ============================================================================
// USUÁRIOS
// ============================================================================

export async function listUsers(): Promise<UserDoc[]> {
  if (
    globalCache.__belmonteUsersCache &&
    Date.now() < globalCache.__belmonteUsersCache.expiresAt
  ) {
    return globalCache.__belmonteUsersCache.data;
  }

  const db = getDb();
  const snap = await db.collection(COLLECTIONS.USERS).get();
  const items = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<UserDoc, "id">) }))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "ADMIN" ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });

  globalCache.__belmonteUsersCache = {
    data: items,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return items;
}

export async function getUserById(id: string): Promise<UserDoc | null> {
  if (
    globalCache.__belmonteUsersCache &&
    Date.now() < globalCache.__belmonteUsersCache.expiresAt
  ) {
    return globalCache.__belmonteUsersCache.data.find((u) => u.id === id) ?? null;
  }
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.USERS).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<UserDoc, "id">) };
}

export async function findUserByIdentifier(
  identifier: string
): Promise<UserDoc | null> {
  const db = getDb();
  const normalized = identifier.trim().toLowerCase();

  // Otimização: consulta direta pelo campo provável (1 único round-trip no login)
  const primaryField = normalized.includes("@") ? "email" : "username";
  const primarySnap = await db
    .collection(COLLECTIONS.USERS)
    .where(primaryField, "==", normalized)
    .limit(1)
    .get();

  if (!primarySnap.empty) {
    const d = primarySnap.docs[0];
    return { id: d.id, ...(d.data() as Omit<UserDoc, "id">) };
  }

  const fallbackField = primaryField === "email" ? "username" : "email";
  const fallbackSnap = await db
    .collection(COLLECTIONS.USERS)
    .where(fallbackField, "==", normalized)
    .limit(1)
    .get();

  if (!fallbackSnap.empty) {
    const d = fallbackSnap.docs[0];
    return { id: d.id, ...(d.data() as Omit<UserDoc, "id">) };
  }

  return null;
}

export async function createUserDoc(data: {
  name: string;
  email: string;
  username?: string | null;
  passwordHash: string;
  role: Role;
  secretariaId?: string | null;
  ativo?: boolean;
}): Promise<UserDoc> {
  const db = getDb();
  const ts = nowIso();
  const ref = db.collection(COLLECTIONS.USERS).doc();
  const payload: Omit<UserDoc, "id"> = {
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    username: data.username ? data.username.trim().toLowerCase() : null,
    passwordHash: data.passwordHash,
    role: data.role,
    ativo: data.ativo ?? true,
    secretariaId: data.role === "ADMIN" ? null : data.secretariaId || null,
    createdAt: ts,
    updatedAt: ts,
  };
  await ref.set(payload);
  invalidateUsersCache();
  return { id: ref.id, ...payload };
}

export async function updateUserDoc(
  id: string,
  patch: Partial<{
    name: string;
    email: string;
    username: string | null;
    passwordHash: string;
    role: Role;
    secretariaId: string | null;
    ativo: boolean;
  }>
): Promise<UserDoc | null> {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.USERS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;

  const updates: Record<string, unknown> = { updatedAt: nowIso() };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.email !== undefined) updates.email = patch.email.trim().toLowerCase();
  if (patch.username !== undefined) {
    updates.username = patch.username ? patch.username.trim().toLowerCase() : null;
  }
  if (patch.passwordHash !== undefined) updates.passwordHash = patch.passwordHash;
  if (patch.role !== undefined) updates.role = patch.role;
  if (patch.secretariaId !== undefined) updates.secretariaId = patch.secretariaId;
  if (patch.ativo !== undefined) updates.ativo = patch.ativo;

  await ref.update(updates);
  invalidateUsersCache();
  const updated = await ref.get();
  return { id: updated.id, ...(updated.data() as Omit<UserDoc, "id">) };
}

export async function deleteUserPreservingEvents(params: {
  userId: string;
  fallbackAdminId: string;
}): Promise<boolean> {
  const db = getDb();
  const userRef = db.collection(COLLECTIONS.USERS).doc(params.userId);
  const snap = await userRef.get();
  if (!snap.exists) return false;

  const eventosSnap = await db
    .collection(COLLECTIONS.EVENTOS)
    .where("criadoPorId", "==", params.userId)
    .get();

  const ts = nowIso();
  const chunkSize = 400;
  for (let i = 0; i < eventosSnap.docs.length; i += chunkSize) {
    const batch = db.batch();
    for (const d of eventosSnap.docs.slice(i, i + chunkSize)) {
      batch.update(d.ref, { criadoPorId: params.fallbackAdminId, updatedAt: ts });
    }
    await batch.commit();
  }

  await userRef.delete();
  invalidateUsersCache();
  return true;
}

// ============================================================================
// EVENTOS
// ============================================================================

export async function listEventos(options?: {
  secretariaId?: string | null;
}): Promise<EventoDoc[]> {
  const db = getDb();

  if (options?.secretariaId) {
    // Busca tanto ações criadas pela secretaria quanto ações onde ela foi marcada como parceira
    const [propriasSnap, parceirasSnap] = await Promise.all([
      db
        .collection(COLLECTIONS.EVENTOS)
        .where("secretariaId", "==", options.secretariaId)
        .get(),
      db
        .collection(COLLECTIONS.EVENTOS)
        .where("secretariasParceirasIds", "array-contains", options.secretariaId)
        .get(),
    ]);

    const merged = new Map<string, EventoDoc>();
    for (const d of [...propriasSnap.docs, ...parceirasSnap.docs]) {
      merged.set(d.id, { id: d.id, ...(d.data() as Omit<EventoDoc, "id">) });
    }

    return Array.from(merged.values()).sort((a, b) => {
      const cmp = b.dataRealizacao.localeCompare(a.dataRealizacao);
      if (cmp !== 0) return cmp;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }

  const snap = await db.collection(COLLECTIONS.EVENTOS).get();

  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<EventoDoc, "id">) }))
    .sort((a, b) => {
      const cmp = b.dataRealizacao.localeCompare(a.dataRealizacao);
      if (cmp !== 0) return cmp;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

export function canUserAccessEvento(
  evento: Pick<EventoDoc, "secretariaId" | "secretariasParceirasIds">,
  user: { role: Role; secretariaId: string | null }
): boolean {
  if (user.role === "ADMIN") return true;
  if (!user.secretariaId) return false;
  if (evento.secretariaId === user.secretariaId) return true;
  return Boolean(evento.secretariasParceirasIds?.includes(user.secretariaId));
}

export async function getEventoById(id: string): Promise<EventoDoc | null> {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.EVENTOS).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<EventoDoc, "id">) };
}

export async function createEventoDoc(data: {
  titulo: string;
  tipo?: EventoTipo;
  dataRealizacao: string;
  local: string;
  resumo: string;
  relatorioCompleto: string;
  status?: EventoStatus;
  driveFolderId?: string | null;
  secretariaId: string;
  secretariasParceirasIds?: string[];
  orgaosParceirosExternos?: string[];
  criadoPorId: string;
  criadoPorNome?: string;
  criadoPorEmail?: string;
}): Promise<EventoDoc> {
  const db = getDb();
  const ts = nowIso();
  const ref = db.collection(COLLECTIONS.EVENTOS).doc();
  const payload: Omit<EventoDoc, "id"> = {
    titulo: data.titulo.trim(),
    tipo: data.tipo ?? "REALIZADA",
    dataRealizacao: data.dataRealizacao,
    local: data.local.trim(),
    resumo: data.resumo.trim(),
    relatorioCompleto: data.relatorioCompleto.trim(),
    status: data.status ?? "NOVO",
    driveFolderId: data.driveFolderId ?? null,
    secretariaId: data.secretariaId,
    secretariasParceirasIds: data.secretariasParceirasIds ?? [],
    orgaosParceirosExternos: data.orgaosParceirosExternos ?? [],
    criadoPorId: data.criadoPorId,
    criadoPorNome: data.criadoPorNome,
    criadoPorEmail: data.criadoPorEmail,
    editadoPorId: null,
    editadoPorNome: null,
    editadoPorEmail: null,
    editadoEm: null,
    createdAt: ts,
    updatedAt: ts,
  };
  await ref.set(payload);
  return { id: ref.id, ...payload };
}

export async function updateEventoDoc(
  id: string,
  patch: Partial<{
    titulo: string;
    tipo: EventoTipo;
    dataRealizacao: string;
    local: string;
    resumo: string;
    relatorioCompleto: string;
    status: EventoStatus;
    driveFolderId: string | null;
    secretariasParceirasIds: string[];
    orgaosParceirosExternos: string[];
    editadoPorId: string;
    editadoPorNome: string;
    editadoPorEmail: string;
  }>
): Promise<EventoDoc | null> {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.EVENTOS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;

  const ts = nowIso();
  const updates: Record<string, unknown> = { updatedAt: ts };
  if (patch.titulo !== undefined) updates.titulo = patch.titulo.trim();
  if (patch.tipo !== undefined) updates.tipo = patch.tipo;
  if (patch.dataRealizacao !== undefined) {
    updates.dataRealizacao = patch.dataRealizacao;
  }
  if (patch.local !== undefined) updates.local = patch.local.trim();
  if (patch.resumo !== undefined) updates.resumo = patch.resumo.trim();
  if (patch.relatorioCompleto !== undefined) {
    updates.relatorioCompleto = patch.relatorioCompleto.trim();
  }
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.driveFolderId !== undefined) {
    updates.driveFolderId = patch.driveFolderId;
  }
  if (patch.secretariasParceirasIds !== undefined) {
    updates.secretariasParceirasIds = patch.secretariasParceirasIds;
  }
  if (patch.orgaosParceirosExternos !== undefined) {
    updates.orgaosParceirosExternos = patch.orgaosParceirosExternos;
  }
  if (patch.editadoPorId !== undefined) {
    updates.editadoPorId = patch.editadoPorId;
    updates.editadoPorNome = patch.editadoPorNome ?? null;
    updates.editadoPorEmail = patch.editadoPorEmail ?? null;
    updates.editadoEm = ts;
  }

  await ref.update(updates);
  const updated = await ref.get();
  return { id: updated.id, ...(updated.data() as Omit<EventoDoc, "id">) };
}

export async function deleteEventoCascade(id: string): Promise<boolean> {
  const db = getDb();
  const evRef = db.collection(COLLECTIONS.EVENTOS).doc(id);
  const snap = await evRef.get();
  if (!snap.exists) return false;

  const [midiasSnap, logsSnap] = await Promise.all([
    db.collection(COLLECTIONS.MIDIAS).where("eventoId", "==", id).get(),
    db.collection(COLLECTIONS.EVENTO_LOGS).where("eventoId", "==", id).get(),
  ]);

  const refs = [
    ...midiasSnap.docs.map((d) => d.ref),
    ...logsSnap.docs.map((d) => d.ref),
    evRef,
  ];
  const chunkSize = 400;
  for (let i = 0; i < refs.length; i += chunkSize) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + chunkSize)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
  return true;
}

// ============================================================================
// MÍDIAS
// ============================================================================

export async function listMidiasByEvento(eventoId: string): Promise<MidiaDoc[]> {
  const db = getDb();
  const snap = await db
    .collection(COLLECTIONS.MIDIAS)
    .where("eventoId", "==", eventoId)
    .get();

  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<MidiaDoc, "id">) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Busca mídias somente dos `eventoIds` necessários (em lotes paralelos de 30 via `in`),
 * evitando baixar a coleção inteira `midias` do Firestore.
 */
export async function listMidiasByEventoIds(
  eventoIds: string[]
): Promise<MidiaDoc[]> {
  const uniqueIds = Array.from(new Set(eventoIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const db = getDb();
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueIds.length; i += 30) {
    chunks.push(uniqueIds.slice(i, i + 30));
  }

  const snaps = await Promise.all(
    chunks.map((chunk) =>
      db.collection(COLLECTIONS.MIDIAS).where("eventoId", "in", chunk).get()
    )
  );

  const result: MidiaDoc[] = [];
  for (const snap of snaps) {
    for (const d of snap.docs) {
      result.push({ id: d.id, ...(d.data() as Omit<MidiaDoc, "id">) });
    }
  }
  return result;
}

export async function listAllMidias(): Promise<MidiaDoc[]> {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.MIDIAS).get();
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<MidiaDoc, "id">),
  }));
}

export async function upsertMidiaDoc(data: {
  driveFileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  tipo: MidiaTipo;
  eventoId: string;
  adicionadoPorId?: string;
  adicionadoPorNome?: string;
  adicionadoPorEmail?: string;
}): Promise<MidiaDoc> {
  const db = getDb();
  // Usa driveFileId como ID do documento para garantir idempotência natural
  const ref = db.collection(COLLECTIONS.MIDIAS).doc(data.driveFileId);
  const existing = await ref.get();
  const createdAt = existing.exists
    ? ((existing.data() as MidiaDoc).createdAt || nowIso())
    : nowIso();

  const payload: Omit<MidiaDoc, "id"> = {
    driveFileId: data.driveFileId,
    fileName: data.fileName,
    mimeType: data.mimeType,
    fileSize: data.fileSize,
    tipo: data.tipo,
    eventoId: data.eventoId,
    adicionadoPorId: data.adicionadoPorId,
    adicionadoPorNome: data.adicionadoPorNome,
    adicionadoPorEmail: data.adicionadoPorEmail,
    createdAt,
  };
  await ref.set(payload, { merge: true });
  return { id: ref.id, ...payload };
}

// ============================================================================
// REGISTROS DE AUDITORIA (LOGS POR AÇÃO)
// ============================================================================

export async function createEventoLog(data: {
  eventoId: string;
  acao: EventoLogAcao;
  descricao: string;
  changes?: EventoLogChange[];
  metadata?: {
    fileName?: string;
    tipoMidia?: MidiaTipo;
    fileSize?: number;
  };
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string;
  usuarioRole: Role;
}): Promise<EventoLogDoc> {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.EVENTO_LOGS).doc();
  const payload: Omit<EventoLogDoc, "id"> = {
    eventoId: data.eventoId,
    acao: data.acao,
    descricao: data.descricao,
    changes: data.changes,
    metadata: data.metadata,
    usuarioId: data.usuarioId,
    usuarioNome: data.usuarioNome,
    usuarioEmail: data.usuarioEmail,
    usuarioRole: data.usuarioRole,
    createdAt: nowIso(),
  };
  await ref.set(payload);
  invalidateSecretariasCache();
  return { id: ref.id, ...payload };
}

export async function listEventoLogs(eventoId: string): Promise<EventoLogDoc[]> {
  const db = getDb();
  const snap = await db
    .collection(COLLECTIONS.EVENTO_LOGS)
    .where("eventoId", "==", eventoId)
    .get();

  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<EventoLogDoc, "id">) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ============================================================================
// FOTOS DO SLIDE DA TELA DE LOGIN
// ============================================================================

export const DEFAULT_LOGIN_SLIDES: Omit<LoginSlideDoc, "id" | "createdAt">[] = [
  {
    titulo: "Farol de Belmonte",
    imageUrl: "/login-slides/farol-belmonte.jpg",
    ordem: 1,
  },
  {
    titulo: "Pôr do sol no Rio Jequitinhonha — Belmonte",
    imageUrl: "/login-slides/rio-jequitinhonha.jpg",
    ordem: 2,
  },
];

export async function listLoginSlides(): Promise<LoginSlideDoc[]> {
  const db = getDb();
  const col = db.collection(COLLECTIONS.LOGIN_SLIDES);
  const snap = await col.get();

  // Na primeira vez, inicializa com as 2 fotos oficiais anexadas no projeto
  if (snap.empty) {
    const ts = nowIso();
    const created: LoginSlideDoc[] = [];
    for (const def of DEFAULT_LOGIN_SLIDES) {
      const ref = col.doc();
      const payload: Omit<LoginSlideDoc, "id"> = {
        ...def,
        createdAt: ts,
      };
      await ref.set(payload);
      created.push({ id: ref.id, ...payload });
    }
    return created;
  }

  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<LoginSlideDoc, "id">) }))
    .sort((a, b) => a.ordem - b.ordem || a.createdAt.localeCompare(b.createdAt));
}

export async function createLoginSlideDoc(data: {
  titulo: string;
  imageUrl: string;
  criadoPorEmail?: string;
}): Promise<LoginSlideDoc> {
  const db = getDb();
  const existing = await listLoginSlides();
  const nextOrdem =
    existing.length > 0 ? Math.max(...existing.map((s) => s.ordem)) + 1 : 1;

  const ref = db.collection(COLLECTIONS.LOGIN_SLIDES).doc();
  const payload: Omit<LoginSlideDoc, "id"> = {
    titulo: data.titulo.trim() || "Belmonte — Bahia",
    imageUrl: data.imageUrl,
    ordem: nextOrdem,
    criadoPorEmail: data.criadoPorEmail,
    createdAt: nowIso(),
  };
  await ref.set(payload);
  invalidateSecretariasCache();
  return { id: ref.id, ...payload };
}

export async function deleteLoginSlideDoc(id: string): Promise<boolean> {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.LOGIN_SLIDES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}
