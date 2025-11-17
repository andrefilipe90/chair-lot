import { Box } from "@chakra-ui/react";
import Head from "next/head";

type BaseLayoutProps = {
  children: React.ReactNode;
};

export const BaseLayout = (props: BaseLayoutProps) => {
  const TRIDENT_FAVICON =
    "data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2064%2064%27%3E%3Ctext%20x%3D%2750%25%27%20y%3D%2750%25%27%20dominant-baseline%3D%27central%27%20text-anchor%3D%27middle%27%20font-size%3D%2748%27%3E%F0%9F%94%B1%3C/text%3E%3C/svg%3E";
  return (
    <>
      <Head>
        <title>Chair-lot · Desk Booking</title>
        <link rel="apple-touch-icon" sizes="180x180" href={TRIDENT_FAVICON} />
        <link rel="icon" type="image/svg+xml" href={TRIDENT_FAVICON} />
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
