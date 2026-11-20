export type Role = "ADMIN" | "SECRETARIA";

export type EventoStatus = "NOVO" | "EM_PRODUCAO" | "PUBLICADO";

export type MidiaTipo = "FOTO" | "VIDEO" | "OUTRO";

export type EventoLogAcao =
  | "CRIACAO"
  | "EDICAO"
  | "STATUS_ALTERADO"
  | "MIDIA_ADICIONADA";

export interface EventoLogChange {
  campo: string;
  antes?: string;
  depois?: string;
}

export interface EventoLogDoc {
  id: string;
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
  createdAt: string;
}

export interface SecretariaDoc {
  id: string;
  nome: string;
  nomeLower: string;
  sigla: string | null;
  descricao: string | null;
  ativa: boolean;
  driveFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserDoc {
  id: string;
  name: string;
  email: string;
  username: string | null;
  passwordHash: string;
  role: Role;
  ativo: boolean;
  secretariaId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventoDoc {
  id: string;
  titulo: string;
  dataRealizacao: string; // ISO string (UTC noon)
  local: string;
  resumo: string;
  relatorioCompleto: string;
  status: EventoStatus;
  driveFolderId: string | null;
  secretariaId: string;
  secretariasParceirasIds?: string[];
  orgaosParceirosExternos?: string[];
  criadoPorId: string;
  criadoPorNome?: string;
  criadoPorEmail?: string;
  editadoPorId?: string | null;
  editadoPorNome?: string | null;
  editadoPorEmail?: string | null;
  editadoEm?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MidiaDoc {
  id: string;
  driveFileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  tipo: MidiaTipo;
  eventoId: string;
  adicionadoPorId?: string;
  adicionadoPorNome?: string;
  adicionadoPorEmail?: string;
  createdAt: string;
}

export interface LoginSlideDoc {
  id: string;
  titulo: string;
  imageUrl: string; // URL estática (/login-slides/...) ou Data URL JPEG otimizada
  ordem: number;
  criadoPorEmail?: string;
  createdAt: string;
}
