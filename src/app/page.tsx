// P0 placeholder. Game UI starts in P3; nothing here is product UI.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">Quiz Loop</h1>
      <p className="text-muted-foreground max-w-md text-balance">
        โปรเจกต์อยู่ในขั้นตั้งค่า (P0) ยังไม่มีหน้าจอของเกม
      </p>
    </main>
  );
}
