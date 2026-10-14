import { Button, Group, Loader, Modal, Stack, Text, TextInput } from "@mantine/core";
import { IconCurrentLocation } from "@tabler/icons-react";
import { Icon } from "../../components/Icon";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "../../lib/hooks";
import { sendMessage } from "../../store/actions";

const PickerMap = lazy(() => import("./maps").then((m) => ({ default: m.PickerMap })));

type Point = { lat: number; lng: number };

export function LocationPicker({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const [point, setPoint] = useState<Point | null>(null);
  const [focus, setFocus] = useState<Point | null>(null);
  const [name, setName] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const geoAvailable = typeof navigator !== "undefined" && "geolocation" in navigator;

  const locate = () => {
    if (!geoAvailable) return;
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPoint(p);
        setFocus(p);
        setLocating(false);
      },
      () => {
        setGeoError(t("location.unavailable"));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  // Try the current position once when the picker opens.
  useEffect(() => {
    if (!geoAvailable) return;
    let alive = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!alive) return;
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPoint((cur) => cur ?? p);
        setFocus(p);
      },
      () => undefined,
      { timeout: 8000, maximumAge: 300_000 },
    );
    return () => {
      alive = false;
    };
  }, [geoAvailable]);

  const send = async () => {
    if (!point) return;
    setSending(true);
    await sendMessage({
      conversation_id: conversationId,
      location: { lat: point.lat, lng: point.lng, name: name.trim() || null, address: null },
    });
    setSending(false);
    onClose();
  };

  return (
    <Modal opened onClose={onClose} title={t("location.title")} size="lg" fullScreen={mobile}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t("location.hint")}
        </Text>
        <Suspense fallback={<div className="picker-map" style={{ display: "grid", placeItems: "center" }}><Loader /></div>}>
          <PickerMap point={point} focus={focus} onPick={(lat, lng) => setPoint({ lat, lng })} />
        </Suspense>
        {geoAvailable && (
          <Button variant="light" leftSection={<IconCurrentLocation size={18} />} onClick={locate} loading={locating}>
            {t("location.useCurrent")}
          </Button>
        )}
        {geoError && (
          <Text size="sm" c="orange">
            {geoError}
          </Text>
        )}
        <TextInput
          label={t("location.name")}
          placeholder={t("location.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          maxLength={80}
        />
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : t("location.noPoint")}
          </Text>
          <Button leftSection={<Icon name="send" size={17} />} onClick={send} disabled={!point} loading={sending}>
            {t("location.send")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
