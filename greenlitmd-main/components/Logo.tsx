import Image from "next/image";

type LogoSize = "sm" | "md" | "lg";

const sizeMap: Record<LogoSize, { icon: number; text: string }> = {
  sm: { icon: 24, text: "text-base" },
  md: { icon: 32, text: "text-xl" },
  lg: { icon: 48, text: "text-[28px]" },
};

export default function Logo({
  size = "md",
  showWordmark = true,
}: {
  size?: LogoSize;
  showWordmark?: boolean;
}) {
  const { icon, text } = sizeMap[size];
  return (
    <span className="flex items-center gap-2">
      <Image
        src="/orthren-icon.svg"
        alt="Orthren"
        width={icon}
        height={icon}
        className="object-contain"
        style={{ width: icon, height: icon }}
      />
      {showWordmark && (
        <span
          className={`font-bold ${text}`}
          style={{ color: "#1E3A5F", fontFamily: "'DM Sans', sans-serif" }}
        >
          Orthren
        </span>
      )}
    </span>
  );
}
