import { useWorkflow } from '../queries/useWorkflows';
import { WorkflowStatusCard } from '../views/cards/WorkflowStatusCard';

interface Props {
  workflowId: string;
  onCancel?: () => void;
}

export function WorkflowStatusController({ workflowId, onCancel }: Props) {
  const { data: workflow, isLoading } = useWorkflow(workflowId);
  return (
    <WorkflowStatusCard
      workflow={workflow ?? null}
      isLoading={isLoading}
      onCancel={onCancel}
    />
  );
}
