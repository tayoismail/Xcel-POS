import { redirect } from "next/navigation";

/**
 * Legacy route. Sales history lives on the POS Sales screen, so this
 * path forwards there instead of showing a placeholder.
 */
export default function SalesPage() {
  redirect("/dashboard/pos");
}
