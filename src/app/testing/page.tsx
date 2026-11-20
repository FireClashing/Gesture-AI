import PageHeader from "@/components/PageHeader";
import TestingView from "@/components/TestingView";

export default function TestingPage() {
  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Model Testing" description="Test the trained model with live camera input and inspect its confidence." />
      <TestingView />
    </div>
  );
}
