import { SegmentedControl } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TextAreaField, TextField, ToggleRow } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { PaneHeader } from "../../components/PaneHeader";
import { UserAvatar } from "../../components/UserAvatar";
import { api } from "../../lib/api";
import { pickedPath, pickFiles, type PickedFile } from "../../lib/platform";
import { attempt, openConversation } from "../../store/actions";
import { setApp, upsertConversation } from "../../store/app";
import { ContactPicker } from "./ContactPicker";
import { DISAPPEARING_OPTIONS } from "../../lib/messageText";
import { useDefaultTimer } from "../../lib/defaultTimer";

export function NewGroupPane() {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2>(1);
  const [members, setMembers] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  // Preselects the default timer for new chats (Settings → Privacy).
  const [timer, setTimer] = useState(() => String(useDefaultTimer.getState().seconds));
  const [showMembers, setShowMembers] = useState(true);
  const [firstNames, setFirstNames] = useState(false);

  const create = async () => {
    setBusy(true);
    const conv = await attempt(() =>
      api.createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        member_account_ids: members,
        avatar_path: avatar ? pickedPath(avatar) : undefined,
        settings: { disappearing_seconds: Number(timer), hide_members: !showMembers, member_names: firstNames ? "first_name" : "number" },
      }),
    );
    setBusy(false);
    if (!conv) return;
    upsertConversation(conv);
    setApp({ sidebar: "chats", chatFilter: "all" });
    openConversation(conv.id);
  };

  if (step === 1) {
    return (
      <>
        <PaneHeader
          title={
            <span>
              {t("newGroup.title")}
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500, marginLeft: 8 }}>{t("newGroup.selected", { count: members.length })}</span>
            </span>
          }
          onBack={() => setApp({ sidebar: "chats" })}
        />
        <div className="pane-scroll">
          <ContactPicker selected={members} onChange={setMembers} />
        </div>
        <div className="pane-footer">
          <button type="button" className="btn btn-primary" data-size="md" style={{ width: "100%" }} disabled={members.length === 0} onClick={() => setStep(2)}>
            {t("common.next")}
            <Icon name="chevron" size={18} />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <PaneHeader title={t("newGroup.details")} onBack={() => setStep(1)} />
      <div className="pane-scroll">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "24px 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="avatar-edit"
              onClick={async () => {
                const [f] = await pickFiles({ kind: "image" });
                if (f) setAvatar(f);
              }}
              aria-label={t("profile.changePhoto")}
            >
              <UserAvatar name={name || "#"} path={avatar?.url} seed="new-group" size={96} group />
              <span className="avatar-edit-badge" style={{ width: 34, height: 34 }}>
                <Icon name="camera" size={16} />
              </span>
            </button>
            <div className="hint">{t("newGroup.photoOptional")}</div>
          </div>
          <TextField label={t("group.name")} value={name} onChange={(e) => setName(e.currentTarget.value)} maxLength={80} autoFocus required />
          <TextAreaField
            label={t("group.description")}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            rows={3}
            maxLength={500}
          />
          <div className="hint">{t("newGroup.membersCount", { count: members.length })}</div>
          <div className="group-rules">
            <div className="sect-label">{t("groupRules.title")}</div>
            <div className="group-rules-field">
              <div className="toggle-label">{t("disappearing.title")}</div>
              <div className="toggle-sub">{t("groupRules.timerHint")}</div>
              <SegmentedControl
                fullWidth
                size="xs"
                value={timer}
                onChange={setTimer}
                data={DISAPPEARING_OPTIONS.map(([s, key]) => ({ value: String(s), label: t(`disappearing.${key}`) }))}
              />
            </div>
            <ToggleRow label={t("groupRules.showMembers")} sub={t("groupRules.showMembersHint")} on={showMembers} onToggle={() => setShowMembers(!showMembers)} />
            <ToggleRow label={t("groupRules.firstNames")} sub={t("groupRules.firstNamesHint")} on={firstNames} onToggle={() => setFirstNames(!firstNames)} />
          </div>
          <button type="button" className="btn btn-primary" data-size="md" onClick={create} disabled={!name.trim() || busy}>
            <Icon name="check" size={18} />
            {t("newGroup.create")}
          </button>
        </div>
      </div>
    </>
  );
}
