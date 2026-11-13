import "server-only";
import type { BlockReason } from "@/lib/access";
import { viewerAccess } from "./auth/access";
import { readSession } from "./auth/session";
import { getViewer, isOperator } from "./auth/viewer";
import { compareGrades, problemCode, problemsOf, problemStats, reviewsOf, type Feel, type ProblemStats, type ProblemStatus, type SendStatus } from "./domain/problems";
import { readTables, storeMode } from "./store";

/**
 * MOON PROBLEMS as one visitor sees them. Everything about who may do what is
 * decided here on the server (session → Members → membership rule), never by the
 * browser. Member ids never leave the server: a review only says whether it's yours.
 */

export interface ProblemCard {
  id: string;
  no: number;
  code: string;
  title: string;
  grade: string;
  wall: string;
  setterName: string;
  /** "YYYY-MM-DD" */
  createdOn: string;
  status: ProblemStatus;
  stats: ProblemStats;
}

export interface PublicReview {
  id: string;
  displayName: string;
  fun: number;
  feel: Feel;
  send: SendStatus;
  comment: string;
  /** "YYYY-MM-DD" (last change) */
  on: string;
  mine: boolean;
  /** Only operators ever receive hidden ones. */
  hidden: boolean;
}

export interface ProblemDetail extends ProblemCard {
  setterNote: string;
  beta: string;
  reviews: PublicReview[];
}

export interface ProblemViewer {
  signedIn: boolean;
  operator: boolean;
  /** A member with a membership in effect (or staff): may rate. */
  canReview: boolean;
  blockReason: BlockReason | null;
}

const day = (iso: string) => iso.slice(0, 10);

async function viewerInfo(): Promise<ProblemViewer & { memberId: string | null }> {
  const session = await readSession();
  if (!session) return { signedIn: false, operator: false, canReview: false, blockReason: null, memberId: null };
  const viewer = await getViewer();
  if (!viewer) return { signedIn: false, operator: false, canReview: false, blockReason: null, memberId: null };
  const access = viewerAccess(viewer);
  return {
    signedIn: true,
    operator: isOperator(viewer.member),
    canReview: access.canParticipate,
    blockReason: access.canParticipate ? null : (access.blockReason ?? "expired"),
    memberId: viewer.member?.id ?? null,
  };
}

/** Who is looking (no problem data). */
export async function problemViewer(): Promise<ProblemViewer> {
  const { memberId: _m, ...viewer } = await viewerInfo();
  void _m;
  return viewer;
}

async function readProblems() {
  const data = await readTables(["Problems", "ProblemReviews"], { problems: true });
  return { problems: problemsOf(data), reviews: reviewsOf(data) };
}

function card(p: ReturnType<typeof problemsOf>[number], reviews: ReturnType<typeof reviewsOf>): ProblemCard {
  return {
    id: p.id,
    no: p.no,
    code: problemCode(p.no),
    title: p.title,
    grade: p.grade,
    wall: p.wall,
    setterName: p.setterName,
    createdOn: day(p.createdAt),
    status: p.status,
    stats: problemStats(reviews, p.id),
  };
}

/** The list: newest first; deleted problems only for the crew (to restore them). */
export async function loadProblemList(): Promise<{ ready: boolean; problems: ProblemCard[]; deleted: ProblemCard[]; grades: string[]; viewer: ProblemViewer }> {
  const info = await viewerInfo();
  const { memberId: _m, ...viewer } = info;
  void _m;
  if (storeMode() === "unconfigured") return { ready: false, problems: [], deleted: [], grades: [], viewer };
  const { problems, reviews } = await readProblems();
  const sorted = [...problems].sort((a, b) => b.no - a.no);
  const visible = sorted.filter((p) => p.status !== "deleted").map((p) => card(p, reviews));
  return {
    ready: true,
    problems: visible,
    deleted: info.operator ? sorted.filter((p) => p.status === "deleted").map((p) => card(p, reviews)) : [],
    grades: [...new Set(visible.map((p) => p.grade).filter(Boolean))].sort(compareGrades),
    viewer,
  };
}

/** Home page: the latest few ACTIVE problems. */
export async function loadRecentProblems(limit: number): Promise<ProblemCard[]> {
  const { problems, reviews } = await readProblems();
  return problems
    .filter((p) => p.status === "active")
    .sort((a, b) => b.no - a.no)
    .slice(0, limit)
    .map((p) => card(p, reviews));
}

/** One problem by its number ("12") or id. Deleted ones only for the crew. */
export async function loadProblem(key: string): Promise<{ problem: ProblemDetail; viewer: ProblemViewer; myReview: PublicReview | null } | null> {
  const info = await viewerInfo();
  const { memberId, ...viewer } = info;
  const { problems, reviews } = await readProblems();
  const p = /^\d+$/.test(key) ? problems.find((x) => x.no === Number(key)) : problems.find((x) => x.id === key);
  if (!p || (p.status === "deleted" && !info.operator)) return null;
  const all = reviews
    .filter((r) => r.problemId === p.id && (r.status === "active" || (r.status === "hidden" && (info.operator || r.memberId === memberId))))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(
      (r): PublicReview => ({
        id: r.id,
        displayName: r.displayName,
        fun: r.fun,
        feel: r.feel,
        send: r.send,
        comment: r.comment,
        on: day(r.updatedAt || r.createdAt),
        mine: Boolean(memberId && r.memberId === memberId),
        hidden: r.status === "hidden",
      }),
    );
  // The viewer's own review, even if the crew hid it (the screen then explains instead of offering the form).
  const myReview = all.find((r) => r.mine) ?? null;
  return {
    problem: { ...card(p, reviews), setterNote: p.setterNote, beta: p.beta, reviews: info.operator ? all : all.filter((r) => !r.hidden || r.mine) },
    viewer,
    myReview,
  };
}
