import { ActionIcon, Button, Group, Image, Modal, ScrollArea, SimpleGrid, Stack, Text, Textarea, Tooltip } from "@mantine/core";
import { IconMovie } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { formatBytes } from "../../lib/format";
import { useIsMobile, useLocale } from "../../lib/hooks";
import { pickFiles, toOutgoingAttachment, type PickedFile } from "../../lib/platform";
import type { OutgoingAttachment } from "../../lib/types";
import { sendMessage } from "../../store/actions";
import { useApp } from "../../store/app";
import { FileIcon } from "./Attachments";
import { ImageAnnotator } from "./ImageAnnotator";
import { imageAttachment, isImageFile as isImg, isVideoFile as isVid, rejectTooBig, releasePicked } from "./outgoingMedia";
import { useSendMedia } from "./uiStore";
import { ViewOnceIcon } from "./ViewOnceViewer";

export function SendMediaModal() {
  const { conversationId, files } = useSendMedia();
  if (!conversationId || !files.length) return null;
  return <SendMediaInner key={conversationId} />;
}

function SendMediaInner() {
  const { t } = useTranslation();
  const locale = useLocale();
  const mobile = useIsMobile();
  const { conversationId, files, mode, close, setFiles } = useSendMedia();
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);
  const [viewOnceOn, setViewOnce] = useState(false);
  // Image being annotated (index into `files`).
  const [annotating, setAnnotating] = useState<number | null>(null);
  // View once: exactly one photo or video, without a caption.
  const viewOnceAllowed = mode === "media" && files.length === 1 && (isImg(files[0]) || isVid(files[0]));
  const viewOnce = viewOnceOn && viewOnceAllowed;
  const title = useApp((s) => s.conversations[conversationId ?? ""]?.title ?? "");

  const send = async () => {
    if (!conversationId) return;
    if (rejectTooBig(files, t, locale)) return;
    setSending(true);
    try {
      if (viewOnce) {
        const f = files[0];
        const att = isImg(f) ? await imageAttachment(f) : await toOutgoingAttachment(f, "video");
        await sendMessage({ conversation_id: conversationId, attachments: [att], view_once: true });
        close();
        return;
      }
      const text = caption.trim() || undefined;
      const images = mode === "media" ? files.filter(isImg) : [];
      const videos = mode === "media" ? files.filter(isVid) : [];
      const others = files.filter((f) => !images.includes(f) && !videos.includes(f));
      let captionUsed = false;
      if (images.length) {
        const atts: OutgoingAttachment[] = [];
        for (const f of images) atts.push(await imageAttachment(f));
        await sendMessage({ conversation_id: conversationId, text, attachments: atts });
        captionUsed = true;
      }
      for (const f of videos) {
        await sendMessage({
          conversation_id: conversationId,
          text: captionUsed ? undefined : text,
          attachments: [await toOutgoingAttachment(f, "video")],
        });
        captionUsed = true;
      }
      for (const f of others) {
        await sendMessage({
          conversation_id: conversationId,
          text: captionUsed ? undefined : text,
          attachments: [await toOutgoingAttachment(f, "file")],
        });
        captionUsed = true;
      }
      close();
    } finally {
      setSending(false);
    }
  };

  const addMore = async () => {
    const more = await pickFiles({ kind: mode === "media" ? "media" : "any", multiple: true });
    if (more.length) setFiles([...files, ...more]);
  };

  const remove = (f: PickedFile) => {
    const next = files.filter((x) => x !== f);
    if (next.length) setFiles(next);
    else close();
  };

  return (
    <Modal
      opened
      onClose={close}
      title={t("composer.sendTo", { name: title })}
      size="lg"
      fullScreen={mobile}
      // The annotation editor sits above the modal and handles Esc / clicks itself.
      closeOnEscape={annotating === null}
      closeOnClickOutside={annotating === null}
      trapFocus={annotating === null}
    >
      <Stack>
        <ScrollArea.Autosize mah={mobile ? "60dvh" : 420}>
          {mode === "media" ? (
            <SimpleGrid cols={files.length === 1 ? 1 : { base: 2, sm: 3 }} spacing="xs">
              {files.map((f, i) => (
                <div key={i} style={{ position: "relative" }}>
                  {isImg(f) ? (
                    <Image src={f.url} radius={12} h={files.length === 1 ? 320 : 140} fit={files.length === 1 ? "contain" : "cover"} alt={f.name} />
                  ) : (
                    <Stack h={140} align="center" justify="center" bg="var(--sunk)" style={{ borderRadius: 12 }} gap={4}>
                      <IconMovie size={36} />
                      <Text size="xs" className="truncate" maw="90%">
                        {f.name}
                      </Text>
                    </Stack>
                  )}
                  <ActionIcon
                    variant="filled"
                    color="dark"
                    radius="xl"
                    size="sm"
                    style={{ position: "absolute", top: 6, right: 6 }}
                    onClick={() => remove(f)}
                    aria-label={t("common.remove")}
                  >
                    <Icon name="x" size={14} />
                  </ActionIcon>
                  {isImg(f) && (
                    <Tooltip label={t("annotate.title")}>
                      <ActionIcon
                        variant="filled"
                        color="dark"
                        radius="xl"
                        size="sm"
                        style={{ position: "absolute", top: 6, left: 6 }}
                        onClick={() => setAnnotating(i)}
                        aria-label={t("annotate.title")}
                      >
                        <Icon name="edit" size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </div>
              ))}
            </SimpleGrid>
          ) : (
            <Stack gap="xs">
              {files.map((f, i) => (
                <Group key={i} wrap="nowrap" className="file-card" style={{ width: "100%", background: "var(--sunk)", borderRadius: 12, padding: "8px 10px" }}>
                  <FileIcon name={f.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={600} className="truncate">
                      {f.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {f.size !== null ? formatBytes(f.size, locale) : f.mime}
                    </Text>
                  </div>
                  <ActionIcon onClick={() => remove(f)} aria-label={t("common.remove")}>
                    <Icon name="x" size={16} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          )}
        </ScrollArea.Autosize>
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <button type="button" className="composer-round" style={{ background: "var(--sunk)" }} onClick={addMore} aria-label={t("composer.addMore")}>
            <Icon name="plus" size={20} />
          </button>
          {mode === "media" && (
            <Tooltip label={viewOnceAllowed ? (viewOnce ? t("viewOnce.toggleOn") : t("viewOnce.toggle")) : t("viewOnce.onlyOne")} multiline maw={260}>
              <button
                type="button"
                className="composer-round"
                style={{
                  background: viewOnce ? "var(--accent)" : "var(--sunk)",
                  color: viewOnce ? "var(--on-accent)" : undefined,
                  opacity: viewOnceAllowed ? 1 : 0.45,
                }}
                disabled={!viewOnceAllowed}
                aria-pressed={viewOnce}
                aria-label={t("viewOnce.toggle")}
                onClick={() => {
                  const on = !viewOnce;
                  setViewOnce(on);
                  if (on) setCaption("");
                }}
              >
                <ViewOnceIcon size={20} />
              </button>
            </Tooltip>
          )}
          <Textarea
            style={{ flex: 1 }}
            placeholder={viewOnce ? t("viewOnce.noCaption") : t("composer.caption")}
            disabled={viewOnce}
            value={viewOnce ? "" : caption}
            autosize
            minRows={1}
            maxRows={4}
            data-autofocus
            onChange={(e) => setCaption(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !mobile) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button size="md" radius="xl" h={44} onClick={send} loading={sending} leftSection={<Icon name="send" size={17} />}>
            {files.length > 1 ? `${t("composer.send")} (${files.length})` : t("composer.send")}
          </Button>
        </Group>
      </Stack>
      {annotating !== null && files[annotating] && (
        <ImageAnnotator
          file={files[annotating]}
          onClose={() => setAnnotating(null)}
          onSave={(edited) => {
            releasePicked(files[annotating]);
            setFiles(files.map((f, i) => (i === annotating ? edited : f)));
            setAnnotating(null);
          }}
        />
      )}
    </Modal>
  );
}
