module.exports = {
  displayName: true,
  /**
   * See
   * {@link https://github.com/callstack/linaria/blob/10302654006e414bfb52e3b4f07773d71b483abe/docs/CONFIGURATION.md}
   * (uses also @wyw-in-js under-the-hood)
   */
  classNameSlug: (hash, title, args) => {
    let titleToUse;
    if (title === "className") {
      /* this is the case when the result of a `css` function call is directly assigned to a `className` JSX prop */
      titleToUse = "INLINE";
    } else {
      titleToUse = title;
    }
    return process.env.NODE_ENV === "production"
      ? hash
      : `${args.file.substring(0, args.file.length - args.ext.length)}_${titleToUse}_${hash}`;
  },
};
