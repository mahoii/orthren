import Image from "next/image";

type LogoSize = "sm" | "md" | "lg";

const sizeMap: Record<LogoSize, { icon: number; iconClass: string; text: string }> = {
  sm: { icon: 24, iconClass: "h-6 w-6", text: "text-base" },
  md: { icon: 32, iconClass: "h-8 w-8", text: "text-xl" },
  lg: { icon: 48, iconClass: "h-12 w-12", text: "text-[28px]" },
};

export default function Logo({
  size = "md",
  showWordmark = true,
}: {
  size?: LogoSize;
  showWordmark?: boolean;
}) {
  const { icon, iconClass, text } = sizeMap[size];
  return (
    <span className="flex items-center gap-2">
      <Image
        src="/orthren-icon.svg"
        alt="Orthren"
        width={icon}
        height={icon}
        className={`object-contain ${iconClass}`}
      />
      {showWordmark && (
        <span className={`font-bold font-sans text-clinical-navy ${text}`}>
          Orthren
        </span>
      )}
    </span>
  );
}
