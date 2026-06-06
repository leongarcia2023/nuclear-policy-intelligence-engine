"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db";
import { applyOverride } from "../corpus/corpus";
import type { Label } from "../corpus/label";

/**
 * Server Action: apply a human override to a corpus record. Writes to the
 * judgment corpus (active label superseded, prior retained in history) and
 * revalidates the affected pages.
 */
export async function submitOverride(formData: FormData): Promise<void> {
  const recordId = String(formData.get("record_id") ?? "");
  const billId = String(formData.get("bill_id") ?? "");
  const by = String(formData.get("by") ?? "").trim() || "anonymous@desk";
  const note = String(formData.get("note") ?? "").trim() || undefined;

  const correction: Partial<Label> & Pick<Label, "relevant"> = {
    relevant: formData.get("relevant") === "true",
    direction: String(formData.get("direction")) as Label["direction"],
    suggested_position: String(
      formData.get("suggested_position"),
    ) as Label["suggested_position"],
    materiality_band: String(
      formData.get("materiality_band"),
    ) as Label["materiality_band"],
  };

  if (!recordId) throw new Error("missing record_id");
  applyOverride(getDb(), { recordId, correction, by, note });

  revalidatePath(`/bill/${encodeURIComponent(billId)}`);
  revalidatePath("/desk");
}
