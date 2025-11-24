import {
  Avatar,
  Badge,
  Box,
  BoxProps,
  Button,
  Container,
  Flex,
  Grid,
  HStack,
  Heading,
  IconButton,
  Spinner,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { DeskScheduleStatus } from "@prisma/client";
import { formatISO } from "date-fns";
import { GetServerSideProps } from "next";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import type { DayPickerProps } from "react-day-picker";
import { de } from "react-day-picker/locale";
import { FiCalendar, FiMinus } from "react-icons/fi";

import { AdminScheduleManager } from "../../../components/AdminScheduleManager";
import { FloorDeskBooker } from "../../../components/FloorDeskBooker";
import { ScheduleNoOfficeSelected } from "../../../components/ScheduleNoOfficeSelected";
import { toaster } from "../../../components/ui/toaster";
import { useGetDisabledDays } from "../../../hooks/useGetDisabledDays";
import { getMessages } from "../../../messages/getMessages";
import { appAuthRedirect } from "../../../server/nextMiddleware/appAuthRedirect";
import { trpc } from "../../../utils/trpc";

const css = `
  .rdp {
    margin: 0 !important;
  }
  .rdp-day {
    border-radius: 10px !important;
    font-weight: 500;
    color: #1a1a1a;
  }
  .rdp-day_selected {
    background-color: #111111 !important;
    color: #ffffff !important;
  }
  .rdp-day_selected:hover {
    background-color: #111111 !important;
    color: #ffffff !important;
  }
  .rdp-day_today:not(.rdp-day_selected) {
    color: #ff7a1a !important;
    font-weight: 700;
  }
  .rdp-caption_label {
    font-weight: 600;
    color: #111111;
  }
  .rdp-weekday {
    font-weight: 600;
    color: #6b6b6b;
  }
`;

type ReservationForDay = {
  deskScheduleId: string;
  deskId: string;
  userId: string;
  userName: string | null;
  userImage?: string | null;
  start: Date;
  end: Date;
  wholeDay: boolean;
  status: DeskScheduleStatus;
  checkInDeadline: Date | null;
  checkedInAt: Date | null;
  deskLabel: string;
  floorName: string;
};

const SchedulePage = () => {
  const t = useTranslations("SchedulePages");
  const currentLocale = useLocale();

  const utils = trpc.useUtils();
  const [day, setDay] = useState(new Date());
  const formattedDate = formatISO(day, { representation: "date" });
  const isSelectedDayToday =
    formattedDate === formatISO(new Date(), { representation: "date" });
  const userQuery = trpc.user.get.useQuery();
  const getDeskSchedulesForDayQuery =
    trpc.schedule.getDeskSchedulesForDay.useQuery({
      day: formattedDate,
    });

  const getFloorsForCurrentOfficeQuery =
    trpc.schedule.getFloorsForCurrentOffice.useQuery({});
  const floors = useMemo(() => {
    const rawFloors = getFloorsForCurrentOfficeQuery.data ?? [];
    const isOpenSpace = (name: string | null | undefined) =>
      name?.trim().toLowerCase() === "open space";
    const openSpaceFloors = rawFloors.filter((floor) =>
      isOpenSpace(floor.name),
    );
    const otherFloors = rawFloors.filter((floor) => !isOpenSpace(floor.name));
    return [...openSpaceFloors, ...otherFloors];
  }, [getFloorsForCurrentOfficeQuery.data]);

  const getOfficeSettingQuery =
    trpc.officeSetting.getForCurrentOffice.useQuery();

  const timeFormatter = useMemo(() => {
    const timeZone = getDeskSchedulesForDayQuery.data?.timeZone ?? "UTC";
    return new Intl.DateTimeFormat(currentLocale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
  }, [currentLocale, getDeskSchedulesForDayQuery.data?.timeZone]);

  const isLoading =
    userQuery.isLoading ||
    getDeskSchedulesForDayQuery.isLoading ||
    getFloorsForCurrentOfficeQuery.isLoading ||
    getOfficeSettingQuery.isLoading;

  const { disabledDays } = useGetDisabledDays({
    getOfficeSettingQueryData: getOfficeSettingQuery.data,
    isLoading: getOfficeSettingQuery.isLoading,
  });

  const isAdmin = userQuery.data?.userRole === "ADMIN";
  const scheduleTimeZone = getDeskSchedulesForDayQuery.data?.timeZone || "UTC";
  const defaultFloorTab = floors[0]?.id;
  const defaultTabValue =
    defaultFloorTab ?? (isAdmin ? "admin-management" : undefined);

  const [activeTabValue, setActiveTabValue] = useState<string | undefined>(
    defaultTabValue,
  );

  useEffect(() => {
    setActiveTabValue(defaultTabValue);
  }, [defaultTabValue]);

  const reservationsForDay = useMemo(() => {
    const mapped = getDeskSchedulesForDayQuery.data?.deskSchdulesMapped;
    if (!mapped) return [];

    const uniqueReservations = new Map<string, ReservationForDay>();

    Object.values(mapped).forEach(({ desk, usedPeriods }) => {
      usedPeriods.forEach((period) => {
        if (!period) return;
        const reservationId = period.deskScheduleId;
        if (uniqueReservations.has(reservationId)) return;

        uniqueReservations.set(reservationId, {
          deskScheduleId: reservationId,
          deskId: desk.id,
          userId: period.id,
          userName: period.name ?? null,
          userImage: period.image ?? null,
          start: new Date(period.start),
          end: new Date(period.end),
          wholeDay: period.wholeDay,
          status: period.status,
          checkInDeadline: period.checkInDeadline
            ? new Date(period.checkInDeadline)
            : null,
          checkedInAt: period.checkedInAt ? new Date(period.checkedInAt) : null,
          deskLabel: desk.publicDeskId ?? desk.name ?? desk.id,
          floorName: desk.floor?.name ?? "",
        });
      });
    });

    return Array.from(uniqueReservations.values()).sort((a, b) => {
      const statusWeightA = a.status === DeskScheduleStatus.BOOKED ? 0 : 1;
      const statusWeightB = b.status === DeskScheduleStatus.BOOKED ? 0 : 1;
      if (statusWeightA !== statusWeightB) {
        return statusWeightA - statusWeightB;
      }

      return a.start.getTime() - b.start.getTime();
    });
  }, [getDeskSchedulesForDayQuery.data]);

  const { pendingReservations, confirmedReservations } = useMemo(() => {
    const pending: ReservationForDay[] = [];
    const confirmed: ReservationForDay[] = [];
    reservationsForDay.forEach((reservation) => {
      if (reservation.status === DeskScheduleStatus.CHECKED_IN) {
        confirmed.push(reservation);
      } else {
        pending.push(reservation);
      }
    });
    return { pendingReservations: pending, confirmedReservations: confirmed };
  }, [reservationsForDay]);

  const summaryTotals = useMemo(() => {
    const totalDesks =
      getDeskSchedulesForDayQuery.data?.desksInCurrentOffice.length ?? 0;
    const occupiedDeskIds = new Set(
      reservationsForDay.map((reservation) => reservation.deskId),
    );
    const occupied = occupiedDeskIds.size;
    const free = Math.max(totalDesks - occupied, 0);
    return {
      totalDesks,
      occupiedDesks: occupied,
      freeDesks: free,
      pending: pendingReservations.length,
      confirmed: confirmedReservations.length,
    };
  }, [
    getDeskSchedulesForDayQuery.data?.desksInCurrentOffice,
    reservationsForDay,
    pendingReservations.length,
    confirmedReservations.length,
  ]);

  const selectedFloor =
    floors.find((floor) => floor.id === activeTabValue) ?? floors[0];

  const [checkInInFlightId, setCheckInInFlightId] = useState<string | null>(
    null,
  );
  const checkInMutation = trpc.schedule.checkInDeskSchedule.useMutation({
    onMutate: (variables) => {
      setCheckInInFlightId(variables.deskScheduleId);
    },
    onSuccess: () => {
      toaster.create({
        title: t("checkInSuccessTitle"),
        description: t("checkInSuccessDescription"),
        type: "success",
        duration: 4000,
        closable: true,
      });
      utils.schedule.getDeskSchedulesForDay.invalidate({
        day: formattedDate,
      });
    },
    onError: () => {
      toaster.create({
        title: t("checkInErrorTitle"),
        description: t("checkInErrorDescription"),
        type: "error",
        duration: 5000,
        closable: true,
      });
    },
    onSettled: () => {
      setCheckInInFlightId(null);
    },
  });

  if (!userQuery.data) {
    return <div>{t("notLoggedIn")}</div>;
  }

  if (userQuery.data.currentOfficeId === null) {
    return <ScheduleNoOfficeSelected />;
  }

  if (!getDeskSchedulesForDayQuery.data) {
    return <div>{t("noSchedules")}</div>;
  }

  return (
    <Container maxW={"container.2xl"} paddingX={{ base: 2, lg: 4 }}>
      <StatusSummary totals={summaryTotals} />
      <VStack
        align="stretch"
        gap={{ base: 6, xl: 8 }}
        marginTop={{ base: 4, lg: 6 }}
      >
        <Box position="relative">
          {isLoading ? (
            <Flex justify="center" align="center" minH="360px">
              <Spinner />
            </Flex>
          ) : floors.length === 0 && !isAdmin ? (
            <Text color="gray.600">{t("noSchedules")}</Text>
          ) : (
            <VStack alignItems={"flex-start"} width={"100%"} gap={6}>
              <Tabs.Root
                key={defaultTabValue ?? "no-tabs"}
                width={"100%"}
                colorPalette="orange"
                lazyMount
                unmountOnExit
                value={activeTabValue}
                onValueChange={(details) => {
                  setActiveTabValue(details.value);
                }}
              >
                <Flex
                  align={{ base: "flex-start", md: "center" }}
                  justify="space-between"
                  gap={{ base: 4, md: 8 }}
                  flexWrap="wrap"
                  width="100%"
                >
                  <Box flex="1" minW="200px">
                    <Text
                      fontSize="xs"
                      letterSpacing="0.12em"
                      fontWeight="600"
                      color="#666666"
                    >
                      {t("mapAreaLabel")}
                    </Text>
                    <Text
                      fontFamily="'Space Mono', monospace"
                      fontSize="lg"
                      fontWeight="700"
                      color="#111111"
                    >
                      {selectedFloor?.name ?? t("statusNoFloorSelected")}
                    </Text>
                  </Box>
                  <Tabs.List
                    border="1px solid #111111"
                    padding={1}
                    gap={2}
                    overflowX="auto"
                    backgroundColor="#FFFFFF"
                  >
                    {floors.map((floor) => (
                      <Tabs.Trigger
                        key={floor.id}
                        value={floor.id}
                        paddingY={2}
                        paddingX={4}
                        borderRadius={0}
                        fontWeight="600"
                        fontSize="sm"
                        letterSpacing="0.05em"
                        _selected={{
                          backgroundColor: "#111111",
                          color: "white",
                          borderBottom: "3px solid #111111",
                        }}
                        _hover={{
                          backgroundColor: "#F5F2EA",
                        }}
                        border="1px solid #111111"
                        backgroundColor="#FFFFFF"
                        color="#111111"
                      >
                        {floor.name}
                      </Tabs.Trigger>
                    ))}
                    {isAdmin && (
                      <Tabs.Trigger
                        value="admin-management"
                        paddingY={2}
                        paddingX={4}
                        borderRadius={0}
                        fontWeight="600"
                        fontSize="sm"
                        letterSpacing="0.05em"
                        _selected={{
                          backgroundColor: "#111111",
                          color: "white",
                          borderBottom: "3px solid #111111",
                        }}
                        _hover={{
                          backgroundColor: "#F5F2EA",
                        }}
                        border="1px solid #111111"
                        backgroundColor="#FFFFFF"
                        color="#111111"
                      >
                        {t("adminTabLabel")}
                      </Tabs.Trigger>
                    )}
                  </Tabs.List>
                  <FloatingCalendar
                    day={day}
                    locale={currentLocale}
                    disabledDays={disabledDays}
                    onDayChange={(value) => setDay(value)}
                    containerProps={{
                      position: "relative",
                      top: "auto",
                      right: "auto",
                      left: "auto",
                      pointerEvents: "auto",
                      marginLeft: { base: 0, md: 4 },
                      marginTop: { base: 4, md: 0 },
                      order: { base: 3, md: 0 },
                      flexShrink: 0,
                    }}
                  />
                </Flex>
                {floors.map((floor) => (
                  <Tabs.Content key={floor.id} value={floor.id}>
                    {floor.floorPlan && userQuery.data?.id ? (
                      <FloorDeskBooker
                        floor={floor}
                        deskSchedulesMapped={
                          getDeskSchedulesForDayQuery.data?.deskSchdulesMapped
                        }
                        userId={userQuery.data.id}
                        day={day}
                        dayStart={
                          getDeskSchedulesForDayQuery.data?.dayStart ??
                          new Date(day)
                        }
                        dayEnd={
                          getDeskSchedulesForDayQuery.data?.dayEnd ??
                          new Date(day)
                        }
                      />
                    ) : null}
                  </Tabs.Content>
                ))}
                {isAdmin && (
                  <Tabs.Content value="admin-management">
                    <AdminScheduleManager
                      formattedDay={formattedDate}
                      timeZone={scheduleTimeZone}
                      timeFormatter={timeFormatter}
                      deskSchedules={
                        getDeskSchedulesForDayQuery.data?.deskSchedules ?? []
                      }
                      desks={
                        getDeskSchedulesForDayQuery.data
                          ?.desksInCurrentOffice ?? []
                      }
                      onRefresh={async () => {
                        await utils.schedule.getDeskSchedulesForDay.invalidate({
                          day: formattedDate,
                        });
                      }}
                    />
                  </Tabs.Content>
                )}
              </Tabs.Root>
            </VStack>
          )}
        </Box>
        <ReservationsPanel
          day={day}
          locale={currentLocale}
          pendingReservations={pendingReservations}
          confirmedReservations={confirmedReservations}
          allReservations={reservationsForDay}
          isLoading={isLoading}
          timeFormatter={timeFormatter}
          currentUserId={userQuery.data.id}
          isSelectedDayToday={isSelectedDayToday}
          onCheckIn={async (deskScheduleId) => {
            await checkInMutation.mutateAsync({ deskScheduleId });
          }}
          checkInLoadingId={checkInInFlightId}
        />
      </VStack>
    </Container>
  );
};

type FloatingCalendarProps = {
  day: Date;
  locale: string;
  disabledDays: DayPickerProps["disabled"];
  onDayChange: (nextDay: Date) => void;
  containerProps?: BoxProps;
};

const FloatingCalendar = ({
  day,
  locale,
  disabledDays,
  onDayChange,
  containerProps,
}: FloatingCalendarProps) => {
  const t = useTranslations("SchedulePages");
  const [isOpen, setIsOpen] = useState(true);

  const handleSelectDay = (value: Date | undefined) => {
    if (!value) return;
    onDayChange(value);
  };

  const defaultContainerProps: BoxProps = {
    position: "absolute",
    top: { base: 4, md: 6 },
    right: { base: 4, md: 6 },
    zIndex: 10,
    pointerEvents: "none",
  };

  return (
    <Box {...defaultContainerProps} {...containerProps}>
      {isOpen ? (
        <Box
          pointerEvents="auto"
          backgroundColor="#FFFFFF"
          border="1px solid #111111"
          padding={4}
          maxW="320px"
          boxShadow="xl"
        >
          <Flex align="center" justify="space-between" mb={3}>
            <Text
              fontSize="sm"
              fontWeight="600"
              letterSpacing="0.08em"
              textTransform="uppercase"
              color="#666666"
            >
              {t("sidebarTitle")}
            </Text>
            <IconButton
              aria-label={t("sidebarTitle")}
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
            >
              <FiMinus />
            </IconButton>
          </Flex>
          <style>{css}</style>
          <DayPicker
            mode="single"
            selected={day}
            defaultMonth={day}
            disabled={disabledDays}
            onSelect={handleSelectDay}
            showOutsideDays
            locale={locale === "de" ? de : undefined}
          />
        </Box>
      ) : (
        <IconButton
          pointerEvents="auto"
          aria-label={t("sidebarTitle")}
          onClick={() => setIsOpen(true)}
          rounded="full"
          size="lg"
          colorPalette="orange"
        >
          <FiCalendar />
        </IconButton>
      )}
    </Box>
  );
};

type ReservationsPanelProps = {
  day: Date;
  locale: string;
  pendingReservations: ReservationForDay[];
  confirmedReservations: ReservationForDay[];
  allReservations: ReservationForDay[];
  isLoading: boolean;
  timeFormatter: Intl.DateTimeFormat;
  currentUserId: string;
  isSelectedDayToday: boolean;
  onCheckIn: (deskScheduleId: string) => Promise<void>;
  checkInLoadingId: string | null;
};

const ReservationsPanel = ({
  day,
  locale,
  pendingReservations,
  confirmedReservations,
  allReservations,
  isLoading,
  timeFormatter,
  currentUserId,
  isSelectedDayToday,
  onCheckIn,
  checkInLoadingId,
}: ReservationsPanelProps) => {
  const t = useTranslations("SchedulePages");
  const dateLabel = useMemo(() => {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(day);
  }, [day, locale]);

  const renderReservationItems = (items: ReservationForDay[]) =>
    items.map((reservation) => {
      const name = reservation.userName ?? t("adminUnknownUser");
      const deskLabel = t("floorDeskName", {
        floorName: reservation.floorName,
        deskId: reservation.deskLabel,
      });
      const intervalLabel = reservation.wholeDay
        ? t("sidebarAllDay")
        : `${timeFormatter.format(reservation.start)} – ${timeFormatter.format(
            reservation.end,
          )}`;
      const isPending = reservation.status !== DeskScheduleStatus.CHECKED_IN;
      const initials =
        name
          .split(/\s+/)
          .filter(Boolean)
          .map((part) => part[0]?.toUpperCase() ?? "")
          .join("")
          .slice(0, 2) || name.slice(0, 2).toUpperCase();
      const isCurrentUserReservation = reservation.userId === currentUserId;
      const canShowCheckInButton =
        isCurrentUserReservation &&
        reservation.status !== DeskScheduleStatus.CHECKED_IN;
      const isCheckInDisabled =
        !isSelectedDayToday ||
        Boolean(
          reservation.checkInDeadline &&
            reservation.checkInDeadline.getTime() < Date.now(),
        );
      const showLoadingState =
        checkInLoadingId !== null &&
        reservation.deskScheduleId === checkInLoadingId;

      return (
        <HStack
          key={reservation.deskScheduleId}
          align="flex-start"
          gap={3}
          padding={3}
          border="1px solid rgba(17, 17, 17, 0.1)"
          backgroundColor="#FFFFFF"
        >
          <Avatar.Root size="sm" bg="#222222" color="white">
            {reservation.userImage ? (
              <Avatar.Image src={reservation.userImage} alt={name ?? ""} />
            ) : (
              <Avatar.Fallback>{initials}</Avatar.Fallback>
            )}
          </Avatar.Root>
          <Box flex="1">
            <Text fontWeight="600" color="#111111">
              {name}
            </Text>
            <Text fontSize="sm" color="#666666">
              {deskLabel}
            </Text>
            <Text fontSize="sm" color="#444444">
              {intervalLabel}
            </Text>
            {isPending ? (
              <Badge
                marginTop={2}
                colorPalette="yellow"
                variant="subtle"
                textTransform="none"
                fontWeight="600"
              >
                {t("sidebarPendingStatus")}
              </Badge>
            ) : (
              <Badge
                marginTop={2}
                colorPalette="green"
                variant="subtle"
                textTransform="none"
                fontWeight="600"
              >
                {t("sidebarCheckedInStatus")}
              </Badge>
            )}
          </Box>
          {canShowCheckInButton && (
            <Button
              size="sm"
              variant="solid"
              colorPalette="green"
              disabled={isCheckInDisabled}
              onClick={() => onCheckIn(reservation.deskScheduleId)}
            >
              {showLoadingState ? <Spinner size="sm" /> : t("sidebarCheckIn")}
            </Button>
          )}
        </HStack>
      );
    });

  const showLoadingState = isLoading && allReservations.length === 0;

  return (
    <Box
      border="1px solid #111111"
      padding={5}
      backgroundColor="#FDFBF5"
      borderRadius={0}
    >
      <VStack align="stretch" gap={6}>
        <Box>
          <Text
            fontSize="sm"
            fontWeight="600"
            textTransform="uppercase"
            letterSpacing="0.08em"
            color="gray.500"
          >
            {t("sidebarTitle")}
          </Text>
          <Heading size="md" mt={1} color="#111111">
            {dateLabel}
          </Heading>
          <Flex gap={3} mt={4} flexWrap="wrap">
            <StatCard
              label={t("sidebarPendingCount", {
                count: pendingReservations.length,
              })}
              value={pendingReservations.length}
            />
            <StatCard
              label={t("sidebarCheckedInCount", {
                count: confirmedReservations.length,
              })}
              value={confirmedReservations.length}
            />
          </Flex>
        </Box>

        <Box>
          <Text
            fontSize="sm"
            fontWeight="600"
            textTransform="uppercase"
            letterSpacing="0.08em"
            color="gray.500"
          >
            {t("sidebarReservationsHeading")}
          </Text>
          <VStack align="stretch" gap={4} mt={4}>
            {showLoadingState ? (
              <Flex justify="center" paddingY={4}>
                <Spinner />
              </Flex>
            ) : allReservations.length === 0 ? (
              <Text fontSize="sm" color="gray.600">
                {t("sidebarEmptyState")}
              </Text>
            ) : (
              <>
                {pendingReservations.length > 0 && (
                  <Box>
                    <Text fontWeight="600" color="#111111" mb={2}>
                      {t("sidebarSectionPending")}
                    </Text>
                    <VStack align="stretch" gap={3}>
                      {renderReservationItems(pendingReservations)}
                    </VStack>
                  </Box>
                )}
                {confirmedReservations.length > 0 && (
                  <Box>
                    <Text fontWeight="600" color="#111111" mb={2}>
                      {t("sidebarSectionConfirmed")}
                    </Text>
                    <VStack align="stretch" gap={3}>
                      {renderReservationItems(confirmedReservations)}
                    </VStack>
                  </Box>
                )}
              </>
            )}
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
};

const StatCard = ({ label, value }: { label: string; value: number }) => {
  return (
    <Box
      backgroundColor="white"
      borderRadius={0}
      paddingY={3}
      paddingX={4}
      border="1px solid #E4E0D8"
      minW="130px"
      boxShadow="none"
    >
      <Text fontSize="sm" color="gray.600">
        {label}
      </Text>
      <Text fontSize="xl" fontWeight="700" color="#111111">
        {value}
      </Text>
    </Box>
  );
};

const StatusSummary = ({
  totals,
}: {
  totals: {
    totalDesks: number;
    occupiedDesks: number;
    freeDesks: number;
    pending: number;
    confirmed: number;
  };
}) => {
  const t = useTranslations("SchedulePages");
  return (
    <Box
      marginTop={4}
      border="1px solid #E4E0D8"
      backgroundColor="#F8F6F1"
      paddingY={3}
      paddingX={{ base: 3, lg: 4 }}
    >
      <Grid
        templateColumns={{
          base: "repeat(2, minmax(0, 1fr))",
          lg: "repeat(5, minmax(0, 1fr))",
        }}
        gap={4}
      >
        <SummaryItem label={t("statusTotalDesks")} value={totals.totalDesks} />
        <SummaryItem
          label={t("statusOccupiedDesks")}
          value={totals.occupiedDesks}
        />
        <SummaryItem label={t("statusFreeDesks")} value={totals.freeDesks} />
        <SummaryItem
          label={t("statusPendingReservations")}
          value={totals.pending}
        />
        <SummaryItem
          label={t("statusConfirmedReservations")}
          value={totals.confirmed}
        />
      </Grid>
    </Box>
  );
};

const SummaryItem = ({ label, value }: { label: string; value: number }) => (
  <Box>
    <Text
      fontSize="xs"
      color="#666666"
      letterSpacing="0.08em"
      textTransform="uppercase"
    >
      {label}
    </Text>
    <Text
      fontFamily="'Space Mono', monospace"
      fontSize="xl"
      fontWeight="700"
      color="#111111"
    >
      {value}
    </Text>
  </Box>
);

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { redirect, session } = await appAuthRedirect({
    context,
  });
  if (redirect) return { redirect };

  const messages = await getMessages(context);

  return {
    props: {
      session,
      messages,
    },
  };
};

export default SchedulePage;
