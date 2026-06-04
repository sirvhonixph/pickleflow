import AppShell from "@/components/AppShell";

export default function TournamentPage() {
  const categories = [
    "Rookie",
    "Novice Men's Doubles",
    "Novice Women's Doubles",
    "Novice Mixed Doubles",
    "Low Intermediate",
    "High Intermediate",
    "Advanced",
  ];

  return (
    <AppShell>
        <h1 className="text-4xl font-bold mb-8">
          Tournaments
        </h1>

        <div className="bg-slate-900 rounded-xl p-6">
          <h2 className="text-2xl font-bold mb-4">
            Davao Open Tournament
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            {categories.map((cat) => (
              <div
                key={cat}
                className="p-4 bg-slate-800 rounded-lg"
              >
                {cat}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 bg-slate-900 rounded-xl p-6">
          <h2 className="text-2xl font-bold mb-4">
            Bracket Preview
          </h2>

          <div className="border border-slate-700 p-6 rounded-lg">
            Yvonne / Dane
            <br />
            │
            <br />
            ├──── Winner
            <br />
            │
            <br />
            John / Jay
          </div>
        </div>
    </AppShell>
  );
}