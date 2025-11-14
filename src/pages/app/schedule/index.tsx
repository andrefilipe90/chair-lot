import {
  Avatar,
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Grid,
  HStack,
  Heading,
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
  const floors = useMemo(
    () => getFloorsForCurrentOfficeQuery.data ?? [],
    [getFloorsForCurrentOfficeQuery.data],
  );

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
      <Heading
        fontSize={{
          base: "xl",
          lg: "3xl",
        }}
      >
        {t("headingSchedule")}
      </Heading>
      <StatusSummary totals={summaryTotals} />
      <Grid
        templateColumns={{ base: "1fr", xl: "1.6fr 0.9fr" }}
        gap={{ base: 8, xl: 12 }}
        alignItems={"start"}
        marginTop={{ base: 6, lg: 10 }}
      >
        <Box>
          {isLoading ? (
            <Spinner />
          ) : floors.length === 0 && !isAdmin ? (
            <Text color="gray.600">{t("noSchedules")}</Text>
          ) : (
            <VStack alignItems={"flex-start"} width={"100%"} gap={6}>
              <Flex
                align={{ base: "flex-start", md: "center" }}
                justify="space-between"
                gap={{ base: 4, md: 8 }}
                flexWrap="wrap"
                width="100%"
              >
                <Box>
                  <Text
                    fontSize="xs"
                    letterSpacing="0.12em"
                    fontWeight="600"
                    color="#666666"
                  >
                    {t("mapAreaLabel")}
                  </Text>
                  <Text
                    fontFamily="'IBM Plex Mono', monospace"
                    fontSize="lg"
                    fontWeight="700"
                    color="#111111"
                  >
                    {selectedFloor?.name ?? t("statusNoFloorSelected")}
                  </Text>
                </Box>
                <HStack gap={3}>
                  <BrutalistButton>{t("mapToolbarFloors")}</BrutalistButton>
                  <BrutalistButton>{t("mapToolbarFilters")}</BrutalistButton>
                </HStack>
              </Flex>
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
                <Tabs.List
                  borderBottom="1px solid #111111"
                  paddingBottom={2}
                  marginBottom={4}
                  gap={2}
                  overflowX="auto"
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
        <ScheduleSidebar
          day={day}
          locale={currentLocale}
          disabledDays={disabledDays}
          pendingReservations={pendingReservations}
          confirmedReservations={confirmedReservations}
          allReservations={reservationsForDay}
          onDayChange={(value) => setDay(value)}
          timeFormatter={timeFormatter}
          isLoading={isLoading}
          currentUserId={userQuery.data.id}
          isSelectedDayToday={isSelectedDayToday}
          onCheckIn={async (deskScheduleId) => {
            await checkInMutation.mutateAsync({ deskScheduleId });
          }}
          checkInLoadingId={checkInInFlightId}
        />
      </Grid>
    </Container>
  );
};

type ScheduleSidebarProps = {
  day: Date;
  locale: string;
  disabledDays: DayPickerProps["disabled"];
  pendingReservations: ReservationForDay[];
  confirmedReservations: ReservationForDay[];
  allReservations: ReservationForDay[];
  onDayChange: (nextDay: Date) => void;
  timeFormatter: Intl.DateTimeFormat;
  isLoading: boolean;
  currentUserId: string;
  isSelectedDayToday: boolean;
  onCheckIn: (deskScheduleId: string) => Promise<void>;
  checkInLoadingId: string | null;
};

const ScheduleSidebar = ({
  day,
  locale,
  disabledDays,
  pendingReservations,
  confirmedReservations,
  allReservations,
  onDayChange,
  timeFormatter,
  isLoading,
  currentUserId,
  isSelectedDayToday,
  onCheckIn,
  checkInLoadingId,
}: ScheduleSidebarProps) => {
  const t = useTranslations("SchedulePages");
  const [activeSidebarTab, setActiveSidebarTab] = useState("calendar");

  const dateLabel = useMemo(() => {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(day);
  }, [day, locale]);

  const handleSelectDay = (value: Date | undefined) => {
    if (!value) return;
    onDayChange(value);
  };

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
      const isCheckInLoading = checkInLoadingId === reservation.deskScheduleId;

      return (
        <Box
          key={reservation.deskScheduleId}
          borderRadius={0}
          border="1px solid #E4E0D8"
          backgroundColor="white"
          padding={4}
          boxShadow="none"
        >
          <Flex
            align={{ base: "flex-start", sm: "center" }}
            justify="space-between"
            gap={4}
            flexWrap="wrap"
          >
            <Flex align="center" gap={3}>
              <Box
                width="40px"
                height="40px"
                border="1px solid #111111"
                backgroundColor="#F5F2EA"
                display="flex"
                alignItems="center"
                justifyContent="center"
                fontFamily="'IBM Plex Mono', monospace"
                fontWeight="700"
                fontSize="sm"
              >
                {reservation.userImage ? (
                  <Avatar.Root size="md">
                    <Avatar.Image src={reservation.userImage} alt={name} />
                  </Avatar.Root>
                ) : (
                  initials
                )}
              </Box>
              <Box>
                <Text fontWeight="600" color="#111111">
                  {name}
                </Text>
                <Text fontSize="sm" color="gray.600">
                  {deskLabel}
                </Text>
              </Box>
            </Flex>
            <Badge
              borderRadius={0}
              paddingX={3}
              paddingY={1}
              colorPalette={isPending ? "orange" : "green"}
              variant="subtle"
            >
              {isPending
                ? t("reservationStatusPending")
                : t("reservationStatusCheckedIn")}
            </Badge>
          </Flex>
          <Flex
            align="center"
            justify="space-between"
            mt={3}
            gap={3}
            flexWrap="wrap"
          >
            <Text fontSize="sm" color="#111111" fontWeight="500">
              {intervalLabel}
            </Text>
            {isPending && reservation.checkInDeadline ? (
              <Text fontSize="xs" color="gray.500">
                {t("sidebarCheckInReminder", {
                  time: timeFormatter.format(reservation.checkInDeadline),
                })}
              </Text>
            ) : null}
            {!isPending && reservation.checkedInAt ? (
              <Text fontSize="xs" color="gray.500">
                {t("sidebarCheckedInAt", {
                  time: timeFormatter.format(reservation.checkedInAt),
                })}
              </Text>
            ) : null}
          </Flex>
          {canShowCheckInButton ? (
            <VStack align="flex-start" mt={3} gap={2}>
              {isCheckInDisabled && (
                <Text fontSize="xs" color="gray.500">
                  {t("checkInAvailableSameDay")}
                </Text>
              )}
              <Button
                variant="outline"
                size="sm"
                borderRadius={0}
                borderColor="#111111"
                color="#111111"
                _hover={{ backgroundColor: "#111111", color: "white" }}
                disabled={isCheckInDisabled || isCheckInLoading}
                onClick={() => onCheckIn(reservation.deskScheduleId)}
              >
                {isCheckInLoading ? (
                  <Flex align="center" gap={2}>
                    <Spinner size="xs" />
                    <Text as="span">{t("checkInButton")}</Text>
                  </Flex>
                ) : (
                  t("checkInButton")
                )}
              </Button>
            </VStack>
          ) : null}
        </Box>
      );
    });

  const showLoadingState = isLoading && allReservations.length === 0;

  return (
    <Box
      backgroundColor="#F8F6F1"
      borderRadius={0}
      padding={{ base: 4, md: 6 }}
      border="1px solid #E4E0D8"
      boxShadow="none"
      display="flex"
      flexDirection="column"
      gap={6}
    >
      <HStack gap={0} borderBottom="1px solid #111111">
        {[
          { value: "calendar", label: t("sidebarTabCalendar") },
          { value: "my-desk", label: t("sidebarTabMyDesk") },
          { value: "team", label: t("sidebarTabTeam") },
          { value: "settings", label: t("sidebarTabSettings") },
        ].map((tab) => (
          <Box
            key={tab.value}
            as="button"
            paddingY={2}
            paddingX={4}
            border="1px solid #111111"
            borderBottom={
              activeSidebarTab === tab.value
                ? "3px solid #111111"
                : "1px solid #111111"
            }
            borderRadius={0}
            backgroundColor={
              activeSidebarTab === tab.value ? "#111111" : "#FFFFFF"
            }
            color={activeSidebarTab === tab.value ? "#FFFFFF" : "#111111"}
            fontSize="sm"
            fontWeight="600"
            letterSpacing="0.05em"
            onClick={() => setActiveSidebarTab(tab.value)}
          >
            {tab.label}
          </Box>
        ))}
      </HStack>

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

      {activeSidebarTab === "calendar" ? (
        <>
          <Box
            backgroundColor="white"
            borderRadius={0}
            border="1px solid #E4E0D8"
            padding={4}
            boxShadow="none"
          >
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

          <Box height="1px" backgroundColor="rgba(17, 17, 17, 0.08)" />

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
        </>
      ) : (
        <Box
          border="1px solid #E4E0D8"
          padding={4}
          backgroundColor="#FFFFFF"
          borderRadius={0}
        >
          <Text fontSize="sm" color="#666666">
            {t("sidebarTabPlaceholder")}
          </Text>
        </Box>
      )}
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
      marginTop={6}
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
      fontFamily="'IBM Plex Mono', monospace"
      fontSize="xl"
      fontWeight="700"
      color="#111111"
    >
      {value}
    </Text>
  </Box>
);

const BrutalistButton = ({ children }: { children: React.ReactNode }) => (
  <Box
    as="button"
    border="1px solid #111111"
    paddingY={2}
    paddingX={4}
    borderRadius={0}
    backgroundColor="#FFFFFF"
    fontSize="sm"
    fontWeight="600"
    letterSpacing="0.05em"
    _hover={{ backgroundColor: "#F5F2EA" }}
  >
    {children}
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
