import { github } from "../../../wailsjs/go/models";
import { hexLuminance } from "@/lib/utils";

export function LabelBadge({ label }: { label: github.Label }) {
  // GitHub label colors are hex without the #
  const bg = label.color ? `#${label.color}` : undefined;
  // Pick a readable text color based on background luminance.
  const textColor = bg
    ? hexLuminance(bg) > 0.5 ? "#24292f" : "#ffffff"
    : undefined;

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: bg,
        color: textColor,
        border: bg ? `1px solid ${bg}` : undefined,
      }}
    >
      {label.name}
    </span>
  );
}
