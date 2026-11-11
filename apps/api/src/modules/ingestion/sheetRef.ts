/**
 * Pipeline rows reference a page by a stable `sheet:<fileId>:<pageNumber>` key.
 * DrawingSheet rows carry the same file/page pair, so either form can be
 * resolved without duplicating Mongo ids across collections.
 */
export function sheetRefFor(fileId: string, pageNumber: number): string {
  return `sheet:${fileId}:${pageNumber}`;
}
