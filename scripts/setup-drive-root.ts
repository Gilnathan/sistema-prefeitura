import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawVal = trimmed.slice(eq + 1).trim();
    const val = rawVal.replace(/^"(.*)"$/, "$1");
    if (!process.env[key]) process.env[key] = val;
  }
}

async function run() {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const refreshToken =
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN!;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(`OAuth2 falhou (${tokenRes.status}): ${JSON.stringify(tokenData)}`);
  }

  const accessToken: string = tokenData.access_token;
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const aboutRes = await fetch(
    "https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)",
    { headers: authHeaders }
  );
  const about = await aboutRes.json();
  console.log(
    "CONTA_GOOGLE:",
    about.user?.displayName,
    `<${about.user?.emailAddress}>`
  );

  const folderName = "Portal de Demandas - Prefeitura de Belmonte";
  const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and 'root' in parents and trashed = false`;
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=1`,
    { headers: authHeaders }
  );
  const list = await listRes.json();
  let folder = list.files?.[0];

  if (!folder) {
    const createRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",
      {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: folderName,
          mimeType: "application/vnd.google-apps.folder",
        }),
      }
    );
    folder = await createRes.json();
    console.log("PASTA_CRIADA:", folder.id, folder.webViewLink);
  } else {
    console.log("PASTA_EXISTENTE:", folder.id, folder.webViewLink);
  }

  if (folder?.id && fs.existsSync(envPath)) {
    const current = fs.readFileSync(envPath, "utf8");
    const updated = current.replace(
      /GOOGLE_DRIVE_ROOT_FOLDER_ID=".*?"/,
      `GOOGLE_DRIVE_ROOT_FOLDER_ID="${folder.id}"`
    );
    fs.writeFileSync(envPath, updated, "utf8");
    console.log("ENV_ATUALIZADO:", folder.id);
  }
}

run().catch((err) => {
  console.error("ERRO_DRIVE:", err?.message || err);
  process.exit(1);
});
