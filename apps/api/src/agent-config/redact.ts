/** Removes the token (and the Authorization header value) from text that may be logged or thrown. */
export const redactor = (token: string | undefined) => (text: string) => {
  let out = text.replace(/(authorization:?\s*(?:bearer|basic|token)\s+)\S+/gi, '$1[redacted]');
  if (token) out = out.split(token).join('[redacted]');
  return out;
};
