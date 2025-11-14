import {
  Avatar,
  Box,
  Button,
  Flex,
  HStack,
  Link,
  Stack,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react";
import { UserRole } from "@prisma/client";
import { signOut } from "next-auth/react";
import NextLink from "next/link";

import { trpc } from "../../../utils/trpc";

type LayoutProps = {
  children: React.ReactNode;
};

export const SidebarBrandWithHeader = ({ children }: LayoutProps) => {
  const userQuery = trpc.user.get.useQuery();
  const isUserAdmin = userQuery.data?.userRole === UserRole.ADMIN;
  const isSmallScreen = useBreakpointValue({ base: true, md: false });
  const userName = userQuery.data?.name ?? "Usuário";
  const userImage = userQuery.data?.image ?? undefined;

  const primaryNavLinks = [
    { label: "MAPA", href: "/app/schedule", hidden: false },
    { label: "RELATÓRIOS", href: "/app/analytics", hidden: !isUserAdmin },
    { label: "AJUDA", href: "/app/help", hidden: false },
  ].filter((item) => !item.hidden);

  const secondaryActions = [
    { label: "SOBRE O ESCRITÓRIO", href: "/app/offices", hidden: !isUserAdmin },
  ].filter((item) => !item.hidden);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/signin" });
  };

  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || userName.slice(0, 2).toUpperCase();

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
          <Text fontFamily="'Space Mono', monospace" fontWeight="700">
            Chair-lot: Desk Booking
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
            {userQuery.data ? (
              <HStack gap={2} align="center">
                <Avatar.Root size="sm">
                  {userImage ? (
                    <Avatar.Image src={userImage} alt={userName} />
                  ) : (
                    <Avatar.Fallback>{initials}</Avatar.Fallback>
                  )}
                </Avatar.Root>
                <Text fontSize="xs" color="#111111" fontWeight="600">
                  {userName}
                </Text>
                <Button
                  variant="outline"
                  size="sm"
                  borderRadius={0}
                  borderColor="#111111"
                  fontSize="xs"
                  paddingX={3}
                  onClick={handleSignOut}
                  _hover={{ backgroundColor: "#111111", color: "#ffffff" }}
                >
                  Sair da Conta
                </Button>
              </HStack>
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
