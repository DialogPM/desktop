import { Loader } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useLocale } from "../../lib/hooks";
import { MediaImg } from "../../components/MediaImg";
import type { Message } from "../../lib/types";
import { FileCard } from "../conversation/Attachments";
import { useLightbox } from "../conversation/uiStore";

function useMedia(conversationId: string, kind: "media" | "files") {
  const [list, setList] = useState<Message[] | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .listMedia({ conversation_id: conversationId, kind, limit: 200 })
      .then((m) => alive && setList(m))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [conversationId, kind]);
  return list;
}

function MediaTab({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const list = useMedia(conversationId, "media");
  const open = useLightbox((s) => s.open);
  if (!list) return <Loader m="xl" />;
  const items = list.flatMap((m) => m.attachments.filter((a) => a.mime.startsWith("image/") || a.mime.startsWith("video/")).map((a, i) => ({ m, a, i })));
  if (!items.length) return <div className="list-empty">{t("info.noMedia")}</div>;
  return (
    <div className="media-grid">
      {items.map(({ m, a, i }) => (
        <button type="button" key={a.id} onClick={() => a.local_path && a.mime.startsWith("image/") && open(m, i)} aria-label={a.file_name}>
          {a.mime.startsWith("video/") && !a.thumbnail && !a.local_path ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)" }}>
              <Icon name="play" size={24} />
            </span>
          ) : (
            <MediaImg path={a.local_path} fallback={a.thumbnail} mime={a.mime} loading="lazy" style={a.local_path ? undefined : { filter: "blur(6px)" }} />
          )}
        </button>
      ))}
    </div>
  );
}

function FilesTab({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const list = useMedia(conversationId, "files");
  if (!list) return <Loader m="xl" />;
  if (!list.length) return <div className="list-empty">{t("info.noFiles")}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 16px" }}>
      {list.map((m) =>
        m.attachments.map((a) => (
          <div key={a.id} style={{ padding: "6px 10px", borderRadius: 12, background: "var(--sunk)" }}>
            <FileCard message={m} a={a} />
            <div className="hint" style={{ fontSize: 11.5, paddingLeft: 2 }}>
              {formatDateTime(m.sent_at, locale)}
            </div>
          </div>
        )),
      )}
    </div>
  );
}

export function MediaGallery({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"media" | "files">("media");
  return (
    <>
      <div className="gallery-tabs" role="tablist">
        <button type="button" role="tab" data-active={tab === "media"} aria-selected={tab === "media"} onClick={() => setTab("media")}>
          <Icon name="image" size={16} />
          {t("info.tabMedia")}
        </button>
        <button type="button" role="tab" data-active={tab === "files"} aria-selected={tab === "files"} onClick={() => setTab("files")}>
          <Icon name="file" size={16} />
          {t("info.tabFiles")}
        </button>
      </div>
      <div className="pane-scroll">{tab === "media" ? <MediaTab conversationId={conversationId} /> : <FilesTab conversationId={conversationId} />}</div>
    </>
  );
}
