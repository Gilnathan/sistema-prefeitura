import {
  formatarDataISO,
  formatarNomeMesPasta,
  sanitizarNomePasta,
} from "@/lib/utils";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente obrigatória ausente para o Google Drive: ${name}`
    );
  }
  return value;
}

function getRefreshToken(): string | undefined {
  return process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
}

export function isGoogleDriveConfigured(): boolean {
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      getRefreshToken() &&
      rootId &&
      rootId !== "COLE_AQUI_O_ID_DA_PASTA_DO_DRIVE"
  );
}

/**
 * Obtém um access_token OAuth2 usando `fetch` nativo (evita bug de Premature close do gaxios no Node 24)
 * e faz cache em memória até 60s antes da expiração.
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const clientId = getRequiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getRequiredEnv("GOOGLE_CLIENT_SECRET");
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error(
      "Variável de ambiente obrigatória ausente para o Google Drive: GOOGLE_DRIVE_REFRESH_TOKEN (ou GOOGLE_REFRESH_TOKEN)"
    );
  }

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    cachedToken = null;
    const detalhe = data.error_description || data.error || `HTTP ${response.status}`;
    throw new Error(
      `Falha na autenticação OAuth2 do Google Drive (${detalhe}). Verifique GOOGLE_DRIVE_REFRESH_TOKEN no .env.`
    );
  }

  const ttlMs = Math.max(60, (data.expires_in ?? 3600) - 60) * 1000;
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + ttlMs,
  };

  return data.access_token;
}

async function driveRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${DRIVE_API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Erro na API do Google Drive (${res.status}): ${text}`);
  }

  return text ? (JSON.parse(text) as T) : (undefined as T);
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Busca uma subpasta pelo nome exato dentro de `parentId`.
 * Se não existir, cria e retorna o novo `id`.
 */
export async function findOrCreateFolder(
  name: string,
  parentId: string
): Promise<string> {
  const safeName = sanitizarNomePasta(name);
  const escaped = escapeDriveQueryValue(safeName);

  const query = [
    `mimeType = '${FOLDER_MIME_TYPE}'`,
    `name = '${escaped}'`,
    `'${parentId}' in parents`,
    "trashed = false",
  ].join(" and ");

  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name)",
    spaces: "drive",
    pageSize: "1",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });

  const listRes = await driveRequest<{ files?: { id?: string; name?: string }[] }>(
    `/files?${params.toString()}`
  );

  const existing = listRes.files?.[0];
  if (existing?.id) {
    return existing.id;
  }

  const createRes = await driveRequest<{ id?: string }>(
    "/files?fields=id&supportsAllDrives=true",
    {
      method: "POST",
      body: JSON.stringify({
        name: safeName,
        mimeType: FOLDER_MIME_TYPE,
        parents: [parentId],
      }),
    }
  );

  if (!createRes.id) {
    throw new Error(
      `Não foi possível criar a pasta "${safeName}" no Google Drive.`
    );
  }

  return createRes.id;
}

/**
 * Garante a existência da pasta de uma Secretaria dentro de GOOGLE_DRIVE_ROOT_FOLDER_ID.
 */
export async function ensureSecretariaFolder(
  secretariaNome: string,
  existingFolderId?: string | null
): Promise<string> {
  const rootFolderId = getRequiredEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID");

  if (existingFolderId) {
    try {
      const check = await driveRequest<{ id?: string; trashed?: boolean }>(
        `/files/${encodeURIComponent(existingFolderId)}?fields=id,trashed&supportsAllDrives=true`
      );
      if (check.id && !check.trashed) {
        return check.id;
      }
    } catch {
      // Se foi removida manualmente no Drive, recria abaixo
    }
  }

  return findOrCreateFolder(secretariaNome, rootFolderId);
}

/**
 * Cria a hierarquia completa para um Evento dentro da pasta da Secretaria:
 *   <Secretaria> / <Ano (ex: 2026)> / <MM - Mês (ex: 11 - Novembro)> / <YYYY-MM-DD - Título do Evento>
 */
export async function ensureEventoFolderHierarchy(params: {
  secretariaFolderId: string;
  dataRealizacao: Date;
  titulo: string;
}): Promise<string> {
  const { secretariaFolderId, dataRealizacao, titulo } = params;

  const anoNome = String(dataRealizacao.getUTCFullYear());
  const mesNome = formatarNomeMesPasta(dataRealizacao);
  const dataPrefixo = formatarDataISO(dataRealizacao);
  const eventoPastaNome = sanitizarNomePasta(`${dataPrefixo} - ${titulo}`);

  const anoFolderId = await findOrCreateFolder(anoNome, secretariaFolderId);
  const mesFolderId = await findOrCreateFolder(mesNome, anoFolderId);
  const eventoFolderId = await findOrCreateFolder(eventoPastaNome, mesFolderId);

  return eventoFolderId;
}

/**
 * Inicia uma sessão de Resumable Upload no Google Drive API v3.
 * Retorna a `uploadUrl` (header Location) para o navegador enviar o arquivo
 * diretamente ao Google Drive com progresso em tempo real e sem passar o binário pelo servidor Next.js.
 */
export async function createResumableUploadSession(params: {
  fileName: string;
  mimeType: string;
  fileSize: number;
  parentFolderId: string;
  origin?: string | null;
}): Promise<{ uploadUrl: string }> {
  const { fileName, mimeType, fileSize, parentFolderId, origin } = params;
  const accessToken = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": mimeType || "application/octet-stream",
    "X-Upload-Content-Length": String(fileSize),
  };

  // Essencial para permitir PUT direto do browser (CORS) na URL de Resumable Upload
  if (origin) {
    headers["Origin"] = origin;
  }

  const response = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: fileName,
        mimeType: mimeType || "application/octet-stream",
        parents: [parentFolderId],
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Falha ao iniciar sessão de Resumable Upload no Google Drive (${response.status}): ${errorText}`
    );
  }

  const uploadUrl = response.headers.get("location");
  if (!uploadUrl) {
    throw new Error(
      "Google Drive não retornou o header Location para a sessão de Resumable Upload."
    );
  }

  return { uploadUrl };
}

/**
 * Aplica permissão pública somente leitura (`anyone` + `reader`) em um arquivo do Drive
 * para permitir renderização de thumbnails e player embutido no portal.
 */
export async function setFilePublicReader(driveFileId: string): Promise<void> {
  await driveRequest(
    `/files/${encodeURIComponent(driveFileId)}/permissions?supportsAllDrives=true`,
    {
      method: "POST",
      body: JSON.stringify({
        role: "reader",
        type: "anyone",
      }),
    }
  );
}

/**
 * Remove um arquivo do Google Drive (ignora 404 caso já tenha sido apagado).
 */
export async function deleteDriveFile(driveFileId: string): Promise<void> {
  try {
    await driveRequest(
      `/files/${encodeURIComponent(driveFileId)}?supportsAllDrives=true`,
      { method: "DELETE" }
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("(404)")) {
      return;
    }
    throw error;
  }
}
