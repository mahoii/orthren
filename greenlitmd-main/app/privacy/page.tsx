export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-clinical-navy mb-6">Privacy Policy</h1>
      <p className="text-slate-600 text-sm leading-7 mb-4">
        Orthren is committed to strict data minimization. We do not store, log, or persist any Protected Health Information (PHI) contained within uploaded patient charts.
      </p>
      <p className="text-slate-600 text-sm leading-7 mb-4">
        All document extraction and generation occurs in temporary server memory and is immediately destroyed upon the completion of your request.
      </p>
      <p className="text-slate-600 text-sm leading-7">
        The only data retained by Orthren is standard user account information (such as email addresses) required for authentication and waitlist communications. We do not sell your data to third parties.
      </p>
    </main>
  )
}