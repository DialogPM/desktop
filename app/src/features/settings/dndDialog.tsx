import { modals } from "@mantine/modals";
import { OptionsDialog } from "../../components/OptionsDialog";
import i18n from "../../i18n";
import { DND_CHOICES, dndActive, dndUntil, setDnd, type DndChoice } from "../../lib/dnd";
import { attempt, notifyOk } from "../../store/actions";

/** Picks how long do not disturb stays on, then turns it on. */
export function openDndDialog() {
  const t = i18n.t.bind(i18n);
  modals.open({
    title: t("dnd.title"),
    children: (
      <OptionsDialog
        description={t("dnd.description")}
        initial="1h"
        options={DND_CHOICES.map((c) => ({ value: c, label: t(`dnd.choice.${c}`) }))}
        confirmLabel={t("dnd.turnOn")}
        onConfirm={(v) =>
          void attempt(async () => {
            await setDnd(dndUntil(v as DndChoice));
            notifyOk(t("dnd.enabled"));
          })
        }
      />
    ),
  });
}

/** Quick toggle: off when on, otherwise asks for how long. */
export function toggleDnd() {
  if (!dndActive()) {
    openDndDialog();
    return;
  }
  void attempt(async () => {
    await setDnd(0);
    notifyOk(i18n.t("dnd.disabled"));
  });
}
