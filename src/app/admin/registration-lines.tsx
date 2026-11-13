import { formatWonPlain, type RegistrationQuote } from "@/lib/registration";

const dot = (key: string) => key.replace(/-/g, ".");

/**
 * The MEMBERSHIP REGISTRATION breakdown: one line per month (the first one
 * possibly prorated by calendar days), the total, and the gaps that stay
 * uncovered. Plain markup, so both the live calculator (client) and the
 * pending-charge card (server) use the same table.
 */
export function RegistrationLines({ quote, compact = false }: { quote: RegistrationQuote; compact?: boolean }) {
  const gaps = quote.periods.length > 1;
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full border-collapse text-[13px]" data-registration-lines>
        <thead>
          <tr className="border-b border-midnight/25 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
            <th className="py-1.5 pr-2 font-semibold">이용 기간</th>
            {!compact && <th className="py-1.5 pr-2 text-right font-semibold">일수</th>}
            <th className="py-1.5 text-right font-semibold">금액</th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((l) => (
            <tr key={l.month} className="border-b border-dashed border-midnight/15">
              <td className="py-1.5 pr-2 font-mono text-midnight">
                {dot(l.start).slice(5)} ~ {dot(l.end).slice(5)}
                <span className="ml-1.5 text-[11px] text-ink-soft">{l.month.slice(0, 4)}</span>
              </td>
              {!compact && (
                <td className="py-1.5 pr-2 text-right font-mono text-ink-soft">
                  {l.days}/{l.monthDays}
                  {l.prorated && <span className="ml-1 text-[11px]">일할</span>}
                </td>
              )}
              <td className="py-1.5 text-right font-mono text-midnight" data-line-amount={l.amount}>
                {formatWonPlain(l.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-2 pr-2 font-bold text-midnight" colSpan={compact ? 1 : 2}>
              총 청구액
            </td>
            <td className="pt-2 text-right font-mono text-[15px] font-bold text-midnight" data-total={quote.total}>
              {formatWonPlain(quote.total)}
            </td>
          </tr>
        </tfoot>
      </table>
      {gaps && (
        <p className="text-[12px] text-brown">
          떨어진 달은 따로 등록돼요: {quote.periods.map((p) => `${dot(p.start)}–${dot(p.end)}`).join(", ")}. 사이 달은 이용 기간이 아니에요.
        </p>
      )}
    </div>
  );
}
