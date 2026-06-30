import Nav from "@/components/Nav";
import Leaderboard from "@/components/Leaderboard";

export const metadata = {
  title: "Calibration Tournament — Agenthesis",
};

export default function LeaderboardPage() {
  return (
    <main className="min-h-screen">
      <Nav />
      <Leaderboard />
    </main>
  );
}
