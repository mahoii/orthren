"use client";

export default function SignOutButton() {
  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button
      onClick={handleSignOut}
      className="rounded-md border border-[#CBD5E1] px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
    >
      Sign out
    </button>
  );
}
