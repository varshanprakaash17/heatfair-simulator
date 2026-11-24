import { OptimizerView } from "./OptimizerView";

export default async function OptimizerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OptimizerView simulationId={id} />;
}
