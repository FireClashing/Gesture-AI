import PageHeader from "@/components/PageHeader";
import TranslatorView from "@/components/TranslatorView";

export default function TranslatorPage() {
  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Live Translator" description="Translate your hand gestures into English and Hindi text in real time." />
      <TranslatorView />
    </div>
  );
}
