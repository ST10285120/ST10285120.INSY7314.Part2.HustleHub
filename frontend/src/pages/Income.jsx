import { useCallback, useEffect, useState } from 'react';
import { client, toDisplayError } from '../api/client';
import FieldErrors from '../components/FieldErrors';
import BookingsTable from '../components/BookingsTable';
import { MonthlyIncomeChart, CategoryBars, IncomeSplitBar } from '../components/charts';
import { formatPrice, formatPercent, formatDate } from '../utils/format';

const AGE_GROUPS = [
  { value: 'under65', label: 'Under 65' },
  { value: '65to74', label: '65 to 74' },
  { value: '75plus', label: '75 or older' },
];

function StatTile({ label, value, hint }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

function changeHint(change) {
  if (change === null || change === undefined) return 'No income last month to compare';
  const pct = Math.round(change * 100);
  if (pct === 0) return 'Same as last month';
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last month`;
}

export default function Income() {
  const [insights, setInsights] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ expenses: '', ageGroup: 'under65' });

  const load = useCallback(async (params) => {
    try {
      const res = await client.get('/insights/income', { params });
      setInsights(res.data.data);
      setError(null);
    } catch (err) {
      setError(toDisplayError(err));
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [, bookingsRes] = await Promise.all([
          load({ expenses: 0, ageGroup: 'under65' }),
          client.get('/bookings/freelancer'),
        ]);
        setBookings(bookingsRes.data.data.bookings);
      } catch (err) {
        setError(toDisplayError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  async function handleRecalculate(e) {
    e.preventDefault();
    const expenses = form.expenses === '' ? 0 : Number(form.expenses);
    if (!Number.isFinite(expenses) || expenses < 0) {
      setError({ message: 'Expenses must be zero or a positive amount.', fieldErrors: [] });
      return;
    }
    const params = { expenses, ageGroup: form.ageGroup };
    await load(params);
  }

  if (loading) {
    return (
      <div className="page">
        <h1>Income &amp; tax</h1>
        <p className="loading">Loading your income…</p>
      </div>
    );
  }

  const summary = insights?.summary;
  const tax = insights?.tax;

  return (
    <div className="page income-page">
      <h1>Income &amp; tax</h1>
      <p className="page-intro">
        Your earnings on HustleHub+ and an estimate of the income tax you should set aside for the{' '}
        {tax ? `${tax.taxYearLabel} tax year (${formatDate(tax.taxYearStart)} – ${formatDate(tax.taxYearEnd)})` : 'current tax year'}.
      </p>
      <FieldErrors message={error?.message} fieldErrors={error?.fieldErrors} />

      {summary && tax && (
        <>
          <section className="stat-grid" aria-label="Income summary">
            <StatTile
              label="Income this tax year"
              value={formatPrice(summary.taxYearIncome)}
              hint={`${summary.taxYearTransactions} completed ${summary.taxYearTransactions === 1 ? 'payment' : 'payments'}`}
            />
            <StatTile
              label="This month"
              value={formatPrice(summary.thisMonthIncome)}
              hint={changeHint(summary.monthOverMonthChange)}
            />
            <StatTile
              label="Estimated tax so far"
              value={formatPrice(tax.estimatedTaxOnIncomeYtd)}
              hint={`Effective rate ${formatPercent(tax.effectiveRate)}`}
            />
            <StatTile
              label="Set aside each month"
              value={formatPrice(tax.recommendedMonthlySetAside)}
              hint={`Marginal rate ${formatPercent(tax.marginalRate)}`}
            />
          </section>

          <section className="panel">
            <MonthlyIncomeChart data={insights.monthly} />
          </section>

          <div className="two-col">
            <section className="panel">
              <h2>Where this year&apos;s income goes</h2>
              <IncomeSplitBar
                takeHome={tax.netIncomeAfterTaxYtd}
                tax={tax.estimatedTaxOnIncomeYtd}
                expenses={Math.min(tax.expensesYtd, tax.incomeYtd)}
              />
            </section>

            <section className="panel">
              <h2>Income by category</h2>
              <CategoryBars data={insights.byCategory} />
            </section>
          </div>

          <section className="panel tax-panel" aria-labelledby="tax-heading">
            <h2 id="tax-heading">Tax estimate</h2>

            <form className="tax-controls" onSubmit={handleRecalculate}>
              <div>
                <label htmlFor="expenses">Business expenses this tax year (R)</label>
                <input
                  id="expenses"
                  name="expenses"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.expenses}
                  onChange={(e) => setForm((f) => ({ ...f, expenses: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label htmlFor="ageGroup">Your age</label>
                <select
                  id="ageGroup"
                  name="ageGroup"
                  value={form.ageGroup}
                  onChange={(e) => setForm((f) => ({ ...f, ageGroup: e.target.value }))}
                >
                  {AGE_GROUPS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn">
                Recalculate
              </button>
            </form>

            {tax.belowThreshold ? (
              <p className="notice" role="status">
                At your current pace you&apos;ll earn about {formatPrice(tax.projectedAnnualTaxableIncome)} this tax
                year, which is below the {formatPrice(tax.taxThreshold)} tax threshold, so no income tax is
                expected.
              </p>
            ) : (
              <p className="tax-lead">
                At your current pace your taxable income for the year will be about{' '}
                <strong>{formatPrice(tax.projectedAnnualTaxableIncome)}</strong>, giving estimated income tax of{' '}
                <strong>{formatPrice(tax.estimatedAnnualTax)}</strong> for the full year.
              </p>
            )}

            <dl className="tax-figures">
              <div>
                <dt>Income received</dt>
                <dd>{formatPrice(tax.incomeYtd)}</dd>
              </div>
              <div>
                <dt>Less business expenses</dt>
                <dd>− {formatPrice(tax.expensesYtd)}</dd>
              </div>
              <div>
                <dt>Taxable income so far</dt>
                <dd>{formatPrice(tax.taxableIncomeYtd)}</dd>
              </div>
              <div>
                <dt>Projected for the full year ({tax.monthsElapsed.toFixed(1)} of 12 months)</dt>
                <dd>{formatPrice(tax.projectedAnnualTaxableIncome)}</dd>
              </div>
              <div>
                <dt>Tax rebate ({AGE_GROUPS.find((a) => a.value === tax.ageGroup)?.label})</dt>
                <dd>− {formatPrice(tax.rebate)}</dd>
              </div>
              <div className="tax-total">
                <dt>Estimated tax for the year</dt>
                <dd>{formatPrice(tax.estimatedAnnualTax)}</dd>
              </div>
            </dl>

            <h3>Provisional tax payments</h3>
            <ul className="payment-cards">
              {tax.provisionalPayments.map((p) => (
                <li key={p.period}>
                  <span className="stat-label">{p.period}</span>
                  <span className="stat-value">{formatPrice(p.amount)}</span>
                  <span className="stat-hint">Due {formatDate(p.dueDate)}</span>
                </li>
              ))}
            </ul>

            <h3>SARS tax brackets ({tax.taxYearLabel})</h3>
            <div className="table-wrap">
              <table className="bookings-table brackets-table">
                <thead>
                  <tr>
                    <th scope="col">Taxable income</th>
                    <th scope="col">Rate</th>
                    <th scope="col">Your income in bracket</th>
                    <th scope="col">Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {tax.brackets.map((b) => (
                    <tr key={b.from} className={b.taxableAmount > 0 ? 'is-active' : undefined}>
                      <td>
                        {formatPrice(b.from)} – {b.to === null ? 'and above' : formatPrice(b.to)}
                      </td>
                      <td>{formatPercent(b.rate)}</td>
                      <td>{formatPrice(b.taxableAmount)}</td>
                      <td>{formatPrice(b.tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="tax-method">
              <summary>How this estimate is calculated</summary>
              <ol>
                {tax.method.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="hint">{tax.disclaimer}</p>
            </details>
          </section>

          {insights.topGigs.length > 0 && (
            <section className="panel">
              <h2>Top earning gigs</h2>
              <ol className="top-gigs">
                {insights.topGigs.map((g) => (
                  <li key={g.gigId}>
                    <span>{g.title}</span>
                    <span>
                      <strong>{formatPrice(g.total)}</strong> · {g.count} {g.count === 1 ? 'booking' : 'bookings'}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      <h2>Bookings against your gigs</h2>
      {!error && bookings.length === 0 && <p className="empty-state">No bookings yet.</p>}
      {bookings.length > 0 && (
        <BookingsTable bookings={bookings} partyLabel="Client" partyKey="client" />
      )}
    </div>
  );
}
