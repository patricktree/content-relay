export const cssReset = css`
  @layer reset {
    /* based on https://www.joshwcomeau.com/css/custom-css-reset/ */

    /* 1. Use a more-intuitive box-sizing model */
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    /* 2. Remove default margin */
    *:not(dialog) {
      margin: 0;
    }

    /* 3. Enable keyword animations */
    @media (prefers-reduced-motion: no-preference) {
      html {
        interpolate-size: allow-keywords;
      }
    }

    body {
      /* 4. Increase line-height */
      line-height: 1.5;
      /* 5. Improve text rendering */
      -webkit-font-smoothing: antialiased;
    }

    /* 6. Improve media defaults */
    img,
    picture,
    video,
    canvas,
    svg {
      display: block;
      max-width: 100%;
    }

    /* 7. Inherit fonts for form controls */
    input,
    button,
    textarea,
    select {
      font: inherit;
    }

    /* 8. Avoid text overflows */
    p,
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      overflow-wrap: break-word;
    }

    /* 9. Improve line wrapping */
    p {
      text-wrap: pretty;
    }
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      text-wrap: balance;
    }

    /*
      10. Create a root stacking context
      (also for https://base-ui.com/react/overview/quick-start#portals)
    */
    #root,
    #__next {
      isolation: isolate;
    }
  }
`;

export const cssBase = css`
  @layer base {
    *:root {
      /* https://base-ui.com/react/overview/quick-start#ios-26-safari */
      position: relative;

      overflow-x: hidden;
      overflow-y: scroll;
      font-size: ${17 / 16}rem;
      color: var(--color-fg);
      background-color: var(--color-bg);
      font-family: Roboto, Arial, sans-serif;

      /* design tokens */
      --color-white: rgb(250 250 250); /* https://web.dev/prefers-color-scheme/#avoid-pure-white */
      --color-black: hsl(0, 0%, 12%);
      --color-lightgrey: hsl(0, 0%, 71%);

      --color-fg: var(--color-black);
      --color-bg: var(--color-white);
      --color-selected: var(--color-lightgrey);

      --font-size-sm: 0.85rem;
      --font-size-base: 1rem;
      --font-size-lg: 1.125rem;
      --font-size-xl: 1.25rem;
      --font-size-xxl: 1.5rem;
      --font-size-xxxl: 1.75rem;
      --font-size-xxxxl: 2rem;
      --font-weight-bold: 800;
      --spacing-base: 8px;

      --selected-outline: 2px solid var(--color-fg);
    }

    body {
      font-family: Roboto, Arial, sans-serif;
    }
  }
`;

/**
 * This function just returns the template string. It's purpose is solely to have a function `css`
 * which will trigger CSS syntax highlighting in VS Code, extension
 * [`styled-components.vscode-styled-components`](https://marketplace.visualstudio.com/items?itemName=styled-components.vscode-styled-components).
 */
function css(strings: TemplateStringsArray, ...args: Array<string | number>): string {
  let result = strings[0] ?? "";
  for (const [i, arg] of args.entries()) {
    result += `${arg}${strings[i + 1]}`;
  }
  return result;
}
