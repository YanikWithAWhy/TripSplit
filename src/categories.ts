import { BedDouble, Car, ReceiptText, ShoppingCart, Ticket, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import type { ExpenseCategory } from './lib'

export const categories: { value: ExpenseCategory; label: string; icon: LucideIcon }[] = [
  { value: 'food', label: 'Food & drink', icon: UtensilsCrossed },
  { value: 'groceries', label: 'Groceries', icon: ShoppingCart },
  { value: 'transport', label: 'Transport', icon: Car },
  { value: 'accommodation', label: 'Stay', icon: BedDouble },
  { value: 'activities', label: 'Activities', icon: Ticket },
  { value: 'other', label: 'Other', icon: ReceiptText },
]

export function categoryIcon(category: ExpenseCategory | undefined): LucideIcon {
  return categories.find((c) => c.value === (category ?? 'other'))?.icon ?? ReceiptText
}

export function categoryLabel(category: ExpenseCategory | undefined): string {
  return categories.find((c) => c.value === (category ?? 'other'))?.label ?? 'Other'
}
