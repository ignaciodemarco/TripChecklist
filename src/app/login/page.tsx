import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/trips");
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <section className="glass rounded-2xl p-8 ring-1 ring-white/5 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-1">Sign in</h1>
      <p className="text-slate-400 text-sm mb-6">Use your Google or Microsoft account.</p>
      <div className="space-y-3">
        <form action={async () => { "use server"; await signIn("google", { redirectTo: "/trips" }); }}>
          <button className="w-full py-3 rounded-xl bg-white text-slate-900 font-semibold hover:bg-slate-100 flex items-center justify-center gap-3">
            <span className="text-xl">G</span> Continue with Google
          </button>
        </form>
        <form action={async () => { "use server"; await signIn("microsoft-entra-id", { redirectTo: "/trips" }); }}>
          <button className="w-full py-3 rounded-xl bg-[#2f2f2f] text-white font-semibold hover:bg-[#1f1f1f] flex items-center justify-center gap-3">
            <span className="text-xl">▦</span> Continue with Microsoft
          </button>
        </form>

        {isDev && (
          <>
            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 h-px bg-slate-700" />
              <span className="text-xs text-slate-500 uppercase tracking-wider">dev only</span>
              <div className="flex-1 h-px bg-slate-700" />
            </div>
            <form action={async () => { "use server"; await signIn("test-user", { redirectTo: "/trips" }); }}>
              <button className="w-full py-3 rounded-xl bg-amber-500/20 ring-1 ring-amber-500/40 text-amber-200 font-semibold hover:bg-amber-500/30 flex items-center justify-center gap-3">
                🧪 Sign in as Test User
              </button>
            </form>
            <p className="text-[11px] text-slate-500 text-center">
              Brand-new account, empty defaults — to test the new-user experience.
            </p>
          </>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-6">
        No password needed. We only store your name, email, and packing data.
      </p>
    </section>
  );
}
