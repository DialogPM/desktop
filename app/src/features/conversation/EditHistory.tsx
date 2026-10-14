// "Edit history" dialog: every version of an edited message, oldest first.

import { Loader, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useLocale } from "../../lib/hooks";
import type { EditVersion } from "../../lib/types";

export function EditHistoryList({ id }: { id: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [versions, setVersions] = useState<EditVersion[] | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getEditHistory({ message_id: id })
      .then((v) => alive && setVersions(v))
      .catch(() => alive && setVersions([]));
    return () => {
      alive = false;
    };
  }, [id]);

  if (!versions) return <Loader m="lg" />;
  return (
    <Stack gap="sm">
      {[...versions].reverse().map((v, i) => (
        <div key={`${v.at}-${i}`}>
          <Text size="xs" c="dimmed">
            {formatDateTime(v.at, locale)}
            {i === 0 ? ` · ${t("message.editCurrent")}` : ""}
          </Text>
          <Text size="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} dir="auto">
            {v.text}
          </Text>
        </div>
      ))}
    </Stack>
  );
}
