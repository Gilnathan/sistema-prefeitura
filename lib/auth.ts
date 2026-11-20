import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import {
  findUserByIdentifier,
  getSecretariaById,
} from "@/lib/firestore-repo";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // 12 horas
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credenciais",
      credentials: {
        identifier: { label: "E-mail ou Usuário", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const identifier = credentials?.identifier?.trim().toLowerCase();
        const password = credentials?.password;

        if (!identifier || !password) {
          return null;
        }

        const user = await findUserByIdentifier(identifier);
        if (!user || !user.ativo) {
          return null;
        }

        let secretariaNome: string | null = null;

        // Se for usuário de secretaria, exige secretaria vinculada e ativa
        if (user.role === "SECRETARIA") {
          if (!user.secretariaId) return null;
          const sec = await getSecretariaById(user.secretariaId);
          if (!sec || !sec.ativa) return null;
          secretariaNome = sec.nome;
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          secretariaId: user.secretariaId,
          secretariaNome,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.secretariaId = user.secretariaId;
        token.secretariaNome = user.secretariaNome;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.secretariaId = token.secretariaId;
        session.user.secretariaNome = token.secretariaNome;
      }
      return session;
    },
  },
};

export function getAuthSession() {
  return getServerSession(authOptions);
}
