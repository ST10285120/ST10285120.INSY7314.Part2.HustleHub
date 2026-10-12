import { formatPrice } from '../utils/format';

export default function BookingsTable({ bookings, partyLabel, partyKey }) {
  return (
    <div className="table-wrap">
      <table className="bookings-table">
        <thead>
          <tr>
            <th>Gig</th>
            <th>{partyLabel}</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Booked</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b._id || b.id}>
              <td>{b.gig?.title}</td>
              <td>{b[partyKey]?.name}</td>
              <td>{formatPrice(b.amount)}</td>
              <td>
                <span className={`badge ${b.paymentStatus === 'paid' ? 'badge-success' : 'badge-muted'}`}>
                  {b.paymentStatus}
                </span>
              </td>
              <td>{new Date(b.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
