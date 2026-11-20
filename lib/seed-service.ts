import bcrypt from "bcryptjs";
import {
  createSecretariaDoc,
  createUserDoc,
  findSecretariaByNome,
  findUserByIdentifier,
  updateSecretariaDoc,
} from "@/lib/firestore-repo";

export const SECRETARIAS_SEED = [
  {
    nome: "Saúde",
    sigla: "SMS",
    descricao: "Secretaria Municipal de Saúde",
    email: "saude@belmonte.ba.gov.br",
    username: "saude",
    password: "Saude@2026",
  },
  {
    nome: "Educação",
    sigla: "SME",
    descricao: "Secretaria Municipal de Educação",
    email: "educacao@belmonte.ba.gov.br",
    username: "educacao",
    password: "Educacao@2026",
  },
  {
    nome: "Desporto",
    sigla: "SMD",
    descricao: "Secretaria Municipal de Desporto",
    email: "desporto@belmonte.ba.gov.br",
    username: "desporto",
    password: "Desporto@2026",
  },
  {
    nome: "Lazer",
    sigla: "SML",
    descricao: "Secretaria Municipal de Lazer",
    email: "lazer@belmonte.ba.gov.br",
    username: "lazer",
    password: "Lazer@2026",
  },
  {
    nome: "Administrativo",
    sigla: "SMA",
    descricao: "Secretaria Municipal de Administração",
    email: "administrativo@belmonte.ba.gov.br",
    username: "administrativo",
    password: "AdminSec@2026",
  },
  {
    nome: "Assistência Social",
    sigla: "SMAS",
    descricao: "Secretaria Municipal de Assistência Social",
    email: "assistencia@belmonte.ba.gov.br",
    username: "assistencia",
    password: "Social@2026",
  },
  {
    nome: "Infraestrutura e Obras",
    sigla: "SEINFRA",
    descricao: "Secretaria Municipal de Infraestrutura e Obras",
    email: "obras@belmonte.ba.gov.br",
    username: "obras",
    password: "Obras@2026",
  },
  {
    nome: "Agricultura e Meio Ambiente",
    sigla: "SEAMA",
    descricao: "Secretaria Municipal de Agricultura e Meio Ambiente",
    email: "agricultura@belmonte.ba.gov.br",
    username: "agricultura",
    password: "Agro@2026",
  },
  {
    nome: "Cultura e Turismo",
    sigla: "SECTUR",
    descricao: "Secretaria Municipal de Cultura e Turismo",
    email: "cultura@belmonte.ba.gov.br",
    username: "cultura",
    password: "Cultura@2026",
  },
  {
    nome: "Finanças",
    sigla: "SEFAZ",
    descricao: "Secretaria Municipal de Finanças",
    email: "financas@belmonte.ba.gov.br",
    username: "financas",
    password: "Financas@2026",
  },
] as const;

export async function runFirestoreSeed() {
  const adminName = process.env.SEED_ADMIN_NAME || "Agência de Marketing - Admin";
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL || "admin@belmonte.ba.gov.br"
  ).toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@2026";

  let adminCreated = false;
  const existingAdmin = await findUserByIdentifier(adminEmail);
  if (!existingAdmin) {
    const adminHash = await bcrypt.hash(adminPassword, 10);
    await createUserDoc({
      name: adminName,
      email: adminEmail,
      username: "admin",
      passwordHash: adminHash,
      role: "ADMIN",
      ativo: true,
    });
    adminCreated = true;
  }

  const secretariasResumo: {
    nome: string;
    sigla: string;
    email: string;
    criada: boolean;
    usuarioCriado: boolean;
  }[] = [];

  for (const sec of SECRETARIAS_SEED) {
    let secDoc = await findSecretariaByNome(sec.nome);
    let criada = false;

    if (!secDoc) {
      secDoc = await createSecretariaDoc({
        nome: sec.nome,
        sigla: sec.sigla,
        descricao: sec.descricao,
        ativa: true,
      });
      criada = true;
    } else {
      await updateSecretariaDoc(secDoc.id, {
        sigla: sec.sigla,
        descricao: sec.descricao,
      });
    }

    let usuarioCriado = false;
    const existingUser = await findUserByIdentifier(sec.email);
    if (!existingUser) {
      const hash = await bcrypt.hash(sec.password, 10);
      await createUserDoc({
        name: `Equipe Secretaria de ${sec.nome}`,
        email: sec.email,
        username: sec.username,
        passwordHash: hash,
        role: "SECRETARIA",
        secretariaId: secDoc.id,
        ativo: true,
      });
      usuarioCriado = true;
    }

    secretariasResumo.push({
      nome: sec.nome,
      sigla: sec.sigla,
      email: sec.email,
      criada,
      usuarioCriado,
    });
  }

  return {
    admin: { email: adminEmail, criado: adminCreated },
    totalSecretarias: secretariasResumo.length,
    secretarias: secretariasResumo,
  };
}
