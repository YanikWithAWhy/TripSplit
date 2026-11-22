import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/20261122120000_init.sql?raw'
import profilesMigration from '../../supabase/migrations/20261122140000_profiles.sql?raw'
import memberAccountsMigration from '../../supabase/migrations/20261122160000_member_accounts.sql?raw'
import permissionsMigration from '../../supabase/migrations/20261122180000_permissions.sql?raw'
import invitationsMigration from '../../supabase/migrations/20261122200000_invitations.sql?raw'
import { computeBalances } from '../lib'
import type { Settlement } from '../lib'
import { demoTrip, remapIds, withMeFirst, type Trip } from '../trips'
import { saveExpenseArgs, saveTripArgs, settlementInsert, tripFromRow, type TripRow } from './supabase-mapping'

/**
 * Runs the real migration in an in-memory Postgres (PGlite) and checks the
 * schema, the save functions and the row level security, as two different users.
 */

/** Minimal stand-in for what Supabase provides: roles, auth.users and auth.uid(). */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`

/** Returns the same shape as the PostgREST select in TRIP_SELECT. */
const LOAD_TRIPS = `
  select coalesce(json_agg(trip order by trip.created_at), '[]'::json) as trips
  from (
    select t.id, t.name, t.currency, t.created_at, t.created_by,
      coalesce((
        select json_agg(m) from (
          select id, name, position, user_id, deleted_at from public.members where trip_id = t.id
        ) m
      ), '[]'::json) as members,
      coalesce((
        select json_agg(e) from (
          select e.id, e.title, e.amount_cents, e.paid_by, e.spent_on, e.category, e.split_type,
            e.created_at, e.created_by, e.deleted_at,
            coalesce((
              select json_agg(s) from (
                select member_id, position, weight, amount_cents
                from public.expense_splits where expense_id = e.id
              ) s
            ), '[]'::json) as expense_splits
          from public.expenses e where e.trip_id = t.id
        ) e
      ), '[]'::json) as expenses,
      coalesce((
        select json_agg(st) from (
          select id, from_member, to_member, amount_cents, settled_at from public.settlements where trip_id = t.id
        ) st
      ), '[]'::json) as settlements
    from public.trips t
  ) trip
`

const ANNA_USER = '00000000-0000-4000-8000-00000000000a'
const BEN_USER = '00000000-0000-4000-8000-00000000000b'

let db: PGlite

async function as<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId])
  await db.exec('set role authenticated')
  try {
    return await run()
  } finally {
    await db.exec('reset role')
  }
}

function rpc(name: string, args: Record<string, unknown>) {
  const keys = Object.keys(args)
  const params = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]))
  return db.query(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`, params)
}

async function loadTrips(): Promise<Trip[]> {
  const result = await db.query<{ trips: TripRow[] }>(LOAD_TRIPS)
  return result.rows[0].trips.map((row) => tripFromRow(row))
}

async function insertSettlement(tripId: string, settlement: Settlement) {
  const row = settlementInsert(tripId, settlement)
  await db.query(
    `insert into public.settlements (id, trip_id, from_member, to_member, amount_cents, settled_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [row.id, row.trip_id, row.from_member, row.to_member, row.amount_cents, row.settled_at],
  )
}

async function count(table: string, tripId: string) {
  const result = await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where trip_id = $1`, [tripId])
  return result.rows[0].n
}

const newId = () => crypto.randomUUID()

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_STUB)
  await db.exec(migration)
  await db.exec(profilesMigration)
  await db.exec(memberAccountsMigration)
  await db.exec(permissionsMigration)
  await db.exec(invitationsMigration)
  await db.query('insert into auth.users (id) values ($1), ($2)', [ANNA_USER, BEN_USER])
})

describe('database schema (supabase/migrations)', () => {
  // Anna (the first person) is the signed-in creator, linked to her account.
  const trip = withMeFirst(remapIds(demoTrip('', '2026-11-22T10:00:00.000Z'), newId), { userId: ANNA_USER, name: 'Anna' })
  const [anna, ben, clara] = trip.members
  const settlement: Settlement = {
    id: newId(),
    from: ben.id,
    to: anna.id,
    amountCents: 15133,
    date: '2026-11-22T12:00:00.000Z',
  }


  it('saves a trip with people, expenses and repayments and loads it back unchanged', async () => {
    await as(ANNA_USER, async () => {
      await rpc('save_trip', saveTripArgs(trip))
      for (const expense of trip.expenses) {
        await rpc('save_expense', saveExpenseArgs(trip.id, trip.currency, expense))
      }
      await insertSettlement(trip.id, settlement)

      const [loaded] = await loadTrips()
      expect(loaded).toMatchObject({ id: trip.id, name: trip.name, currency: 'EUR', createdBy: ANNA_USER })
      expect(loaded.members).toEqual(trip.members)
      expect(loaded.expenses).toEqual(trip.expenses.map((e) => ({ ...e, createdBy: ANNA_USER })))
      expect(loaded.settlements).toEqual([settlement])

      const ids = trip.members.map((m) => m.id)
      expect(computeBalances(ids, loaded.expenses, loaded.settlements)).toEqual(
        computeBalances(ids, trip.expenses, [settlement]),
      )
    })
  })

  it('makes the creator the owner', async () => {
    await as(ANNA_USER, async () => {
      const result = await db.query('select user_id, role from public.trip_access where trip_id = $1', [trip.id])
      expect(result.rows).toEqual([{ user_id: ANNA_USER, role: 'owner' }])
    })
  })

  it('updates an expense and its split in place', async () => {
    const [first] = trip.expenses
    const changed = { ...first, title: 'Apartment (2 nights)', amountCents: 50000 }
    await as(ANNA_USER, async () => {
      await rpc('save_expense', saveExpenseArgs(trip.id, trip.currency, changed))
      const [loaded] = await loadTrips()
      expect(loaded.expenses[0]).toEqual({ ...changed, createdBy: ANNA_USER })
      expect(loaded.expenses).toHaveLength(trip.expenses.length)
      await rpc('save_expense', saveExpenseArgs(trip.id, trip.currency, first))
    })
  })

  it('hides the trip from other users', async () => {
    await as(BEN_USER, async () => {
      expect(await loadTrips()).toEqual([])
      const access = await db.query('select * from public.trip_access')
      expect(access.rows).toEqual([])
    })
  })

  it("doesn't let other users change or delete the trip", async () => {
    await as(BEN_USER, async () => {
      const expense = { ...trip.expenses[0], id: newId() }
      await expect(rpc('save_expense', saveExpenseArgs(trip.id, 'EUR', expense))).rejects.toThrow()
      await expect(rpc('save_trip', saveTripArgs({ ...trip, name: 'Hijacked' }))).rejects.toThrow()
      await expect(insertSettlement(trip.id, { ...settlement, id: newId() })).rejects.toThrow(/row-level security/)

      const renamed = await db.query(`update public.trips set name = 'Hijacked' where id = $1`, [trip.id])
      const deleted = await db.query('delete from public.trips where id = $1', [trip.id])
      expect(renamed.affectedRows).toBe(0)
      expect(deleted.affectedRows).toBe(0)
    })
    await as(ANNA_USER, async () => {
      const [loaded] = await loadTrips()
      expect(loaded.name).toBe(trip.name)
      expect(loaded.expenses).toHaveLength(trip.expenses.length)
    })
  })

  it('refuses to remove a person who is part of expenses', async () => {
    await as(ANNA_USER, async () => {
      const withoutClara = { ...trip, members: trip.members.filter((m) => m.id !== clara.id) }
      await expect(rpc('save_trip', saveTripArgs(withoutClara))).rejects.toThrow(/can't be removed/)
      // Also when bypassing save_trip and deleting the row directly.
      await expect(db.query('delete from public.members where id = $1', [clara.id])).rejects.toThrow(/foreign key/)
    })
  })

  it('renames, adds and removes unused people', async () => {
    const eva = { id: newId(), name: 'Eva' }
    await as(ANNA_USER, async () => {
      await rpc('save_trip', saveTripArgs({ ...trip, members: [{ ...anna, name: 'Annika' }, ...trip.members.slice(1), eva] }))
      let [loaded] = await loadTrips()
      expect(loaded.members.map((m) => m.name)).toEqual(['Annika', 'Ben', 'Clara', 'David', 'Eva'])

      await rpc('save_trip', saveTripArgs(trip))
      ;[loaded] = await loadTrips()
      expect(loaded.members).toEqual(trip.members)
    })
    const evaRow = await db.query<{ deleted_at: string | null }>('select deleted_at from public.members where id = $1', [eva.id])
    expect(evaRow.rows[0].deleted_at).not.toBeNull()
  })

  it('rejects exact amounts that do not add up, and empty splits', async () => {
    await as(ANNA_USER, async () => {
      const exact = {
        ...trip.expenses[0],
        id: newId(),
        split: { type: 'exact' as const, amounts: [{ memberId: anna.id, cents: 100 }] },
      }
      await expect(rpc('save_expense', saveExpenseArgs(trip.id, 'EUR', exact))).rejects.toThrow(/don't add up/)

      const empty = { ...trip.expenses[0], id: newId(), split: { type: 'equal' as const, memberIds: [] } }
      await expect(rpc('save_expense', saveExpenseArgs(trip.id, 'EUR', empty))).rejects.toThrow(/At least one person/)
    })
  })

  it('rejects people from another trip', async () => {
    const other = remapIds(demoTrip('', '2026-11-22T10:00:00.000Z'), newId)
    await as(ANNA_USER, async () => {
      await rpc('save_trip', saveTripArgs(other))
      const mixed = { ...trip.expenses[0], id: newId(), paidBy: other.members[0].id }
      await expect(rpc('save_expense', saveExpenseArgs(trip.id, 'EUR', mixed))).rejects.toThrow(/foreign key/)
      expect(await loadTrips()).toHaveLength(2)
      await db.query('delete from public.trips where id = $1', [other.id])
    })
  })

  it('needs at least two people per trip', async () => {
    await as(ANNA_USER, async () => {
      const solo = { id: newId(), name: 'Solo', currency: 'EUR', members: [{ id: newId(), name: 'Me' }] }
      await expect(rpc('save_trip', saveTripArgs(solo))).rejects.toThrow(/at least two people/)
    })
  })

  it('deletes everything that belongs to a trip together with it', async () => {
    await as(ANNA_USER, async () => {
      const deleted = await db.query('delete from public.trips where id = $1', [trip.id])
      expect(deleted.affectedRows).toBe(1)
    })
    for (const table of ['members', 'expenses', 'expense_splits', 'settlements', 'trip_access']) {
      expect(await count(table, trip.id)).toBe(0)
    }
  })
})

describe('profiles (usernames)', () => {
  const available = async (name: string) => {
    const result = await db.query<{ ok: boolean }>('select public.is_username_available($1) as ok', [name])
    return result.rows[0].ok
  }

  it('lets users create their own profile and read it back', async () => {
    await as(ANNA_USER, async () => {
      await db.query('insert into public.profiles (id, username) values ($1, $2)', [ANNA_USER, 'anna'])
      const own = await db.query('select id, username from public.profiles')
      expect(own.rows).toEqual([{ id: ANNA_USER, username: 'anna' }])
    })
  })

  it("doesn't let users create a profile for someone else or read other profiles", async () => {
    await as(BEN_USER, async () => {
      await expect(
        db.query('insert into public.profiles (id, username) values ($1, $2)', [ANNA_USER, 'not_ben']),
      ).rejects.toThrow(/row-level security/)
      const visible = await db.query('select * from public.profiles')
      expect(visible.rows).toEqual([])
    })
  })

  it('keeps usernames unique and checks availability case-insensitively', async () => {
    await as(BEN_USER, async () => {
      expect(await available(' ANNA ')).toBe(false)
      expect(await available('ben')).toBe(true)
      await expect(
        db.query('insert into public.profiles (id, username) values ($1, $2)', [BEN_USER, 'anna']),
      ).rejects.toThrow(/duplicate key/)
      await db.query('insert into public.profiles (id, username) values ($1, $2)', [BEN_USER, 'ben'])
      expect(await available('ben')).toBe(false)
    })
  })

  it('only accepts lowercase letters, numbers, _ and . with 3–20 characters', async () => {
    await as(BEN_USER, async () => {
      for (const bad of ['Ben', 'b', 'with space', 'x'.repeat(21), 'émile']) {
        await expect(db.query('update public.profiles set username = $1 where id = $2', [bad, BEN_USER])).rejects.toThrow(
          /check constraint/,
        )
      }
      await db.query('update public.profiles set username = $1 where id = $2', ['ben.k_2', BEN_USER])
    })
  })

  it('does not let signed-out visitors check usernames', async () => {
    await db.exec('set role anon')
    try {
      await expect(available('anna')).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('reset role')
    }
  })
})

describe('people linked to accounts', () => {
  const tripId = newId()
  const me = { id: newId(), name: 'anna', userId: ANNA_USER }
  const friend = { id: newId(), name: 'Ben' }
  const trip = { id: tripId, name: 'Linked', currency: 'EUR', members: [me, friend] }

  it("links the creator's own person to their account", async () => {
    await as(ANNA_USER, async () => {
      await rpc('save_trip', saveTripArgs(trip))
      const loaded = (await loadTrips()).find((t) => t.id === tripId)
      expect(loaded?.members).toEqual([me, friend])
    })
  })

  it("ignores attempts to link someone else's account", async () => {
    await as(ANNA_USER, async () => {
      await rpc('save_trip', saveTripArgs({ ...trip, members: [me, { ...friend, userId: BEN_USER }] }))
      const loaded = (await loadTrips()).find((t) => t.id === tripId)
      expect(loaded?.members[1]).toEqual(friend)
    })
  })

  it('keeps an existing link when the app sends none', async () => {
    await as(ANNA_USER, async () => {
      await rpc('save_trip', saveTripArgs({ ...trip, members: [{ id: me.id, name: 'Anna' }, friend] }))
      const loaded = (await loadTrips()).find((t) => t.id === tripId)
      expect(loaded?.members[0]).toEqual({ ...me, name: 'Anna' })
    })
  })

  it('refuses to remove a person who is linked to an account', async () => {
    await as(ANNA_USER, async () => {
      const others = [friend, { id: newId(), name: 'Clara' }]
      await expect(rpc('save_trip', saveTripArgs({ ...trip, members: others }))).rejects.toThrow(/linked to an account/)
    })
  })

  it('allows only one person per account in a trip', async () => {
    await as(ANNA_USER, async () => {
      const second = { ...friend, userId: ANNA_USER }
      await expect(rpc('save_trip', saveTripArgs({ ...trip, members: [me, second] }))).rejects.toThrow(/duplicate key/)
      await db.query('delete from public.trips where id = $1', [tripId])
    })
  })
})

describe('who may change expenses and repayments', () => {
  // A trip Anna created and shared with Ben (sharing comes in phase 4; set up directly here).
  const trip = withMeFirst(remapIds(demoTrip('', '2026-11-22T10:00:00.000Z'), newId), { userId: ANNA_USER, name: 'Anna' })
  const [anna, ben, clara] = trip.members
  const annasExpense = trip.expenses[0]
  const bensExpense = { ...trip.expenses[1], id: newId(), title: 'Ice cream', paidBy: ben.id }

  beforeAll(async () => {
    await as(ANNA_USER, async () => {
      await rpc('save_trip', saveTripArgs(trip))
      await rpc('save_expense', saveExpenseArgs(trip.id, 'EUR', annasExpense))
    })
    await db.query(`insert into public.trip_access (trip_id, user_id, role) values ($1, $2, 'editor')`, [trip.id, BEN_USER])
    await db.query('update public.members set user_id = $1 where id = $2', [BEN_USER, ben.id])
  })

  it('lets everyone on the trip read and add expenses', async () => {
    await as(BEN_USER, async () => {
      await rpc('save_expense', saveExpenseArgs(trip.id, 'EUR', bensExpense))
      const loaded = (await loadTrips()).find((t) => t.id === trip.id)
      expect(loaded?.expenses.map((e) => e.title)).toEqual([annasExpense.title, 'Ice cream'])
    })
  })

  it("doesn't let others change or delete an expense", async () => {
    await as(BEN_USER, async () => {
      const changed = { ...annasExpense, title: 'Changed by Ben' }
      await expect(rpc('save_expense', saveExpenseArgs(trip.id, 'EUR', changed))).rejects.toThrow(/Only the person who added/)
      const softDeleted = await db.query('update public.expenses set deleted_at = now() where id = $1', [annasExpense.id])
      const splitsDeleted = await db.query('delete from public.expense_splits where expense_id = $1', [annasExpense.id])
      expect(softDeleted.affectedRows).toBe(0)
      expect(splitsDeleted.affectedRows).toBe(0)
    })
  })

  it('lets authors change their own expenses and the trip owner change all', async () => {
    await as(BEN_USER, async () => {
      await rpc('save_expense', saveExpenseArgs(trip.id, 'EUR', { ...bensExpense, title: 'Gelato' }))
    })
    await as(ANNA_USER, async () => {
      await rpc('save_expense', saveExpenseArgs(trip.id, 'EUR', { ...bensExpense, title: 'Gelato (shared)' }))
      const loaded = (await loadTrips()).find((t) => t.id === trip.id)
      expect(loaded?.expenses.find((e) => e.id === bensExpense.id)?.title).toBe('Gelato (shared)')
    })
  })

  it('lets only people who are part of a repayment record it', async () => {
    const mine = { id: newId(), from: ben.id, to: anna.id, amountCents: 500, date: '2026-11-22T12:00:00.000Z' }
    const others = { id: newId(), from: clara.id, to: anna.id, amountCents: 300, date: '2026-11-22T12:00:00.000Z' }
    await as(BEN_USER, async () => {
      await insertSettlement(trip.id, mine)
      await expect(insertSettlement(trip.id, others)).rejects.toThrow(/row-level security/)
    })
    await as(ANNA_USER, async () => {
      await insertSettlement(trip.id, others)
    })
  })

  it('lets only people who are part of a repayment undo it', async () => {
    await as(BEN_USER, async () => {
      const deleted = await db.query('delete from public.settlements where trip_id = $1', [trip.id])
      expect(deleted.affectedRows).toBe(1)
    })
    await as(ANNA_USER, async () => {
      const left = (await loadTrips()).find((t) => t.id === trip.id)
      expect(left?.settlements.map((s) => s.from)).toEqual([clara.id])
    })
  })
})

describe('invitations by username', () => {
  const CLARA_USER = '00000000-0000-4000-8000-00000000000c'
  const anna = { id: newId(), name: 'anna', userId: ANNA_USER }
  const benPlaceholder = { id: newId(), name: 'Ben' }
  const trip = { id: newId(), name: 'Invite test', currency: 'EUR', members: [anna, benPlaceholder] }

  const search = async (query: string, tripId: string | null = null) =>
    (await db.query<{ username: string }>('select username from public.search_usernames($1, $2)', [query, tripId])).rows.map(
      (r) => r.username,
    )
  const myInvitations = async () =>
    (
      await db.query<{ id: string; trip_name: string; invited_by_username: string; member_name: string }>(
        'select id, trip_name, invited_by_username, member_name from public.my_invitations()',
      )
    ).rows
  const invite = (username: string, memberId?: string) =>
    rpc('invite_to_trip', { p_trip_id: trip.id, p_username: username, ...(memberId ? { p_member_id: memberId } : {}) })
  const respond = (invitationId: string, accept: boolean) =>
    rpc('respond_to_invitation', { p_invitation_id: invitationId, p_accept: accept })
  const pendingFor = async (userId: string) =>
    (
      await db.query<{ id: string }>(
        `select id from public.trip_invitations where trip_id = $1 and invited_user = $2 and status = 'pending'`,
        [trip.id, userId],
      )
    ).rows[0]?.id
  const tripFor = async () => (await loadTrips()).find((t) => t.id === trip.id)

  beforeAll(async () => {
    // Profiles so far: anna (Anna), ben.k_2 (Ben). Clara joins with an underscore in her name.
    await db.query('insert into auth.users (id) values ($1)', [CLARA_USER])
    await db.query('insert into public.profiles (id, username) values ($1, $2)', [CLARA_USER, 'clara_x'])
    await as(ANNA_USER, () => rpc('save_trip', saveTripArgs(trip)))
  })

  it('suggests usernames by prefix, never yourself', async () => {
    await as(ANNA_USER, async () => {
      expect(await search('b')).toEqual([])
      expect(await search('be')).toEqual(['ben.k_2'])
      expect(await search(' @BE ')).toEqual(['ben.k_2'])
      expect(await search('an')).toEqual([])
      expect(await search('cl')).toEqual(['clara_x'])
      // "_" must not act as a wildcard: "clar_" matches nothing.
      expect(await search('clar_')).toEqual([])
      expect(await search('clara_')).toEqual(['clara_x'])
    })
  })

  it('lets only people on the trip search for it or invite to it', async () => {
    await as(CLARA_USER, async () => {
      await expect(search('be', trip.id)).rejects.toThrow(/Trip not found/)
      await expect(invite('ben.k_2')).rejects.toThrow(/Trip not found/)
    })
  })

  it('invites a friend as an existing person; they see it without getting access yet', async () => {
    await as(ANNA_USER, async () => {
      await invite('ben.k_2', benPlaceholder.id)
      expect(await search('be', trip.id)).toEqual([])
    })
    await as(BEN_USER, async () => {
      expect(await myInvitations()).toMatchObject([
        { trip_name: 'Invite test', invited_by_username: 'anna', member_name: 'Ben' },
      ])
      expect(await tripFor()).toBeUndefined()
      const inviter = await db.query('select username from public.profiles where id = $1', [ANNA_USER])
      expect(inviter.rows).toEqual([{ username: 'anna' }])
    })
  })

  it('rejects unknown usernames, yourself and second invitations', async () => {
    await as(ANNA_USER, async () => {
      await expect(invite('nobody')).rejects.toThrow(/no account with the username @nobody/)
      await expect(invite('anna')).rejects.toThrow(/That's you/)
      await expect(invite('ben.k_2')).rejects.toThrow(/already been invited/)
    })
  })

  it('lets only the invited person answer', async () => {
    const invitationId = await pendingFor(BEN_USER)
    expect(invitationId).toBeDefined()
    await as(CLARA_USER, async () => {
      await expect(respond(invitationId!, true)).rejects.toThrow(/no longer valid/)
    })
  })

  it('gives access and links the person when accepted', async () => {
    const invitationId = await pendingFor(BEN_USER)
    await as(BEN_USER, async () => {
      await respond(invitationId!, true)
      const joined = await tripFor()
      expect(joined?.members[1]).toEqual({ ...benPlaceholder, userId: BEN_USER })
      expect(await myInvitations()).toEqual([])
      const access = await db.query('select role from public.trip_access where trip_id = $1 and user_id = $2', [
        trip.id,
        BEN_USER,
      ])
      expect(access.rows).toEqual([{ role: 'editor' }])
    })
    await as(ANNA_USER, async () => {
      const fellow = await db.query('select username from public.profiles where id = $1', [BEN_USER])
      expect(fellow.rows).toEqual([{ username: 'ben.k_2' }])
    })
  })

  it('adds a new person for the invitation, and nothing happens when it is declined', async () => {
    await as(ANNA_USER, async () => {
      await invite('clara_x')
      expect((await tripFor())?.members.map((m) => m.name)).toEqual(['anna', 'Ben', 'clara_x'])
    })
    const invitationId = await pendingFor(CLARA_USER)
    await as(CLARA_USER, async () => {
      expect(await myInvitations()).toHaveLength(1)
      await respond(invitationId!, false)
      expect(await myInvitations()).toEqual([])
      expect(await tripFor()).toBeUndefined()
    })
    await as(ANNA_USER, async () => {
      expect(await search('cl', trip.id)).toEqual(['clara_x'])
    })
  })

  it('takes back an invitation when cancelled or when the person is removed', async () => {
    const claraPerson = (await as(ANNA_USER, tripFor))!.members.find((m) => m.name === 'clara_x')!
    await as(ANNA_USER, async () => {
      await invite('clara_x', claraPerson.id)
      await rpc('cancel_invitation', { p_invitation_id: (await pendingFor(CLARA_USER))! })
    })
    await as(CLARA_USER, async () => expect(await myInvitations()).toEqual([]))

    await as(ANNA_USER, async () => {
      await invite('clara_x', claraPerson.id)
      const current = (await tripFor())!
      await rpc('save_trip', saveTripArgs({ ...current, members: current.members.filter((m) => m.id !== claraPerson.id) }))
    })
    await as(CLARA_USER, async () => expect(await myInvitations()).toEqual([]))
  })

  it('lets invited people leave, but not the owner', async () => {
    await as(BEN_USER, async () => {
      await rpc('leave_trip', { p_trip_id: trip.id })
      expect(await tripFor()).toBeUndefined()
    })
    await as(ANNA_USER, async () => {
      expect((await tripFor())?.members[1]).toEqual(benPlaceholder)
      await expect(rpc('leave_trip', { p_trip_id: trip.id })).rejects.toThrow(/owner can't leave/)
    })
  })

  it('does not let signed-out visitors search', async () => {
    await db.exec('set role anon')
    try {
      await expect(search('be')).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('reset role')
    }
  })
})
