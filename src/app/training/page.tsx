import PageHeader from "@/components/PageHeader";
import TrainingView from "@/components/TrainingView";

export default function TrainingPage() {
  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Training Studio" description="Collect, review and export gesture samples and motion clips." />
      <TrainingView />
    </div>
  );
}
