import { LoaderCircle } from 'lucide-react'
import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { MAX_USERNAME_LENGTH, normalizeUsername } from '../data/auth-messages'
import { Avatar } from './Avatar'

const MIN_QUERY = 2
const DEBOUNCE_MS = 250

interface UsernameComboboxProps {
  id: string
  /** Text in the field, without the leading "@". */
  value: string
  onChange: (value: string) => void
  /** A suggestion was picked. */
  onSelect: (username: string) => void
  search: (query: string) => Promise<string[]>
  /** Usernames not to suggest (e.g. already added to the form). */
  exclude?: string[]
  /** Enter while no suggestion list is open (e.g. to add the picked username). */
  onEnter?: () => void
  invalid?: boolean
  describedBy?: string
}

type Results = { query: string; usernames: string[] }

/**
 * "@username" field that suggests matching accounts while typing (ARIA combobox).
 * Arrow keys move through the suggestions, Enter picks one, Escape closes the list.
 */
export function UsernameCombobox({
  id,
  value,
  onChange,
  onSelect,
  search,
  exclude = [],
  onEnter,
  invalid,
  describedBy,
}: UsernameComboboxProps) {
  const listId = useId()
  const [results, setResults] = useState<Results | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const query = normalizeUsername(value).replace(/^@/, '')

  // Ask the server after a short pause in typing.
  useEffect(() => {
    if (query.length < MIN_QUERY) return
    let current = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      search(query)
        .then((usernames) => current && setResults({ query, usernames }))
        .catch(() => current && setResults({ query, usernames: [] }))
        .finally(() => current && setLoading(false))
    }, DEBOUNCE_MS)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [query, search])

  // Narrow the last answer right away while the next one is on its way.
  const suggestions =
    results && query.startsWith(results.query)
      ? results.usernames.filter((u) => u.startsWith(query) && !exclude.includes(u))
      : []
  const searched = results?.query === query
  const showList = open && query.length >= MIN_QUERY && (suggestions.length > 0 || (searched && !loading))
  const activeIndex = Math.min(active, Math.max(0, suggestions.length - 1))

  const pick = (username: string) => {
    onSelect(username)
    setOpen(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!showList) {
        setOpen(true)
        return
      }
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((activeIndex + step + suggestions.length) % Math.max(1, suggestions.length))
    } else if (event.key === 'Enter' && showList && suggestions.length > 0) {
      event.preventDefault()
      pick(suggestions[activeIndex])
    } else if (event.key === 'Enter' && onEnter) {
      // Don't submit the surrounding form.
      event.preventDefault()
      onEnter()
    } else if (event.key === 'Escape' && showList) {
      // Close the list, not the dialog around it.
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center rounded-xl border border-line bg-raised pl-4 transition-colors duration-150 focus-within:border-ink has-aria-invalid:border-ink">
        <span className="text-ink-muted" aria-hidden="true">
          @
        </span>
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && suggestions.length > 0 ? `${listId}-${activeIndex}` : undefined}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={MAX_USERNAME_LENGTH + 1}
          placeholder="username"
          value={value}
          onChange={(e) => {
            onChange(e.target.value.replace(/^@/, ''))
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          className="h-12 w-full min-w-0 bg-transparent pr-3 pl-1 text-base text-ink outline-none placeholder:text-ink-subtle"
        />
        {loading && <LoaderCircle className="mr-3 size-4 shrink-0 animate-spin text-ink-muted" aria-hidden="true" />}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching usernames"
          className="absolute inset-x-0 top-full z-10 mt-2 animate-enter overflow-hidden rounded-2xl border border-line-strong bg-raised py-1 shadow-[0_12px_40px_rgb(0_0_0/0.6)]"
        >
          {suggestions.length === 0 ? (
            <li className="px-4 py-3 text-sm text-ink-muted" role="presentation">
              No account with this username
            </li>
          ) : (
            suggestions.map((username, index) => (
              <li
                key={username}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                // mousedown instead of click: keeps the focus in the field.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(username)
                }}
                onMouseEnter={() => setActive(index)}
                className={`flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 ${
                  index === activeIndex ? 'bg-line' : ''
                }`}
              >
                <Avatar name={username} size="sm" />
                <span className="font-medium">@{username}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
