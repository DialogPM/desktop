// "Effects" button of the call screens: picks a live voice effect and turns the AI noise
// reduction on or off (lib/voiceFx.ts). The choice applies at once and only to this call.

import { Menu } from "@mantine/core";
import { IconCheck, IconSparkles, IconWaveSine } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { VOICE_EFFECT_EMOJI, VOICE_EFFECTS, type VoiceEffect } from "../../lib/voiceFx";

interface Props {
  effect: VoiceEffect;
  denoise: boolean;
  onChange: (change: { effect?: VoiceEffect; denoise?: boolean }) => void;
  disabled?: boolean;
}

export function VoiceFxButton({ effect, denoise, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const on = effect !== "none" || denoise;
  const label = effect !== "none" ? `${VOICE_EFFECT_EMOJI[effect]} ${t(`voiceFx.${effect}`)}` : denoise ? t("voiceFx.denoiseShort") : t("voiceFx.button");
  return (
    // Above the call screen (z-index 400).
    <Menu position="top" withinPortal zIndex={1000} shadow="md" disabled={disabled}>
      <Menu.Target>
        <button type="button" className="call-btn" data-tone="soft" data-on={on} disabled={disabled} aria-label={t("voiceFx.button")}>
          <IconSparkles size={24} stroke={1.8} />
          <span>{label}</span>
        </button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconWaveSine size={18} />}
          rightSection={denoise ? <IconCheck size={16} /> : null}
          onClick={() => onChange({ denoise: !denoise })}
          aria-checked={denoise}
          closeMenuOnClick={false}
        >
          {t("voiceFx.denoise")}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>{t("voiceFx.title")}</Menu.Label>
        {VOICE_EFFECTS.map((e) => (
          <Menu.Item
            key={e}
            leftSection={<span style={{ fontSize: 18 }}>{VOICE_EFFECT_EMOJI[e]}</span>}
            onClick={() => onChange({ effect: e })}
            style={e === effect ? { fontWeight: 700 } : undefined}
            aria-checked={e === effect}
          >
            {t(`voiceFx.${e}`)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
