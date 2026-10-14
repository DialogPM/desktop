import { QRCodeSVG } from "qrcode.react";

/** QR code on a white card (always light, so it stays scannable in dark themes). */
export function QrCode({ value, size = 214 }: { value: string; size?: number }) {
  return (
    <div className="qr-box">
      <QRCodeSVG value={value} size={size} level="M" bgColor="#ffffff" fgColor="#0F2A22" marginSize={0} />
    </div>
  );
}
