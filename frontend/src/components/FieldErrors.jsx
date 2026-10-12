export default function FieldErrors({ message, fieldErrors }) {
  if (!message && (!fieldErrors || fieldErrors.length === 0)) return null;

  return (
    <div className="field-errors" role="alert">
      {message && <p>{message}</p>}
      {fieldErrors && fieldErrors.length > 0 && (
        <ul>
          {fieldErrors.map((e, i) => (
            <li key={`${e.field}-${i}`}>{e.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
