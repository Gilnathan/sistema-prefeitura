import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    // Apenas rotas administrativas (/admin/*) são exclusivas do perfil ADMIN.
    // /relatorios é acessível a ADMIN (todas) e SECRETARIA (somente a própria).
    if (pathname.startsWith("/admin") && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => Boolean(token),
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/eventos/:path*",
    "/admin/:path*",
    "/relatorios/:path*",
  ],
};
