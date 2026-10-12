import { formatPrice } from '../utils/format';

export default function GigCard({ gig, action }) {
  return (
    <article className="gig-card" data-testid="gig-card">
      <p className="gig-category">{gig.category}</p>
      <h3>{gig.title}</h3>
      <p className="gig-description">{gig.description}</p>
      <div className="gig-footer">
        <span className="gig-price">{formatPrice(gig.price)}</span>
        {gig.freelancer?.name && <span className="gig-freelancer">by {gig.freelancer.name}</span>}
      </div>
      {action}
    </article>
  );
}
