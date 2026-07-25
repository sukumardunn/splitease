import React from 'react';
import { Receipt, DollarSign, UserPlus, Users, Trash2 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatDate } from '../utils/helpers';
import { describeActivity, ActivityEvent } from '../services/activityLog';

/** Derived from the describer rather than re-declared, so it cannot drift. */
type ActivityTone = ReturnType<typeof describeActivity>['tone'];

const TONE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  expense: Receipt,
  settlement: DollarSign,
  group: Users,
  friend: UserPlus,
  delete: Trash2,
};

/**
 * Whole literal class names, not a hue to interpolate into `bg-${hue}-100`.
 *
 * That interpolation is what this map replaced: Tailwind's extractor is a static
 * scanner, so a class assembled at runtime is never in what it reads and no rule
 * is emitted — every icon chip in this feed rendered unstyled. Same fix and same
 * reasoning as `utils/categoryColors.ts`; see its header.
 *
 * The tones are a closed set produced by `describeActivity`, so this is keyed by
 * `ActivityTone` rather than `string` to make the compiler enforce coverage.
 */
const TONE_COLOR: Record<ActivityTone, { bg: string; text: string }> = {
  expense: { bg: 'bg-blue-100', text: 'text-blue-600' },
  settlement: { bg: 'bg-green-100', text: 'text-green-600' },
  group: { bg: 'bg-purple-100', text: 'text-purple-600' },
  friend: { bg: 'bg-orange-100', text: 'text-orange-600' },
  delete: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

const Activity: React.FC = () => {
  const { currentUser, friends, groups, activityEvents } = useAppContext();

  const nameOf = (id: string): string => {
    if (id === currentUser.id) return 'You';
    const friend = friends.find((f) => f.id === id);
    if (friend) return friend.name;
    const group = groups.find((g) => g.id === id);
    if (group) return group.name;
    return 'Someone';
  };

  // Events are newest-first already; group by day, preserving order within a day.
  const groupedEvents = activityEvents.reduce((groups: Record<string, ActivityEvent[]>, event) => {
    const date = formatDate(event.createdAt);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(event);
    return groups;
  }, {});

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Recent Activity</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {Object.keys(groupedEvents).length > 0 ? (
          <div className="divide-y divide-gray-200">
            {Object.entries(groupedEvents).map(([date, events]) => (
              <div key={date}>
                <div className="px-6 py-3 bg-gray-50">
                  <h3 className="font-medium text-gray-700">{date}</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {events.map((event) => (
                    <ActivityRow key={event.id} event={event} nameOf={nameOf} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Receipt className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No activity yet</h3>
            <p className="text-gray-500">
              Add expenses, friends, or groups to see activity here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

interface ActivityRowProps {
  event: ActivityEvent;
  nameOf: (id: string) => string;
}

const ActivityRow: React.FC<ActivityRowProps> = ({ event, nameOf }) => {
  const description = describeActivity(event, nameOf);
  const Icon = TONE_ICON[description.tone] ?? Receipt;
  const tone = TONE_COLOR[description.tone] ?? TONE_COLOR.expense;

  return (
    <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start">
        <div className={`${tone.bg} rounded-full p-2 mr-4`}>
          <Icon className={`h-5 w-5 ${tone.text}`} />
        </div>
        <div className="flex-1">
          <div className="flex justify-between">
            <div>
              <p className="font-medium text-gray-900">{description.title}</p>
              {description.subtitle && (
                <p className="text-sm text-gray-500">{description.subtitle}</p>
              )}
            </div>
            <span className="text-sm text-gray-500">
              {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Activity;
