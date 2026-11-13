"use server";

import { updateTag } from "next/cache";
import { after } from "next/server";
import { MEMBERSHIP_REQUIRED } from "@/lib/access";
import { requireParticipant } from "@/server/auth/access";
import { MEMBERSHIP_REQUIRED_REFUSAL, NEEDS, planProposal } from "@/server/domain/operations";
import { deliverDue } from "@/server/notify";
import { PRIVATE_TAG, runCommit, storeMode } from "@/server/store";
import { parseProposal, type ProposalFormState } from "./proposal";

/** What the visitor typed, so a failed submission never wipes the form. */
function echo(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

/**
 * Saves a proposal to the private "Proposals" tab (through the same locked
 * commit path as everything else) and lets the operators know. Nothing in a
 * proposal is ever published; the public feed only reads Events / Enrollment.
 */
export async function submitProposal(_prev: ProposalFormState, formData: FormData): Promise<ProposalFormState> {
  // Members with a membership in effect only (ACTIVE MEMBERS ONLY). Checked here too: the page
  // check alone could be bypassed by posting directly.
  const gate = await requireParticipant();
  if (!gate.ok) {
    return gate.code === "LOGIN_REQUIRED"
      ? { status: "error", message: "로그인이 필요해요. 로그인한 뒤 다시 제출해 주세요.", values: echo(formData) }
      : { status: "error", code: gate.code, reason: gate.reason, message: gate.message, values: echo(formData) };
  }
  const session = gate.viewer.session;

  // Honeypot: real visitors never see or fill this field.
  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return { status: "success" };
  }

  const parsed = parseProposal(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "입력 내용을 한 번 더 확인해 주세요.",
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
    };
  }

  if (storeMode() === "unconfigured") {
    console.error("[proposal] CLUB_API_URL or CLUB_API_SECRET is not configured");
    return { status: "error", message: "지금은 제안을 받을 수 없어요. 운영진에게 직접 알려 주세요.", values: echo(formData) };
  }

  // The public demo lets anyone sign in as a demo operator, so a real visitor's
  // contact details must never be kept there.
  const payload: Record<string, string | number> =
    storeMode() === "demo" ? { ...parsed.data, contact: "(데모 모드: 저장하지 않음)" } : { ...parsed.data };

  try {
    // The audit log records who proposed (the account); the demo keeps no real identity.
    const actorId = storeMode() === "demo" ? "visitor" : session.email;
    const outcome = await runCommit(NEEDS.proposalSubmit, (data) => planProposal(data, { now: Date.now(), actorId, payload, email: session.email }));
    if (!outcome.ok && outcome.message === MEMBERSHIP_REQUIRED_REFUSAL) {
      return { status: "error", code: MEMBERSHIP_REQUIRED, reason: "expired", message: outcome.message, values: echo(formData) };
    }
    if (!outcome.ok) throw new Error(outcome.message);
    updateTag(PRIVATE_TAG);
    after(() => deliverDue(Date.now()).catch((e) => console.error("[notify] immediate delivery failed", e)));
    return { status: "success", dryRun: storeMode() === "demo" };
  } catch (error) {
    console.error("[proposal] could not save the proposal:", error);
    return { status: "error", message: "전송 중에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.", values: echo(formData) };
  }
}
