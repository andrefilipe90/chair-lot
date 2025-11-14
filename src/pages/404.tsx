import { Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";
import { useRouter } from "next/router";

export default function Custom404() {
  const router = useRouter();

  return (
    <Flex
      minH="100vh"
      backgroundColor="#F8F6F1"
      color="#111111"
      align="center"
      justify="center"
      padding={8}
    >
      <Stack
        gap={8}
        align="flex-start"
        maxW="lg"
        border="1px solid #111111"
        backgroundColor="#FFFFFF"
        padding={{ base: 6, md: 10 }}
        borderRadius={0}
        boxShadow="none"
      >
        <Text
          fontFamily="'Space Mono', monospace"
          textTransform="uppercase"
          letterSpacing="0.12em"
          fontSize="sm"
        >
          404 · Página não encontrada
        </Text>
        <Heading
          fontFamily="'Space Mono', monospace"
          fontSize={{ base: "3xl", md: "4xl" }}
          fontWeight="700"
        >
          A cadeira que você procura ainda não existe.
        </Heading>
        <Text fontSize="md" color="#444444" maxW="md">
          Talvez ela esteja em outro andar ou ainda não foi cadastrada. Continue
          navegando pelo Chair-lot para reservar o espaço ideal.
        </Text>
        <Stack direction={{ base: "column", sm: "row" }} gap={4}>
          <Button
            border="1px solid #111111"
            borderRadius={0}
            paddingY={3}
            paddingX={6}
            fontFamily="'Space Mono', monospace"
            fontWeight="600"
            backgroundColor="#111111"
            color="#FFFFFF"
            onClick={() => {
              void router.push("/app/schedule");
            }}
            _hover={{
              backgroundColor: "#FFFFFF",
              color: "#111111",
            }}
          >
            Voltar ao mapa
          </Button>
          <Button
            variant="outline"
            borderRadius={0}
            borderColor="#111111"
            paddingY={3}
            paddingX={6}
            fontFamily="'Space Mono', monospace"
            fontWeight="600"
            backgroundColor="#FFFFFF"
            onClick={() => {
              void router.push("/");
            }}
            _hover={{ backgroundColor: "#F5F2EA" }}
          >
            Ir para a página inicial
          </Button>
        </Stack>
        <Box
          width="100%"
          borderTop="1px solid #E4E0D8"
          paddingTop={4}
          fontFamily="'Space Mono', monospace"
          fontSize="xs"
          letterSpacing="0.08em"
          color="#666666"
        >
          Chair-lot · Desk Booking
        </Box>
      </Stack>
    </Flex>
  );
}
