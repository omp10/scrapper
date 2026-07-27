import SavedLeadsView from '../components/SavedLeadsView.tsx'

export default function LeadsPage() {
  return (
    <div className="mx-auto max-w-[1600px] p-4">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <SavedLeadsView />
      </div>
    </div>
  )
}
