import { Provider } from "next-auth/providers/index";

type MicrosoftEntraConfig = {
  clientId: string;
  clientSecret: string;
  issuer: string;
  allowDangerousEmailAccountLinking?: boolean;
};

export const MicrosoftEntraProvider = (
  config: MicrosoftEntraConfig,
): Provider => {
  const { allowDangerousEmailAccountLinking, ...providerOptions } = config;

  const providedIssuer =
    providerOptions.issuer ?? "https://login.microsoftonline.com/common";
  const issuerBase = providedIssuer.replace(/\/$/, "");
  const oauthBase = `${issuerBase}/oauth2/v2.0`;
  const issuerWithVersion = `${issuerBase}/v2.0`;

  return {
    id: "microsoft-entra-id",
    name: "Microsoft Entra ID",
    type: "oauth", // "oidc",
    idToken: true,
    client: { token_endpoint_auth_method: "client_secret_post" },
    issuer: issuerWithVersion,
    authorization: {
      url: `${oauthBase}/authorize`,
      params: { scope: "openid profile email User.Read" },
    },
    wellKnown: `${issuerWithVersion}/.well-known/openid-configuration`,
    checks: ["state"],
    token: {
      url: `${oauthBase}/token`,
    },
    async profile(profile: any, tokens: any) {
      let image: string | null = null;
      if (tokens?.access_token) {
        try {
          // https://learn.microsoft.com/en-us/graph/api/profilephoto-get?view=graph-rest-1.0&tabs=http#examples
          const response = await fetch(
            `https://graph.microsoft.com/v1.0/me/photos/${648}x${648}/$value`,
            { headers: { Authorization: `Bearer ${tokens.access_token}` } },
          );
          if (response.ok && typeof Buffer !== "undefined") {
            const pictureBuffer = await response.arrayBuffer();
            const pictureBase64 = Buffer.from(pictureBuffer).toString("base64");
            image = `data:image/jpeg;base64, ${pictureBase64}`;
          }
        } catch {
          // Ignore photo errors; fall back to existing avatar logic.
        }
      }

      const rawFirstName =
        profile.given_name ??
        profile.givenName ??
        profile.first_name ??
        profile.firstname ??
        null;
      const rawLastName =
        profile.family_name ??
        profile.familyName ??
        profile.surname ??
        profile.last_name ??
        profile.lastname ??
        null;

      const firstName =
        typeof rawFirstName === "string" ? rawFirstName.trim() : "";
      const lastName =
        typeof rawLastName === "string" ? rawLastName.trim() : "";
      const hasFirst = firstName.length > 0;
      const hasLast = lastName.length > 0;
      const preferredName =
        [hasFirst ? firstName : null, hasLast ? lastName : null]
          .filter(Boolean)
          .join(" ")
          .trim() || (typeof profile.name === "string" ? profile.name : "");

      const rawEmail =
        profile.email ?? profile.preferred_username ?? profile.upn ?? null;
      const fallbackEmail =
        typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : null;

      const realProfile = {
        id: profile.sub,
        name: preferredName,
        email: fallbackEmail,
        image,
      };

      return realProfile;
    },
    style: {
      text: "#fff",
      bg: "#0072c6",
      logo: "https://learn.microsoft.com/en-us/entra/fundamentals/media/new-name/microsoft-entra-id-icon.png",
    },
    allowDangerousEmailAccountLinking,
    options: providerOptions,
  };
};
