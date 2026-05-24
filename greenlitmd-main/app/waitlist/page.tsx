import Link from "next/link";
import WaitlistForm from "@/components/WaitlistForm";

export default function WaitlistPage() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[#F8F9FB] flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-clinical-navy mb-4">
            Join the Waitlist
          </h1>
          <p className="text-slate-600 leading-relaxed">
            Get early access to the fastest AI prior authorization builder for
            orthopedic practices.
          </p>
        </div>

        <WaitlistForm variant="standalone" />

        <p className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm font-semibold text-clinical-blue hover:text-clinical-navy transition-colors"
          >
            &larr; Back to Greenlit MD
          </Link>
        </p>
      </div>
    </main>
  );
}
