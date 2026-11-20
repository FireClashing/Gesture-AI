export default function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mx-auto mb-5 max-w-6xl">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </header>
  );
}
