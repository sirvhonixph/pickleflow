"use client";

import TournamentRegisterForm from "@/components/TournamentRegisterForm";

export default function TournamentRegisterModal({
  event,
  user,
  open,
  onClose,
  onSubmit,
  busy,
}) {
  if (!open || !event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold">Register for {event.name}</h2>
            <p className="text-slate-500 text-sm mt-1">
              Complete the form and attach proof of payment.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <TournamentRegisterForm
          event={event}
          user={user}
          onSubmit={onSubmit}
          onCancel={onClose}
          busy={busy}
        />
      </div>
    </div>
  );
}
