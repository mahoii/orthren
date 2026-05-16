"use client";

import { useState } from "react";

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authComplete, setAuthComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [updateSubject, setUpdateSubject] = useState("");
  const [updateHeadline, setUpdateHeadline] = useState("");
  const [updateBullets, setUpdateBullets] = useState(""); // comma separated
  const [updateScreenshot, setUpdateScreenshot] = useState("");

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (secret.trim()) setAuthComplete(true);
  }

  async function handleSendUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setMessage("Sending update...");

    try {
      const res = await fetch("/api/admin/send-update", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({
          subject: updateSubject,
          headline: updateHeadline,
          bullets: updateBullets.split("\n").filter((b) => b.trim() !== ""),
          screenshot_url: updateScreenshot || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(`Success: Sent to ${data.sent} subscribers. Failed: ${data.failed}.`);
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSendLaunch(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    if (!confirm("Are you sure you want to send the launch email to all unnotified subscribers?")) return;
    
    setIsLoading(true);
    setMessage("Sending launch email...");

    try {
      const res = await fetch("/api/admin/send-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(`Success: Sent launch email to ${data.sent} subscribers. Failed: ${data.failed}.`);
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  }

  if (!authComplete) {
    return (
      <main className="min-h-screen bg-[#F8F9FB] flex items-center justify-center p-6">
        <form onSubmit={handleAuth} className="bg-white p-8 rounded-xl shadow-sm border border-[#E2E8F0] max-w-sm w-full">
          <h1 className="text-xl font-bold mb-4 text-clinical-navy">Admin Access</h1>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter ADMIN_SECRET"
            className="w-full rounded-md border border-clinical-line px-3 py-3 text-sm outline-none focus:border-clinical-blue mb-4"
          />
          <button type="submit" className="w-full bg-clinical-navy text-white rounded-md py-3 text-sm font-semibold hover:bg-clinical-blue">
            Authenticate
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F9FB] p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-clinical-navy">Waitlist Admin</h1>

        {message && (
          <div className="p-4 rounded-md border border-clinical-blue bg-blue-50 text-clinical-navy text-sm font-medium">
            {message}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          <section className="bg-white p-6 rounded-xl shadow-sm border border-[#E2E8F0]">
            <h2 className="text-xl font-bold text-clinical-navy mb-4">Send Monthly Update</h2>
            <form onSubmit={handleSendUpdate} className="space-y-4">
              <input
                type="text"
                required
                placeholder="Email Subject"
                value={updateSubject}
                onChange={(e) => setUpdateSubject(e.target.value)}
                className="w-full rounded-md border border-clinical-line px-3 py-2 text-sm"
              />
              <input
                type="text"
                required
                placeholder="Headline (H1)"
                value={updateHeadline}
                onChange={(e) => setUpdateHeadline(e.target.value)}
                className="w-full rounded-md border border-clinical-line px-3 py-2 text-sm"
              />
              <textarea
                required
                placeholder="Bullet points (one per line)"
                value={updateBullets}
                onChange={(e) => setUpdateBullets(e.target.value)}
                className="w-full rounded-md border border-clinical-line px-3 py-2 text-sm h-32"
              />
              <input
                type="url"
                placeholder="Screenshot URL (optional)"
                value={updateScreenshot}
                onChange={(e) => setUpdateScreenshot(e.target.value)}
                className="w-full rounded-md border border-clinical-line px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-clinical-navy text-white rounded-md py-2 text-sm font-semibold disabled:opacity-50 hover:bg-clinical-blue"
              >
                Send to All Subscribers
              </button>
            </form>
          </section>

          <section className="bg-white p-6 rounded-xl shadow-sm border border-[#E2E8F0]">
            <h2 className="text-xl font-bold text-clinical-navy mb-4">Send Launch Email</h2>
            <p className="text-sm text-slate-600 mb-6">
              This will send the final "We are live" email to all waitlist subscribers who have an email_stage of 1. Their stage will be updated to 3 after sending.
            </p>
            <button
              onClick={handleSendLaunch}
              disabled={isLoading}
              className="w-full bg-green-600 text-white rounded-md py-3 text-sm font-semibold disabled:opacity-50 hover:bg-green-700 transition"
            >
              🚀 Send Launch Notification
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
