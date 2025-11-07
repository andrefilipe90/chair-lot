import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
} from "@auth/core/adapters";
import type { PrismaClient } from "@prisma/client";

type AccountWithLegacy = AdapterAccount & {
  ext_expires_in?: number | null;
};

const sanitizeAccountData = (account: AccountWithLegacy): AdapterAccount => {
  const sanitized: AdapterAccount = {
    provider: account.provider,
    type: account.type,
    providerAccountId: account.providerAccountId,
    userId: account.userId,
    refresh_token: account.refresh_token ?? undefined,
    access_token: account.access_token ?? undefined,
    expires_at: account.expires_at ?? undefined,
    token_type: account.token_type ?? undefined,
    scope: account.scope ?? undefined,
    id_token: account.id_token ?? undefined,
    session_state: account.session_state ?? undefined,
    extExpiresIn:
      (account as AdapterAccount).extExpiresIn ??
      account.ext_expires_in ??
      null,
  };

  delete (sanitized as Record<string, unknown>).ext_expires_in;

  return sanitized;
};

const normalizeEmail = (email?: string | null) => {
  if (typeof email !== "string") return email ?? null;
  return email.trim().toLowerCase();
};

/** @see https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/null-and-undefined */
function stripUndefined<T>(obj: T) {
  const data = {} as T;
  for (const key in obj) if (obj[key] !== undefined) data[key] = obj[key];
  return { data };
}

export const CustomPrismaAdapter = (
  prisma: PrismaClient | ReturnType<PrismaClient["$extends"]>,
): Adapter => {
  const p = prisma as PrismaClient & { authenticator: any };
  return {
    createUser: ({ id: _id, email, ...data }) => {
      void _id;
      const normalizedEmail = normalizeEmail(email);
      return p.user.create(
        stripUndefined({
          ...data,
          email: normalizedEmail ?? undefined,
        }),
      ) as unknown as Promise<AdapterUser>;
    },
    getUser: (id) =>
      p.user.findUnique({
        where: { id },
      }) as unknown as Promise<AdapterUser | null>,
    getUserByEmail: async (email) => {
      const normalizedEmail = normalizeEmail(email);
      if (typeof normalizedEmail !== "string") return null;
      return p.user.findUnique({
        where: { email: normalizedEmail },
      }) as unknown as Promise<AdapterUser | null>;
    },
    async getUserByAccount(provider_providerAccountId) {
      const account = await p.account.findUnique({
        where: { provider_providerAccountId },
        include: { user: true },
      });
      return (account?.user as AdapterUser) ?? null;
    },
    updateUser: ({ id, email, ...data }) => {
      const normalizedEmail = normalizeEmail(email);
      return p.user.update({
        where: { id },
        ...stripUndefined({
          ...data,
          email: normalizedEmail ?? undefined,
        }),
      }) as Promise<AdapterUser>;
    },
    deleteUser: (id) =>
      p.user.delete({ where: { id } }) as Promise<AdapterUser>,
    linkAccount: (data) =>
      p.account.create({
        data: sanitizeAccountData(data as AccountWithLegacy),
      }) as unknown as AdapterAccount,
    unlinkAccount: (provider_providerAccountId) =>
      p.account.delete({
        where: { provider_providerAccountId },
      }) as unknown as AdapterAccount,
    async getSessionAndUser(sessionToken) {
      const userAndSession = await p.session.findUnique({
        where: { sessionToken },
        include: { user: true },
      });
      if (!userAndSession) return null;
      const { user, ...session } = userAndSession;
      return {
        user,
        session,
      } as {
        user: AdapterUser;
        session: AdapterSession;
      };
    },
    createSession: (data) => p.session.create(stripUndefined(data)),
    updateSession: (data) =>
      p.session.update({
        where: { sessionToken: data.sessionToken },
        ...stripUndefined(data),
      }),
    deleteSession: (sessionToken) =>
      p.session.delete({ where: { sessionToken } }),
    async createVerificationToken(data) {
      const verificationToken = await p.verificationToken.create(
        stripUndefined(data),
      );
      if ("id" in verificationToken && verificationToken.id)
        delete verificationToken.id;
      return verificationToken;
    },
    async useVerificationToken(identifier_token) {
      try {
        const verificationToken = await p.verificationToken.delete({
          where: { identifier_token },
        });
        if ("id" in verificationToken && verificationToken.id)
          delete verificationToken.id;
        return verificationToken;
      } catch (error: unknown) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2025"
        )
          return null;
        throw error;
      }
    },
    async getAccount(providerAccountId, provider) {
      return p.account.findFirst({
        where: { providerAccountId, provider },
      }) as Promise<AdapterAccount | null>;
    },
    async createAuthenticator(data) {
      return p.authenticator.create(stripUndefined(data));
    },
    async getAuthenticator(credentialID) {
      return p.authenticator.findUnique({
        where: { credentialID },
      });
    },
    async listAuthenticatorsByUserId(userId) {
      return p.authenticator.findMany({
        where: { userId },
      });
    },
    async updateAuthenticatorCounter(credentialID, counter) {
      return p.authenticator.update({
        where: { credentialID },
        data: { counter },
      });
    },
  };
};
