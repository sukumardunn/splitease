import React from 'react';
import { Receipt, DollarSign, UserPlus, Users, Trash2 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatDate } from '../utils/helpers';
import { describeActivity, ActivityEvent } from '../services/activityLog';

const TONE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  expense: Receipt,
  settlement: DollarSign,
  group: Users,
  friend: UserPlus,
  delete: Trash2,
};

const TONE_COLOR: Record<string, string> = {
  expense: 'blue',
  settlement: 'green',
  group: 'purple',
  friend: 'orange',
  delete: 'gray',
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
  const color = TONE_COLOR[description.tone] ?? 'gray';

  return (
    <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start">
        <div className={`bg-${color}-100 rounded-full p-2 mr-4`}>
          <Icon className={`h-5 w-5 text-${color}-600`} />
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
