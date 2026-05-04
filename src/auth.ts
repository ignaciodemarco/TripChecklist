import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { SEED_USER_EMAILS, SEED_DEFAULTS } from "@/lib/seed-defaults";

export const TEST_USER_EMAIL = "test.user@example.com";
const isDev = process.env.NODE_ENV !== "production";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    ...(process.env.AUTH_MICROSOFT_ENTRA_ID_ID
      ? [
          MicrosoftEntraID({
            clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
            clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
            issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    // Dev-only: lets you sign in as a fixed test account with one click.
    // Disabled in production builds.
    ...(isDev
      ? [
          Credentials({
            id: "test-user",
            name: "Test User (dev only)",
            credentials: {},
            async authorize() {
              const user = await prisma.user.upsert({
                where: { email: TEST_USER_EMAIL },
                update: {},
                create: {
                  email: TEST_USER_EMAIL,
                  name: "Test User",
                  image: "https://api.dicebear.com/7.x/initials/svg?seed=Test+User",
                },
              });
              return { id: user.id, email: user.email!, name: user.name };
            },
          }),
        ]
      : []),
  ],
  // Credentials provider requires JWT sessions; database sessions don't support it.
  // JWT sessions still work fine with the Prisma adapter for OAuth users.
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = (user as any).id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token?.uid) {
        (session.user as any).id = token.uid as string;
        // hydrate unitSystem from DB so the UI knows the user's preference
        const u = await prisma.user.findUnique({
          where: { id: token.uid as string },
          select: { unitSystem: true },
        });
        (session.user as any).unitSystem = u?.unitSystem ?? "imperial";
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Seed defaults for whitelisted emails
      const email = (user.email || "").toLowerCase();
      if (SEED_USER_EMAILS.has(email)) {
        await prisma.user.update({
          where: { id: user.id },
          data: { defaults: JSON.stringify(SEED_DEFAULTS) },
        });
      }
    },
  },
});
