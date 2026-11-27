/** A font file imports as the address it is served at. */
declare module '*.woff2' {
  const url: string;
  export default url;
}
