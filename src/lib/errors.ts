/** Thrown when expense data is invalid. Messages are written to be shown to users. */
export class ExpenseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExpenseError'
  }
}

export function assertCents(value: number, label = 'Amount'): void {
  if (!Number.isSafeInteger(value)) {
    throw new ExpenseError(`${label} must be a whole number of cents (got: ${value}).`)
  }
}

export function assertUnique(ids: string[], label: string): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) {
      throw new ExpenseError(`${label}: member "${id}" is listed twice.`)
    }
    seen.add(id)
  }
}
