import { Box, Button, Container, Stack, Text } from "@chakra-ui/react";
import { GetServerSideProps } from "next";
import { signIn } from "next-auth/react";
import { NextSeo } from "next-seo";
import Image from "next/image";

import { getMessages } from "../../messages/getMessages";

const SigninPage = () => {
  return (
    <>
      <NextSeo noindex />
      <Container maxW="lg" py={{ base: 12, md: 20 }}>
        <Stack
          width="100%"
          gap={8}
          align="center"
          borderWidth={1}
          borderColor="border"
          borderRadius="lg"
          bg="bg.surface"
          p={{ base: 8, md: 12 }}
          boxShadow="lg"
        >
          <Box position="relative" width={180} height={80}>
            <Image
              src="/posidonia-logo.png"
              alt="Posidonia"
              fill
              style={{ objectFit: "contain" }}
              priority
            />
          </Box>
          <Stack gap={3} textAlign="center" width="100%">
            <Text fontSize="lg" fontWeight="semibold" color="gray.600">
              Acesse o sistema de reserva
            </Text>
            <Button
              size="lg"
              colorPalette="blue"
              onClick={() =>
                signIn("microsoft-entra-id", {
                  callbackUrl: "/app/schedule",
                })
              }
            >
              Entrar com Microsoft Entra ID
            </Button>
          </Stack>
        </Stack>
      </Container>
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const messages = await getMessages(context);

  return {
    props: {
      messages,
    },
  };
};

export default SigninPage;
