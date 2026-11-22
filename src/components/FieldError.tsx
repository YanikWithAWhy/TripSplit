import { CircleAlert } from 'lucide-react'

/** Error text below a form field. Link it to the field with aria-describedby={id}. */
export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!id || !message) return null
  return (
    <p id={id} className="mt-2 flex items-start gap-1.5 text-sm font-medium text-ink">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  )
}
