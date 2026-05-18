export default function UnsubscribedPage() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[#F8F9FB] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-8 text-center">
        <h1 className="text-2xl font-bold text-clinical-navy mb-3">Unsubscribed</h1>
        <p className="text-slate-600 leading-relaxed">
          You've been unsubscribed from the Greenlit MD waitlist.
        </p>
      </div>
    </main>
  );
}
