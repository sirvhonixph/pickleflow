function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionPatterns({ playerId, displayName }) {
  const patterns = [];
  const id = (playerId ?? "").trim().toLowerCase();
  if (!id) return patterns;

  patterns.push(`@${escapeRegExp(id)}`);

  const local = id.split("@")[0];
  if (local && local.length >= 2) {
    patterns.push(`@${escapeRegExp(local)}`);
  }

  const name = (displayName ?? "").trim();
  if (name && name.length >= 2) {
    patterns.push(`@${escapeRegExp(name)}`);
    const first = name.split(/\s+/)[0];
    if (first.length >= 2 && first.toLowerCase() !== name.toLowerCase()) {
      patterns.push(`@${escapeRegExp(first)}`);
    }
  }

  return patterns;
}

export function messageMentionsPlayer(text, { playerId, displayName }) {
  if (!text || !playerId) return false;
  const patterns = mentionPatterns({ playerId, displayName });
  if (patterns.length === 0) return false;

  const body = text.toLowerCase();
  return patterns.some((pattern) => {
    const re = new RegExp(`${pattern.toLowerCase()}(?=\\s|$|[.,!?;:)\]])`, "i");
    return re.test(body);
  });
}
