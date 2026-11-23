import { Header } from "@/components/Header";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg0 text-text0">
      <Header />
      <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}
