import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/invitations")({
  component: () => <Navigate to="/events" replace />,
});
