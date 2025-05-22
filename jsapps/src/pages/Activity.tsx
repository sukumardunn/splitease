import React from 'react';
import { useAppContext } from '../context/AppContext';
import { formatDate } from '../utils/helpers';
import { Receipt, DollarSign, UserPlus, Users } from 'lucide-react';

const Activity: React.FC = () => {
  const { expenses } = useAppContext();
  
  // Sort expenses by date (newest first)
  const sortedExpenses = [...expenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  // Group expenses by date
  const groupedExpenses = sortedExpenses.reduce((groups: Record<string, any[]>, expense) => {
    const date = formatDate(expense.date);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push({
      type: 'expense',
      data: expense,
    });
    return groups;
  }, {});
  
  // Mock settlement activities
  const settlements = [
    {
      id: 'settle1',
      date: '2023-05-16T10:30:00Z',
      fromId: 'friend1',
      fromName: 'Alex Johnson',
      toId: 'user1',
      toName: 'You',
      amount: 120,
    },
    {
      id: 'settle2',
      date: '2023-05-08T14:45:00Z',
      fromId: 'user1',
      fromName: 'You',
      toId: 'friend3',
      toName: 'Morgan Freeman',
      amount: 85.5,
    },
  ];
  
  // Add settlements to the activity groups
  settlements.forEach(settlement => {
    const date = formatDate(settlement.date);
    if (!groupedExpenses[date]) {
      groupedExpenses[date] = [];
    }
    groupedExpenses[date].push({
      type: 'settlement',
      data: settlement,
    });
  });
  
  // Sort each day's activities by time
  Object.keys(groupedExpenses).forEach(date => {
    groupedExpenses[date].sort((a, b) => {
      const dateA = new Date(a.type === 'expense' ? a.data.date : a.data.date);
      const dateB = new Date(b.type === 'expense' ? b.data.date : b.data.date);
      return dateB.getTime() - dateA.getTime();
    });
  });
  
  // Mock group and friend activities
  const otherActivities = [
    {
      id: 'group1',
      type: 'group_created',
      date: '2023-05-01T09:15:00Z',
      name: 'Trip to Bali',
    },
    {
      id: 'friend1',
      type: 'friend_added',
      date: '2023-04-28T11:30:00Z',
      name: 'Taylor Swift',
    },
  ];
  
  // Add other activities to the activity groups
  otherActivities.forEach(activity => {
    const date = formatDate(activity.date);
    if (!groupedExpenses[date]) {
      groupedExpenses[date] = [];
    }
    groupedExpenses[date].push({
      type: activity.type,
      data: activity,
    });
  });
  
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Recent Activity</h1>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {Object.keys(groupedExpenses).length > 0 ? (
          <div className="divide-y divide-gray-200">
            {Object.entries(groupedExpenses).map(([date, activities]) => (
              <div key={date}>
                <div className="px-6 py-3 bg-gray-50">
                  <h3 className="font-medium text-gray-700">{date}</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {activities.map((activity, index) => (
                    <ActivityItem key={`${activity.type}-${index}`} activity={activity} />
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

interface ActivityItemProps {
  activity: {
    type: string;
    data: any;
  };
}

const ActivityItem: React.FC<ActivityItemProps> = ({ activity }) => {
  const { currentUser, friends, groups } = useAppContext();
  
  if (activity.type === 'expense') {
    const expense = activity.data;
    const payer = expense.paidBy === currentUser.id
      ? currentUser
      : friends.find(f => f.id === expense.paidBy);
    
    const group = expense.groupId
      ? groups.find(g => g.id === expense.groupId)
      : null;
    
    return (
      <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-start">
          <div className="bg-blue-100 rounded-full p-2 mr-4">
            <Receipt className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between">
              <div>
                <p className="font-medium text-gray-900">
                  {payer?.name} added "{expense.description}"
                </p>
                <p className="text-sm text-gray-500">
                  {payer?.name} paid ${expense.amount.toFixed(2)}
                  {group && <span> • {group.name}</span>}
                </p>
              </div>
              <span className="text-sm text-gray-500">
                {new Date(expense.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (activity.type === 'settlement') {
    const settlement = activity.data;
    const isCurrentUserPayer = settlement.fromId === currentUser.id;
    
    return (
      <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-start">
          <div className="bg-green-100 rounded-full p-2 mr-4">
            <DollarSign className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between">
              <div>
                <p className="font-medium text-gray-900">
                  {settlement.fromName} paid {settlement.toName}
                </p>
                <p className="text-sm text-gray-500">
                  ${settlement.amount.toFixed(2)} payment
                </p>
              </div>
              <span className="text-sm text-gray-500">
                {new Date(settlement.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (activity.type === 'group_created') {
    return (
      <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-start">
          <div className="bg-purple-100 rounded-full p-2 mr-4">
            <Users className="h-5 w-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between">
              <div>
                <p className="font-medium text-gray-900">
                  You created "{activity.data.name}" group
                </p>
              </div>
              <span className="text-sm text-gray-500">
                {new Date(activity.data.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (activity.type === 'friend_added') {
    return (
      <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-start">
          <div className="bg-orange-100 rounded-full p-2 mr-4">
            <UserPlus className="h-5 w-5 text-orange-600" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between">
              <div>
                <p className="font-medium text-gray-900">
                  You added {activity.data.name} as a friend
                </p>
              </div>
              <span className="text-sm text-gray-500">
                {new Date(activity.data.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return null;
};

export default Activity;