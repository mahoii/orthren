"use client";

interface ScrollButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export default function ScrollButton({ className, children }: ScrollButtonProps) {
  return (
    <button
      onClick={() =>
        document.getElementById("waitlist-form")?.scrollIntoView({ behavior: "smooth" })
      }
      className={className}
    >
      {children || "Request Early Access →"}
    </button>
  );
}
