import { OfficialBadge } from "../../components/OfficialBadge";
import { useApp } from "../../store/app";
import { peerOfficial } from "../../store/selectors";

/** The official badge of the person in a direct conversation (nothing for groups or unknown ids). */
export function ConvOfficialBadge({ conversationId, size }: { conversationId: string; size?: number }) {
  const label = useApp((s) => {
    const c = s.conversations[conversationId];
    return c ? peerOfficial(s, c) : null;
  });
  return <OfficialBadge label={label} size={size} />;
}
