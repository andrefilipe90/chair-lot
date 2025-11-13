import { SessionProvider } from "next-auth/react";
import { IntlErrorCode, NextIntlClientProvider } from "next-intl";
import type { AppProps, AppType } from "next/app";
import posthog from "posthog-js";
import { useEffect } from "react";
import "react-day-picker/dist/style.css";

import { SidebarBrandWithHeader } from "../chakra-starter/application-ui/sidebar-with-header";
import { BaseLayout } from "../components/BaseLayout";
import { Provider } from "../components/ui/provider";
import { Toaster } from "../components/ui/toaster";
import { trpc } from "../utils/trpc";

type LandingPageWrapperProps = {
  children: React.ReactNode;
};
const LandingPageWrapper = (props: LandingPageWrapperProps) => {
  return <BaseLayout>{props.children}</BaseLayout>;
};

const AppWrapper = (props: LandingPageWrapperProps) => {
  return <SidebarBrandWithHeader>{props.children}</SidebarBrandWithHeader>;
};

const PlainWrapper = (props: LandingPageWrapperProps) => {
  return <>{props.children}</>;
};

const MyApp = ((props: AppProps) => {
  const { Component, pageProps, router } = props;
  const { session } = pageProps;

  let LayoutWrapper = LandingPageWrapper;
  if (router.pathname.startsWith("/app")) {
    LayoutWrapper = AppWrapper;
  } else if (router.pathname.startsWith("/signin")) {
    LayoutWrapper = PlainWrapper;
  }

  useEffect(() => {
    posthog.init("phc_8eCgastmlsUMsIr33zEoUx5pSwiT7GSqG3C3lJVVSNS", {
      api_host: "https://eu.posthog.com",
    });
  }, []);

  return (
    <SessionProvider session={session}>
      <Provider>
        <NextIntlClientProvider
          locale={router.locale || "en-US"}
          messages={pageProps.messages}
          onError={(error) => {
            if (
              error.code === IntlErrorCode.MISSING_MESSAGE ||
              error.code === IntlErrorCode.ENVIRONMENT_FALLBACK
            ) {
              if (process.env.NODE_ENV !== "production") {
                console.warn("[intl-warning]", error.code, error.message);
              }
              return;
            }
            throw error;
          }}
          timeZone="UTC"
        >
          <LayoutWrapper>
            <Component {...pageProps} />
            <Toaster />
          </LayoutWrapper>
        </NextIntlClientProvider>
      </Provider>
    </SessionProvider>
  );
}) as AppType;

export default trpc.withTRPC(MyApp);
