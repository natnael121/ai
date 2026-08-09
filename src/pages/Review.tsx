export default function ReviewPage() {
  // TODO: for each comment, show Screenshot -> Raw OCR -> Corrected ->
  // Translation -> AI classification, with Accept / Modify / Reject
  // controls that write to `annotations/{annotationId}` (see
  // src/types/research.ts AnnotationDoc) without touching the AI result.
  return (
    <div>
      <h2>Human Researcher Review</h2>
      <p>Coming next: comment-by-comment validation queue with Accept / Modify / Reject.</p>
    </div>
  );
}
