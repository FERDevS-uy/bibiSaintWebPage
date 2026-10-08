export function requestFeaturedRemoval(selected: readonly string[], id: string): string | null {
  return selected.includes(id) ? id : null;
}

export function confirmFeaturedRemoval(selected: readonly string[], pendingId: string | null): string[] {
  return pendingId === null ? [...selected] : selected.filter((id) => id !== pendingId);
}

export function toggleFeaturedSelection(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((item) => item !== id);
  return selected.length < 8 ? [...selected, id] : [...selected];
}
