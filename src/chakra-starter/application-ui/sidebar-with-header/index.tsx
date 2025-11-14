import {
  Box,
  Flex,
  HStack,
  Link,
  Stack,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react";
import { UserRole } from "@prisma/client";
import NextLink from "next/link";

import { trpc } from "../../../utils/trpc";

type LayoutProps = {
  children: React.ReactNode;
};

const primaryNavLinks = [
  { label: "HOME", href: "/app" },
  { label: "MAPA", href: "/app/schedule" },
  { label: "MINHAS RESERVAS", href: "/app/reservations" },
  { label: "RELATÓRIOS", href: "/app/analytics" },
  { label: "AJUDA", href: "/app/help" },
];

const secondaryActions = [
  { label: "ENTRAR NO SISTEMA", href: "/app/account/settings" },
  { label: "SOBRE O ESCRITÓRIO", href: "/app/offices" },
];

export const SidebarBrandWithHeader = ({ children }: LayoutProps) => {
  const userQuery = trpc.user.get.useQuery();
  const isUserAdmin = userQuery.data?.userRole === UserRole.ADMIN;
  const isSmallScreen = useBreakpointValue({ base: true, md: false });

  return (
    <Box
      minHeight="100vh"
      backgroundColor="#ffffff"
      color="#111111"
      display="flex"
      flexDirection="column"
    >
      <Box
        borderBottom="1px solid #E4E0D8"
        paddingY={{ base: 3, md: 4 }}
        paddingX={{ base: 4, md: 8, lg: 12 }}
      >
        <Flex
          direction={{ base: "column", md: "row" }}
          align={{ base: "flex-start", md: "center" }}
          justify="space-between"
          gap={{ base: 3, md: 6 }}
        >
          <Text
            fontFamily="'IBM Plex Serif', serif"
            fontWeight="600"
            letterSpacing="0.12em"
            fontSize={{ base: "xs", md: "sm" }}
          >
            OFFICE ARENA · SISTEMA DE AGENDAMENTO
          </Text>
          <HStack
            gap={{ base: 3, md: 6 }}
            flexWrap="wrap"
            fontWeight="600"
            fontSize={{ base: "xs", md: "sm" }}
          >
            {primaryNavLinks.map((item) => (
              <Link
                key={item.label}
                as={NextLink}
                href={item.href}
                textDecoration="none"
                color="#111111"
                _hover={{ textDecoration: "underline" }}
              >
                {item.label}
              </Link>
            ))}
          </HStack>
          <HStack
            gap={{ base: 3, md: 6 }}
            flexWrap="wrap"
            fontSize={{ base: "xs", md: "sm" }}
            color="#666666"
          >
            {secondaryActions.map((item) => (
              <Link
                key={item.label}
                as={NextLink}
                href={item.href}
                textDecoration="none"
                _hover={{ textDecoration: "underline", color: "#111111" }}
              >
                {item.label}
              </Link>
            ))}
            {isUserAdmin ? (
              <Link
                as={NextLink}
                href="/app/organization-settings"
                textDecoration="none"
                _hover={{ textDecoration: "underline", color: "#111111" }}
              >
                CONTROLE ADMIN
              </Link>
            ) : null}
          </HStack>
        </Flex>
      </Box>

      <Box
        flex="1"
        paddingX={{ base: 4, md: 8, lg: 12 }}
        paddingY={{ base: 4, md: 6 }}
      >
        {children}
      </Box>

      <Box
        borderTop="1px solid #E4E0D8"
        paddingY={3}
        paddingX={{ base: 4, md: 8, lg: 12 }}
      >
        <Stack
          direction={isSmallScreen ? "column" : "row"}
          gap={isSmallScreen ? 2 : 6}
          fontSize="xs"
          color="#666666"
          letterSpacing="0.08em"
        >
          <Text>
            SISTEMA DE AGENDAMENTO DE MESAS · VERSÃO BETA · ÚLTIMA ATUALIZAÇÃO
            {": "}
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date())}
          </Text>
        </Stack>
      </Box>
    </Box>
  );
};
