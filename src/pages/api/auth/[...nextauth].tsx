import NextAuth, { AuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import type { OAuthConfig } from "next-auth/providers/oauth";

import { MicrosoftEntraProvider } from "../../../next-auth-providers/MicrosoftEntraProvider";
import { CustomPrismaAdapter } from "../../../server/CustomPrismaAdapter";
import { prisma } from "../../../server/prisma";

const isGoogleAuthProviderConfigured = Boolean(
  typeof process.env.GOOGLE_CLIENT_ID === "string" &&
    typeof process.env.GOOGLE_CLIENT_SECRET === "string",
);

const googleProvider = GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  allowDangerousEmailAccountLinking: true,
});
(googleProvider as OAuthConfig<unknown>).allowDangerousEmailAccountLinking =
  true;

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
    ...(isGoogleAuthProviderConfigured ? [googleProvider] : []),
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
  },
  events: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== "microsoft-entra-id" || !profile) {
        return;
      }

      const updates: {
        name?: string;
        image?: string | null;
        email?: string | null;
      } = {};

      if (typeof profile.name === "string") {
        const trimmedName = profile.name.trim();
        if (trimmedName.length > 0 && trimmedName !== user.name) {
          updates.name = trimmedName;
        }
      }

      if (typeof profile.image === "string" && profile.image.length > 0) {
        updates.image = profile.image;
      }

      if (
        typeof profile.email === "string" &&
        profile.email.trim().length > 0 &&
        profile.email !== user.email
      ) {
        updates.email = profile.email.trim().toLowerCase();
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
};
export default NextAuth({
  ...nextAuthOptions,
  allowDangerousEmailAccountLinking: true,
} as AuthOptions);
