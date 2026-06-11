import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const userId = useStore((s) => s.currentUserId);
  return <Navigate to={userId ? "/dashboard" : "/login"} />;
}
