/**
 * Pure remapper for the one-time localStorage → Postgres import (Phase 4a).
 * Rewrites every old string id (user_…, exp_…, grp_…) to a fresh uuid,
 * mapping the old currentUser id to the authenticated profile id.
 * No side effects; genId injectable for tests.
 */
import { AppState, Expense, Friend, Group, Settlement } from '../types';
import type { ActivityEvent } from './activityLog';

/** localStorage flag: import already offered/completed for this browser. */
export const IMPORT_HANDLED_KEY = 'splitease.importHandled';

export interface RemappedState {
  friends: Friend[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  activityEvents: ActivityEvent[];
}

export function remapLocalState(
  state: AppState,
  profileId: string,
  genId: () => string = () => crypto.randomUUID()
): RemappedState {
  const idMap = new Map<string, string>([[state.currentUser.id, profileId]]);
  const mapId = (old: string): string => {
    const hit = idMap.get(old);
    if (hit) return hit;
    const next = genId();
    idMap.set(old, next);
    return next;
  };
  const mapNullable = (old: string | null | undefined): string | null =>
    old == null ? null : mapId(old);
  // Group refs become real FKs in Postgres — null them when the target group
  // isn't part of the imported payload.
  const knownGroups = new Set(state.groups.map((g) => g.id));
  const mapGroupRef = (old: string | null | undefined): string | null =>
    old != null && knownGroups.has(old) ? mapId(old) : null;

  const friends = state.friends.map((f) => ({ ...f, id: mapId(f.id) }));
  const groups = state.groups.map((g) => ({
    ...g,
    id: mapId(g.id),
    members: g.members.map(mapId),
  }));
  const expenses = state.expenses.map((e) => ({
    ...e,
    id: mapId(e.id),
    paidBy: mapId(e.paidBy),
    payers: e.payers?.map((p) => ({ ...p, userId: mapId(p.userId) })),
    splitWith: e.splitWith.map((s) => ({ ...s, userId: mapId(s.userId) })),
    groupId: mapGroupRef(e.groupId),
  }));
  const settlementsIn = state.settlements ?? [];
  const activityEventsIn = state.activityEvents ?? [];
  const settlements = settlementsIn.map((s) => ({
    ...s,
    id: mapId(s.id),
    fromUserId: mapId(s.fromUserId),
    toUserId: mapId(s.toUserId),
    groupId: mapGroupRef(s.groupId),
  }));
  const activityEvents = activityEventsIn.map((ev) => ({
    ...ev,
    id: mapId(ev.id),
    actorId: mapId(ev.actorId),
    entityId: mapId(ev.entityId),
    groupId: mapNullable(ev.groupId),
  }));

  return { friends, groups, expenses, settlements, activityEvents };
}
