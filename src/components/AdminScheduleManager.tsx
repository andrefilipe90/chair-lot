import {
  Box,
  Button,
  Checkbox,
  HStack,
  Icon,
  IconButton,
  Table,
  Text,
  VStack,
  chakra,
} from "@chakra-ui/react";
import { DeskScheduleStatus } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { useTranslations } from "next-intl";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { FiEdit2, FiTrash2 } from "react-icons/fi";

import { type RouterOutput, trpc } from "../utils/trpc";
import { toaster } from "./ui/toaster";

type DeskSchedule =
  RouterOutput["schedule"]["getDeskSchedulesForDay"]["deskSchedules"][number];

type DeskInOffice =
  RouterOutput["schedule"]["getDeskSchedulesForDay"]["desksInCurrentOffice"][number];

type ReservationFormState = {
  userId: string;
  deskId: string;
  wholeDay: boolean;
  startHour: number;
  endHour: number;
};

type AdminScheduleManagerProps = {
  formattedDay: string;
  timeZone: string;
  timeFormatter: Intl.DateTimeFormat;
  deskSchedules: RouterOutput["schedule"]["getDeskSchedulesForDay"]["deskSchedules"];
  desks: RouterOutput["schedule"]["getDeskSchedulesForDay"]["desksInCurrentOffice"];
  onRefresh: () => Promise<void> | void;
};

const InlineSelect = chakra("select");

const hours = Array.from({ length: 24 }, (_, index) => index);

const toHour = (date: Date | null | undefined, timeZone: string) => {
  if (!date) return 0;
  return Number(formatInTimeZone(date, timeZone, "H"));
};

const formatDeskIdentifier = (value: string) => {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(3, "0");
  }
  return trimmed;
};

const getDeskLabel = (
  desk: DeskInOffice,
  t: ReturnType<typeof useTranslations>,
) => {
  const floorName = desk.floor?.name;
  const rawDeskLabel = desk.publicDeskId || desk.name || desk.id;
  const deskLabel = formatDeskIdentifier(String(rawDeskLabel));
  if (!floorName) {
    return t("deskName", { deskId: deskLabel });
  }
  return t("floorDeskName", {
    floorName,
    deskId: deskLabel,
  });
};

const ReservationForm = (props: {
  title: string;
  state: ReservationFormState;
  onChange: (nextState: ReservationFormState) => void;
  users: { id: string; label: string }[];
  desks: DeskInOffice[];
  onSubmit: () => void;
  isSubmitting: boolean;
  submitLabel: string;
}) => {
  const {
    title,
    state,
    onChange,
    users,
    desks,
    onSubmit,
    isSubmitting,
    submitLabel,
  } = props;
  const t = useTranslations("SchedulePages");

  const handleUserChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...state, userId: event.target.value });
  };

  const handleDeskChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...state, deskId: event.target.value });
  };

  const handleStartChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...state, startHour: Number(event.target.value) });
  };

  const handleEndChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...state, endHour: Number(event.target.value) });
  };

  return (
    <Box
      borderWidth="1px"
      borderRadius="md"
      padding={4}
      bg="bg.surface"
      width="100%"
    >
      <Text fontWeight="semibold" color="gray.700" marginBottom={3}>
        {title}
      </Text>
      <VStack alignItems="stretch" gap={3}>
        <Box>
          <FieldLabel>{t("adminSelectUser")}</FieldLabel>
          <InlineSelect
            value={state.userId}
            onChange={handleUserChange}
            width="100%"
            paddingY={2}
            paddingX={3}
            borderRadius="md"
            borderWidth="1px"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </InlineSelect>
        </Box>
        <Box>
          <FieldLabel>{t("adminSelectDesk")}</FieldLabel>
          <InlineSelect
            value={state.deskId}
            onChange={handleDeskChange}
            width="100%"
            paddingY={2}
            paddingX={3}
            borderRadius="md"
            borderWidth="1px"
          >
            {desks.map((desk) => (
              <option key={desk.id} value={desk.id}>
                {getDeskLabel(desk, t)}
              </option>
            ))}
          </InlineSelect>
        </Box>
        <Checkbox.Root
          checked={state.wholeDay}
          onCheckedChange={(details) =>
            onChange({ ...state, wholeDay: Boolean(details.checked) })
          }
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control />
          <Checkbox.Label>{t("adminWholeDay")}</Checkbox.Label>
        </Checkbox.Root>
        {!state.wholeDay && (
          <HStack gap={3} alignItems="flex-end">
            <Box flex="1">
              <FieldLabel>{t("adminStartHour")}</FieldLabel>
              <InlineSelect
                value={String(state.startHour)}
                onChange={handleStartChange}
                width="100%"
                paddingY={2}
                paddingX={3}
                borderRadius="md"
                borderWidth="1px"
              >
                {hours.map((hour) => (
                  <option key={`start-${hour}`} value={hour}>
                    {hour.toString().padStart(2, "0")}:00
                  </option>
                ))}
              </InlineSelect>
            </Box>
            <Box flex="1">
              <FieldLabel>{t("adminEndHour")}</FieldLabel>
              <InlineSelect
                value={String(state.endHour)}
                onChange={handleEndChange}
                width="100%"
                paddingY={2}
                paddingX={3}
                borderRadius="md"
                borderWidth="1px"
              >
                {hours.slice(1).map((hour) => (
                  <option key={`end-${hour}`} value={hour}>
                    {hour.toString().padStart(2, "0")}:00
                  </option>
                ))}
              </InlineSelect>
            </Box>
          </HStack>
        )}
        <Button
          colorPalette="orange"
          backgroundColor="orange.400"
          color="white"
          _hover={{ backgroundColor: "orange.500" }}
          alignSelf="flex-start"
          onClick={onSubmit}
          loading={isSubmitting}
          disabled={users.length === 0 || desks.length === 0}
        >
          {submitLabel}
        </Button>
      </VStack>
    </Box>
  );
};

const FieldLabel = (props: { children: React.ReactNode }) => {
  return (
    <Text fontSize="sm" marginBottom={1} color="gray.600" fontWeight="medium">
      {props.children}
    </Text>
  );
};

export const AdminScheduleManager = (props: AdminScheduleManagerProps) => {
  const {
    formattedDay,
    timeZone,
    timeFormatter,
    deskSchedules,
    desks,
    onRefresh,
  } = props;
  const t = useTranslations("SchedulePages");
  const utils = trpc.useUtils();

  const membersQuery = trpc.user.listMembers.useQuery();
  const adminCreateMutation = trpc.schedule.adminBookDeskForDay.useMutation();
  const adminUpdateMutation =
    trpc.schedule.adminUpdateDeskSchedule.useMutation();
  const cancelMutation = trpc.schedule.cancelDeskForDay.useMutation();

  const memberOptions = useMemo(() => {
    return (membersQuery.data ?? []).map((member) => ({
      id: member.id,
      label: member.name ?? member.email ?? member.id,
    }));
  }, [membersQuery.data]);

  const sortedDesks = useMemo(() => {
    return [...desks].sort((a, b) => {
      const floorComparison = (a.floor?.name ?? "").localeCompare(
        b.floor?.name ?? "",
      );
      if (floorComparison !== 0) return floorComparison;
      const labelA = formatDeskIdentifier(
        String(a.publicDeskId ?? a.name ?? a.id),
      );
      const labelB = formatDeskIdentifier(
        String(b.publicDeskId ?? b.name ?? b.id),
      );
      return labelA.localeCompare(labelB);
    });
  }, [desks]);

  const reservationsForDay = useMemo(() => {
    return deskSchedules.filter((reservation) => {
      const reference =
        reservation.startTime ?? reservation.date ?? reservation.endTime;
      if (!reference) return false;
      return (
        formatInTimeZone(reference, timeZone, "yyyy-MM-dd") === formattedDay
      );
    });
  }, [deskSchedules, formattedDay, timeZone]);

  const defaultUserId = memberOptions[0]?.id ?? "";
  const defaultDeskId = sortedDesks[0]?.id ?? "";

  const [createForm, setCreateForm] = useState<ReservationFormState>({
    userId: defaultUserId,
    deskId: defaultDeskId,
    wholeDay: true,
    startHour: 9,
    endHour: 18,
  });

  const [editReservation, setEditReservation] = useState<DeskSchedule | null>(
    null,
  );
  const [editForm, setEditForm] = useState<ReservationFormState>({
    userId: defaultUserId,
    deskId: defaultDeskId,
    wholeDay: true,
    startHour: 9,
    endHour: 18,
  });

  useEffect(() => {
    if (!sortedDesks.find((desk) => desk.id === createForm.deskId)) {
      setCreateForm((prev) => ({
        ...prev,
        deskId: sortedDesks[0]?.id ?? "",
      }));
    }
  }, [sortedDesks, createForm.deskId]);

  const resetCreateForm = () => {
    setCreateForm({
      userId: defaultUserId,
      deskId: defaultDeskId,
      wholeDay: true,
      startHour: 9,
      endHour: 18,
    });
  };

  const refresh = async () => {
    await onRefresh();
    utils.schedule.getDeskSchedulesForDay.invalidate({ day: formattedDay });
  };

  const handleCreate = async () => {
    if (!createForm.wholeDay && createForm.startHour >= createForm.endHour) {
      toaster.create({
        type: "error",
        title: t("adminErrorGeneric"),
      });
      return;
    }

    try {
      await adminCreateMutation.mutateAsync({
        userId: createForm.userId,
        deskId: createForm.deskId,
        day: formattedDay,
        wholeDay: createForm.wholeDay,
        startHour: createForm.wholeDay ? undefined : createForm.startHour,
        endHour: createForm.wholeDay ? undefined : createForm.endHour,
      });
      toaster.create({
        type: "success",
        title: t("adminSuccessCreateTitle"),
      });
      resetCreateForm();
      await refresh();
    } catch (error) {
      toaster.create({
        type: "error",
        title: t("adminErrorGeneric"),
      });
    }
  };

  const openEditForm = (reservation: DeskSchedule) => {
    setEditReservation(reservation);
    setEditForm({
      userId: reservation.user?.id ?? defaultUserId,
      deskId: reservation.deskId,
      wholeDay: reservation.wholeDay,
      startHour: toHour(reservation.startTime, timeZone),
      endHour: toHour(reservation.endTime, timeZone),
    });
  };

  const handleEdit = async () => {
    if (!editReservation) return;

    if (!editForm.wholeDay && editForm.startHour >= editForm.endHour) {
      toaster.create({
        type: "error",
        title: t("adminErrorGeneric"),
      });
      return;
    }

    try {
      await adminUpdateMutation.mutateAsync({
        deskScheduleId: editReservation.id,
        userId: editForm.userId,
        deskId: editForm.deskId,
        day: formattedDay,
        wholeDay: editForm.wholeDay,
        startHour: editForm.wholeDay ? undefined : editForm.startHour,
        endHour: editForm.wholeDay ? undefined : editForm.endHour,
      });
      toaster.create({
        type: "success",
        title: t("adminSuccessEditTitle"),
      });
      setEditReservation(null);
      await refresh();
    } catch (error) {
      toaster.create({
        type: "error",
        title: t("adminErrorGeneric"),
      });
    }
  };

  const handleCancel = async (reservation: DeskSchedule) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("adminCancelConfirm"))
    ) {
      return;
    }
    try {
      await cancelMutation.mutateAsync({
        deskScheduleId: reservation.id,
        day: formattedDay,
      });
      toaster.create({
        type: "success",
        title: t("adminSuccessCancelTitle"),
      });
      setEditReservation(null);
      await refresh();
    } catch (error) {
      toaster.create({
        type: "error",
        title: t("adminErrorGeneric"),
      });
    }
  };

  return (
    <VStack alignItems="stretch" gap={6}>
      <ReservationForm
        title={t("adminHeading")}
        state={createForm}
        onChange={setCreateForm}
        users={memberOptions}
        desks={sortedDesks}
        onSubmit={handleCreate}
        isSubmitting={adminCreateMutation.isLoading}
        submitLabel={t("adminCreateButton")}
      />

      <Box borderTopWidth="1px" />

      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>{t("adminTableDesk")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("adminTableUser")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("adminTableInterval")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("adminTableStatus")}</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">
              {t("adminTableActions")}
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {reservationsForDay.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan={5}>
                <Text fontSize="sm" color="gray.600">
                  {t("adminNoReservations")}
                </Text>
              </Table.Cell>
            </Table.Row>
          )}
          {reservationsForDay
            .slice()
            .sort((a, b) => {
              const timeA = a.startTime ? a.startTime.getTime() : 0;
              const timeB = b.startTime ? b.startTime.getTime() : 0;
              return timeA - timeB;
            })
            .map((reservation) => {
              const desk = sortedDesks.find(
                (deskItem) => deskItem.id === reservation.deskId,
              );
              const deskLabel = desk
                ? getDeskLabel(desk, t)
                : formatDeskIdentifier(
                    String(reservation.desk?.name ?? reservation.deskId),
                  );
              const userLabel =
                reservation.user?.name ??
                reservation.user?.id ??
                t("adminUnknownUser");
              const intervalLabel = reservation.wholeDay
                ? t("adminWholeDayLabel")
                : `${timeFormatter.format(reservation.startTime!)} - ${timeFormatter.format(
                    reservation.endTime!,
                  )}`;
              const statusLabel =
                reservation.status === DeskScheduleStatus.CHECKED_IN &&
                reservation.checkedInAt
                  ? t("checkInCompletedLabel", {
                      time: timeFormatter.format(reservation.checkedInAt),
                    })
                  : t("badgeLabelBooked");
              const isEditing = editReservation?.id === reservation.id;

              return (
                <>
                  <Table.Row key={reservation.id}>
                    <Table.Cell>{deskLabel}</Table.Cell>
                    <Table.Cell>{userLabel}</Table.Cell>
                    <Table.Cell>{intervalLabel}</Table.Cell>
                    <Table.Cell>{statusLabel}</Table.Cell>
                    <Table.Cell>
                      <HStack justifyContent="flex-end" gap={2}>
                        <IconButton
                          aria-label={t("adminEdit")}
                          size="sm"
                          variant="subtle"
                          onClick={() => openEditForm(reservation)}
                        >
                          <Icon as={FiEdit2} />
                        </IconButton>
                        <IconButton
                          aria-label={t("adminCancel")}
                          size="sm"
                          variant="subtle"
                          colorPalette="red"
                          onClick={() => handleCancel(reservation)}
                          loading={cancelMutation.isLoading}
                        >
                          <Icon as={FiTrash2} />
                        </IconButton>
                      </HStack>
                    </Table.Cell>
                  </Table.Row>
                  {isEditing && (
                    <Table.Row>
                      <Table.Cell colSpan={5}>
                        <VStack alignItems="stretch" gap={3}>
                          <ReservationForm
                            title={t("adminModalTitleEdit")}
                            state={editForm}
                            onChange={setEditForm}
                            users={memberOptions}
                            desks={sortedDesks}
                            onSubmit={handleEdit}
                            isSubmitting={adminUpdateMutation.isLoading}
                            submitLabel={t("adminSave")}
                          />
                          <Button
                            variant="ghost"
                            alignSelf="flex-start"
                            onClick={() => setEditReservation(null)}
                          >
                            {t("close")}
                          </Button>
                        </VStack>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </>
              );
            })}
        </Table.Body>
      </Table.Root>

      {/* Editing form rendered inline */}
    </VStack>
  );
};
