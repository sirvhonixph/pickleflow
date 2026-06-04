function firstName(player) {
  return (player.name || "Player").trim().split(/\s+/)[0];
}

function speechName(player) {
  return (player?.name ?? player?.displayName ?? "Player").trim();
}

/** Display format: Yvonne / Dane */
export function formatTeamSlash(players) {
  return players.map((p) => firstName(p)).join(" / ");
}

export function formatMatchAnnouncement(teamA, teamB) {
  return `${formatTeamSlash(teamA)} vs ${formatTeamSlash(teamB)}`;
}

/** Spoken format: Yvonne Smith and Dane Lee versus Jade Park and Kim Nguyen */
function formatTeamSpeech(players) {
  const names = (players ?? []).map(speechName).filter(Boolean);
  if (names.length === 0) return "players";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function formatCourtMatchAnnouncement(courtName, teamA, teamB) {
  const matchup = `${formatTeamSpeech(teamA)} versus ${formatTeamSpeech(teamB)}`;
  if (!courtName) return matchup;
  return `On ${courtName}, ${matchup}`;
}

export function speakAnnouncement(text) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

export function announceMatch(teamA, teamB) {
  const text = formatMatchAnnouncement(teamA, teamB);
  speakAnnouncement(text);
  return text;
}

export function announceCourtMatch(courtName, teamA, teamB) {
  const text = formatCourtMatchAnnouncement(courtName, teamA, teamB);
  speakAnnouncement(text);
  return text;
}
