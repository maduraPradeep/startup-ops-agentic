import { useWorkflows } from '../queries/useWorkflows';
import { ActiveWorkflows } from '../views/sidebar/ActiveWorkflows';

export function ActiveWorkflowsController() {
  const { data, isLoading } = useWorkflows();
  return (
    <ActiveWorkflows
      workflows={data?.data ?? []}
      isLoading={isLoading}
    />
  );
}
