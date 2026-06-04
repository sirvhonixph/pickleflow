import AppShell from "@/components/AppShell";

export default function OpenPlayPage() {
  const queue = [
    "John",
    "Sarah",
    "Dane",
    "Yvonne",
    "Mark",
  ];

  const courts = [
    {
      id: 1,
      teamA: "Yvonne / Dane",
      teamB: "John / Jay",
      score: "11 - 9",
      status: "LIVE",
    },
    {
      id: 2,
      teamA: "Mark / Kent",
      teamB: "Ryan / Paul",
      score: "8 - 6",
      status: "LIVE",
    },
  ];

  return (
    <AppShell>
        <h1 className="text-4xl font-bold mb-8">
          Open Play
        </h1>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 p-6 rounded-xl">
            <h2 className="text-2xl font-bold mb-4">
              Waiting Queue
            </h2>

            {queue.map((player, index) => (
              <div
                key={index}
                className="border-b border-slate-700 py-2"
              >
                {index + 1}. {player}
              </div>
            ))}
          </div>

          <div className="bg-slate-900 p-6 rounded-xl">
            <h2 className="text-2xl font-bold mb-4">
              Next Match
            </h2>

            <div className="text-lg">
              John / Sarah
            </div>

            <div className="my-3 text-center">
              VS
            </div>

            <div className="text-lg">
              Dane / Yvonne
            </div>

            <button className="mt-6 bg-cyan-500 text-black px-4 py-2 rounded-lg">
              Assign Court
            </button>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-2xl font-bold mb-5">
            Active Courts
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {courts.map((court) => (
              <div
                key={court.id}
                className="bg-slate-900 p-6 rounded-xl"
              >
                <h3 className="text-xl font-bold">
                  Court {court.id}
                </h3>

                <p className="text-green-400 mt-2">
                  {court.status}
                </p>

                <div className="mt-4">
                  <p>{court.teamA}</p>
                  <p className="my-2">VS</p>
                  <p>{court.teamB}</p>
                </div>

                <div className="text-3xl font-bold mt-4">
                  {court.score}
                </div>
              </div>
            ))}
          </div>
        </div>
    </AppShell>
  );
}