import { User } from "@prisma/client";
import { GetServerSidePropsContext, Redirect } from "next";
import { Session, getServerSession } from "next-auth";

import { nextAuthOptions } from "../../pages/api/auth/[...nextauth]";
import { prisma } from "../prisma";
import { getUserFromSession } from "../queries/getUserFromSession";

const POSIDONIA_DOMAINS = ["posidonia.com.br", "posidoniashipping.com"];

const assignPosidoniaAccess = async (user: User): Promise<User> => {
  const email =
    typeof user.email === "string" ? user.email.toLowerCase() : null;

  if (!email) {
    return user;
  }

  const shouldAssign = POSIDONIA_DOMAINS.some((domain) =>
    email.endsWith(`@${domain}`),
  );

  if (!shouldAssign) {
    return user;
  }

  const posidoniaOffice = await prisma.office.findFirst({
    where: {
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
    select: {
      id: true,
      organizationId: true,
    },
  });

  if (!posidoniaOffice?.organizationId) {
    return user;
  }

  const needsOrgUpdate = user.organizationId !== posidoniaOffice.organizationId;
  const needsOfficeUpdate =
    needsOrgUpdate || user.currentOfficeId !== posidoniaOffice.id;
  if (!needsOrgUpdate && !needsOfficeUpdate) {
    return user;
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      organizationId: posidoniaOffice.organizationId,
      currentOfficeId: posidoniaOffice.id,
    },
  });

  return updatedUser;
};

type AppAuthRedirectProps = {
  context: GetServerSidePropsContext;
  shouldRedirectToSetup?: boolean;
};

type AppAuthRedirectReturnType = {
  redirect?: Redirect;
  session?: Session;
};

export const appAuthRedirect = async (
  props: AppAuthRedirectProps,
): Promise<AppAuthRedirectReturnType> => {
  const { context, shouldRedirectToSetup = true } = props;
  const session = await getServerSession(
    context.req,
    context.res,
    nextAuthOptions,
  );
  if (!session) {
    return {
      redirect: {
        destination: "/api/auth/signin",
        permanent: false,
      },
    };
  }
  let user: User;
  try {
    const fetchedUser = await getUserFromSession(session, {});
    user = await assignPosidoniaAccess(fetchedUser);
  } catch (error) {
    return {
      redirect: {
        destination: "/api/auth/signin",
        permanent: false,
      },
    };
  }

  if (shouldRedirectToSetup && !user.organizationId) {
    return {
      redirect: {
        destination: "/app/setup",
        permanent: false,
      },
    };
  }
  return {
    session,
  };
};
