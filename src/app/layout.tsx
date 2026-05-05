import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import GlobalErrorReporter from "./GlobalErrorReporter";

export const metadata: Metadata = {
  title: "Trip Checklist",
  description: "Weather-aware smart packing list",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en">
      <body className="min-h-screen" suppressHydrationWarning>
        <GlobalErrorReporter />
        <div className="max-w-6xl mx-auto p-4 sm:p-8">
          <header className="flex items-center justify-between mb-6 no-print">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl">🧳</span>
              <span className="text-lg sm:text-xl font-bold">Trip Checklist</span>
            </Link>
            <nav className="flex items-center gap-3 text-sm">
              {session?.user ? (
                <>
                  <Link href="/trips" className="hover:text-sky-400">Trips</Link>
                  <Link href="/settings" className="hover:text-sky-400">Settings</Link>
                  <span className="hidden sm:inline text-slate-500">·</span>
                  <span className="hidden sm:inline text-slate-400">{session.user.email}</span>
                  <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
                    <button className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">Sign out</button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold">
                  Sign in
                </Link>
              )}
            </nav>
          </header>
          {children}
          <footer className="mt-10 text-center text-xs text-slate-600 no-print">
            Built from your <em>Ropa para Viajes</em> spreadsheet · Weather by{" "}
            <a className="underline hover:text-slate-400" href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>
          </footer>
        </div>
      </body>
    </html>
  );
}
