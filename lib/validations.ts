import { z } from "zod";

export const createSecretariaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da secretaria").max(120),
  sigla: z.string().trim().max(20).optional().nullable(),
  descricao: z.string().trim().max(500).optional().nullable(),
  criarUsuarioInicial: z.boolean().optional(),
  usuarioInicial: z
    .object({
      name: z.string().trim().min(2, "Informe o nome do usuário").max(120),
      email: z.string().trim().email("E-mail do usuário inválido").toLowerCase(),
      username: z
        .string()
        .trim()
        .min(3, "Usuário deve ter ao menos 3 caracteres")
        .max(40)
        .regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, _ ou -")
        .toLowerCase()
        .optional()
        .or(z.literal("")),
      password: z
        .string()
        .min(6, "A senha deve ter no mínimo 6 caracteres")
        .max(100),
    })
    .optional(),
});

export const updateSecretariaSchema = z.object({
  nome: z.string().trim().min(2).max(120).optional(),
  sigla: z.string().trim().max(20).optional().nullable(),
  descricao: z.string().trim().max(500).optional().nullable(),
  ativa: z.boolean().optional(),
});

export const createUsuarioSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome completo").max(120),
    email: z.string().trim().email("E-mail inválido").toLowerCase(),
    username: z
      .string()
      .trim()
      .min(3, "Usuário deve ter ao menos 3 caracteres")
      .max(40)
      .regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, _ ou -")
      .toLowerCase()
      .optional()
      .or(z.literal("")),
    password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres").max(100),
    role: z.enum(["ADMIN", "SECRETARIA"]),
    secretariaId: z.string().optional().nullable(),
  })
  .refine(
    (data) => data.role === "ADMIN" || Boolean(data.secretariaId),
    {
      message: "Usuários do tipo SECRETARIA devem estar vinculados a uma secretaria",
      path: ["secretariaId"],
    }
  );

export const updateUsuarioSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().toLowerCase().optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .toLowerCase()
    .optional()
    .nullable()
    .or(z.literal("")),
  password: z.string().min(6).max(100).optional().or(z.literal("")),
  role: z.enum(["ADMIN", "SECRETARIA"]).optional(),
  secretariaId: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
});

export const createEventoSchema = z
  .object({
    titulo: z.string().trim().min(3, "Informe o título da ação").max(200),
    tipo: z.enum(["REALIZADA", "FUTURA"]).optional().default("REALIZADA"),
    dataRealizacao: z.string().min(8, "Informe a data de realização"),
    local: z.string().trim().min(2, "Informe o local da ação").max(200),
    resumo: z
      .string()
      .trim()
      .min(10, "Informe um resumo objetivo (mín. 10 caracteres)")
      .max(4000),
    relatorioCompleto: z.string().trim().max(30000).optional().default(""),
    secretariaId: z.string().optional(),
    secretariasParceirasIds: z.array(z.string().min(1)).max(30).optional().default([]),
    orgaosParceirosExternos: z
      .array(z.string().trim().min(2).max(120))
      .max(30)
      .optional()
      .default([]),
  })
  .refine(
    (data) =>
      data.tipo === "FUTURA" || data.relatorioCompleto.trim().length >= 10,
    {
      message: "Preencha o relatório completo da ação (mín. 10 caracteres)",
      path: ["relatorioCompleto"],
    }
  );

export const updateEventoSchema = z.object({
  titulo: z.string().trim().min(3).max(200).optional(),
  tipo: z.enum(["REALIZADA", "FUTURA"]).optional(),
  dataRealizacao: z.string().min(8).optional(),
  local: z.string().trim().min(2).max(200).optional(),
  resumo: z.string().trim().min(10).max(4000).optional(),
  relatorioCompleto: z.string().trim().max(30000).optional(),
  status: z.enum(["EM_PRODUCAO", "PUBLICADO", "CANCELADA"]).optional(),
  cancelada: z.boolean().optional(),
  secretariasParceirasIds: z.array(z.string().min(1)).max(30).optional(),
  orgaosParceirosExternos: z.array(z.string().trim().min(2).max(120)).max(30).optional(),
});

export const uploadSessionSchema = z.object({
  eventoId: z.string().min(1),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150),
  fileSize: z.number().int().positive(),
});

export const finalizeUploadSchema = z.object({
  eventoId: z.string().min(1),
  driveFileId: z.string().trim().min(5),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150),
  fileSize: z.number().int().nonnegative(),
});
