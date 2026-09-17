/**
 * Who is online, counted by live sockets rather than by a flag someone has to
 * remember to clear. One person with three tabs is online once; closing two of
 * them changes nothing.
 */
export class Presence {
  private counts = new Map<string, number>()

  /** @returns true when this is the user's first socket. */
  add(userId: string) {
    const next = (this.counts.get(userId) ?? 0) + 1
    this.counts.set(userId, next)
    return next === 1
  }

  /** @returns true when this was the user's last socket. */
  remove(userId: string) {
    const next = (this.counts.get(userId) ?? 1) - 1
    if (next <= 0) {
      this.counts.delete(userId)
      return true
    }
    this.counts.set(userId, next)
    return false
  }

  isOnline(userId: string) {
    return this.counts.has(userId)
  }

  online() {
    return [...this.counts.keys()]
  }
}
