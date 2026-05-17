import { useEmployees } from '../queries/useEmployees';
import { useLeaveRequests } from '../queries/useLeaveRequests';
import { RecentEntities } from '../views/sidebar/RecentEntities';

export function RecentEntitiesController() {
  const { data: employeesData }  = useEmployees();
  const { data: leaveData }      = useLeaveRequests();

  return (
    <RecentEntities
      employees={employeesData?.data?.slice(0, 3) ?? []}
      leaveRequests={leaveData?.data?.slice(0, 3) ?? []}
    />
  );
}
