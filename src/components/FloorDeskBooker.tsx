import {
  Box,
  Button,
  CloseButton,
  Drawer,
  Field,
  HStack,
  Icon,
  IconButton,
  Portal,
  Stack,
  Switch,
  Text,
  chakra,
} from "@chakra-ui/react";
import { Prisma } from "@prisma/client";
import { differenceInMinutes, formatISO } from "date-fns";
import { useTranslations } from "next-intl";
import { ChangeEvent, useEffect, useState } from "react";
import { FiMinus, FiPlus, FiX } from "react-icons/fi";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import {
  DeskWithPeriods,
  FreeDesksWithTime,
} from "../server/scheduling/getFreeDesksPerDay";
import { trpc } from "../utils/trpc";
import { toaster } from "./ui/toaster";
import { Tooltip } from "./ui/tooltip";

type Floor = Prisma.FloorGetPayload<undefined>;

type FloorDeskBookerProps = {
  floor: Floor;
  deskSchedulesMapped: FreeDesksWithTime;
  userId: string;
  day: Date;
  dayStart: Date;
  dayEnd: Date;
};

const HourSelect = chakra("select");
const FieldLabel = chakra("label");
type DeskPeriod = DeskWithPeriods["freePeriods"][number];

export const FloorDeskBooker = (props: FloorDeskBookerProps) => {
  const t = useTranslations("SchedulePages");
  const { floor, deskSchedulesMapped, userId, day, dayStart, dayEnd } = props;
  const [selectedDeskWithPeriods, setSelectedDeskWithPeriods] =
    useState<DeskWithPeriods | null>(null);
  const bookDeskMutation = trpc.schedule.bookDeskForDay.useMutation({});
  const [isImageLoaded, setIsImageLoaded] = useState<boolean>(false);
  const utils = trpc.useUtils();
  const [isBookingDrawerOpen, setIsBookingDrawerOpen] =
    useState<boolean>(false);
  const [isWholeDayBooking, setIsWholeDayBooking] = useState<boolean>(true);
  const [startHour, setStartHour] = useState<number>(0);
  const [endHour, setEndHour] = useState<number>(24);
  const [requiresTimeSelection, setRequiresTimeSelection] =
    useState<boolean>(false);
  const [renderInitialDesks, setRenderInitialDesks] = useState<boolean>(false);
  const [imageRef, setImageRef] = useState<HTMLImageElement | null>(null);

  const formattedDate = formatISO(day, { representation: "date" });
  const startHourOptions = Array.from({ length: 24 }, (_, index) => index);
  const endHourOptions = Array.from({ length: 24 }, (_, index) => index + 1);
  const formatHourLabel = (hour: number) =>
    `${String(hour).padStart(2, "0")}:00`;
  const dayStartDate = new Date(dayStart);
  const dayEndDate = new Date(dayEnd);
  const totalMinutes = Math.max(
    0,
    differenceInMinutes(dayEndDate, dayStartDate),
  );
  const clampRelativeMinutes = (value: Date) => {
    if (value <= dayStartDate) {
      return 0;
    }
    if (value >= dayEndDate) {
      return totalMinutes;
    }
    return differenceInMinutes(value, dayStartDate);
  };
  const normalizePeriod = (period: DeskPeriod) => {
    const startMinutes = clampRelativeMinutes(new Date(period.start));
    const endMinutesRaw = clampRelativeMinutes(new Date(period.end));
    const adjustedEndMinutes = Math.min(
      totalMinutes,
      Math.max(startMinutes + 60, endMinutesRaw),
    );

    if (adjustedEndMinutes - startMinutes >= 24 * 60) {
      return {
        startHour: 0,
        endHour: 24,
      };
    }

    const normalizedStartHour = Math.min(
      23,
      Math.max(0, Math.floor(startMinutes / 60)),
    );
    const normalizedEndHour = Math.max(
      normalizedStartHour + 1,
      Math.min(24, Math.ceil(adjustedEndMinutes / 60)),
    );

    return {
      startHour: normalizedStartHour,
      endHour: normalizedEndHour,
    };
  };
  const handleStartHourChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const hour = Number(event.target.value);
    setStartHour(hour);
    if (endHour <= hour) {
      setEndHour(Math.min(24, hour + 1));
    }
  };
  const handleEndHourChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const hour = Number(event.target.value);
    setEndHour(hour);
    if (hour <= startHour) {
      setStartHour(Math.max(0, hour - 1));
    }
  };
  const formatMinutesLabel = (minutes: number) => {
    const clamped = Math.max(0, Math.min(totalMinutes, minutes));
    const hours = Math.floor(clamped / 60);
    const mins = clamped % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  };
  const formatPeriodLabel = (period: DeskPeriod) => {
    const startMinutes = clampRelativeMinutes(new Date(period.start));
    const endMinutes = clampRelativeMinutes(new Date(period.end));
    if (endMinutes - startMinutes >= 24 * 60) {
      return "00:00 – 24:00";
    }
    return `${formatMinutesLabel(startMinutes)} – ${formatMinutesLabel(endMinutes)}`;
  };

  const resetBookingState = () => {
    setSelectedDeskWithPeriods(null);
    setIsWholeDayBooking(true);
    setStartHour(0);
    setEndHour(24);
    setRequiresTimeSelection(false);
  };
  const handleCloseDrawer = () => {
    setIsBookingDrawerOpen(false);
    resetBookingState();
  };

  const [scale, setScale] = useState<number>(1);

  const desksForFloor = Object.values(deskSchedulesMapped).filter((e) => {
    return e.desk.floor.id === floor.id;
  });

  useEffect(() => {
    if (!floor.floorPlan) {
      return;
    }
    const shouldRenderDesks = imageRef && desksForFloor.length > 0;
    if (!shouldRenderDesks) {
      return;
    }
    if (!isImageLoaded) {
      return;
    }

    if (!imageRef?.complete) {
      return;
    }
    setTimeout(() => {
      setRenderInitialDesks(true);
    }, 500);
  }, [imageRef, desksForFloor, floor, scale, isImageLoaded]);

  if (!floor.floorPlan) {
    return null;
  }

  if (!desksForFloor) {
    return null;
  }

  if (!scale) {
    return;
  }

  const onDeskClick = (deskWithPeriod: DeskWithPeriods) => {
    if (deskWithPeriod.freePeriods.length === 0) {
      toaster.create({
        title: t("noAvailabilityTitle"),
        description: t("noAvailabilityDescription"),
        duration: 4000,
        type: "info",
      });
      return;
    }

    const isMeetingDesk = Boolean(
      deskWithPeriod.desk.name?.toLowerCase().includes("meeting") ||
        deskWithPeriod.desk.description?.toLowerCase().includes("meeting"),
    );
    setRequiresTimeSelection(isMeetingDesk);

    const hasFullDayAvailability = deskWithPeriod.wholeDayFree;

    const [firstFreePeriod] = deskWithPeriod.freePeriods;
    if (!firstFreePeriod) {
      return;
    }

    if (hasFullDayAvailability && !isMeetingDesk) {
      setIsWholeDayBooking(true);
      setStartHour(0);
      setEndHour(24);
    } else {
      const normalizedRange = normalizePeriod(firstFreePeriod);
      setIsWholeDayBooking(false);
      setStartHour(normalizedRange.startHour);
      setEndHour(normalizedRange.endHour);
    }

    setSelectedDeskWithPeriods(deskWithPeriod);

    setIsBookingDrawerOpen(true);
  };

  const deskName =
    selectedDeskWithPeriods?.desk.name ||
    t("deskName", {
      deskId: selectedDeskWithPeriods?.desk.publicDeskId,
    });
  const startHourFieldId = selectedDeskWithPeriods
    ? `start-hour-${selectedDeskWithPeriods.desk.id}`
    : "start-hour";
  const endHourFieldId = selectedDeskWithPeriods
    ? `end-hour-${selectedDeskWithPeriods.desk.id}`
    : "end-hour";
  const isIntervalValid = isWholeDayBooking || endHour > startHour;
  const bookingCtaLabel = isWholeDayBooking
    ? t("bookDeskForDay")
    : t("bookDeskForPeriod");
  const freePeriodsForSelectedDesk = selectedDeskWithPeriods?.freePeriods ?? [];

  return (
    <Box>
      <Drawer.Root
        open={isBookingDrawerOpen}
        placement="end"
        onOpenChange={(details) => {
          if (!details.open) {
            handleCloseDrawer();
          }
        }}
      >
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content>
              <Drawer.Header>
                {t("bookDeskWithName", { deskName })}
              </Drawer.Header>
              <Drawer.Body>
                <Stack gap={4}>
                  <Text>{t("doYouWantToBookIt")}</Text>
                  <Stack gap={3}>
                    <Text fontSize="sm" color="fg.muted">
                      {t("bookingTypeHelper")}
                    </Text>
                    <Switch.Root
                      id="whole-day-toggle"
                      checked={isWholeDayBooking}
                      disabled={requiresTimeSelection}
                      onCheckedChange={(details) => {
                        setIsWholeDayBooking(details.checked);
                      }}
                    >
                      <Switch.HiddenInput />
                      <Switch.Control />
                      <Switch.Label>{t("wholeDayToggleLabel")}</Switch.Label>
                    </Switch.Root>
                    {!isWholeDayBooking && (
                      <HStack gap={3} align="flex-end">
                        <Box flex="1">
                          <FieldLabel
                            htmlFor={startHourFieldId}
                            display="block"
                            fontSize="sm"
                            fontWeight="medium"
                            marginBottom="1"
                          >
                            {t("startHourLabel")}
                          </FieldLabel>
                          <HourSelect
                            id={startHourFieldId}
                            value={startHour}
                            onChange={handleStartHourChange}
                            width="100%"
                            paddingY="2"
                            paddingX="3"
                            borderRadius="md"
                            borderWidth="1px"
                            bg="bg.surface"
                          >
                            {startHourOptions.map((hour) => (
                              <option key={hour} value={hour}>
                                {formatHourLabel(hour)}
                              </option>
                            ))}
                          </HourSelect>
                        </Box>
                        <Box flex="1">
                          <FieldLabel
                            htmlFor={endHourFieldId}
                            display="block"
                            fontSize="sm"
                            fontWeight="medium"
                            marginBottom="1"
                          >
                            {t("endHourLabel")}
                          </FieldLabel>
                          <HourSelect
                            id={endHourFieldId}
                            value={endHour}
                            onChange={handleEndHourChange}
                            width="100%"
                            paddingY="2"
                            paddingX="3"
                            borderRadius="md"
                            borderWidth="1px"
                            bg="bg.surface"
                          >
                            {endHourOptions
                              .filter((hour) => hour > startHour)
                              .map((hour) => (
                                <option key={hour} value={hour}>
                                  {formatHourLabel(hour)}
                                </option>
                              ))}
                          </HourSelect>
                        </Box>
                      </HStack>
                    )}
                    {requiresTimeSelection && (
                      <Text fontSize="sm" color="fg.muted">
                        {t("meetingRoomTimeRequirement")}
                      </Text>
                    )}
                    {!isWholeDayBooking && !isIntervalValid && (
                      <Text fontSize="sm" color="red.500">
                        {t("invalidIntervalWarning")}
                      </Text>
                    )}
                  </Stack>
                  <Stack gap={1}>
                    <Text as="span" fontWeight="medium">
                      {t("availableSlotsLabel")}
                    </Text>
                    {freePeriodsForSelectedDesk.length > 0 ? (
                      <Stack gap={0}>
                        {freePeriodsForSelectedDesk.map((period) => {
                          const periodLabel = formatPeriodLabel(period);
                          return (
                            <Text
                              key={`${period.start.toString()}-${period.end.toString()}`}
                              fontSize="sm"
                              color="fg.muted"
                            >
                              {periodLabel}
                            </Text>
                          );
                        })}
                      </Stack>
                    ) : (
                      <Text fontSize="sm" color="fg.muted">
                        {t("noAvailabilityDescription")}
                      </Text>
                    )}
                  </Stack>
                </Stack>
              </Drawer.Body>
              <Drawer.Footer>
                <Button
                  variant="outline"
                  mr={3}
                  onClick={() => {
                    handleCloseDrawer();
                  }}
                >
                  {t("close")}
                </Button>
                <Button
                  colorPalette="blue"
                  loading={bookDeskMutation.isLoading}
                  disabled={!isIntervalValid}
                  onClick={async () => {
                    if (!selectedDeskWithPeriods) {
                      return;
                    }

                    try {
                      await bookDeskMutation.mutateAsync({
                        deskId: selectedDeskWithPeriods.desk.id,
                        day: formattedDate,
                        ...(isWholeDayBooking
                          ? { wholeDay: true }
                          : {
                              wholeDay: false,
                              startHour,
                              endHour,
                            }),
                      });
                      utils.schedule.getDeskSchedulesForDay.invalidate();
                      handleCloseDrawer();
                    } catch (e) {
                      toaster.create({
                        title: t("errorTitleWhileBooking"),
                        description: t("errorDescriptionWhileBooking"),
                        type: "error",
                        duration: 5000,
                        closable: true,
                      });
                    }
                  }}
                >
                  {bookingCtaLabel}
                </Button>
              </Drawer.Footer>
              <Drawer.CloseTrigger asChild>
                <CloseButton
                  onClick={() => {
                    handleCloseDrawer();
                  }}
                />
              </Drawer.CloseTrigger>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>

      <TransformWrapper
        initialScale={1}
        initialPositionX={0}
        initialPositionY={0}
        onTransformed={(props) => {
          setScale(props.state.scale);
        }}
      >
        {(props) => {
          const { zoomIn, zoomOut, resetTransform } = props;

          return (
            <>
              <Box display={"flex"} flexDirection={"column"}>
                <Box display={"flex"} justifyContent={"space-between"}>
                  <Box>
                    <Field.Root
                      display="flex"
                      alignItems="flex-start"
                      flexDirection={"column"}
                    >
                      <Field.Label htmlFor="zoom-controls" mb="0">
                        {t("zoomControls")}
                      </Field.Label>
                      <HStack id={"zoom-controls"} paddingTop={1}>
                        <IconButton
                          colorPalette="blue"
                          aria-label="zoom in"
                          onClick={() => {
                            zoomIn();
                          }}
                        >
                          <Icon as={FiPlus} />
                        </IconButton>
                        <IconButton
                          colorPalette="blue"
                          aria-label="zoom out"
                          onClick={() => {
                            zoomOut();
                          }}
                        >
                          <Icon as={FiMinus} />
                        </IconButton>
                        <IconButton
                          colorPalette="blue"
                          aria-label="reset zoom"
                          onClick={() => {
                            resetTransform();
                          }}
                        >
                          <Icon as={FiX} />
                        </IconButton>
                      </HStack>
                    </Field.Root>
                  </Box>
                </Box>
              </Box>

              <TransformComponent>
                <Box position={"relative"}>
                  {renderInitialDesks &&
                    imageRef &&
                    desksForFloor.map((deskObject) => {
                      const scale = imageRef.naturalWidth / imageRef.width;
                      const desk = deskObject.desk;

                      const canCancelReservation = deskObject.usedPeriods.some(
                        (period) => {
                          const isWithinSameDay =
                            period.start <= day && period.end >= day;

                          return isWithinSameDay && period.id === userId;
                        },
                      );

                      let borderColor = "green.500";
                      if (!deskObject.wholeDayFree) {
                        borderColor = "red.500";
                      }
                      if (canCancelReservation) {
                        borderColor = "blue.500";
                      }

                      const names = deskObject.usedPeriods
                        .map((period) => period.name)
                        .filter(Boolean);

                      const mappedNames = names
                        .map((fullName) => {
                          if (!fullName) {
                            return "";
                          }
                          const nameParts = fullName.split(" ");
                          let nameRepresentation = "";

                          // Get first the last namePart
                          const lastNamePart = nameParts[nameParts.length - 1];

                          // Get all others
                          const otherNameParts = nameParts.slice(
                            0,
                            nameParts.length - 1,
                          );

                          nameRepresentation += lastNamePart?.slice(0, 2);
                          nameRepresentation += otherNameParts
                            .map((part) => part.slice(0, 1))
                            .join("");
                          return nameRepresentation;
                        })
                        .join(";");

                      const transform = `translate(calc(${desk.x / scale}px - 2px), calc(${
                        desk.y / scale
                      }px - 2px))`;

                      const transformForMapped = `translate(calc(${desk.x / scale}px - 14px), calc(${
                        desk.y / scale
                      }px - 14px))`;

                      type WrapperProps = {
                        children: React.ReactNode;
                      };
                      const Wrapper = (props: WrapperProps) => {
                        if (!mappedNames) {
                          return <>{props.children}</>;
                        }
                        return (
                          <Tooltip content={names.join("; ")}>
                            {props.children}
                          </Tooltip>
                        );
                      };

                      return (
                        <Wrapper key={desk.publicDeskId}>
                          <Box
                            cursor={
                              deskObject.wholeDayFree ? "pointer" : "default"
                            }
                            key={desk.publicDeskId}
                            position={"absolute"}
                            borderRadius={"100%"}
                            display={"flex"}
                            borderWidth={3}
                            borderColor={borderColor}
                            justifyContent={"center"}
                            alignItems={"center"}
                            transform={
                              mappedNames ? transformForMapped : transform
                            }
                            height={mappedNames ? `40px` : `20px`}
                            width={mappedNames ? `40px` : `20px`}
                            backgroundColor={
                              deskObject.wholeDayFree ? "green.50" : "red.50"
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeskClick(deskObject);
                            }}
                            fontWeight={mappedNames ? "bold" : "normal"}
                          >
                            {mappedNames || desk.publicDeskId}
                          </Box>
                        </Wrapper>
                      );
                    })}
                  {floor.floorPlan && (
                    <img
                      ref={(newRef) => {
                        if (newRef) {
                          setImageRef(newRef);
                        }
                      }}
                      onLoad={() => {
                        setIsImageLoaded(true);
                      }}
                      src={floor.floorPlan}
                      alt="test"
                    />
                  )}
                </Box>
              </TransformComponent>
            </>
          );
        }}
      </TransformWrapper>
    </Box>
  );
};
