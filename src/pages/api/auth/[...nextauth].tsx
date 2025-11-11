import NextAuth, { AuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import type { OAuthConfig } from "next-auth/providers/oauth";

import { MicrosoftEntraProvider } from "../../../next-auth-providers/MicrosoftEntraProvider";
import { CustomPrismaAdapter } from "../../../server/CustomPrismaAdapter";
import { prisma } from "../../../server/prisma";

const isMicrosoftEntraProviderConfigured = Boolean(
  typeof process.env.MICROSOFT_ENTRA_CLIENT_ID === "string" &&
    typeof process.env.MICROSOFT_ENTRA_CLIENT_SECRET === "string" &&
    typeof process.env.MICROSOFT_ENTRA_ISSUER === "string",
);

const microsoftEntraProvider = MicrosoftEntraProvider({
  // Essentials > Application (client) ID
  clientId: process.env.MICROSOFT_ENTRA_CLIENT_ID!,
  // Certificates & secrets > Value
  clientSecret: process.env.MICROSOFT_ENTRA_CLIENT_SECRET!,
  // Endpoints > WS-Federation sign-on endpoint
  issuer: process.env.MICROSOFT_ENTRA_ISSUER!,
  allowDangerousEmailAccountLinking: true,
});
(
  microsoftEntraProvider as OAuthConfig<unknown>
).allowDangerousEmailAccountLinking = true;

const adapter = CustomPrismaAdapter(prisma);

export const nextAuthOptions: AuthOptions = {
  adapter: adapter as Adapter,
  debug: true,
  providers: [
    ...(isMicrosoftEntraProviderConfigured ? [microsoftEntraProvider] : []),
  ],
  callbacks: {
    session: (props) => {
      return {
        ...props.session,
        user: {
          id: props.user.id,
          ...props.session.user,
        },
      };
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      if (new URL(url).origin === baseUrl) {
        return url;
      }
      return `${baseUrl}/app/schedule`;
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== "microsoft-entra-id" || !profile) {
        return;
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          organizationId: true,
          currentOfficeId: true,
        },
      });

      const updates: {
        name?: string;
        image?: string | null;
        email?: string | null;
        currentOfficeId?: string | null;
      } = {};

      const profileEmail =
        typeof profile.email === "string"
          ? profile.email.trim().toLowerCase()
          : null;
      const userEmail =
        typeof user.email === "string" ? user.email.toLowerCase() : null;
      const effectiveEmail = profileEmail ?? userEmail ?? null;

      if (typeof profile.name === "string") {
        const trimmedName = profile.name.trim();
        if (trimmedName.length > 0 && trimmedName !== user.name) {
          updates.name = trimmedName;
        }
      }

      if (typeof profile.image === "string" && profile.image.length > 0) {
        updates.image = profile.image;
      }

      if (profileEmail && profileEmail !== user.email) {
        updates.email = profileEmail;
      }

      const shouldAssignPosidoniaOffice =
        effectiveEmail !== null &&
        ["posidonia.com.br", "posidoniashipping.com"].some((domain) =>
          effectiveEmail.endsWith(`@${domain}`),
        );

      if (shouldAssignPosidoniaOffice && dbUser?.organizationId) {
        const posidoniaOffice = await prisma.office.findFirst({
          where: {
            organizationId: dbUser.organizationId,
            OR: [
              {
                name: {
                  equals: "Posidonia",
                  mode: "insensitive",
                },
              },
              {
                name: {
                  equals: "Office Posidonia",
                  mode: "insensitive",
                },
              },
            ],
          },
        });
        if (posidoniaOffice && dbUser.currentOfficeId !== posidoniaOffice.id) {
          updates.currentOfficeId = posidoniaOffice.id;
        }
      }

      if (Object.keys(updates).length === 0) {
        return;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: updates,
      });
    },
  },
  pages: {
    signIn: "/signin",
  },
};
export default NextAuth({
  ...nextAuthOptions,
  allowDangerousEmailAccountLinking: true,
} as AuthOptions);
