export const blobToken = () =>
  process.env.BLOB_READ_WRITE_TOKEN ||
  Object.entries(process.env).find(([k, v]) => k.endsWith("_READ_WRITE_TOKEN") && v)?.[1] ||
  "";
