import type { Employee, LeaveRequest } from '@ops/shared';

interface Props {
  employees: Employee[];
  leaveRequests: LeaveRequest[];
}

export function RecentEntities({ employees, leaveRequests }: Props) {
  return (
    <div className="p-3 space-y-4">
      {employees.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Employees</p>
          <div className="space-y-1">
            {employees.map((emp) => (
              <div key={emp.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                  {emp.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{emp.name}</p>
                  <p className="text-xs text-gray-500">{emp.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {leaveRequests.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Leave Requests</p>
          <div className="space-y-1">
            {leaveRequests.map((lr) => (
              <div key={lr.id} className="p-2 rounded-lg hover:bg-gray-50">
                <p className="text-sm text-gray-900 capitalize">{lr.leave_type} leave</p>
                <p className="text-xs text-gray-500 capitalize">{lr.status}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
