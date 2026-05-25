export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-clinical-navy mb-6">Terms of Service</h1>
      <p className="text-slate-600 text-sm leading-7 mb-4">
        Greenlit MD is an AI-assisted documentation tool. All output must be reviewed 
        and approved by a licensed provider before submission to any payer.
      </p>
      <p className="text-slate-600 text-sm leading-7 mb-4">
        Uploaded patient charts are processed in memory only and are never stored, 
        logged, or retained after document generation is complete.
      </p>
      <p className="text-slate-600 text-sm leading-7">
        By using this service you agree that Greenlit MD does not provide medical advice 
        and is not responsible for payer decisions.
      </p>
    </main>
  )
}