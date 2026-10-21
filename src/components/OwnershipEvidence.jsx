export default function OwnershipEvidence({ text }) {
  return <details className="ownership-evidence">
    <summary>Read full evidence</summary>
    <p>{text}</p>
  </details>;
}
