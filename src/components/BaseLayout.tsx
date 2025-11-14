import { Box } from "@chakra-ui/react";
import Head from "next/head";

type BaseLayoutProps = {
  children: React.ReactNode;
};

export const BaseLayout = (props: BaseLayoutProps) => {
  return (
    <>
      <Head>
        <title>Chair-lot · Desk Booking</title>
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="msapplication-TileColor" content="#da532c" />
        <meta name="theme-color" content="#ffffff" />
      </Head>

      <Box
        as="main"
        display="flex"
        minHeight="100vh"
        flexDirection="column"
        backgroundColor="#F8F6F1"
        color="#111111"
      >
        <Box flex="1">{props.children}</Box>
      </Box>
    </>
  );
};
