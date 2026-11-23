"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import type { Role } from "@/lib/types";
import {
  CalendarPlus,
  FileBarChart2,
  Images,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  Landmark,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AppShellProps {
  user: {
    name: string;
    email: string;
    role: Role;
    secretariaNome: string | null;
  };
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await signOut({ redirect: false });
    window.location.assign("/login");
  }

  const navItems = [
    {
      href: "/dashboard",
      label: "Ações Realizadas",
      icon: LayoutDashboard,
      roles: ["ADMIN", "SECRETARIA"],
    },
    {
      href: "/eventos/novo",
      label: "Nova Ação",
      icon: CalendarPlus,
      roles: ["ADMIN", "SECRETARIA"],
    },
    {
      href: "/relatorios",
      label: "Relatórios Mensais",
      icon: FileBarChart2,
      roles: ["ADMIN", "SECRETARIA"],
    },
    {
      href: "/admin/secretarias",
      label: "Secretarias",
      icon: Landmark,
      roles: ["ADMIN"],
    },
    {
      href: "/admin/usuarios",
      label: "Usuários",
      icon: Users,
      roles: ["ADMIN"],
    },
    {
      href: "/admin/fotos-login",
      label: "Fotos do Login",
      icon: Images,
      roles: ["ADMIN"],
    },
  ].filter((item) => item.roles.includes(user.role));

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Sidebar Desktop — Azul Institucional Clean (referência site oficial Belmonte) */}
      <aside className="no-print hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-gradient-to-b from-[#0E3A5D] via-[#10446C] to-[#0B2E4A] text-white border-r border-white/10 shadow-lg">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/25 bg-[#084D12] shadow-sm">
            <img
              src="/logo-belmonte.jpg"
              alt="Prefeitura de Belmonte"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight truncate text-white">
              Prefeitura de Belmonte
            </p>
            <p className="text-[11px] text-sky-200/80 truncate mt-0.5">
              Ações Realizadas
            </p>
          </div>
        </div>
        {/* Filete sutil nas cores da bandeira/brasão (verde + dourado) */}
        <div className="h-[2px] w-full bg-gradient-to-r from-[#128C23] via-[#F4C419]/80 to-[#38BDF8]/60" />

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-white/15 text-white shadow-xs"
                    : "text-sky-100/80 hover:bg-white/10 hover:text-white"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#22C55E]" />
                )}
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-105",
                    active ? "text-[#4ADE80]" : "text-sky-200/80"
                  )}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3 bg-black/15">
          <div className="space-y-1">
            <p className="text-sm font-medium text-white truncate">{user.name}</p>
            <p className="text-xs text-sky-200/75 truncate">{user.email}</p>
            <div className="pt-1">
              <Badge
                variant="secondary"
                className={cn(
                  "text-[11px] border",
                  user.role === "ADMIN"
                    ? "bg-[#F4C419]/15 text-[#FCE072] border-[#F4C419]/40"
                    : "bg-[#128C23]/25 text-emerald-200 border-[#22C55E]/35"
                )}
              >
                {user.role === "ADMIN"
                  ? "Agência (ADMIN)"
                  : `Sec. ${user.secretariaNome || ""}`}
              </Badge>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start bg-transparent border-white/20 text-sky-50 hover:bg-white/10 hover:text-white"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sair do sistema
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="no-print md:hidden sticky top-0 z-40 flex items-center justify-between bg-[#0E3A5D] text-white px-4 py-2.5 border-b border-white/10 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 overflow-hidden rounded-lg border border-white/25">
            <img
              src="/logo-belmonte.jpg"
              alt="Prefeitura de Belmonte"
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">
              Prefeitura de Belmonte
            </p>
            <p className="text-[11px] text-sky-200/80">Ações Realizadas</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="no-print md:hidden bg-[#10446C] text-white px-3 pb-4 pt-2 border-b border-white/10 space-y-1 animate-fade-in">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/15 text-white"
                    : "text-sky-100/85 hover:bg-white/10"
                )}
              >
                <Icon className={cn("h-4 w-4", active && "text-[#4ADE80]")} />
                {item.label}
              </Link>
            );
          })}
          <div className="pt-2 mt-2 border-t border-white/10 flex items-center justify-between px-2">
            <div className="text-xs">
              <p className="font-medium text-white">{user.name}</p>
              <p className="text-sky-200/80">
                {user.role === "ADMIN" ? "ADMIN" : user.secretariaNome}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="bg-transparent border-white/25 text-white hover:bg-white/10"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:pl-64">
        <div className="mx-auto max-w-7xl px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
